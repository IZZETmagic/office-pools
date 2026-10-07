import { createAdminClient } from '@/lib/supabase/server'
import { recordDeliveries, describeError, type Delivery } from '@/lib/notifications/deliveries'
import { NOTIFICATION_TYPES, type NotificationCategory, type NotificationTypeKey } from '@/lib/notifications/registry'
import { getResendClient } from './resend'
import { TOPICS, TOPIC_KEYS, type TopicKey } from './topics'

// =============================================================
// The email transport — every email we send goes through here
// =============================================================
// N4 (2026-10-07). Every email to a member names its KIND from the
// notification registry, as every push does (lib/push/apns.ts):
//
//   * the Resend topic comes from the kind's switch — never from the caller,
//     who until now could (and did) pick the wrong one;
//   * a member's switch is checked here, in our own database, when the sender
//     says who the email is for (`userId`) — Resend's topic is the second lock;
//   * an always-delivered kind (direct_email, crew_invite_email) skips both;
//   * a kind that is not live is refused.
//
// Mail to our own inbox — the contact form, chat reports — goes through
// sendInternalEmail, which can only address SportPool.
//
// Every send is recorded in the delivery record (migration 176): one row per
// address, with Resend's id for it. A member skipped because their switch is
// off is not a send, and is not recorded.
// =============================================================

/** What an email is, and who it is for. */
type MemberEmail = {
  kind: NotificationTypeKey
  /** Who it is for, when they have an account: their switch is checked, and the record keeps this, not the address. */
  userId?: string | null
  poolId?: string | null
}

type SendEmailParams = MemberEmail & {
  to: string | string[]
  subject: string
  html: string
  text?: string
  tags?: { name: string; value: string }[]
  reply_to?: string | string[]
  headers?: Record<string, string>
}

type BatchEmail = MemberEmail & {
  to: string
  subject: string
  html: string
  text?: string
  tags?: { name: string; value: string }[]
}

/** Resend's limit per batch call. */
const BATCH_LIMIT = 100

const fromAddress = () => process.env.RESEND_FROM_EMAIL || 'SportPool <notifications@sportpool.io>'

/** The kind's rules for email: its switch, whether one applies, and the Resend topic that enforces it there too. */
export function emailRules(kind: NotificationTypeKey): { category: NotificationCategory; transactional: boolean; topicId: string | undefined } {
  const spec = NOTIFICATION_TYPES[kind]
  if (!spec) throw new Error(`email: ${String(kind)} is not in the notification registry`)
  if (spec.status !== 'live') throw new Error(`email: ${kind} is ${spec.status}, not live`)
  if (spec.category === 'GAMIFICATION') throw new Error(`email: ${kind} is an Achievements notice, which is never emailed`)
  const transactional = 'transactional' in spec && spec.transactional === true
  const topicId = transactional || !(TOPIC_KEYS as readonly string[]).includes(spec.category)
    ? undefined
    : TOPICS[spec.category as TopicKey] || undefined
  return { category: spec.category, transactional, topicId }
}

/**
 * The members, of those given, whose switch for `category` is off. ⚠ A failed read throws —
 * "nobody opted out", read off a failed query, would email people who said no.
 */
async function switchedOff(userIds: string[], category: NotificationCategory): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const { data, error } = await createAdminClient()
    .from('notification_preferences')
    .select('user_id')
    .in('user_id', userIds)
    .eq('category', category)
    .eq('channel', 'email')
    .eq('enabled', false)
  if (error) throw new Error(`email: preference read failed: ${error.message}`)
  return new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id))
}

/** One row per address the email went to. A user id belongs to an email with one address only. */
function emailDeliveries(
  addresses: string[],
  as: { kind: NotificationTypeKey | null; userId?: string | null; poolId?: string | null; outboxId?: number | null },
  outcome: { ok: true; id: string | null } | { ok: false; error: string },
): Delivery[] {
  return addresses.map((address) => ({
    kind: as.kind,
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

type SendResult =
  | { success: true; id: string | undefined }
  | { success: false; error: unknown }
  | { success: false; skipped: 'switched_off' }

/** Send one email, retrying once. Its kind decides the topic and the switch — see the header. */
export async function sendEmail(email: SendEmailParams): Promise<SendResult> {
  const rules = emailRules(email.kind)
  const addresses = Array.isArray(email.to) ? email.to : [email.to]
  if (!rules.transactional && email.userId && addresses.length === 1) {
    if ((await switchedOff([email.userId], rules.category)).has(email.userId)) {
      return { success: false, skipped: 'switched_off' }
    }
  }
  return deliverOne(email, addresses, rules.topicId, { kind: email.kind, userId: email.userId, poolId: email.poolId })
}

/**
 * Mail to our own inbox — the contact form, chat reports. It can only address SportPool, or the
 * one alert address we configure ourselves (REPORT_ALERT_EMAIL): a member is never emailed through
 * here. Recorded with no kind and no user.
 */
export async function sendInternalEmail(email: {
  to: string
  subject: string
  html: string
  text?: string
  reply_to?: string | string[]
  tags?: { name: string; value: string }[]
}): Promise<{ success: true; id: string | undefined } | { success: false; error: unknown }> {
  if (!isInternalAddress(email.to)) {
    throw new Error(`sendInternalEmail only writes to SportPool's own addresses, not ${email.to}`)
  }
  const result = await deliverOne(email, [email.to], undefined, { kind: null })
  // deliverOne never skips — skipping is a member's switch, and there is no member here.
  return 'skipped' in result ? { success: false, error: result.skipped } : result
}

/** Ours: anything at sportpool.io, or the alert address configured in the environment — never one a user typed. */
export function isInternalAddress(address: string): boolean {
  const a = address.trim().toLowerCase()
  const alert = process.env.REPORT_ALERT_EMAIL?.trim().toLowerCase()
  return /@sportpool\.io$/.test(a) || (!!alert && a === alert)
}

async function deliverOne(
  email: { subject: string; html: string; text?: string; tags?: { name: string; value: string }[]; reply_to?: string | string[]; headers?: Record<string, string> },
  addresses: string[],
  topicId: string | undefined,
  as: { kind: NotificationTypeKey | null; userId?: string | null; poolId?: string | null },
): Promise<SendResult> {
  const resend = getResendClient()
  const { subject, html, text, tags, reply_to, headers } = email

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

  const sent = async (id: string | undefined): Promise<SendResult> => {
    await recordDeliveries(emailDeliveries(addresses, as, { ok: true, id: id ?? null }))
    return { success: true, id }
  }
  const failed = async (error: unknown): Promise<SendResult> => {
    await recordDeliveries(emailDeliveries(addresses, as, { ok: false, error: describeError(error) }))
    return { success: false, error }
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

/**
 * Many emails, in Resend batches of 100. Each names its kind; members whose switch is off are
 * left out before anything is sent. A batch Resend refuses falls back to single sends.
 */
export async function sendBatchEmails(emails: BatchEmail[]) {
  // Rules first: a kind that is not live throws before anything goes.
  const rules = emails.map((e) => emailRules(e.kind))

  // Who has switched off what: one read per switch the batch touches.
  const byCategory = new Map<NotificationCategory, Set<string>>()
  emails.forEach((e, i) => {
    if (rules[i].transactional || !e.userId) return
    byCategory.set(rules[i].category, (byCategory.get(rules[i].category) ?? new Set()).add(e.userId))
  })
  const off = new Map<NotificationCategory, Set<string>>()
  for (const [category, userIds] of byCategory) off.set(category, await switchedOff([...userIds], category))

  const going = emails
    .map((e, i) => ({ e, topicId: rules[i].topicId, skip: !!e.userId && (off.get(rules[i].category)?.has(e.userId) ?? false) }))
    .filter((x) => !x.skip)
  const skipped = emails.length - going.length

  let sentCount = 0
  let lastError: unknown = null
  for (let start = 0; start < going.length; start += BATCH_LIMIT) {
    const chunk = going.slice(start, start + BATCH_LIMIT)
    const result = await sendChunk(chunk)
    sentCount += result.sent
    if (result.error) lastError = result.error
  }

  return sentCount > 0 || going.length === 0
    ? { success: true as const, data: { sentCount, skipped, total: emails.length } }
    : { success: false as const, error: lastError }
}

async function sendChunk(chunk: Array<{ e: BatchEmail; topicId: string | undefined }>): Promise<{ sent: number; error: unknown }> {
  const resend = getResendClient()
  const fallBack = async (error: unknown) => {
    console.error('[Email] Batch send failed, falling back to individual sends:', error)
    let sent = 0
    for (const { e, topicId } of chunk) {
      // The switch was read for the whole batch above; each single send records itself.
      const result = await deliverOne(e, [e.to], topicId, { kind: e.kind, userId: e.userId, poolId: e.poolId })
      if (result.success) sent++
    }
    return { sent, error: sent > 0 ? null : error }
  }

  try {
    const { data, error } = await resend.batch.send(
      chunk.map(({ e, topicId }) => ({
        from: fromAddress(),
        to: [e.to],
        subject: e.subject,
        html: e.html,
        text: e.text || e.subject,
        ...(topicId ? { topicId } : {}),
        ...(e.tags ? { tags: e.tags } : {}),
      })),
    )
    if (error) return fallBack(error)

    // Resend answers a batch with one id per email, in the order sent.
    const ids = data?.data ?? []
    await recordDeliveries(chunk.flatMap(({ e }, i) => emailDeliveries([e.to], e, { ok: true, id: ids[i]?.id ?? null })))
    return { sent: chunk.length, error: null }
  } catch (err) {
    return fallBack(err)
  }
}

/**
 * One email under an idempotency key — the outbox's sender. No retry of its own: the outbox
 * retries, with backoff, and the key makes a retry of a send that DID go out a no-op at Resend.
 * The outbox has already read the member's switch (decide(), in lib/notifications/outbox.ts),
 * moments before, from the same table, so it is not read again here.
 *
 * `replay` means the key was already spent on a different payload: the email went on an earlier
 * attempt (and was recorded then), and its content has changed since. Counted as sent, not
 * recorded again.
 */
export async function sendKeyedEmail(
  email: MemberEmail & {
    to: string
    subject: string
    html: string
    text?: string
    tags?: { name: string; value: string }[]
    outboxId?: number | null
  },
  idempotencyKey: string,
): Promise<{ ok: true; replay: boolean } | { ok: false; error: string }> {
  const as = { kind: email.kind, userId: email.userId, poolId: email.poolId, outboxId: email.outboxId }
  let topicId: string | undefined
  try {
    topicId = emailRules(email.kind).topicId
  } catch (err) {
    // A kind retired since the row was queued: a failure for the outbox to record, not a throw
    // that would end its whole run and leave the row to be claimed again.
    return { ok: false, error: describeError(err) }
  }
  try {
    const { data, error } = await getResendClient().emails.send(
      {
        from: fromAddress(),
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text || email.subject,
        ...(topicId ? { topicId } : {}),
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
