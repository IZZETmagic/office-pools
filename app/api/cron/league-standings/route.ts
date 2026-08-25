import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/auth'
import { syncLeagueStandings } from '@/lib/integrations/apiFootball/syncLeagueStandings'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// =============================================================
// GET/POST /api/cron/league-standings
//
// Re-reads `/standings` for every league season, on a slow timer.
//
// ============================================================
// WHY THIS EXISTS, GIVEN THE TABLE IS ALREADY READ ON EVERY RESULT
// ============================================================
// `syncLeagueFixtures` section 7c already re-reads the standings whenever a
// fixture COMPLETES, which is far more often than monthly. That covers the
// table's numbers completely: rank and points cannot move for any other reason.
//
// It does NOT cover the BANDS. `description` — the column
// `league_default_bands` reads to decide how many Champions League, Europa and
// relegation places a competition has — changes for reasons that have nothing
// to do with a match finishing:
//
//   · a coefficient award adds a Champions League place (England had five in
//     2023/24)
//   · a domestic cup winner already qualified shifts the Europa places down
//   · a governing body re-tags the table between seasons
//
// Every one of those can land during an international break, in pre-season, or
// in the summer — windows where no league fixture completes for weeks, and the
// event-driven read therefore never fires. A Table pool locks at the first
// kickoff, and members shade their picks against those bands, so a stale band in
// August is a stale band on the screen people are deciding against.
//
// ⚠ It cannot change a band after the season is frozen. Once
// `league_standings_final` exists, `league_default_bands` reads the snapshot and
// this route's writes stop mattering to scoring — which is the intended
// behaviour, not a limitation (migration 091).
//
// ============================================================
// CADENCE
// ============================================================
// Monthly. One api-football call per league, twelve times a year — negligible
// against the fixtures sync, and the thing it watches genuinely moves on the
// scale of months. Anything faster would spend the allowance re-reading a
// description that had not changed; anything slower could leave a wrong band up
// through a whole pre-season.
//
// ⚠ NOT SCHEDULED YET — like the other two league crons, this has to be deployed
// before a pg_cron job can point at it. Suggested, once deployed:
//
//   select cron.schedule('league-standings', '0 4 1 * *', $$
//     select net.http_post(
//       url := 'https://sportpool.io/api/cron/league-standings',
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

  // Own kill switch, same shape as the other league crons: disabled only if
  // explicitly false, so an absent row is enabled.
  const { data: enabledRow } = await admin
    .from('sync_settings')
    .select('setting_value')
    .eq('setting_key', 'league_standings_poll_enabled')
    .maybeSingle()
  if (enabledRow?.setting_value === false || enabledRow?.setting_value === 'false') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'league_standings_poll_enabled=false' })
  }

  const { data: seasons, error } = await admin
    .from('league_seasons')
    .select('season_id, competition_name, external_league_id, external_season')
    .range(0, 999)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const results: Array<Record<string, unknown>> = []
  let failed = 0

  for (const s of (seasons ?? []) as Array<{
    season_id: string; competition_name: string
    external_league_id: number; external_season: number
  }>) {
    // A season whose table is already frozen is skipped: re-reading it cannot
    // change a score and would spend a call to overwrite a row nothing reads.
    const { count: frozen } = await admin
      .from('league_standings_final')
      .select('*', { count: 'exact', head: true })
      .eq('season_id', s.season_id)
    if ((frozen ?? 0) > 0) {
      results.push({ league: s.competition_name, skipped: 'season is frozen' })
      continue
    }

    const r = await syncLeagueStandings(admin, {
      seasonId: s.season_id,
      externalLeagueId: s.external_league_id,
      externalSeason: s.external_season,
    })

    // Report the bands AFTER the write, because the bands are the reason this
    // route exists and "20 rows written" says nothing about whether they moved.
    const { data: bands } = await admin.rpc('league_default_bands', { p_season_id: s.season_id })

    if (r.error) failed++
    results.push({
      league: s.competition_name,
      written: r.written,
      unmapped: r.unmapped.length,
      bands,
      error: r.error,
    })
    // One league failing must not stop the rest — they are independent
    // competitions sharing only a cron.
  }

  return NextResponse.json({ ok: failed === 0, seasons: results.length, failed, results })
}
