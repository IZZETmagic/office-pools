// =============================================================
// N3's side-by-side run — the send is untouched, the shadow is queued beside it
// =============================================================
// While the outbox runs beside today's path, every league notice the league
// outbox sends is ALSO queued as shadow rows. Three promises are pinned here:
// the send is exactly what it was, the shadow covers exactly the people the
// send went to, and a failure to queue the shadow never touches the send.
// =============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sendBatchEmails = vi.fn<(emails: Array<{ to: string }>) => Promise<{ success: boolean }>>(async () => ({ success: true }))
const sendPushToUsers = vi.fn<(userIds: string[]) => Promise<{ sent: number; total: number }>>(
  async (userIds) => ({ sent: userIds.length, total: userIds.length }),
)
const enqueue = vi.fn<(admin: unknown, notices: Array<Record<string, unknown>>) => Promise<number[]>>(async () => [1])

vi.mock('@/lib/email/send', () => ({ sendBatchEmails: (e: Array<{ to: string }>) => sendBatchEmails(e) }))
vi.mock('@/lib/push/apns', () => ({ sendPushToUsers: (ids: string[]) => sendPushToUsers(ids) }))
vi.mock('@/lib/email/topics', () => ({ TOPICS: { PREDICTIONS: 't1', MATCH_RESULTS: 't2' } }))
vi.mock('@/lib/notifications/outbox', () => ({
  enqueue: (admin: unknown, notices: Array<Record<string, unknown>>) => enqueue(admin, notices),
}))

import { sendLeagueNotice } from '@/lib/league/notify'

type Member = {
  user_id: string
  users: { email: string | null; username: string; full_name: string | null }
  pool_entries: Array<{ entry_id: string; entry_name: string }>
}

function fakeAdmin(seed: Record<string, unknown>) {
  return {
    from(table: string) {
      const api: Record<string, unknown> = {}
      const chain = () => api
      api.select = chain
      api.eq = chain
      api.is = chain
      api.in = chain
      api.single = () => Promise.resolve({ data: seed[table] ?? null, error: null })
      api.then = (res: (v: { data: unknown; error: null }) => unknown) => res({ data: seed[table] ?? [], error: null })
      return api
    },
  } as never
}

const MEMBER = (n: number, entries: string[]): Member => ({
  user_id: `u${n}`,
  users: { email: `u${n}@example.com`, username: `user${n}`, full_name: null },
  pool_entries: entries.map((e) => ({ entry_id: e, entry_name: e })),
})

const LOCK_AT = '2026-11-01T12:30:00Z'
const NOW = new Date('2026-10-05T12:00:00Z')

const reminderWorld = () => fakeAdmin({
  pools: { pool_name: 'Office League', archived_at: null, league_mode: 'pickem' },
  league_matchweeks: { matchweek_number: 12, label: 'Matchweek 12', lock_at: LOCK_AT, fixture_count: 2 },
  league_fixtures: [{ fixture_id: 'f1' }, { fixture_id: 'f2' }],
  // u1 has picked both fixtures; u2 has picked neither.
  pool_members: [MEMBER(1, ['e1']), MEMBER(2, ['e2'])],
  league_predictions: [{ entry_id: 'e1', fixture_id: 'f1' }, { entry_id: 'e1', fixture_id: 'f2' }],
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  sendBatchEmails.mockClear()
  sendPushToUsers.mockClear()
  enqueue.mockReset()
  enqueue.mockImplementation(async () => [1])
})
afterEach(() => vi.useRealTimers())

describe('the side-by-side run', () => {
  it('sends exactly what it sent before, and queues a shadow row for each person it sent to', async () => {
    const r = await sendLeagueNotice(reminderWorld(), 'lock_reminder', 'p1', 'mw1', { shadow: true })
    expect(r).toEqual({ emails: 1, pushes: 1 })
    expect(sendBatchEmails.mock.calls[0][0].map((e) => e.to)).toEqual(['u2@example.com'])

    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(enqueue.mock.calls[0][1]).toEqual([{
      type: 'lock_reminder',
      userId: 'u2',
      poolId: 'p1',
      shadow: true,
      dedupKey: 'lock_reminder:mw1:p1:u2',
      payload: { matchweekId: 'mw1' },
      deadlineAt: LOCK_AT,
    }])
  })

  it('queues nothing without the flag', async () => {
    await sendLeagueNotice(reminderWorld(), 'lock_reminder', 'p1', 'mw1')
    expect(sendBatchEmails).toHaveBeenCalledTimes(1)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('never lets a failed shadow touch the send', async () => {
    enqueue.mockImplementation(async () => { throw new Error('outbox down') })
    const r = await sendLeagueNotice(reminderWorld(), 'lock_reminder', 'p1', 'mw1', { shadow: true })
    expect(r).toEqual({ emails: 1, pushes: 1 })
  })

  it('queues nothing when the notice itself is not sent', async () => {
    const r = await sendLeagueNotice(fakeAdmin({
      pools: { pool_name: 'Office League', archived_at: '2026-10-01T00:00:00Z', league_mode: 'pickem' },
      league_matchweeks: { matchweek_number: 12, label: 'Matchweek 12', lock_at: LOCK_AT, fixture_count: 2 },
    }), 'matchweek_opened', 'p1', 'mw1', { shadow: true })
    expect(r.skipped).toBe('pool is archived')
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('ages a result row from when the matchweek was scored, so the outbox expires it at 48 hours', async () => {
    const scoredAt = new Date(NOW.getTime() - 3_600_000).toISOString()
    await sendLeagueNotice(fakeAdmin({
      pools: { pool_name: 'Office League', archived_at: null, league_mode: 'pickem' },
      league_matchweeks: { matchweek_number: 12, label: 'Matchweek 12', lock_at: LOCK_AT, fixture_count: 2, ranks_snapshot_at: scoredAt },
      pool_members: [MEMBER(1, ['e1', 'e9'])],
    }), 'matchweek_completed', 'p1', 'mw1', { shadow: true })
    expect(enqueue.mock.calls[0][1]).toEqual([{
      type: 'matchweek_completed',
      userId: 'u1',
      poolId: 'p1',
      shadow: true,
      dedupKey: 'matchweek_completed:mw1:p1:u1',
      payload: { matchweekId: 'mw1' },
      deadlineAt: null,
      eventAt: scoredAt,
    }])
  })
})
