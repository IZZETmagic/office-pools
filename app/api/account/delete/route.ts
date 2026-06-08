import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withPerfLogging } from '@/lib/api-perf'

async function handleDELETE() {
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

  // Pool ownership blocks deletion: pools.admin_user_id is NOT NULL with
  // NO ACTION on the FK to users.user_id. Deleting an admin would orphan
  // their pool for every other member, so require ownership transfer first.
  const { data: ownedPools } = await adminSupabase
    .from('pools')
    .select('pool_id, pool_name')
    .eq('admin_user_id', userData.user_id)
    .returns<{ pool_id: string; pool_name: string }[]>()
  if (ownedPools && ownedPools.length > 0) {
    return NextResponse.json(
      {
        error: 'You still administer one or more pools. Transfer admin to another member before deleting your account.',
        ownedPools: ownedPools.map((p) => ({ poolId: p.pool_id, poolName: p.pool_name })),
      },
      { status: 400 },
    )
  }

  // Clear nullable NO-ACTION refs that would otherwise block the users delete.
  // (notification_log.user_id, broadcast_log.sent_by, match_reset_log.reset_by_user_id,
  //  pool_round_states.opened_by, sync_settings.updated_by are all nullable + NO ACTION.)
  await Promise.all([
    adminSupabase.from('notification_log').update({ user_id: null }).eq('user_id', userData.user_id),
    adminSupabase.from('broadcast_log').update({ sent_by: null }).eq('sent_by', userData.user_id),
    adminSupabase.from('match_reset_log').update({ reset_by_user_id: null }).eq('reset_by_user_id', userData.user_id),
    adminSupabase.from('pool_round_states').update({ opened_by: null }).eq('opened_by', userData.user_id),
    adminSupabase.from('sync_settings').update({ updated_by: null }).eq('updated_by', userData.user_id),
  ])

  // Clean up NOT-NULL NO-ACTION refs by deleting the audit/announcement rows.
  // admin_audit_log: performed_by is NOT NULL, target_user_id is SET NULL (no manual cleanup needed).
  // sent_announcements: sent_by is NOT NULL.
  await adminSupabase
    .from('admin_audit_log')
    .delete()
    .eq('performed_by', userData.user_id)

  await adminSupabase
    .from('sent_announcements')
    .delete()
    .eq('sent_by', userData.user_id)

  // Delete the users table record
  const { error: e9 } = await adminSupabase
    .from('users')
    .delete()
    .eq('user_id', userData.user_id)
  if (e9) return NextResponse.json({ error: 'Failed to delete user record: ' + e9.message }, { status: 500 })

  // Delete the Supabase Auth user
  const { error: authError } = await adminSupabase.auth.admin.deleteUser(user.id)
  if (authError) return NextResponse.json({ error: 'Failed to delete auth user' }, { status: 500 })

  // Sign out to clear cookies
  await supabase.auth.signOut()

  return NextResponse.json({ deleted: true })
}

export const DELETE = withPerfLogging('/api/account/delete', handleDELETE)
