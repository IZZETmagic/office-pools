import { NextRequest, NextResponse, after } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { recalculatePool } from '@/lib/scoring'
import { dispatch } from '@/lib/notifications/outbox'
import { COMPOSERS } from '@/lib/notifications/composers'
import { queueMemberRemoved } from '@/lib/pools/adminNotices'

// =============================================================
// DELETE /api/pools/:pool_id/members/:member_id — N4, 2026-10-07
// =============================================================
// A pool's admin removes a player: ONE request that removes, rescores and tells them, as /leave
// does for leaving. It replaces three the clients made themselves — a direct pool_members delete,
// a POST to /recalculate (the website only; the app never rescored), and a POST to
// /api/notifications/member-removed — any of which could fail without the others knowing.
//
// The removal itself is unchanged: the membership row is deleted, and its entries DETACH (the FK
// is ON DELETE SET NULL) without being retired — which is what queueMemberRemoved reads as proof
// that a removal happened. Only a player can be removed, as the Members tab already allows; an
// admin is demoted first, and leaving yourself goes through /leave.
// =============================================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ pool_id: string; member_id: string }> },
) {
  const { pool_id, member_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { userData } = auth.data
  const admin = createAdminClient()

  const [{ data: caller, error: cErr }, { data: target, error: tErr }] = await Promise.all([
    admin.from('pool_members').select('role').eq('pool_id', pool_id).eq('user_id', userData.user_id).maybeSingle(),
    admin.from('pool_members').select('member_id, user_id, role').eq('pool_id', pool_id).eq('member_id', member_id).maybeSingle(),
  ])
  if (cErr || tErr) return NextResponse.json({ error: 'Could not read the pool\'s members' }, { status: 500 })
  if (!caller || caller.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  if (!target) return NextResponse.json({ error: 'Member not found in this pool' }, { status: 404 })
  if (target.user_id === userData.user_id) {
    return NextResponse.json({ error: 'Leaving goes through /leave' }, { status: 400 })
  }
  if (target.role !== 'player') {
    return NextResponse.json({ error: 'Only a player can be removed. Demote them to player first.' }, { status: 400 })
  }

  const { error: deleteError } = await admin.from('pool_members').delete().eq('member_id', member_id).eq('pool_id', pool_id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  // Rescore, so the leaderboard the others see stops including them. Non-fatal, as in /leave: the
  // member HAS been removed, and saying otherwise would be wrong.
  const recalc = await recalculatePool({ poolId: pool_id })
  if (!recalc.success) console.error(`[remove-member] rescore after removal failed for pool ${pool_id}:`, recalc.error)

  // Tell them — once, from what the database now shows. Non-fatal too: the removal stands.
  let queued: number[] = []
  try {
    queued = await queueMemberRemoved(admin, { poolId: pool_id, userId: target.user_id, actorId: userData.user_id })
  } catch (err) {
    console.error('[remove-member] notice not queued:', err instanceof Error ? err.message : err)
  }
  if (queued.length > 0) {
    after(() => dispatch(createAdminClient(), COMPOSERS, { ids: queued }).then(
      () => undefined,
      (err) => console.error('[remove-member] dispatch failed; the outbox will retry:', err),
    ))
  }

  return NextResponse.json({ removed: true, told: queued.length > 0 })
}
