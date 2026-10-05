// =============================================================
// Email preferences — read from Postgres (N1, question 5, 2026-10-05)
// =============================================================
// notification_preferences (migration 168) is SPARSE: a missing row means
// enabled. All six Resend topics default to opt_in (verified 2026-10-05), so
// that is the same answer Resend gives for a contact nobody has touched.
//
// Resend is still where email is ENFORCED — every send carries a topicId — so
// the two must never disagree. Two doors keep them equal:
//   * PATCH /api/notifications/preferences writes Resend FIRST, then Postgres;
//   * POST /api/webhooks/resend mirrors `contact.topics.updated`, which is how
//     an unsubscribe from an email's own footer gets home.
// =============================================================

import { TOPICS, TOPIC_KEYS, type TopicKey } from './topics'

export type PreferenceRow = { category: string; channel: string; enabled: boolean }

/** A member's email preferences: every topic on, except what a row turns off. */
export function emailPreferencesFrom(rows: PreferenceRow[]): Record<TopicKey, boolean> {
  const prefs = Object.fromEntries(TOPIC_KEYS.map((k) => [k, true])) as Record<TopicKey, boolean>
  for (const r of rows) {
    if (r.channel !== 'email') continue
    if ((TOPIC_KEYS as readonly string[]).includes(r.category)) prefs[r.category as TopicKey] = r.enabled
  }
  return prefs
}

/** Resend topic id → our category key, from the deployment's environment. */
export function topicIdToKey(topics: Partial<Record<TopicKey, string>> = TOPICS): Map<string, TopicKey> {
  const map = new Map<string, TopicKey>()
  for (const key of TOPIC_KEYS) {
    const id = topics[key]
    if (id) map.set(id, key)
  }
  return map
}

export type TopicChanges = {
  email: string
  /** When Resend recorded the change — so a late, retried event cannot overwrite a newer one. */
  at: string | null
  changes: Array<{ key: TopicKey; enabled: boolean }>
}

/**
 * The changes a VERIFIED `contact.topics.updated` event asks for, or null for
 * any other event.
 *
 * The Resend SDK's event types predate this event, so the payload is checked
 * here rather than trusted. Anything malformed or unknown is dropped, never
 * guessed at: an ignored change costs a stale toggle, a misread one could
 * re-subscribe somebody who left.
 */
export function topicChangesFrom(event: unknown, idToKey: Map<string, TopicKey>): TopicChanges | null {
  if (!event || typeof event !== 'object') return null
  const e = event as { type?: unknown; created_at?: unknown; data?: { email?: unknown; topics?: unknown } }
  if (e.type !== 'contact.topics.updated') return null
  const email = typeof e.data?.email === 'string' ? e.data.email.trim().toLowerCase() : ''
  if (!email || !Array.isArray(e.data?.topics)) return null

  const at = typeof e.created_at === 'string' && !Number.isNaN(Date.parse(e.created_at)) ? e.created_at : null
  const changes: TopicChanges['changes'] = []
  for (const t of e.data.topics as unknown[]) {
    if (!t || typeof t !== 'object') continue
    const { id, subscription } = t as { id?: unknown; subscription?: unknown }
    if (typeof id !== 'string') continue
    const key = idToKey.get(id)
    if (!key) continue
    if (subscription === 'opt_in') changes.push({ key, enabled: true })
    else if (subscription === 'opt_out') changes.push({ key, enabled: false })
  }
  return { email, at, changes }
}

/**
 * Of an event's changes, the ones that are NEWER than what is stored. Svix
 * retries out of order: an older opt_out delivered after a newer opt_in must
 * not win. A change with no timestamp is applied — it cannot be ordered, and
 * dropping it would leave a footer unsubscribe unrecorded.
 */
export function newerThanStored(
  changes: TopicChanges['changes'],
  at: string | null,
  stored: Array<{ category: string; updated_at: string }>,
): TopicChanges['changes'] {
  if (!at) return changes
  const when = new Map(stored.map((s) => [s.category, Date.parse(s.updated_at)]))
  const t = Date.parse(at)
  return changes.filter((c) => {
    const cur = when.get(c.key)
    return cur === undefined || Number.isNaN(cur) || cur <= t
  })
}
