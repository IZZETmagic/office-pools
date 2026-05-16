import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { withPerfLogging } from '@/lib/api-perf'
import { firePendingMatchdayRecaps } from '@/lib/push/recaps'

// =============================================================
// GET /api/cron/push-matchday-recap
//
// Hourly Supabase cron. Detects calendar dates where every match has just
// transitioned to completed and fires per-user-per-pool matchday recap
// pushes (category: MATCH_RESULTS).
//
// Dedupe via push_matchday_recaps_sent (user, pool, matchday) — atomic.
// Looks back 48h for "completed-but-not-yet-recapped" dates so any cron
// hiccup gets caught next run.
// =============================================================

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isCron) {
    const auth = await requireSuperAdmin()
    if (auth.error) return auth.error
  }

  const result = await firePendingMatchdayRecaps()
  return NextResponse.json({ ok: true, ...result })
}

export const GET = withPerfLogging('/api/cron/push-matchday-recap', handle)
export const POST = withPerfLogging('/api/cron/push-matchday-recap', handle)
