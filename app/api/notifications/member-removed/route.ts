import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { sendEmail } from '@/lib/email/send'
import { memberRemovedTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'
import { sendPushToUser } from '@/lib/push/apns'

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { pool_id, removed_user_id } = await request.json()
  if (!pool_id || !removed_user_id) {
    return NextResponse.json({ error: 'pool_id and removed_user_id are required' }, { status: 400 })
  }

  const { data: adminMembership } = await supabase
    .from('pool_members')
    .select('role')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!adminMembership || adminMembership.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Get removed user's info
  const { data: removedUser } = await supabase
    .from('users')
    .select('email, username, full_name')
    .eq('user_id', removed_user_id)
    .single()

  if (!removedUser) return NextResponse.json({ error: 'Removed user not found' }, { status: 404 })

  const { data: pool } = await supabase
    .from('pools')
    .select('pool_name')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  const { subject, html } = memberRemovedTemplate({
    userName: removedUser.full_name || removedUser.username || 'there',
    poolName: pool.pool_name,
  })

  const [emailResult] = await Promise.allSettled([
    sendEmail({
      to: removedUser.email,
      subject,
      html,
      topicId: TOPICS.ADMIN,
      tags: [{ name: 'category', value: 'admin' }],
    }),
    sendPushToUser(removed_user_id, {
      title: 'Removed from Pool',
      body: `You've been removed from ${pool.pool_name}`,
      data: { type: 'admin', pool_id },
    }),
  ])

  const result = emailResult.status === 'fulfilled' ? emailResult.value : { success: false }
  return NextResponse.json({ sent: result.success })
}
