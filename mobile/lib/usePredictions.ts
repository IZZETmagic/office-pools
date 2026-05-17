import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from './auth';
import { resolveFullBracket, type BracketResult } from './bracket/bracketResolver';
import type { Match, PredictionMap, ScoreEntry, Team, MatchConductData } from './bracket/tournament';
import { supabase } from './supabase';

export type EntryInfo = {
  entryId: string;
  entryName: string;
  entryNumber: number;
  hasSubmittedPredictions: boolean;
  totalPoints: number;
};

export type PredictionsData = {
  pool: {
    poolId: string;
    poolName: string;
    tournamentId: string;
    predictionDeadline: string | null;
    maxEntriesPerUser: number;
    predictionMode: string | null;
  };
  matches: Match[];
  teams: Team[];
  conductData: MatchConductData[];
  entry: EntryInfo;
  predictions: PredictionMap;
  bracket: BracketResult;
};

type DbPredictionRow = {
  match_id: string;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  predicted_home_pso: number | null;
  predicted_away_pso: number | null;
  predicted_winner_team_id: string | null;
};

export function usePredictions(poolId: string | undefined, entryId: string | undefined) {
  const { user } = useAuth();
  const [data, setData] = useState<PredictionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [localPredictions, setLocalPredictions] = useState<PredictionMap>(new Map());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Map<string, ScoreEntry>>(new Map());

  const load = useCallback(async () => {
    if (!poolId || !entryId || !user) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: poolRow, error: poolErr }, { data: entryRow, error: entryErr }] =
        await Promise.all([
          supabase
            .from('pools')
            .select('pool_id, pool_name, tournament_id, prediction_deadline, max_entries_per_user, prediction_mode')
            .eq('pool_id', poolId)
            .single(),
          supabase
            .from('pool_entries')
            .select(
              'entry_id, entry_name, entry_number, has_submitted_predictions, total_points',
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
        { data: predRows, error: pErr },
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
          .select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url')
          .eq('tournament_id', tournamentId),
        supabase
          .from('match_conduct')
          .select('match_id, team_id, yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards'),
        supabase
          .from('predictions')
          .select(
            'match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id',
          )
          .eq('entry_id', entryId),
      ]);
      if (mErr) throw mErr;
      if (tErr) throw tErr;
      if (pErr) throw pErr;

      const normalizedMatches = (matchRows ?? []).map((m: unknown) => {
        const row = m as Record<string, unknown>;
        const home = row.home_team;
        const away = row.away_team;
        return {
          ...row,
          home_team: Array.isArray(home) ? home[0] ?? null : home,
          away_team: Array.isArray(away) ? away[0] ?? null : away,
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

      const conduct = (conductRows ?? []) as MatchConductData[];
      const initialPreds: PredictionMap = new Map();
      for (const p of (predRows ?? []) as DbPredictionRow[]) {
        initialPreds.set(p.match_id, {
          home: p.predicted_home_score,
          away: p.predicted_away_score,
          homePso: p.predicted_home_pso,
          awayPso: p.predicted_away_pso,
          winnerTeamId: p.predicted_winner_team_id,
        });
      }

      const bracket = resolveFullBracket({
        matches: normalizedMatches,
        predictionMap: initialPreds,
        teams: normalizedTeams,
        conductData: conduct,
      });

      const pool = poolRow as {
        pool_id: string;
        pool_name: string;
        tournament_id: string;
        prediction_deadline: string | null;
        max_entries_per_user: number;
        prediction_mode: string | null;
      };
      const entry = entryRow as {
        entry_id: string;
        entry_name: string;
        entry_number: number;
        has_submitted_predictions: boolean;
        total_points: number | null;
      };

      setData({
        pool: {
          poolId: pool.pool_id,
          poolName: pool.pool_name,
          tournamentId: pool.tournament_id,
          predictionDeadline: pool.prediction_deadline,
          maxEntriesPerUser: pool.max_entries_per_user,
          predictionMode: pool.prediction_mode,
        },
        matches: normalizedMatches,
        teams: normalizedTeams,
        conductData: conduct,
        entry: {
          entryId: entry.entry_id,
          entryName: entry.entry_name,
          entryNumber: entry.entry_number,
          hasSubmittedPredictions: entry.has_submitted_predictions,
          totalPoints: entry.total_points ?? 0,
        },
        predictions: initialPreds,
        bracket,
      });
      setLocalPredictions(new Map(initialPreds));
      setSubmitted(entry.has_submitted_predictions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load predictions');
      console.warn('[usePredictions]', err);
    } finally {
      setLoading(false);
    }
  }, [poolId, entryId, user]);

  useEffect(() => {
    void load();
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (entryId && pendingRef.current.size > 0) {
        void flushPending(entryId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const bracket = useMemo(() => {
    if (!data) return null;
    return resolveFullBracket({
      matches: data.matches,
      predictionMap: localPredictions,
      teams: data.teams,
      conductData: data.conductData,
    });
  }, [data, localPredictions]);

  const updatePrediction = useCallback(
    (matchId: string, patch: Partial<ScoreEntry>) => {
      if (!entryId || submitted) return;
      setLocalPredictions((prev) => {
        const next = new Map(prev);
        const current = next.get(matchId) ?? { home: null, away: null };
        const merged: ScoreEntry = { ...current, ...patch };
        next.set(matchId, merged);
        pendingRef.current.set(matchId, merged);
        return next;
      });
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void flushPending(entryId);
      }, 600);
    },
    [entryId, submitted],
  );

  async function flushPending(eId: string) {
    const entries = Array.from(pendingRef.current.entries());
    pendingRef.current.clear();
    if (entries.length === 0) return;
    setSaving(true);
    try {
      const rows = entries.map(([matchId, entry]) => ({
        entry_id: eId,
        match_id: matchId,
        predicted_home_score: entry.home,
        predicted_away_score: entry.away,
        predicted_home_pso: entry.homePso ?? null,
        predicted_away_pso: entry.awayPso ?? null,
        predicted_winner_team_id: entry.winnerTeamId ?? null,
      }));
      const { error: upsertErr } = await supabase
        .from('predictions')
        .upsert(rows, { onConflict: 'entry_id,match_id' });
      if (upsertErr) {
        console.warn('[usePredictions.flushPending] upsert error', upsertErr);
        for (const [matchId, entry] of entries) {
          if (!pendingRef.current.has(matchId)) pendingRef.current.set(matchId, entry);
        }
      }
    } catch (err) {
      console.warn('[usePredictions.flushPending]', err);
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!entryId) return { error: 'No entry id' };
    setSaving(true);
    try {
      const { error: submitErr } = await supabase
        .from('pool_entries')
        .update({
          has_submitted_predictions: true,
          predictions_submitted_at: new Date().toISOString(),
        })
        .eq('entry_id', entryId);
      if (submitErr) throw submitErr;
      setSubmitted(true);
      return {};
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Submit failed' };
    } finally {
      setSaving(false);
    }
  }

  return {
    data,
    loading,
    error,
    saving,
    submitted,
    predictions: localPredictions,
    bracket,
    updatePrediction,
    submit,
    refresh: load,
  };
}
