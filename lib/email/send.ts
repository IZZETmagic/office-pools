import { recordDeliveries, describeError, type Delivery } from '@/lib/notifications/deliveries'
import type { NotificationTypeKey } from '@/lib/notifications/registry'
import { getResendClient } from './resend'

// Every email sent here is recorded in the delivery record (migration 176):
// one row per address, with Resend's id for it. `kind` and `userId` say what it
// was and who it was for; until N4's fourth step makes `kind` required, a
// sender that names neither is recorded by address alone.

/** What the delivery record should say about an email, besides how it went. */
type RecordedAs = {
  kind?: NotificationTypeKey | null
  /** Who it was for, when the sender knows — the record keeps this instead of the address. */
  userId?: string | null
  poolId?: string | null
}

type SendEmailParams = RecordedAs & {
  to: string | string[]
  subject: string
  html: string
  text?: string
  topicId?: string
  tags?: { name: string; value: string }[]
  reply_to?: string | string[]
  headers?: Record<string, string>
}

const fromAddress = () => process.env.RESEND_FROM_EMAIL || 'SportPool <notifications@sportpool.io>'

/** One row per address the email went to. A user id belongs to an email with one address only. */
function emailDeliveries(
  addresses: string[],
  as: RecordedAs & { outboxId?: number | null },
  outcome: { ok: true; id: string | null } | { ok: false; error: string },
): Delivery[] {
  return addresses.map((address) => ({
    kind: as.kind ?? null,
    channel: 'email',
    provider: 'resend',
    status: outcome.ok ? 'sent' : 'failed',
    userId: addresses.length === 1 ? (as.userId ?? null) : null,
    address,
    poolId: as.poolId ?? null,
    outboxId: as.outboxId ?? null,
    providerId: outcome.ok ? outcome.id : null,
    error: outcome.ok ? null : outcome.error,
  }))
}

export async function sendEmail({ to, subject, html, text, topicId, tags, reply_to, headers, kind, userId, poolId }: SendEmailParams) {
  const resend = getResendClient()
  const addresses = Array.isArray(to) ? to : [to]
  const as = { kind, userId, poolId }

  const payload = {
    from: fromAddress(),
    to: addresses,
    subject,
    html,
    text: text || subject,
    ...(topicId ? { topicId } : {}),
    ...(tags ? { tags } : {}),
    ...(reply_to ? { reply_to: Array.isArray(reply_to) ? reply_to : [reply_to] } : {}),
    ...(headers ? { headers } : {}),
  }

  const sent = async (id: string | undefined) => {
    await recordDeliveries(emailDeliveries(addresses, as, { ok: true, id: id ?? null }))
    return { success: true as const, id }
  }
  const failed = async (error: unknown) => {
    await recordDeliveries(emailDeliveries(addresses, as, { ok: false, error: describeError(error) }))
    return { success: false as const, error }
  }

  try {
    const { data, error } = await resend.emails.send(payload)

    if (error) {
      console.error('[Email] Failed to send, retrying once:', error)
      // Retry once
      const retry = await resend.emails.send(payload)
      if (retry.error) {
        console.error('[Email] Retry also failed:', retry.error)
        return failed(retry.error)
      }
      return sent(retry.data?.id)
    }

    return sent(data?.id)
  } catch (err) {
    console.error('[Email] Exception, retrying once:', err)
    try {
      const retry = await resend.emails.send(payload)
      if (retry.error) return failed(retry.error)
      return sent(retry.data?.id)
    } catch (retryErr) {
      console.error('[Email] Retry exception:', retryErr)
      return failed(retryErr)
    }
  }
}

export async function sendBatchEmails(
  emails: Array<RecordedAs & {
    to: string
    subject: string
    html: string
    text?: string
    topicId?: string
    tags?: { name: string; value: string }[]
  }>
) {
  const resend = getResendClient()

  try {
    const { data, error } = await resend.batch.send(
      emails.map((email) => ({
        from: fromAddress(),
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
      // Fallback: send individually — each one records itself
      let sentCount = 0
      for (const email of emails) {
        const result = await sendEmail(email)
        if (result.success) sentCount++
      }
      return sentCount > 0
        ? { success: true, data: { sentCount, total: emails.length } }
        : { success: false, error }
    }

    // Resend answers a batch with one id per email, in the order sent.
    const ids = data?.data ?? []
    await recordDeliveries(
      emails.flatMap((email, i) => emailDeliveries([email.to], email, { ok: true, id: ids[i]?.id ?? null })),
    )
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

/**
 * One email under an idempotency key — the outbox's sender. No retry of its own: the outbox
 * retries, with backoff, and the key makes a retry of a send that DID go out a no-op at Resend.
 *
 * `replay` means the key was already spent on a different payload: the email went on an earlier
 * attempt (and was recorded then), and its content has changed since. Counted as sent, not
 * recorded again.
 */
export async function sendKeyedEmail(
  email: RecordedAs & {
    to: string
    subject: string
    html: string
    text?: string
    topicId?: string
    tags?: { name: string; value: string }[]
    outboxId?: number | null
  },
  idempotencyKey: string,
): Promise<{ ok: true; replay: boolean } | { ok: false; error: string }> {
  const as = { kind: email.kind, userId: email.userId, poolId: email.poolId, outboxId: email.outboxId }
  try {
    const { data, error } = await getResendClient().emails.send(
      {
        from: fromAddress(),
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text || email.subject,
        ...(email.topicId ? { topicId: email.topicId } : {}),
        ...(email.tags ? { tags: email.tags } : {}),
      },
      { idempotencyKey },
    )
    if (!error) {
      await recordDeliveries(emailDeliveries([email.to], as, { ok: true, id: data?.id ?? null }))
      return { ok: true, replay: false }
    }
    if (error.name === 'invalid_idempotent_request') return { ok: true, replay: true }
    const why = `${error.name}: ${error.message}`
    await recordDeliveries(emailDeliveries([email.to], as, { ok: false, error: why }))
    return { ok: false, error: why }
  } catch (err) {
    const why = describeError(err)
    await recordDeliveries(emailDeliveries([email.to], as, { ok: false, error: why }))
    return { ok: false, error: why }
  }
}
