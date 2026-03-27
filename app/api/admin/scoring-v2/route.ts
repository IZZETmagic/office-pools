import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { recalculatePool } from '@/lib/scoring'

// Allow up to 120s for processing all pools
export const maxDuration = 120

// =============================================================
// POST /api/admin/scoring-v2
// One-time recalculation: runs the v2 scoring engine against
// all pools with submitted entries, populates match_scores_v2
// and v2_* columns, then returns a comparison report.
//
// Super admin only. No side effects on existing scores.
// =============================================================
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // 1. Authenticate — super admin only
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('user_id, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData?.is_super_admin) {
    return NextResponse.json({ error: 'Super admin only' }, { status: 403 })
  }

  // 2. Find all pools with submitted entries
  const { data: pools } = await adminClient
    .from('pools')
    .select('pool_id, pool_name, prediction_mode')

  if (!pools) {
    return NextResponse.json({ error: 'Failed to fetch pools' }, { status: 500 })
  }

  // 3. Recalculate each pool
  const results = []

  for (const pool of pools) {
    const start = Date.now()
    const result = await recalculatePool({ poolId: pool.pool_id })
    const elapsed = Date.now() - start

    results.push({
      pool_id: pool.pool_id,
      pool_name: pool.pool_name,
      prediction_mode: pool.prediction_mode,
      ...result,
      elapsed_ms: elapsed,
    })
  }

  // 4. Build comparison report: v2 totals vs existing totals
  const { data: comparison } = await adminClient
    .from('pool_entries')
    .select(`
      entry_id,
      entry_name,
      total_points,
      v2_match_points,
      v2_bonus_points,
      v2_total_points,
      point_adjustment,
      member_id,
      pool_members!inner(pool_id, pools!inner(pool_name, prediction_mode))
    `)
    .not('v2_total_points', 'is', null)
    .order('entry_name')

  // Compute discrepancies
  const discrepancies = (comparison || [])
    .filter((e: any) => e.total_points !== e.v2_total_points)
    .map((e: any) => ({
      entry_id: e.entry_id,
      entry_name: e.entry_name,
      pool_name: e.pool_members?.pools?.pool_name,
      prediction_mode: e.pool_members?.pools?.prediction_mode,
      old_total: e.total_points,
      v2_match: e.v2_match_points,
      v2_bonus: e.v2_bonus_points,
      v2_total: e.v2_total_points,
      difference: e.v2_total_points - e.total_points,
    }))

  const matches = (comparison || [])
    .filter((e: any) => e.total_points === e.v2_total_points)
    .length

  return NextResponse.json({
    recalculation_results: results,
    comparison: {
      total_entries_compared: comparison?.length || 0,
      entries_matching: matches,
      entries_with_discrepancies: discrepancies.length,
      discrepancies,
    },
  })
}

// =============================================================
// GET /api/admin/scoring-v2
// Returns the current comparison state without recalculating.
// =============================================================
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('user_id, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData?.is_super_admin) {
    return NextResponse.json({ error: 'Super admin only' }, { status: 403 })
  }

  // Comparison: v2 totals vs existing totals
  const { data: comparison } = await adminClient
    .from('pool_entries')
    .select(`
      entry_id,
      entry_name,
      total_points,
      v2_match_points,
      v2_bonus_points,
      v2_total_points,
      point_adjustment,
      member_id,
      pool_members!inner(pool_id, pools!inner(pool_name, prediction_mode))
    `)
    .not('v2_total_points', 'is', null)
    .order('entry_name')

  const discrepancies = (comparison || [])
    .filter((e: any) => e.total_points !== e.v2_total_points)
    .map((e: any) => ({
      entry_id: e.entry_id,
      entry_name: e.entry_name,
      pool_name: e.pool_members?.pools?.pool_name,
      prediction_mode: e.pool_members?.pools?.prediction_mode,
      old_total: e.total_points,
      v2_match: e.v2_match_points,
      v2_bonus: e.v2_bonus_points,
      v2_total: e.v2_total_points,
      difference: e.v2_total_points - e.total_points,
    }))

  const matches = (comparison || [])
    .filter((e: any) => e.total_points === e.v2_total_points)
    .length

  // Per-match comparison with existing match_scores table
  let matchComparison: any = null
  try {
    const { data } = await adminClient.rpc('compare_match_scores_v1_v2')
    matchComparison = data
  } catch {
    // RPC may not exist yet — that's OK
  }

  return NextResponse.json({
    comparison: {
      total_entries_compared: comparison?.length || 0,
      entries_matching: matches,
      entries_with_discrepancies: discrepancies.length,
      discrepancies,
    },
    match_level_comparison: matchComparison,
  })
}
