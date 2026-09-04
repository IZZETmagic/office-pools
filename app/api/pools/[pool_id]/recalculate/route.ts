import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { recalculatePool } from '@/lib/scoring'
import { withPerfLogging } from '@/lib/api-perf'

// =============================================================
// POST /api/pools/:poolId/recalculate
// Triggers a v2 score recalculation for the pool.
// Pool members can trigger this (e.g. after leaving a pool).
//
// The membership check below is load-bearing. recalculatePool runs on the
// service-role client and rewrites match_scores, bonus_scores, entry_xp_state
// and every entry's rank; it also fans out badge detection and result pushes.
// Without the check, requireAuth alone let ANY signed-up user rescore ANY
// pool by id — a write amplifier on the heaviest path in the product.
//
// ⚠ TWO CALLERS ARE NOT ORDINARY MEMBERS, so read this before tightening it
// further:
//   • Super admins sweep every pool of a tournament from admin/super/MatchesTab
//     and are members of almost none of them — hence the is_super_admin arm.
//   • Leaving a pool used to POST here from the client immediately AFTER
//     /leave had deleted the membership row, so the caller was by definition no
//     longer a member. That recalculation now happens inside /leave itself,
//     where the membership was just proven. Do not reintroduce the client call.
// =============================================================
async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  // Super admins operate across pools they do not belong to.
  if (!userData.is_super_admin) {
    // Verify the caller belongs to this pool before touching its scores.
    // Same shape as leaderboard/route.ts:57 and every other pool-scoped route.
    const { data: membership, error: membershipError } = await supabase
      .from('pool_members')
      .select('member_id')
      .eq('pool_id', pool_id)
      .eq('user_id', userData.user_id)
      .maybeSingle()

    if (membershipError) {
      console.error(`[recalculate] membership check failed for pool ${pool_id}:`, membershipError.message)
      return NextResponse.json({ error: 'Could not verify pool membership' }, { status: 500 })
    }
    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this pool' }, { status: 403 })
    }
  }

  const result = await recalculatePool({ poolId: pool_id })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    entriesProcessed: result.entriesProcessed,
    matchScoresWritten: result.matchScoresWritten,
  })
}

export const POST = withPerfLogging('/api/pools/[id]/recalculate', handlePOST)
