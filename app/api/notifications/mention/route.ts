import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sendBatchEmails } from '@/lib/email/send'
import { mentionNotificationTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pool_id, message_content, mentioned_user_ids } = await request.json()
  if (!pool_id || !message_content || !mentioned_user_ids?.length) {
    return NextResponse.json({ error: 'pool_id, message_content, and mentioned_user_ids are required' }, { status: 400 })
  }

  // Get sender info
  const { data: senderData } = await supabase
    .from('users')
    .select('user_id, username, full_name')
    .eq('auth_user_id', user.id)
    .single()

  if (!senderData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Get pool info
  const { data: pool } = await supabase
    .from('pools')
    .select('pool_name')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  // Get mentioned users' emails (excluding the sender)
  const mentionedIds = (mentioned_user_ids as string[]).filter(id => id !== senderData.user_id)
  if (mentionedIds.length === 0) {
    return NextResponse.json({ sent: true, count: 0 })
  }

  const { data: mentionedUsers } = await supabase
    .from('users')
    .select('email, username, full_name')
    .in('user_id', mentionedIds)

  if (!mentionedUsers || mentionedUsers.length === 0) {
    return NextResponse.json({ sent: true, count: 0 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'
  const senderName = senderData.full_name || senderData.username

  const emails = mentionedUsers.map((recipient) => {
    const { subject, html } = mentionNotificationTemplate({
      recipientName: recipient.full_name || recipient.username,
      mentionerName: senderName,
      poolName: pool.pool_name,
      messageContent: message_content,
      poolUrl: `${appUrl}/pools/${pool_id}`,
    })
    return {
      to: recipient.email,
      subject,
      html,
      topicId: TOPICS.COMMUNITY,
      tags: [{ name: 'category', value: 'community' }],
    }
  })

  const result = await sendBatchEmails(emails)

  return NextResponse.json({ sent: result.success, count: emails.length })
}
