import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchBracketStats,
  fetchMatchScores,
  fetchMatchStats,
  type BracketStatsResponse,
  type MatchScoreEntry,
  type MatchStatsResponse,
} from './api';
import { useHomeData } from './HomeDataProvider';
import { supabase } from './supabase';
import {
  type ResultsMatch,
  type ResultsTeam,
} from './useTournamentMatches';

// MARK: - Types (mirror iOS MatchDetailViewModel + MatchPredictionInfo)

export type Prediction = {
  predictedHomeScore: number;
  predictedAwayScore: number;
  predictedHomePso: number | null;
  predictedAwayPso: number | null;
};

export type BracketPickInfo = {
  homeTeamPosition: number | null;
  awayTeamPosition: number | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  predictedWinnerName: string | null;
  predictedPenalty: boolean;
  isCorrectWinner: boolean | null;
};

export type MatchPredictionInfo = {
  entryId: string;
  poolId: string;
  poolName: string;
  entryName: string;
  prediction: Prediction | null;
  matchPoints: number | null;
  predictedHomeTeam: string | null;
  predictedAwayTeam: string | null;
  teamsMatch: boolean | null;
  breakdownResultType: string | null;
  breakdownPoints: number | null;
  isBracketPicker: boolean;
  bracketPick: BracketPickInfo | null;
};

export type GroupStanding = {
  teamId: string;
  teamName: string;
  flagUrl: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

const MATCH_SELECT = `
  match_id, match_number, stage, group_letter, match_date, status, venue,
  home_team_id, away_team_id,
  home_score_ft, away_score_ft, home_score_pso, away_score_pso,
  home_team_placeholder, away_team_placeholder,
  home_team:teams!matches_home_team_id_fkey(country_name, country_code, flag_url),
  away_team:teams!matches_away_team_id_fkey(country_name, country_code, flag_url)
`;

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
 * Loads everything the Match Detail screen needs:
 *   1. The match itself (for live realtime updates)
 *   2. User's predictions across all their pools (score-prediction + bracket-picker)
 *   3. Per-entry match-score breakdown (points, result type, team-match status) via API
 *   4. Aggregate match prediction stats (How Others Predicted)
 *   5. Group standings, when the match is a group-stage match
 *
 * Mirrors iOS `MatchDetailViewModel`. Subscribes to a per-match realtime
 * channel on the matches table for live score updates without refetch.
 */
export function useMatchDetail(matchId: string | undefined) {
  const { data: homeData } = useHomeData();
  const appUserId = homeData?.appUserId ?? null;
  const pools = homeData?.pools ?? [];

  const [match, setMatch] = useState<ResultsMatch | null>(null);
  const [predictionInfos, setPredictionInfos] = useState<MatchPredictionInfo[]>([]);
  const [matchStats, setMatchStats] = useState<MatchStatsResponse | null>(null);
  const [bracketStats, setBracketStats] = useState<BracketStatsResponse | null>(null);
  const [groupStandings, setGroupStandings] = useState<GroupStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const matchRef = useRef<ResultsMatch | null>(null);
  matchRef.current = match;

  // Pull a stable JSON key for the user's pool memberships so the effect
  // refires when pools actually change (not on every HomeData mutation).
  const poolsKey = useMemo(
    () => pools.map((p) => `${p.poolId}:${p.predictionMode}`).join('|'),
    [pools],
  );

  const load = useCallback(async () => {
    if (!matchId || !appUserId) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch the match.
      const { data: matchRow, error: matchErr } = await supabase
        .from('matches')
        .select(MATCH_SELECT)
        .eq('match_id', matchId)
        .maybeSingle();
      if (matchErr) throw matchErr;
      if (!matchRow) throw new Error('Match not found');
      const m = normalizeMatch(matchRow as Record<string, unknown>);
      setMatch(m);

      // 2. Resolve user's entries across pools, split by prediction mode.
      // Query through pool_members (the source of truth for "this user belongs
      // to this pool") with pool_entries nested. This mirrors the pattern used
      // by useMemberDetail and is more reliable than trying to filter
      // pool_entries through a pool_members!inner join — PostgREST struggles
      // with cross-FK filters where the relationship name isn't unambiguous.
      const poolIds = pools.map((p) => p.poolId);
      const bpPoolIds = new Set(
        pools.filter((p) => p.predictionMode === 'bracket_picker').map((p) => p.poolId),
      );

      type EntryRow = {
        entry_id: string;
        entry_name: string;
        pool_id: string;
        pools: { pool_name: string } | { pool_name: string }[] | null;
      };
      let entries: EntryRow[] = [];
      if (poolIds.length > 0) {
        const { data: memberRows, error: memberErr } = await supabase
          .from('pool_members')
          .select(
            'pool_id, pools(pool_name), pool_entries(entry_id, entry_name)',
          )
          .eq('user_id', appUserId)
          .in('pool_id', poolIds);
        if (memberErr) throw memberErr;
        type MemberRow = {
          pool_id: string;
          pools: { pool_name: string } | { pool_name: string }[] | null;
          pool_entries: Array<{ entry_id: string; entry_name: string }> | null;
        };
        const memberList = (memberRows ?? []) as unknown as MemberRow[];
        for (const m of memberList) {
          const poolName = Array.isArray(m.pools)
            ? m.pools[0]?.pool_name
            : m.pools?.pool_name;
          for (const e of m.pool_entries ?? []) {
            entries.push({
              entry_id: e.entry_id,
              entry_name: e.entry_name,
              pool_id: m.pool_id,
              pools: { pool_name: poolName ?? 'Pool' },
            });
          }
        }
      }

      const allEntryIds = entries.map((e) => e.entry_id);
      const bpEntryIds = entries
        .filter((e) => bpPoolIds.has(e.pool_id))
        .map((e) => e.entry_id);
      const scoreEntryIds = allEntryIds.filter((id) => !bpEntryIds.includes(id));

      // 3. Score-prediction predictions (one row per entry+match).
      const predictionByEntry = new Map<string, Prediction>();
      if (scoreEntryIds.length > 0) {
        const { data: predRows } = await supabase
          .from('predictions')
          .select(
            'entry_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso',
          )
          .eq('match_id', matchId)
          .in('entry_id', scoreEntryIds);
        for (const p of (predRows ?? []) as Array<{
          entry_id: string;
          predicted_home_score: number;
          predicted_away_score: number;
          predicted_home_pso: number | null;
          predicted_away_pso: number | null;
        }>) {
          predictionByEntry.set(p.entry_id, {
            predictedHomeScore: p.predicted_home_score,
            predictedAwayScore: p.predicted_away_score,
            predictedHomePso: p.predicted_home_pso,
            predictedAwayPso: p.predicted_away_pso,
          });
        }
      }

      // 4. Bracket-picker picks. For a group match, look up group_rankings.
      //    For a knockout match, look up the knockout_picks row.
      const bracketPickByEntry = new Map<string, BracketPickInfo>();
      if (bpEntryIds.length > 0) {
        const isGroupMatch = m.groupLetter !== null;
        if (isGroupMatch && m.homeTeamId && m.awayTeamId) {
          const { data: rankingRows } = await supabase
            .from('bracket_picker_group_rankings')
            .select('entry_id, team_id, predicted_position, group_letter')
            .in('entry_id', bpEntryIds)
            .eq('group_letter', m.groupLetter as string);
          const homeRankByEntry = new Map<string, number>();
          const awayRankByEntry = new Map<string, number>();
          for (const r of (rankingRows ?? []) as Array<{
            entry_id: string;
            team_id: string;
            predicted_position: number;
          }>) {
            if (r.team_id === m.homeTeamId) homeRankByEntry.set(r.entry_id, r.predicted_position);
            if (r.team_id === m.awayTeamId) awayRankByEntry.set(r.entry_id, r.predicted_position);
          }
          for (const eid of bpEntryIds) {
            bracketPickByEntry.set(eid, {
              homeTeamPosition: homeRankByEntry.get(eid) ?? null,
              awayTeamPosition: awayRankByEntry.get(eid) ?? null,
              homeTeamName: m.homeTeam?.countryName ?? null,
              awayTeamName: m.awayTeam?.countryName ?? null,
              predictedWinnerName: null,
              predictedPenalty: false,
              isCorrectWinner: null,
            });
          }
        } else {
          const { data: knockoutRows } = await supabase
            .from('bracket_picker_knockout_picks')
            .select('entry_id, winner_team_id, predicted_penalty, teams!bracket_picker_knockout_picks_winner_team_id_fkey(country_name)')
            .in('entry_id', bpEntryIds)
            .eq('match_id', matchId);
          // Determine actual winner from the match.
          const isFinished = m.status === 'completed';
          let actualWinnerId: string | null = null;
          if (isFinished && m.homeScoreFt !== null && m.awayScoreFt !== null) {
            if (m.homeScoreFt > m.awayScoreFt) actualWinnerId = m.homeTeamId;
            else if (m.awayScoreFt > m.homeScoreFt) actualWinnerId = m.awayTeamId;
            else if (m.homeScorePso !== null && m.awayScorePso !== null) {
              actualWinnerId = m.homeScorePso > m.awayScorePso ? m.homeTeamId : m.awayTeamId;
            }
          }
          for (const k of (knockoutRows ?? []) as Array<{
            entry_id: string;
            winner_team_id: string;
            predicted_penalty: boolean;
            teams: { country_name: string } | { country_name: string }[] | null;
          }>) {
            const team = Array.isArray(k.teams) ? k.teams[0] : k.teams;
            const winnerName = team?.country_name ?? null;
            const isCorrect = isFinished && actualWinnerId !== null
              ? k.winner_team_id === actualWinnerId
              : null;
            bracketPickByEntry.set(k.entry_id, {
              homeTeamPosition: null,
              awayTeamPosition: null,
              homeTeamName: null,
              awayTeamName: null,
              predictedWinnerName: winnerName,
              predictedPenalty: k.predicted_penalty ?? false,
              isCorrectWinner: isCorrect,
            });
          }
          // Backfill empty picks for entries that didn't make a knockout pick.
          for (const eid of bpEntryIds) {
            if (!bracketPickByEntry.has(eid)) {
              bracketPickByEntry.set(eid, {
                homeTeamPosition: null,
                awayTeamPosition: null,
                homeTeamName: null,
                awayTeamName: null,
                predictedWinnerName: null,
                predictedPenalty: false,
                isCorrectWinner: null,
              });
            }
          }
        }
      }

      // 5. Match-score breakdown per entry (server-computed points + team-match
      //    status). Mirrors iOS's `fetchMatchScores`.
      const breakdownByEntry = new Map<string, MatchScoreEntry>();
      if (allEntryIds.length > 0) {
        try {
          const scoresRes = await fetchMatchScores(matchId, allEntryIds);
          for (const s of scoresRes.entries) {
            breakdownByEntry.set(s.entry_id, s);
          }
        } catch (err) {
          // Not fatal — entries just won't show server-computed points.
          console.warn('[useMatchDetail] fetchMatchScores failed', err);
        }
      }

      // 6. Assemble prediction infos in the original pool/entry order.
      const infos: MatchPredictionInfo[] = entries.map((e) => {
        const poolNameRaw = Array.isArray(e.pools) ? e.pools[0]?.pool_name : e.pools?.pool_name;
        const isBP = bpPoolIds.has(e.pool_id);
        const breakdown = breakdownByEntry.get(e.entry_id);
        return {
          entryId: e.entry_id,
          poolId: e.pool_id,
          poolName: poolNameRaw ?? 'Pool',
          entryName: e.entry_name,
          prediction: isBP ? null : predictionByEntry.get(e.entry_id) ?? null,
          matchPoints: breakdown?.total_points ?? null,
          predictedHomeTeam: breakdown?.predicted_home_team ?? null,
          predictedAwayTeam: breakdown?.predicted_away_team ?? null,
          teamsMatch: breakdown?.teams_match ?? null,
          breakdownResultType: breakdown?.result_type ?? null,
          breakdownPoints: breakdown?.total_points ?? null,
          isBracketPicker: isBP,
          bracketPick: isBP ? bracketPickByEntry.get(e.entry_id) ?? null : null,
        };
      });
      setPredictionInfos(infos);

      // 7. Match stats (How Others Predicted) — fetch score and bracket
      //    aggregations in parallel, non-blocking on individual failure.
      const [statsRes, bracketRes] = await Promise.allSettled([
        fetchMatchStats(matchId),
        fetchBracketStats(matchId),
      ]);
      if (statsRes.status === 'fulfilled') {
        setMatchStats(statsRes.value);
      } else {
        console.warn('[useMatchDetail] fetchMatchStats failed', statsRes.reason);
        setMatchStats(null);
      }
      if (bracketRes.status === 'fulfilled') {
        setBracketStats(bracketRes.value);
      } else {
        console.warn('[useMatchDetail] fetchBracketStats failed', bracketRes.reason);
        setBracketStats(null);
      }

      // 8. Group standings for group-stage matches.
      if (m.groupLetter) {
        await loadGroupStandings(m.groupLetter, setGroupStandings);
      } else {
        setGroupStandings([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load match detail');
      console.warn('[useMatchDetail]', err);
    } finally {
      setLoading(false);
    }
    // matchId + appUserId + poolsKey are the inputs that actually matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, appUserId, poolsKey]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: subscribe to UPDATEs on this match only. Surgical patch.
  useEffect(() => {
    if (!matchId) return;
    const channel = supabase
      .channel(`match-detail-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row) return;
          const updated = normalizeMatch(row);
          // Realtime payload doesn't include joined team data — preserve.
          setMatch((prev) => {
            if (!prev) return updated;
            return {
              ...updated,
              homeTeam: prev.homeTeam,
              awayTeam: prev.awayTeam,
            };
          });
        },
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [matchId]);

  return {
    match,
    predictionInfos,
    matchStats,
    bracketStats,
    groupStandings,
    loading,
    error,
    refresh: load,
  };
}

async function loadGroupStandings(
  groupLetter: string,
  set: (standings: GroupStanding[]) => void,
) {
  try {
    const { data: rows, error: err } = await supabase
      .from('matches')
      .select(
        'home_team_id, away_team_id, status, home_score_ft, away_score_ft,' +
          ' home_team:teams!matches_home_team_id_fkey(country_name, flag_url),' +
          ' away_team:teams!matches_away_team_id_fkey(country_name, flag_url)',
      )
      .eq('stage', 'group')
      .eq('group_letter', groupLetter);
    if (err) throw err;

    type StatsRow = {
      teamId: string;
      teamName: string;
      flagUrl: string | null;
      played: number;
      won: number;
      drawn: number;
      lost: number;
      goalsFor: number;
      goalsAgainst: number;
    };
    const stats = new Map<string, StatsRow>();

    function ensure(
      teamId: string,
      team: { country_name?: string; flag_url?: string | null } | undefined,
    ) {
      if (stats.has(teamId)) return;
      stats.set(teamId, {
        teamId,
        teamName: team?.country_name ?? '',
        flagUrl: team?.flag_url ?? null,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
      });
    }

    type GroupMatchRow = {
      home_team_id: string | null;
      away_team_id: string | null;
      status: string;
      home_score_ft: number | null;
      away_score_ft: number | null;
      home_team:
        | { country_name?: string; flag_url?: string | null }
        | Array<{ country_name?: string; flag_url?: string | null }>
        | null;
      away_team:
        | { country_name?: string; flag_url?: string | null }
        | Array<{ country_name?: string; flag_url?: string | null }>
        | null;
    };
    for (const m of (rows ?? []) as unknown as GroupMatchRow[]) {
      const home = Array.isArray(m.home_team) ? m.home_team[0] : m.home_team ?? undefined;
      const away = Array.isArray(m.away_team) ? m.away_team[0] : m.away_team ?? undefined;
      if (m.home_team_id) ensure(m.home_team_id, home);
      if (m.away_team_id) ensure(m.away_team_id, away);

      const isLiveOrCompleted = m.status === 'completed' || m.status === 'live';
      if (
        !isLiveOrCompleted ||
        !m.home_team_id ||
        !m.away_team_id ||
        m.home_score_ft === null ||
        m.away_score_ft === null
      ) {
        continue;
      }
      const h = stats.get(m.home_team_id);
      const a = stats.get(m.away_team_id);
      if (!h || !a) continue;
      h.played += 1;
      a.played += 1;
      h.goalsFor += m.home_score_ft;
      h.goalsAgainst += m.away_score_ft;
      a.goalsFor += m.away_score_ft;
      a.goalsAgainst += m.home_score_ft;
      if (m.home_score_ft > m.away_score_ft) {
        h.won += 1;
        a.lost += 1;
      } else if (m.home_score_ft < m.away_score_ft) {
        a.won += 1;
        h.lost += 1;
      } else {
        h.drawn += 1;
        a.drawn += 1;
      }
    }

    const standings: GroupStanding[] = Array.from(stats.values())
      .map((s) => ({
        ...s,
        goalDifference: s.goalsFor - s.goalsAgainst,
        points: s.won * 3 + s.drawn,
      }))
      .sort((a, b) => {
        if (a.points !== b.points) return b.points - a.points;
        if (a.goalDifference !== b.goalDifference)
          return b.goalDifference - a.goalDifference;
        if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
        return a.teamName.localeCompare(b.teamName);
      });

    set(standings);
  } catch (err) {
    console.warn('[useMatchDetail] group standings failed', err);
  }
}
