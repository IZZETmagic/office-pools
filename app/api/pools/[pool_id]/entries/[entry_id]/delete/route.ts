import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// POST /api/pools/:pool_id/entries/:entry_id/delete
//
// Delete a single pool_entries row owned by the caller, with two
// invariants enforced server-side:
//
//   1. **Caller-owned**: the entry's member_id must resolve to the
//      authenticated user. Anyone else gets 403.
//   2. **Non-admin must keep ≥1 entry**: only admins are allowed to
//      empty out their entry list (mirrors the Stop Participating path
//      in Settings). Non-admins trying to delete their last entry get
//      400 with an explanatory message.
//
// Routed server-side (rather than a client supabase.delete) for the
// same RLS-on-cascade reason Stop Participating uses: pool_entries'
// cascade includes bonus_scores/match_scores/player_scores which have
// RLS enabled with no user-facing DELETE policy. The admin client
// bypasses RLS so the whole cascade lands in one transaction.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ pool_id: string; entry_id: string }> },
) {
  const { pool_id, entry_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { userData } = auth.data

  const adminClient = createAdminClient()

  // Confirm the entry exists in this pool, the caller is the owner,
  // and surface the caller's role (admin / non-admin) in one round-trip
  // by joining pool_entries → pool_members.
  const { data: entry } = await adminClient
    .from('pool_entries')
    .select(
      'entry_id, pool_id, member_id, pool_members!inner(member_id, user_id, role)',
    )
    .eq('entry_id', entry_id)
    .eq('pool_id', pool_id)
    .single()
  if (!entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  }
  const membership = Array.isArray(entry.pool_members)
    ? entry.pool_members[0]
    : entry.pool_members
  if (!membership || membership.user_id !== userData.user_id) {
    return NextResponse.json(
      { error: "You can't delete someone else's entry" },
      { status: 403 },
    )
  }

  // Non-admin sole-entry guard. Admins can empty out their entries
  // (equivalent to Stop Participating). Non-admins must keep at least
  // one so they remain competitive members of the pool. Count via
  // member_id (the user's own entries in this pool, scoped through
  // pool_members ownership).
  if (membership.role !== 'admin') {
    const { count } = await adminClient
      .from('pool_entries')
      .select('entry_id', { count: 'exact', head: true })
      .eq('member_id', membership.member_id)
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        {
          error: 'You must have at least one entry. Pool admins can delete all of theirs; players need to keep one.',
        },
        { status: 400 },
      )
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
