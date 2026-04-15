import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'

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

  // Verify target user exists
  const { data: targetUser } = await supabase
    .from('users')
    .select('user_id, auth_user_id, email, username, full_name, is_active, is_super_admin')
    .eq('user_id', id)
    .single()

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Helper to insert audit log entry
  async function audit(auditAction: string, summary: string, details?: Record<string, any>) {
    await supabase.from('admin_audit_log').insert({
      action: auditAction,
      performed_by: userData.user_id,
      target_user_id: id,
      details: details || {},
      summary,
    })
  }

  switch (action) {
    // ===== RESET PASSWORD =====
    case 'reset_password': {
      if (!targetUser.auth_user_id) {
        return NextResponse.json({ error: 'User has no auth account' }, { status: 400 })
      }
      const adminSupabase = createAdminClient()
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'
      const { error } = await adminSupabase.auth.admin.generateLink({
        type: 'recovery',
        email: targetUser.email,
        options: {
          redirectTo: `${appUrl}/auth/callback?next=/reset-password`,
        },
      })
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      await audit('reset_password', `Sent password reset to ${targetUser.username}`, {
        email: targetUser.email,
      })
      return NextResponse.json({ success: true })
    }

    // ===== SEND DIRECT EMAIL =====
    case 'send_email': {
      const { subject, body: emailBody } = payload
      if (!subject?.trim() || !emailBody?.trim()) {
        return NextResponse.json({ error: 'subject and body are required' }, { status: 400 })
      }
      const result = await sendEmail({
        to: targetUser.email,
        subject: subject.trim(),
        html: emailBody.trim(),
        tags: [{ name: 'category', value: 'admin-direct' }],
      })
      if (!result.success) {
        return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
      }
      await audit('send_email', `Sent email to ${targetUser.username}: "${subject.trim()}"`, {
        subject: subject.trim(),
        email: targetUser.email,
        resend_id: result.id,
      })
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
      })
      return NextResponse.json({ success: true })
    }

    // ===== TOGGLE FLAG =====
    case 'toggle_flag': {
      const { reason } = payload
      if (!reason?.trim()) {
        return NextResponse.json({ error: 'reason is required' }, { status: 400 })
      }

      // Determine current flag status from latest audit event
      const { data: latestFlag } = await supabase
        .from('admin_audit_log')
        .select('action')
        .eq('target_user_id', id)
        .in('action', ['flag_user', 'unflag_user'])
        .order('performed_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const currentlyFlagged = latestFlag?.action === 'flag_user'
      const newAction = currentlyFlagged ? 'unflag_user' : 'flag_user'
      const summary = currentlyFlagged
        ? `Unflagged ${targetUser.username}: ${reason.trim()}`
        : `Flagged ${targetUser.username}: ${reason.trim()}`

      await audit(newAction, summary, { reason: reason.trim() })

      return NextResponse.json({ success: true, isFlagged: !currentlyFlagged })
    }

    // ===== REMOVE FROM POOL =====
    case 'remove_from_pool': {
      const { pool_id } = payload
      if (!pool_id) {
        return NextResponse.json({ error: 'pool_id is required' }, { status: 400 })
      }

      const adminSupabase = createAdminClient()

      // Get the member record
      const { data: membership } = await supabase
        .from('pool_members')
        .select('member_id, role')
        .eq('pool_id', pool_id)
        .eq('user_id', id)
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

      // Get pool name for audit
      const { data: pool } = await supabase
        .from('pools')
        .select('pool_name')
        .eq('pool_id', pool_id)
        .single()

      await audit(
        'remove_from_pool',
        `Removed ${targetUser.username} from ${pool?.pool_name || 'pool'}`,
        { pool_id, pool_name: pool?.pool_name, entries_deleted: entryIds.length }
      )

      return NextResponse.json({ success: true })
    }

    // ===== TRANSFER POOL OWNERSHIP =====
    case 'transfer_ownership': {
      const { pool_id, new_admin_user_id } = payload
      if (!pool_id || !new_admin_user_id) {
        return NextResponse.json(
          { error: 'pool_id and new_admin_user_id are required' },
          { status: 400 }
        )
      }

      // Verify target user is admin of this pool
      const { data: currentAdmin } = await supabase
        .from('pool_members')
        .select('member_id, role')
        .eq('pool_id', pool_id)
        .eq('user_id', id)
        .single()

      if (!currentAdmin || currentAdmin.role !== 'admin') {
        return NextResponse.json({ error: 'User is not the admin of this pool' }, { status: 400 })
      }

      // Verify new admin is a member of the pool
      const { data: newAdminMember } = await supabase
        .from('pool_members')
        .select('member_id')
        .eq('pool_id', pool_id)
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

      // Get names for audit
      const [poolRes, newAdminRes] = await Promise.all([
        supabase.from('pools').select('pool_name').eq('pool_id', pool_id).single(),
        supabase.from('users').select('username').eq('user_id', new_admin_user_id).single(),
      ])

      await audit(
        'transfer_ownership',
        `Transferred ${poolRes.data?.pool_name || 'pool'} ownership from ${targetUser.username} to ${newAdminRes.data?.username || 'unknown'}`,
        {
          pool_id,
          pool_name: poolRes.data?.pool_name,
          new_admin_user_id,
          new_admin_username: newAdminRes.data?.username,
        }
      )

      return NextResponse.json({ success: true })
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
          'entry_name, member_id, pool_members!inner(pool_id, pools(pool_name, prediction_mode))'
        )
        .eq('entry_id', entry_id)
        .single()

      const poolData = (entry as any)?.pool_members?.pools
      const poolId = (entry as any)?.pool_members?.pool_id

      if (poolData?.prediction_mode === 'progressive' && poolId) {
        const { data: openRounds } = await supabase
          .from('pool_round_states')
          .select('round_key')
          .eq('pool_id', poolId)
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

      await audit(
        'unlock_predictions',
        `Unlocked predictions for ${targetUser.username}'s entry "${entry?.entry_name || 'Unknown'}" in ${poolData?.pool_name || 'pool'}`,
        { entry_id, entry_name: entry?.entry_name, pool_name: poolData?.pool_name }
      )

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
          'entry_name, point_adjustment, match_points, bonus_points, total_points, member_id, pool_members!inner(pool_id, pools(pool_name))'
        )
        .eq('entry_id', entry_id)
        .single()

      if (!entry) {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
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

      const poolName = (entry as any)?.pool_members?.pools?.pool_name

      await audit(
        'adjust_points',
        `Adjusted points for ${targetUser.username}'s "${entry.entry_name || 'Unknown'}": ${adj > 0 ? '+' : ''}${adj} (${reason.trim()})`,
        {
          entry_id,
          entry_name: entry.entry_name,
          pool_name: poolName,
          adjustment: adj,
          previous_adjustment: entry.point_adjustment || 0,
          new_adjustment: newAdjustment,
          new_total: newTotal,
          reason: reason.trim(),
        }
      )

      return NextResponse.json({ success: true, newTotal, newAdjustment })
    }

    // ===== IMPERSONATE (GENERATE OTP FOR CLIENT-SIDE AUTH) =====
    case 'impersonate': {
      if (!targetUser.auth_user_id) {
        return NextResponse.json({ error: 'User has no auth account' }, { status: 400 })
      }
      const adminSupabase = createAdminClient()
      const { data, error } = await adminSupabase.auth.admin.generateLink({
        type: 'magiclink',
        email: targetUser.email,
      })
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      await audit('impersonate', `Generated impersonation token for ${targetUser.username}`, {
        email: targetUser.email,
      })

      // Return the OTP token + email so the client can call verifyOtp directly
      return NextResponse.json({
        success: true,
        email: targetUser.email,
        token: data.properties?.email_otp,
      })
    }

    // ===== DELETE ACCOUNT =====
    case 'delete_account': {
      const { confirm_username } = payload
      if (confirm_username !== targetUser.username) {
        return NextResponse.json({ error: 'Username confirmation does not match' }, { status: 400 })
      }

      if (id === userData.user_id) {
        return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
      }

      if (targetUser.is_super_admin) {
        return NextResponse.json(
          { error: 'Cannot delete a super admin. Remove admin privileges first.' },
          { status: 400 }
        )
      }

      const adminSupabase = createAdminClient()

      // Get member IDs
      const { data: members } = await supabase
        .from('pool_members')
        .select('member_id')
        .eq('user_id', id)

      const memberIds = members?.map((m) => m.member_id) || []

      // Get entry IDs
      let entryIds: string[] = []
      if (memberIds.length > 0) {
        const { data: entries } = await supabase
          .from('pool_entries')
          .select('entry_id')
          .in('member_id', memberIds)
        entryIds = entries?.map((e) => e.entry_id) || []
      }

      // Cascade delete in FK-safe order
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

      if (memberIds.length > 0) {
        await adminSupabase.from('pool_members').delete().in('member_id', memberIds)
      }

      // Clean up audit log references (best-effort)
      await adminSupabase.from('admin_audit_log').delete().eq('performed_by', id)
      await adminSupabase.from('admin_audit_log').delete().eq('target_user_id', id)

      // Delete user record
      const { error: deleteError } = await adminSupabase
        .from('users')
        .delete()
        .eq('user_id', id)

      if (deleteError) {
        return NextResponse.json({ error: 'Failed to delete user record' }, { status: 500 })
      }

      // Delete auth user
      if (targetUser.auth_user_id) {
        await adminSupabase.auth.admin.deleteUser(targetUser.auth_user_id)
      }

      console.log(
        `[Super Admin] User ${targetUser.username} (${id}) deleted by ${userData.user_id}`
      )

      return NextResponse.json({ success: true, deleted: true })
    }

    // ===== ADD TO POOL =====
    case 'add_to_pool': {
      const { pool_id } = payload
      if (!pool_id) {
        return NextResponse.json({ error: 'pool_id is required' }, { status: 400 })
      }

      // Verify user is not already a member
      const { data: existingMember } = await supabase
        .from('pool_members')
        .select('member_id')
        .eq('pool_id', pool_id)
        .eq('user_id', id)
        .maybeSingle()

      if (existingMember) {
        return NextResponse.json({ error: 'User is already a member of this pool' }, { status: 400 })
      }

      // Add as player
      const { error: insertError } = await supabase
        .from('pool_members')
        .insert({
          pool_id,
          user_id: id,
          role: 'player',
          entry_fee_paid: false,
        })

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }

      // Get pool name for audit
      const { data: pool } = await supabase
        .from('pools')
        .select('pool_name')
        .eq('pool_id', pool_id)
        .single()

      await audit(
        'add_to_pool',
        `Added ${targetUser.username} to ${pool?.pool_name || 'pool'}`,
        { pool_id, pool_name: pool?.pool_name }
      )

      return NextResponse.json({ success: true })
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}
