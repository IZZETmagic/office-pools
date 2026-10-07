import { NextRequest, NextResponse, after } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { dispatch } from '@/lib/notifications/outbox'
import { COMPOSERS } from '@/lib/notifications/composers'
import { queueMemberRemoved } from '@/lib/pools/adminNotices'

// =============================================================
// POST /api/notifications/member-removed
// =============================================================
// ⚠ KEPT FOR APP VERSIONS BEFORE 2026-10-07, which delete the membership themselves and then call
// this. The website and newer apps remove a member with ONE request instead —
// DELETE /api/pools/[pool_id]/members/[member_id] — which removes, rescores and notifies. Both
// tell the member through queueMemberRemoved (lib/pools/adminNotices.ts), so they cannot drift.
// Remove this route once no supported app version calls it.
//
// ⚠ ONLY FOR SOMEBODY WHO REALLY WAS REMOVED (2026-10-06). Until today this checked only that
// the caller was the pool's admin — not that the person had ever been in the pool, or been
// removed — so any pool admin could send anyone on the site a "you've been removed from <pool>"
// email and push, and write that event into their activity feed, as often as they liked.
//
// Now: the person must not be a member, and must still have entries in this pool that are
// detached and NOT retired — exactly what an admin's removal leaves behind (leaving through
// /leave retires them instead). The notice is keyed to that entry, so it is queued once per
// removal, and the activity event is written only when it is. Sent by the notification outbox.
// =============================================================

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { pool_id, removed_user_id } = await request.json()
  if (!pool_id || !removed_user_id) {
    return NextResponse.json({ error: 'pool_id and removed_user_id are required' }, { status: 400 })
  }
  if (removed_user_id === userData.user_id) {
    return NextResponse.json({ error: 'Leaving goes through /leave' }, { status: 400 })
  }

  const { data: adminMembership } = await supabase
    .from('pool_members')
    .select('role')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()
  if (!adminMembership || adminMembership.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const admin = createAdminClient()
  const queued = await queueMemberRemoved(admin, { poolId: pool_id, userId: removed_user_id, actorId: userData.user_id })
  if (queued.length === 0) return NextResponse.json({ queued: false, reason: 'no removal to tell them about, or already told' })

  after(() => dispatch(createAdminClient(), COMPOSERS, { ids: queued }).then(
    () => undefined,
    (err) => console.error('[member-removed] dispatch failed; the outbox will retry:', err),
  ))
  return NextResponse.json({ queued: true })
}
