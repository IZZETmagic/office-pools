import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/auth'
import {
  reconcileLeagueSchedule,
  formatLeagueReconcileNote,
} from '@/lib/integrations/apiFootball/reconcileLeagueSchedule'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// =============================================================
// GET/POST /api/cron/league-reconcile
//
// Re-reads the whole fixture list for every league season, once a day, and
// corrects any kickoff that has moved — then re-homes what the move displaced.
//
// ============================================================
// WHY THIS EXISTS, GIVEN THE FIXTURES SYNC RUNS EVERY MINUTE
// ============================================================
// Because that sync cannot see a reschedule in time to do anything about it,
// and this was found by running it and asking why nothing moved.
//
// `syncLeagueFixtures` selects fixtures within about three hours of the kickoff
// it ALREADY HOLDS — 30 minutes before, 2.5 hours after — plus a catch-up pass
// restricted to kickoffs already in the past. Nothing it does looks further
// than 30 minutes ahead of a stored date. So a game moved from February to May
// is invisible to us until its ORIGINAL February kickoff arrives.
//
// ⚠ And that is always too late, by construction. A matchweek locks an hour
// before its own first kickoff (101), and a fixture enters the sync's window at
// the earliest 30 minutes before its own kickoff — necessarily after that lock.
// So the source matchweek has ALWAYS locked by the moment the move is first
// seen, and `league_apply_rehome` refuses it, correctly, by its own guard.
// Without this route, re-homing moves nothing, ever.
//
// The World Cup hit the identical wall and answered it identically:
// `/api/cron/reconcile-schedule`, whose header records that the live sync
// "only ever writes scores/status/live fields — never `match_date`". That one
// reads `matches` and knows nothing about league seasons. This is its
// counterpart, and the two share no code because they share no schema.
//
// ============================================================
// CADENCE
// ============================================================
// Daily. One api-football call per league season — 365 a year against an
// allowance the per-minute fixtures sync already dominates, so effectively
// free. Daily rather than hourly because a reschedule is announced weeks ahead
// and nothing is gained by learning of it at 03:00 instead of 04:00; daily
// rather than weekly because the useful property is catching a move while the
// matchweek it came from is still unlocked, and a week's delay can eat that.
//
// A season with nothing ahead of the live window — the last days of a season —
// spends NO call at all: the read comes back empty and the route returns before
// touching the feed.
//
// ⚠ NOT SCHEDULED YET — like the other league crons, this has to be deployed
// before a pg_cron job can point at it. Suggested, once deployed:
//
//   select cron.schedule('league-reconcile', '20 3 * * *', $$
//     select net.http_post(
//       url := 'https://sportpool.io/api/cron/league-reconcile',
//       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret'))
//     )$$);
//
// `?dry=1` previews without writing — it reports what WOULD move and spends the
// same one call.
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
  const startedAt = new Date().toISOString()
  const cronSecret = process.env.CRON_SECRET
  const isCron = !!cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`

  if (!isCron) {
    const auth = await requireSuperAdmin()
    if (auth.error) return auth.error
  }
  const admin = createAdminClient()

  // Own kill switch, same shape as the other league crons: disabled only if
  // explicitly false, so an absent row is enabled.
  const { data: enabledRow } = await admin
    .from('sync_settings')
    .select('setting_value')
    .eq('setting_key', 'league_reconcile_enabled')
    .maybeSingle()
  if (enabledRow?.setting_value === false || enabledRow?.setting_value === 'false') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'league_reconcile_enabled=false' })
  }

  const dryRun = request.nextUrl.searchParams.get('dry') === '1'

  const { data: seasons, error } = await admin
    .from('league_seasons')
    .select('season_id, competition_name, external_league_id, external_season')
    .range(0, 999)
  if (error) {
    return NextResponse.json({ ok: false, startedAt, error: error.message }, { status: 500 })
  }

  const results: Array<Record<string, unknown>> = []
  let failed = 0

  for (const s of (seasons ?? []) as Array<{
    season_id: string
    competition_name: string
    external_league_id: number
    external_season: number
  }>) {
    const r = await reconcileLeagueSchedule(admin, {
      seasonId: s.season_id,
      externalLeagueId: s.external_league_id,
      externalSeason: s.external_season,
      dryRun,
    })
    if (r.errors.length > 0) failed++
    results.push({
      league: s.competition_name,
      note: formatLeagueReconcileNote(r),
      checked: r.checked,
      apiCalls: r.apiCalls,
      // The moves themselves, not just a count: this is the one route whose
      // output somebody will actually want to read after a postponement.
      detected: r.detected,
      applied: r.applied,
      rehomed: r.rehomed,
      unmatched: r.unmatched,
      errors: r.errors,
    })
  }

  return NextResponse.json({
    ok: failed === 0,
    startedAt,
    triggeredBy: isCron ? 'cron' : 'admin',
    dryRun,
    seasons: results.length,
    results,
  })
}
