import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/auth'
import { reconcileMatchSchedules } from '@/lib/integrations/apiFootball/reconcile'

export const dynamic = 'force-dynamic'

/**
 * Daily reconcile of stored kickoff times/venues against api-football.
 *
 * Complements the per-minute live sync, which only writes scores/status and
 * never `match_date`. Without this, a FIFA reschedule after seeding leaves a
 * stale kickoff in the DB that every user (in every timezone) sees wrong.
 *
 * Auth mirrors sync-fixtures: cron bearer token or super admin. Honors the
 * same `sync_enabled` kill switch. Pass `?dry=1` to preview without writing.
 */
export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  const startedAt = new Date().toISOString()

  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`
  let triggeredBy: 'cron' | 'admin' = 'cron'
  if (!isCron) {
    const auth = await requireSuperAdmin()
    if (auth.error) return auth.error
    triggeredBy = 'admin'
  }
  const admin = createAdminClient()

  // Same kill switch as the live sync.
  const { data: setting } = await admin
    .from('sync_settings')
    .select('setting_value')
    .eq('setting_key', 'sync_enabled')
    .maybeSingle()
  const syncEnabled = setting?.setting_value === true || setting?.setting_value === 'true'
  if (!syncEnabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'sync_enabled=false' })
  }

  const tournamentId =
    process.env.API_FOOTBALL_TOURNAMENT_ID || '00000000-0000-0000-0000-000000000001'
  const league = parseInt(process.env.API_FOOTBALL_LEAGUE_ID ?? '1', 10)
  const season = parseInt(process.env.API_FOOTBALL_SEASON ?? '2026', 10)
  const dryRun = request.nextUrl.searchParams.get('dry') === '1'

  try {
    const res = await reconcileMatchSchedules(admin, {
      tournament_id: tournamentId,
      league,
      season,
      dryRun,
    })
    return NextResponse.json({
      ok: true,
      startedAt,
      triggeredBy,
      dryRun,
      checked: res.checked,
      changedCount: res.changed.length,
      changed: res.changed,
      skippedCount: res.skipped.length,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, startedAt, triggeredBy, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
