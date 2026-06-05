import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// POST /api/pools/:pool_id/entries/:entry_id/delete
//
// Delete a single pool_entries row. Invariants:
//
//   1. **Authorized actor**: super admin, pool admin of this pool, or
//      the entry's owner. Anyone else gets 403.
//   2. **Non-admin target must keep ≥1 entry**: the rule is about the
//      target member's role, not the actor's. Pool admins can be
//      emptied to zero entries (they stay on as admins); non-admins
//      must stay players — to fully remove a non-admin, use the
//      "Remove member" action instead.
//
// Routed server-side (rather than a client supabase.delete) for the
// RLS-on-cascade reason: pool_entries' cascade includes
// bonus_scores/match_scores/player_scores which have RLS enabled with
// no user-facing DELETE policy. The admin client bypasses RLS so the
// whole cascade lands in one transaction.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ pool_id: string; entry_id: string }> },
) {
  const { pool_id, entry_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { userData } = auth.data

  const adminClient = createAdminClient()

  // Look up the entry plus its owning membership in one round-trip.
  // pool_id lives on pool_members, not pool_entries, so we validate the
  // URL's :pool_id against the joined pool_members.pool_id.
  const { data: entry } = await adminClient
    .from('pool_entries')
    .select(
      'entry_id, member_id, pool_members!inner(member_id, user_id, role, pool_id)',
    )
    .eq('entry_id', entry_id)
    .single()
  const membership = entry
    ? Array.isArray(entry.pool_members)
      ? entry.pool_members[0]
      : entry.pool_members
    : null
  if (!entry || !membership || membership.pool_id !== pool_id) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  }

  // Authorize actor: super admin > pool admin of this pool > entry owner.
  const isOwner = membership.user_id === userData.user_id
  const isSuperAdmin = userData.is_super_admin === true
  let isPoolAdmin = false
  if (!isOwner && !isSuperAdmin) {
    const { data: actorMembership } = await adminClient
      .from('pool_members')
      .select('role')
      .eq('pool_id', pool_id)
      .eq('user_id', userData.user_id)
      .maybeSingle()
    isPoolAdmin = actorMembership?.role === 'admin'
  }
  if (!isOwner && !isSuperAdmin && !isPoolAdmin) {
    return NextResponse.json(
      { error: "You can't delete someone else's entry" },
      { status: 403 },
    )
  }

  // Sole-entry guard keyed on the *target* member. Admins can empty
  // out their entries; non-admin players must keep at least one so
  // they remain participants (no watchers). To fully kick a non-admin,
  // use Remove Member.
  if (membership.role !== 'admin') {
    const { count } = await adminClient
      .from('pool_entries')
      .select('entry_id', { count: 'exact', head: true })
      .eq('member_id', membership.member_id)
    if ((count ?? 0) <= 1) {
      const message = isOwner
        ? 'You must have at least one entry. Pool admins can delete all of theirs; players need to keep one.'
        : "Can't delete this player's last entry. Use Remove Member to take them out of the pool."
      return NextResponse.json({ error: message }, { status: 400 })
    }
  }

  // Delete. All 12 cascade children (predictions, scores, bracket
  // picks, etc.) clean up via ON DELETE CASCADE. Admin client so RLS
  // on the protected score tables doesn't roll the transaction back.
  const { error: deleteError } = await adminClient
    .from('pool_entries')
    .delete()
    .eq('entry_id', entry_id)
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: true })
}
