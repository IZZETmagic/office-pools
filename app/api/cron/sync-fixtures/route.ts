import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/auth'
import {
  ApiFootballClient,
  getLastQuota,
} from '@/lib/integrations/apiFootball/client'
import {
  fixtureToMatchUpdate,
  eventsToConduct,
  isLiveStatus,
  isFinalStatus,
  type OurMatchRow,
} from '@/lib/integrations/apiFootball/mappers'
import type { ApiFootballFixture } from '@/lib/integrations/apiFootball/types'
import { recalculatePool } from '@/lib/scoring/recalculate'

export const dynamic = 'force-dynamic'

// Window during which a match is considered "potentially live" and worth
// touching with the sync. Wide enough to cover ET + PSO + breaks.
const LIVE_WINDOW_BEFORE_MS = 30 * 60 * 1000          // 30 min before kickoff
const LIVE_WINDOW_AFTER_MS = 4 * 60 * 60 * 1000       // 4h after kickoff

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  const startedAt = new Date().toISOString()
  const errors: Array<{ stage: string; message: string; details?: unknown }> = []

  // Auth: cron bearer or super admin
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`
  let triggeredBy: 'cron' | 'admin' = 'cron'
  let admin
  if (!isCron) {
    const auth = await requireSuperAdmin()
    if (auth.error) return auth.error
    triggeredBy = 'admin'
    admin = createAdminClient()
  } else {
    admin = createAdminClient()
  }

  // Kill switch
  const { data: setting } = await admin
    .from('sync_settings')
    .select('setting_value')
    .eq('setting_key', 'sync_enabled')
    .maybeSingle()
  const syncEnabled = setting?.setting_value === true || setting?.setting_value === 'true'
  if (!syncEnabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'sync_enabled=false' })
  }

  // Defaults are baked in for the FIFA World Cup 2026 in our Supabase.
  // Override via env if you need to point sync at a different competition.
  const tournamentId =
    process.env.API_FOOTBALL_TOURNAMENT_ID || '00000000-0000-0000-0000-000000000001'
  const league = parseInt(process.env.API_FOOTBALL_LEAGUE_ID ?? '1', 10)
  const season = parseInt(process.env.API_FOOTBALL_SEASON ?? '2026', 10)

  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  // Find matches potentially live right now
  const { data: ourMatches, error: matchErr } = await admin
    .from('matches')
    .select('match_id, match_number, stage, match_date, home_team_id, away_team_id, status, is_completed, home_score_ft, away_score_ft, home_score_pso, away_score_pso, live_minute, live_period, data_source, external_match_id')
    .eq('tournament_id', tournamentId)
    .not('external_match_id', 'is', null)
    .order('match_date', { ascending: true })
  if (matchErr) {
    errors.push({ stage: 'fetch_matches', message: matchErr.message })
    return finishRun(admin, { startedAt, errors, triggeredBy })
  }

  const candidates = (ourMatches || []).filter((m) => {
    const t = new Date(m.match_date).getTime()
    return t - LIVE_WINDOW_BEFORE_MS <= now && now <= t + LIVE_WINDOW_AFTER_MS
  })

  if (candidates.length === 0) {
    return finishRun(admin, {
      startedAt,
      errors,
      triggeredBy,
      fixturesSeen: 0,
      fixturesChanged: 0,
      fixturesSkippedManual: 0,
      notes: 'no live window matches',
    })
  }

  // Pull team mapping (external -> our) once
  const { data: teams } = await admin
    .from('teams')
    .select('team_id, external_team_id')
    .eq('tournament_id', tournamentId)
  const teamIdByExternal = new Map<number, string>()
  for (const t of teams || []) {
    if (t.external_team_id) teamIdByExternal.set(t.external_team_id, t.team_id)
  }

  // Fetch today's fixtures (one round-trip)
  const todayDate = isoDate(new Date(now))
  let fixtures: ApiFootballFixture[] = []
  try {
    fixtures = await ApiFootballClient.getFixtures({ league, season, date: todayDate })
  } catch (e) {
    errors.push({ stage: 'fetch_fixtures', message: errMsg(e) })
  }
  // Map external fixture id -> fixture
  const fixtureByExt = new Map<string, ApiFootballFixture>()
  for (const f of fixtures) fixtureByExt.set(f.fixture.id.toString(), f)

  let fixturesSeen = 0
  let fixturesChanged = 0
  let fixturesSkippedManual = 0
  const newlyCompleted: Array<{ match_id: string; stage: string }> = []
  let scoresChanged = false  // any FT or PSO score moved this run → triggers live leaderboard recalc

  // Process candidates that have a corresponding fixture today
  for (const ours of candidates) {
    if (!ours.external_match_id) continue
    fixturesSeen++

    if (ours.data_source === 'manual') {
      fixturesSkippedManual++
      continue
    }

    const fx = fixtureByExt.get(ours.external_match_id)
    if (!fx) {
      // Fall back to direct fetch by id (covers post-midnight / multi-day fixtures)
      try {
        const direct = await ApiFootballClient.getFixtureById(parseInt(ours.external_match_id, 10))
        if (!direct) continue
        fixtureByExt.set(ours.external_match_id, direct)
      } catch (e) {
        errors.push({ stage: 'fetch_fixture_by_id', message: errMsg(e), details: { match_id: ours.match_id } })
        continue
      }
    }
    const fixture = fixtureByExt.get(ours.external_match_id)!

    // Build diff payload
    const update = fixtureToMatchUpdate(fixture, ours as OurMatchRow, { now: nowIso, teamIdByExternal })
    const wasCompleted = !!ours.is_completed
    const becomesCompleted = isFinalStatus(fixture.fixture.status.short)

    if (update) {
      const { error: updErr } = await admin
        .from('matches')
        .update({ ...update, last_synced_at: nowIso })
        .eq('match_id', ours.match_id)
        .eq('data_source', 'api')   // defense-in-depth lock check
      if (updErr) {
        errors.push({ stage: 'update_match', message: updErr.message, details: { match_id: ours.match_id } })
        continue
      }
      fixturesChanged++
      if (!wasCompleted && becomesCompleted) {
        newlyCompleted.push({ match_id: ours.match_id, stage: ours.stage })
      }
      if (
        update.home_score_ft !== undefined ||
        update.away_score_ft !== undefined ||
        update.home_score_pso !== undefined ||
        update.away_score_pso !== undefined
      ) {
        scoresChanged = true
      }
    }

    // Pull events for live or recently-completed matches and upsert conduct
    const fxStatus = fixture.fixture.status.short
    const wantEvents = isLiveStatus(fxStatus) || isFinalStatus(fxStatus)
    if (wantEvents) {
      try {
        const evts = await ApiFootballClient.getFixtureEvents(fixture.fixture.id)
        const conductRows = eventsToConduct(fixture, evts, ours.match_id, { now: nowIso, teamIdByExternal })
        if (conductRows.length > 0) {
          const { error: condErr } = await admin
            .from('match_conduct')
            .upsert(conductRows, { onConflict: 'match_id,team_id' })
          if (condErr) {
            errors.push({ stage: 'upsert_conduct', message: condErr.message, details: { match_id: ours.match_id } })
          }
        }
      } catch (e) {
        errors.push({ stage: 'fetch_events', message: errMsg(e), details: { match_id: ours.match_id } })
      }
    }
  }

  // Cascade team advancement for newly completed matches.
  if (newlyCompleted.length > 0) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || originFromRequest(request)
    for (const m of newlyCompleted) {
      try {
        const advRes = await fetch(`${baseUrl}/api/admin/advance-teams`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${cronSecret ?? ''}`,
          },
          body: JSON.stringify({
            trigger: m.stage === 'group' ? 'group_complete' : 'knockout_result',
            match_id: m.match_id,
          }),
        })
        if (!advRes.ok) {
          errors.push({ stage: 'advance_teams', message: `status ${advRes.status}`, details: { match_id: m.match_id } })
        }
      } catch (e) {
        errors.push({ stage: 'advance_teams', message: errMsg(e), details: { match_id: m.match_id } })
      }
    }
  }

  // Recalculate leaderboards on ANY score change (live or final). The recalc
  // is idempotent and reads match_scores in one pass per pool, so running it
  // every minute during a live match is fine. Skipped when nothing changed.
  if (scoresChanged || newlyCompleted.length > 0) {
    const { data: pools } = await admin
      .from('pools')
      .select('pool_id')
      .eq('tournament_id', tournamentId)
    if (pools) {
      await Promise.all(pools.map(async (p) => {
        try {
          await recalculatePool({ poolId: p.pool_id })
        } catch (e) {
          errors.push({ stage: 'recalculate', message: errMsg(e), details: { pool_id: p.pool_id } })
        }
      }))
    }
  }

  return finishRun(admin, {
    startedAt,
    errors,
    triggeredBy,
    fixturesSeen,
    fixturesChanged,
    fixturesSkippedManual,
    notes: newlyCompleted.length > 0 ? `cascade fired for ${newlyCompleted.length} match(es)` : null,
  })
}

async function finishRun(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    startedAt: string
    errors: Array<unknown>
    triggeredBy: 'cron' | 'admin'
    fixturesSeen?: number
    fixturesChanged?: number
    fixturesSkippedManual?: number
    notes?: string | null
  }
) {
  const finishedAt = new Date().toISOString()
  const quota = getLastQuota()
  const insertRow = {
    started_at: args.startedAt,
    finished_at: finishedAt,
    fixtures_seen: args.fixturesSeen ?? 0,
    fixtures_changed: args.fixturesChanged ?? 0,
    fixtures_skipped_manual: args.fixturesSkippedManual ?? 0,
    errors: args.errors,
    triggered_by: args.triggeredBy,
    quota_remaining: quota.requestsRemaining,
    notes: args.notes ?? null,
  }
  await admin.from('sync_runs').insert(insertRow)
  return NextResponse.json({
    ok: args.errors.length === 0,
    ...insertRow,
  })
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function originFromRequest(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  return host ? `${proto}://${host}` : 'http://localhost:3000'
}
