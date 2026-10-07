// An admin's actions and what they tell members (lib/pools/adminNotices.ts), against the in-memory
// database. Pinned: the notices exist only if the action happened — the checks the routes make —
// their content comes from what is stored, never from a request, and each is read again at send
// time: a pool restored since is not "archived", somebody who rejoined is not "removed".

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/notifications/outbox', () => ({
  enqueue: vi.fn(async (_admin: unknown, notices: unknown[]) => notices.map((_, i) => i + 1)),
}))

import { enqueue } from '@/lib/notifications/outbox'
import type { OutboxRow } from '@/lib/notifications/outbox'
import {
  composeMemberRemoved, composePointsAdjusted, composePoolArchived, composePoolRestored,
  queueMemberRemoved, queuePoolArchived, recentAdjustmentBy, removalEvidence,
} from '../adminNotices'
import { fakeDb } from '../../crews/__tests__/fakeDb'

const NOW = Date.parse('2026-10-06T12:00:00Z')
const ARCHIVED_AT = '2026-10-06T11:59:00.000Z'
const queued = vi.mocked(enqueue)

const world = (o: { archived_at?: string | null; members?: Array<{ pool_id: string; user_id: string }>; extra?: Record<string, unknown[]> } = {}) =>
  fakeDb({
    pools: [{ pool_id: 'p1', pool_name: 'Bermuda Office', archived_at: o.archived_at === undefined ? ARCHIVED_AT : o.archived_at }],
    pool_members: o.members ?? [{ pool_id: 'p1', user_id: 'boss' }, { pool_id: 'p1', user_id: 'mia' }, { pool_id: 'p1', user_id: 'leo' }],
    users: [
      { user_id: 'boss', full_name: 'Dave Okafor', username: 'dave' },
      { user_id: 'mia', full_name: 'Mia Lowe', username: 'mia' },
    ],
    ...(o.extra ?? {}),
  })

const row = (o: Partial<OutboxRow>): OutboxRow => ({
  outbox_id: 1, type_key: 'pool_archived', user_id: 'mia', to_email: null, pool_id: 'p1', dedup_key: 'k',
  payload: { actorId: 'boss', archivedAt: ARCHIVED_AT }, channels: ['email', 'push'], event_at: new Date(NOW).toISOString(),
  deadline_at: null, expires_at: null, shadow: false, email_status: null, push_status: null, attempts: 1, ...o,
})

beforeEach(() => {
  queued.mockClear()
})

describe('archived and restored', () => {
  it('queues "archived" for every member but the admin who did it, keyed to that archive', async () => {
    await queuePoolArchived(world().client, { poolId: 'p1', actorId: 'boss', archivedAt: ARCHIVED_AT })
    expect((queued.mock.calls[0][1] as Array<{ userId: string; dedupKey: string }>).map((n) => [n.userId, n.dedupKey])).toEqual([
      ['mia', `pool_archived:p1:${ARCHIVED_AT}:mia`],
      ['leo', `pool_archived:p1:${ARCHIVED_AT}:leo`],
    ])
  })

  it('names who archived it, in the words the route always used', async () => {
    const c = (await composePoolArchived(world().client, [row({})])).get(1)!
    expect('push' in c && c.push?.body).toBe('Dave Okafor archived Bermuda Office. Nothing is lost — find it under Profile → Archived.')
  })

  it('does not announce "archived" for a pool restored since — or archived again later', async () => {
    expect((await composePoolArchived(world({ archived_at: null }).client, [row({})])).get(1)).toEqual({ skip: 'no_longer_true' })
    expect((await composePoolArchived(world({ archived_at: '2026-10-06T13:00:00.000Z' }).client, [row({})])).get(1)).toEqual({ skip: 'no_longer_true' })
  })

  it('does not tell somebody who has left the pool since', async () => {
    const out = await composePoolArchived(world({ members: [{ pool_id: 'p1', user_id: 'boss' }] }).client, [row({})])
    expect(out.get(1)).toEqual({ skip: 'no_longer_true' })
  })

  it('does not announce "restored" for a pool archived again since', async () => {
    const out = await composePoolRestored(world({ archived_at: ARCHIVED_AT }).client, [row({ type_key: 'pool_restored', payload: { actorId: 'boss' } })])
    expect(out.get(1)).toEqual({ skip: 'no_longer_true' })
  })
})

describe('points adjusted — from the logged adjustment, never from a request', () => {
  const adjustWorld = () => world({
    archived_at: null,
    extra: {
      pool_entries: [{ entry_id: 'e1', pool_id: 'p1', user_id: 'mia', entry_name: 'Mia #1', scored_total_points: 120, retired_at: null, member_id: 'm1' }],
      point_adjustments: [
        { id: 'adj-old', entry_id: 'e1', pool_id: 'p1', amount: 5, reason: 'old', created_by: 'boss', created_at: '2026-10-06T11:00:00.000Z' },
        { id: 'adj-new', entry_id: 'e1', pool_id: 'p1', amount: -3, reason: 'Late pick', created_by: 'boss', created_at: '2026-10-06T11:58:00.000Z' },
        { id: 'adj-other', entry_id: 'e1', pool_id: 'p1', amount: 50, reason: 'not mine', created_by: 'someone-else', created_at: '2026-10-06T11:59:00.000Z' },
      ],
    },
  })

  it('finds only the CALLER\'s own adjustment from the last ten minutes', async () => {
    expect(await recentAdjustmentBy(adjustWorld().client, { poolId: 'p1', callerId: 'boss', targetUserId: 'mia', now: NOW })).toBe('adj-new')
    expect(await recentAdjustmentBy(adjustWorld().client, { poolId: 'p1', callerId: 'stranger', targetUserId: 'mia', now: NOW })).toBeNull()
    expect(await recentAdjustmentBy(adjustWorld().client, { poolId: 'p1', callerId: 'boss', targetUserId: 'mia', now: NOW + 30 * 60_000 })).toBeNull()
  })

  it('finds nothing for somebody with no entry in the pool — the old door to any user is shut', async () => {
    expect(await recentAdjustmentBy(adjustWorld().client, { poolId: 'p1', callerId: 'boss', targetUserId: 'random-user', now: NOW })).toBeNull()
  })

  it('says what the log says — the amount, the reason, and the total as it stands', async () => {
    const c = (await composePointsAdjusted(adjustWorld().client, [row({ type_key: 'points_adjusted', payload: { adjustmentId: 'adj-new' } })])).get(1)!
    expect('push' in c && c.push).toMatchObject({ title: 'Points Adjusted (-3)', body: 'Bermuda Office: Late pick' })
  })

  it('goes only to the entry\'s owner', async () => {
    const out = await composePointsAdjusted(adjustWorld().client, [row({ type_key: 'points_adjusted', user_id: 'leo', payload: { adjustmentId: 'adj-new' } })])
    expect(out.get(1)).toEqual({ skip: 'no_longer_true' })
  })
})

describe('member removed — only for somebody who really was', () => {
  const entries = (o: { member_id: string | null; retired_at: string | null }) =>
    [{ entry_id: 'e7', pool_id: 'p1', user_id: 'zoe', entry_name: 'Zoe', ...o }]

  it('is evidenced by a detached entry that was not retired — what an admin\'s removal leaves', async () => {
    const db = world({ extra: { pool_entries: entries({ member_id: null, retired_at: null }) } })
    expect(await removalEvidence(db.client, { poolId: 'p1', userId: 'zoe' })).toBe('e7')
  })

  it('is NOT evidenced by somebody who left on their own (their entries are retired)', async () => {
    const db = world({ extra: { pool_entries: entries({ member_id: null, retired_at: '2026-10-06T11:00:00Z' }) } })
    expect(await removalEvidence(db.client, { poolId: 'p1', userId: 'zoe' })).toBeNull()
  })

  it('is NOT evidenced by somebody still in the pool, or never in it', async () => {
    expect(await removalEvidence(world({ extra: { pool_entries: entries({ member_id: 'm9', retired_at: null }) } }).client, { poolId: 'p1', userId: 'mia' })).toBeNull()
    expect(await removalEvidence(world({ extra: { pool_entries: [] } }).client, { poolId: 'p1', userId: 'random-user' })).toBeNull()
  })

  it('does not tell somebody who has rejoined since that they were removed', async () => {
    const out = await composeMemberRemoved(world().client, [row({ type_key: 'member_removed', user_id: 'mia' })])
    expect(out.get(1)).toEqual({ skip: 'no_longer_true' })
  })
  // queueMemberRemoved — shared by the one-request removal route and the older notice route.
  const removed = () => world({
    members: [{ pool_id: 'p1', user_id: 'boss' }],
    extra: { pool_entries: entries({ member_id: null, retired_at: null }), pool_membership_events: [] },
  })

  it('queues the notice keyed to the removal, and writes the activity card with it', async () => {
    const db = removed()
    expect(await queueMemberRemoved(db.client, { poolId: 'p1', userId: 'zoe', actorId: 'boss' })).toEqual([1])
    expect(queued.mock.calls[0][1]).toEqual([expect.objectContaining({ type: 'member_removed', userId: 'zoe', dedupKey: 'member_removed:p1:zoe:e7' })])
    expect(db.tables.pool_membership_events).toEqual([
      expect.objectContaining({ pool_id: 'p1', user_id: 'zoe', actor_user_id: 'boss', event_type: 'removed', pool_name: 'Bermuda Office' }),
    ])
  })

  it('no removal: no notice and no card', async () => {
    const db = world({ extra: { pool_entries: [], pool_membership_events: [] } })
    expect(await queueMemberRemoved(db.client, { poolId: 'p1', userId: 'mia', actorId: 'boss' })).toEqual([])
    expect(queued).not.toHaveBeenCalled()
    expect(db.tables.pool_membership_events).toEqual([])
  })

  it('told already (the notice deduplicates): no second card', async () => {
    const db = removed()
    queued.mockResolvedValueOnce([])
    expect(await queueMemberRemoved(db.client, { poolId: 'p1', userId: 'zoe', actorId: 'boss' })).toEqual([])
    expect(db.tables.pool_membership_events).toEqual([])
  })
})
