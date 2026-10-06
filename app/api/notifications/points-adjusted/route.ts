import { NextRequest, NextResponse, after } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { enqueue, dispatch } from '@/lib/notifications/outbox'
import { COMPOSERS } from '@/lib/notifications/composers'
import { recentAdjustmentBy } from '@/lib/pools/adminNotices'

// =============================================================
// POST /api/notifications/points-adjusted
// =============================================================
// Called by the admin Members tab straight after an adjustment is logged.
//
// ⚠ BUILT FROM THE ADJUSTMENT, NEVER FROM THE REQUEST (2026-10-06). Until today this emailed
// whatever amount, reason and new total it was sent, to whatever user id it was given — so any
// pool admin could send anyone on the site an email saying anything. Now it takes only who and
// where, and finds the caller's OWN adjustment to that person's entry in this pool, logged in
// point_adjustments in the last ten minutes. The notice is queued by that adjustment's id — so
// calling twice queues it once — and composed from the logged row (lib/pools/adminNotices.ts).
// =============================================================

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { pool_id, target_user_id } = await request.json()
  if (!pool_id || !target_user_id) {
    return NextResponse.json({ error: 'pool_id and target_user_id are required' }, { status: 400 })
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
  const adjustmentId = await recentAdjustmentBy(admin, { poolId: pool_id, callerId: userData.user_id, targetUserId: target_user_id })
  if (!adjustmentId) return NextResponse.json({ sent: false, reason: 'no recent adjustment by you' }, { status: 404 })

  const queued = await enqueue(admin, [{
    type: 'points_adjusted',
    userId: target_user_id,
    poolId: pool_id,
    dedupKey: `points_adjusted:${adjustmentId}`,
    payload: { adjustmentId },
  }])
  if (queued.length > 0) {
    after(() => dispatch(createAdminClient(), COMPOSERS, { ids: queued }).then(
      () => undefined,
      (err) => console.error('[points-adjusted] dispatch failed; the outbox will retry:', err),
    ))
  }
  return NextResponse.json({ queued: queued.length > 0 })
}
