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
import type { Prediction } from '@/lib/tournament'
import type { MatchData, TeamData, ExistingPrediction } from '@/app/pools/[pool_id]/types'
import type { PoolRoundState, EntryRoundSubmission } from '@/app/pools/[pool_id]/types'
import { matchweekKey } from '@/lib/competitionRounds'

/** Everything the prediction flow needs for one league pool. */
export type LeaguePoolView = {
  teams: TeamData[]
  matches: MatchData[]
  roundStates: PoolRoundState[]
  matchweekCount: number
  /**
   * The matchweek open for picks. Null once the season is over.
   *
   * Returned as a number so callers stop parsing it back out of `mw_N` in
   * `roundStates`; the pool page did that for Showdown and LMS.
   */
  openMatchweekNumber: number | null
  /** The matchweek being played right now. Null between rounds. */
  inPlayMatchweekNumber: number | null
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

export type MatchweekRow = {
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
function clubToTeam(c: ClubRow): TeamData {
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
function fixtureToMatch(
  f: FixtureRow,
  matchweekNumber: number,
  tournamentId: string,
  clubById: Map<string, TeamData>,
): MatchData {
  const asEmbedded = (id: string) => {
    const c = clubById.get(id)
    return c ? { country_name: c.country_name, country_code: c.country_code, flag_url: c.flag_url } : null
  }
  return {
    match_id: f.fixture_id,
    tournament_id: tournamentId,
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
    // Real results, so the same rows serve the fixture list and the results
    // view. No PSO and no winner column: a regular-season fixture has neither.
    home_score_ft: f.home_goals,
    away_score_ft: f.away_goals,
    home_score_pso: null,
    away_score_pso: null,
    winner_team_id: null,
    is_completed: f.is_completed,
    completed_at: null,
    status_detail: null,
    original_match_date: null,
    live_minute: null,
    live_period: null,
    home_team: asEmbedded(f.home_club_id),
    away_team: asEmbedded(f.away_club_id),
  }
}

const isMatchweekDone = (mw: MatchweekRow) =>
  mw.fixture_count === 0 || mw.completed_fixture_count >= mw.fixture_count

const isMatchweekLocked = (mw: MatchweekRow, now: number) =>
  mw.lock_at !== null && Date.parse(mw.lock_at) <= now

/**
 * The season in the order the rhythm rules read it: by when each one locks.
 *
 * A matchweek with no fixtures has no lock; it must not outrank a real one that
 * is about to close. Number is the tiebreak, so the answer is deterministic
 * when two lock at the same instant.
 */
const byLockTime = (a: MatchweekRow, b: MatchweekRow) => {
  const la = a.lock_at === null ? Number.POSITIVE_INFINITY : Date.parse(a.lock_at)
  const lb = b.lock_at === null ? Number.POSITIVE_INFINITY : Date.parse(b.lock_at)
  return la !== lb ? la - lb : a.matchweek_number - b.matchweek_number
}

/**
 * Which single matchweek is open for picks right now.
 *
 * Decision 16: **strictly one matchweek open at a time**, and matchweek N opens
 * the moment N−1 locks. Both fall out of one rule — the open matchweek is the
 * EARLIEST one that is neither locked nor finished. Nothing schedules that and
 * nothing stores it: the instant N−1's `lock_at` passes, N becomes the earliest
 * unlocked matchweek and is open by definition. No cron, no admin button, no
 * state to drift.
 *
 * That is the point of the rule. Over 38 matchweeks and ten months, anything
 * needing a person to press a button is 38 chances for a pool to die in
 * December because its admin lost interest.
 *
 * ⚠ ORDERED BY LOCK TIME, NOT BY NUMBER — and this must stay in step with
 * `league_open_matchweek` (migration 101), which is the same rule in SQL.
 *
 * Ordering by `matchweek_number` assumes round N is played before round N+1.
 * Across three real Premier League seasons that is false: the minimum gap
 * between consecutive rounds' first kickoffs is −121 days, because a whole
 * round can be moved. 2024 round 29 had its earliest fixture on Wed 19 Feb and
 * the rest on Sat 15 Mar, so it locks before round 28. Ordering by number opens
 * a matchweek whose games are weeks away while a later-numbered one is being
 * played.
 *
 * Returns null once the season is over.
 */
export function openMatchweekId(rows: MatchweekRow[], now: number): string | null {
  const inOrder = [...rows].sort(byLockTime)
  for (const mw of inOrder) {
    if (isMatchweekDone(mw)) continue
    // A locked-but-unfinished matchweek is SKIPPED, not returned. Postponements
    // mean a matchweek can sit locked with fixtures still to play for weeks, and
    // that must not hold the whole season shut behind it.
    if (isMatchweekLocked(mw, now)) continue
    return mw.matchweek_id
  }
  return null
}

/**
 * Which matchweek is being PLAYED right now. The other half of the rhythm.
 *
 * `openMatchweekId` answers "what can I still pick", and for four days a week
 * that is also the answer to "where is the season up to". For the three days the
 * football is actually on, it is not — and those are the days a member looks.
 *
 * Ryan, 2026-08-29, on the pools list showing **Matchweek 3** while every club
 * was playing its second game: MW2 locked at its own first kickoff on the
 * Friday night, so from that moment MW3 was the earliest unlocked matchweek and
 * correctly open. The card put that number under the word "Matchweek" and told
 * four members the season was a week further along than it was.
 *
 * Walking the same lock-time order from the END gives the matchweek the season
 * has most recently reached:
 *
 *   not locked yet        -> keep walking back; it has not started
 *   locked and unfinished -> IN PLAY
 *   locked and finished   -> null; the round is over and nothing has replaced it
 *
 * Null between rounds is the point, not a gap. From Monday night to Friday
 * evening there is no football, and a caller that wants something to show then
 * should fall back to the open matchweek — which is the honest answer to "what
 * happens next".
 *
 * ⚠ THE LAST ONE TO LOCK, NOT THE HIGHEST-NUMBERED. Same reason
 * `openMatchweekId` orders by lock time: a whole round can be moved, so round N
 * is not always played before N+1.
 *
 * ⚠ Postponements cannot freeze this. A matchweek with one called-off fixture
 * stays unfinished for weeks, but the moment the next one locks it is no longer
 * the last to have locked, so it stops being in play. That is deliberately the
 * same boundary migration 094 settles a matchweek on — "the next matchweek has
 * locked" — reached from the other side. 094 phrases it by NUMBER because it is
 * asking a conservative question (has the competition moved on at all, may I
 * settle); this is asking which round the football is in, so it uses the
 * ordering the rest of this module uses.
 */
export function inPlayMatchweekId(rows: MatchweekRow[], now: number): string | null {
  const inOrder = [...rows].sort(byLockTime)
  for (let i = inOrder.length - 1; i >= 0; i--) {
    const mw = inOrder[i]
    if (!isMatchweekLocked(mw, now)) continue
    return isMatchweekDone(mw) ? null : mw.matchweek_id
  }
  return null
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
 *   the earliest of whatever is left  -> 'open'
 *   everything after it               -> 'locked'
 *
 * ⚠ CHANGED — this used to open EVERY matchweek whose lock was in the future,
 * on the reasoning that "week 30 is predictable in August, which is the whole
 * difference from a bracket". That was deliberate and it is now overruled by
 * Ryan's decision 16: one at a time. The accepted cost, recorded rather than
 * re-argued: somebody away for a fortnight cannot work ahead and scores zero for
 * two weeks. Letting people pick ahead again is a DISPLAY rule, not a data one,
 * so nothing here closes that door.
 *
 * ⚠ `'locked'` now carries two meanings — "its deadline passed" and "its turn
 * has not come". That is not new vocabulary: the World Cup already seeds every
 * unopened bracket round `'locked'` (lib/poolRoundStates.ts). But it matters for
 * one caller. `computeReveal` treats a *progressive* round as revealable once
 * its state is locked/in_progress/completed — so if `league_pickem` is ever
 * added to that branch, every future matchweek would reveal everyone's picks on
 * day one. It is safe TODAY only because league pools fall through to the
 * pool-wide deadline gate. Whoever builds the weekly reveal must gate on the
 * deadline having actually passed, not on the state string.
 */
function matchweekToRoundState(
  mw: MatchweekRow,
  poolId: string,
  now: number,
  openId: string | null,
): PoolRoundState {
  const locked = isMatchweekLocked(mw, now)
  const empty = mw.fixture_count === 0
  const allDone = mw.fixture_count > 0 && mw.completed_fixture_count >= mw.fixture_count

  const state = empty || allDone ? 'completed' : mw.matchweek_id === openId ? 'open' : 'locked'

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
  args: { poolId: string; seasonId: string; tournamentId: string; now?: number },
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

  const teams = ((clubs ?? []) as unknown as ClubRow[]).map(clubToTeam)
  const clubById = new Map(teams.map((t) => [t.team_id, t]))

  // Which matchweek is open — and which is being played — are facts about the
  // whole list, so both are resolved once here rather than re-derived for each
  // of the 38 rows below.
  const openId = openMatchweekId(matchweekRows, now)
  const inPlayId = inPlayMatchweekId(matchweekRows, now)

  return {
    view: {
      teams,
      matches: fixtures.map((f) =>
        fixtureToMatch(f, numberByMatchweekId.get(f.matchweek_id)!, args.tournamentId, clubById),
      ),
      roundStates: matchweekRows.map((m) => matchweekToRoundState(m, args.poolId, now, openId)),
      matchweekCount: matchweekRows.length,
      openMatchweekNumber: openId === null ? null : numberByMatchweekId.get(openId) ?? null,
      inPlayMatchweekNumber: inPlayId === null ? null : numberByMatchweekId.get(inPlayId) ?? null,
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
): Promise<{
  predictions: ExistingPrediction[]
  /**
   * Results-depth picks, keyed by fixture id. Returned SEPARATELY rather than
   * folded into `predictions`, and that is a deliberate boundary: a Results pick
   * has no scoreline, so carrying it as an `ExistingPrediction` would mean
   * making `predicted_home_score` nullable on a type the World Cup shares — a
   * hole in the World Cup schema to serve a league feature, which is exactly
   * what Ryan's 2026-08-15 split forbids.
   *
   * The Results screen is a different control anyway (three-way segmented, not
   * two steppers), so it never needs to travel through `Prediction`.
   */
  outcomes: Map<string, 'home' | 'draw' | 'away'>
  error: string | null
}> {
  // ExistingPrediction, not Prediction: these are real stored rows, so
  // `prediction_id` is always present. The looser type would make the page cast.
  const out: ExistingPrediction[] = []
  const outcomes = new Map<string, 'home' | 'draw' | 'away'>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('league_predictions')
      .select('prediction_id, fixture_id, predicted_home_score, predicted_away_score, predicted_outcome')
      .eq('entry_id', entryId)
      .range(from, from + 999)
    if (error) return { predictions: [], outcomes, error: `league_predictions: ${error.message}` }
    const page = (data ?? []) as unknown as Array<{
      prediction_id: string
      fixture_id: string
      // Nullable since migration 064: a Results pick carries an outcome instead.
      predicted_home_score: number | null
      predicted_away_score: number | null
      predicted_outcome: 'home' | 'draw' | 'away' | null
    }>
    for (const p of page) {
      // Exactly one shape per row — the database guarantees it (shape_ck).
      if (p.predicted_outcome !== null) {
        outcomes.set(p.fixture_id, p.predicted_outcome)
        continue
      }
      out.push({
        prediction_id: p.prediction_id,
        match_id: p.fixture_id,
        predicted_home_score: p.predicted_home_score as number,
        predicted_away_score: p.predicted_away_score as number,
        predicted_home_pso: null,
        predicted_away_pso: null,
        predicted_winner_team_id: null,
      })
    }
    if (page.length < 1000) break
  }
  return { predictions: out, outcomes, error: null }
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
  matches: MatchData[],
  predictions: Prediction[],
  /**
   * Results-depth picks, keyed by fixture id (migration 064). Optional because
   * every Scores pool and every World Cup pool has none.
   *
   * ⚠ Without this a RESULTS pool would never show a matchweek as submitted:
   * its picks are all taps, so `predictions` is legitimately empty and the
   * count below would be 0 out of 10 forever. Derived from the picks, never
   * from a flag — which means it has to see BOTH kinds of pick.
   */
  outcomes?: Map<string, unknown>,
): EntryRoundSubmission[] {
  const predicted = new Set<string>(predictions.map((p) => p.match_id))
  if (outcomes) for (const id of outcomes.keys()) predicted.add(id)
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

/**
 * The real league table, as ingested from the feed (migration 075).
 *
 * Joined to `league_clubs` for the name and crest, and ordered by the FEED'S
 * rank — never re-sorted here. That rank already applies the competition's own
 * tiebreakers, including head-to-head, and re-deriving the order in the client
 * is exactly the mistake plan §0.3 exists to prevent.
 */
export async function readLeagueStandings(
  supabase: SupabaseClient,
  seasonId: string,
): Promise<{
  rows: Array<{
    club_id: string; club_name: string; crest_url: string | null
    rank: number; points: number; played: number; won: number; drawn: number; lost: number
    goals_for: number; goals_against: number; goals_diff: number
    form: string | null; description: string | null
    movement: 'up' | 'down' | 'same' | null
  }>
  fetchedAt: string | null
  error: string | null
}> {
  const { data, error } = await supabase
    .from('league_standings')
    .select('club_id, rank, points, played, won, drawn, lost, goals_for, goals_against, goals_diff, form, description, movement, fetched_at, league_clubs!inner(name, crest_url)')
    .eq('season_id', seasonId)
    .order('rank', { ascending: true })

  if (error) return { rows: [], fetchedAt: null, error: `league_standings: ${error.message}` }

  const raw = (data ?? []) as unknown as Array<Record<string, unknown> & {
    league_clubs: { name: string; crest_url: string | null } | null
  }>

  return {
    rows: raw.map((s) => ({
      club_id: s.club_id as string,
      club_name: s.league_clubs?.name ?? 'Unknown',
      crest_url: s.league_clubs?.crest_url ?? null,
      rank: s.rank as number,
      points: s.points as number,
      played: s.played as number,
      won: s.won as number,
      drawn: s.drawn as number,
      lost: s.lost as number,
      goals_for: s.goals_for as number,
      goals_against: s.goals_against as number,
      goals_diff: s.goals_diff as number,
      form: (s.form as string | null) ?? null,
      description: (s.description as string | null) ?? null,
      movement: (s.movement as 'up' | 'down' | 'same' | null) ?? null,
    })),
    fetchedAt: (raw[0]?.fetched_at as string | undefined) ?? null,
    error: null,
  }
}

// =============================================================
// THE WEEKLY REVEAL — plan §0.9
// =============================================================
// "See everyone's picks after lock" got strong feedback on the World Cup, where
// it fires ONCE, before match one. The league version fires thirty-eight times,
// which is the whole difference: in a tournament the reveal is an event, and in
// a league it is a rhythm.
//
// The gate itself lives in `lib/predictions/revealGate.ts` and is shared with
// the World Cup. These two functions supply the league's half of its inputs —
// which matchweeks have locked, and everybody's picks — because a league pool
// keeps neither in the tables the World Cup path reads: it has no
// `pool_round_states` rows (its round states are derived, not stored) and its
// picks are in `league_predictions`, not `predictions`.
// =============================================================

/**
 * Round states shaped for the reveal gate, plus the fixture → matchweek map the
 * gate needs to filter individual picks.
 *
 * `state` is deliberately left NULL. The gate's league branch reads only the
 * deadline, and handing it the derived state string would be handing it a word
 * that means "not yet open" for future matchweeks and "closed" for past ones —
 * see the branch's own comment.
 */
export async function readLeagueRevealContext(
  supabase: SupabaseClient,
  seasonId: string,
): Promise<{
  roundStates: Array<{ round_key: string; state: null; deadline: string | null }>
  stageById: Map<string, string>
  error: string | null
}> {
  const empty = { roundStates: [], stageById: new Map<string, string>(), error: null }

  const { data: mws, error: mwErr } = await supabase
    .from('league_matchweeks')
    .select('matchweek_id, matchweek_number, lock_at')
    .eq('season_id', seasonId)
    .order('matchweek_number')
  if (mwErr) return { ...empty, error: `league_matchweeks: ${mwErr.message}` }

  const rows = (mws ?? []) as Array<{ matchweek_id: string; matchweek_number: number; lock_at: string | null }>
  const keyByMatchweek = new Map(rows.map((m) => [m.matchweek_id, matchweekKey(m.matchweek_number)]))

  const stageById = new Map<string, string>()
  // Paged: 380 fixtures today, but a 24-club division is 552 and the PostgREST
  // cap is silent at 1,000.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('league_fixtures')
      .select('fixture_id, matchweek_id')
      .eq('season_id', seasonId)
      .range(from, from + 999)
    if (error) return { ...empty, error: `league_fixtures: ${error.message}` }
    const page = (data ?? []) as Array<{ fixture_id: string; matchweek_id: string }>
    for (const f of page) {
      const key = keyByMatchweek.get(f.matchweek_id)
      if (key) stageById.set(f.fixture_id, key)
    }
    if (page.length < 1000) break
  }

  return {
    roundStates: rows.map((m) => ({
      round_key: matchweekKey(m.matchweek_number),
      state: null,
      deadline: m.lock_at,
    })),
    stageById,
    error: null,
  }
}

/**
 * Everybody's league picks, in the shape the pool-wide surfaces already consume.
 *
 * Outcomes come back SEPARATELY, exactly as `readLeaguePredictions` does it for
 * a single entry: `PredictionData` requires non-null scores, and a Results pick
 * has none. Widening that type would put a nullable hole through four World Cup
 * call sites to describe a league concept — the thing phase 5 already declined
 * to do.
 */
export async function readAllLeaguePredictions(
  supabase: SupabaseClient,
  entryIds: string[],
): Promise<{
  predictions: ExistingPrediction[]
  outcomes: Array<{ entry_id: string; match_id: string; outcome: 'home' | 'draw' | 'away' }>
  error: string | null
}> {
  const out: ExistingPrediction[] = []
  const outcomes: Array<{ entry_id: string; match_id: string; outcome: 'home' | 'draw' | 'away' }> = []
  if (entryIds.length === 0) return { predictions: out, outcomes, error: null }

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('league_predictions')
      .select('prediction_id, entry_id, fixture_id, predicted_home_score, predicted_away_score, predicted_outcome')
      .in('entry_id', entryIds)
      .order('entry_id', { ascending: true })
      .order('fixture_id', { ascending: true })
      .range(from, from + 999)
    if (error) return { predictions: [], outcomes: [], error: `league_predictions: ${error.message}` }
    const page = (data ?? []) as unknown as Array<{
      prediction_id: string
      entry_id: string
      fixture_id: string
      predicted_home_score: number | null
      predicted_away_score: number | null
      predicted_outcome: 'home' | 'draw' | 'away' | null
    }>
    for (const p of page) {
      if (p.predicted_outcome !== null) {
        outcomes.push({ entry_id: p.entry_id, match_id: p.fixture_id, outcome: p.predicted_outcome })
        continue
      }
      out.push({
        prediction_id: p.prediction_id,
        entry_id: p.entry_id,
        match_id: p.fixture_id,
        predicted_home_score: p.predicted_home_score as number,
        predicted_away_score: p.predicted_away_score as number,
        predicted_home_pso: null,
        predicted_away_pso: null,
        predicted_winner_team_id: null,
      } as ExistingPrediction)
    }
    if (page.length < 1000) break
  }
  return { predictions: out, outcomes, error: null }
}

/**
 * The last N results per entry, for the leaderboard's form dots.
 *
 * ⚠ NOT the same read as `readRecentForm` in lib/scoring/readSource. That one
 * answers "this ONE entry's last five" for the pool-list and dashboard cards,
 * bounded per entry. This answers it for EVERY entry in a pool at once, which
 * is a different query shape — one round trip instead of one per member.
 *
 * ## The 1,000-row cap is handled by ordering, not by hoping
 *
 * `league_match_scores` grows to (entries × fixtures) — 3,800 rows for a
 * ten-person pool by May, well past PostgREST's silent 1,000-row ceiling. So
 * this orders by `fixture_number DESC` and takes the top slice: the newest rows
 * are exactly the ones form needs, and truncation removes only ancient history
 * that would have been discarded anyway. A ten-entry pool still gets ~100
 * fixtures each, twenty times what it uses.
 *
 * Returns oldest-first per entry, matching how the dots read left to right.
 */
export async function readLeagueFormByEntry(
  supabase: SupabaseClient,
  poolId: string,
  perEntry = 5,
): Promise<{ form: Map<string, string[]>; error: string | null }> {
  const { data, error } = await supabase
    .from('league_match_scores')
    .select('entry_id, score_type, fixture_number')
    .eq('pool_id', poolId)
    .order('fixture_number', { ascending: false })
    .limit(1000)
  if (error) return { form: new Map(), error: error.message }

  const rows = (data ?? []) as Array<{ entry_id: string; score_type: string; fixture_number: number }>
  const form = new Map<string, string[]>()
  for (const r of rows) {
    const got = form.get(r.entry_id) ?? []
    // Newest first out of the query, so the first `perEntry` seen are the most
    // recent; reversed below so the dots render oldest to newest.
    if (got.length < perEntry) {
      got.push(r.score_type)
      form.set(r.entry_id, got)
    }
  }
  for (const [k, v] of form) form.set(k, v.reverse())
  return { form, error: null }
}

/** Who a club plays next, for the league table's Next column. */
export type NextFixture = {
  opponentId: string
  opponentName: string
  opponentAbbr: string | null
  opponentCrest: string | null
  /** True when the club in question is at home. */
  isHome: boolean
  kickoffAt: string
}

/**
 * The next unplayed fixture for every club in a season.
 *
 * ⚠ Ordered by kickoff and filtered to `is_completed = false`, NOT derived from
 * the open matchweek. A postponed fixture keeps its original matchweek but is
 * played later, and a matchweek can sit locked with games outstanding for weeks
 * (which is exactly why migration 058 skips locked-but-unfinished weeks). Asking
 * the fixture list "what is next for this club" answers the question a member is
 * actually asking; asking the calendar would sometimes answer a different one.
 *
 * A season is 380 rows and this reads the unplayed tail, comfortably inside
 * PostgREST's silent 1,000-row ceiling — but the ceiling is silent, so the query
 * is bounded and the first fixture per club wins.
 */
export async function readNextFixtureByClub(
  supabase: SupabaseClient,
  seasonId: string,
): Promise<{ next: Map<string, NextFixture>; error: string | null }> {
  const [fixturesRes, clubsRes] = await Promise.all([
    supabase
      .from('league_fixtures')
      .select('home_club_id, away_club_id, kickoff_at')
      .eq('season_id', seasonId)
      .eq('is_completed', false)
      .not('kickoff_at', 'is', null)
      .order('kickoff_at', { ascending: true })
      .limit(1000),
    supabase
      .from('league_clubs')
      .select('club_id, name, abbreviation, crest_url')
      .eq('season_id', seasonId),
  ])
  if (fixturesRes.error) return { next: new Map(), error: fixturesRes.error.message }
  if (clubsRes.error) return { next: new Map(), error: clubsRes.error.message }

  const clubs = new Map(
    ((clubsRes.data ?? []) as Array<{ club_id: string; name: string; abbreviation: string | null; crest_url: string | null }>)
      .map((c) => [c.club_id, c]),
  )

  const next = new Map<string, NextFixture>()
  for (const f of (fixturesRes.data ?? []) as Array<{ home_club_id: string; away_club_id: string; kickoff_at: string }>) {
    for (const [self, other, isHome] of [
      [f.home_club_id, f.away_club_id, true],
      [f.away_club_id, f.home_club_id, false],
    ] as const) {
      if (next.has(self)) continue
      const opp = clubs.get(other)
      if (!opp) continue
      next.set(self, {
        opponentId: other,
        opponentName: opp.name,
        opponentAbbr: opp.abbreviation,
        opponentCrest: opp.crest_url,
        isHome,
        kickoffAt: f.kickoff_at,
      })
    }
  }
  return { next, error: null }
}

/**
 * Who every club plays in ONE named matchweek.
 *
 * ⚠ NOT `readNextFixtureByClub`, and the difference matters for Last Man
 * Standing. That one returns each club's next unplayed fixture ANYWHERE in the
 * season, which is usually this matchweek's — but when a club's game here has
 * been postponed it is a fixture weeks away, and showing it would tell a member
 * the club plays this week when it does not. Under the LMS rules a club with no
 * game is precisely the case where a picker survives without being tested, so
 * the distinction is the difference between an informed pick and a misled one.
 *
 * A club missing from the returned map has no fixture in this matchweek. That is
 * a real answer, not an error, and the caller is expected to say so.
 */
export async function readMatchweekFixtureByClub(
  supabase: SupabaseClient,
  seasonId: string,
  matchweekNumber: number,
): Promise<{ byClub: Map<string, NextFixture>; error: string | null }> {
  // ⚠ VIA matchweek_id. `league_fixtures` has NO `matchweek_number` column —
  // the first draft of this filtered on one, PostgREST refused the whole select,
  // and every club rendered "no game this week". Wrong, silently, at HTTP 200:
  // the same shape as the dropped-column outage, and the reason
  // scripts/verify-select-columns.ts exists.
  const { data: mw, error: mwErr } = await supabase
    .from('league_matchweeks')
    .select('matchweek_id')
    .eq('season_id', seasonId)
    .eq('matchweek_number', matchweekNumber)
    .maybeSingle()
  if (mwErr) return { byClub: new Map(), error: mwErr.message }
  if (!mw) return { byClub: new Map(), error: null }

  const [fixturesRes, clubsRes] = await Promise.all([
    supabase
      .from('league_fixtures')
      .select('home_club_id, away_club_id, kickoff_at')
      .eq('matchweek_id', (mw as { matchweek_id: string }).matchweek_id),
    supabase
      .from('league_clubs')
      .select('club_id, name, abbreviation, crest_url')
      .eq('season_id', seasonId),
  ])
  if (fixturesRes.error) return { byClub: new Map(), error: fixturesRes.error.message }
  if (clubsRes.error) return { byClub: new Map(), error: clubsRes.error.message }

  const clubs = new Map(
    ((clubsRes.data ?? []) as Array<{ club_id: string; name: string; abbreviation: string | null; crest_url: string | null }>)
      .map((c) => [c.club_id, c]),
  )

  const byClub = new Map<string, NextFixture>()
  for (const f of (fixturesRes.data ?? []) as Array<{
    home_club_id: string; away_club_id: string; kickoff_at: string | null
  }>) {
    for (const [self, other, isHome] of [
      [f.home_club_id, f.away_club_id, true],
      [f.away_club_id, f.home_club_id, false],
    ] as const) {
      const opp = clubs.get(other)
      if (!opp) continue
      byClub.set(self, {
        opponentId: other,
        opponentName: opp.name,
        opponentAbbr: opp.abbreviation,
        opponentCrest: opp.crest_url,
        isHome,
        kickoffAt: f.kickoff_at ?? '',
      })
    }
  }

  return { byClub, error: null }
}

/**
 * Live and upcoming league fixtures for the dashboard's matches panel.
 *
 * ⚠ THE PANEL WAS EMPTY FOR EVERY LEAGUE MEMBER. It reads `matches` filtered by
 * the tournaments a member has pools in, and a league tournament has ZERO rows
 * there — a league's fixtures are `league_fixtures`. So a member whose only pool
 * was a Premier League one saw "No upcoming matches scheduled" on a Saturday
 * morning with ten games to come. Nothing errored: an empty result is valid.
 *
 * Shaped to the panel's existing contract rather than given a new one, the same
 * trade the rest of this file makes — `country_name` carries the club's name,
 * `country_code` its abbreviation and `flag_url` its crest, because the panel
 * reads those fields positionally.
 *
 * `competition` is the one ADDITION. A member in a Premier League pool and a La
 * Liga pool now sees both leagues' fixtures in one list, and two crests with no
 * caption cannot say which competition a game belongs to.
 */
export type DashboardFixture = {
  match_id: string
  match_number: number
  stage: string
  match_date: string
  status: string
  venue: string | null
  home_team: { country_name: string; country_code: string | null; flag_url: string | null } | null
  away_team: { country_name: string; country_code: string | null; flag_url: string | null } | null
  home_team_placeholder: null
  away_team_placeholder: null
  home_score_ft: number | null
  away_score_ft: number | null
  /** The competition's display name, e.g. "Premier League". */
  competition: string | null
}

export async function readLeagueDashboardFixtures(
  supabase: SupabaseClient,
  seasonIds: string[],
  upcomingLimit: number,
): Promise<{ live: DashboardFixture[]; upcoming: DashboardFixture[]; error: string | null }> {
  const empty = { live: [], upcoming: [], error: null }
  if (seasonIds.length === 0) return empty

  // ⚠ Bounded, and ordered by kickoff so the bound takes the SOONEST rather
  // than an arbitrary page. A season is 380 rows and a member can be in pools
  // across several, so an unbounded select here would eventually meet
  // PostgREST's silent 1,000-row cap — which would drop fixtures without
  // saying so, the exact failure this function exists to fix.
  const nowIso = new Date().toISOString()
  const [liveRes, upcomingRes, clubsRes, seasonsRes] = await Promise.all([
    supabase
      .from('league_fixtures')
      .select(FIXTURE_PANEL_COLS)
      .in('season_id', seasonIds)
      .eq('status', 'live')
      .order('kickoff_at', { ascending: true })
      .limit(50),
    supabase
      .from('league_fixtures')
      .select(FIXTURE_PANEL_COLS)
      .in('season_id', seasonIds)
      .eq('status', 'scheduled')
      .gte('kickoff_at', nowIso)
      .order('kickoff_at', { ascending: true })
      .limit(upcomingLimit),
    supabase
      .from('league_clubs')
      .select('club_id, name, abbreviation, crest_url')
      .in('season_id', seasonIds),
    supabase
      .from('league_seasons')
      .select('season_id, competition_name')
      .in('season_id', seasonIds),
  ])

  const err = liveRes.error ?? upcomingRes.error ?? clubsRes.error ?? seasonsRes.error
  // Decorative panel: a failure must not take the dashboard down with it.
  if (err) return { live: [], upcoming: [], error: err.message }

  const clubById = new Map(
    ((clubsRes.data ?? []) as Array<{ club_id: string; name: string; abbreviation: string | null; crest_url: string | null }>)
      .map((c) => [c.club_id, c]),
  )
  const competitionBySeason = new Map(
    ((seasonsRes.data ?? []) as Array<{ season_id: string; competition_name: string }>)
      .map((s) => [s.season_id, s.competition_name]),
  )

  const shape = (f: FixturePanelRow): DashboardFixture => {
    const club = (id: string) => {
      const c = clubById.get(id)
      return c ? { country_name: c.name, country_code: c.abbreviation, flag_url: c.crest_url } : null
    }
    return {
      match_id: f.fixture_id,
      match_number: f.fixture_number,
      // Same value fixtureToMatch uses. The panel only reads `stage` in its
      // "awaiting results" branch, which a league fixture never reaches — both
      // clubs are known from the day the season is published.
      stage: 'regular_season',
      match_date: f.kickoff_at,
      status: f.status,
      venue: f.venue,
      home_team: club(f.home_club_id),
      away_team: club(f.away_club_id),
      home_team_placeholder: null,
      away_team_placeholder: null,
      home_score_ft: f.home_goals,
      away_score_ft: f.away_goals,
      competition: competitionBySeason.get(f.season_id) ?? null,
    }
  }

  return {
    live: ((liveRes.data ?? []) as FixturePanelRow[]).map(shape),
    upcoming: ((upcomingRes.data ?? []) as FixturePanelRow[]).map(shape),
    error: null,
  }
}

const FIXTURE_PANEL_COLS =
  'fixture_id, fixture_number, season_id, kickoff_at, venue, status, home_goals, away_goals, home_club_id, away_club_id'

type FixturePanelRow = {
  fixture_id: string
  fixture_number: number
  season_id: string
  kickoff_at: string
  venue: string | null
  status: string
  home_goals: number | null
  away_goals: number | null
  home_club_id: string
  away_club_id: string
}
