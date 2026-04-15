import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data
  const { id } = await params

  const body = await request.json()
  const { action, ...payload } = body

  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 })
  }

  // Verify target pool exists
  const { data: targetPool } = await supabase
    .from('pools')
    .select('pool_id, pool_name, pool_code, status, admin_user_id')
    .eq('pool_id', id)
    .single()

  if (!targetPool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }

  // Helper to insert audit log entry
  async function audit(auditAction: string, summary: string, details?: Record<string, any>) {
    await supabase.from('admin_audit_log').insert({
      action: auditAction,
      performed_by: userData.user_id,
      pool_id: id,
      details: details || {},
      summary,
    })
  }

  switch (action) {
    // ===== CHANGE STATUS =====
    case 'change_status': {
      const { status } = payload
      const validStatuses = ['open', 'closed', 'completed']
      if (!status || !validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        )
      }

      const { error: updateError } = await supabase
        .from('pools')
        .update({ status })
        .eq('pool_id', id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      await audit(
        'change_pool_status',
        `Changed ${targetPool.pool_name} status from "${targetPool.status}" to "${status}"`,
        { previous_status: targetPool.status, new_status: status }
      )

      return NextResponse.json({ success: true })
    }

    // ===== EDIT POOL CODE =====
    case 'edit_pool_code': {
      const { pool_code } = payload
      if (!pool_code?.trim()) {
        return NextResponse.json({ error: 'pool_code is required' }, { status: 400 })
      }

      // Validate uniqueness
      const { data: existing } = await supabase
        .from('pools')
        .select('pool_id')
        .eq('pool_code', pool_code.trim())
        .neq('pool_id', id)
        .maybeSingle()

      if (existing) {
        return NextResponse.json({ error: 'Pool code already in use' }, { status: 400 })
      }

      const { error: updateError } = await supabase
        .from('pools')
        .update({ pool_code: pool_code.trim() })
        .eq('pool_id', id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      await audit(
        'edit_pool_code',
        `Changed ${targetPool.pool_name} pool code from "${targetPool.pool_code}" to "${pool_code.trim()}"`,
        { previous_pool_code: targetPool.pool_code, new_pool_code: pool_code.trim() }
      )

      return NextResponse.json({ success: true })
    }

    // ===== TRANSFER OWNERSHIP =====
    case 'transfer_ownership': {
      const { new_admin_user_id } = payload
      if (!new_admin_user_id) {
        return NextResponse.json({ error: 'new_admin_user_id is required' }, { status: 400 })
      }

      // Get current admin member record
      const { data: currentAdmin } = await supabase
        .from('pool_members')
        .select('member_id, role')
        .eq('pool_id', id)
        .eq('user_id', targetPool.admin_user_id)
        .single()

      if (!currentAdmin) {
        return NextResponse.json({ error: 'Current admin member record not found' }, { status: 500 })
      }

      // Verify new admin is a member of the pool
      const { data: newAdminMember } = await supabase
        .from('pool_members')
        .select('member_id')
        .eq('pool_id', id)
        .eq('user_id', new_admin_user_id)
        .single()

      if (!newAdminMember) {
        return NextResponse.json({ error: 'New admin is not a member of this pool' }, { status: 404 })
      }

      // Swap roles
      await supabase
        .from('pool_members')
        .update({ role: 'player' })
        .eq('member_id', currentAdmin.member_id)

      await supabase
        .from('pool_members')
        .update({ role: 'admin' })
        .eq('member_id', newAdminMember.member_id)

      // Update pools.admin_user_id
      await supabase
        .from('pools')
        .update({ admin_user_id: new_admin_user_id })
        .eq('pool_id', id)

      // Get names for audit
      const [currentAdminUser, newAdminUser] = await Promise.all([
        supabase.from('users').select('username').eq('user_id', targetPool.admin_user_id).single(),
        supabase.from('users').select('username').eq('user_id', new_admin_user_id).single(),
      ])

      await audit(
        'transfer_ownership',
        `Transferred ${targetPool.pool_name} ownership from ${currentAdminUser.data?.username || 'unknown'} to ${newAdminUser.data?.username || 'unknown'}`,
        {
          previous_admin_user_id: targetPool.admin_user_id,
          previous_admin_username: currentAdminUser.data?.username,
          new_admin_user_id,
          new_admin_username: newAdminUser.data?.username,
        }
      )

      return NextResponse.json({ success: true })
    }

    // ===== DELETE POOL =====
    case 'delete_pool': {
      const { confirm_pool_name } = payload
      if (confirm_pool_name !== targetPool.pool_name) {
        return NextResponse.json({ error: 'Pool name confirmation does not match' }, { status: 400 })
      }

      const adminSupabase = createAdminClient()

      // Get all member IDs for this pool
      const { data: members } = await supabase
        .from('pool_members')
        .select('member_id')
        .eq('pool_id', id)

      const memberIds = members?.map((m) => m.member_id) || []

      // Get all entry IDs for this pool
      let entryIds: string[] = []
      if (memberIds.length > 0) {
        const { data: entries } = await supabase
          .from('pool_entries')
          .select('entry_id')
          .in('member_id', memberIds)
        entryIds = entries?.map((e) => e.entry_id) || []
      }

      // Cascade delete entry data (FK-safe order)
      if (entryIds.length > 0) {
        for (const table of [
          'match_scores',
          'bonus_scores',
          'predictions',
          'group_predictions',
          'special_predictions',
          'player_scores',
          'entry_round_submissions',
        ]) {
          await adminSupabase.from(table).delete().in('entry_id', entryIds)
        }
        await adminSupabase.from('pool_entries').delete().in('entry_id', entryIds)
      }

      // Delete pool members
      if (memberIds.length > 0) {
        await adminSupabase.from('pool_members').delete().in('member_id', memberIds)
      }

      // Delete pool-level data
      await adminSupabase.from('pool_round_states').delete().eq('pool_id', id)
      await adminSupabase.from('pool_settings').delete().eq('pool_id', id)

      // Clean up audit log references (best-effort)
      await adminSupabase.from('admin_audit_log').delete().eq('pool_id', id)

      // Delete pool record
      const { error: deleteError } = await adminSupabase
        .from('pools')
        .delete()
        .eq('pool_id', id)

      if (deleteError) {
        return NextResponse.json({ error: 'Failed to delete pool record' }, { status: 500 })
      }

      console.log(
        `[Super Admin] Pool ${targetPool.pool_name} (${id}) deleted by ${userData.user_id}`
      )

      return NextResponse.json({ success: true, deleted: true })
    }

    // ===== REMOVE MEMBER =====
    case 'remove_member': {
      const { user_id } = payload
      if (!user_id) {
        return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
      }

      const adminSupabase = createAdminClient()

      // Get the member record
      const { data: membership } = await supabase
        .from('pool_members')
        .select('member_id, role')
        .eq('pool_id', id)
        .eq('user_id', user_id)
        .single()

      if (!membership) {
        return NextResponse.json({ error: 'User is not a member of this pool' }, { status: 404 })
      }

      if (membership.role === 'admin') {
        return NextResponse.json(
          { error: 'Cannot remove a pool admin. Transfer ownership first.' },
          { status: 400 }
        )
      }

      // Get entry IDs for cascade deletion
      const { data: entries } = await supabase
        .from('pool_entries')
        .select('entry_id')
        .eq('member_id', membership.member_id)

      const entryIds = entries?.map((e) => e.entry_id) || []

      // Cascade delete entry data (FK-safe order)
      if (entryIds.length > 0) {
        for (const table of [
          'match_scores',
          'bonus_scores',
          'predictions',
          'group_predictions',
          'special_predictions',
          'player_scores',
          'entry_round_submissions',
        ]) {
          await adminSupabase.from(table).delete().in('entry_id', entryIds)
        }
        await adminSupabase.from('pool_entries').delete().in('entry_id', entryIds)
      }

      // Clean up audit log references (best-effort)
      try {
        await adminSupabase
          .from('admin_audit_log')
          .delete()
          .eq('target_member_id', membership.member_id)
      } catch {
        // ignore
      }

      // Delete pool membership
      await adminSupabase.from('pool_members').delete().eq('member_id', membership.member_id)

      // Get username for audit
      const { data: removedUser } = await supabase
        .from('users')
        .select('username')
        .eq('user_id', user_id)
        .single()

      await audit(
        'remove_member',
        `Removed ${removedUser?.username || 'unknown'} from ${targetPool.pool_name}`,
        { user_id, username: removedUser?.username, entries_deleted: entryIds.length }
      )

      return NextResponse.json({ success: true })
    }

    // ===== CHANGE ROLE =====
    case 'change_role': {
      const { user_id, role } = payload
      if (!user_id || !role) {
        return NextResponse.json({ error: 'user_id and role are required' }, { status: 400 })
      }

      const validRoles = ['player', 'admin']
      if (!validRoles.includes(role)) {
        return NextResponse.json(
          { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
          { status: 400 }
        )
      }

      // Get the member record
      const { data: membership } = await supabase
        .from('pool_members')
        .select('member_id, role')
        .eq('pool_id', id)
        .eq('user_id', user_id)
        .single()

      if (!membership) {
        return NextResponse.json({ error: 'User is not a member of this pool' }, { status: 404 })
      }

      if (membership.role === role) {
        return NextResponse.json({ error: `User already has role "${role}"` }, { status: 400 })
      }

      // If promoting to admin, demote the current admin
      if (role === 'admin') {
        const { data: currentAdmin } = await supabase
          .from('pool_members')
          .select('member_id')
          .eq('pool_id', id)
          .eq('user_id', targetPool.admin_user_id)
          .single()

        if (currentAdmin) {
          await supabase
            .from('pool_members')
            .update({ role: 'player' })
            .eq('member_id', currentAdmin.member_id)
        }

        // Update pools.admin_user_id
        await supabase
          .from('pools')
          .update({ admin_user_id: user_id })
          .eq('pool_id', id)
      }

      // Update the member's role
      await supabase
        .from('pool_members')
        .update({ role })
        .eq('member_id', membership.member_id)

      // Get username for audit
      const { data: targetUser } = await supabase
        .from('users')
        .select('username')
        .eq('user_id', user_id)
        .single()

      await audit(
        'change_role',
        `Changed ${targetUser?.username || 'unknown'} role in ${targetPool.pool_name} from "${membership.role}" to "${role}"`,
        {
          user_id,
          username: targetUser?.username,
          previous_role: membership.role,
          new_role: role,
        }
      )

      return NextResponse.json({ success: true })
    }

    // ===== TOGGLE FEE PAID =====
    case 'toggle_fee_paid': {
      const { member_id } = payload
      if (!member_id) {
        return NextResponse.json({ error: 'member_id is required' }, { status: 400 })
      }

      // Get current fee status
      const { data: membership } = await supabase
        .from('pool_members')
        .select('member_id, entry_fee_paid, user_id')
        .eq('member_id', member_id)
        .eq('pool_id', id)
        .single()

      if (!membership) {
        return NextResponse.json({ error: 'Member not found in this pool' }, { status: 404 })
      }

      const newFeePaid = !membership.entry_fee_paid

      const { error: updateError } = await supabase
        .from('pool_members')
        .update({ entry_fee_paid: newFeePaid })
        .eq('member_id', member_id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      // Get username for audit
      const { data: memberUser } = await supabase
        .from('users')
        .select('username')
        .eq('user_id', membership.user_id)
        .single()

      await audit(
        'toggle_fee_paid',
        `Set entry_fee_paid to ${newFeePaid} for ${memberUser?.username || 'unknown'} in ${targetPool.pool_name}`,
        { member_id, user_id: membership.user_id, username: memberUser?.username, entry_fee_paid: newFeePaid }
      )

      return NextResponse.json({ success: true, entry_fee_paid: newFeePaid })
    }

    // ===== ADD MEMBER =====
    case 'add_member': {
      const { user_id } = payload
      if (!user_id) {
        return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
      }

      // Verify user exists
      const { data: targetUser } = await supabase
        .from('users')
        .select('user_id, username')
        .eq('user_id', user_id)
        .single()

      if (!targetUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      // Verify user is not already a member
      const { data: existingMember } = await supabase
        .from('pool_members')
        .select('member_id')
        .eq('pool_id', id)
        .eq('user_id', user_id)
        .maybeSingle()

      if (existingMember) {
        return NextResponse.json({ error: 'User is already a member of this pool' }, { status: 400 })
      }

      // Add as player
      const { error: insertError } = await supabase
        .from('pool_members')
        .insert({
          pool_id: id,
          user_id,
          role: 'player',
          entry_fee_paid: false,
        })

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }

      await audit(
        'add_member',
        `Added ${targetUser.username} to ${targetPool.pool_name}`,
        { user_id, username: targetUser.username }
      )

      return NextResponse.json({ success: true })
    }

    // ===== ADD ADMIN NOTE =====
    case 'add_note': {
      const { content } = payload
      if (!content?.trim()) {
        return NextResponse.json({ error: 'content is required' }, { status: 400 })
      }
      // Store notes as audit_log entries with action='admin_note'
      await audit('admin_note', content.trim(), {
        note_type: 'admin_note',
        pool_name: targetPool.pool_name,
      })
      return NextResponse.json({ success: true })
    }

    // ===== ADJUST POINTS =====
    case 'adjust_points': {
      const { entry_id, adjustment, reason } = payload
      if (!entry_id || adjustment == null || !reason?.trim()) {
        return NextResponse.json(
          { error: 'entry_id, adjustment, and reason are required' },
          { status: 400 }
        )
      }

      const adj = Number(adjustment)
      if (isNaN(adj) || adj === 0) {
        return NextResponse.json({ error: 'adjustment must be a non-zero number' }, { status: 400 })
      }

      // Get current entry
      const { data: entry } = await supabase
        .from('pool_entries')
        .select(
          'entry_name, point_adjustment, match_points, bonus_points, total_points, member_id, pool_members!inner(pool_id, user_id, pools(pool_name))'
        )
        .eq('entry_id', entry_id)
        .single()

      if (!entry) {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
      }

      // Verify entry belongs to this pool
      const entryPoolId = (entry as any)?.pool_members?.pool_id
      if (entryPoolId !== id) {
        return NextResponse.json({ error: 'Entry does not belong to this pool' }, { status: 400 })
      }

      const newAdjustment = (entry.point_adjustment || 0) + adj
      const newTotal = (entry.match_points || 0) + (entry.bonus_points || 0) + newAdjustment

      const { error: updateError } = await supabase
        .from('pool_entries')
        .update({
          point_adjustment: newAdjustment,
          adjustment_reason: reason.trim(),
          total_points: newTotal,
        })
        .eq('entry_id', entry_id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      // Get username for audit
      const entryUserId = (entry as any)?.pool_members?.user_id
      const { data: entryUser } = await supabase
        .from('users')
        .select('username')
        .eq('user_id', entryUserId)
        .single()

      await audit(
        'adjust_points',
        `Adjusted points for ${entryUser?.username || 'unknown'}'s "${entry.entry_name || 'Unknown'}": ${adj > 0 ? '+' : ''}${adj} (${reason.trim()})`,
        {
          entry_id,
          entry_name: entry.entry_name,
          user_id: entryUserId,
          username: entryUser?.username,
          adjustment: adj,
          previous_adjustment: entry.point_adjustment || 0,
          new_adjustment: newAdjustment,
          new_total: newTotal,
          reason: reason.trim(),
        }
      )

      return NextResponse.json({ success: true, newTotal, newAdjustment })
    }

    // ===== UNLOCK PREDICTIONS =====
    case 'unlock_predictions': {
      const { entry_id } = payload
      if (!entry_id) {
        return NextResponse.json({ error: 'entry_id is required' }, { status: 400 })
      }

      const { error: updateError } = await supabase
        .from('pool_entries')
        .update({
          has_submitted_predictions: false,
          predictions_submitted_at: null,
        })
        .eq('entry_id', entry_id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      // Also reset round-level submissions for progressive pools
      const { data: entry } = await supabase
        .from('pool_entries')
        .select(
          'entry_name, member_id, pool_members!inner(pool_id, user_id, pools(pool_name, prediction_mode))'
        )
        .eq('entry_id', entry_id)
        .single()

      const poolData = (entry as any)?.pool_members?.pools
      const entryPoolId = (entry as any)?.pool_members?.pool_id

      if (poolData?.prediction_mode === 'progressive' && entryPoolId) {
        const { data: openRounds } = await supabase
          .from('pool_round_states')
          .select('round_key')
          .eq('pool_id', entryPoolId)
          .eq('state', 'open')

        const openRoundKeys = (openRounds ?? []).map((r: any) => r.round_key)
        if (openRoundKeys.length > 0) {
          await supabase
            .from('entry_round_submissions')
            .update({ has_submitted: false, submitted_at: null, updated_at: new Date().toISOString() })
            .eq('entry_id', entry_id)
            .in('round_key', openRoundKeys)
        }
      }

      // Get username for audit
      const entryUserId = (entry as any)?.pool_members?.user_id
      const { data: entryUser } = await supabase
        .from('users')
        .select('username')
        .eq('user_id', entryUserId)
        .single()

      await audit(
        'unlock_predictions',
        `Unlocked predictions for ${entryUser?.username || 'unknown'}'s entry "${entry?.entry_name || 'Unknown'}" in ${targetPool.pool_name}`,
        { entry_id, entry_name: entry?.entry_name, user_id: entryUserId, username: entryUser?.username }
      )

      return NextResponse.json({ success: true })
    }

    // ===== DELETE ENTRY =====
    case 'delete_entry': {
      const { entry_id } = payload
      if (!entry_id) {
        return NextResponse.json({ error: 'entry_id is required' }, { status: 400 })
      }

      const adminSupabase = createAdminClient()

      // Get entry info for audit
      const { data: entry } = await supabase
        .from('pool_entries')
        .select(
          'entry_name, member_id, pool_members!inner(pool_id, user_id)'
        )
        .eq('entry_id', entry_id)
        .single()

      if (!entry) {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
      }

      // Verify entry belongs to this pool
      const entryPoolId = (entry as any)?.pool_members?.pool_id
      if (entryPoolId !== id) {
        return NextResponse.json({ error: 'Entry does not belong to this pool' }, { status: 400 })
      }

      // Cascade delete entry data (FK-safe order)
      for (const table of [
        'match_scores',
        'bonus_scores',
        'predictions',
        'group_predictions',
        'special_predictions',
        'player_scores',
        'entry_round_submissions',
      ]) {
        await adminSupabase.from(table).delete().eq('entry_id', entry_id)
      }
      await adminSupabase.from('pool_entries').delete().eq('entry_id', entry_id)

      // Get username for audit
      const entryUserId = (entry as any)?.pool_members?.user_id
      const { data: entryUser } = await supabase
        .from('users')
        .select('username')
        .eq('user_id', entryUserId)
        .single()

      await audit(
        'delete_entry',
        `Deleted entry "${entry.entry_name || 'Unknown'}" by ${entryUser?.username || 'unknown'} from ${targetPool.pool_name}`,
        { entry_id, entry_name: entry.entry_name, user_id: entryUserId, username: entryUser?.username }
      )

      return NextResponse.json({ success: true })
    }

    // ===== LOCK ALL PREDICTIONS =====
    case 'lock_all_predictions': {
      // Get all member IDs for this pool
      const { data: members } = await supabase
        .from('pool_members')
        .select('member_id')
        .eq('pool_id', id)

      const memberIds = members?.map((m) => m.member_id) || []

      if (memberIds.length === 0) {
        return NextResponse.json({ error: 'No members in this pool' }, { status: 400 })
      }

      const { error: updateError } = await supabase
        .from('pool_entries')
        .update({ has_submitted_predictions: true })
        .in('member_id', memberIds)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      await audit(
        'lock_all_predictions',
        `Locked all predictions for ${targetPool.pool_name}`,
        { member_count: memberIds.length }
      )

      return NextResponse.json({ success: true })
    }

    // ===== UNLOCK ALL PREDICTIONS =====
    case 'unlock_all_predictions': {
      // Get all member IDs for this pool
      const { data: members } = await supabase
        .from('pool_members')
        .select('member_id')
        .eq('pool_id', id)

      const memberIds = members?.map((m) => m.member_id) || []

      if (memberIds.length === 0) {
        return NextResponse.json({ error: 'No members in this pool' }, { status: 400 })
      }

      const { error: updateError } = await supabase
        .from('pool_entries')
        .update({ has_submitted_predictions: false })
        .in('member_id', memberIds)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      await audit(
        'unlock_all_predictions',
        `Unlocked all predictions for ${targetPool.pool_name}`,
        { member_count: memberIds.length }
      )

      return NextResponse.json({ success: true })
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}
