import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// POST /api/pools/:pool_id/stop-participating
//
// Admin-facing operation: the caller deletes all of THEIR OWN
// pool_entries for this pool while keeping their pool_members row (and
// admin role) intact. The user disappears from the leaderboard but
// retains every other privilege — managing settings, scoring config,
// member moderation, banter, etc.
//
// Why this endpoint exists (vs. a client-side supabase.delete on
// pool_entries):
//   pool_entries has 12 cascade children. Three of them have RLS
//   enabled with no DELETE policy (`bonus_scores`, `match_scores`,
//   `player_scores`) — those tables are normally written by server
//   recalculation jobs, not users. A user-initiated cascade delete on
//   pool_entries triggers RLS-blocked DELETEs on those children and
//   the whole transaction rolls back. Using the admin client bypasses
//   RLS, which is the same pattern /api/pools/[pool_id]/leave and the
//   /api/notifications/member-removed audit insert already use.
//
// Distinct from the /leave endpoint: no pool_membership_events row is
// written, no pool_left / pool_removed activity card is generated, the
// pool_members row is preserved. This is a "quiet" admin-self-only
// operation, not a lifecycle event.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> },
) {
  const { pool_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { userData } = auth.data

  const adminClient = createAdminClient()

  // Confirm the caller is a member of this pool. Without this guard, a
  // 404 still slips out (no member_id → empty delete), but it's clearer
  // to surface a meaningful error message.
  const { data: membership } = await adminClient
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()
  if (!membership) {
    return NextResponse.json({ error: 'You are not a member of this pool' }, { status: 404 })
  }

  // Delete the caller's entries for this pool. The 12 cascade children
  // (predictions, group_predictions, special_predictions, match_scores,
  // player_scores, bonus_scores, point_adjustments, entry_round_submissions,
  // entry_xp_state, bracket_picker_*) are all ON DELETE CASCADE, so the
  // single delete here cleans up everything. The admin client bypasses
  // RLS on the children that lack user-facing DELETE policies.
  const { error: deleteError, count } = await adminClient
    .from('pool_entries')
    .delete({ count: 'exact' })
    .eq('member_id', membership.member_id)
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ removed_entries: count ?? 0 })
}
