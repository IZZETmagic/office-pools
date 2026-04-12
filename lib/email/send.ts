import { getResendClient } from './resend'

type SendEmailParams = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  topicId?: string
  tags?: { name: string; value: string }[]
  reply_to?: string | string[]
  headers?: Record<string, string>
}

export async function sendEmail({ to, subject, html, text, topicId, tags, reply_to, headers }: SendEmailParams) {
  const resend = getResendClient()
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Sport Pool <notifications@sportpool.io>'

  const payload = {
    from: fromAddress,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text: text || subject,
    ...(topicId ? { topicId } : {}),
    ...(tags ? { tags } : {}),
    ...(reply_to ? { reply_to: Array.isArray(reply_to) ? reply_to : [reply_to] } : {}),
    ...(headers ? { headers } : {}),
  }

  try {
    const { data, error } = await resend.emails.send(payload)

    if (error) {
      console.error('[Email] Failed to send, retrying once:', error)
      // Retry once
      const retry = await resend.emails.send(payload)
      if (retry.error) {
        console.error('[Email] Retry also failed:', retry.error)
        return { success: false, error: retry.error }
      }
      return { success: true, id: retry.data?.id }
    }

    return { success: true, id: data?.id }
  } catch (err) {
    console.error('[Email] Exception, retrying once:', err)
    try {
      const retry = await resend.emails.send(payload)
      if (retry.error) return { success: false, error: retry.error }
      return { success: true, id: retry.data?.id }
    } catch (retryErr) {
      console.error('[Email] Retry exception:', retryErr)
      return { success: false, error: retryErr }
    }
  }
}

export async function sendBatchEmails(
  emails: Array<{
    to: string
    subject: string
    html: string
    text?: string
    topicId?: string
    tags?: { name: string; value: string }[]
  }>
) {
  const resend = getResendClient()
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Sport Pool <notifications@sportpool.io>'

  try {
    const { data, error } = await resend.batch.send(
      emails.map((email) => ({
        from: fromAddress,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text || email.subject,
        ...(email.topicId ? { topicId: email.topicId } : {}),
        ...(email.tags ? { tags: email.tags } : {}),
      }))
    )

    if (error) {
      console.error('[Email] Batch send failed, falling back to individual sends:', error)
      // Fallback: send individually
      let sentCount = 0
      for (const email of emails) {
        const result = await sendEmail(email)
        if (result.success) sentCount++
      }
      return sentCount > 0
        ? { success: true, data: { sentCount, total: emails.length } }
        : { success: false, error }
    }

    return { success: true, data }
  } catch (err) {
    console.error('[Email] Batch exception, falling back to individual sends:', err)
    let sentCount = 0
    for (const email of emails) {
      const result = await sendEmail(email)
      if (result.success) sentCount++
    }
    return sentCount > 0
      ? { success: true, data: { sentCount, total: emails.length } }
      : { success: false, error: err }
  }
}
