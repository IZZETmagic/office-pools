import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

export async function DELETE() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, user, userData } = auth.data

  // Collect all member_ids for this user across all pools
  const { data: members } = await supabase
    .from('pool_members')
    .select('member_id')
    .eq('user_id', userData.user_id)

  const memberIds = members ? members.map((m: any) => m.member_id) : []

  // Collect all entry_ids for this user's members
  let entryIds: string[] = []
  if (memberIds.length > 0) {
    const { data: entries } = await supabase
      .from('pool_entries')
      .select('entry_id')
      .in('member_id', memberIds)
    entryIds = entries ? entries.map((e: any) => e.entry_id) : []
  }

  // Use admin client for deletions (bypasses RLS, can delete auth users)
  const adminSupabase = createAdminClient()

  // Delete in FK-safe order: entry-level data first, then entries, then members
  if (entryIds.length > 0) {
    const { error: e1 } = await adminSupabase
      .from('match_scores')
      .delete()
      .in('entry_id', entryIds)
    if (e1) return NextResponse.json({ error: 'Failed to delete match scores' }, { status: 500 })

    const { error: e2 } = await adminSupabase
      .from('bonus_scores')
      .delete()
      .in('entry_id', entryIds)
    if (e2) return NextResponse.json({ error: 'Failed to delete bonus scores' }, { status: 500 })

    const { error: e3 } = await adminSupabase
      .from('predictions')
      .delete()
      .in('entry_id', entryIds)
    if (e3) return NextResponse.json({ error: 'Failed to delete predictions' }, { status: 500 })

    const { error: e4 } = await adminSupabase
      .from('group_predictions')
      .delete()
      .in('entry_id', entryIds)
    if (e4) return NextResponse.json({ error: 'Failed to delete group predictions' }, { status: 500 })

    const { error: e5 } = await adminSupabase
      .from('special_predictions')
      .delete()
      .in('entry_id', entryIds)
    if (e5) return NextResponse.json({ error: 'Failed to delete special predictions' }, { status: 500 })

    const { error: e6 } = await adminSupabase
      .from('player_scores')
      .delete()
      .in('entry_id', entryIds)
    if (e6) return NextResponse.json({ error: 'Failed to delete player scores' }, { status: 500 })
  }

  // Delete pool entries
  if (memberIds.length > 0) {
    const { error: eEntries } = await adminSupabase
      .from('pool_entries')
      .delete()
      .in('member_id', memberIds)
    if (eEntries) return NextResponse.json({ error: 'Failed to delete pool entries' }, { status: 500 })
  }

  // Delete pool memberships
  const { error: e7 } = await adminSupabase
    .from('pool_members')
    .delete()
    .eq('user_id', userData.user_id)
  if (e7) return NextResponse.json({ error: 'Failed to delete pool memberships' }, { status: 500 })

  // Clean up audit log entries referencing this user (best-effort)
  await adminSupabase
    .from('admin_audit_log')
    .delete()
    .eq('admin_user_id', userData.user_id)

  if (memberIds.length > 0) {
    await adminSupabase
      .from('admin_audit_log')
      .delete()
      .in('target_member_id', memberIds)
  }

  // Delete the users table record
  const { error: e9 } = await adminSupabase
    .from('users')
    .delete()
    .eq('user_id', userData.user_id)
  if (e9) return NextResponse.json({ error: 'Failed to delete user record' }, { status: 500 })

  // Delete the Supabase Auth user
  const { error: authError } = await adminSupabase.auth.admin.deleteUser(user.id)
  if (authError) return NextResponse.json({ error: 'Failed to delete auth user' }, { status: 500 })

  // Sign out to clear cookies
  await supabase.auth.signOut()

  return NextResponse.json({ deleted: true })
}
