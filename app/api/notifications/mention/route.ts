import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sendBatchEmails } from '@/lib/email/send'
import { mentionNotificationTemplate } from '@/lib/email/templates'
import { syncContactToResend } from '@/lib/email/contacts'
import { TOPICS } from '@/lib/email/topics'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.error('[Mention] Unauthorized — no auth user from cookies')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { pool_id, message_content, mentioned_user_ids } = await request.json()

  if (!pool_id || !message_content || !mentioned_user_ids?.length) {
    return NextResponse.json({ error: 'pool_id, message_content, and mentioned_user_ids are required' }, { status: 400 })
  }

  // Get sender info
  const { data: senderData, error: senderError } = await supabase
    .from('users')
    .select('user_id, username, full_name')
    .eq('auth_user_id', user.id)
    .single()

  if (senderError || !senderData) {
    console.error('[Mention] Sender lookup failed:', senderError)
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Get pool info
  const { data: pool, error: poolError } = await supabase
    .from('pools')
    .select('pool_name')
    .eq('pool_id', pool_id)
    .single()

  if (poolError || !pool) {
    console.error('[Mention] Pool lookup failed:', poolError)
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }

  // Get mentioned users' emails (excluding the sender)
  const mentionedIds = (mentioned_user_ids as string[]).filter(id => id !== senderData.user_id)

  if (mentionedIds.length === 0) {
    return NextResponse.json({ sent: true, count: 0 })
  }

  const { data: mentionedUsers, error: mentionedError } = await supabase
    .from('users')
    .select('email, username, full_name')
    .in('user_id', mentionedIds)

  if (mentionedError) {
    console.error('[Mention] Mentioned users lookup failed:', mentionedError)
    return NextResponse.json({ error: 'Failed to lookup mentioned users' }, { status: 500 })
  }

  if (!mentionedUsers || mentionedUsers.length === 0) {
    console.warn('[Mention] No mentioned users found for IDs:', mentionedIds)
    return NextResponse.json({ sent: true, count: 0 })
  }

  // Sync mentioned users as Resend contacts (ensures topic-based sending works)
  await Promise.all(
    mentionedUsers.map((recipient) => {
      const nameParts = (recipient.full_name || '').split(' ')
      return syncContactToResend({
        email: recipient.email,
        firstName: nameParts[0] || recipient.username,
        lastName: nameParts.slice(1).join(' ') || undefined,
      })
    })
  )

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
      ...(TOPICS.COMMUNITY ? { topicId: TOPICS.COMMUNITY } : {}),
      tags: [{ name: 'category', value: 'community' }],
    }
  })

  const result = await sendBatchEmails(emails)

  if (!result.success) {
    console.error('[Mention] Batch send failed:', result.error)
  }

  return NextResponse.json({ sent: result.success, count: emails.length })
}
