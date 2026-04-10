import { sendEmail, sendBatchEmails } from '@/lib/email/send'
import { sendPushToUser, sendPushToUsers, sendPushToAll } from '@/lib/push/apns'

type PushPayload = {
  title: string
  body: string
  data?: Record<string, string>
}

type EmailPayload = {
  to: string
  subject: string
  html: string
  text?: string
  topicId?: string
  tags?: { name: string; value: string }[]
}

/**
 * Send both email and push notification to a single user.
 * Both channels are best-effort — failure in one doesn't block the other.
 */
export async function notifyUser(params: {
  userId: string
  email: EmailPayload
  push: PushPayload
}) {
  const [emailResult, pushResult] = await Promise.allSettled([
    sendEmail(params.email),
    sendPushToUser(params.userId, params.push),
  ])

  return {
    email: emailResult.status === 'fulfilled' ? emailResult.value : { success: false },
    push: pushResult.status === 'fulfilled' ? pushResult.value : { sent: 0, total: 0 },
  }
}

/**
 * Send both email batch and push notifications to multiple users.
 * Requires a mapping of userId → email payload, plus a shared push payload.
 */
export async function notifyUsers(params: {
  recipients: Array<{ userId: string; email: EmailPayload }>
  push: PushPayload
}) {
  const userIds = params.recipients.map((r) => r.userId)
  const emailPayloads = params.recipients.map((r) => r.email)

  const [emailResult, pushResult] = await Promise.allSettled([
    emailPayloads.length === 1
      ? sendEmail(emailPayloads[0])
      : sendBatchEmails(emailPayloads),
    sendPushToUsers(userIds, params.push),
  ])

  return {
    email: emailResult.status === 'fulfilled' ? emailResult.value : { success: false },
    push: pushResult.status === 'fulfilled' ? pushResult.value : { sent: 0, total: 0 },
  }
}

/**
 * Broadcast email + push to all users (admin announcements).
 */
export async function notifyAll(params: {
  emails: EmailPayload[]
  push: PushPayload
  batchSize?: number
}) {
  const BATCH_SIZE = params.batchSize ?? 100

  // Send emails in batches
  const emailPromise = (async () => {
    let totalSent = 0
    for (let i = 0; i < params.emails.length; i += BATCH_SIZE) {
      const batch = params.emails.slice(i, i + BATCH_SIZE)
      const result = await sendBatchEmails(batch)
      if (result.success) totalSent += batch.length
    }
    return { success: true, totalSent, totalEmails: params.emails.length }
  })()

  const [emailResult, pushResult] = await Promise.allSettled([
    emailPromise,
    sendPushToAll(params.push),
  ])

  return {
    email: emailResult.status === 'fulfilled' ? emailResult.value : { success: false, totalSent: 0 },
    push: pushResult.status === 'fulfilled' ? pushResult.value : { sent: 0, total: 0 },
  }
}
