import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/auth'
import { backfillResolvedBrackets, backfillBonusInputs } from '@/lib/scoring/shadowBrackets'

export const dynamic = 'force-dynamic'
// Scoped runs process only the handful of pools with recent prediction activity,
// so they finish in seconds; the ceiling is headroom for a pick-window burst.
export const maxDuration = 300

// =============================================================
// GET/POST /api/cron/shadow-materialize
// Keeps the SHADOW bonus-input materialization fresh incrementally, so the
// automated shadow bonus scoring never drifts stale (new entries, edited
// predictions, progressive round picks). COMPLETELY SEPARATE from production
// scoring: reads prod tables read-only, writes ONLY shadow_* tables.
//
// Each run: detect pools whose predictions changed since a watermark, then
// re-materialize + re-score ONLY those pools. Nothing changed → cheap no-op.
// Auth: Bearer <CRON_SECRET> (the shadow-materialize cron) or a super admin.
// =============================================================
export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}

const CAP = 40 // max pools per run — bursts spill to the next run (watermark not advanced)

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const isCron = !!cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`

  let admin
  if (!isCron) {
    const auth = await requireSuperAdmin()
    if (auth.error) return auth.error
    admin = createAdminClient()
  } else {
    admin = createAdminClient()
  }

  // Kill switch — disabled only if explicitly set false (absent = enabled).
  const { data: enabledRow } = await admin
    .from('sync_settings').select('setting_value').eq('setting_key', 'shadow_materialize_enabled').maybeSingle()
  if (enabledRow?.setting_value === false || enabledRow?.setting_value === 'false') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'shadow_materialize_enabled=false' })
  }

  const tournamentId =
    process.env.API_FOOTBALL_TOURNAMENT_ID || '00000000-0000-0000-0000-000000000001'

  // Watermark = last successful materialize. Capture the run start BEFORE detection
  // so any edit landing mid-run is (idempotently) re-picked-up next run, never missed.
  const runIso = new Date().toISOString()
  const { data: wmRow } = await admin
    .from('sync_settings').select('setting_value').eq('setting_key', 'shadow_materialize_watermark').maybeSingle()
  const watermark = (wmRow?.setting_value as string) || '2000-01-01T00:00:00.000Z'

  // Detect pools whose predictions changed since the watermark.
  const { data: changed, error: detErr } = await admin.rpc('shadow_pools_needing_materialize', { p_since: watermark })
  if (detErr) {
    return NextResponse.json({ ok: false, stage: 'detect', error: detErr.message }, { status: 500 })
  }
  const poolIds: string[] = (changed ?? []).map((r: { pool_id: string }) => r.pool_id)

  const advanceWatermark = async () =>
    admin.from('sync_settings').upsert(
      { setting_key: 'shadow_materialize_watermark', setting_value: runIso, updated_at: runIso },
      { onConflict: 'setting_key' },
    )

  if (poolIds.length === 0) {
    await advanceWatermark()
    return NextResponse.json({ ok: true, changedPools: 0, note: 'nothing to materialize' })
  }

  const batch = poolIds.slice(0, CAP)
  const deferred = poolIds.length - batch.length

  try {
    // 1) Re-materialize inputs for the changed pools. Brackets FIRST (match-engine,
    //    WITH-conduct), then bonus inputs (both modes; only updates predicted_winner
    //    so it preserves the WITH-conduct home/away written by the bracket step).
    const brackets = await backfillResolvedBrackets(admin, tournamentId, { poolIds: batch })
    const bonus = await backfillBonusInputs(admin, tournamentId, { poolIds: batch })

    // 2) Re-score those pools from the fresh inputs (both RPCs are scoped + change-only).
    const { error: bonErr } = await admin.rpc('shadow_calculate_bonuses', { p_pool_ids: batch })
    if (bonErr) throw new Error(`shadow_calculate_bonuses: ${bonErr.message}`)
    const { error: finErr } = await admin.rpc('shadow_finalize_totals', { p_pool_ids: batch })
    if (finErr) throw new Error(`shadow_finalize_totals: ${finErr.message}`)

    // Advance the watermark ONLY when the whole changed set was processed; a
    // deferred remainder is re-detected (and re-processed) on the next run.
    if (deferred === 0) await advanceWatermark()

    return NextResponse.json({
      ok: true,
      changedPools: poolIds.length,
      processed: batch.length,
      deferred,
      brackets,
      bonus,
    })
  } catch (e) {
    // Do NOT advance the watermark — the failed pools are retried next run.
    return NextResponse.json(
      { ok: false, stage: 'materialize', processed: 0, changedPools: poolIds.length, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
