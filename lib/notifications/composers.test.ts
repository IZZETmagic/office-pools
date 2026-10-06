import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LeaguePlan } from '@/lib/league/notify'

const planLeagueNotice = vi.fn<(admin: unknown, kind: string, poolId: string, matchweekId: string | null) => Promise<LeaguePlan>>()
vi.mock('@/lib/league/notify', () => ({
  planLeagueNotice: (admin: unknown, kind: string, poolId: string, matchweekId: string | null) =>
    planLeagueNotice(admin, kind, poolId, matchweekId),
}))
vi.mock('./outbox', () => ({}))

import { COMPOSERS, skipReason } from './composers'
import type { OutboxRow } from './outbox'

const row = (id: number, userId: string, poolId = 'p1', matchweekId = 'mw1'): OutboxRow => ({
  outbox_id: id, type_key: 'lock_reminder', user_id: userId, to_email: null, pool_id: poolId,
  dedup_key: `lock_reminder:${matchweekId}:${poolId}:${userId}`, payload: { matchweekId }, channels: ['email', 'push'],
  event_at: '2026-10-05T12:00:00Z', deadline_at: '2026-11-01T12:30:00Z', expires_at: '2026-11-01T12:30:00Z',
  shadow: true, email_status: null, push_status: null, attempts: 1,
})

const plan = (members: Array<{ userId: string; push?: boolean; keys?: string[] }>): LeaguePlan => ({
  members: members.map((m) => ({
    userId: m.userId,
    push: m.push ?? true,
    emails: (m.keys ?? ['reminder']).map((key) => ({ key, to: `${m.userId}@example.com`, subject: `Subject ${key}`, html: '<p/>', tags: [{ name: 'category', value: 'x' }] })),
  })),
  push: { title: 'Matchweek 12 closes soon', body: 'pick', data: { poolId: 'p1', tab: 'predictions' } },
  category: 'PREDICTIONS',
  deadlineAt: '2026-11-01T12:30:00Z',
  eventAt: null,
})

const admin = {} as never
const compose = COMPOSERS.lock_reminder!

beforeEach(() => planLeagueNotice.mockReset())

describe('the league composer', () => {
  it('plans once per pool and matchweek, however many members\' rows it covers', async () => {
    planLeagueNotice.mockResolvedValue(plan([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }]))
    await compose(admin, [row(1, 'u1'), row(2, 'u2'), row(3, 'u3'), row(4, 'u1', 'p2')])
    expect(planLeagueNotice.mock.calls.map((c) => [c[1], c[2], c[3]])).toEqual([
      ['lock_reminder', 'p1', 'mw1'],
      ['lock_reminder', 'p2', 'mw1'],
    ])
  })

  it('gives each member their own emails, and the plan\'s push', async () => {
    planLeagueNotice.mockResolvedValue(plan([{ userId: 'u1', keys: ['result-e1', 'result-e2'] }]))
    const out = await compose(admin, [row(1, 'u1')])
    expect(out.get(1)).toEqual({
      emails: [
        { key: 'result-e1', subject: 'Subject result-e1', html: '<p/>', tags: [{ name: 'category', value: 'x' }] },
        { key: 'result-e2', subject: 'Subject result-e2', html: '<p/>', tags: [{ name: 'category', value: 'x' }] },
      ],
      push: { title: 'Matchweek 12 closes soon', body: 'pick', data: { poolId: 'p1', tab: 'predictions' } },
    })
  })

  it('skips somebody who was in the plan when queued and is not now — they picked, or left', async () => {
    planLeagueNotice.mockResolvedValue(plan([{ userId: 'u2' }]))
    const out = await compose(admin, [row(1, 'u1'), row(2, 'u2')])
    expect(out.get(1)).toEqual({ skip: 'no_longer_true' })
    expect('emails' in out.get(2)!).toBe(true)
  })

  it('passes a declined plan to every row, as a reason the outbox can record', async () => {
    planLeagueNotice.mockResolvedValue({ skipped: 'expired: the matchweek has already locked' })
    const out = await compose(admin, [row(1, 'u1'), row(2, 'u2')])
    expect([...out.values()]).toEqual([{ skip: 'expired' }, { skip: 'expired' }])
  })
})

describe('skipReason', () => {
  it('maps each reason the plans give to one the outbox accepts', () => {
    expect([
      'expired: the matchweek was scored more than 48 hours ago',
      'deadline already passed',
      'pool is archived',
      'mode has no weekly fixture picks',
      'not a table pool',
      'everyone has picked',
      'everyone has filed a table',
      'no active entries',
      'matchweek has no fixtures',
      'pool or matchweek not found',
      "'lock_reminder' needs a matchweek and the row has none",
      "no handler for kind 'mystery'",
    ].map(skipReason)).toEqual([
      'expired', 'expired', 'pool_archived', 'wrong_mode', 'wrong_mode',
      'no_longer_true', 'no_longer_true', 'no_longer_true', 'no_longer_true',
      'not_found', 'not_found', 'not_sendable',
    ])
  })
  it('only ever returns what the database\'s status check allows', () => {
    for (const r of ['anything at all', 'pool is archived', 'expired: x']) expect(skipReason(r)).toMatch(/^[a-z_]+$/)
  })
})
