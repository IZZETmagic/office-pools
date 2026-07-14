import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/auth'
import { backfillResolvedBrackets, backfillBonusInputs, reconcileVersionedBrackets } from '@/lib/scoring/shadowBrackets'

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

  // Durable P1: version-driven predicted-bracket reconcile into shadow_entry_bracket
  // (the match engine's OWN table — pull-based, catches edits, new/mobile submissions,
  // and engine-version bumps). Runs every pass, independent of the watermark below;
  // a no-op when nothing drifted. Shadow-only; never throws into the materialize flow.
  const bracketReconcile = await reconcileVersionedBrackets(admin, tournamentId, { cap: 500 })
    .catch((e) => ({ flagged: 0, resolved: 0, errors: [e instanceof Error ? e.message : String(e)] }))

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

  // Completed matches whose predictions were edited since the watermark (the
  // ...024 edge — a locked-match prediction change): these need a shadow MATCH
  // re-score, which refreshing bonus inputs alone would miss.
  const { data: changedM } = await admin.rpc('shadow_matches_needing_rescore', { p_since: watermark })
  const matchIds: string[] = (changedM ?? []).map((r: { match_id: string }) => r.match_id)

  const advanceWatermark = async () =>
    admin.from('sync_settings').upsert(
      { setting_key: 'shadow_materialize_watermark', setting_value: runIso, updated_at: runIso },
      { onConflict: 'setting_key' },
    )

  if (poolIds.length === 0 && matchIds.length === 0) {
    await advanceWatermark()
    return NextResponse.json({ ok: true, changedPools: 0, changedMatches: 0, bracketReconcile, note: 'nothing to materialize' })
  }

  const batch = poolIds.slice(0, CAP)
  const deferred = poolIds.length - batch.length

  try {
    // 1) Re-materialize inputs for the changed pools. Brackets FIRST (match-engine,
    //    WITH-conduct), then bonus inputs (both modes; only updates predicted_winner
    //    so it preserves the WITH-conduct home/away written by the bracket step).
    const brackets = await backfillResolvedBrackets(admin, tournamentId, { poolIds: batch })
    const bonus = await backfillBonusInputs(admin, tournamentId, { poolIds: batch })

    // 2) Apply all shadow writes under ONE advisory lock shared with the score
    //    worker (shadow_process_queue) so the two writers never overlap: re-score
    //    changed completed matches, then rescore + finalize the batch's pools
    //    (all scoped + change-only).
    const { error: applyErr } = await admin.rpc('shadow_apply_changes', { p_match_ids: matchIds, p_pool_ids: batch })
    if (applyErr) throw new Error(`shadow_apply_changes: ${applyErr.message}`)

    // Advance the watermark ONLY when the whole changed set was processed; a
    // deferred remainder is re-detected (and re-processed) on the next run.
    if (deferred === 0) await advanceWatermark()

    return NextResponse.json({
      ok: true,
      changedPools: poolIds.length,
      changedMatches: matchIds.length,
      processed: batch.length,
      deferred,
      bracketReconcile,
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
