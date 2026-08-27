import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/auth'
import { invalidatePoolCache } from '@/lib/poolData'
import { sendLeagueNotice } from '@/lib/league/notify'

export const dynamic = 'force-dynamic'
// A fixture event is a cache invalidation and takes milliseconds; a matchweek
// event sends an email batch and a push fan-out and takes longer. The ceiling is
// headroom for a matchweek's worth of fixtures completing at once — ten 3pm
// kickoffs finishing together is the real burst.
export const maxDuration = 60

// =============================================================
// GET/POST /api/cron/league-outbox
//
// Drains `league_score_events`. Migration 059 gave that table a producer —
// `league_score_fixture` queues one row per (pool, fixture) it scores — and
// until this route existed nothing took the work off it.
//
// Claim -> process -> mark, per plan §4 L-B. Claiming goes through
// `league_claim_score_events` (migration 062) because it needs FOR UPDATE SKIP
// LOCKED, which PostgREST cannot express: without it two overlapping runs claim
// the same rows and do the same work twice.
//
// Auth: Bearer <CRON_SECRET>, or a super admin so it can be run by hand.
//
// ============================================================
// WHAT THIS DELIBERATELY DOES NOT DO YET
// ============================================================
// L-B lists four fan-outs for this consumer: result pushes, XP, badges, and
// cache invalidation. Cache and matchweek notifications are wired; the
// omissions below are deliberate rather than unfinished:
//
//   * XP and badges are BLOCKED, not skipped. `computePoolEntryAnalytics`
//     reads `readMatchScores`, which has no league arm and returns [] by design
//     (`leagueNotImplemented`, readSource.ts). Running it for a league entry
//     would compute accuracy, streak and XP from ZERO match scores and write
//     zeros into `entry_xp_state` — so a member would see 0% accuracy and no
//     streak rather than seeing nothing. That is worse than blank, and it is
//     the same silent-wrongness shape as the dropped-column outage.
//     §0.5 defers the Form tab and moves those five readSource arms out of the
//     launch spine, so this waits for them.
//
//   * Result pushes for a single FIXTURE are still not sent. A goal is not a
//     notification — the leaderboard moves on its own (migration 060) and
//     pushing on every goal would be the nagging the disclosure gate forbids.
//     What IS sent is the matchweek-level "results are in", once, at the end.
//
// ⚠ MATCHWEEK events (matchweek_opened, lock_reminder, matchweek_completed) ARE
// handled, as of phase 6 — see the switch below. Each one sends an email and a
// push through lib/league/notify.ts, which honours per-category push
// preferences and Resend topics.
// =============================================================

const CAP = 200 // events per run; the rest spill to the next minute

export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}

type ClaimedEvent = {
  event_id: number
  pool_id: string
  /** Exactly one of these is set — migration 071's CHECK guarantees it. */
  fixture_id: string | null
  matchweek_id: string | null
  kind: string
  attempts: number
}

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const isCron = !!cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`

  if (!isCron) {
    // requireSuperAdmin is USER-scoped, not service-role — it authenticates the
    // caller and does not hand back a privileged client. The admin client is
    // created separately either way.
    const auth = await requireSuperAdmin()
    if (auth.error) return auth.error
  }
  const admin = createAdminClient()

  // Kill switch — disabled only if explicitly false, so an absent row is on.
  // Matches shadow-materialize so operations has one habit, not two.
  const { data: enabledRow } = await admin
    .from('sync_settings')
    .select('setting_value')
    .eq('setting_key', 'league_outbox_enabled')
    .maybeSingle()
  if (enabledRow?.setting_value === false || enabledRow?.setting_value === 'false') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'league_outbox_enabled=false' })
  }

  const { data: claimed, error: claimErr } = await admin.rpc('league_claim_score_events', {
    p_limit: CAP,
  })
  if (claimErr) {
    // A claim failure is the whole run — there is nothing to process and
    // nothing has been marked, so the next tick retries from the same state.
    console.error('[league-outbox] claim failed:', claimErr.message)
    return NextResponse.json({ ok: false, error: claimErr.message }, { status: 500 })
  }

  const events = (claimed ?? []) as ClaimedEvent[]
  if (events.length === 0) {
    return NextResponse.json({ ok: true, claimed: 0, processed: 0 })
  }

  const done: number[] = []
  const failed: Array<{ event_id: number; error: string }> = []
  let notices = 0

  // --- FIXTURE events: cache only, and ONE invalidation per pool. A matchweek's
  // ten fixtures produce ten events for the same pool, and the cache tag is
  // pool-wide, so invalidating per event would be nine wasted round trips.
  const fixtureEvents = events.filter((e) => e.fixture_id !== null)
  for (const poolId of [...new Set(fixtureEvents.map((e) => e.pool_id))]) {
    const ids = fixtureEvents.filter((e) => e.pool_id === poolId).map((e) => e.event_id)
    try {
      // The pool page is cached, so without this a member can see pre-goal
      // standings for the length of the TTL after a score moves.
      invalidatePoolCache(poolId)
      // --- STILL DEFERRED: XP + badges, blocked on the league readSource arms.
      done.push(...ids)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[league-outbox] pool ${poolId} cache failed:`, message)
      failed.push(...ids.map((event_id) => ({ event_id, error: message })))
    }
  }

  // --- NOTIFICATION events: one notification each. Handled per event rather
  // than grouped, because each kind has different recipients — the lock
  // reminder goes only to people who have not picked.
  //
  // ⚠ SELECTED BY "NOT A FIXTURE EVENT", not by "has a matchweek". Migration 099
  // added a third target shape: `table_deadline` is POOL-level and carries
  // neither a fixture nor a matchweek. Under the old `matchweek_id !== null`
  // filter such a row matched no branch at all — so it was claimed every tick,
  // never sent, never marked, and would have accumulated forever while the
  // reminder it represents was never delivered.
  for (const e of events.filter((ev) => ev.fixture_id === null)) {
    try {
      const result = await sendLeagueNotice(admin, e.kind, e.pool_id, e.matchweek_id)
      if (result.skipped) {
        // A skip is a real outcome, not a failure: an archived pool, a
        // matchweek everyone has already picked, or a kind with no handler.
        // Marking it done stops it being retried forever.
        console.log(`[league-outbox] ${e.kind} skipped: ${result.skipped}`)
      } else {
        notices += result.emails + result.pushes
      }
      invalidatePoolCache(e.pool_id)

      // ⚠ MARKED IMMEDIATELY, one at a time — NOT batched with the others at
      // the end like the fixture events are.
      //
      // The batched mark is safe for cache invalidation because re-running it
      // costs nothing. An EMAIL IS NOT IDEMPOTENT. If the batch mark failed
      // after this send, the next run would re-claim the row and send the whole
      // pool a second copy — which is precisely the nagging the disclosure gate
      // exists to prevent. Marking here shrinks the duplicate window to a single
      // statement, and errs toward a missed notification over a repeated one: a
      // member who misses "matchweek open" still sees it in the app, whereas a
      // member who gets it twice has been spammed.
      const { error: markErr } = await admin
        .from('league_score_events')
        .update({ processed_at: new Date().toISOString(), last_error: null })
        .eq('event_id', e.event_id)
      if (markErr) {
        console.error(`[league-outbox] SENT ${e.kind} but could not mark it — it may repeat:`, markErr.message)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[league-outbox] ${e.kind} for pool ${e.pool_id} failed:`, message)
      failed.push({ event_id: e.event_id, error: message })
    }
  }

  if (done.length > 0) {
    const { error } = await admin
      .from('league_score_events')
      .update({ processed_at: new Date().toISOString(), last_error: null })
      .in('event_id', done)
    if (error) {
      // The work was done but the mark failed, so these rows will be claimed
      // again next run. Safe HERE because this batch is fixture events only,
      // whose only fan-out is cache invalidation — re-running that costs
      // nothing. Notifications are marked individually above precisely because
      // that reasoning does NOT extend to them.
      console.error('[league-outbox] mark-processed failed, will retry:', error.message)
      return NextResponse.json(
        { ok: false, claimed: events.length, processed: 0, error: error.message },
        { status: 500 },
      )
    }
  }

  // Failures are LEFT UNPROCESSED on purpose. `claimed_at` ages out after five
  // minutes and the row is retried, with `attempts` counting the tries — a row
  // that keeps failing becomes visible instead of silently looping forever.
  if (failed.length > 0) {
    await admin
      .from('league_score_events')
      .update({ last_error: failed[0].error })
      .in('event_id', failed.map((f) => f.event_id))
  }

  return NextResponse.json({
    ok: failed.length === 0,
    claimed: events.length,
    processed: done.length,
    failed: failed.length,
    notices,
  })
}
