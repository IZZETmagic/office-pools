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
  const predPoolIds: string[] = (changed ?? []).map((r: { pool_id: string }) => r.pool_id)

  // Pools flagged dirty by a bulk/settings/admin recalc (recalculatePool with no
  // matchId) — a full live re-score changes scores without touching predictions or
  // match rows, so the reconcilers never see it and shadow would drift stale.
  const { data: dirtyRows } = await admin.from('shadow_dirty_pools').select('pool_id')
  const dirtyIds: string[] = (dirtyRows ?? []).map((r: { pool_id: string }) => r.pool_id)

  // Combined work set (prediction-changed ∪ dirty), deduped.
  const poolIds: string[] = Array.from(new Set([...predPoolIds, ...dirtyIds]))

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
    return NextResponse.json({ ok: true, changedPools: 0, changedMatches: 0, note: 'nothing to materialize' })
  }

  const batch = poolIds.slice(0, CAP)
  const deferred = poolIds.length - batch.length
  const dirtyInBatch = batch.filter((id) => dirtyIds.includes(id))

  try {
    // 1) Re-materialize inputs for the changed pools. Brackets FIRST (match-engine,
    //    WITH-conduct), then bonus inputs (both modes; only updates predicted_winner
    //    so it preserves the WITH-conduct home/away written by the bracket step).
    const brackets = await backfillResolvedBrackets(admin, tournamentId, { poolIds: batch })
    const bonus = await backfillBonusInputs(admin, tournamentId, { poolIds: batch })

    // 2a) Dirty pools (bulk/settings/logic re-score with no input change) need their
    //     COMPLETED matches re-scored so the freshly-materialized brackets/settings
    //     take. shadow_score_match runs GLOBALLY per match, so handing every completed
    //     match to a single shadow_apply_changes call blows the statement timeout —
    //     chunk them into small per-call batches. Change-only writes make matches that
    //     didn't actually change a cheap no-op (only the dirty pools' refreshed
    //     brackets produce writes).
    if (dirtyInBatch.length > 0) {
      const { data: completed } = await admin
        .from('matches').select('match_id').eq('tournament_id', tournamentId).eq('is_completed', true)
      const completedIds = (completed ?? []).map((r: { match_id: string }) => r.match_id)
      const MATCH_CHUNK = 5
      for (let i = 0; i < completedIds.length; i += MATCH_CHUNK) {
        const { error } = await admin.rpc('shadow_apply_changes', {
          p_match_ids: completedIds.slice(i, i + MATCH_CHUNK),
          p_pool_ids: [],
        })
        if (error) throw new Error(`shadow_apply_changes (dirty match chunk @${i}): ${error.message}`)
      }
    }

    // 2b) Prediction-driven match re-scores + finalize the batch's pools (bonuses +
    //     totals) under the advisory lock shared with the score worker. Small set
    //     (matchIds is prediction-edited completed matches; finalize is scoped).
    const { error: applyErr } = await admin.rpc('shadow_apply_changes', { p_match_ids: matchIds, p_pool_ids: batch })
    if (applyErr) throw new Error(`shadow_apply_changes: ${applyErr.message}`)

    // Clear the dirty flags we just processed (deferred dirty pools remain for the
    // next run). Only after a successful apply, so a failure retries them.
    if (dirtyInBatch.length > 0) {
      await admin.from('shadow_dirty_pools').delete().in('pool_id', dirtyInBatch)
    }

    // Advance the watermark ONLY when the whole changed set was processed; a
    // deferred remainder is re-detected (and re-processed) on the next run.
    if (deferred === 0) await advanceWatermark()

    return NextResponse.json({
      ok: true,
      changedPools: predPoolIds.length,
      dirtyPools: dirtyIds.length,
      changedMatches: matchIds.length,
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
