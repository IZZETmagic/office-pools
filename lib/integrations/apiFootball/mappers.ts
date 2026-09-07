import type {
  ApiFootballEvent,
  ApiFootballFixture,
  ApiFootballLineup,
  ApiFootballLineupPlayer,
  ApiFootballStatusShort,
  ApiFootballTeamStatistics,
} from './types'

export type OurMatchRow = {
  match_id: string
  home_team_id: string | null
  away_team_id: string | null
  status: string | null
  status_detail: string | null
  is_completed: boolean | null
  home_score_ft: number | null
  away_score_ft: number | null
  home_score_pso: number | null
  away_score_pso: number | null
  live_minute: number | null
  live_period: string | null
  live_added: number | null
  winner_team_id: string | null
  data_source: 'api' | 'manual'
}

export type MatchUpdatePayload = {
  status?: 'scheduled' | 'live' | 'completed' | 'cancelled'
  status_detail?: MatchStatusDetail | null
  is_completed?: boolean
  completed_at?: string | null
  home_score_ft?: number | null
  away_score_ft?: number | null
  home_score_pso?: number | null
  away_score_pso?: number | null
  winner_team_id?: string | null
  live_minute?: number | null
  live_period?: string | null
  live_added?: number | null
  last_synced_at?: string
}

// 'SUSP' (suspended) is kept in the live bucket: it only happens after kickoff, so a
// suspended match must stay coarse='live' rather than regress to 'scheduled'. The
// specific "Suspended" reason is carried by mapStatusDetail below.
const LIVE_STATUSES: ApiFootballStatusShort[] = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE', 'SUSP']
const FINAL_STATUSES: ApiFootballStatusShort[] = ['FT', 'AET', 'PEN']
const CANCELLED_STATUSES: ApiFootballStatusShort[] = ['CANC', 'ABD', 'WO']

export function mapStatus(short: ApiFootballStatusShort): 'scheduled' | 'live' | 'completed' | 'cancelled' {
  if (FINAL_STATUSES.includes(short)) return 'completed'
  if (LIVE_STATUSES.includes(short)) return 'live'
  if (CANCELLED_STATUSES.includes(short)) return 'cancelled'
  return 'scheduled'
}

/** The precise abnormal reason to surface in the UI, in parallel with the coarse `status`. */
export type MatchStatusDetail =
  | 'postponed'
  | 'tbd'
  | 'suspended'
  | 'interrupted'
  | 'cancelled'
  | 'abandoned'
  | 'awarded'
  | 'walkover'

/**
 * Map an api-football short code to the specific reason we badge in the UI, or null for
 * normal scheduled/live/final states. Owned exclusively by the live sync — it is written
 * authoritatively every run (and cleared to null when a match resumes to normal play).
 *
 * NOTE: 'delayed' is intentionally NOT produced here. A delay is a *kickoff-time move*, not
 * a fixture status; the schedule reconcile pass records it via `original_match_date` and the
 * client derives the "Delayed" badge from that — keeping this column free of reconcile writes.
 */
export function mapStatusDetail(short: ApiFootballStatusShort): MatchStatusDetail | null {
  switch (short) {
    case 'PST': return 'postponed'
    case 'TBD': return 'tbd'
    case 'SUSP': return 'suspended'
    case 'INT': return 'interrupted'
    case 'CANC': return 'cancelled'
    case 'ABD': return 'abandoned'
    case 'AWD': return 'awarded'
    case 'WO': return 'walkover'
    default: return null
  }
}

export function mapPeriod(short: ApiFootballStatusShort): string | null {
  if (short === '1H' || short === 'HT' || short === '2H') return short
  if (short === 'ET' || short === 'BT') return 'ET'
  if (short === 'P' || short === 'PEN') return 'PEN'
  return null
}

/**
 * Compute the partial UPDATE payload for our `matches` row given a fixture from
 * api-football. Returns `null` if nothing has changed (no DB write needed).
 *
 * Never writes home_team_id/away_team_id — bracket cascade is authoritative.
 */
export function fixtureToMatchUpdate(
  fixture: ApiFootballFixture,
  current: OurMatchRow,
  opts: {
    /** ISO timestamp to stamp `last_synced_at`/`completed_at`. Pass once per sync run. */
    now: string
    /** Resolves api-football team ids → our team_id. Used only for winner_team_id. */
    teamIdByExternal: Map<number, string>
  }
): MatchUpdatePayload | null {
  const next: MatchUpdatePayload = { last_synced_at: opts.now }

  const newStatus = mapStatus(fixture.fixture.status.short)
  if (newStatus !== current.status) next.status = newStatus

  // Precise reason (postponed/suspended/…) alongside the coarse status. Diffed like every
  // other field; writing null here is intentional — it clears the badge when a suspended or
  // interrupted match resumes to normal play. Never touches `original_match_date` (reconcile).
  const newDetail = mapStatusDetail(fixture.fixture.status.short)
  if (newDetail !== (current.status_detail ?? null)) next.status_detail = newDetail

  const newIsCompleted = newStatus === 'completed'
  if (newIsCompleted !== !!current.is_completed) next.is_completed = newIsCompleted
  if (newIsCompleted && !current.is_completed) next.completed_at = opts.now

  const newHome = fixture.goals.home
  const newAway = fixture.goals.away
  if (newHome !== current.home_score_ft) next.home_score_ft = newHome
  if (newAway !== current.away_score_ft) next.away_score_ft = newAway

  const psoH = fixture.score.penalty.home
  const psoA = fixture.score.penalty.away
  if (psoH !== current.home_score_pso) next.home_score_pso = psoH
  if (psoA !== current.away_score_pso) next.away_score_pso = psoA

  const elapsed = fixture.fixture.status.elapsed ?? null
  if (elapsed !== current.live_minute) next.live_minute = elapsed

  const period = mapPeriod(fixture.fixture.status.short)
  if (period !== current.live_period) next.live_period = period

  // Stoppage/added minutes at the end of the current half (the clock holds at
  // 45'/90'/105'/120' while `extra` counts the added time). Diffed and written
  // like every other field — including back to null once the half's stoppage
  // window ends — so it never lingers into the next period.
  const added = fixture.fixture.status.extra ?? null
  if (added !== current.live_added) next.live_added = added

  // Winner derivation for knockout: when match final, prefer PSO winner else FT.
  // Diffed against current like every other field — an unconditional write here
  // made every sync of an already-completed match register as a phantom change
  // (and a realtime `matches` event) for the whole 4h live window.
  if (newIsCompleted) {
    let winnerExt: number | null = null
    if (psoH !== null && psoA !== null && psoH !== psoA) {
      winnerExt = psoH > psoA ? fixture.teams.home.id : fixture.teams.away.id
    } else if (newHome !== null && newAway !== null && newHome !== newAway) {
      winnerExt = newHome > newAway ? fixture.teams.home.id : fixture.teams.away.id
    }
    const winnerTeamId = winnerExt !== null ? opts.teamIdByExternal.get(winnerExt) ?? null : null
    if (winnerTeamId !== current.winner_team_id) next.winner_team_id = winnerTeamId
  }

  // If only `last_synced_at` would be written, treat as no-op.
  const writableKeys = Object.keys(next).filter((k) => k !== 'last_synced_at')
  if (writableKeys.length === 0) return null
  return next
}

export type ConductRow = {
  match_id: string
  team_id: string
  yellow_cards: number
  indirect_red_cards: number
  direct_red_cards: number
  yellow_direct_red_cards: number
  last_synced_at: string
}

/**
 * Aggregate api-football events into per-team match_conduct rows.
 * Always emits one row per side so previously-deleted cards reset to 0.
 * Returns [] if either team isn't mapped to one of our team_ids.
 */
export function eventsToConduct(
  fixture: ApiFootballFixture,
  events: ApiFootballEvent[],
  ourMatchId: string,
  opts: {
    now: string
    teamIdByExternal: Map<number, string>
  }
): ConductRow[] {
  const homeExt = fixture.teams.home.id
  const awayExt = fixture.teams.away.id
  const homeId = opts.teamIdByExternal.get(homeExt)
  const awayId = opts.teamIdByExternal.get(awayExt)
  if (!homeId || !awayId) return []

  type Bucket = { yellow: boolean; direct_red: boolean; second_yellow: boolean }
  const homeByPlayer = new Map<string, Bucket>()
  const awayByPlayer = new Map<string, Bucket>()

  for (const ev of events) {
    if (ev.type !== 'Card') continue
    const playerKey = ev.player?.id != null
      ? `id:${ev.player.id}`
      : `name:${ev.player?.name ?? 'unknown'}`
    const map =
      ev.team.id === homeExt ? homeByPlayer
      : ev.team.id === awayExt ? awayByPlayer
      : null
    if (!map) continue
    let b = map.get(playerKey)
    if (!b) {
      b = { yellow: false, direct_red: false, second_yellow: false }
      map.set(playerKey, b)
    }
    const detail = (ev.detail || '').toLowerCase()
    if (detail.includes('second yellow')) b.second_yellow = true
    else if (detail.includes('yellow')) b.yellow = true
    else if (detail.includes('red')) b.direct_red = true
  }

  return [
    summarize(ourMatchId, homeId, homeByPlayer, opts.now),
    summarize(ourMatchId, awayId, awayByPlayer, opts.now),
  ]
}

function summarize(
  matchId: string,
  teamId: string,
  byPlayer: Map<string, { yellow: boolean; direct_red: boolean; second_yellow: boolean }>,
  now: string
): ConductRow {
  let yellow_cards = 0
  let indirect_red_cards = 0
  let direct_red_cards = 0
  let yellow_direct_red_cards = 0
  // FIFA fair-play deduction model — each player contributes exactly one category, the worst.
  for (const b of byPlayer.values()) {
    if (b.yellow && b.direct_red) yellow_direct_red_cards++
    else if (b.direct_red) direct_red_cards++
    else if (b.second_yellow) indirect_red_cards++
    else if (b.yellow) yellow_cards++
  }
  return {
    match_id: matchId,
    team_id: teamId,
    yellow_cards,
    indirect_red_cards,
    direct_red_cards,
    yellow_direct_red_cards,
    last_synced_at: now,
  }
}

/** True when the fixture status indicates the match is currently in progress. */
export function isLiveStatus(short: ApiFootballStatusShort): boolean {
  return LIVE_STATUSES.includes(short)
}

/** True when the fixture status indicates a final (completed) result. */
export function isFinalStatus(short: ApiFootballStatusShort): boolean {
  return FINAL_STATUSES.includes(short)
}

// =============================================================
// LEAGUE fixtures — a separate mapper, not a reuse of fixtureToMatchUpdate
// =============================================================
// Everything above this line is the World Cup path and is untouched by the
// league work. The league needs its own diff because `league_fixtures` carries
// CHECK constraints that STRADDLE columns `fixtureToMatchUpdate` diffs
// independently, so reusing it would raise 23514 in production rather than
// merely produce odd data. The four forced divergences are named on
// `fixtureToLeagueUpdate` below.
// =============================================================

/** The columns of a `league_fixtures` row the sync arm reads to diff against. */
export type LeagueFixtureRow = {
  fixture_id: string
  matchweek_id: string
  external_fixture_id: string
  kickoff_at: string
  /** NULL until the fixture has moved at least once. See LeagueFixturePayload. */
  original_kickoff_at?: string | null
  status: string
  status_detail: string | null
  home_goals: number | null
  away_goals: number | null
  is_completed: boolean
  live_minute: number | null
  live_period: string | null
  live_added: number | null
  manual_override: boolean
}

export type LeagueStatus = 'scheduled' | 'live' | 'completed' | 'postponed' | 'cancelled'

/**
 * One row of the JSONB payload consumed by `league_apply_fixture_sync()`.
 *
 * Every optional field is paired with an explicit `set_*` flag because
 * `jsonb_to_recordset` renders an ABSENT key and an explicit JSON null
 * identically as SQL NULL — so without the flags, "clear the score" and "do not
 * touch the score" would be the same payload.
 */
export type LeagueFixturePayload = {
  external_fixture_id: string
  set_status?: boolean
  status?: LeagueStatus
  set_status_detail?: boolean
  status_detail?: MatchStatusDetail | null
  set_goals?: boolean
  home_goals?: number | null
  away_goals?: number | null
  set_completed?: boolean
  is_completed?: boolean
  set_live?: boolean
  live_minute?: number | null
  live_period?: string | null
  live_added?: number | null
  /**
   * L11 — rescheduling. Set when the provider's kickoff instant differs from
   * ours. `original_kickoff_at` carries the value we are moving AWAY from, and
   * only on the first move: it means "this fixture has moved", and overwriting
   * it on a second move would lose the date members originally planned around.
   */
  set_kickoff?: boolean
  kickoff_at?: string
  set_original_kickoff?: boolean
  original_kickoff_at?: string
}

/** Conditions the arm reports but deliberately does not act on. */
export type LeagueFixtureFlags = {
  /** FT/AET/PEN with NULL goals — `is_completed` is deliberately left false. */
  finalWithoutGoals: boolean
  /** AWD: the shared mapper files an awarded match as `scheduled`. Reported, not fixed here. */
  awarded: boolean
  /** The provider's kickoff instant differs from ours. DETECTED ONLY — L3 never writes kickoff_at. */
  rescheduled: boolean
}

/**
 * `PST` maps to `'postponed'`, a value `matches` never uses and `mapStatus` can
 * never emit (it falls through to `'scheduled'`). `league_fixtures_status_ck`
 * already admits it. A league's matchweek derivation has to tell "not played
 * yet" from "will not be played on this date", and nothing reads
 * `league_fixtures.status` yet, so there is no consumer to break.
 */
export function mapLeagueStatus(short: ApiFootballStatusShort): LeagueStatus {
  if (short === 'PST') return 'postponed'
  return mapStatus(short)
}

/**
 * Diff one api-football fixture against one `league_fixtures` row. `payload` is
 * null when nothing moved.
 *
 * FOUR FORCED DIVERGENCES FROM `fixtureToMatchUpdate`:
 *
 *  1. **Goals move as a PAIR.** `league_fixtures_result_pair_ck` is
 *     `CHECK ((home_goals IS NULL) = (away_goals IS NULL))`.
 *     `fixtureToMatchUpdate` diffs each side alone and would raise 23514 the
 *     first time the provider reported `{1, null}` mid-write.
 *  2. **`is_completed` REQUIRES goals.** `league_fixtures_completed_ck` is
 *     `CHECK (NOT is_completed OR home_goals IS NOT NULL)`. `matches`
 *     explicitly permits completed-with-NULL-goals; this table does not. An FT
 *     with NULL goals stays `is_completed = false` and raises
 *     `flags.finalWithoutGoals`.
 *  3. **PST → 'postponed'** (see `mapLeagueStatus`).
 *  4. **No PSO, no winner_team_id, no data_source.** A regular-season league
 *     fixture has no shoot-out, there is no winner column, and the
 *     api/manual distinction is `manual_override`.
 *
 * INHERITED HOLES, named rather than silently carried: `AWD` is in
 * `ApiFootballStatusShort` but in none of LIVE/FINAL/CANCELLED, so
 * `mapStatus('AWD')` returns `'scheduled'` while `mapStatusDetail('AWD')`
 * returns `'awarded'` — an awarded match with a real result files as "not
 * started". `WO` maps to `'cancelled'` and discards its result. Fixing either
 * means editing the shared mapper, which would put World Cup lines in this
 * diff, so L3 counts them instead (`awarded=N` in the run note).
 */
export function fixtureToLeagueUpdate(
  f: ApiFootballFixture,
  cur: LeagueFixtureRow,
): { payload: LeagueFixturePayload | null; flags: LeagueFixtureFlags } {
  const short = f.fixture.status.short
  const out: LeagueFixturePayload = { external_fixture_id: cur.external_fixture_id }
  let moved = false

  const nextStatus = mapLeagueStatus(short)
  if (nextStatus !== cur.status) {
    out.set_status = true
    out.status = nextStatus
    moved = true
  }

  const nextDetail = mapStatusDetail(short)
  if (nextDetail !== (cur.status_detail ?? null)) {
    out.set_status_detail = true
    out.status_detail = nextDetail
    moved = true
  }

  // Divergence 1 — the pair moves together or not at all.
  if (f.goals.home !== cur.home_goals || f.goals.away !== cur.away_goals) {
    out.set_goals = true
    out.home_goals = f.goals.home
    out.away_goals = f.goals.away
    moved = true
  }

  // Divergence 2 — completion requires goals.
  const haveGoals = f.goals.home !== null && f.goals.away !== null
  const nextCompleted = isFinalStatus(short) && haveGoals
  if (nextCompleted !== cur.is_completed) {
    out.set_completed = true
    out.is_completed = nextCompleted
    moved = true
  }

  const nextMinute = f.fixture.status.elapsed ?? null
  const nextPeriod = mapPeriod(short)
  const nextAdded = f.fixture.status.extra ?? null
  if (nextMinute !== cur.live_minute || nextPeriod !== cur.live_period || nextAdded !== cur.live_added) {
    out.set_live = true
    out.live_minute = nextMinute
    out.live_period = nextPeriod
    out.live_added = nextAdded
    moved = true
  }

  const flags: LeagueFixtureFlags = {
    finalWithoutGoals: isFinalStatus(short) && !haveGoals,
    awarded: short === 'AWD',
    // Compare INSTANTS, not strings. Both sides render `+00:00` today, but an
    // offset is a formatting choice rather than an instant, and a string compare
    // would report a move on every fixture on every tick. TBD carries a
    // placeholder date and is never a move.
    //
    // ⚠ This flag was DETECT-ONLY for three migrations — L3's contract said
    // "never writes kickoff_at (L11 owns rescheduling)" and L11 did not exist.
    // So a fixture moved from February to May stayed at its February date
    // forever: the matchweek window, the deadline and the league table's "Next"
    // column all wrong, silently, from the first rearrangement of a season.
    rescheduled: short !== 'TBD' && Date.parse(f.fixture.date) !== Date.parse(cur.kickoff_at),
  }

  // L11 — act on it. Writing the kickoff is enough on its own: the matchweek
  // window trigger fires on `UPDATE OF kickoff_at`, so first_kickoff_at and the
  // deadline follow without anything else being told.
  //
  // ⚠ A COMPLETED FIXTURE'S KICKOFF IS HISTORY. The provider occasionally
  // restates the date of a played match; moving it would rewrite when a result
  // happened, and `lock_at` freezes on the way past so it could not undo the
  // deadline anyway — it would only make the record disagree with itself.
  if (flags.rescheduled && !cur.is_completed) {
    out.set_kickoff = true
    out.kickoff_at = f.fixture.date
    moved = true

    // Stamped ONCE, with the value we are moving away from. It means "this
    // fixture has moved" — lib/matchStatus.ts badges a not-started fixture
    // Delayed on the strength of it — so a second move must not overwrite the
    // date members originally planned around. Migration 053 had to null 380 rows
    // a previous import created by seeding it equal to kickoff_at; this is the
    // only writer, and it only ever writes when the column is empty.
    if (!cur.original_kickoff_at) {
      out.set_original_kickoff = true
      out.original_kickoff_at = cur.kickoff_at
    }
  }

  return { payload: moved ? out : null, flags }
}

// =============================================================
// The timeline — what happened, for a screen rather than for scoring
// =============================================================
// ⚠ THIS IS NOT `eventsToConduct`, AND MUST NOT BECOME IT. That mapper reads
// the same `/fixtures/events` payload and keeps CARD COUNTS PER TEAM, because
// its consumer is World Cup fair-play scoring: it discards the minute, the
// player and every goal, and `summarize()` collapses a player's two yellows
// into one worst-category row. Correct for a tiebreak, useless for a timeline.
//
// This one keeps the opposite half: every goal, card, VAR reversal and
// substitution, each with its minute and the people involved, and no
// aggregation at all. Nothing downstream scores off it — `match_events` has no
// scoring consumer by design — so a wrong row here is a wrong line on a screen,
// not wrong points.
//
// ## Two things about the feed that are not guessable
//
// 1. FOR A SUBSTITUTION, `player` IS THE ONE GOING OFF and `assist` is the one
//    coming on. Verified by PLAYER ID across fixtures 1557391, 1557388 and
//    1557394 — 26 of 26 substitutions had `player.id` in that team's startXI
//    and `assist.id` on its bench. Do not re-check this by NAME: `/events`
//    returns "Eddie Nketiah" where `/lineups` returns "E. Nketiah", so a
//    name comparison reports 0 matches and looks like proof of the opposite.
//
// 2. A MISSED PENALTY IS `type: 'Goal'`. Dropping it is the difference between
//    a timeline and a scoreline that does not add up.
//
// 3. AN OWN GOAL IS ALREADY ATTRIBUTED TO THE SIDE IT COUNTED FOR. `team` is
//    the beneficiary and `player` is the man who put it in his own net — they
//    are deliberately from opposite squads. Do not "correct" this.
// =============================================================

export type MatchEventKind =
  | 'goal'
  | 'own_goal'
  | 'penalty'
  | 'yellow'
  | 'red'
  | 'second_yellow'
  | 'var_goal_cancelled'
  | 'subst'

/** One row of `match_events`, as the league arm writes it. */
export type MatchEventRow = {
  fixture_id: string
  /**
   * Which column the row is drawn in — the side CREDITED, not the side the
   * provider attributed the event to. They differ for an own goal, which is
   * the only place this distinction shows up and the only place it matters.
   */
  side: 'home' | 'away'
  kind: MatchEventKind
  /** Scorer, carded player, or the player LEAVING for a substitution. */
  player_name: string | null
  /** Assist, or the player ARRIVING for a substitution. Null when neither. */
  related_name: string | null
  minute: number
  extra_minute: number | null
  /**
   * Feed order within a minute.
   *
   * ⚠ Six things can share the 45th minute and `minute` alone cannot order
   * them. This is the index in the provider's array, which is the only ordering
   * information the payload carries.
   */
  sort_index: number
}

/** Lowercased detail matching, because the feed's capitalisation is not stable. */
function classify(ev: ApiFootballEvent): MatchEventKind | null {
  const detail = (ev.detail ?? '').trim().toLowerCase()
  switch (ev.type) {
    case 'Goal':
      // ⚠ A missed penalty arrives as a GOAL. Kept out entirely.
      if (detail.includes('missed')) return null
      if (detail.includes('own goal')) return 'own_goal'
      if (detail.includes('penalty')) return 'penalty'
      return 'goal'
    case 'Card':
      if (detail.includes('second yellow')) return 'second_yellow'
      if (detail.includes('red')) return 'red'
      if (detail.includes('yellow')) return 'yellow'
      // An unrecognised card is dropped rather than guessed at: a wrong card on
      // a timeline is a claim about a player that the feed did not make.
      return null
    case 'subst':
      return 'subst'
    case 'Var':
      // Only the reversal is rendered. "Penalty confirmed" and friends describe
      // a decision about an event that is already in the list on its own.
      return detail.includes('cancelled') || detail.includes('disallowed')
        ? 'var_goal_cancelled'
        : null
    default:
      return null
  }
}

/**
 * `/fixtures/events` → `match_events` rows for one league fixture.
 *
 * Returns rows in feed order. The caller writes them replace-all: the provider
 * gives events no stable id, and a VAR reversal REMOVES an event from the
 * payload, so an upsert would leave a disallowed goal on the screen forever.
 */
export function eventsToTimeline(
  events: ApiFootballEvent[],
  opts: { fixtureId: string; homeExternalTeamId: number },
): MatchEventRow[] {
  const rows: MatchEventRow[] = []

  // ⚠ THE FEED IS NOT CONSISTENT ABOUT REMOVING A CANCELLED GOAL, so the
  // cancellations have to be known before the goals are read.
  //
  // In fixture 1557391 a VAR-disallowed goal is simply ABSENT from the payload:
  // five Goal events for a 2-3 match. In fixture 1557377 — Aston Villa 0-1
  // Arsenal — the same situation leaves the goal row in place with its player
  // stripped, alongside the `Var / Penalty cancelled` that explains it:
  //
  //     55'  Var  "Penalty cancelled"  player = Bukayo Saka
  //     55'  Goal "Normal Goal"        player = null
  //
  // Read literally that is a 0-2 timeline over a 0-1 scoreline. So a Goal that
  // shares a minute and a team with a cancellation AND names nobody is dropped:
  // the feed has already said it did not stand, and a goal with no scorer is
  // not renderable in any case.
  //
  // ⚠ BOTH CONDITIONS, deliberately. Minute+team alone would discard a real
  // goal scored in the same minute as a separate cancellation; a null player
  // alone would discard a legitimately unattributed goal. Requiring the two
  // together is the narrowest rule that fits what the provider actually sends,
  // and the scoreline check in the tests is what would catch it if the feed
  // grows a variant this misses.
  const cancelledAt = new Set<string>()
  for (const ev of events) {
    if (ev.type === 'Var' && (ev.detail ?? '').toLowerCase().includes('cancelled')) {
      cancelledAt.add(`${ev.team?.id}@${ev.time?.elapsed}`)
    }
  }

  events.forEach((ev, i) => {
    const kind = classify(ev)
    if (kind === null) return

    const isScoring = kind === 'goal' || kind === 'penalty' || kind === 'own_goal'
    if (
      isScoring &&
      !ev.player?.name &&
      cancelledAt.has(`${ev.team?.id}@${ev.time?.elapsed}`)
    ) {
      return
    }

    // ⚠ NO FLIP FOR AN OWN GOAL. THE FEED ALREADY CREDITS THE RIGHT SIDE, and
    // an earlier version of this mapper flipped it on the assumption that the
    // provider attributes an own goal to the team the scorer plays for. It does
    // not. Verified on fixture 1557381 — Crystal Palace 1-4 Manchester City —
    // where the 56th-minute Own Goal is attributed to CRYSTAL PALACE, the side
    // it counted FOR, with `player` = G. Donnarumma, a Manchester City player.
    //
    // The flip cost 14 of 137 backfilled fixtures their scoreline: every game
    // with an own goal came out with that goal in the wrong column, so the
    // timeline read one short on one side and one over on the other. It was
    // invisible in unit tests because the synthetic case asserted the wrong
    // answer too — which is why the real fixture is pinned in the suite now.
    const isHome = ev.team?.id === opts.homeExternalTeamId
    const side: 'home' | 'away' = isHome ? 'home' : 'away'

    rows.push({
      fixture_id: opts.fixtureId,
      side,
      kind,
      player_name: ev.player?.name ?? null,
      related_name: ev.assist?.name ?? null,
      // ⚠ CLAMPED AT ZERO, BECAUSE THE FEED SENDS NEGATIVE MINUTES. Fixture
      // 1550091 carries two yellow cards at `elapsed: -5` — a booking before
      // kick-off, or the provider's stand-in for a minute it does not know.
      // Either way it is not a match minute, and `match_events_minute_ck`
      // (0..130) refuses it: the backfill lost that whole fixture to a 23514
      // until this existed.
      //
      // Clamped rather than DROPPED on purpose. The cards were really shown, so
      // discarding them loses a fact; "at or before kick-off" is true, where
      // "-5th minute" is not. The constraint stays tight so the next kind of
      // nonsense still fails loudly rather than rendering.
      minute: Math.max(0, ev.time?.elapsed ?? 0),
      extra_minute: ev.time?.extra ?? null,
      sort_index: i,
    })
  })

  return rows
}

// =============================================================
// The line-up and the statistics — migration 139
// =============================================================
// 136's siblings, and they follow `eventsToTimeline` in every respect that
// matters: pure, synchronous, no DB, no client, optional chaining everywhere
// because the payload is untrusted, and the SIDE resolved from the provider's
// team id against the fixture's own home club rather than from array order.
//
// ⚠ ORDER IS NOT THE SIDE. Both payloads happen to arrive home-first, and
// relying on that is a one-character bug that swaps two teams' entire line-ups
// and passes every test written against a payload that also arrives home-first.
// `homeExternalTeamId` is the same option `eventsToTimeline` takes, for the
// same reason.
// =============================================================

/** One row of `match_lineups`, as the league arm writes it. */
export type MatchLineupRow = {
  fixture_id: string
  side: 'home' | 'away'
  formation: string | null
  coach_name: string | null
  players: LineupPlayer[]
}

/** One player inside `match_lineups.players`. */
export type LineupPlayer = {
  /** The provider's id. Kept because names are abbreviated here and not in `/events`. */
  player_id: number | null
  name: string | null
  number: number | null
  pos: string | null
  /** "row:col", row 1 being the keeper. NULL for every substitute. */
  grid: string | null
  starter: boolean
}

/**
 * Both sides' line-ups, as rows.
 *
 * ⚠ A SUBSTITUTE HAS NO `grid`, AND THAT IS THE FEED'S ANSWER, NOT A GAP. All
 * nine subs in fixture 1379342 came back with `grid: null` while all eleven
 * starters had one. `starter` is therefore carried explicitly rather than being
 * inferred from `grid != null` — the two happen to agree today, and a renderer
 * that infers would silently drop a starter the feed forgot to position.
 *
 * Returns `[]` for an empty payload, which is the ordinary pre-match answer.
 */
export function lineupsToRows(
  lineups: ApiFootballLineup[],
  opts: { fixtureId: string; homeExternalTeamId: number },
): MatchLineupRow[] {
  const rows: MatchLineupRow[] = []

  for (const l of lineups ?? []) {
    const teamId = l?.team?.id
    if (teamId === undefined || teamId === null) continue

    const take = (entries: ApiFootballLineupPlayer[] | null, starter: boolean): LineupPlayer[] =>
      (entries ?? []).map((e) => ({
        player_id: e?.player?.id ?? null,
        name: e?.player?.name ?? null,
        number: e?.player?.number ?? null,
        pos: e?.player?.pos ?? null,
        grid: e?.player?.grid ?? null,
        starter,
      }))

    rows.push({
      fixture_id: opts.fixtureId,
      side: teamId === opts.homeExternalTeamId ? 'home' : 'away',
      formation: l?.formation ?? null,
      coach_name: l?.coach?.name ?? null,
      // Starters first, then the bench, so a consumer that renders the array in
      // order gets the XI without having to sort it.
      players: [...take(l?.startXI ?? null, true), ...take(l?.substitutes ?? null, false)],
    })
  }

  return rows
}

/** One row of `match_team_stats`. Every stat is nullable; see `statisticsToRows`. */
export type MatchTeamStatsRow = {
  fixture_id: string
  side: 'home' | 'away'
  possession_pct: number | null
  shots_total: number | null
  shots_on: number | null
  shots_off: number | null
  shots_blocked: number | null
  shots_inside_box: number | null
  shots_outside_box: number | null
  fouls: number | null
  free_kicks: number | null
  corners: number | null
  offsides: number | null
  yellow_cards: number | null
  red_cards: number | null
  saves: number | null
  passes_total: number | null
  passes_accurate: number | null
  passes_pct: number | null
  expected_goals: number | null
  goals_prevented: number | null
}

/**
 * The provider's `type` strings, mapped to columns.
 *
 * ⚠ THIS IS A CLOSED MAP OVER AN OPEN SET, ON PURPOSE. Sampled live 2026-09-06
 * across four fixtures in two seasons, the union was these 19 — but no single
 * fixture sent all of them, and the two sets differed in three types in each
 * direction. So an unknown key here is IGNORED rather than being an error: a
 * twentieth type appearing next season must not take the fixture sync down for
 * every competition. Adding a column for it is a two-line migration.
 */
const STAT_COLUMN: Record<string, { column: keyof MatchTeamStatsRow; kind: 'int' | 'pct' | 'decimal' }> = {
  'Ball Possession':  { column: 'possession_pct',    kind: 'pct' },
  'Total Shots':      { column: 'shots_total',       kind: 'int' },
  'Shots on Goal':    { column: 'shots_on',          kind: 'int' },
  'Shots off Goal':   { column: 'shots_off',         kind: 'int' },
  'Blocked Shots':    { column: 'shots_blocked',     kind: 'int' },
  'Shots insidebox':  { column: 'shots_inside_box',  kind: 'int' },
  'Shots outsidebox': { column: 'shots_outside_box', kind: 'int' },
  'Fouls':            { column: 'fouls',             kind: 'int' },
  'Free Kicks':       { column: 'free_kicks',        kind: 'int' },
  'Corner Kicks':     { column: 'corners',           kind: 'int' },
  'Offsides':         { column: 'offsides',          kind: 'int' },
  'Yellow Cards':     { column: 'yellow_cards',      kind: 'int' },
  'Red Cards':        { column: 'red_cards',         kind: 'int' },
  'Goalkeeper Saves': { column: 'saves',             kind: 'int' },
  'Total passes':     { column: 'passes_total',      kind: 'int' },
  'Passes accurate':  { column: 'passes_accurate',   kind: 'int' },
  'Passes %':         { column: 'passes_pct',        kind: 'pct' },
  'expected_goals':   { column: 'expected_goals',    kind: 'decimal' },
  'goals_prevented':  { column: 'goals_prevented',   kind: 'decimal' },
}

/**
 * `'65%'` → 65, `'1.81'` → 1.81, `12` → 12, `null`/junk → null.
 *
 * ⚠ NULL IS PRESERVED, NEVER COERCED TO ZERO. The feed sends `Red Cards: null`
 * and `Red Cards: 0` for the same real-world state, and `expected_goals: null`
 * for a competition that does not publish xG at all. Those are different facts
 * and the screen renders them differently — a null count shows 0, a null xG row
 * is hidden. Deciding that here would throw the distinction away.
 */
function statValue(raw: number | string | null, kind: 'int' | 'pct' | 'decimal'): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null

  const trimmed = raw.trim()
  if (trimmed === '') return null
  // A percentage is the only place the feed appends a unit. `parseFloat` would
  // handle it anyway; stripping it explicitly is what makes the intent legible.
  const cleaned = (kind === 'pct' ? trimmed.replace('%', '') : trimmed).trim()
  // ⚠ THE EMPTY CHECK IS AFTER THE STRIP, NOT ONLY BEFORE IT. `Number('')` is
  // 0, not NaN — so a bare '%' with no digits would otherwise be read as 0%
  // possession, a real number nobody would question on a screen.
  if (cleaned === '') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  // Counts and percentages are whole; only xG and goals_prevented are not.
  // Rounding rather than truncating: '66.7%' is 67, not 66.
  return kind === 'decimal' ? n : Math.round(n)
}

/** An all-null row, so an absent statistic is null rather than missing. */
function emptyStatsRow(fixtureId: string, side: 'home' | 'away'): MatchTeamStatsRow {
  return {
    fixture_id: fixtureId,
    side,
    possession_pct: null, shots_total: null, shots_on: null, shots_off: null,
    shots_blocked: null, shots_inside_box: null, shots_outside_box: null,
    fouls: null, free_kicks: null, corners: null, offsides: null,
    yellow_cards: null, red_cards: null, saves: null,
    passes_total: null, passes_accurate: null, passes_pct: null,
    expected_goals: null, goals_prevented: null,
  }
}

/**
 * Both sides' statistics, as rows.
 *
 * Unknown `type` strings are skipped; absent ones stay null. A side whose
 * `statistics` array is empty still produces a row — the fixture was played and
 * the provider simply has nothing yet, which is different from the fixture not
 * being in the table at all.
 */
export function statisticsToRows(
  stats: ApiFootballTeamStatistics[],
  opts: { fixtureId: string; homeExternalTeamId: number },
): MatchTeamStatsRow[] {
  const rows: MatchTeamStatsRow[] = []

  for (const s of stats ?? []) {
    const teamId = s?.team?.id
    if (teamId === undefined || teamId === null) continue

    const row = emptyStatsRow(
      opts.fixtureId,
      teamId === opts.homeExternalTeamId ? 'home' : 'away',
    )

    for (const stat of s?.statistics ?? []) {
      const target = STAT_COLUMN[stat?.type]
      if (!target) continue
      // `as never` because the map's value type cannot narrow which of the
      // nullable-number columns this is; every target column is `number | null`.
      ;(row[target.column] as number | null) = statValue(stat?.value ?? null, target.kind)
    }

    rows.push(row)
  }

  return rows
}
