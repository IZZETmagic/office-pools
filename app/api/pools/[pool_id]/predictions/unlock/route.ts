import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { predictionsUnlockedTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'
import { withPerfLogging } from '@/lib/api-perf'

// POST /api/pools/:poolId/predictions/unlock - Admin unlocks an entry's predictions
async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  // Verify admin role
  const { data: adminMembership } = await supabase
    .from('pool_members')
    .select('member_id, role')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!adminMembership || adminMembership.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { entryId } = body as { entryId: string }

  if (!entryId) {
    return NextResponse.json({ error: 'entryId is required' }, { status: 400 })
  }

  // Verify the entry belongs to a member of this pool
  const { data: entry } = await supabase
    .from('pool_entries')
    .select('entry_id, entry_name, member_id, pool_members!inner(pool_id, user_id)')
    .eq('entry_id', entryId)
    .single()

  if (!entry || (entry as any).pool_members?.pool_id !== pool_id) {
    return NextResponse.json({ error: 'Entry not found in this pool' }, { status: 404 })
  }

  // Admin role has already been verified above with the RLS-gated user
  // client. The mutations below need to bypass RLS because
  // entry_round_submissions only grants pool admins SELECT (not UPDATE),
  // so the user client silently no-ops the update and the endpoint
  // returns success while changing nothing. Use the service-role client
  // (same pattern as rounds/[key]/state and admin/pools/[id]/actions).
  const adminSupabase = createAdminClient()

  const { error: updateError } = await adminSupabase
    .from('pool_entries')
    .update({
      has_submitted_predictions: false,
      predictions_submitted_at: null,
    })
    .eq('entry_id', entryId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // For progressive mode, also reset round-level submissions so the user can re-edit and re-submit
  const { data: pool } = await supabase
    .from('pools')
    .select('prediction_mode')
    .eq('pool_id', pool_id)
    .single()

  if (pool?.prediction_mode === 'progressive') {
    // Reset all submitted rounds for this entry that are still in an open round
    const { data: openRounds } = await supabase
      .from('pool_round_states')
      .select('round_key')
      .eq('pool_id', pool_id)
      .eq('state', 'open')

    const openRoundKeys = (openRounds ?? []).map(r => r.round_key)

    if (openRoundKeys.length > 0) {
      const { error: ersError } = await adminSupabase
        .from('entry_round_submissions')
        .update({
          has_submitted: false,
          submitted_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('entry_id', entryId)
        .in('round_key', openRoundKeys)
      if (ersError) {
        return NextResponse.json({ error: ersError.message }, { status: 500 })
      }
    }
  }

  // Log the unlock action for audit trail. Column names must match the
  // admin_audit_log schema (performed_by / target_user_id / performed_at);
  // earlier this used legacy field names and the insert was silently
  // failing on every call.
  const targetUserId = (entry as any).pool_members?.user_id ?? null
  const { error: auditError } = await adminSupabase
    .from('admin_audit_log')
    .insert({
      action: 'unlock_predictions',
      performed_by: userData.user_id,
      pool_id: pool_id,
      target_user_id: targetUserId,
      summary: `Unlocked predictions for entry ${entry.entry_name || entryId}`,
      details: {
        entry_id: entryId,
        entry_name: entry.entry_name || null,
        reason: body.reason || null,
      },
    })
  if (auditError) {
    console.error('[unlock-predictions] audit log insert failed:', auditError)
  }

  // Send notification email to the entry owner (fire-and-forget)
  const entryOwnerUserId = (entry as any).pool_members?.user_id
  if (entryOwnerUserId) {
    const { data: ownerData } = await supabase
      .from('users')
      .select('email, username, full_name')
      .eq('user_id', entryOwnerUserId)
      .single()

    if (ownerData) {
      const { data: pool } = await supabase
        .from('pools')
        .select('pool_name')
        .eq('pool_id', pool_id)
        .single()

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'
      const { subject, html } = predictionsUnlockedTemplate({
        userName: ownerData.full_name || ownerData.username,
        poolName: pool?.pool_name || 'your pool',
        entryName: entry.entry_name || 'Entry',
        poolUrl: `${appUrl}/pools/${pool_id}`,
      })

      sendEmail({
        to: ownerData.email,
        subject,
        html,
        topicId: TOPICS.ADMIN,
        tags: [{ name: 'category', value: 'admin' }],
      }).catch(console.error)
    }
  }

  return NextResponse.json({ unlocked: true })
}

export const POST = withPerfLogging('/api/pools/[id]/predictions/unlock', handlePOST)
