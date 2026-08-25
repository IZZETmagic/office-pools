// =============================================================
// League notifications — who actually receives one
// =============================================================
// The lock reminder only survives CLAUDE.md's disclosure gate because of two
// constraints: it goes ONLY to people who have not picked, and ONLY once.
//
// "Only once" lives in the producer (`lock_reminder_sent_at`) and is proven by
// scripts/verify-league-notices.ts against a real database. "Only to those who
// have not picked" lives here, in `notifyLockReminder`, and is what this file
// pins — because the moment that filter slips, the product is emailing people
// who already did the thing, which is the definition of a nag.
//
// The send primitives are mocked. A test that actually sent would be a test
// that spams somebody every time it runs.
// =============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

type EmailArg = Array<{ to: string; subject: string; html: string }>
// Typed explicitly: `vi.fn(async () => …)` infers an EMPTY argument tuple, so
// every `.mock.calls[0][0]` below would be a type error even though the calls
// are real at runtime.
const sendBatchEmails = vi.fn<(emails: EmailArg) => Promise<{ success: boolean }>>(
  async () => ({ success: true }),
)
const sendPushToUsers = vi.fn<
  (userIds: string[], push: { title: string; body: string }, category?: string) => Promise<{ sent: number; total: number }>
>(async () => ({ sent: 0, total: 0 }))

vi.mock('@/lib/email/send', () => ({
  sendBatchEmails: (emails: EmailArg) => sendBatchEmails(emails),
}))
vi.mock('@/lib/push/apns', () => ({
  sendPushToUsers: (userIds: string[], push: { title: string; body: string }, category?: string) =>
    sendPushToUsers(userIds, push, category),
}))
vi.mock('@/lib/email/topics', () => ({ TOPICS: { PREDICTIONS: 't1', MATCH_RESULTS: 't2' } }))

import { notifyLockReminder } from '@/lib/league/notify'

type Member = {
  user_id: string
  users: { email: string | null; username: string; full_name: string | null }
  pool_entries: Array<{ entry_id: string; entry_name: string }> | null
}

/**
 * Just enough Supabase to satisfy notify.ts. Each `.from(table)` returns a
 * thenable that resolves to whatever this table was seeded with; `.single()`
 * resolves to the first row.
 */
function fakeAdmin(seed: {
  pool?: { pool_name: string; archived_at: string | null }
  matchweek?: { matchweek_number: number; label: string | null; lock_at: string | null; fixture_count: number }
  members?: Member[]
  fixtures?: Array<{ fixture_id: string }>
  predictions?: Array<{ entry_id: string; fixture_id: string }>
}) {
  const data: Record<string, unknown> = {
    pools: seed.pool ?? null,
    league_matchweeks: seed.matchweek ?? null,
    pool_members: seed.members ?? [],
    league_fixtures: seed.fixtures ?? [],
    league_predictions: seed.predictions ?? [],
  }
  return {
    from(table: string) {
      const api: Record<string, unknown> = {}
      const chain = () => api
      api.select = chain
      api.eq = chain
      api.is = chain
      api.in = chain
      api.single = () => Promise.resolve({ data: data[table], error: null })
      api.then = (res: (v: { data: unknown; error: null }) => unknown) =>
        res({ data: data[table], error: null })
      return api
    },
  } as never
}

const MEMBER = (n: number, entries: string[]): Member => ({
  user_id: `u${n}`,
  users: { email: `u${n}@example.com`, username: `user${n}`, full_name: null },
  pool_entries: entries.map((e) => ({ entry_id: e, entry_name: e })),
})

const BASE = {
  pool: { pool_name: 'Office League', archived_at: null },
  matchweek: { matchweek_number: 12, label: 'Matchweek 12', lock_at: '2026-11-01T12:30:00Z', fixture_count: 2 },
  fixtures: [{ fixture_id: 'f1' }, { fixture_id: 'f2' }],
}

const recipients = () => sendBatchEmails.mock.calls[0]?.[0] ?? []
const pushedTo = () => sendPushToUsers.mock.calls[0]?.[0] ?? []

beforeEach(() => {
  sendBatchEmails.mockClear()
  sendPushToUsers.mockClear()
})

describe('the lock reminder goes ONLY to people who have not picked', () => {
  it('skips a member who has picked every fixture', async () => {
    const r = await notifyLockReminder(
      fakeAdmin({
        ...BASE,
        members: [MEMBER(1, ['e1']), MEMBER(2, ['e2'])],
        // e1 has both, e2 has neither.
        predictions: [
          { entry_id: 'e1', fixture_id: 'f1' },
          { entry_id: 'e1', fixture_id: 'f2' },
        ],
      }),
      'p1',
      'mw1',
    )
    expect(r.emails).toBe(1)
    expect(recipients().map((e) => e.to)).toEqual(['u2@example.com'])
    expect(pushedTo()).toEqual(['u2'])
  })

  it('includes a member who is only PARTWAY through', async () => {
    // Half a matchweek is not a submitted matchweek — they still have work to do.
    await notifyLockReminder(
      fakeAdmin({
        ...BASE,
        members: [MEMBER(1, ['e1'])],
        predictions: [{ entry_id: 'e1', fixture_id: 'f1' }],
      }),
      'p1',
      'mw1',
    )
    expect(recipients().map((e) => e.to)).toEqual(['u1@example.com'])
  })

  it('sends NOTHING when everybody has picked', async () => {
    const r = await notifyLockReminder(
      fakeAdmin({
        ...BASE,
        members: [MEMBER(1, ['e1'])],
        predictions: [
          { entry_id: 'e1', fixture_id: 'f1' },
          { entry_id: 'e1', fixture_id: 'f2' },
        ],
      }),
      'p1',
      'mw1',
    )
    expect(r.skipped).toBe('everyone has picked')
    expect(sendBatchEmails).not.toHaveBeenCalled()
    expect(sendPushToUsers).not.toHaveBeenCalled()
  })

  it('counts a member with SEVERAL entries once, listing only the unfinished ones', async () => {
    await notifyLockReminder(
      fakeAdmin({
        ...BASE,
        members: [MEMBER(1, ['e1', 'e2'])],
        predictions: [
          { entry_id: 'e1', fixture_id: 'f1' },
          { entry_id: 'e1', fixture_id: 'f2' },
        ],
      }),
      'p1',
      'mw1',
    )
    const sent = recipients()
    expect(sent).toHaveLength(1)
    // e1 is complete, so only e2 should be named in the email body.
    const html = recipients()[0].html
    expect(html).toContain('e2')
  })

  it('sends nothing to an ARCHIVED pool', async () => {
    const r = await notifyLockReminder(
      fakeAdmin({
        ...BASE,
        pool: { pool_name: 'Old League', archived_at: '2026-08-01T00:00:00Z' },
        members: [MEMBER(1, ['e1'])],
      }),
      'p1',
      'mw1',
    )
    expect(r.skipped).toBe('pool is archived')
    expect(sendBatchEmails).not.toHaveBeenCalled()
  })

  it('sends nothing when the matchweek has no fixtures', async () => {
    const r = await notifyLockReminder(
      fakeAdmin({ ...BASE, fixtures: [], members: [MEMBER(1, ['e1'])] }),
      'p1',
      'mw1',
    )
    expect(r.skipped).toBe('matchweek has no fixtures')
    expect(sendBatchEmails).not.toHaveBeenCalled()
  })

  it('uses the PREDICTIONS push category, so an opt-out is honoured', async () => {
    await notifyLockReminder(
      fakeAdmin({ ...BASE, members: [MEMBER(1, ['e1'])] }),
      'p1',
      'mw1',
    )
    expect(sendPushToUsers.mock.calls[0]?.[2]).toBe('PREDICTIONS')
  })
})
