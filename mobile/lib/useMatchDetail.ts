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
import {
  clubForm,
  earlierMeeting,
  feedForm,
  rowFor,
  tableForMatch,
  tableSlice,
  type FormResult,
  type TableSliceEntry,
} from './matchContext';
import { supabase } from './supabase';
import { useTournamentMatches } from './TournamentMatchesProvider';
import {
  type LeagueSeasonTable,
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

/** One row of the Facts tab's timeline, as `match_events` stores it. */
export type TimelineEvent = {
  side: 'home' | 'away';
  kind:
    | 'goal'
    | 'own_goal'
    | 'penalty'
    | 'yellow'
    | 'red'
    | 'second_yellow'
    | 'var_goal_cancelled'
    | 'subst';
  playerName: string | null;
  relatedName: string | null;
  minute: number;
  extraMinute: number | null;
};

/** One player in a line-up, as `match_lineups.players` stores them. */
export type LineupPlayer = {
  playerId: number | null;
  name: string | null;
  number: number | null;
  pos: string | null;
  /** "row:col", row 1 being the keeper. ⚠ NULL for every substitute. */
  grid: string | null;
  starter: boolean;
};

/** One side's line-up. */
export type MatchLineup = {
  side: 'home' | 'away';
  formation: string | null;
  coachName: string | null;
  players: LineupPlayer[];
};

/**
 * One side's team statistics. Every figure is nullable and the nulls mean two
 * different things — see migration 139: a null COUNT is "none", a null
 * `expectedGoals` is "this competition does not publish it".
 */
export type MatchTeamStats = {
  side: 'home' | 'away';
  possessionPct: number | null;
  shotsTotal: number | null;
  shotsOn: number | null;
  shotsOff: number | null;
  shotsBlocked: number | null;
  shotsInsideBox: number | null;
  shotsOutsideBox: number | null;
  fouls: number | null;
  freeKicks: number | null;
  corners: number | null;
  offsides: number | null;
  yellowCards: number | null;
  redCards: number | null;
  saves: number | null;
  passesTotal: number | null;
  passesAccurate: number | null;
  passesPct: number | null;
  expectedGoals: number | null;
  goalsPrevented: number | null;
};

/** The bits of the record that are not the scoreline. */
export type MatchFacts = {
  referee: string | null;
  halfTimeHome: number | null;
  halfTimeAway: number | null;
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
  match_id, match_number, stage, group_letter, match_date, status, status_detail, original_match_date, venue,
  home_team_id, away_team_id,
  home_score_ft, away_score_ft, home_score_pso, away_score_pso, live_minute, live_period, live_added,
  home_team_placeholder, away_team_placeholder,
  home_team:teams!matches_home_team_id_fkey(country_name, country_code, flag_url),
  away_team:teams!matches_away_team_id_fkey(country_name, country_code, flag_url),
  tournaments(external_league_id)
`;

/** PostgREST returns an embedded row as an object or a one-element array. */
function firstOf<T>(raw: unknown): T | null {
  if (!raw) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as T | null;
}

function normalizeTeam(raw: unknown): ResultsTeam | null {
  if (!raw) return null;
  const t = Array.isArray(raw) ? raw[0] : raw;
  if (!t) return null;
  const obj = t as { country_name?: string; country_code?: string | null; flag_url?: string | null };
  return {
    countryName: obj.country_name ?? '',
    countryCode: obj.country_code ?? null,
    flagUrl: obj.flag_url ?? null,
    // Always null here, and stated rather than read: this path selects from
    // `matches`/`teams`, which is World Cup only, and a country has no
    // club-style short form. A league fixture never reaches this function — it
    // short-circuits through `leagueMatch` below, already carrying its own.
    shortName: null,
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
    statusDetail: (row.status_detail as string | null) ?? null,
    originalMatchDate: (row.original_match_date as string | null) ?? null,
    venue: (row.venue as string | null) ?? null,
    homeTeamId: (row.home_team_id as string | null) ?? null,
    awayTeamId: (row.away_team_id as string | null) ?? null,
    homeScoreFt: (row.home_score_ft as number | null) ?? null,
    awayScoreFt: (row.away_score_ft as number | null) ?? null,
    homeScorePso: (row.home_score_pso as number | null) ?? null,
    awayScorePso: (row.away_score_pso as number | null) ?? null,
    liveMinute: (row.live_minute as number | null) ?? null,
    livePeriod: (row.live_period as string | null) ?? null,
    liveAdded: (row.live_added as number | null) ?? null,
    homeTeamPlaceholder: (row.home_team_placeholder as string | null) ?? null,
    awayTeamPlaceholder: (row.away_team_placeholder as string | null) ?? null,
    homeTeam: normalizeTeam(row.home_team),
    awayTeam: normalizeTeam(row.away_team),
    // Null on this path by definition: it reads the `matches` table, which
    // holds bracket-competition rows only. A league fixture never reaches this
    // function — it is served from the list already in memory. See
    // `leagueMatch` below.
    roundNumber: null,
    // ⚠ STILL NULL, AND DELIBERATELY, even though the join below now knows
    // which competition this is. `competition` is the CAPTION, and the Results
    // tab renders a section header from it — `CompetitionHeader` returns null
    // for the World Cup on purpose, because a header reading "Other" over the
    // 2026 final would be worse than no header. Filling this in would put a
    // caption on a list that decided not to have one. The detail band falls
    // back to the stage instead; see `competitionLine`.
    competition: null,
    // ⚠ READ, NOT ASSERTED. The band, the mark and every other brand lookup key
    // on this — `tournaments.external_league_id`, the api-football league id.
    //
    // It used to be hard-coded null, so a World Cup header had nothing to
    // colour itself with and rendered the same neutral as an unthemed league.
    // The obvious fix was to stamp `1` here, since `matches` is written only by
    // the `world_cup` arm of the sync — but "world_cup" is a target KIND, and
    // `loadSyncTargets` builds one target per `tournaments` row, so there can be
    // more than one of them. Stamping the literal would have quietly painted a
    // second bracket competition in the first one's colours.
    competitionId: firstOf<{ external_league_id: number | null }>(row.tournaments)
      ?.external_league_id ?? null,
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

  // ⚠ A LEAGUE FIXTURE IS NOT IN `matches`, so step 1 below finds no row and the
  // screen used to say "Unable to load match / Match not found" — for a game a
  // member had just tapped in their own results list. `fixture_id` and
  // `match_id` are both uuid, so it was a clean, well-formed query returning
  // nothing, not a type error.
  //
  // It is taken from the list ALREADY IN MEMORY rather than fetched. The
  // provider holds the whole season; re-requesting one fixture of it on every
  // tap would be a round trip to learn something the app already knows.
  const { matches: allMatches, leagueTables } = useTournamentMatches();
  const leagueMatch = useMemo(
    () => allMatches.find((m) => m.matchId === matchId && m.roundNumber !== null) ?? null,
    [allMatches, matchId],
  );

  const [match, setMatch] = useState<ResultsMatch | null>(null);
  const [predictionInfos, setPredictionInfos] = useState<MatchPredictionInfo[]>([]);
  const [matchStats, setMatchStats] = useState<MatchStatsResponse | null>(null);
  const [bracketStats, setBracketStats] = useState<BracketStatsResponse | null>(null);
  const [groupStandings, setGroupStandings] = useState<GroupStanding[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [facts, setFacts] = useState<MatchFacts | null>(null);
  const [lineups, setLineups] = useState<MatchLineup[]>([]);
  const [teamStats, setTeamStats] = useState<MatchTeamStats[]>([]);
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

    // ---- The league fixture, and everything it deliberately does not do ----
    //
    // Steps 1–8 below are World Cup machinery end to end: `predictions`,
    // `bracket_picker_*`, three `/api/matches/:id/*` routes and a group
    // standings table. None of them has a row or a route for a league fixture,
    // and calling them on one would ask five questions whose answer is already
    // known to be nothing.
    //
    // ⚠ SO THIS IS A HEADER, AND THAT IS THE STATED v1 BOUNDARY. A league pick
    // is pool-scoped — it comes from `/api/pools/:id/league` — and a match
    // opened from the global list has no pool in hand. Fanning out one contract
    // call per pool per tap is the fetch-per-goal pattern the league read review
    // exists to stop. Showing the game itself beats "Match not found"; showing
    // the picks is its own piece of work.
    if (leagueMatch) {
      setMatch(leagueMatch);
      setPredictionInfos([]);
      setMatchStats(null);
      setBracketStats(null);
      setGroupStandings([]);
      // ⚠ TWO CALLS, NOT ONE EMBED, AND THE REASON IS THE ORDER OF DEPLOYS.
      // Folding `match_lineups` and `match_team_stats` into the facts select
      // would be one round trip — and on any client running before migration
      // 139 is applied, PostgREST would reject the WHOLE select for naming an
      // unknown relation, taking the timeline and the referee down with it.
      // Separate reads mean a missing 139 costs exactly the two tabs it should.
      await Promise.all([
        loadLeagueFacts(matchId, setTimeline, setFacts),
        loadLeagueTabs(matchId, setLineups, setTeamStats),
      ]);
      setLoading(false);
      return;
    }

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
      // ⚠ The World Cup arm of `match_events` is deliberately empty for now —
      // migration 136 created the table with both arms but only the league sync
      // writes it. Cleared rather than left holding the previous match's rows.
      setTimeline([]);
      setFacts(null);
      // ⚠ The World Cup arm of 139 is empty too — as 136, league first. Cleared
      // rather than left holding the previously opened match's line-up.
      setLineups([]);
      setTeamStats([]);

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
  }, [matchId, appUserId, poolsKey, leagueMatch]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: subscribe to UPDATEs on this match only. Surgical patch.
  useEffect(() => {
    if (!matchId) return;
    // ⚠ Not for a league fixture: this channel watches `matches`, and a league
    // fixture has no row there to update. Opening it would be a subscription
    // that can never fire — and mobile is already carrying more replicated-table
    // consumers than it wants (Gate M3). Its live score arrives with the merged
    // list instead.
    if (leagueMatch) return;
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
          // ⚠ A REALTIME PAYLOAD IS THE ROW, NOT THE SELECT. It carries no
          // embedded resources at all, so everything `MATCH_SELECT` joins comes
          // back null here and has to be carried over from the previous state.
          //
          // The teams were always preserved. `competitionId` joins
          // `tournaments` and so has exactly the same problem — without it the
          // band would be correctly coloured until the first goal and neutral
          // grey from then on, which is both wrong and only reproducible
          // during a live match.
          setMatch((prev) => {
            if (!prev) return updated;
            return {
              ...updated,
              homeTeam: prev.homeTeam,
              awayTeam: prev.awayTeam,
              competitionId: prev.competitionId,
            };
          });
        },
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [matchId, leagueMatch]);

  /**
   * The league context around this fixture — table slice, both clubs' form, and
   * the reverse fixture.
   *
   * ⚠ DERIVED, NOT FETCHED, AND THAT IS THE WHOLE REASON IT IS AFFORDABLE. Every
   * input is already in memory: `allMatches` is the whole season and
   * `leagueTables` is the whole ordered table, both from the single
   * `/api/users/:id/fixtures` payload the Results tab already pays for. Asking
   * the network for any of it on a tap would be the fetch-per-goal pattern the
   * league read-path review exists to stop.
   *
   * Null for a World Cup match, which has `competitionId === null` and its own
   * group standings card.
   */
  const leagueContext = useMemo<LeagueMatchContext | null>(() => {
    if (!match || match.competitionId === null) return null;

    const table = tableForMatch(leagueTables, match);
    const slice = table ? tableSlice(table.standings, match.homeTeamId, match.awayTeamId) : null;

    const formOpts = { competitionId: match.competitionId, beforeKickoff: match.matchDate };
    return {
      table,
      slice,
      homeForm: clubForm(allMatches, { ...formOpts, clubId: match.homeTeamId }),
      awayForm: clubForm(allMatches, { ...formOpts, clubId: match.awayTeamId }),
      homeFeedForm: feedForm(rowFor(table, match.homeTeamId)),
      awayFeedForm: feedForm(rowFor(table, match.awayTeamId)),
      earlier: earlierMeeting(allMatches, match),
    };
  }, [match, allMatches, leagueTables]);

  return {
    match,
    predictionInfos,
    matchStats,
    bracketStats,
    groupStandings,
    timeline,
    facts,
    lineups,
    teamStats,
    leagueContext,
    loading,
    error,
    refresh: load,
  };
}

/** Everything the Facts tab shows around a league fixture. See `leagueContext`. */
export type LeagueMatchContext = {
  table: LeagueSeasonTable | null;
  /** Null when either club has no table row — early season, before a table exists. */
  slice: TableSliceEntry[] | null;
  homeForm: FormResult[];
  awayForm: FormResult[];
  homeFeedForm: ('W' | 'D' | 'L')[];
  awayFeedForm: ('W' | 'D' | 'L')[];
  earlier: ResultsMatch | null;
};

/**
 * The Facts tab's two reads, in ONE round trip.
 *
 * ⚠ READ DIRECTLY RATHER THAN THROUGH `/api/users/:id/fixtures`, and that is a
 * deliberate departure from the plan. Referee and the half-time pair could ride
 * the season payload, but that payload is ~197 kB, shared-cached for 30s across
 * every viewer of a season, and carries all 380 fixtures — adding three columns
 * to it for something one screen shows on one match is weight on a hot cache to
 * save a query nobody else makes.
 *
 * `league_fixtures` is a calendar table with `SELECT USING (true)` (migration
 * 050) and `match_events` has its own read policy for authenticated users, so
 * the phone can ask for both itself. The embed makes it one request.
 *
 * A failure here is a blank card, never a thrown screen: the match itself is
 * already rendered from the list in memory by the time this runs.
 */
async function loadLeagueFacts(
  fixtureId: string,
  setTimeline: (t: TimelineEvent[]) => void,
  setFacts: (f: MatchFacts | null) => void,
) {
  try {
    const { data, error: err } = await supabase
      .from('league_fixtures')
      .select(
        'referee, home_goals_ht, away_goals_ht,' +
          ' match_events(side, kind, player_name, related_name, minute, extra_minute, sort_index)',
      )
      .eq('fixture_id', fixtureId)
      .maybeSingle();
    if (err) throw err;
    if (!data) {
      setTimeline([]);
      setFacts(null);
      return;
    }

    // ⚠ Through `unknown`: the generated client cannot type an embedded select
    // written as a string, so it widens `data` to GenericStringError and a
    // direct cast is rejected. Same shape as the joins above.
    const row = data as unknown as {
      referee: string | null;
      home_goals_ht: number | null;
      away_goals_ht: number | null;
      match_events: Array<{
        side: string;
        kind: string;
        player_name: string | null;
        related_name: string | null;
        minute: number;
        extra_minute: number | null;
        sort_index: number;
      }> | null;
    };

    setFacts({
      referee: row.referee,
      halfTimeHome: row.home_goals_ht,
      halfTimeAway: row.away_goals_ht,
    });

    // ⚠ ORDERED HERE, NOT IN THE QUERY. PostgREST cannot order an embedded
    // resource by two columns through this client, and minute alone does not
    // order six things that share the 45th — `sort_index` is the feed's own
    // sequence and is the tiebreak the table stores it for.
    const events = (row.match_events ?? [])
      .slice()
      .sort((a, b) => a.minute - b.minute || a.sort_index - b.sort_index)
      .map((e) => ({
        side: e.side as TimelineEvent['side'],
        kind: e.kind as TimelineEvent['kind'],
        playerName: e.player_name,
        relatedName: e.related_name,
        minute: e.minute,
        extraMinute: e.extra_minute,
      }));
    setTimeline(events);
  } catch (e) {
    // ⚠ A MISSING TABLE IS THE EXPECTED CASE UNTIL MIGRATION 136 IS APPLIED.
    // Warn and render nothing rather than failing the screen — the header,
    // the scoreline and every other card are unaffected.
    console.warn('[useMatchDetail] league facts unavailable', e);
    setTimeline([]);
    setFacts(null);
  }
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

/**
 * The Line-ups and Statistics tabs' data — migration 139.
 *
 * ⚠ A SEPARATE READ FROM `loadLeagueFacts`, ON PURPOSE. Both could ride one
 * embedded select on `league_fixtures` and save a round trip. They must not:
 * PostgREST rejects an ENTIRE select that names a relation the database does
 * not have, so on any build running before 139 is applied a combined query
 * would blank the timeline and the referee too — the tabs taking the Facts tab
 * down with them. Isolated, a missing 139 costs exactly the two tabs it should.
 *
 * ⚠ A MISSING TABLE IS THE EXPECTED CASE UNTIL MIGRATION 139 IS APPLIED, the
 * same as `loadLeagueFacts` was for 136. Warn and render nothing; every other
 * card on the screen is unaffected, and `MatchTabBar` simply does not offer a
 * tab it has no rows for.
 */
async function loadLeagueTabs(
  fixtureId: string,
  setLineups: (l: MatchLineup[]) => void,
  setTeamStats: (s: MatchTeamStats[]) => void,
) {
  try {
    const [lineupRes, statsRes] = await Promise.all([
      supabase
        .from('match_lineups')
        .select('side, formation, coach_name, players')
        .eq('fixture_id', fixtureId),
      supabase
        .from('match_team_stats')
        .select(
          'side, possession_pct, shots_total, shots_on, shots_off, shots_blocked,' +
            ' shots_inside_box, shots_outside_box, fouls, free_kicks, corners, offsides,' +
            ' yellow_cards, red_cards, saves, passes_total, passes_accurate, passes_pct,' +
            ' expected_goals, goals_prevented',
        )
        .eq('fixture_id', fixtureId),
    ]);
    // ⚠ BOTH ERRORS ARE READ. `const { data } = await …` would hide a 400 and
    // render an empty tab forever — the discarded-PostgREST-error pattern this
    // codebase has been bitten by more than once.
    if (lineupRes.error) throw lineupRes.error;
    if (statsRes.error) throw statsRes.error;

    type LineupRow = {
      side: string;
      formation: string | null;
      coach_name: string | null;
      players: unknown;
    };
    setLineups(
      ((lineupRes.data ?? []) as unknown as LineupRow[]).map((r) => ({
        side: r.side as 'home' | 'away',
        formation: r.formation,
        coachName: r.coach_name,
        // `players` is jsonb — an array by CHECK constraint, but the client
        // types it as unknown and a defensive guard costs one line.
        players: (Array.isArray(r.players) ? r.players : []).map((p) => {
          const o = (p ?? {}) as Record<string, unknown>;
          return {
            playerId: (o.player_id as number | null) ?? null,
            name: (o.name as string | null) ?? null,
            number: (o.number as number | null) ?? null,
            pos: (o.pos as string | null) ?? null,
            grid: (o.grid as string | null) ?? null,
            starter: o.starter === true,
          };
        }),
      })),
    );

    const num = (v: unknown): number | null => {
      // ⚠ `numeric` COMES BACK AS A STRING from PostgREST — `expected_goals`
      // would otherwise render "1.81" where a number is expected and compare
      // wrongly against the other side. Null stays null; see 139 on why that
      // is not zero.
      if (v === null || v === undefined) return null;
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    setTeamStats(
      ((statsRes.data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        side: r.side as 'home' | 'away',
        possessionPct: num(r.possession_pct),
        shotsTotal: num(r.shots_total),
        shotsOn: num(r.shots_on),
        shotsOff: num(r.shots_off),
        shotsBlocked: num(r.shots_blocked),
        shotsInsideBox: num(r.shots_inside_box),
        shotsOutsideBox: num(r.shots_outside_box),
        fouls: num(r.fouls),
        freeKicks: num(r.free_kicks),
        corners: num(r.corners),
        offsides: num(r.offsides),
        yellowCards: num(r.yellow_cards),
        redCards: num(r.red_cards),
        saves: num(r.saves),
        passesTotal: num(r.passes_total),
        passesAccurate: num(r.passes_accurate),
        passesPct: num(r.passes_pct),
        expectedGoals: num(r.expected_goals),
        goalsPrevented: num(r.goals_prevented),
      })),
    );
  } catch (e) {
    console.warn('[useMatchDetail] league line-ups/statistics unavailable', e);
    setLineups([]);
    setTeamStats([]);
  }
}
