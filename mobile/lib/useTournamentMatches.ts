import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useHomeData } from './HomeDataProvider';
import { supabase } from './supabase';

// Mirrors iOS `ResultsViewModel` + `Match` shape. Selects every field the
// Results list and Match Detail screens need so a single fetch powers both.
export type ResultsMatch = {
  matchId: string;
  matchNumber: number;
  stage: string;
  groupLetter: string | null;
  matchDate: string;
  status: string;
  venue: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScoreFt: number | null;
  awayScoreFt: number | null;
  homeScorePso: number | null;
  awayScorePso: number | null;
  homeTeamPlaceholder: string | null;
  awayTeamPlaceholder: string | null;
  homeTeam: ResultsTeam | null;
  awayTeam: ResultsTeam | null;
};

export type ResultsTeam = {
  countryName: string;
  countryCode: string | null;
  flagUrl: string | null;
};

const MATCH_SELECT = `
  match_id, match_number, stage, group_letter, match_date, status, venue,
  home_team_id, away_team_id,
  home_score_ft, away_score_ft, home_score_pso, away_score_pso,
  home_team_placeholder, away_team_placeholder,
  home_team:teams!matches_home_team_id_fkey(country_name, country_code, flag_url),
  away_team:teams!matches_away_team_id_fkey(country_name, country_code, flag_url)
`;

const STALE_AFTER_MS = 30_000;

function normalizeTeam(raw: unknown): ResultsTeam | null {
  if (!raw) return null;
  const t = Array.isArray(raw) ? raw[0] : raw;
  if (!t) return null;
  const obj = t as { country_name?: string; country_code?: string | null; flag_url?: string | null };
  return {
    countryName: obj.country_name ?? '',
    countryCode: obj.country_code ?? null,
    flagUrl: obj.flag_url ?? null,
  };
}

function normalizeMatch(row: Record<string, unknown>): ResultsMatch {
  return {
    matchId: (row.match_id as string) ?? '',
    matchNumber: (row.match_number as number) ?? 0,
    stage: (row.stage as string) ?? '',
    groupLetter: (row.group_letter as string | null) ?? null,
    matchDate: (row.match_date as string) ?? '',
    status: (row.status as string) ?? 'scheduled',
    venue: (row.venue as string | null) ?? null,
    homeTeamId: (row.home_team_id as string | null) ?? null,
    awayTeamId: (row.away_team_id as string | null) ?? null,
    homeScoreFt: (row.home_score_ft as number | null) ?? null,
    awayScoreFt: (row.away_score_ft as number | null) ?? null,
    homeScorePso: (row.home_score_pso as number | null) ?? null,
    awayScorePso: (row.away_score_pso as number | null) ?? null,
    homeTeamPlaceholder: (row.home_team_placeholder as string | null) ?? null,
    awayTeamPlaceholder: (row.away_team_placeholder as string | null) ?? null,
    homeTeam: normalizeTeam(row.home_team),
    awayTeam: normalizeTeam(row.away_team),
  };
}

/**
 * Fetches every match for every tournament the user has a pool in, plus a
 * realtime subscription that surgically updates rows on `matches` UPDATE
 * events (no full refetch). Mirrors iOS `ResultsViewModel`.
 *
 * Tournament IDs come from `HomeDataProvider`'s cached pools, so this hook
 * doesn't re-query memberships — it just fans out one query per tournament.
 */
export function useTournamentMatches() {
  const { data: homeData } = useHomeData();
  const tournamentIds = useMemo(() => {
    const set = new Set<string>();
    for (const pool of homeData?.pools ?? []) {
      if (pool.tournamentId) set.add(pool.tournamentId);
    }
    return Array.from(set);
  }, [homeData?.pools]);

  const [matches, setMatches] = useState<ResultsMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastLoadedAtRef = useRef(0);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (tournamentIds.length === 0) {
        setMatches([]);
        setLoading(false);
        return;
      }
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from('matches')
          .select(MATCH_SELECT)
          .in('tournament_id', tournamentIds);
        if (err) throw err;
        setMatches(((data ?? []) as Record<string, unknown>[]).map(normalizeMatch));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load matches');
        console.warn('[useTournamentMatches]', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
        lastLoadedAtRef.current = Date.now();
      }
    },
    [tournamentIds],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  // Realtime subscription — surgical UPDATE only, no full refetch.
  useEffect(() => {
    if (tournamentIds.length === 0) return;
    const channel = supabase
      .channel('results-match-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        (payload) => {
          const newRow = payload.new as Record<string, unknown> | null;
          if (!newRow?.match_id) return;
          const updated = normalizeMatch(newRow);
          setMatches((prev) => {
            const idx = prev.findIndex((m) => m.matchId === updated.matchId);
            if (idx === -1) return prev;
            // Preserve joined team info — realtime payload doesn't include
            // the foreign-key join data.
            const existing = prev[idx];
            const merged: ResultsMatch = {
              ...updated,
              homeTeam: existing.homeTeam,
              awayTeam: existing.awayTeam,
            };
            const next = prev.slice();
            next[idx] = merged;
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [tournamentIds]);

  const refresh = useCallback(() => load('refresh'), [load]);
  const refreshIfStale = useCallback(() => {
    if (Date.now() - lastLoadedAtRef.current > STALE_AFTER_MS) {
      void load('refresh');
    }
  }, [load]);

  return { matches, loading, refreshing, error, refresh, refreshIfStale };
}
