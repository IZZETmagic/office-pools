import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { withPerfLogging } from '@/lib/api-perf'
import { firePendingWeeklyRecaps } from '@/lib/push/recaps'

// =============================================================
// GET /api/cron/push-weekly-recap
//
// Sunday-evening Supabase cron. Aggregates each user's scored matches over
// the past 7 days (Mon → Sun) and fires one "your week in predictions"
// push per user (category: MATCH_RESULTS).
//
// Dedupe via push_weekly_recaps_sent (user, week_starting).
// =============================================================

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isCron) {
    const auth = await requireSuperAdmin()
    if (auth.error) return auth.error
  }

  const result = await firePendingWeeklyRecaps()
  return NextResponse.json({ ok: true, ...result })
}

export const GET = withPerfLogging('/api/cron/push-weekly-recap', handle)
export const POST = withPerfLogging('/api/cron/push-weekly-recap', handle)
