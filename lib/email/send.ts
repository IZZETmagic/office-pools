import { getResendClient } from './resend'

type SendEmailParams = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  topicId?: string
  tags?: { name: string; value: string }[]
}

export async function sendEmail({ to, subject, html, text, topicId, tags }: SendEmailParams) {
  const resend = getResendClient()
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Sport Pool <notifications@sportpool.io>'

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || subject,
      ...(topicId ? { topicId } : {}),
      ...(tags ? { tags } : {}),
    })

    if (error) {
      console.error('[Email] Failed to send:', error)
      return { success: false, error }
    }

    return { success: true, id: data?.id }
  } catch (err) {
    console.error('[Email] Exception:', err)
    return { success: false, error: err }
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
      console.error('[Email] Batch send failed:', error)
      return { success: false, error }
    }

    return { success: true, data }
  } catch (err) {
    console.error('[Email] Batch exception:', err)
    return { success: false, error: err }
  }
}
