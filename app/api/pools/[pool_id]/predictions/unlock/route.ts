import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/pools/:poolId/predictions/unlock - Admin unlocks a member's predictions
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
  const { memberId } = body as { memberId: string }

  if (!memberId) {
    return NextResponse.json({ error: 'memberId is required' }, { status: 400 })
  }

  const { error: updateError } = await supabase
    .from('pool_members')
    .update({
      has_submitted_predictions: false,
      predictions_submitted_at: null,
    })
    .eq('member_id', memberId)
    .eq('pool_id', pool_id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Log the unlock action for audit trail
  await supabase
    .from('admin_audit_log')
    .insert({
      pool_id: pool_id,
      admin_user_id: userData.user_id,
      target_member_id: memberId,
      action: 'unlock_predictions',
      details: {
        reason: body.reason || null,
        timestamp: new Date().toISOString(),
      },
    })

  return NextResponse.json({ unlocked: true })
}
