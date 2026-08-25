import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { retireEntries } from '@/lib/entries/retire'

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

  // RETIRE the caller's entries for this pool — migration 056.
  //
  // This used to DELETE them. The 12 cascade children (predictions,
  // group_predictions, special_predictions, match_scores, player_scores,
  // bonus_scores, point_adjustments, entry_round_submissions, entry_xp_state,
  // bracket_picker_*) are all ON DELETE CASCADE, so that single delete erased
  // an entire season with no undo — the cause of the World Cup complaints
  // about people who could not be put back.
  //
  // Now the entries are flagged instead: they stop being scored and drop off
  // the leaderboard, every prediction is kept, and restoring reinstates the
  // lot including matchweeks that completed while they were out.
  //
  // Membership stays untouched, as before: stopping participation means
  // staying in the pool for the banter without competing.
  const { retired, error: retireError } = await retireEntries(
    adminClient,
    { memberIds: [membership.member_id] },
    'stopped',
    userData.user_id,
  )

  if (retireError) {
    return NextResponse.json({ error: retireError }, { status: 500 })
  }

  return NextResponse.json({ removed_entries: retired })
}
