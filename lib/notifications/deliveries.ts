// =============================================================
// The delivery record (N4, 2026-10-07)
// =============================================================
// public.notification_deliveries (migration 176): one row per message handed to
// a provider — each device a push went to, each address an email went to —
// with the provider's own id for it and whether the provider took it.
//
// Written by the transports and nothing else (lib/push/apns.ts,
// lib/email/send.ts), so every send is recorded whichever path it took.
//
// ⚠ BEST EFFORT, BY DESIGN. By the time this runs the message has gone. A
// failed write is logged and swallowed: throwing would fail the send, the
// caller would retry it, and the member would get it twice.
//
// ⚠ ADDRESSES. An address is kept only when the sender knew no user (an
// invitation to an address). With a user, the user_id is enough — and goes to
// null on its own when the account is deleted.
// =============================================================

import { createAdminClient } from '@/lib/supabase/server'
import type { NotificationTypeKey } from './registry'

export type DeliveryProvider = 'resend' | 'apns' | 'expo'

export type Delivery = {
  /** The registry kind. Null only for an email whose sender names no kind yet (N4 step 4). */
  kind: NotificationTypeKey | null
  channel: 'email' | 'push'
  provider: DeliveryProvider
  status: 'sent' | 'failed'
  userId?: string | null
  address?: string | null
  poolId?: string | null
  outboxId?: number | null
  pushTokenId?: string | null
  providerId?: string | null
  error?: string | null
}

/** Where a send came from, for its record — carried by the outbox, and by any sender that knows. */
export type DeliveryContext = { outboxId?: number | null; poolId?: string | null }

const MAX_ERROR = 500

export function toRow(d: Delivery) {
  const userId = d.userId ?? null
  return {
    type_key: d.kind,
    channel: d.channel,
    provider: d.provider,
    status: d.status,
    user_id: userId,
    // Lower-cased, so the account-delete route can find it again by the account's email.
    address: userId === null && d.channel === 'email' && d.address ? d.address.trim().toLowerCase() : null,
    pool_id: d.poolId ?? null,
    outbox_id: d.outboxId ?? null,
    push_token_id: d.channel === 'push' ? (d.pushTokenId ?? null) : null,
    provider_id: d.providerId ?? null,
    error: d.error ? d.error.slice(0, MAX_ERROR) : null,
  }
}

/** Record what was just handed to a provider. Never throws — see the header. */
export async function recordDeliveries(deliveries: Delivery[]): Promise<void> {
  if (deliveries.length === 0) return
  try {
    const { error } = await createAdminClient().from('notification_deliveries').insert(deliveries.map(toRow))
    if (error) console.error(`[deliveries] could not record ${deliveries.length}:`, error.message)
  } catch (err) {
    console.error(`[deliveries] could not record ${deliveries.length}:`, err instanceof Error ? err.message : err)
  }
}

/** A provider's error, as one line for the record. */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const e = err as { name?: unknown; message?: unknown }
    const parts = [e.name, e.message].filter((p): p is string => typeof p === 'string' && p.length > 0)
    if (parts.length > 0) return parts.join(': ')
  }
  return String(err)
}
