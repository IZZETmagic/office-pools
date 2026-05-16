import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { withPerfLogging } from '@/lib/api-perf'
import { firePredictReminders } from '@/lib/push/time-based'

// =============================================================
// GET /api/cron/push-predict-reminders
//
// Daily Supabase cron. Pushes "make your picks for {pool}" once per user
// per day when they have at least one unsubmitted entry in any pool with
// a deadline in the next 7 days.
//
// Category: PREDICTIONS.
// =============================================================

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isCron) {
    const auth = await requireSuperAdmin()
    if (auth.error) return auth.error
  }

  const result = await firePredictReminders()
  return NextResponse.json({ ok: true, ...result })
}

export const GET = withPerfLogging('/api/cron/push-predict-reminders', handle)
export const POST = withPerfLogging('/api/cron/push-predict-reminders', handle)
