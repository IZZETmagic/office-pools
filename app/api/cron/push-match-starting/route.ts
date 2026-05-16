import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { withPerfLogging } from '@/lib/api-perf'
import { fireMatchStartingPushes } from '@/lib/push/time-based'

// =============================================================
// GET /api/cron/push-match-starting
//
// Every-30-min Supabase cron. Pushes "kicks off in Xh" to users in any
// pool that uses a tournament with an imminent kickoff (T+60-90 min window).
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

  const result = await fireMatchStartingPushes()
  return NextResponse.json({ ok: true, ...result })
}

export const GET = withPerfLogging('/api/cron/push-match-starting', handle)
export const POST = withPerfLogging('/api/cron/push-match-starting', handle)
