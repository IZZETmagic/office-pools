import { NextRequest, NextResponse, after } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { enqueue, dispatch } from '@/lib/notifications/outbox'
import { COMPOSERS } from '@/lib/notifications/composers'
import { removalEvidence } from '@/lib/pools/adminNotices'

// =============================================================
// POST /api/notifications/member-removed
// =============================================================
// Called by the admin Members tab straight after it deletes a membership.
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
//
// A server-side removal route — one request that removes, records and notifies, as /leave does
// for leaving — is the durable shape, and is noted as a follow-up.
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
  const [evidence, { data: pool }] = await Promise.all([
    removalEvidence(admin, { poolId: pool_id, userId: removed_user_id }),
    admin.from('pools').select('pool_name').eq('pool_id', pool_id).single(),
  ])
  if (!evidence || !pool) {
    return NextResponse.json({ sent: false, reason: 'no removal to tell them about' }, { status: 404 })
  }

  const queued = await enqueue(admin, [{
    type: 'member_removed',
    userId: removed_user_id,
    poolId: pool_id,
    dedupKey: `member_removed:${pool_id}:${removed_user_id}:${evidence}`,
    payload: { actorId: userData.user_id },
  }])
  if (queued.length === 0) return NextResponse.json({ sent: false, reason: 'already told' })

  // The activity feed's "Removed from <pool>" card — written once, with the notice. Stored as a
  // snapshot (pool_name in the row) so it survives a later pool deletion.
  await admin.from('pool_membership_events').insert({
    pool_id,
    user_id: removed_user_id,
    actor_user_id: userData.user_id,
    event_type: 'removed',
    pool_name: (pool as { pool_name: string }).pool_name,
  })

  after(() => dispatch(createAdminClient(), COMPOSERS, { ids: queued }).then(
    () => undefined,
    (err) => console.error('[member-removed] dispatch failed; the outbox will retry:', err),
  ))
  return NextResponse.json({ queued: true })
}
