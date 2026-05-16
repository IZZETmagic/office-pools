import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { withPerfLogging } from '@/lib/api-perf'
import { firePendingDeadlineWarnings } from '@/lib/push/deadline-warnings'

// =============================================================
// GET /api/cron/push-deadline-warnings
//
// Called by a Supabase pg_cron job every 30 minutes. Scans pools whose
// `prediction_deadline` is in the next 24h and sends a push to every
// member with at least one unsubmitted entry, at the narrowest applicable
// window (24h → 6h → 1h).
//
// Auth: same pattern as /api/cron/sync-fixtures — Bearer CRON_SECRET for
// the cron caller, super-admin for manual triggers from the admin panel.
// =============================================================

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isCron) {
    const auth = await requireSuperAdmin()
    if (auth.error) return auth.error
  }

  const result = await firePendingDeadlineWarnings()
  return NextResponse.json({ ok: true, ...result })
}

export const GET = withPerfLogging('/api/cron/push-deadline-warnings', handle)
export const POST = withPerfLogging('/api/cron/push-deadline-warnings', handle)
