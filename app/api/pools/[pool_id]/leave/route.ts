import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// POST /api/pools/:pool_id/leave
//
// Self-leave: the authenticated user removes themselves from `pool_id`.
// Unlike the admin removal path (handled by direct supabase.delete +
// /api/notifications/member-removed), self-leaves must funnel through
// here so we can:
//   1. Block the sole-admin case (would orphan the pool).
//   2. Write a 'left' row into pool_membership_events for the activity
//      feed BEFORE the membership row is gone — once deleted, we'd lose
//      the pool_name and can't reconstruct the event.
// The membership delete itself uses the admin client; the user no
// longer needs to satisfy the "Users can leave pools" RLS policy because
// we've already authenticated them above.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> },
) {
  const { pool_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { userData } = auth.data

  const adminClient = createAdminClient()

  const { data: pool } = await adminClient
    .from('pools')
    .select('pool_id, pool_name, admin_user_id')
    .eq('pool_id', pool_id)
    .single()
  if (!pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }

  // Confirm membership and figure out whether the leaver is the sole
  // admin. If they are, we refuse the leave — the admin must transfer
  // ownership or delete the pool first.
  const { data: membership } = await adminClient
    .from('pool_members')
    .select('member_id, role')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()
  if (!membership) {
    return NextResponse.json({ error: 'You are not a member of this pool' }, { status: 404 })
  }
  if (membership.role === 'admin') {
    const { count: adminCount } = await adminClient
      .from('pool_members')
      .select('member_id', { count: 'exact', head: true })
      .eq('pool_id', pool_id)
      .eq('role', 'admin')
    if ((adminCount ?? 0) <= 1) {
      return NextResponse.json(
        {
          error:
            'You are the only admin. Promote another member or delete the pool before leaving.',
        },
        { status: 400 },
      )
    }
  }

  // Audit row FIRST. If the delete below fails we leave a "tried to
  // leave" record behind; that's better than the inverse (membership
  // gone, no activity event). The activity surface treats this table as
  // append-only.
  await adminClient.from('pool_membership_events').insert({
    pool_id,
    user_id: userData.user_id,
    actor_user_id: userData.user_id,
    event_type: 'left',
    pool_name: pool.pool_name,
  })

  const { error: deleteError } = await adminClient
    .from('pool_members')
    .delete()
    .eq('member_id', membership.member_id)
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ left: true })
}
