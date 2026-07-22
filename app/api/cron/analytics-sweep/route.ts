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
import { fetchAllRows } from '@/lib/supabase/paginate'
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
  // Paged: a bulk recalc (e.g. a full re-score) stamps last_rank_update on far more than
  // 1,000 entries at once. Unpaged, this read caps at 1,000 while the watermark below still
  // advances to now — so the truncated-away pools would NEVER get swept. Must page.
  const changedEntries = await fetchAllRows<{ member_id: string }>(
    (from, to) =>
      admin.from('pool_entries').select('member_id').gt('last_rank_update', lastRun).range(from, to),
    'analytics-sweep changed entries'
  )
  const changedMemberIds = Array.from(new Set(changedEntries.map((e) => e.member_id)))

  let poolIds: string[] = []
  if (changedMemberIds.length > 0) {
    // changedMemberIds can be several thousand after paging above; a single `.in()` would
    // both overflow the request URL and cap its result at 1,000. Chunk the id list.
    const CHUNK = 200
    const poolIdSet = new Set<string>()
    for (let i = 0; i < changedMemberIds.length; i += CHUNK) {
      const slice = changedMemberIds.slice(i, i + CHUNK)
      const rows = await fetchAllRows<{ pool_id: string }>(
        (from, to) => admin.from('pool_members').select('pool_id').in('member_id', slice).range(from, to),
        'analytics-sweep member->pool'
      )
      rows.forEach((m) => poolIdSet.add(m.pool_id))
    }
    poolIds = Array.from(poolIdSet)
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
