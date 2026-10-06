import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/auth'
import { dispatch, type DispatchSummary } from '@/lib/notifications/outbox'
import { COMPOSERS } from '@/lib/notifications/composers'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// =============================================================
// GET/POST /api/cron/notification-outbox — N3, 2026-10-05
// =============================================================
// Drains notification_outbox (migration 172): claim → compose → gate → send →
// settle, in batches, until nothing is due or the time budget runs out. What
// is left goes on the next tick.
//
// This is the RETRY NET, not the only sender. A route that queues a notice may
// send its own rows straight away; anything that fails, or that it never got
// to, is picked up here — and nothing is sent twice, because each channel's
// outcome is recorded per row (see lib/notifications/outbox.ts).
//
// ⚠ EXPIRY IS NOT DONE HERE. The claim function marks a row past its
// expires_at 'expired' instead of handing it out, so however long this route
// was down, a backlog cannot replay a stale notice (Decision 16).
//
// Kill switch: sync_settings 'notification_outbox_enabled' = false stops the
// drain. Rows wait, and expire if they wait past their window.
//
// Auth: Bearer <CRON_SECRET>, or a super admin, so it can be run by hand.
//
// SCHEDULED by migration 173, which can only be applied once this route is in
// production — before that, the job would POST to a 404 every minute.
// =============================================================

const BATCH = 25
const BUDGET_MS = 45_000

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
  const { data: enabledRow } = await admin
    .from('sync_settings')
    .select('setting_value')
    .eq('setting_key', 'notification_outbox_enabled')
    .maybeSingle()
  if (enabledRow?.setting_value === false || enabledRow?.setting_value === 'false') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'notification_outbox_enabled=false' })
  }

  const started = Date.now()
  const total: DispatchSummary = { claimed: 0, sent: 0, skipped: 0, failed: 0, retrying: 0, shadow: 0 }
  try {
    while (Date.now() - started < BUDGET_MS) {
      const s = await dispatch(admin, COMPOSERS, { limit: BATCH })
      for (const k of Object.keys(total) as Array<keyof DispatchSummary>) total[k] += s[k]
      if (s.claimed < BATCH) break
    }
  } catch (err) {
    // A claim or read failure ends the run. Whatever was claimed and not
    // settled is reissued after five minutes — nothing is lost and nothing
    // was sent twice.
    const message = err instanceof Error ? err.message : String(err)
    console.error('[notification-outbox] run failed:', message)
    return NextResponse.json({ ok: false, error: message, ...total }, { status: 500 })
  }
  return NextResponse.json({ ok: true, ...total, ms: Date.now() - started })
}
