import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { sendEmail, sendBatchEmails } from '@/lib/email/send'
import { mentionNotificationTemplate } from '@/lib/email/templates'
import { syncContactToResend } from '@/lib/email/contacts'
import { TOPICS } from '@/lib/email/topics'

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  let body: { pool_id?: string; message_content?: string; mentioned_user_ids?: string[] }
  try {
    body = await request.json()
  } catch {
    console.error('[Mention] Invalid JSON body')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { pool_id, message_content, mentioned_user_ids } = body

  if (!pool_id || !message_content || !mentioned_user_ids?.length) {
    console.error('[Mention] Missing fields:', { pool_id: !!pool_id, message_content: !!message_content, mentioned_user_ids: mentioned_user_ids?.length })
    return NextResponse.json({ error: 'pool_id, message_content, and mentioned_user_ids are required' }, { status: 400 })
  }

  console.log(`[Mention] Processing mention notification for ${mentioned_user_ids.length} user(s) in pool ${pool_id}`)

  // Get sender display info
  const { data: senderData, error: senderError } = await supabase
    .from('users')
    .select('username, full_name')
    .eq('user_id', userData.user_id)
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
  const mentionedIds = (mentioned_user_ids as string[]).filter(id => id !== userData.user_id)

  if (mentionedIds.length === 0) {
    console.log('[Mention] Sender mentioned themselves only, skipping')
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

  console.log(`[Mention] Sending to ${mentionedUsers.length} recipient(s): ${mentionedUsers.map(u => u.email).join(', ')}`)

  // Sync mentioned users as Resend contacts (non-blocking — don't let sync failures prevent email)
  try {
    await Promise.allSettled(
      mentionedUsers.map((recipient) => {
        const nameParts = (recipient.full_name || '').split(' ')
        return syncContactToResend({
          email: recipient.email,
          firstName: nameParts[0] || recipient.username,
          lastName: nameParts.slice(1).join(' ') || undefined,
        })
      })
    )
  } catch (err) {
    console.warn('[Mention] Contact sync had errors (continuing with send):', err)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'
  const senderName = senderData.full_name || senderData.username

  const emailPayloads = mentionedUsers.map((recipient) => {
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

  // Use individual sendEmail for single recipient (more reliable), batch for multiple
  let result: { success: boolean; error?: unknown }

  if (emailPayloads.length === 1) {
    result = await sendEmail(emailPayloads[0])
    if (!result.success) {
      console.error('[Mention] Single send failed:', result.error)
      // Retry once
      console.log('[Mention] Retrying single send...')
      result = await sendEmail(emailPayloads[0])
      if (!result.success) {
        console.error('[Mention] Retry also failed:', result.error)
      }
    }
  } else {
    result = await sendBatchEmails(emailPayloads)
    if (!result.success) {
      console.error('[Mention] Batch send failed:', result.error)
      // Fallback: send individually
      console.log('[Mention] Falling back to individual sends...')
      let sentCount = 0
      for (const email of emailPayloads) {
        const individual = await sendEmail(email)
        if (individual.success) sentCount++
        else console.error(`[Mention] Individual send to ${email.to} failed:`, individual.error)
      }
      result = { success: sentCount > 0 }
      console.log(`[Mention] Fallback sent ${sentCount}/${emailPayloads.length}`)
    }
  }

  console.log(`[Mention] Result: ${result.success ? 'success' : 'failed'}, count: ${emailPayloads.length}`)
  return NextResponse.json({ sent: result.success, count: emailPayloads.length })
}
