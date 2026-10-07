// Last Man Standing reminders and the matchweek's last call (lib/league/lmsNotices.ts), against the
// in-memory database. Pinned: who is reminded (still in, no pick — never the eliminated, never
// someone who has picked), when (one notice per tick, the most urgent: open → a day before → the
// last two hours), at most twice per matchweek, and a fresh read at send time.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/notifications/outbox', () => ({
  enqueue: vi.fn(async (_admin: unknown, notices: unknown[]) => notices.map((_, i) => i + 1)),
}))
vi.mock('@/lib/email/send', () => ({ sendBatchEmails: vi.fn() }))
vi.mock('@/lib/push/apns', () => ({ sendPushToUsers: vi.fn() }))
vi.mock('../notify', async (actual) => ({
  ...(await actual<typeof import('../notify')>()),
  planLockReminder: vi.fn(),
}))

import { enqueue } from '@/lib/notifications/outbox'
import type { OutboxRow } from '@/lib/notifications/outbox'
import { planLockReminder } from '../notify'
import { composeLmsPickOpen, composeLmsPickReminder, queueLeagueReminders, windowFor } from '../lmsNotices'
import { fakeDb } from '../../crews/__tests__/fakeDb'

const NOW = Date.parse('2026-10-06T12:00:00Z')
const HOUR = 3_600_000
const queued = vi.mocked(enqueue)
const lockPlan = vi.mocked(planLockReminder)

/** A world whose open matchweek locks `hoursToLock` from NOW. */
function world(hoursToLock: number) {
  const lockAt = new Date(NOW + hoursToLock * HOUR).toISOString()
  return {
    lockAt,
    db: fakeDb(
      {
        pools: [
          { pool_id: 'lms1', pool_name: 'Last Man Standing', league_season_id: 's1', league_mode: 'last_man_standing', status: 'open', archived_at: null },
          { pool_id: 'pk1', pool_name: 'Pick League', league_season_id: 's1', league_mode: 'pickem', status: 'open', archived_at: null },
        ],
        league_matchweeks: [{ matchweek_id: 'mw6', matchweek_number: 6, label: 'Matchweek 6', lock_at: lockAt }],
        league_lms_rounds: [{ round_id: 'r2', pool_id: 'lms1', round_number: 2, first_matchweek: 4, last_matchweek: null }],
        league_lms_survivors: [
          { round_id: 'r2', entry_id: 'e1', eliminated_matchweek: null },
          { round_id: 'r2', entry_id: 'e2', eliminated_matchweek: null },
          { round_id: 'r2', entry_id: 'e3', eliminated_matchweek: 5 },
        ],
        league_lms_picks: [
          { round_id: 'r2', entry_id: 'e1', matchweek_number: 4, club_id: 'c-ars' },
          { round_id: 'r2', entry_id: 'e1', matchweek_number: 5, club_id: 'c-che' },
          { round_id: 'r2', entry_id: 'e2', matchweek_number: 6, club_id: 'c-liv' },
        ],
        pool_entries: [
          { entry_id: 'e1', entry_name: 'Mia', member_id: 'm1', retired_at: null },
          { entry_id: 'e2', entry_name: 'Dave', member_id: 'm2', retired_at: null },
          { entry_id: 'e3', entry_name: 'Out', member_id: 'm3', retired_at: null },
        ],
        pool_members: [
          { member_id: 'm1', user_id: 'u1' },
          { member_id: 'm2', user_id: 'u2' },
          { member_id: 'm3', user_id: 'u3' },
        ],
        league_clubs: [
          { club_id: 'c-ars', name: 'Arsenal' },
          { club_id: 'c-che', name: 'Chelsea' },
          { club_id: 'c-liv', name: 'Liverpool' },
        ],
        users: [{ user_id: 'u1', full_name: 'Mia Lowe', username: 'mia' }],
      },
      { league_open_matchweek: 'mw6' },
    ),
  }
}

const lmsNotices = () => queued.mock.calls.flatMap((c) => c[1] as Array<Record<string, unknown>>).filter((n) => String(n.type).startsWith('lms_'))

beforeEach(() => {
  queued.mockClear()
  lockPlan.mockReset()
  lockPlan.mockResolvedValue({ skipped: 'everyone has picked' })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

describe('windowFor — one notice per tick, the most urgent', () => {
  it('opens beyond a day, reminds inside a day, last-calls inside two hours, stops at the lock', () => {
    expect([25, 24, 23, 2, 1, 0, -1].map((h) => windowFor(h * HOUR))).toEqual(['open', 'day', 'day', 'last', 'last', null, null])
  })
})

describe('who a Last Man Standing notice goes to', () => {
  it('four days out: tells the one player still in with no pick — not the one who picked, not the one already out', async () => {
    const { db, lockAt } = world(96)
    await queueLeagueReminders(db.client, NOW)
    expect(lmsNotices()).toEqual([{
      type: 'lms_pick_open', userId: 'u1', poolId: 'lms1',
      dedupKey: 'lms_pick_open:mw6:lms1:u1', payload: { matchweekId: 'mw6', window: 'open' }, deadlineAt: lockAt,
    }])
  })

  it('a day out: the first reminder', async () => {
    const { db } = world(20)
    await queueLeagueReminders(db.client, NOW)
    expect(lmsNotices()).toMatchObject([{ type: 'lms_pick_reminder', userId: 'u1', dedupKey: 'lms_pick_reminder:mw6:lms1:u1:day' }])
  })

  it('in the last two hours: the last call — and only that, never three at once', async () => {
    const { db } = world(1.5)
    await queueLeagueReminders(db.client, NOW)
    expect(lmsNotices()).toMatchObject([{ type: 'lms_pick_reminder', dedupKey: 'lms_pick_reminder:mw6:lms1:u1:last', payload: { window: 'last' } }])
  })

  it('after the lock: nothing', async () => {
    const { db } = world(-1)
    await queueLeagueReminders(db.client, NOW)
    expect(lmsNotices()).toEqual([])
  })
})

describe('the pick\'em and Showdown last call', () => {
  it('in the last two hours, goes to whoever the lock reminder\'s own plan says has not finished', async () => {
    lockPlan.mockResolvedValue({
      members: [{ userId: 'u9', emails: [], push: true }],
      push: { title: 't', body: 'b' }, kind: 'lock_reminder', deadlineAt: null, eventAt: null,
    })
    const { db, lockAt } = world(1.5)
    await queueLeagueReminders(db.client, NOW)
    expect(lockPlan).toHaveBeenCalledWith(db.client, 'pk1', 'mw6')
    const lastCalls = queued.mock.calls.flatMap((c) => c[1] as Array<Record<string, unknown>>).filter((n) => n.type === 'lock_reminder')
    expect(lastCalls).toEqual([{
      type: 'lock_reminder', userId: 'u9', poolId: 'pk1',
      dedupKey: 'lock_reminder:mw6:pk1:u9:last', payload: { matchweekId: 'mw6', window: 'last' }, deadlineAt: lockAt,
    }])
  })

  it('is not sent a day out — the day-before reminder is the league outbox\'s, so a member hears at most twice', async () => {
    const { db } = world(20)
    await queueLeagueReminders(db.client, NOW)
    expect(lockPlan).not.toHaveBeenCalled()
  })
})

const row = (o: Partial<OutboxRow>): OutboxRow => ({
  outbox_id: 1, type_key: 'lms_pick_open', user_id: 'u1', to_email: null, pool_id: 'lms1', dedup_key: 'k',
  payload: { matchweekId: 'mw6', window: 'open' }, channels: ['email', 'push'], event_at: new Date(NOW).toISOString(),
  deadline_at: null, expires_at: null, shadow: false, email_status: null, push_status: null, attempts: 1, ...o,
})

describe('composed when the outbox sends', () => {
  it('names the clubs already used — they cannot be picked again', async () => {
    const out = await composeLmsPickOpen(world(96).db.client, [row({})])
    const c = out.get(1)!
    expect('emails' in c && c.emails[0].html).toContain('already used Arsenal, Chelsea')
    expect('push' in c && c.push).toMatchObject({ title: 'Matchweek 6: pick your club', data: { poolId: 'lms1', tab: 'predictions' } })
  })

  it('skips somebody who has picked since it was queued', async () => {
    const out = await composeLmsPickReminder(world(20).db.client, [row({ type_key: 'lms_pick_reminder', user_id: 'u2', payload: { matchweekId: 'mw6', window: 'day' } })])
    expect(out.get(1)).toEqual({ skip: 'no_longer_true' })
  })

  it('skips a row for a matchweek that is no longer the open one', async () => {
    const out = await composeLmsPickReminder(world(20).db.client, [row({ type_key: 'lms_pick_reminder', payload: { matchweekId: 'mw5', window: 'day' } })])
    expect(out.get(1)).toEqual({ skip: 'expired' })
  })

  it('says plainly that the last call is the last one', async () => {
    const out = await composeLmsPickReminder(world(1.5).db.client, [row({ type_key: 'lms_pick_reminder', payload: { matchweekId: 'mw6', window: 'last' } })])
    const c = out.get(1)!
    expect('emails' in c && c.emails[0].subject).toBe('Last call: Matchweek 6 locks soon - Last Man Standing')
    expect('emails' in c && c.emails[0].html).toContain('This is our last reminder for this matchweek.')
  })
})
