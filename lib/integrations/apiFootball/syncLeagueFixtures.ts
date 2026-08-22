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
//   - resolves no clubs (the 20 are fixed at import) and fetches no events
//     (there is no league conduct table; it would be pure quota burn).
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { getFixturesAllPages } from './client'
import {
  fixtureToLeagueUpdate,
  type LeagueFixtureRow,
  type LeagueFixturePayload,
} from './mappers'
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
  'home_goals, away_goals, is_completed, live_minute, live_period, live_added, manual_override'

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
  skippedManual: number
  /** Our rows with no provider fixture this tick. */
  unmatched: number
  /** Provider fixtures matching no fixture of ours anywhere in the season. */
  unknownProvider: number
  roundMismatch: number
  roundUnknown: number
  rescheduleDetected: number
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
    skippedManual: 0,
    unmatched: 0,
    unknownProvider: 0,
    roundMismatch: 0,
    roundUnknown: 0,
    rescheduleDetected: 0,
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
      external_fixture_id: string
      status: string
      home_goals: number | null
      away_goals: number | null
      is_completed: boolean
    }>
  }
  result.seen = res.seen ?? 0
  result.written = res.changed?.length ?? 0

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
    `manual=${r.skippedManual}`,
    `unmatched=${r.unmatched}`,
    `unknown=${r.unknownProvider}`,
  ]
  const whenNonZero = [
    r.roundMismatch > 0 ? `round_mismatch=${r.roundMismatch}` : null,
    r.roundUnknown > 0 ? `round_unknown=${r.roundUnknown}` : null,
    r.rescheduleDetected > 0 ? `resched=${r.rescheduleDetected}` : null,
    r.awarded > 0 ? `awarded=${r.awarded}` : null,
    r.finalWithoutGoals > 0 ? `ft_no_goals=${r.finalWithoutGoals}` : null,
    // From `feedError`, NOT from `errors[]` — a rate-limited failure must still
    // be visible in the note, otherwise the limiter hides the outage itself.
    r.feedError !== null ? 'feed_error' : null,
  ].filter((x): x is string => x !== null)
  return [...always, ...whenNonZero]
}
