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
import { snapshotPoolRanks } from '@/lib/scoring/snapshotRanks'
import { linkKnockoutFixtures } from '@/lib/integrations/apiFootball/linkKnockoutFixtures'

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

  // --- Auto-link knockout fixtures whose bracket teams have paired ----------
  // Replaces the manual per-round scripts/map-knockout-fixtures.ts. Rate-limited
  // (a not-yet-published fixture must not re-fetch the season feed every minute)
  // and lead-time bounded (leadDays: only look within ~2 days of kickoff, when the
  // api-football fixture reliably exists). Auto-links ONLY when exactly one
  // candidate matches; anything ambiguous is surfaced as an error, never guessed.
  // Runs before the fetch below so a freshly-linked match is score-synced this run.
  const KNOCKOUT_LINK_INTERVAL_MS = 15 * 60 * 1000
  const { data: linkRow } = await admin
    .from('sync_settings')
    .select('setting_value')
    .eq('setting_key', 'knockout_link_last_attempt')
    .maybeSingle()
  const lastLinkAttempt = linkRow?.setting_value ? new Date(linkRow.setting_value as string).getTime() : 0
  if (now - lastLinkAttempt >= KNOCKOUT_LINK_INTERVAL_MS) {
    // Stamp first so a repeated failure can't hammer the api every minute.
    await admin
      .from('sync_settings')
      .upsert({ setting_key: 'knockout_link_last_attempt', setting_value: nowIso, updated_at: nowIso }, { onConflict: 'setting_key' })
    try {
      const link = await linkKnockoutFixtures(admin, { tournamentId, league, season, commit: true, leadDays: 2 })
      if (link.linked.length > 0) {
        console.log(
          `[sync-fixtures] auto-linked ${link.linked.length} knockout fixture(s): ` +
            link.linked.map((l) => `#${l.match_number} ${l.label}→${l.external_match_id}`).join(', ')
        )
      }
      for (const a of link.ambiguous) {
        errors.push({
          stage: 'link_knockout_ambiguous',
          message: `#${a.match_number} ${a.label}: ${a.candidates} candidate fixtures — manual link needed`,
          details: a,
        })
      }
    } catch (e) {
      errors.push({ stage: 'link_knockout', message: errMsg(e) })
    }
  }

  // Find matches potentially live right now
  const { data: ourMatches, error: matchErr } = await admin
    .from('matches')
    .select('match_id, match_number, stage, match_date, home_team_id, away_team_id, status, is_completed, home_score_ft, away_score_ft, home_score_pso, away_score_pso, live_minute, live_period, winner_team_id, data_source, external_match_id')
    .eq('tournament_id', tournamentId)
    .not('external_match_id', 'is', null)
    .order('match_date', { ascending: true })
  if (matchErr) {
    errors.push({ stage: 'fetch_matches', message: matchErr.message })
    return finishRun(admin, { startedAt, errors, triggeredBy })
  }

  // Pre-run live state, from the DB snapshot above (before this run's updates).
  // Used to detect the start of a new matchday for the rank snapshot below —
  // the automated equivalent of MatchesTab's "no other match currently live"
  // guard on the manual set-match-live path.
  const someMatchAlreadyLive = (ourMatches || []).some((m) => m.status === 'live')

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
  const changedMatchIds = new Set<string>()  // which matches' scores moved (drives the per-match recalc hint)
  let anyNewlyLive = false  // a match transitioned scheduled→live this run (drives the rank snapshot)

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
    // Detect a scheduled→live transition (kickoff) for the matchday rank snapshot.
    if (ours.status !== 'live' && isLiveStatus(fixture.fixture.status.short)) {
      anyNewlyLive = true
    }

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
        changedMatchIds.add(ours.match_id)
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

  // Rank snapshot — automated parity with the manual "set match live" path
  // (MatchesTab → /api/pools/snapshot-ranks). When a new matchday's first match
  // goes live and nothing was live before this run, snapshot current_rank →
  // previous_rank so the leaderboard movement (▲/▼) arrows measure per-matchday
  // movement. MUST run before the recalc below, so the baseline is the rank as
  // it stood at the end of the previous matchday, not after this run's recalc
  // moves it. Wrapped so a failure can never break the sync or the sweep.
  if (anyNewlyLive && !someMatchAlreadyLive) {
    try {
      const { data: snapPools } = await admin
        .from('pools')
        .select('pool_id')
        .eq('tournament_id', tournamentId)
      const snapPoolIds = (snapPools ?? []).map((p) => p.pool_id)
      const snapped = await snapshotPoolRanks(admin, snapPoolIds)
      console.log(`[sync-fixtures] rank snapshot: ${snapped} entries across ${snapPoolIds.length} pools`)
    } catch (e) {
      errors.push({ stage: 'snapshot_ranks', message: errMsg(e) })
    }
  }

  // Recalculate leaderboards on ANY score change (live or final). The recalc
  // is idempotent. Batched: each recalc fans out ~12 queries plus a
  // match_scores delete+insert per entry, so an unbounded Promise.all across
  // every pool slams the DB with thousands of concurrent queries exactly when
  // live-match traffic peaks. Batch size keeps the full sweep comfortably
  // under the 1-minute cron interval. Skipped when nothing changed.
  //
  // Overlap guard: a lease in sync_settings (acquired atomically via RPC, TTL
  // so a crashed run can't deadlock us) ensures at most one sweep is ever in
  // flight — overlapping sweeps compounding under load is what melted the DB
  // after the opening match. A run that *can't* get the lease sets
  // sweep_pending instead of dropping the work, and the next run picks it up
  // even if no new score change occurred (a dropped final-whistle sweep means
  // unscored matches).
  // ---------------------------------------------------------------
  // Fix #1 — time-boxed, resumable sweep (flag: sweep_time_box_enabled)
  // ---------------------------------------------------------------
  // ROOT CAUSE of the completion-crash: a match-completion sweep recomputes ALL
  // pools (incl. the heavy bracket pools) and on Medium can run 2-4 min — longer
  // than the 60s cron interval. Runs then stack/defer and pin the DB at ~100%
  // for ~20 min = outage (observed in sync_runs: 78s→268s sweeps after a
  // completion). This bounds each run to a wall-clock budget: process pools until
  // the budget is hit, persist the REMAINING pool_ids to a cursor, and let the
  // next run continue. No single run exceeds the interval → no pileup. Every pool
  // is still recomputed (correctness preserved), just spread across runs — a pool
  // may lag a run during a heavy completion (site stays up vs. crashes).
  // Also trims the 600s lock TTL (a hung run shouldn't block for 10 min).
  // Flag OFF → byte-for-byte today's behaviour (the `else` branches below).
  const { data: tbRow } = await admin
    .from('sync_settings').select('setting_value').eq('setting_key', 'sweep_time_box_enabled').maybeSingle()
  const timeBox = tbRow?.setting_value === true || tbRow?.setting_value === 'true'
  const SWEEP_BUDGET_MS = 40_000
  const lockTtl = timeBox ? 180 : 600

  // Cursor = pools still to process from a previous time-boxed run.
  let cursorPoolIds: string[] = []
  if (timeBox) {
    const { data: curRow } = await admin
      .from('sync_settings').select('setting_value').eq('setting_key', 'sweep_cursor').maybeSingle()
    if (Array.isArray(curRow?.setting_value)) cursorPoolIds = curRow.setting_value as string[]
  }

  let sweepPending = false
  if (!scoresChanged && newlyCompleted.length === 0 && cursorPoolIds.length === 0) {
    const { data: pendingRow } = await admin
      .from('sync_settings')
      .select('setting_value')
      .eq('setting_key', 'sweep_pending')
      .maybeSingle()
    sweepPending = pendingRow?.setting_value === true
  }

  let sweepNote: string | null = null
  if (scoresChanged || newlyCompleted.length > 0 || sweepPending || cursorPoolIds.length > 0) {
    const { data: gotLock, error: lockErr } = await admin.rpc('try_acquire_sweep_lock', { p_ttl_seconds: lockTtl })
    if (lockErr) {
      errors.push({ stage: 'sweep_lock', message: lockErr.message })
    }
    if (gotLock === true) {
      try {
        // A fresh score change/completion supersedes any in-progress drain.
        const freshChange = scoresChanged || newlyCompleted.length > 0
        const draining = !freshChange && (sweepPending || cursorPoolIds.length > 0)

        // Per-match hint: when exactly one match's score moved during a live
        // update (the common case — one goal), scope the match_scores rewrite
        // to that match. Completions, multi-match runs, and deferred/drain
        // sweeps always do the full rewrite — they're the consistency authority.
        const singleChangedMatchId =
          newlyCompleted.length === 0 && !draining && changedMatchIds.size === 1
            ? [...changedMatchIds][0]
            : undefined

        const { data: allPools } = await admin
          .from('pools')
          .select('pool_id, prediction_mode')
          .eq('tournament_id', tournamentId)
        // Bracket scoring cannot change from a live in-progress scoreline — only
        // from completed matches. Skip bracket pools on live-only sweeps; include
        // them on completions and on any deferred/drain catch-up.
        const liveOnlySweep = newlyCompleted.length === 0 && !draining
        let pools = (allPools ?? []).filter(
          (p) => !liveOnlySweep || p.prediction_mode !== 'bracket_picker'
        )
        // Pure drain (no fresh change): restrict to the cursor's remaining pools.
        if (timeBox && draining && cursorPoolIds.length > 0) {
          const remain = new Set(cursorPoolIds)
          pools = pools.filter((p) => remain.has(p.pool_id))
        }

        const startMs = Date.now()
        const processed = new Set<string>()
        const RECALC_BATCH_SIZE = 25
        for (let i = 0; i < pools.length; i += RECALC_BATCH_SIZE) {
          if (timeBox && Date.now() - startMs > SWEEP_BUDGET_MS) break
          await Promise.all(pools.slice(i, i + RECALC_BATCH_SIZE).map(async (p) => {
            try {
              await recalculatePool({ poolId: p.pool_id, matchId: singleChangedMatchId })
              processed.add(p.pool_id)
            } catch (e) {
              errors.push({ stage: 'recalculate', message: errMsg(e), details: { pool_id: p.pool_id } })
            }
          }))
        }

        if (timeBox) {
          // Persist the remainder so the next run resumes instead of redoing all.
          const remaining = pools.filter((p) => !processed.has(p.pool_id)).map((p) => p.pool_id)
          await admin.from('sync_settings').update({ setting_value: remaining, updated_at: nowIso }).eq('setting_key', 'sweep_cursor')
          await admin.from('sync_settings').update({ setting_value: remaining.length > 0, updated_at: nowIso }).eq('setting_key', 'sweep_pending')
          sweepNote = remaining.length > 0
            ? `time-boxed: ${processed.size} pools done, ${remaining.length} deferred to next run`
            : (draining ? 'drained deferred sweep' : null)
        } else {
          await admin
            .from('sync_settings')
            .update({ setting_value: false, updated_at: nowIso })
            .eq('setting_key', 'sweep_pending')
          if (sweepPending) sweepNote = 'ran sweep deferred from a previous run'
        }
      } finally {
        await admin.rpc('release_sweep_lock')
      }
    } else {
      // Another sweep is in flight — defer instead of dropping.
      await admin
        .from('sync_settings')
        .update({ setting_value: true, updated_at: nowIso })
        .eq('setting_key', 'sweep_pending')
      sweepNote = 'sweep skipped: another sweep in flight (deferred via sweep_pending)'
    }
  }

  return finishRun(admin, {
    startedAt,
    errors,
    triggeredBy,
    fixturesSeen,
    fixturesChanged,
    fixturesSkippedManual,
    notes: [
      newlyCompleted.length > 0 ? `cascade fired for ${newlyCompleted.length} match(es)` : null,
      sweepNote,
    ].filter(Boolean).join('; ') || null,
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
