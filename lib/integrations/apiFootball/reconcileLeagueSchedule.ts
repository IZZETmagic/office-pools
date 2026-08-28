// =============================================================
// The daily league schedule reconcile — the input re-homing was missing
// =============================================================
// L11 taught the sync to write a moved kickoff (105) and 106 taught it where
// the fixture then belongs. Running it proved neither would ever fire.
//
// The live sync only looks at a fixture within about three hours of the kickoff
// it ALREADY HOLDS — `WINDOW_BEFORE_MS` 30 minutes, `WINDOW_AFTER_MS` 2.5 hours
// — plus a catch-up pass restricted to kickoffs already in the past. Nothing
// looks further than 30 minutes ahead of a stored date. So a game moved from
// February to May stays invisible until its ORIGINAL February kickoff arrives,
// and by then a matchweek that locks an hour before its own first kickoff has
// certainly locked, so `league_apply_rehome` refuses the move by its own guard.
// Every real reschedule arrived too late to act on.
//
// The World Cup hit this exact wall and solved it the same way — see
// `reconcile.ts`, whose header says the live sync "only ever writes
// scores/status/live fields — never `match_date`". That reconciler reads
// `matches` and knows nothing about league seasons. This is its counterpart.
//
// ## The division of labour, which is the whole design
//
//   · the live sync owns the ~3 hours around a kickoff — scores, status, the
//     live triple, and a reschedule discovered late;
//   · this owns everything BEYOND that window — the schedule itself, days or
//     months out, where a move can still be acted on.
//
// They cannot fight: this refuses to touch a fixture the live sync is holding
// (see `SYNC_WINDOW_MS`), so no fixture is ever in scope for both at once.
//
// ## Why it reuses the mapper and the RPC rather than writing directly
//
// `fixtureToLeagueUpdate` already owns "what does the feed mean for this row",
// including the `rescheduled` flag it has carried since 053, and
// `league_apply_fixture_sync` owns the write with its guards — completed
// fixtures refused, `manual_override` untouchable, the first
// `original_kickoff_at` preserved through COALESCE. Reimplementing either here
// would be a second copy of a rule that already has tests pointed at it.
//
// ⚠ The World Cup reconciler writes the table directly. Do not copy that here:
// it predates the RPC, and `league_fixtures` has guards that only the RPC
// applies.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getFixturesAllPages } from './client'
import { fixtureToLeagueUpdate, isLiveStatus, isFinalStatus } from './mappers'
import type { LeagueFixturePayload, LeagueFixtureRow } from './mappers'
import { rehomeSeason } from '@/lib/league/rehomeSeason'
import type { ApiFootballFixture } from './types'

/**
 * How far ahead the live sync's own window reaches. A fixture inside it belongs
 * to that arm, not this one. Deliberately a little wider than its 30 minutes so
 * the two never contend for the same row on a tick boundary.
 */
const SYNC_WINDOW_MS = 60 * 60 * 1000

/** Well above a league season, low enough to notice a runaway. */
const CAP = 5000

/** Everything this pass needs to compare, and nothing it does not. */
const PROJECTION =
  'fixture_id, matchweek_id, external_fixture_id, kickoff_at, original_kickoff_at, ' +
  'status, status_detail, home_goals, away_goals, is_completed, ' +
  'live_minute, live_period, live_added, manual_override'

export type LeagueScheduleMove = {
  externalFixtureId: string
  oldKickoff: string
  newKickoff: string
  /** Positive = the game moved LATER. */
  shiftMinutes: number
}

export type LeagueReconcileResult = {
  seasonId: string
  /** Fixtures compared: beyond the live sync's window, not completed, not overridden. */
  checked: number
  /** api-football calls spent. One per season in the ordinary case. */
  apiCalls: number
  /** Moves the feed reported and we proposed. */
  detected: LeagueScheduleMove[]
  /** Moves the DATABASE actually wrote, read back from the RPC. */
  applied: number
  /** Fixtures re-homed to a different matchweek as a result. */
  rehomed: number
  /** Ours with no counterpart in the season feed — a mapping problem, not a move. */
  unmatched: string[]
  /** false for a dry run: `detected` is what WOULD be written. */
  wrote: boolean
  errors: Array<{ stage: string; message: string }>
}

export async function reconcileLeagueSchedule(
  admin: SupabaseClient,
  args: {
    seasonId: string
    externalLeagueId: number
    externalSeason: number
    dryRun?: boolean
    /** Injected in tests; defaults to the wall clock. */
    now?: number
  },
): Promise<LeagueReconcileResult> {
  const now = args.now ?? Date.now()
  const result: LeagueReconcileResult = {
    seasonId: args.seasonId,
    checked: 0,
    apiCalls: 0,
    detected: [],
    applied: 0,
    rehomed: 0,
    unmatched: [],
    wrote: !args.dryRun,
    errors: [],
  }
  const push = (stage: string, message: string) => result.errors.push({ stage, message })

  // Only what this pass may act on. The filters are here rather than in the
  // loop so the row cap applies to the rows that matter.
  const { data, error } = await admin
    .from('league_fixtures')
    .select(PROJECTION)
    .eq('season_id', args.seasonId)
    .eq('is_completed', false)
    .eq('manual_override', false)
    .gt('kickoff_at', new Date(now + SYNC_WINDOW_MS).toISOString())
    .order('kickoff_at', { ascending: true })
    .range(0, CAP - 1)
  // Checked, never destructured away: a 400 here reads as "no fixtures to
  // reconcile", which is indistinguishable from a correct quiet run.
  if (error) {
    push('league_reconcile_read', error.message)
    return result
  }

  const rows = (data ?? []) as unknown as LeagueFixtureRow[]
  if (rows.length >= CAP) {
    push('league_reconcile_read', `read was truncated at ${rows.length} fixtures`)
    return result
  }
  // Nothing ahead of the live window: no feed call at all. In the last weeks of
  // a season this is the ordinary outcome.
  if (rows.length === 0) return result

  let feed: ApiFootballFixture[] = []
  try {
    const { fixtures, calls } = await getFixturesAllPages({
      league: args.externalLeagueId,
      season: args.externalSeason,
    })
    feed = fixtures
    result.apiCalls = calls
  } catch (e) {
    // The whole point is comparing against the feed; without it there is
    // nothing to say, and writing anything would be inventing a schedule.
    push('league_reconcile_fetch', e instanceof Error ? e.message : String(e))
    return result
  }

  const byId = new Map<string, ApiFootballFixture>()
  for (const f of feed) byId.set(String(f.fixture.id), f)

  const payload: LeagueFixturePayload[] = []
  for (const row of rows) {
    const f = byId.get(row.external_fixture_id)
    if (!f) {
      // Ours is not in the season feed. That is a mapping break rather than a
      // reschedule, and silently skipping it would hide it forever.
      result.unmatched.push(row.external_fixture_id)
      continue
    }

    // A fixture the feed has started or finished is the live sync's business,
    // whatever our stored kickoff says. Belt and braces with the window filter.
    const short = f.fixture.status.short
    if (isLiveStatus(short) || isFinalStatus(short)) continue

    result.checked++

    const { payload: p, flags } = fixtureToLeagueUpdate(f, row)
    if (!p) continue

    if (flags.rescheduled && p.set_kickoff && p.kickoff_at) {
      result.detected.push({
        externalFixtureId: row.external_fixture_id,
        oldKickoff: row.kickoff_at,
        newKickoff: p.kickoff_at,
        shiftMinutes: Math.round((Date.parse(p.kickoff_at) - Date.parse(row.kickoff_at)) / 60_000),
      })
    }
    payload.push(p)
  }

  // ⚠ Deliberately does NOT stamp liveness when there is nothing to write, and
  // that is a decision rather than an omission. `last_synced_at` means "the live
  // arm looked at this row", and that arm's catch-up pass filters on it. Writing
  // it here for 369 future fixtures every night would put this pass's fingerprint
  // on a column another arm reasons about. The evidence that this ran is the
  // cron's own note — `checked=369 calls=1` — not a column.
  if (args.dryRun || payload.length === 0) return result

  const { data: applied, error: rpcErr } = await admin.rpc('league_apply_fixture_sync', {
    p_season_id: args.seasonId,
    // Empty for the same reason: liveness belongs to the live arm. This call is
    // here to WRITE, not to record that we looked.
    p_seen: null,
    p_rows: payload,
    p_now: new Date(now).toISOString(),
  })
  if (rpcErr) {
    push('league_apply_fixture_sync', rpcErr.message)
    return result
  }

  // Counted from what came BACK, not from what was sent: the RPC's guards drop
  // a write silently and correctly, and counting the ask would report moves
  // that never happened.
  const changed = (applied as { changed?: Array<{ external_fixture_id: string; kickoff_at: string | null }> } | null)
    ?.changed ?? []
  const asked = new Map(result.detected.map((m) => [m.externalFixtureId, m.newKickoff]))
  for (const c of changed) {
    const want = asked.get(c.external_fixture_id)
    if (want && c.kickoff_at && Date.parse(c.kickoff_at) === Date.parse(want)) result.applied++
  }

  // ---------------------------------------------------------------- re-home
  // The reason this file exists. Only when a kickoff actually moved: re-homing
  // reads the whole season, and there is nothing to re-plan otherwise.
  if (result.applied > 0) {
    try {
      result.rehomed = await rehomeSeason(admin, args.seasonId, (stage, message) =>
        push(stage, message),
      )
    } catch (e) {
      // Never fails the reconcile: the dates are already written and correct,
      // and the planner holds no state — the next run re-plans from scratch.
      push('league_rehome', e instanceof Error ? e.message : String(e))
    }
  }

  return result
}

/** One line, in the shape the cron logs. */
export function formatLeagueReconcileNote(r: LeagueReconcileResult): string {
  return [
    `checked=${r.checked}`,
    `calls=${r.apiCalls}`,
    `moved=${r.detected.length}/${r.applied}`,
    r.rehomed > 0 ? `rehomed=${r.rehomed}` : null,
    r.unmatched.length > 0 ? `unmatched=${r.unmatched.length}` : null,
    r.wrote ? null : 'DRY',
    r.errors.length > 0 ? `errors=${r.errors.length}` : null,
  ]
    .filter(Boolean)
    .join(' ')
}
