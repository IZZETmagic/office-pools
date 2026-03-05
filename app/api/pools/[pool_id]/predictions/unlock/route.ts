import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email/send'
import { predictionsUnlockedTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'

// POST /api/pools/:poolId/predictions/unlock - Admin unlocks an entry's predictions
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('user_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

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

  const { error: updateError } = await supabase
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
      await supabase
        .from('entry_round_submissions')
        .update({
          has_submitted: false,
          submitted_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('entry_id', entryId)
        .in('round_key', openRoundKeys)
    }
  }

  // Log the unlock action for audit trail
  await supabase
    .from('admin_audit_log')
    .insert({
      pool_id: pool_id,
      admin_user_id: userData.user_id,
      target_member_id: entry.member_id,
      action: 'unlock_predictions',
      details: {
        entry_id: entryId,
        reason: body.reason || null,
        timestamp: new Date().toISOString(),
      },
    })

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
