import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { sendBatchEmails } from '@/lib/email/send'
import { deadlineChangedTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'
import { sendPushToUsers } from '@/lib/push/apns'

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { pool_id, new_deadline } = await request.json()
  if (!pool_id || !new_deadline) {
    return NextResponse.json({ error: 'pool_id and new_deadline are required' }, { status: 400 })
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

  // Get pool info
  const { data: pool } = await supabase
    .from('pools')
    .select('pool_name')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  // Get all pool members (excluding the admin who made the change)
  const { data: members } = await supabase
    .from('pool_members')
    .select('user_id, users!inner(email, username, full_name)')
    .eq('pool_id', pool_id)
    .neq('user_id', userData.user_id)

  if (!members || members.length === 0) {
    return NextResponse.json({ sent: true, count: 0 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'
  const formattedDeadline = new Date(new_deadline).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  const emails = members.map((member) => {
    const u = member.users as any
    const { subject, html } = deadlineChangedTemplate({
      userName: u.full_name || u.username || 'there',
      poolName: pool.pool_name,
      newDeadline: formattedDeadline,
      poolUrl: `${appUrl}/pools/${pool_id}`,
    })
    return {
      to: u.email,
      subject,
      html,
      topicId: TOPICS.ADMIN,
      tags: [{ name: 'category', value: 'admin' }],
    }
  })

  // Send email + push in parallel
  const memberUserIds = members.map((m) => m.user_id)

  const [emailResult] = await Promise.allSettled([
    sendBatchEmails(emails),
    sendPushToUsers(memberUserIds, {
      title: 'Deadline Changed',
      body: `${pool.pool_name}: new deadline is ${formattedDeadline}`,
      data: { type: 'admin', pool_id },
    }),
  ])

  const result = emailResult.status === 'fulfilled' ? emailResult.value : { success: false }
  return NextResponse.json({ sent: result.success, count: emails.length })
}
