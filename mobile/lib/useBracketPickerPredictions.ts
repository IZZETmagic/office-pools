import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchBracketPicks,
  saveBracketPicks,
  submitBracketPicks,
  type BPGroupRanking,
  type BPKnockoutPick,
  type BPThirdPlaceRanking,
} from './api';
import type { Match, Team, MatchConductData } from './bracket/tournament';
import { supabase } from './supabase';

export type BracketPickerData = {
  pool: {
    poolId: string;
    poolName: string;
    tournamentId: string;
    predictionDeadline: string | null;
    maxEntriesPerUser: number;
  };
  matches: Match[];
  teams: Team[];
  conductData: MatchConductData[];
  entry: {
    entryId: string;
    entryName: string;
    entryNumber: number;
    hasSubmittedPredictions: boolean;
    totalPoints: number;
  };
  groupRankings: BPGroupRanking[];
  thirdPlaceRankings: BPThirdPlaceRanking[];
  knockoutPicks: BPKnockoutPick[];
};

const SAVE_DEBOUNCE_MS = 600;

export function useBracketPickerPredictions(
  poolId: string | undefined,
  entryId: string | undefined,
) {
  const [data, setData] = useState<BracketPickerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Local mutable state for the three pick arrays
  const [groupRankings, setGroupRankings] = useState<BPGroupRanking[]>([]);
  const [thirdPlaceRankings, setThirdPlaceRankings] = useState<
    BPThirdPlaceRanking[]
  >([]);
  const [knockoutPicks, setKnockoutPicks] = useState<BPKnockoutPick[]>([]);

  // Save plumbing
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  const load = useCallback(async () => {
    if (!poolId || !entryId) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: poolRow, error: poolErr }, { data: entryRow, error: entryErr }] =
        await Promise.all([
          supabase
            .from('pools')
            .select(
              'pool_id, pool_name, tournament_id, prediction_deadline, max_entries_per_user',
            )
            .eq('pool_id', poolId)
            .single(),
          supabase
            .from('pool_entries')
            .select(
              'entry_id, entry_name, entry_number, has_submitted_predictions, scored_total_points',
            )
            .eq('entry_id', entryId)
            .single(),
        ]);
      if (poolErr) throw poolErr;
      if (entryErr) throw entryErr;
      if (!poolRow || !entryRow) throw new Error('Pool or entry not found.');

      const tournamentId = (poolRow as { tournament_id: string }).tournament_id;

      const [
        { data: matchRows, error: mErr },
        { data: teamRows, error: tErr },
        { data: conductRows },
        picks,
      ] = await Promise.all([
        supabase
          .from('matches')
          .select(
            '*, home_team:teams!matches_home_team_id_fkey(country_name, country_code, flag_url, group_letter, fifa_ranking_points), away_team:teams!matches_away_team_id_fkey(country_name, country_code, flag_url, group_letter, fifa_ranking_points)',
          )
          .eq('tournament_id', tournamentId)
          .order('match_number', { ascending: true }),
        supabase
          .from('teams')
          .select(
            'team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url',
          )
          .eq('tournament_id', tournamentId),
        supabase
          .from('match_conduct')
          .select(
            'match_id, team_id, yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards',
          ),
        fetchBracketPicks(poolId, entryId),
      ]);
      if (mErr) throw mErr;
      if (tErr) throw tErr;

      const normalizedMatches = (matchRows ?? []).map((m: unknown) => {
        const row = m as Record<string, unknown>;
        const home = row.home_team;
        const away = row.away_team;
        return {
          ...row,
          home_team: Array.isArray(home) ? (home[0] ?? null) : home,
          away_team: Array.isArray(away) ? (away[0] ?? null) : away,
        };
      }) as Match[];

      const normalizedTeams = (teamRows ?? []).map((t: unknown) => {
        const row = t as Record<string, string | number | null | undefined>;
        return {
          ...row,
          group_letter: (row.group_letter as string | undefined)?.trim() || '',
          country_code: (row.country_code as string | undefined)?.trim() || '',
        };
      }) as unknown as Team[];

      const pool = poolRow as {
        pool_id: string;
        pool_name: string;
        tournament_id: string;
        prediction_deadline: string | null;
        max_entries_per_user: number;
      };
      const entry = entryRow as {
        entry_id: string;
        entry_name: string;
        entry_number: number;
        has_submitted_predictions: boolean;
        scored_total_points: number | null;
      };

      setData({
        pool: {
          poolId: pool.pool_id,
          poolName: pool.pool_name,
          tournamentId: pool.tournament_id,
          predictionDeadline: pool.prediction_deadline,
          maxEntriesPerUser: pool.max_entries_per_user,
        },
        matches: normalizedMatches,
        teams: normalizedTeams,
        conductData: (conductRows ?? []) as MatchConductData[],
        entry: {
          entryId: entry.entry_id,
          entryName: entry.entry_name,
          entryNumber: entry.entry_number,
          hasSubmittedPredictions: entry.has_submitted_predictions,
          totalPoints: entry.scored_total_points ?? 0,
        },
        groupRankings: picks.groupRankings,
        thirdPlaceRankings: picks.thirdPlaceRankings,
        knockoutPicks: picks.knockoutPicks,
      });
      setGroupRankings(picks.groupRankings);
      setThirdPlaceRankings(picks.thirdPlaceRankings);
      setKnockoutPicks(picks.knockoutPicks);
      setSubmitted(entry.has_submitted_predictions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bracket picks');
      console.warn('[useBracketPickerPredictions]', err);
    } finally {
      setLoading(false);
    }
  }, [poolId, entryId]);

  useEffect(() => {
    void load();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [load]);

  // Auto-save: any change to picks queues a debounced save
  useEffect(() => {
    if (!poolId || !entryId || !data || submitted) return;
    if (!dirtyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await saveBracketPicks(poolId, {
          entry_id: entryId,
          group_rankings: groupRankings,
          third_place_rankings: thirdPlaceRankings,
          knockout_picks: knockoutPicks,
        });
        dirtyRef.current = false;
      } catch (err) {
        console.warn('[useBracketPickerPredictions.save]', err);
      } finally {
        setSaving(false);
      }
    }, SAVE_DEBOUNCE_MS);
  }, [poolId, entryId, data, submitted, groupRankings, thirdPlaceRankings, knockoutPicks]);

  // Mutators — each marks dirty so the auto-save effect fires.
  const setGroupForLetter = useCallback(
    (groupLetter: string, ordered: BPGroupRanking[]) => {
      if (submitted) return;
      setGroupRankings((prev) => {
        const filtered = prev.filter((r) => r.group_letter !== groupLetter);
        return [...filtered, ...ordered];
      });
      dirtyRef.current = true;
    },
    [submitted],
  );

  const setAllThirdPlaceRankings = useCallback(
    (ranks: BPThirdPlaceRanking[]) => {
      if (submitted) return;
      setThirdPlaceRankings(ranks);
      dirtyRef.current = true;
    },
    [submitted],
  );

  const setKnockoutPick = useCallback(
    (pick: BPKnockoutPick) => {
      if (submitted) return;
      setKnockoutPicks((prev) => {
        const filtered = prev.filter((p) => p.match_id !== pick.match_id);
        return [...filtered, pick];
      });
      dirtyRef.current = true;
    },
    [submitted],
  );

  const submit = useCallback(async () => {
    if (!poolId || !entryId) return { error: 'Missing pool or entry id' };
    setSaving(true);
    try {
      await submitBracketPicks(poolId, entryId);
      setSubmitted(true);
      return {};
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Submit failed' };
    } finally {
      setSaving(false);
    }
  }, [poolId, entryId]);

  return {
    data,
    loading,
    error,
    saving,
    submitted,
    groupRankings,
    thirdPlaceRankings,
    knockoutPicks,
    setGroupForLetter,
    setAllThirdPlaceRankings,
    setKnockoutPick,
    submit,
    refresh: load,
  };
}
