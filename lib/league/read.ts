// =============================================================
// LEAGUE READ ADAPTERS — league_* rows shaped for the existing UI
// =============================================================
// Ryan's architecture decision (2026-08-15): *"the front end designs will stay
// as much as it is today as possible except it will point to the new data."*
// This is the pointing. Nothing here is a new screen — it turns league rows
// into the four shapes `ProgressivePredictionsFlow` already consumes:
//
//     league_clubs       -> Team[]
//     league_fixtures    -> Match[]
//     league_matchweeks  -> PoolRoundState[]
//     league_predictions -> Prediction[]
//
// The flow itself needs no change. It already resolves rounds through
// `lib/competitionRounds` and already has a matchweek branch that builds
// fixtures directly from teams without bracket resolution.
//
// ⚠ THE LOAD-BEARING CONSTRAINT of the vertical slice (see
// drafts/2026-08-22_league_vertical_slice.md §2): nothing on the league path may
// write `pool_entries.has_submitted_predictions` or `.point_adjustment`. Those
// two columns are the only doors left by which a league entry can enter the
// World Cup scoring selectors — everything else is contained structurally
// because league picks live in `league_predictions`, not `predictions`.
// Submission state is read from `league_predictions` instead, below.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Match, Team, Prediction } from '@/lib/tournament'
import type { PoolRoundState, EntryRoundSubmission } from '@/app/pools/[pool_id]/types'
import { matchweekKey } from '@/lib/competitionRounds'

/** Everything the prediction flow needs for one league pool. */
export type LeaguePoolView = {
  teams: Team[]
  matches: Match[]
  roundStates: PoolRoundState[]
  matchweekCount: number
}

type ClubRow = {
  club_id: string
  name: string
  short_name: string
  abbreviation: string
  crest_url: string | null
}

type FixtureRow = {
  fixture_id: string
  matchweek_id: string
  fixture_number: number
  home_club_id: string
  away_club_id: string
  kickoff_at: string
  venue: string | null
  status: string
  home_goals: number | null
  away_goals: number | null
  is_completed: boolean
}

type MatchweekRow = {
  matchweek_id: string
  matchweek_number: number
  fixture_count: number
  completed_fixture_count: number
  lock_at: string | null
  first_kickoff_at: string | null
}

/**
 * A club rendered as a `Team`.
 *
 * `country_name` carries the club's name and `country_code` its abbreviation —
 * the World Cup names for those fields are wrong for a club, but the UI reads
 * them positionally and renaming the shared type is a 27-module change the
 * slice deliberately defers. `flag_url` carries the crest, which is what the
 * component actually renders.
 *
 * `group_letter` is empty and `fifa_ranking_points` is 0: a league club has
 * neither, and the matchweek branch of the flow already omits the "Group X"
 * caption when the letter is blank rather than printing "Group null".
 */
function clubToTeam(c: ClubRow): Team {
  return {
    team_id: c.club_id,
    country_name: c.name,
    country_code: c.abbreviation,
    group_letter: '',
    fifa_ranking_points: 0,
    flag_url: c.crest_url,
  }
}

/**
 * A fixture rendered as a `Match`.
 *
 * `stage` is `'regular_season'` and the matchweek lives in `round_number`.
 * That is the contract `lib/competitionRounds.matchInRound` was built to:
 * `stage === 'regular_season' && round_number === selector.roundNumber`.
 * Putting the matchweek key in `stage` instead — which this adapter first did —
 * makes `matchesInRound` return zero for every round, silently, because the
 * predicate simply never matches.
 *
 * `matches_stage_check` no longer admits `'regular_season'`, and that is fine:
 * this value never reaches the database. It exists only in the object handed to
 * the prediction flow, which reads it through `matchInRound`. Nothing on the
 * league path writes a `matches` row.
 *
 * No placeholders, no PSO, no winner: a league fixture has real clubs from the
 * day the season is published, and a regular-season match cannot go to
 * penalties.
 */
function fixtureToMatch(f: FixtureRow, matchweekNumber: number): Match {
  return {
    match_id: f.fixture_id,
    match_number: f.fixture_number,
    stage: 'regular_season',
    group_letter: null,
    round_number: matchweekNumber,
    match_date: f.kickoff_at,
    venue: f.venue,
    status: f.status,
    home_team_id: f.home_club_id,
    away_team_id: f.away_club_id,
    home_team_placeholder: null,
    away_team_placeholder: null,
  } as Match
}

/**
 * A matchweek rendered as a `PoolRoundState`.
 *
 * DERIVED, never stored. A league pool holds zero `pool_round_states` rows by
 * design — the World-Cup-shaped table cannot express 38 matchweeks whose locks
 * are per-week facts of the fixture list. State comes from the matchweek's own
 * columns, which the L1 window trigger maintains:
 *
 *   fixture_count = 0                 -> 'completed'   (a terminal state, never
 *                                        'open': an empty matchweek has nothing
 *                                        to predict and must not invite picks)
 *   completed_fixture_count = count   -> 'completed'
 *   lock_at <= now                    -> 'locked'
 *   otherwise                         -> 'open'
 *
 * Every matchweek whose lock is still in the future is OPEN. A league is not a
 * cascade: week 30 is predictable in August, which is the whole difference from
 * a bracket.
 */
function matchweekToRoundState(mw: MatchweekRow, poolId: string, now: number): PoolRoundState {
  const locked = mw.lock_at !== null && Date.parse(mw.lock_at) <= now
  const empty = mw.fixture_count === 0
  const allDone = mw.fixture_count > 0 && mw.completed_fixture_count >= mw.fixture_count

  const state = empty || allDone ? 'completed' : locked ? 'locked' : 'open'

  return {
    // Synthetic id: these rows are DERIVED and have no database identity. The
    // matchweek id is stable and unique, which is all any consumer keys on.
    id: mw.matchweek_id,
    pool_id: poolId,
    round_key: matchweekKey(mw.matchweek_number) as PoolRoundState['round_key'],
    state: state as PoolRoundState['state'],
    deadline: mw.lock_at,
    opened_at: mw.first_kickoff_at,
    closed_at: locked ? mw.lock_at : null,
    completed_at: allDone || empty ? mw.lock_at : null,
    opened_by: null,
    created_at: mw.first_kickoff_at ?? new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
  } as PoolRoundState
}

/**
 * Read everything the prediction flow needs for one league pool.
 *
 * Paged where the row count is unbounded by design. A season is 380 fixtures
 * today, comfortably under the 1,000-row PostgREST cap — but the cap is silent,
 * and a 24-club division is 552.
 */
export async function readLeaguePoolView(
  supabase: SupabaseClient,
  args: { poolId: string; seasonId: string; now?: number },
): Promise<{ view: LeaguePoolView | null; error: string | null }> {
  const now = args.now ?? Date.now()

  const { data: clubs, error: clubErr } = await supabase
    .from('league_clubs')
    .select('club_id, name, short_name, abbreviation, crest_url')
    .eq('season_id', args.seasonId)
    .order('name', { ascending: true })
    .range(0, 999)
  if (clubErr) return { view: null, error: `league_clubs: ${clubErr.message}` }

  const { data: mws, error: mwErr } = await supabase
    .from('league_matchweeks')
    .select('matchweek_id, matchweek_number, fixture_count, completed_fixture_count, lock_at, first_kickoff_at')
    .eq('season_id', args.seasonId)
    .order('matchweek_number', { ascending: true })
    .range(0, 999)
  if (mwErr) return { view: null, error: `league_matchweeks: ${mwErr.message}` }

  const fixtures: FixtureRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('league_fixtures')
      .select('fixture_id, matchweek_id, fixture_number, home_club_id, away_club_id, kickoff_at, venue, status, home_goals, away_goals, is_completed')
      .eq('season_id', args.seasonId)
      .order('fixture_number', { ascending: true })
      .range(from, from + 999)
    if (error) return { view: null, error: `league_fixtures: ${error.message}` }
    const page = (data ?? []) as unknown as FixtureRow[]
    fixtures.push(...page)
    if (page.length < 1000) break
  }

  const matchweekRows = (mws ?? []) as unknown as MatchweekRow[]
  const numberByMatchweekId = new Map(matchweekRows.map((m) => [m.matchweek_id, m.matchweek_number]))

  // A fixture whose matchweek we did not read cannot be placed in a round, and
  // silently dropping it would show a short matchweek with no explanation.
  const orphans = fixtures.filter((f) => !numberByMatchweekId.has(f.matchweek_id))
  if (orphans.length > 0) {
    return { view: null, error: `${orphans.length} fixture(s) reference a matchweek not in this season` }
  }

  return {
    view: {
      teams: ((clubs ?? []) as unknown as ClubRow[]).map(clubToTeam),
      matches: fixtures.map((f) => fixtureToMatch(f, numberByMatchweekId.get(f.matchweek_id)!)),
      roundStates: matchweekRows.map((m) => matchweekToRoundState(m, args.poolId, now)),
      matchweekCount: matchweekRows.length,
    },
    error: null,
  }
}

/**
 * One entry's saved picks, shaped as `Prediction[]`.
 *
 * No PSO and no winner: a regular-season fixture has neither, and the flow's
 * matchweek branch does not ask for them.
 */
export async function readLeaguePredictions(
  supabase: SupabaseClient,
  entryId: string,
): Promise<{ predictions: Prediction[]; error: string | null }> {
  const out: Prediction[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('league_predictions')
      .select('prediction_id, fixture_id, predicted_home_score, predicted_away_score')
      .eq('entry_id', entryId)
      .range(from, from + 999)
    if (error) return { predictions: [], error: `league_predictions: ${error.message}` }
    const page = (data ?? []) as unknown as Array<{
      prediction_id: string
      fixture_id: string
      predicted_home_score: number
      predicted_away_score: number
    }>
    for (const p of page) {
      out.push({
        prediction_id: p.prediction_id,
        match_id: p.fixture_id,
        predicted_home_score: p.predicted_home_score,
        predicted_away_score: p.predicted_away_score,
        predicted_home_pso: null,
        predicted_away_pso: null,
        predicted_winner_team_id: null,
      })
    }
    if (page.length < 1000) break
  }
  return { predictions: out, error: null }
}

/**
 * Per-matchweek submission state, derived from `league_predictions`.
 *
 * NOT from `entry_round_submissions`, and NOT from
 * `pool_entries.has_submitted_predictions` — see the constraint at the top of
 * this file. A matchweek counts as submitted when the entry has a pick for
 * every fixture in it, which is a fact about the picks rather than a flag that
 * can drift from them.
 */
export function deriveRoundSubmissions(
  entryId: string,
  matches: Match[],
  predictions: Prediction[],
): EntryRoundSubmission[] {
  const predicted = new Set(predictions.map((p) => p.match_id))
  const byRound = new Map<string, { total: number; done: number }>()
  for (const m of matches) {
    // Group by the MATCHWEEK, not by `stage`. Every league fixture carries
    // stage='regular_season' — that is the round selector's contract — so
    // grouping on it collapses all 380 fixtures into a single bucket and no
    // matchweek is ever complete. A fixture with no matchweek is skipped rather
    // than filed under a wrong one.
    if (typeof m.round_number !== 'number') continue
    const key = matchweekKey(m.round_number)
    const cur = byRound.get(key) ?? { total: 0, done: 0 }
    cur.total++
    if (predicted.has(m.match_id)) cur.done++
    byRound.set(key, cur)
  }
  const out: EntryRoundSubmission[] = []
  for (const [roundKey, c] of byRound) {
    if (c.total > 0 && c.done >= c.total) {
      out.push({
        id: `${entryId}:${roundKey}`,
        entry_id: entryId,
        round_key: roundKey as EntryRoundSubmission['round_key'],
        has_submitted: true,
        submitted_at: null,
        auto_submitted: false,
        prediction_count: c.done,
        created_at: '',
        updated_at: '',
      } as EntryRoundSubmission)
    }
  }
  return out
}
