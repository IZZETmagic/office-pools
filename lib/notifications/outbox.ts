// =============================================================
// The notification outbox — queue, then send (N3, 2026-10-05)
// =============================================================
// public.notification_outbox (migration 172) holds one row per person per
// notification. This file puts rows in (`enqueue`) and takes them out
// (`dispatch`): claim → compose → gate → send → settle.
//
// ## Why every row is retried safely
//
// Each channel's outcome is recorded on the row, so a retry only re-attempts
// a channel that has not finished. An email carries a Resend idempotency key
// built from the row and the email's own key, so even a send that succeeded
// but was never recorded is not sent again — Resend answers the repeat with
// the original response. A push has no such key; its only duplicate window is
// a send that succeeded and then failed to record, which is one statement.
//
// ## Composed at SEND time
//
// A row carries the inputs, not the message. The composer for its kind reads
// the world when the row goes out — so a lock reminder is not sent to somebody
// who has picked since it was queued (Decision 16: true AND timely). Expiry is
// the database's job: the claim never hands out a row past its expires_at.
//
// ## The switches
//
// Every row is checked against the member's switch for its kind's category —
// email from notification_preferences, push from push_notification_preferences
// — unless the registry marks the kind transactional. A skipped channel is
// recorded with its reason, never silently dropped.
//
// ## Shadow rows
//
// A shadow row goes through every step except the send. Its channel outcomes
// read 'shadow:would_send' or 'shadow:<reason>' — how a new path runs beside
// an old one until the two agree.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendKeyedEmail } from '@/lib/email/send'
import { sendPushToUser } from '@/lib/push/apns'
import { PUSH_CATEGORY_COLUMNS } from '@/lib/push/categories'
import type { NotificationCategory, NotificationTypeKey } from './registry'

export type Channel = 'email' | 'push'
const CHANNELS: readonly Channel[] = ['email', 'push']

export type OutboxRow = {
  outbox_id: number
  type_key: string
  user_id: string | null
  to_email: string | null
  pool_id: string | null
  dedup_key: string
  payload: Record<string, unknown>
  channels: string[]
  event_at: string
  deadline_at: string | null
  expires_at: string | null
  shadow: boolean
  email_status: string | null
  push_status: string | null
  attempts: number
}

/** One email a composer wants sent. `key` names it within its row, so its idempotency key survives a retry. */
export type ComposedEmail = { key: string; subject: string; html: string; tags?: Array<{ name: string; value: string }> }
export type ComposedPush = { title: string; body: string; data?: Record<string, string> }
/** A composer either declines with a reason (a-z and underscores) or says what to send. */
export type Composed = { skip: string } | { emails: ComposedEmail[]; push: ComposedPush | null }
export type Composer = (admin: SupabaseClient, rows: OutboxRow[]) => Promise<Map<number, Composed>>

// =============================================================
// Enqueue
// =============================================================

export type NoticeInsert = {
  type: NotificationTypeKey
  /** A member — or, for a transactional kind only, `toEmail`. */
  userId?: string
  toEmail?: string
  poolId?: string | null
  /** Unique per person per notification. A second insert with the same key is ignored. */
  dedupKey: string
  payload?: Record<string, unknown>
  /** Narrow the registry's channels for this row. Never widens them — the database refuses. */
  channels?: Channel[]
  eventAt?: string
  /** Required for a kind that expires at its deadline — the database refuses without it. */
  deadlineAt?: string | null
  shadow?: boolean
}

/** Queue notices. Returns the ids of the rows actually inserted — duplicates of queued ones are skipped. */
export async function enqueue(admin: SupabaseClient, notices: NoticeInsert[]): Promise<number[]> {
  if (notices.length === 0) return []
  const rows = notices.map((n) => ({
    type_key: n.type,
    user_id: n.userId ?? null,
    to_email: n.toEmail ?? null,
    pool_id: n.poolId ?? null,
    dedup_key: n.shadow ? `shadow:${n.dedupKey}` : n.dedupKey,
    payload: n.payload ?? {},
    channels: n.channels ?? [],
    ...(n.eventAt ? { event_at: n.eventAt } : {}),
    deadline_at: n.deadlineAt ?? null,
    shadow: n.shadow ?? false,
  }))
  const { data, error } = await admin
    .from('notification_outbox')
    .upsert(rows, { onConflict: 'dedup_key', ignoreDuplicates: true })
    .select('outbox_id')
  if (error) throw new Error(`notification_outbox enqueue failed: ${error.message}`)
  return ((data ?? []) as Array<{ outbox_id: number }>).map((r) => r.outbox_id)
}

// =============================================================
// Settle — what a row's outcome is after an attempt. Pure.
// =============================================================

export const MAX_ATTEMPTS = 5

/** Wait before retry n: 1, 2, 4, 8 … minutes, never more than an hour. */
export function backoffMs(attempts: number): number {
  return Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60_000
}

export const isFinished = (status: string | null) =>
  status !== null && (status === 'sent' || status.startsWith('skipped:') || status.startsWith('shadow:'))

export type Settlement = {
  email_status: string | null
  push_status: string | null
  processed_at: string | null
  outcome: 'sent' | 'skipped' | 'failed' | 'shadow' | null
  next_attempt_at?: string
  claimed_at: null
  last_error: string | null
}

export function settle(
  row: Pick<OutboxRow, 'channels' | 'shadow' | 'attempts' | 'email_status' | 'push_status'>,
  results: Partial<Record<Channel, string>>,
  now: Date,
  error: string | null,
): Settlement {
  const status: Record<Channel, string | null> = {
    email: results.email ?? row.email_status,
    push: results.push ?? row.push_status,
  }
  const wanted = CHANNELS.filter((c) => row.channels.includes(c))
  const base = { email_status: status.email, push_status: status.push, claimed_at: null, last_error: error } as const

  if (wanted.every((c) => isFinished(status[c]))) {
    const outcome = row.shadow ? 'shadow' : wanted.some((c) => status[c] === 'sent') ? 'sent' : 'skipped'
    return { ...base, processed_at: now.toISOString(), outcome }
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ...base, processed_at: now.toISOString(), outcome: 'failed', last_error: error ?? 'gave up after retries' }
  }
  return {
    ...base,
    processed_at: null,
    outcome: null,
    next_attempt_at: new Date(now.getTime() + backoffMs(row.attempts)).toISOString(),
  }
}

// =============================================================
// Gate — what each channel should do for one row, before anything is sent. Pure.
// =============================================================

export type Recipient = {
  address: string | null
  emailOptedOut: boolean
  pushOptedOut: boolean
  hasDevice: boolean
}

/** What we know about one member, read once per run and applied to each of their rows. */
export type Person = {
  address: string | null
  /** Categories switched OFF, per channel. */
  emailOff: ReadonlySet<string>
  pushOff: ReadonlySet<string>
  hasDevice: boolean
}

/** One row's recipient, as the gate sees it: the person, through the lens of this row's category. */
export function recipientFor(
  row: Pick<OutboxRow, 'user_id' | 'to_email'>,
  person: Person | undefined,
  category: string,
): Recipient {
  // An address-only row (transactional kinds) has no member behind it: no
  // switches to read and no device to push to.
  if (!row.user_id) return { address: row.to_email, emailOptedOut: false, pushOptedOut: false, hasDevice: false }
  return {
    address: person?.address ?? null,
    emailOptedOut: person?.emailOff.has(category) ?? false,
    pushOptedOut: person?.pushOff.has(category) ?? false,
    hasDevice: person?.hasDevice ?? false,
  }
}

/** 'send', or the finished status the channel takes without sending. Channels already finished are left out. */
export function decide(
  row: Pick<OutboxRow, 'channels' | 'shadow' | 'email_status' | 'push_status' | 'user_id'>,
  composed: Composed,
  recipient: Recipient,
  transactional: boolean,
): Partial<Record<Channel, 'send' | string>> {
  const out: Partial<Record<Channel, 'send' | string>> = {}
  const current: Record<Channel, string | null> = { email: row.email_status, push: row.push_status }
  for (const channel of CHANNELS) {
    if (!row.channels.includes(channel) || isFinished(current[channel])) continue
    let verdict: string
    if ('skip' in composed) verdict = `skipped:${composed.skip}`
    else if (channel === 'email') {
      verdict =
        composed.emails.length === 0 ? 'skipped:nothing_to_send'
        : !transactional && recipient.emailOptedOut ? 'skipped:opted_out'
        : !recipient.address ? 'skipped:no_address'
        : 'send'
    } else {
      verdict =
        !composed.push ? 'skipped:nothing_to_send'
        : !row.user_id || !recipient.hasDevice ? 'skipped:no_device'
        : !transactional && recipient.pushOptedOut ? 'skipped:opted_out'
        : 'send'
    }
    if (row.shadow) verdict = verdict === 'send' ? 'shadow:would_send' : `shadow:${verdict.slice('skipped:'.length)}`
    out[channel] = verdict
  }
  return out
}

// =============================================================
// Dispatch — claim, compose, gate, send, settle
// =============================================================

export type DispatchSummary = { claimed: number; sent: number; skipped: number; failed: number; retrying: number; shadow: number }

type RegistryFacts = { category: NotificationCategory; is_transactional: boolean }

/** Everything dispatch touches outside itself — swapped out by the tests. */
export type DispatchDeps = {
  claim: (limit: number, ids: number[] | null) => Promise<OutboxRow[]>
  registry: (types: string[]) => Promise<Map<string, RegistryFacts>>
  people: (userIds: string[]) => Promise<Map<string, Person>>
  sendEmail: (args: {
    to: string
    email: ComposedEmail
    idempotencyKey: string
    typeKey: string
    /** For the delivery record (migration 176). */
    recordAs: { userId: string | null; poolId: string | null; outboxId: number }
  }) => Promise<{ ok: boolean; error?: string }>
  sendPush: (
    userId: string,
    push: ComposedPush,
    kind: NotificationTypeKey,
    context: { outboxId: number; poolId: string | null },
  ) => Promise<{ sent: number; total: number }>
  record: (outboxId: number, settlement: Settlement) => Promise<void>
  pause: (ms: number) => Promise<void>
  now: () => Date
}

/** Resend allows two requests a second; pace sends inside one run to stay under it. */
const EMAIL_SPACING_MS = 550

export async function dispatch(
  admin: SupabaseClient,
  composers: Partial<Record<string, Composer>>,
  opts: { ids?: number[]; limit?: number } = {},
  deps: DispatchDeps = defaultDeps(admin),
): Promise<DispatchSummary> {
  const summary: DispatchSummary = { claimed: 0, sent: 0, skipped: 0, failed: 0, retrying: 0, shadow: 0 }
  const rows = await deps.claim(opts.limit ?? 25, opts.ids ?? null)
  summary.claimed = rows.length
  if (rows.length === 0) return summary

  const [facts, people] = await Promise.all([
    deps.registry([...new Set(rows.map((r) => r.type_key))]),
    deps.people([...new Set(rows.map((r) => r.user_id).filter((u): u is string => u !== null))]),
  ])

  const tally = (s: Settlement) => {
    if (s.outcome === 'sent') summary.sent++
    else if (s.outcome === 'skipped') summary.skipped++
    else if (s.outcome === 'failed') summary.failed++
    else if (s.outcome === 'shadow') summary.shadow++
    else summary.retrying++
  }

  let emailed = false
  for (const [typeKey, group] of groupBy(rows, (r) => r.type_key)) {
    const composer = composers[typeKey]
    const fact = facts.get(typeKey)
    if (!composer || !fact) {
      // A programming error, not a transient one: no amount of retrying writes
      // the missing composer. Recorded as failed at once, never silently held.
      const why = !composer ? `no composer for ${typeKey}` : `${typeKey} is not in the registry`
      for (const row of group) {
        const s: Settlement = {
          email_status: row.email_status,
          push_status: row.push_status,
          processed_at: deps.now().toISOString(),
          outcome: 'failed',
          claimed_at: null,
          last_error: why,
        }
        await deps.record(row.outbox_id, s)
        tally(s)
      }
      continue
    }

    let composed: Map<number, Composed>
    try {
      composed = await composer(admin, group)
    } catch (err) {
      const why = `compose failed: ${err instanceof Error ? err.message : String(err)}`
      for (const row of group) {
        const s = settle(row, {}, deps.now(), why)
        await deps.record(row.outbox_id, s)
        tally(s)
      }
      continue
    }

    for (const row of group) {
      const c = composed.get(row.outbox_id) ?? { skip: 'not_composed' }
      const recipient = recipientFor(row, row.user_id ? people.get(row.user_id) : undefined, fact.category)
      const verdicts = decide(row, c, recipient, fact.is_transactional)
      const results: Partial<Record<Channel, string>> = {}
      const errors: string[] = []

      for (const [channel, verdict] of Object.entries(verdicts) as Array<[Channel, string]>) {
        if (verdict !== 'send') {
          results[channel] = verdict
          continue
        }
        if (channel === 'email' && 'emails' in c) {
          let allOk = true
          for (const email of c.emails) {
            if (emailed) await deps.pause(EMAIL_SPACING_MS)
            emailed = true
            const res = await deps.sendEmail({
              to: recipient.address as string,
              email,
              // The topic comes from the kind, in the transport (lib/email/send.ts) — not from here.
              idempotencyKey: `outbox/${row.outbox_id}/${email.key}`,
              typeKey,
              recordAs: { userId: row.user_id, poolId: row.pool_id, outboxId: row.outbox_id },
            })
            if (!res.ok) {
              allOk = false
              errors.push(`email ${email.key}: ${res.error ?? 'failed'}`)
            }
          }
          results.email = allOk ? 'sent' : 'failed'
        } else if (channel === 'push' && 'push' in c && c.push && row.user_id) {
          try {
            // The kind, not its switch: the transport looks the switch up itself, so
            // no sender anywhere can push without one (N4).
            const res = await deps.sendPush(row.user_id, c.push, typeKey as NotificationTypeKey, {
              outboxId: row.outbox_id,
              poolId: row.pool_id,
            })
            results.push = res.sent > 0 ? 'sent' : res.total === 0 ? 'skipped:no_device' : 'failed'
            if (results.push === 'failed') errors.push(`push: 0 of ${res.total} devices accepted it`)
          } catch (err) {
            results.push = 'failed'
            errors.push(`push: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
      }

      const s = settle(row, results, deps.now(), errors.length > 0 ? errors.join('; ') : null)
      await deps.record(row.outbox_id, s)
      tally(s)
    }
  }
  return summary
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = out.get(k)
    if (list) list.push(item)
    else out.set(k, [item])
  }
  return out
}

// =============================================================
// The real dependencies
// =============================================================

function defaultDeps(admin: SupabaseClient): DispatchDeps {
  return {
    async claim(limit, ids) {
      const { data, error } = await admin.rpc('notification_outbox_claim', { p_limit: limit, p_ids: ids })
      if (error) throw new Error(`notification_outbox claim failed: ${error.message}`)
      return (data ?? []) as OutboxRow[]
    },

    async registry(types) {
      const { data, error } = await admin
        .from('notification_types')
        .select('type_key, category, is_transactional')
        .in('type_key', types)
      if (error) throw new Error(`registry read failed: ${error.message}`)
      return new Map(
        ((data ?? []) as Array<{ type_key: string; category: NotificationCategory; is_transactional: boolean }>).map((r) => [
          r.type_key,
          { category: r.category, is_transactional: r.is_transactional },
        ]),
      )
    },

    async people(userIds) {
      const out = new Map<string, Person>()
      if (userIds.length === 0) return out
      const [users, emailOff, pushPrefs, devices] = await Promise.all([
        admin.from('users').select('user_id, email').in('user_id', userIds),
        admin.from('notification_preferences').select('user_id, category')
          .in('user_id', userIds).eq('channel', 'email').eq('enabled', false),
        admin.from('push_notification_preferences').select('*').in('user_id', userIds),
        admin.from('push_tokens').select('user_id').in('user_id', userIds),
      ])
      // ⚠ A failed read is an error, never a default. "No opt-outs found"
      // read off a failed query would message somebody who said no.
      for (const r of [users, emailOff, pushPrefs, devices]) {
        if (r.error) throw new Error(`recipient read failed: ${r.error.message}`)
      }
      const emailOffBy = new Map<string, Set<string>>()
      for (const r of (emailOff.data ?? []) as Array<{ user_id: string; category: string }>) {
        emailOffBy.set(r.user_id, (emailOffBy.get(r.user_id) ?? new Set()).add(r.category))
      }
      // push_notification_preferences is one boolean column per category; a
      // missing row, or a column that is not false, means on.
      const pushOffBy = new Map<string, Set<string>>()
      for (const r of (pushPrefs.data ?? []) as Array<Record<string, unknown> & { user_id: string }>) {
        const off = new Set<string>()
        for (const [category, column] of Object.entries(PUSH_CATEGORY_COLUMNS)) if (r[column] === false) off.add(category)
        pushOffBy.set(r.user_id, off)
      }
      const withDevice = new Set(((devices.data ?? []) as Array<{ user_id: string }>).map((d) => d.user_id))
      for (const u of (users.data ?? []) as Array<{ user_id: string; email: string | null }>) {
        out.set(u.user_id, {
          address: u.email,
          emailOff: emailOffBy.get(u.user_id) ?? new Set(),
          pushOff: pushOffBy.get(u.user_id) ?? new Set(),
          hasDevice: withDevice.has(u.user_id),
        })
      }
      return out
    },

    async sendEmail({ to, email, idempotencyKey, typeKey, recordAs }) {
      // lib/email/send.ts records the delivery; a replay (the key already spent on an earlier,
      // different payload) means it went then — sent, and recorded then.
      const res = await sendKeyedEmail(
        {
          to,
          subject: email.subject,
          html: email.html,
          tags: [...(email.tags ?? []), { name: 'type', value: typeKey }],
          kind: typeKey as NotificationTypeKey,
          ...recordAs,
        },
        idempotencyKey,
      )
      return res.ok ? { ok: true } : { ok: false, error: res.error }
    },

    sendPush: (userId, push, kind, context) => sendPushToUser(userId, push, kind, context),

    async record(outboxId, settlement) {
      const { error } = await admin.from('notification_outbox').update(settlement).eq('outbox_id', outboxId)
      if (error) console.error(`[outbox] could not record row ${outboxId}:`, error.message)
    },

    pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => new Date(),
  }
}
