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

  // Last run watermark.
  const { data: lastRunRow } = await admin
    .from('sync_settings')
    .select('setting_value')
    .eq('setting_key', 'analytics_last_run_at')
    .maybeSingle()
  const lastRun = (lastRunRow?.setting_value as string) || '1970-01-01T00:00:00Z'

  // Which pools changed since last run? Entries rescored since lastRun →
  // their member_ids → pool_ids.
  const { data: changedEntries } = await admin
    .from('pool_entries')
    .select('member_id')
    .gt('last_rank_update', lastRun)
  const changedMemberIds = Array.from(
    new Set(((changedEntries ?? []) as Array<{ member_id: string }>).map((e) => e.member_id)),
  )

  let poolIds: string[] = []
  if (changedMemberIds.length > 0) {
    const { data: memberRows } = await admin
      .from('pool_members')
      .select('pool_id')
      .in('member_id', changedMemberIds)
    poolIds = Array.from(
      new Set(((memberRows ?? []) as Array<{ pool_id: string }>).map((m) => m.pool_id)),
    )
  }

  // Stamp the new watermark up front (so a slow run doesn't double-process the
  // same window next tick; at-least-once is fine — recompute is idempotent).
  await admin
    .from('sync_settings')
    .upsert({ setting_key: 'analytics_last_run_at', setting_value: startedAt }, { onConflict: 'setting_key' })

  if (poolIds.length === 0) {
    return NextResponse.json({ ok: true, pools: 0, note: 'no pools changed since last run' })
  }

  // Recompute changed pools in batches (bounded concurrency).
  const errors: Array<{ pool_id: string; message: string }> = []
  let written = 0
  const BATCH = 10
  for (let i = 0; i < poolIds.length; i += BATCH) {
    const batch = poolIds.slice(i, i + BATCH)
    const results = await Promise.allSettled(batch.map((pid) => writePoolEntryAnalytics(admin, pid)))
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') written += r.value
      else errors.push({ pool_id: batch[idx], message: String(r.reason?.message ?? r.reason) })
    })
  }

  return NextResponse.json({
    ok: true,
    startedAt,
    pools_processed: poolIds.length,
    entries_written: written,
    errors,
  })
}
