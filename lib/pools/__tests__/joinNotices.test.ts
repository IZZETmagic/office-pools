// The join notices, composed when the outbox sends them (lib/pools/joinNotices.ts). Pinned: the
// words are the ones /api/notifications/pool-joined sent; somebody who already left is not welcomed;
// an admin who handed the pool over is not told; and a failed read is retried, never read as "gone".

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/email/templates', () => ({
  poolJoinedTemplate: (i: { userName: string; poolName: string; poolCode: string; poolUrl: string }) => ({
    subject: `Welcome to ${i.poolName}`,
    html: `<p>${i.userName} ${i.poolCode} ${i.poolUrl}</p>`,
  }),
}))

import { composeMemberJoined, composePoolWelcome } from '../joinNotices'
import type { OutboxRow } from '@/lib/notifications/outbox'

type Seed = { pools?: unknown[]; pool_members?: unknown[]; users?: unknown[]; failOn?: string }

function fakeAdmin(seed: Seed) {
  return {
    from(table: string) {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.in = () => Promise.resolve(
        seed.failOn === table
          ? { data: null, error: { message: `${table} timed out` } }
          : { data: (seed as Record<string, unknown[]>)[table] ?? [], error: null },
      )
      return q
    },
  } as never
}

const POOL = { pool_id: 'p1', pool_name: 'Bermuda Office', pool_code: 'ABC123', admin_user_id: 'boss', archived_at: null }
const USERS = [
  { user_id: 'u1', full_name: 'Mia Lowe', username: 'mia' },
  { user_id: 'boss', full_name: null, username: 'dave' },
]

const row = (o: Partial<OutboxRow>): OutboxRow => ({
  outbox_id: 1, type_key: 'pool_welcome', user_id: 'u1', to_email: null, pool_id: 'p1', dedup_key: 'k',
  payload: { memberId: 'm1' }, channels: ['email', 'push'], event_at: '2026-10-06T12:00:00Z', deadline_at: null,
  expires_at: '2026-10-07T12:00:00Z', shadow: false, email_status: null, push_status: null, attempts: 1, ...o,
})

describe('the welcome', () => {
  it('welcomes a member who is still in the pool, in the words the old route used', async () => {
    const out = await composePoolWelcome(fakeAdmin({ pools: [POOL], pool_members: [{ member_id: 'm1' }], users: USERS }), [row({})])
    expect(out.get(1)).toEqual({
      emails: [{
        key: 'welcome',
        subject: 'Welcome to Bermuda Office',
        html: '<p>Mia Lowe ABC123 https://sportpool.io/pools/p1</p>',
        tags: [{ name: 'category', value: 'pool-activity' }],
      }],
      push: { title: 'Welcome to Bermuda Office!', body: 'You\'ve joined the pool. Make your predictions!', data: { type: 'pool_activity', pool_id: 'p1' } },
    })
  })

  it('does not welcome somebody who has already left', async () => {
    const out = await composePoolWelcome(fakeAdmin({ pools: [POOL], pool_members: [], users: USERS }), [row({})])
    expect(out.get(1)).toEqual({ skip: 'no_longer_true' })
  })

  it('does not welcome anyone to an archived pool', async () => {
    const out = await composePoolWelcome(
      fakeAdmin({ pools: [{ ...POOL, archived_at: '2026-10-06T11:00:00Z' }], pool_members: [{ member_id: 'm1' }], users: USERS }),
      [row({})],
    )
    expect(out.get(1)).toEqual({ skip: 'pool_archived' })
  })

  it('throws on a failed read, so the outbox retries — it never reads a failure as "they left"', async () => {
    await expect(composePoolWelcome(fakeAdmin({ pools: [POOL], users: USERS, failOn: 'pool_members' }), [row({})]))
      .rejects.toThrow('pool_members timed out')
  })
})

describe('"X joined your pool"', () => {
  const joined = (o: Partial<OutboxRow> = {}) =>
    row({ type_key: 'member_joined', user_id: 'boss', channels: ['push'], payload: { memberId: 'm1', joinerId: 'u1' }, ...o })

  it('tells the admin who joined, by name', async () => {
    const out = await composeMemberJoined(fakeAdmin({ pools: [POOL], pool_members: [{ member_id: 'm1' }], users: USERS }), [joined()])
    expect(out.get(1)).toEqual({
      emails: [],
      push: { title: 'Mia Lowe joined Bermuda Office', body: 'A new member just joined your pool', data: { type: 'pool_activity', sub: 'member_joined', pool_id: 'p1' } },
    })
  })

  it('does not tell an admin who has since handed the pool over', async () => {
    const out = await composeMemberJoined(
      fakeAdmin({ pools: [{ ...POOL, admin_user_id: 'new-boss' }], pool_members: [{ member_id: 'm1' }], users: USERS }),
      [joined()],
    )
    expect(out.get(1)).toEqual({ skip: 'no_longer_true' })
  })

  it('calls an unknown joiner "Someone" rather than sending a blank', async () => {
    const out = await composeMemberJoined(fakeAdmin({ pools: [POOL], pool_members: [{ member_id: 'm1' }], users: [] }), [joined()])
    const c = out.get(1)!
    expect('push' in c && c.push?.title).toBe('Someone joined Bermuda Office')
  })
})
