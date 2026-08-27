import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'
// Two statements against a handful of matchweeks. Fast even with every league
// this product will plausibly run.
export const maxDuration = 60

// =============================================================
// GET/POST /api/cron/league-notices
//
// Queues the two TIME-BASED league notifications by calling
// `league_queue_matchweek_notices` (migrations 073/074):
//
//   matchweek_opened   a new matchweek became the open one
//   lock_reminder      it locks soon and somebody has not picked
//
// ...and the one POOL-level notice, via `league_queue_table_deadline_notices`
// (migration 099):
//
//   table_deadline     a Table pool closes soon and somebody has no table
//
// It only QUEUES. Sending is the outbox consumer's job
// (/api/cron/league-outbox), which is what gives a notification a durable owner:
// if the send fails, the row is still there to retry, and nothing is lost
// because a cron tick happened to fall over.
//
// The third notification, `matchweek_completed`, needs no cron at all — it is
// produced inside `league_snapshot_matchweek_ranks`, which already fires exactly
// once per matchweek at the moment it becomes both fully played and fully
// scored.
//
// ============================================================
// CADENCE
// ============================================================
// Hourly is enough and deliberately not more.
//
// "Opened" is not urgent to the minute: a matchweek is open for about six days,
// so learning about it within the hour costs a member nothing. The reminder
// fires inside a 24-hour window before the lock, so an hourly scan cannot miss
// it. Running every minute would buy nothing and give a bad `lock_at` an hour's
// less warning before it started emailing people.
//
// ⚠ NOT SCHEDULED YET. This route has to be deployed before a pg_cron job can
// point at it, or the job 404s every hour. Suggested, once deployed:
//
//   select cron.schedule('league-notices', '0 * * * *', $$
//     select net.http_post(
//       url := 'https://sportpool.io/api/cron/league-notices',
//       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret'))
//     )$$);
//
// Auth: Bearer <CRON_SECRET>, or a super admin so it can be run by hand.
// =============================================================

export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const isCron = !!cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`

  if (!isCron) {
    const auth = await requireSuperAdmin()
    if (auth.error) return auth.error
  }
  const admin = createAdminClient()

  // Kill switch, same shape as the other league crons: disabled only if
  // explicitly false, so an absent row is enabled.
  //
  // Worth having its own switch rather than sharing the outbox's. Turning off
  // the drain stops everything; turning this off stops NEW notices being
  // queued while letting whatever is already queued still go out — which is
  // what an operator wants if a `lock_at` turns out to be wrong.
  const { data: enabledRow } = await admin
    .from('sync_settings')
    .select('setting_value')
    .eq('setting_key', 'league_notices_enabled')
    .maybeSingle()
  if (enabledRow?.setting_value === false || enabledRow?.setting_value === 'false') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'league_notices_enabled=false' })
  }

  // No season argument: production wants every league. The parameter exists so
  // the verification script can scope itself — migration 074 was written after
  // an unscoped test run queued real events against live pools.
  const { data, error } = await admin.rpc('league_queue_matchweek_notices')
  if (error) {
    console.error('[league-notices] queue failed:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // The TABLE deadline, migration 099. Queued separately from the matchweek
  // notices because it is a different shape of event — pool-level, with no
  // matchweek behind it — and on a different window: 72 hours, not 24.
  //
  // Its failure is deliberately NOT fatal to the response above. The matchweek
  // notices have already been queued and stamped by this point; returning 500
  // would tell the cron the whole tick failed for something that is retried in
  // an hour anyway, and the stamps mean the matchweek half will not re-queue.
  const { data: tableData, error: tableErr } = await admin.rpc(
    'league_queue_table_deadline_notices',
  )
  if (tableErr) console.error('[league-notices] table deadline queue failed:', tableErr.message)

  const result = (data ?? { opened: 0, reminded: 0 }) as { opened: number; reminded: number }
  const table = (tableData ?? { table_deadline: 0 }) as { table_deadline: number }
  return NextResponse.json({
    ok: true,
    ...result,
    table_deadline: table.table_deadline,
    ...(tableErr ? { table_deadline_error: tableErr.message } : {}),
  })
}
