import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/auth'
import { checkPushReceipts } from '@/lib/push/receipts'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// =============================================================
// GET/POST /api/cron/push-receipts — N4 step 3, 2026-10-07
//
// Reads Expo's receipts for the Android pushes in the delivery record and
// removes the tokens Expo reports as DeviceNotRegistered (lib/push/receipts.ts).
// Every 15 minutes, scheduled by migration 178. Sends nothing.
//
// Auth: Bearer <CRON_SECRET>, or a super admin so it can be run by hand.
// Kill switch: sync_settings 'push_receipts_enabled' = false skips the run —
// an absent row is enabled, as with the other crons.
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
  const { data: enabledRow } = await admin
    .from('sync_settings')
    .select('setting_value')
    .eq('setting_key', 'push_receipts_enabled')
    .maybeSingle()
  if (enabledRow?.setting_value === false || enabledRow?.setting_value === 'false') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'push_receipts_enabled=false' })
  }

  const started = Date.now()
  try {
    const summary = await checkPushReceipts(admin, started)
    return NextResponse.json({ ok: true, ...summary, ms: Date.now() - started })
  } catch (err) {
    // Nothing is lost: an unmarked row is asked about again next run, for up to 24 hours.
    const message = err instanceof Error ? err.message : String(err)
    console.error('[push-receipts] run failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
