// ============================================================================
// Analytics sweep cron — DRAFT, NOT YET REGISTERED OR ENABLED.
//
// Background job that keeps the entry_xp_state analytics columns (form, streak,
// hit rate, exact count, crowd stats, level, xp) fresh — decoupled from the
// scoring sweep so it CANNOT endanger scoring/leaderboard correctness.
//
// Event-driven, not blind: it only recomputes pools whose entries were
// rescored since the last run. It detects that via pool_entries.last_rank_update
// (the scoring sweep already stamps this on every entry whose values changed —
// the diff-aware write means it only moves when something actually changed). So
// between matches this does ~nothing; during a live match it recomputes only
// the pools whose scores moved.
//
// SAFETY / ROLLOUT:
//   - Kill switch: sync_settings key 'analytics_sweep_enabled' (default false).
//     Returns immediately when off. Turn on only after backfill + parity check.
//   - NOT in vercel.json yet — even deployed, it will not fire until registered.
//   - Writes ONLY entry_xp_state analytics columns. Nothing reads them until
//     the separate, later read-path flip. So while this runs, it's invisible.
//   - To register later (calm window): add to vercel.json crons, e.g.
//       { "path": "/api/cron/analytics-sweep", "schedule": "* * * * *" }
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { writePoolEntryAnalytics } from '@/lib/analytics/entryAnalytics'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  const startedAt = new Date().toISOString()

  // Auth: cron bearer secret (mirror sync-fixtures).
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`
  if (!isCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Kill switch — default OFF. Stays a no-op until explicitly enabled.
  const { data: enabledRow } = await admin
    .from('sync_settings')
    .select('setting_value')
    .eq('setting_key', 'analytics_sweep_enabled')
    .maybeSingle()
  const enabled = enabledRow?.setting_value === true || enabledRow?.setting_value === 'true'
  if (!enabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'analytics_sweep_enabled=false' })
  }

  // Concurrency lock — skip if another run holds it. Without this, overlapping
  // runs (1-min schedule, up to 120s runtime) both read the same watermark and
  // race the blind upsert. TTL (150s) is deliberately > maxDuration (120s): a
  // live run's lease therefore can never expire while it's still running, so no
  // successor can acquire mid-run and the unconditional release in finally only
  // ever clears THIS run's own lease. On a hard crash the TTL is the backstop
  // (next run waits at most ~30s past maxDuration). (Audit #5 + re-audit NEW-1.)
  const { data: gotLock } = await admin.rpc('try_acquire_analytics_lock', { p_ttl_seconds: 150 })
  if (gotLock !== true) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'another analytics run in flight' })
  }

  try {
    // Last run watermark.
    const { data: lastRunRow } = await admin
      .from('sync_settings')
      .select('setting_value')
      .eq('setting_key', 'analytics_last_run_at')
      .maybeSingle()
    const lastRun = (lastRunRow?.setting_value as string) || '1970-01-01T00:00:00Z'
    const lastRunMs = new Date(lastRun).getTime()

    const setWatermark = async (ts: string) =>
      admin.from('sync_settings').upsert(
        { setting_key: 'analytics_last_run_at', setting_value: ts },
        { onConflict: 'setting_key' },
      )

    // Detect changed pools via a server-side aggregate: DISTINCT changed pools
    // with their newest change, oldest-first, capped to MAX_POOLS_PER_RUN.
    // Aggregating in SQL (not fetching per-entry rows) removes the PostgREST
    // 1000-row cap that previously truncated bursts and caused missed pools
    // (audit #1/#2), and compares timestamps as real timestamptz (audit #6).
    const MAX_POOLS_PER_RUN = 60
    const { data: changedPools, error: detectErr } = await admin.rpc(
      'get_changed_analytics_pools',
      { p_since: lastRun, p_limit: MAX_POOLS_PER_RUN },
    )
    if (detectErr) {
      return NextResponse.json({ ok: false, error: `detect failed: ${detectErr.message}` }, { status: 500 })
    }
    const pools = (changedPools ?? []) as Array<{ pool_id: string; newest_change: string }>

    if (pools.length === 0) {
      await setWatermark(startedAt) // fully caught up
      return NextResponse.json({ ok: true, pools: 0, note: 'no pools changed since last run' })
    }

    // If we got a full page, MORE changed pools may exist beyond the cap → we
    // are NOT caught up; advance only over completed work.
    const cappedMore = pools.length === MAX_POOLS_PER_RUN

    // Process (bounded concurrency). writePoolEntryAnalytics THROWS on write
    // failure, so a rejected pool is not marked succeeded → not skipped.
    const succeeded = new Set<string>()
    const errors: Array<{ pool_id: string; message: string }> = []
    let written = 0
    const BATCH = 10
    for (let i = 0; i < pools.length; i += BATCH) {
      const batch = pools.slice(i, i + BATCH)
      const results = await Promise.allSettled(batch.map((p) => writePoolEntryAnalytics(admin, p.pool_id)))
      results.forEach((r, idx) => {
        const p = batch[idx]
        if (r.status === 'fulfilled') { succeeded.add(p.pool_id); written += r.value }
        else errors.push({ pool_id: p.pool_id, message: String(r.reason?.message ?? r.reason) })
      })
    }

    // Advance the watermark over the contiguous run of successes (oldest-first,
    // epoch comparison). Stop at the first pool that failed/wasn't done → it and
    // everything after is retried next run (never skipped). Only jump to
    // startedAt when we got the COMPLETE change set (not a full page) AND it all
    // succeeded. Minus a 2s overlap so timestamp ties can't slip the > filter.
    const SAFETY_LAG_MS = 2000
    let safeMs = lastRunMs
    for (const p of pools) {
      if (succeeded.has(p.pool_id)) safeMs = new Date(p.newest_change).getTime()
      else break
    }
    const caughtUp = !cappedMore && errors.length === 0 && succeeded.size === pools.length
    const newWatermarkMs = caughtUp ? new Date(startedAt).getTime() : safeMs - SAFETY_LAG_MS
    let newWatermark = lastRun
    if (newWatermarkMs > lastRunMs) {
      newWatermark = new Date(newWatermarkMs).toISOString()
      await setWatermark(newWatermark)
    }

    return NextResponse.json({
      ok: true,
      startedAt,
      pools_changed: pools.length,
      pools_succeeded: succeeded.size,
      capped_more: cappedMore,
      entries_written: written,
      watermark_advanced_to: newWatermark,
      errors,
    })
  } finally {
    await admin.rpc('release_analytics_lock')
  }
}
