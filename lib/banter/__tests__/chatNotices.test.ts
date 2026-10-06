// Chat notices (lib/banter/chatNotices.ts), against the in-memory database. Pinned: a notice is
// built from the caller's OWN recent messages — never from text or user ids sent with the request
// — a mention reaches only somebody actually in the pool, nobody hears from somebody they blocked,
// and a message deleted since is not announced.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/notifications/outbox', () => ({
  enqueue: vi.fn(async (_admin: unknown, notices: unknown[]) => notices.map((_, i) => i + 1)),
}))
// u4 has blocked the sender.
vi.mock('../blocks', () => ({
  withoutBlockersOf: vi.fn(async (_admin: unknown, _sender: string, ids: string[]) => ids.filter((id) => id !== 'u4')),
}))

import { enqueue } from '@/lib/notifications/outbox'
import type { OutboxRow } from '@/lib/notifications/outbox'
import { composeChatMention, composeChatMessage, queueChatMentions, queueChatMessages } from '../chatNotices'
import { fakeDb } from '../../crews/__tests__/fakeDb'

const NOW = Date.parse('2026-10-06T12:00:00Z')
const queued = vi.mocked(enqueue)
const ago = (s: number) => new Date(NOW - s * 1000).toISOString()

const world = () => fakeDb({
  pools: [{ pool_id: 'p1', pool_name: 'Bermuda Office' }],
  pool_members: ['u1', 'u2', 'u3', 'u4'].map((user_id) => ({ pool_id: 'p1', user_id })),
  users: [{ user_id: 'u1', full_name: 'Mia Lowe', username: 'mia' }, { user_id: 'u2', full_name: null, username: 'dave' }],
  pool_messages: [
    { message_id: 'm-new', pool_id: 'p1', user_id: 'u1', content: 'Big game tonight @dave', mentions: ['u2', 'stranger', 'u1', 'u4'], created_at: ago(30), deleted_at: null },
    { message_id: 'm-old', pool_id: 'p1', user_id: 'u1', content: 'from last week', mentions: [], created_at: ago(600), deleted_at: null },
    { message_id: 'm-gone', pool_id: 'p1', user_id: 'u1', content: 'deleted', mentions: [], created_at: ago(20), deleted_at: ago(10) },
    { message_id: 'm-theirs', pool_id: 'p1', user_id: 'u2', content: 'not the caller\'s', mentions: ['u3'], created_at: ago(15), deleted_at: null },
  ],
})

const notices = () => queued.mock.calls.flatMap((c) => c[1] as Array<{ userId: string; dedupKey: string }>)

beforeEach(() => {
  queued.mockClear()
})

describe('the chat push', () => {
  it('announces only the caller\'s own messages from the last two minutes, to every member but them', async () => {
    await queueChatMessages(world().client, 'p1', 'u1', NOW)
    expect(notices().map((n) => n.dedupKey)).toEqual(['chat_message:m-new:u2', 'chat_message:m-new:u3'])
  })

  it('never tells somebody who blocked the sender', async () => {
    await queueChatMessages(world().client, 'p1', 'u1', NOW)
    expect(notices().some((n) => n.userId === 'u4')).toBe(false)
  })
})

describe('the mention', () => {
  it('reaches only people actually in the pool — not the sender, not a stranger, not a blocker', async () => {
    await queueChatMentions(world().client, 'p1', 'u1', NOW)
    expect(notices().map((n) => n.dedupKey)).toEqual(['chat_mention:m-new:u2'])
  })
})

const row = (o: Partial<OutboxRow>): OutboxRow => ({
  outbox_id: 1, type_key: 'chat_message', user_id: 'u2', to_email: null, pool_id: 'p1', dedup_key: 'k',
  payload: { messageId: 'm-new' }, channels: ['push'], event_at: new Date(NOW).toISOString(),
  deadline_at: null, expires_at: null, shadow: false, email_status: null, push_status: null, attempts: 1, ...o,
})

describe('composed from the stored message', () => {
  it('names the real sender and quotes the real text', async () => {
    const c = (await composeChatMessage(world().client, [row({})])).get(1)!
    expect('push' in c && c.push).toMatchObject({ title: 'Mia Lowe in Bermuda Office', body: 'Big game tonight @dave' })
  })

  it('does not announce a message deleted since', async () => {
    expect((await composeChatMessage(world().client, [row({ payload: { messageId: 'm-gone' } })])).get(1)).toEqual({ skip: 'no_longer_true' })
  })

  it('emails a mention with who mentioned them', async () => {
    const c = (await composeChatMention(world().client, [row({ type_key: 'chat_mention', channels: ['email', 'push'] })])).get(1)!
    expect('push' in c && c.push?.title).toBe('Mia Lowe mentioned you')
    expect('emails' in c && c.emails[0].subject).toBe('@Mia Lowe mentioned you in Bermuda Office')
  })
})
