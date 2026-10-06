// =============================================================
// Chat notices — built from the MESSAGE, never from a request (N3, 2026-10-06)
// =============================================================
//   chat_message  every pool member but the sender: a push
//   chat_mention  each member the message mentions: an email and a push
//
// ⚠ Until today /api/notifications/message pushed whatever text it was sent, under whatever
// sender name it was sent, to the caller's pool — so a member could put words in anyone's mouth
// on everyone's lock screen. And /api/notifications/mention emailed whatever text it was sent to
// whatever user ids it was given, members of the pool or not — so anyone who could see a public
// pool could email anybody on the site, from SportPool's address.
//
// Now both take only the pool. They find the caller's OWN messages in it from the last two
// minutes, and queue notices from the stored rows: the text, the sender and the mentions are the
// message's, and a mention reaches only somebody actually in the pool. Nobody hears from somebody
// they blocked (158). Keyed per message and person, so a repeat queues nothing. Composed at send
// time: a message deleted since is not announced.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { mentionNotificationTemplate } from '@/lib/email/templates'
import { enqueue, type Composed, type OutboxRow } from '@/lib/notifications/outbox'
import { withoutBlockersOf } from './blocks'

const RECENT_MS = 2 * 60 * 1000
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'

type Message = { message_id: string; pool_id: string; user_id: string; content: string; mentions: string[] | null }

/** The caller's own messages in this pool from the last two minutes — the only ones a call may announce. */
async function recentMessagesBy(admin: SupabaseClient, poolId: string, userId: string, now: number): Promise<Message[]> {
  const { data, error } = await admin
    .from('pool_messages')
    .select('message_id, pool_id, user_id, content, mentions')
    .eq('pool_id', poolId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .gte('created_at', new Date(now - RECENT_MS).toISOString())
  if (error) throw new Error(`pool_messages: ${error.message}`)
  return (data ?? []) as Message[]
}

async function poolMembers(admin: SupabaseClient, poolId: string): Promise<Set<string>> {
  const { data, error } = await admin.from('pool_members').select('user_id').eq('pool_id', poolId)
  if (error) throw new Error(`pool_members: ${error.message}`)
  return new Set(((data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id))
}

/** Queue the chat push for every member but the sender, for each of the caller's recent messages. */
export async function queueChatMessages(admin: SupabaseClient, poolId: string, senderId: string, now = Date.now()): Promise<number[]> {
  const messages = await recentMessagesBy(admin, poolId, senderId, now)
  if (messages.length === 0) return []
  const members = [...(await poolMembers(admin, poolId))].filter((u) => u !== senderId)
  const recipients = await withoutBlockersOf(admin, senderId, members)
  return enqueue(admin, messages.flatMap((m) => recipients.map((userId) => ({
    type: 'chat_message' as const,
    userId,
    poolId,
    dedupKey: `chat_message:${m.message_id}:${userId}`,
    payload: { messageId: m.message_id },
  }))))
}

/** Queue a mention for each member a recent message of the caller's actually mentions. */
export async function queueChatMentions(admin: SupabaseClient, poolId: string, senderId: string, now = Date.now()): Promise<number[]> {
  const messages = (await recentMessagesBy(admin, poolId, senderId, now)).filter((m) => (m.mentions ?? []).length > 0)
  if (messages.length === 0) return []
  const members = await poolMembers(admin, poolId)
  const notices = []
  for (const m of messages) {
    // Only people actually in the pool, never the sender, never someone who blocked them.
    const mentioned = [...new Set(m.mentions ?? [])].filter((u) => u !== senderId && members.has(u))
    for (const userId of await withoutBlockersOf(admin, senderId, mentioned)) {
      notices.push({
        type: 'chat_mention' as const,
        userId,
        poolId,
        dedupKey: `chat_mention:${m.message_id}:${userId}`,
        payload: { messageId: m.message_id },
      })
    }
  }
  return enqueue(admin, notices)
}

/** The messages, their senders and recipients, and the pools — one read each. */
async function facts(admin: SupabaseClient, rows: OutboxRow[]) {
  const ids = [...new Set(rows.map((r) => (typeof r.payload.messageId === 'string' ? r.payload.messageId : null)).filter((x): x is string => !!x))]
  const { data: messages, error } = await admin
    .from('pool_messages')
    .select('message_id, pool_id, user_id, content, deleted_at')
    .in('message_id', ids)
  if (error) throw new Error(`pool_messages: ${error.message}`)
  const byId = new Map(((messages ?? []) as Array<Message & { deleted_at: string | null }>).map((m) => [m.message_id, m]))
  const userIds = [...new Set([...rows.map((r) => r.user_id), ...[...byId.values()].map((m) => m.user_id)].filter((u): u is string => !!u))]
  const poolIds = [...new Set(rows.map((r) => r.pool_id).filter((p): p is string => !!p))]
  const [users, pools] = await Promise.all([
    admin.from('users').select('user_id, full_name, username').in('user_id', userIds),
    admin.from('pools').select('pool_id, pool_name').in('pool_id', poolIds),
  ])
  for (const r of [users, pools]) if (r.error) throw new Error(r.error.message)
  return {
    byId,
    names: new Map(((users.data ?? []) as Array<{ user_id: string; full_name: string | null; username: string | null }>)
      .map((u) => [u.user_id, u.full_name || u.username || null])),
    poolName: new Map(((pools.data ?? []) as Array<{ pool_id: string; pool_name: string }>).map((p) => [p.pool_id, p.pool_name])),
  }
}

function composer(kind: 'message' | 'mention') {
  return async (admin: SupabaseClient, rows: OutboxRow[]): Promise<Map<number, Composed>> => {
    const f = await facts(admin, rows)
    const out = new Map<number, Composed>()
    for (const row of rows) {
      const m = f.byId.get(typeof row.payload.messageId === 'string' ? row.payload.messageId : '')
      const poolName = row.pool_id ? f.poolName.get(row.pool_id) : undefined
      if (!m || !poolName || !row.user_id) { out.set(row.outbox_id, { skip: 'not_found' }); continue }
      if (m.deleted_at) { out.set(row.outbox_id, { skip: 'no_longer_true' }); continue }
      const sender = f.names.get(m.user_id) || 'Someone'
      if (kind === 'message') {
        const preview = m.content.length > 80 ? m.content.slice(0, 77) + '...' : m.content
        out.set(row.outbox_id, {
          emails: [],
          push: { title: `${sender} in ${poolName}`, body: preview, data: { type: 'community', pool_id: m.pool_id } },
        })
      } else {
        const { subject, html } = mentionNotificationTemplate({
          recipientName: f.names.get(row.user_id) || 'there',
          mentionerName: sender,
          poolName,
          messageContent: m.content,
          poolUrl: `${appUrl()}/pools/${m.pool_id}`,
        })
        out.set(row.outbox_id, {
          emails: [{ key: 'mention', subject, html, tags: [{ name: 'category', value: 'community' }] }],
          push: { title: `${sender} mentioned you`, body: `in ${poolName}: "${m.content.slice(0, 100)}"`, data: { type: 'community', pool_id: m.pool_id } },
        })
      }
    }
    return out
  }
}

export const composeChatMessage = composer('message')
export const composeChatMention = composer('mention')
