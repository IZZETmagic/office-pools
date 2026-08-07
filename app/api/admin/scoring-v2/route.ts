import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { recalculatePool } from '@/lib/scoring'

// Allow up to 120s for processing
export const maxDuration = 120

// =============================================================
// POST /api/admin/scoring-v2
// Re-runs the scoring engine over named pools and reports what each
// one wrote. Super admin only.
//
// This WRITES. recalculatePool replaces match_scores and bonus_scores
// for every entry in the pool and rewrites its totals. The handler used
// to be documented as "no side effects on existing scores", which was
// never true of it.
//
// pool_ids is required. It used to default to every pool — all 623 of
// them, sequentially, against this 120s limit. A full sweep takes closer
// to 300s, so that request could only ever die partway and leave scoring
// half-rewritten with nothing recording where it stopped. For a full
// pass use scripts/recalculate-all-pools.ts, which has no timeout and
// reports per-pool progress.
//
// For a single pool prefer POST /api/pools/:pool_id/recalculate, which is
// what the Scoring Config save button uses.
// =============================================================
export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({})) as { pool_ids?: unknown }
  const poolIds = Array.isArray(body.pool_ids)
    ? body.pool_ids.filter((id): id is string => typeof id === 'string')
    : []

  if (poolIds.length === 0) {
    return NextResponse.json(
      {
        error: 'pool_ids is required.',
        detail:
          'This endpoint no longer recalculates every pool: a full sweep exceeds the 120s function limit and would leave scoring partially rewritten. Use scripts/recalculate-all-pools.ts for a full pass.',
      },
      { status: 400 }
    )
  }

  const adminClient = createAdminClient()

  // Capture the error rather than destructuring `data` alone — a discarded
  // PostgREST error here would look like "no pools matched".
  const { data: pools, error: poolsError } = await adminClient
    .from('pools')
    .select('pool_id, pool_name, prediction_mode')
    .in('pool_id', poolIds)

  if (poolsError) {
    return NextResponse.json({ error: poolsError.message }, { status: 500 })
  }

  const found = pools ?? []
  const notFound = poolIds.filter(id => !found.some(p => p.pool_id === id))

  const results = []
  for (const pool of found) {
    const start = Date.now()
    const result = await recalculatePool({ poolId: pool.pool_id })
    results.push({
      pool_id: pool.pool_id,
      pool_name: pool.pool_name,
      prediction_mode: pool.prediction_mode,
      ...result,
      elapsed_ms: Date.now() - start,
    })
  }

  return NextResponse.json({
    requested: poolIds.length,
    recalculated: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    not_found: notFound,
    results,
  })
}

// =============================================================
// There is no GET here any more.
//
// It returned a v1-vs-v2 comparison built for the March 2026 cutover, and
// both sides of that comparison are gone:
//
//   - It compared pool_entries.total_points against scored_total_points.
//     total_points is dead v1 storage, fixed at 0 for all 4,979 entries, so
//     the "discrepancies" list was every scored entry in the product —
//     4,234 of them — each reported as differing from zero.
//   - It called compare_match_scores_v1_v2(), which read
//     match_scores.points_earned and joined match_scores_v2. Neither the
//     column nor the table exists. The call was wrapped in a try/catch that
//     discarded the error, so the field came back null and the endpoint
//     looked healthy.
//
// The function was dropped in migration 043c. scored_total_points is the
// canonical total and is read directly everywhere it is needed.
// =============================================================
