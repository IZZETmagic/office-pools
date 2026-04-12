import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { sendEmail } from '@/lib/email/send'
import { pointsAdjustedTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'
import { sendPushToUser } from '@/lib/push/apns'

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { pool_id, target_user_id, entry_name, adjustment, reason, new_total } = await request.json()
  if (!pool_id || !target_user_id || !entry_name || adjustment === undefined || !reason) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Verify caller is admin of this pool
  const { data: adminMembership } = await supabase
    .from('pool_members')
    .select('role')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!adminMembership || adminMembership.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Get target user info
  const { data: targetUser } = await supabase
    .from('users')
    .select('email, username, full_name')
    .eq('user_id', target_user_id)
    .single()

  if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: pool } = await supabase
    .from('pools')
    .select('pool_name')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'
  const sign = adjustment > 0 ? '+' : ''

  const { subject, html } = pointsAdjustedTemplate({
    userName: targetUser.full_name || targetUser.username || 'there',
    poolName: pool.pool_name,
    entryName: entry_name,
    adjustment,
    reason,
    newTotal: new_total ?? 0,
    poolUrl: `${appUrl}/pools/${pool_id}`,
  })

  const [emailResult] = await Promise.allSettled([
    sendEmail({
      to: targetUser.email,
      subject,
      html,
      topicId: TOPICS.ADMIN,
      tags: [{ name: 'category', value: 'points_adjusted' }],
    }),
    sendPushToUser(target_user_id, {
      title: `Points Adjusted (${sign}${adjustment})`,
      body: `${pool.pool_name}: ${reason}`,
      data: { type: 'admin', pool_id },
    }),
  ])

  const result = emailResult.status === 'fulfilled' ? emailResult.value : { success: false }
  return NextResponse.json({ sent: result.success })
}
