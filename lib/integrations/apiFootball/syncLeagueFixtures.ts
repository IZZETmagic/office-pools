// =============================================================
// LEAGUE FIXTURE SYNC — the league arm of /api/cron/sync-fixtures
// =============================================================
// Lives here rather than inline in the route for three reasons: the route
// imports five modules that would all need mocking to test a branch inside it;
// the World Cup per-target body must not gain a diff beyond its `if` wrapper;
// and this matches `linkKnockoutFixtures.ts` / `reconcile.ts`, which already
// live in this directory.
//
// WHAT THIS DOES NOT DO, deliberately:
//   - never writes `kickoff_at` or `original_kickoff_at`. Writing `kickoff_at`
//     makes this an indirect writer of `league_matchweeks.lock_at` (the window
//     trigger recomputes it in the same statement), which would move a
//     prediction deadline with no recoverable prior value. Rescheduling is L11.
//   - never writes `matchweek_id`. A provider round that disagrees with ours is
//     COUNTED, not applied; performing a move as DELETE+INSERT is the path into
//     the constraint abort migration 053 exists to fix. Moves are L6.
//   - never inserts an unknown provider fixture. `league_fixtures` has NOT NULL
//     FKs to `league_matchweeks` and `league_clubs` (twice) plus
//     `home_club_id <> away_club_id`, so no safe partial insert exists.
//   - no scoring, no recalculation, no pushes, no cache invalidation, no
//     realtime broadcast. League scoring is L7 and the side-effect orchestrator
//     is L8. This arm's only job is to make `league_fixtures` true.
//   - resolved no events until migration 136, and no statistics or line-ups
//     until 139. It does all three now, in 7b3/7b4/7b5, and they run on THREE
//     DIFFERENT GATES because they want three different things:
//       · events    — a goal at once, otherwise every 3rd match minute
//       · statistics— a goal at once, otherwise every 10th
//       · line-ups  — the WINDOW, because a line-up is published BEFORE a ball
//                     is kicked and nothing has "changed" yet
//     ⚠ `res.changed` alone is NOT a gate: the RPC compares the live clock, so
//     a fixture in play changes every minute. See `liveGate`. It still resolves
//     no clubs (the 20 are fixed at import).
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { invalidateLeagueSeason } from '@/lib/league/season'
import { syncLeagueStandings } from './syncLeagueStandings'
import {
  getFixtureEvents,
  getFixtureLineups,
  getFixtureStatistics,
  getFixturesAllPages,
} from './client'
import {
  EVENTS_EVERY_MINUTES,
  shouldRefetch,
  STATS_EVERY_MINUTES,
} from './liveGate'
import {
  fixtureToLeagueUpdate,
  type LeagueFixtureRow,
  type LeagueFixturePayload,
  eventsToTimeline,
  lineupsToRows,
  statisticsToRows,
} from './mappers'
import { rehomeSeason } from '@/lib/league/rehomeSeason'
import type { LeagueSyncTarget } from './syncTargets'
import type { ApiFootballFixture } from './types'

// League-specific, NOT inherited from the World Cup's 4h tail. A regular-season
// league fixture is ~115 minutes end to end; the 4h tail exists for extra time
// plus penalties in a knockout. Measured on the real 380 rows: a 2h30 tail is
// 14,548 window-minutes per season, worst day 481 — 6.4% of the measured 7,500
// requests/day plan ceiling, and comfortable to roughly a dozen leagues.
const WINDOW_BEFORE_MS = 30 * 60 * 1000
const WINDOW_AFTER_MS = 2.5 * 60 * 60 * 1000

// Catch-up: bounded so a cold start can never fan out, throttled so a fixture
// the provider never finalises is retried hourly rather than every tick.
const CATCHUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const CATCHUP_RETRY_MS = 60 * 60 * 1000
const CATCHUP_LIMIT = 10
const TERMINAL_STATUSES = ['cancelled', 'postponed']

const FEED_TIMEOUT_MS = 4_000

// ⚠ How many fixtures may be asked for a line-up in ONE tick.
//
// Bounded for the same reason `CATCHUP_LIMIT` is: this is the only arm whose
// gate is the WINDOW rather than a change, so on a Saturday with ten kickoffs
// inside half an hour it is the one place the sync could fan out. Ten
// simultaneous fixtures is the realistic worst case for one league; twelve
// leaves headroom without letting a misconfigured season run away.
const LINEUP_LIMIT = 12

// How often a feed failure for one season may enter `errors[]`.
//
// `finishRun` computes `ok: errors.length === 0` and the status panel renders
// `errors.length`, so an unrate-limited feed outage during a matchday window
// produces hundreds of red runs in a day — inside which a real World Cup error
// is invisible. This is alarm-fatigue control, not error suppression: a
// suppressed failure still sets `feedError`, still prints `feed_error` in the
// run note, and is still logged with its full message.
const FEED_ERROR_REPORT_INTERVAL_MS = 15 * 60 * 1000

const PROJECTION =
  'fixture_id, matchweek_id, external_fixture_id, kickoff_at, status, status_detail, ' +
  'home_goals, away_goals, is_completed, live_minute, live_period, live_added, manual_override, ' +
  // L11 — the mapper needs it to tell a FIRST move from a later one.
  'original_kickoff_at'

export type LeagueSyncResult = {
  seasonId: string
  name: string
  /** Rows in the live window this tick. */
  window: number
  /** Stray rows pulled in by the catch-up pass. */
  stale: number
  /** api-football HTTP calls this arm made. One of the three non-vacuity proofs. */
  apiCalls: number
  /** Provider fixtures the feed returned. */
  fetched: number
  /** Our rows the RPC stamped `last_synced_at` on, changed or not. */
  seen: number
  /** Rows we computed a diff for and asked the database to write. */
  proposed: number
  /** Rows whose values the database actually changed. */
  written: number
  /** Fixtures that completed this tick and were scored. */
  scored: number
  /** `/fixtures/events` calls made this tick — one per changed fixture. */
  timelineCalls: number
  /** Event rows written across all fixtures this tick. */
  timelineRows: number
  /** `/fixtures/statistics` calls made this tick — one per changed fixture. */
  statsCalls: number
  /** Team-stat rows written across all fixtures this tick (two per fixture). */
  statsRows: number
  /** `/fixtures/lineups` calls made this tick. See 7b5 for why this gate differs. */
  lineupCalls: number
  /** Line-up rows written across all fixtures this tick (two per fixture). */
  lineupRows: number
  /** Entries whose league totals moved as a result. */
  scoredEntries: number
  /** Standings rows re-ingested this tick, if a fixture finished. */
  standings: number
  /** Table-mode pools rescored because the league table moved. */
  tablePoolsScored: number
  /** True on the tick that froze the finishing table for the season. */
  standingsFinalised: boolean
  skippedManual: number
  /** Our rows with no provider fixture this tick. */
  unmatched: number
  /** Provider fixtures matching no fixture of ours anywhere in the season. */
  unknownProvider: number
  roundMismatch: number
  roundUnknown: number
  rescheduleDetected: number
  /**
   * How many of those the DATABASE actually moved — read back from the RPC, not
   * counted from what we sent. The two differ whenever a guard fires: a
   * completed fixture and a manual_override row are both refused in SQL, and
   * counting the ask would report a move that never happened.
   */
  rescheduleApplied: number
  /** Fixtures moved to a different matchweek because their kickoff moved. */
  rehomed: number
  awarded: number
  finalWithoutGoals: number
  fetchedFeed: boolean
  /** The feed failure message this tick, if any — set whether or not it was reported. */
  feedError: string | null
  /** Whether `feedError` was allowed into `errors[]` this tick (see the interval above). */
  feedErrorReported: boolean
  errors: Array<{ stage: string; message: string; details?: unknown }>
}

/**
 * YYYY-MM-DD in UTC.
 *
 * Duplicated deliberately: the route has the same four lines but they are
 * module-private there, and L3 must not widen the route's diff to export them.
 */
function isoDateUTC(d: Date): string {
  return (
    `${d.getUTCFullYear()}-` +
    `${String(d.getUTCMonth() + 1).padStart(2, '0')}-` +
    `${String(d.getUTCDate()).padStart(2, '0')}`
  )
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function emptyResult(target: LeagueSyncTarget): LeagueSyncResult {
  return {
    seasonId: target.seasonId,
    name: target.name,
    window: 0,
    stale: 0,
    apiCalls: 0,
    fetched: 0,
    seen: 0,
    proposed: 0,
    written: 0,
    scored: 0,
    timelineCalls: 0,
    statsCalls: 0,
    statsRows: 0,
    lineupCalls: 0,
    lineupRows: 0,
    timelineRows: 0,
    scoredEntries: 0,
    standings: 0,
    tablePoolsScored: 0,
    standingsFinalised: false,
    skippedManual: 0,
    unmatched: 0,
    unknownProvider: 0,
    roundMismatch: 0,
    roundUnknown: 0,
    rescheduleDetected: 0,
    rescheduleApplied: 0,
    rehomed: 0,
    awarded: 0,
    finalWithoutGoals: 0,
    fetchedFeed: false,
    feedError: null,
    feedErrorReported: false,
    errors: [],
  }
}

/**
 * May this season's feed failure enter `errors[]` this tick?
 *
 * Keyed PER SEASON — `league_feed_last_error:<season_id>`. It must never reuse
 * the global `knockout_link_last_attempt` key: a league arm stamping that would
 * silently disable World Cup knockout auto-linking for 15 minutes at a time,
 * forever.
 *
 * Fails OPEN. If `sync_settings` cannot be read or written, the failure is
 * reported — an unreadable rate-limiter must not become a way to lose errors.
 *
 * The stamp is deliberately NOT cleared on a successful tick. Clearing it would
 * cost a read on every healthy run to save at most one duplicate report after a
 * recovery, and the cost of that trade is one extra quiet interval, not a lost
 * error.
 */
async function shouldReportFeedError(
  admin: SupabaseClient,
  seasonId: string,
  opts: { now: number; nowIso: string },
): Promise<boolean> {
  const key = `league_feed_last_error:${seasonId}`
  const { data, error } = await admin
    .from('sync_settings')
    .select('setting_value')
    .eq('setting_key', key)
    .maybeSingle()
  if (error) return true

  const raw = data?.setting_value
  const last = typeof raw === 'string' ? Date.parse(raw) : 0
  if (Number.isFinite(last) && last > 0 && opts.now - last < FEED_ERROR_REPORT_INTERVAL_MS) {
    return false
  }

  const { error: stampErr } = await admin
    .from('sync_settings')
    .upsert(
      { setting_key: key, setting_value: opts.nowIso, updated_at: opts.nowIso },
      { onConflict: 'setting_key' },
    )
  if (stampErr) return true
  return true
}

/**
 * Sync one league season's fixtures from api-football.
 *
 * **This function never throws.** Every failure lands in `result.errors`. A
 * throw from inside the route's target loop would abandon the remaining
 * competitions and, worse, produce a 500 with no `sync_runs` row at all — so
 * the run would be invisible rather than merely failed.
 */
export async function syncLeagueFixtures(
  admin: SupabaseClient,
  target: LeagueSyncTarget,
  opts: { now: number; nowIso: string },
): Promise<LeagueSyncResult> {
  const result = emptyResult(target)
  const push = (stage: string, message: string, details?: unknown) =>
    result.errors.push({ stage, message, details })

  // ---------------------------------------------------------------- 1. window
  // Windowed SERVER-SIDE. The World Cup arm pulls every match and filters in
  // JS; the league arm must not, because 380 rows/season × N seasons crosses
  // the 1,000-row PostgREST cap and that truncation is silent.
  const windowFrom = new Date(opts.now - WINDOW_AFTER_MS).toISOString()
  const windowTo = new Date(opts.now + WINDOW_BEFORE_MS).toISOString()

  const { data: windowRows, error: winErr } = await admin
    .from('league_fixtures')
    .select(PROJECTION)
    .eq('season_id', target.seasonId)
    .gte('kickoff_at', windowFrom)
    .lte('kickoff_at', windowTo)
    .order('kickoff_at', { ascending: true })
  if (winErr) {
    push('league_fetch_fixtures', winErr.message, { season_id: target.seasonId })
    return result
  }

  // -------------------------------------------------------------- 1b. catchup
  // Without this the arm cannot recover from any cron gap longer than the
  // window: a fixture that kicked off during the gap leaves the window and can
  // never re-enter, so it is stranded at `scheduled / NULL goals` forever with
  // `window=0`, `errors: []`, `ok: true` — the codebase's signature failure.
  const { data: strayRows, error: strayErr } = await admin
    .from('league_fixtures')
    .select(PROJECTION)
    .eq('season_id', target.seasonId)
    .eq('is_completed', false)
    .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)
    .lt('kickoff_at', windowFrom)
    .gt('kickoff_at', new Date(opts.now - CATCHUP_MAX_AGE_MS).toISOString())
    .or(
      `last_synced_at.is.null,last_synced_at.lt.${new Date(opts.now - CATCHUP_RETRY_MS).toISOString()}`,
    )
    .order('kickoff_at', { ascending: true })
    .limit(CATCHUP_LIMIT)
  if (strayErr) {
    push('league_fetch_fixtures', strayErr.message, {
      season_id: target.seasonId,
      pass: 'catchup',
    })
  }

  const rows = [...(windowRows ?? []), ...(strayRows ?? [])] as unknown as LeagueFixtureRow[]
  // ⚠ CAPTURED BEFORE THE RPC WRITES. `res.changed` is the POST state, so the
  // only way to tell a goal from the clock ticking is to hold what we had.
  const priorByFixture = new Map(
    rows.map((r) => [
      r.fixture_id,
      { status: r.status, home_goals: r.home_goals, away_goals: r.away_goals },
    ]),
  )
  result.window = windowRows?.length ?? 0
  result.stale = strayRows?.length ?? 0

  // ------------------------------------------------------------ 2. cheap exit
  // The between-matchday case: one index seek on idx_league_fixtures_season and
  // no provider call at all.
  if (rows.length === 0) return result

  // -------------------------------------------------------- 3. one feed call
  // Day-granularity from/to covers the midnight straddle in ONE call, unlike
  // the World Cup arm's per-fixture getFixtureById fallback.
  const earliest = Math.min(...rows.map((r) => Date.parse(r.kickoff_at)))
  const from = isoDateUTC(new Date(Math.min(earliest, opts.now - WINDOW_AFTER_MS)))
  const to = isoDateUTC(new Date(opts.now + WINDOW_BEFORE_MS))

  let feed: ApiFootballFixture[] = []
  try {
    const { fixtures, calls } = await getFixturesAllPages(
      { league: target.league, season: target.season, from, to },
      { strict: true, timeoutMs: FEED_TIMEOUT_MS },
    )
    feed = fixtures
    result.apiCalls = calls
    result.fetched = fixtures.length
    result.fetchedFeed = true
  } catch (e) {
    // The failure is ALWAYS recorded on the result and always logged. Only its
    // entry into `errors[]` — which flips the run to ok:false — is rate limited.
    result.feedError = errMsg(e)
    result.feedErrorReported = await shouldReportFeedError(admin, target.seasonId, opts)
    if (result.feedErrorReported) {
      push('league_fetch_feed', result.feedError, { season_id: target.seasonId, from, to })
    } else {
      console.error(
        `[league-sync] ${target.name}: feed failed (not re-reported within ` +
          `${FEED_ERROR_REPORT_INTERVAL_MS / 60000}m): ${result.feedError}`,
      )
    }
    return result
  }

  // ------------------------------------------------------ 4. matchweek lookup
  // Resolution is by `provider_round` VERBATIM against the UNIQUE
  // (season_id, provider_round), which exists precisely so that
  // "Championship Group - 34" cannot be filed as matchweek 34. Never parse the
  // ordinal; never auto-create a matchweek.
  const matchweekIdByProviderRound = new Map<string, string>()
  const { data: mws, error: mwErr } = await admin
    .from('league_matchweeks')
    .select('matchweek_id, provider_round')
    .eq('season_id', target.seasonId)
    .range(0, 999)
  if (mwErr) {
    push('league_fetch_fixtures', `matchweek map: ${mwErr.message}`, {
      season_id: target.seasonId,
    })
  }
  for (const m of (mws ?? []) as Array<{ matchweek_id: string; provider_round: string }>) {
    matchweekIdByProviderRound.set(m.provider_round, m.matchweek_id)
  }

  // ------------------------------------------- 5. unknown provider fixtures
  // Counted against the SEASON, not the window. `from`/`to` are whole days
  // while `rows` is a ~3-hour window, so counting against the window makes this
  // non-zero on a perfectly healthy tick — and a counter that is permanently
  // non-zero is a counter nobody reads.
  const { data: allIds, error: idErr } = await admin
    .from('league_fixtures')
    .select('external_fixture_id')
    .eq('season_id', target.seasonId)
    .range(0, 999)
  if (idErr) {
    push('league_fetch_fixtures', `season id set: ${idErr.message}`, {
      season_id: target.seasonId,
    })
  }
  const seasonIds = new Set(
    ((allIds ?? []) as Array<{ external_fixture_id: string }>).map((r) => r.external_fixture_id),
  )
  const byExt = new Map(feed.map((f) => [String(f.fixture.id), f]))
  for (const f of feed) {
    if (!seasonIds.has(String(f.fixture.id))) result.unknownProvider++
  }

  // ------------------------------------------------------- 6. per-row diff
  const payload: LeagueFixturePayload[] = []
  /** externalId -> the kickoff we ASKED for, so 7a can check the database agreed. */
  const moveAsked = new Map<string, string>()
  const seenIds: string[] = []
  let firstUnknownRound: string | null = null

  for (const r of rows) {
    if (r.manual_override) {
      result.skippedManual++
      continue
    }
    const fx = byExt.get(r.external_fixture_id)
    if (!fx) {
      result.unmatched++
      continue
    }
    seenIds.push(r.external_fixture_id)

    const wantedMw = matchweekIdByProviderRound.get(fx.league.round)
    if (wantedMw === undefined) {
      // Silently ignoring this was the bug: `round_mismatch=0` would print on a
      // totally broken lookup and read as "all rounds verified".
      result.roundUnknown++
      if (firstUnknownRound === null) firstUnknownRound = fx.league.round
    } else if (wantedMw !== r.matchweek_id) {
      // DETECT ONLY. Performing the move is L6.
      result.roundMismatch++
    }

    const { payload: p, flags } = fixtureToLeagueUpdate(fx, r)
    if (flags.finalWithoutGoals) result.finalWithoutGoals++
    if (flags.awarded) result.awarded++
    if (flags.rescheduled) result.rescheduleDetected++
    if (p?.set_kickoff && p.kickoff_at) moveAsked.set(p.external_fixture_id, p.kickoff_at)
    if (p) payload.push(p)
  }
  result.proposed = payload.length

  // Every lookup missing is a vocabulary break, not a fixture problem.
  if (result.roundUnknown > 0 && result.roundUnknown === seenIds.length) {
    push(
      'league_fetch_feed',
      `every provider round is unknown to us (e.g. '${firstUnknownRound ?? '?'}') — the round ` +
        `vocabulary changed; round checking is OFF this tick`,
      { season_id: target.seasonId },
    )
  }

  // -------------------------------------------------- 7. one set-based write
  if (seenIds.length === 0 && payload.length === 0) return result

  const { data: applied, error: rpcErr } = await admin.rpc('league_apply_fixture_sync', {
    p_season_id: target.seasonId,
    p_seen: seenIds,
    p_rows: payload,
    p_now: opts.nowIso,
  })
  if (rpcErr) {
    push('league_apply', rpcErr.message, {
      season_id: target.seasonId,
      proposed: payload.length,
    })
    return result
  }

  const res = (applied ?? { seen: 0, changed: [] }) as {
    seen: number
    changed: Array<{
      fixture_id: string
      external_fixture_id: string
      status: string
      home_goals: number | null
      away_goals: number | null
      is_completed: boolean
      kickoff_at: string | null
    }>
  }
  result.seen = res.seen ?? 0
  result.written = res.changed?.length ?? 0

  // ------------------------------------------------ 6b. the season cache
  // ⚠ OFF `changed`, NEVER A TIMER. `league_apply_fixture_sync` already returns
  // exactly which fixtures the database moved, and that array is the only
  // honest invalidation signal we have: a TTL long enough to be worth having
  // would serve a 0–0 through a goal, and the live-standings guarantee is the
  // one thing this product does not get to be late about.
  //
  // One tag per SEASON, so a single goal refreshes every pool playing it at
  // once rather than per pool — Decision 12, and the reason the season is the
  // cacheable object where the pool payload is not.
  //
  // Placed here, before the scoring and standings work below, so a failure in
  // either cannot leave a stale season behind. `invalidateLeagueSeason` swallows
  // its own errors: losing a fixture write to protect a cache would be exactly
  // the wrong way round.
  if ((res.changed?.length ?? 0) > 0) {
    invalidateLeagueSeason(target.seasonId)
  }

  // ------------------------------------------------- 7a. reschedules confirmed
  // A move is only real once the row comes back carrying it. Both SQL guards —
  // completed, and manual_override — drop the write without erroring, which is
  // correct behaviour and silent by design; this is the line that keeps it from
  // also being invisible.
  for (const c of res.changed ?? []) {
    const asked = moveAsked.get(c.external_fixture_id)
    if (asked && c.kickoff_at && Date.parse(c.kickoff_at) === Date.parse(asked)) {
      result.rescheduleApplied++
    }
  }

  // ------------------------------------------------------------- 7b. score
  // A fixture whose score MOVED is scored immediately, in the same tick that
  // observed it — including while it is still being played. `changed` carries
  // the POST-state, so the values here are what the database now holds, not
  // what the feed reported.
  //
  // ⚠ This used to skip anything not completed. Migration 063 opened the
  // engine's gate so a live fixture scores too, which is the whole in-match
  // feature: the leaderboard moves on the goal, not at the whistle.
  //
  // Because the loop is over `changed` — fixtures whose values actually moved
  // this tick — a live match costs ONE re-score per goal, not one per minute.
  //
  // The only local filter is "do we have a score at all". The status rule
  // (live/completed score, postponed/cancelled never do) is deliberately NOT
  // duplicated here: it lives in the engine, which refuses and says why. Two
  // copies of that rule would be two things to keep in step, and the engine is
  // the one that cannot be bypassed.
  //
  // Per fixture rather than per matchweek: the RPC recomputes each affected
  // entry's totals from its score rows, so scoring one fixture is complete and
  // correct on its own — and a matchweek's ten fixtures rarely finish together.
  //
  // A scoring failure is an ERROR but never stops the loop: the fixture data is
  // already written and correct, and league_score_fixture is idempotent, so the
  // next tick that sees a change will score it. Losing the sync over a scoring
  // problem would be the worse trade.
  for (const c of res.changed ?? []) {
    if (c.home_goals === null || c.away_goals === null) continue
    const { data: scoreRes, error: scoreErr } = await admin.rpc('league_score_fixture', {
      p_fixture_id: c.fixture_id,
    })
    if (scoreErr) {
      push('league_score', scoreErr.message, { fixture_id: c.fixture_id })
      continue
    }
    const sr = scoreRes as { ok?: boolean; scored?: number; entries?: number; reason?: string } | null
    if (!sr?.ok) {
      // Not an error. Two ordinary cases reach here: a fixture reported
      // completed a tick before its goals land, and a postponed or cancelled
      // fixture that still carries a score — the engine refuses both and names
      // which in `reason`. The next tick picks up anything real.
      continue
    }
    result.scored++
    result.scoredEntries += sr.entries ?? 0
  }

  // ------------------------------------------------------- 7b3. the timeline
  // Goals, cards, VAR reversals and substitutions, plus the referee and the
  // half-time score — everything the Facts tab draws that is not the scoreline.
  //
  // ⚠⚠ GATED TWICE, AND THE SECOND GATE IS THE IMPORTANT ONE. `res.changed`
  // sounds like "something happened" and is not: the RPC compares eight columns
  // and three of them are the LIVE CLOCK, so a fixture in play is "changed"
  // every single minute. This arm's original comment claimed it cost "ONE call
  // per goal, card or status change" and contrasted that with "one call per
  // in-window minute per live fixture" — it was describing the behaviour it was
  // meant to have, not the one it had. Measured out, a five-league Saturday
  // came to ~9,600 calls against the 7,500/day plan the fixture sync itself
  // depends on.
  //
  // `shouldRefetch` is the real gate: immediate on a goal, on a status change
  // and on the completion tick, and otherwise only every third minute of the
  // match clock. About 100 calls a fixture becomes about 30, and a card
  // surfaces within three minutes rather than one. See `liveGate` for why it
  // needs no stored state and no migration.
  //
  // ⚠ THE COMPLETION TICK IS NOT REDUNDANT. A VAR-disallowed goal that restores
  // the previous score changes nothing on `league_fixtures`, so it produces NO
  // `changed` row of its own and the timeline would keep a goal that never
  // stood. `is_completed` flips exactly once per fixture, so it is one call.
  //
  // A failure is an ERROR but never stops the loop or the sync: the fixture
  // data is already written and correct, and a missing timeline is a blank card
  // rather than a wrong one. The next change re-fetches from scratch.
  for (const c of res.changed ?? []) {
    const fx = byExt.get(c.external_fixture_id)
    if (!fx) continue

    const prior = priorByFixture.get(c.fixture_id)
    const gate = {
      priorStatus: prior?.status ?? null,
      priorHomeGoals: prior?.home_goals ?? null,
      priorAwayGoals: prior?.away_goals ?? null,
      status: c.status,
      homeGoals: c.home_goals,
      awayGoals: c.away_goals,
      isCompleted: c.is_completed,
      elapsed: fx.fixture.status.elapsed,
    }
    if (!shouldRefetch(gate, EVENTS_EVERY_MINUTES)) continue

    try {
      const evts = await getFixtureEvents(fx.fixture.id)
      result.timelineCalls++

      const timeline = eventsToTimeline(evts, {
        fixtureId: c.fixture_id,
        homeExternalTeamId: fx.teams.home.id,
      })

      // ⚠ REPLACE-ALL, NEVER UPSERT. api-football gives an event no stable id,
      // and a VAR reversal REMOVES it from the payload rather than marking it —
      // so an upsert leaves a disallowed goal on the screen permanently. The
      // set is a handful of rows; deleting and re-inserting is cheaper than any
      // scheme for working out what vanished.
      const { error: delErr } = await admin
        .from('match_events')
        .delete()
        .eq('fixture_id', c.fixture_id)
      if (delErr) {
        push('league_timeline', delErr.message, { fixture_id: c.fixture_id })
        continue
      }
      if (timeline.length > 0) {
        const { error: insErr } = await admin.from('match_events').insert(timeline)
        if (insErr) {
          push('league_timeline', insErr.message, { fixture_id: c.fixture_id })
          continue
        }
        result.timelineRows += timeline.length
      }

      // ⚠ THE HALF-TIME PAIR IS WRITTEN AS A PAIR. `league_fixtures_ht_pair_ck`
      // refuses `{1, null}`, and mappers.ts records that diffing each side
      // alone is exactly what raises 23514 in production the first time the
      // provider reports a half-written score. Both or neither, decided here.
      //
      // Written on this step rather than threaded through
      // `league_apply_fixture_sync` deliberately: that RPC is a live set-based
      // function, and replacing it would mean the full md5(prosrc) ritual for
      // three display-only columns.
      const ht = fx.score?.halftime
      const htPair =
        ht && ht.home !== null && ht.away !== null
          ? { home_goals_ht: ht.home, away_goals_ht: ht.away }
          : {}
      const referee = fx.fixture.referee ?? null
      if (referee !== null || Object.keys(htPair).length > 0) {
        const { error: metaErr } = await admin
          .from('league_fixtures')
          .update({ ...(referee !== null ? { referee } : {}), ...htPair })
          .eq('fixture_id', c.fixture_id)
        if (metaErr) push('league_timeline', metaErr.message, { fixture_id: c.fixture_id })
      }
    } catch (e) {
      push('league_timeline', e instanceof Error ? e.message : String(e), {
        fixture_id: c.fixture_id,
      })
    }
  }

  // ---------------------------------------------------- 7b4. team statistics
  // Possession, shots, corners, cards — the Statistics tab.
  //
  // ⚠ THE SAME GATE AS 7b3, AND THE SAME ARGUMENT. `/fixtures/statistics` is a
  // call PER FIXTURE, so it rides `res.changed` rather than the window: one
  // call per goal, card or status change, plus the one when `is_completed`
  // flips. Fetching per tick instead would roughly double 7b3's rejected
  // 1,500-2,500 calls on a full matchday.
  //
  // ⚠ SO IT IS APPROXIMATE WHILE THE GAME IS ON, AND EXACT WHEN IT ENDS, and
  // that is a deliberate trade rather than an oversight. Possession drifts
  // continuously and produces no `changed` row, so a live figure here can be a
  // few minutes stale. The completion tick reconciles every number to the
  // provider's final set, which is the one people come back to read.
  //
  // A SEPARATE LOOP FROM 7b3, on purpose: a statistics failure must not cost
  // the fixture its timeline, and the two carry different error stages so the
  // status panel can tell them apart.
  for (const c of res.changed ?? []) {
    const fx = byExt.get(c.external_fixture_id)
    if (!fx) continue

    const prior = priorByFixture.get(c.fixture_id)
    const gate = {
      priorStatus: prior?.status ?? null,
      priorHomeGoals: prior?.home_goals ?? null,
      priorAwayGoals: prior?.away_goals ?? null,
      status: c.status,
      homeGoals: c.home_goals,
      awayGoals: c.away_goals,
      isCompleted: c.is_completed,
      elapsed: fx.fixture.status.elapsed,
    }
    if (!shouldRefetch(gate, STATS_EVERY_MINUTES)) continue

    try {
      const stats = await getFixtureStatistics(fx.fixture.id)
      result.statsCalls++

      const rows = statisticsToRows(stats, {
        fixtureId: c.fixture_id,
        homeExternalTeamId: fx.teams.home.id,
      })

      // ⚠ REPLACE-ALL, AS 7b3. The provider revises these mid-match and an
      // upsert would need a stable key per (fixture, side) plus a diff of
      // nineteen nullable columns to work out what it revised. Two rows.
      const { error: delErr } = await admin
        .from('match_team_stats')
        .delete()
        .eq('fixture_id', c.fixture_id)
      if (delErr) {
        push('league_stats', delErr.message, { fixture_id: c.fixture_id })
        continue
      }
      if (rows.length > 0) {
        const { error: insErr } = await admin.from('match_team_stats').insert(rows)
        if (insErr) {
          push('league_stats', insErr.message, { fixture_id: c.fixture_id })
          continue
        }
        result.statsRows += rows.length
      }
    } catch (e) {
      push('league_stats', e instanceof Error ? e.message : String(e), {
        fixture_id: c.fixture_id,
      })
    }
  }

  // ------------------------------------------------------------- 7b5. line-ups
  // Both starting elevens, the benches, the formations and the two coaches.
  //
  // ⚠⚠ THIS ONE CANNOT RIDE `res.changed`, AND THAT IS THE WHOLE POINT OF ITS
  // BEING A SEPARATE SECTION. A line-up is published roughly an hour BEFORE
  // kickoff, when the fixture is still `scheduled` with null goals — so nothing
  // about it has changed, `changed` is empty, and a `changed`-gated fetch would
  // never fire until the first goal went in. The Line-ups tab would then be
  // empty for exactly the ninety minutes before kickoff when people look at it.
  //
  // So the gate is: IN THE WINDOW, AND WE DO NOT ALREADY HOLD ONE. Which makes
  // the cost shape different from 7b3's and worth stating plainly:
  //
  //   · the window opens 30 minutes before kickoff (`WINDOW_BEFORE_MS`), by
  //     which time the feed has usually published — so the ordinary case is ONE
  //     call per fixture, ever;
  //   · while the feed has not published, it is one call per fixture per tick,
  //     which is why `LINEUP_LIMIT` bounds the tick and why an empty response
  //     writes NOTHING (writing an empty line-up would end the retries and
  //     leave the tab permanently blank);
  //   · plus one more when the fixture completes, because a published XI is
  //     revised often enough to be worth reconciling once, exactly as 7b3 does
  //     for a VAR reversal.
  //
  // ⚠ We do not widen `WINDOW_BEFORE_MS` to catch line-ups earlier. That
  // constant governs which fixtures the WHOLE arm reads and re-syncs every
  // minute; moving it for a display-only tab would change the sync's cost
  // profile for every competition. Thirty minutes of line-up is enough.
  //
  // A failure never stops the loop or the sync: the fixture is already correct
  // and a missing line-up is a tab that says so.
  {
    // Which of the window's fixtures we already hold a line-up for. One indexed
    // read per tick, so the arm can ask only for what is genuinely missing
    // rather than re-fetching a published XI every minute until kickoff.
    const completedNow = new Set(
      (res.changed ?? []).filter((c) => c.is_completed).map((c) => c.fixture_id),
    )
    const candidates = (windowRows ?? []) as unknown as LeagueFixtureRow[]

    let held = new Set<string>()
    if (candidates.length > 0) {
      const { data: haveRows, error: haveErr } = await admin
        .from('match_lineups')
        .select('fixture_id')
        .in('fixture_id', candidates.map((r) => r.fixture_id))
      if (haveErr) {
        // Not fatal, but it must not be silent: without this read the arm
        // cannot tell "not published yet" from "already stored", and would
        // re-fetch every window fixture every tick.
        push('league_lineups', haveErr.message, { season_id: target.seasonId })
        held = new Set(candidates.map((r) => r.fixture_id))
      } else {
        held = new Set(((haveRows ?? []) as { fixture_id: string }[]).map((r) => r.fixture_id))
      }
    }

    let attempted = 0
    for (const row of candidates) {
      if (attempted >= LINEUP_LIMIT) break
      // Held already and not just finished — nothing to ask.
      if (held.has(row.fixture_id) && !completedNow.has(row.fixture_id)) continue

      const fx = byExt.get(row.external_fixture_id)
      if (!fx) continue

      try {
        const lineups = await getFixtureLineups(fx.fixture.id)
        result.lineupCalls++
        attempted++

        const rows = lineupsToRows(lineups, {
          fixtureId: row.fixture_id,
          homeExternalTeamId: fx.teams.home.id,
        })

        // ⚠ AN EMPTY PAYLOAD WRITES NOTHING AND IS NOT AN ERROR. It is the
        // ordinary answer before the feed publishes, and the next tick asks
        // again. Deleting here would also throw away a line-up we already hold
        // on the completion pass, if the provider happened to answer empty.
        if (rows.length === 0) continue

        const { error: delErr } = await admin
          .from('match_lineups')
          .delete()
          .eq('fixture_id', row.fixture_id)
        if (delErr) {
          push('league_lineups', delErr.message, { fixture_id: row.fixture_id })
          continue
        }
        const { error: insErr } = await admin.from('match_lineups').insert(rows)
        if (insErr) {
          push('league_lineups', insErr.message, { fixture_id: row.fixture_id })
          continue
        }
        result.lineupRows += rows.length
      } catch (e) {
        push('league_lineups', e instanceof Error ? e.message : String(e), {
          fixture_id: row.fixture_id,
        })
      }
    }
  }

  // ------------------------------------------------------------ 7b2. re-home
  // Our matchweeks are PICKING rounds, so a fixture that just moved may now
  // belong to a different one — Decision 10, and the policy lives in
  // lib/league/rehome.ts where three real seasons can be replayed over it.
  //
  // Gated on a move having ACTUALLY landed rather than merely being proposed,
  // because this is the one step in the sync that reads the whole season. A
  // reschedule happens a handful of times a year; the other 500,000 ticks skip
  // it entirely.
  //
  // A failure is an ERROR but never fails the sync, on the same trade as
  // scoring: the fixture data is already correct, and the next move re-plans
  // from scratch — the planner reads current state and holds nothing.
  if (result.rescheduleApplied > 0) {
    try {
      result.rehomed = await rehomeSeason(admin, target.seasonId, push)
    } catch (e) {
      push('league_rehome', e instanceof Error ? e.message : String(e))
    }
  }

  // ---------------------------------------------------------- 7c. standings
  // The real league table, re-read ONLY when a fixture actually finished this
  // tick. Nothing else can move it, so polling it on a timer would spend the
  // api-football allowance re-reading a number that had not changed.
  //
  // Ingested rather than derived because a table computed from our own fixtures
  // cannot see points deductions, and Table mode scores against it — plan §0.3.
  //
  // A failure here is an ERROR but never fails the sync: the fixture data is
  // already written and correct, and a stale table for one tick is a display
  // problem, whereas losing the fixture sync is a scoring one.
  if (res.changed?.some((c) => c.is_completed)) {
    const st = await syncLeagueStandings(admin, {
      seasonId: target.seasonId,
      externalLeagueId: target.league,
      externalSeason: target.season,
    })
    if (st.error) {
      push('league_standings', st.error)
    } else {
      result.standings = st.written
    }
    // A club in the feed with no row of ours means the season was imported
    // against a different club set — the table would render with holes, so it
    // is surfaced rather than dropped.
    for (const u of st.unmapped) {
      push('league_standings', `feed club ${u.externalId} (${u.name}) has no league_clubs row`)
    }

    // ------------------------------------------------------- 7d. Table mode
    // The table just moved, so every Table-mode pool in this season is now
    // worth a different number of points. Scored HERE rather than on a timer
    // for the same reason the standings are read here: the table moving is the
    // only event that changes a table score.
    //
    // One RPC does both halves. It snapshots the finishing table FIRST if this
    // was the tick that ended the season — so a pool is paid out against the
    // frozen table rather than a live third-party read that a June correction
    // could still move — and then rescores.
    //
    // Same failure posture as the standings read above: an error, never fatal.
    // A stale table score for one tick is a display problem; losing the fixture
    // sync is a scoring one.
    if (!st.error) {
      const { data: tableRes, error: tableErr } = await admin.rpc(
        'league_after_standings_change',
        { p_season_id: target.seasonId },
      )
      if (tableErr) {
        push('league_table_mode', tableErr.message)
      } else {
        const r = (tableRes ?? {}) as { pools_scored?: number; snapshot?: { final?: boolean } }
        result.tablePoolsScored = r.pools_scored ?? 0
        if (r.snapshot?.final) result.standingsFinalised = true
      }
    }
  }

  // ------------------------------------------------------------ 8. reconcile
  // `manual_override` is enforced in BOTH TypeScript and SQL, so a shortfall
  // means either an admin flipped it between the read and the write (benign,
  // and now visible) or the mapper computed a diff the database did not agree
  // was one — a cast or mapping bug. Because the RPC's UPDATE is
  // IS DISTINCT FROM-guarded, this detects VALUES NOT APPLIED rather than
  // merely rows not matched.
  if (result.written !== result.proposed) {
    push(
      'league_write_shortfall',
      `asked to write ${result.proposed} fixture(s), the database changed ${result.written}`,
      { season_id: target.seasonId, missing: result.proposed - result.written },
    )
  }

  return result
}

/**
 * The run-note parts for one league target.
 *
 * The nine-value health vector is emitted ALWAYS, so it is greppable and
 * diffable on every run; the six diagnostics appear only when non-zero, so
 * their presence is itself the signal.
 *
 * Emitting a segment on quiet ticks is the point. `window=0` means there was
 * nothing to do; `window=6 changed=0` means it looked and found nothing; an
 * ABSENT segment means the arm never ran at all. Without a segment on quiet
 * ticks those three are the same observation — which is the shape of every
 * sweep bug in this codebase.
 */
export function formatLeagueNoteParts(r: LeagueSyncResult): string[] {
  const always = [
    `window=${r.window}`,
    `stale=${r.stale}`,
    `calls=${r.apiCalls}`,
    `fetched=${r.fetched}`,
    `seen=${r.seen}`,
    `changed=${r.written}`,
    `scored=${r.scored}`,
    // Only when it did something — a permanently-zero counter is one nobody reads.
    ...(r.timelineCalls > 0 ? [`timeline=${r.timelineRows}/${r.timelineCalls}`] : []),
    // Same rule, and both are rows/calls so a call that wrote nothing is
    // visible as `0/1` rather than vanishing. For line-ups that is the ordinary
    // pre-publication answer, and being able to see it is how you tell "the
    // feed has not published yet" from "the arm never looked".
    ...(r.statsCalls > 0 ? [`stats=${r.statsRows}/${r.statsCalls}`] : []),
    ...(r.lineupCalls > 0 ? [`lineups=${r.lineupRows}/${r.lineupCalls}`] : []),
    `manual=${r.skippedManual}`,
    `unmatched=${r.unmatched}`,
    `unknown=${r.unknownProvider}`,
  ]
  const whenNonZero = [
    r.roundMismatch > 0 ? `round_mismatch=${r.roundMismatch}` : null,
    r.roundUnknown > 0 ? `round_unknown=${r.roundUnknown}` : null,
    r.rescheduleDetected > 0
      ? `resched=${r.rescheduleDetected}/${r.rescheduleApplied}`
      : null,
    r.rehomed > 0 ? `rehomed=${r.rehomed}` : null,
    r.awarded > 0 ? `awarded=${r.awarded}` : null,
    r.finalWithoutGoals > 0 ? `ft_no_goals=${r.finalWithoutGoals}` : null,
    r.scoredEntries > 0 ? `pts_entries=${r.scoredEntries}` : null,
    // From `feedError`, NOT from `errors[]` — a rate-limited failure must still
    // be visible in the note, otherwise the limiter hides the outage itself.
    r.feedError !== null ? 'feed_error' : null,
  ].filter((x): x is string => x !== null)
  return [...always, ...whenNonZero]
}
