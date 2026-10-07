// Pool countdowns (lib/pools/countdown.ts), against the in-memory database. Pinned: ONE countdown
// per member when the first deadline is a week or less away (never inside the last day — the
// reminders own it), what each member still has to pick in their mode, the admin heads-up only
// when hardly anyone has joined, and a fresh read at send time.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/notifications/outbox', () => ({
  enqueue: vi.fn(async (_admin: unknown, notices: unknown[]) => notices.map((_, i) => i + 1)),
}))
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/push/apns', () => ({ sendPushToUser: vi.fn() }))

import { enqueue } from '@/lib/notifications/outbox'
import type { OutboxRow } from '@/lib/notifications/outbox'
import { composePoolCountdown, composePoolCountdownAdmin, inCountdownWindow, queuePoolCountdowns, stillToPick } from '../countdown'
import { fakeDb } from '../../crews/__tests__/fakeDb'

const NOW = Date.parse('2026-10-06T12:00:00Z')
const DAY = 24 * 3_600_000
const START = new Date(NOW + 4 * DAY).toISOString()
const queued = vi.mocked(enqueue)

const POOL = { pool_id: 'p1', pool_name: 'Prem Showdown', pool_code: 'ABC123', admin_user_id: 'boss', league_mode: 'showdown', league_season_id: 's1', status: 'open', archived_at: null }

function world(o: { members?: string[]; start?: string; mode?: string; extra?: Record<string, unknown[]> } = {}) {
  return fakeDb(
    {
      pools: [{ ...POOL, league_mode: o.mode ?? 'showdown' }],
      pool_members: (o.members ?? ['boss', 'mia', 'leo', 'zoe']).map((user_id, i) => ({ pool_id: 'p1', user_id, member_id: `m${i}` })),
      pool_entries: [{ entry_id: 'e-mia', pool_id: 'p1', user_id: 'mia', retired_at: null }],
      users: [{ user_id: 'boss', full_name: 'Dave Okafor', username: 'dave' }, { user_id: 'mia', full_name: 'Mia Lowe', username: 'mia' }],
      league_matchweeks: [{ matchweek_id: 'mw6', season_id: 's1', matchweek_number: 6, label: 'Matchweek 6', lock_at: o.start ?? START }],
      league_fixtures: [{ fixture_id: 'f1', matchweek_id: 'mw6' }, { fixture_id: 'f2', matchweek_id: 'mw6' }, { fixture_id: 'f3', matchweek_id: 'mw6' }],
      league_predictions: [{ entry_id: 'e-mia', fixture_id: 'f1' }],
      league_lms_picks: [],
      league_table_predictions: [],
      ...(o.extra ?? {}),
    },
    { pool_first_lock_at: o.start ?? START },
  )
}

const notices = () => queued.mock.calls.flatMap((c) => c[1] as Array<{ type: string; userId: string; dedupKey: string }>)

beforeEach(() => {
  queued.mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

describe('the window', () => {
  it('opens a week out and closes a day out — the last day belongs to the reminders', () => {
    expect([8, 7, 4, 1.5, 1, 0.5].map((d) => inCountdownWindow(d * DAY))).toEqual([false, true, true, true, false, false])
  })
})

describe('what is queued', () => {
  it('four days out: one countdown per member, keyed to the pool and its start', async () => {
    await queuePoolCountdowns(world().client, NOW)
    expect(notices().map((n) => n.dedupKey)).toEqual(['boss', 'mia', 'leo', 'zoe'].map((u) => `pool_countdown:p1:${START}:${u}`))
  })

  it('no admin heads-up when the pool has filled', async () => {
    await queuePoolCountdowns(world().client, NOW)
    expect(notices().some((n) => n.type === 'pool_countdown_admin')).toBe(false)
  })

  it('a heads-up to the admin when hardly anyone has joined — once', async () => {
    await queuePoolCountdowns(world({ members: ['boss', 'mia'] }).client, NOW)
    expect(notices().filter((n) => n.type === 'pool_countdown_admin')).toEqual([
      expect.objectContaining({ userId: 'boss', dedupKey: `pool_countdown_admin:p1:${START}` }),
    ])
  })

  it('nothing more than a week out, and nothing once it has started', async () => {
    await queuePoolCountdowns(world({ start: new Date(NOW + 8 * DAY).toISOString() }).client, NOW)
    await queuePoolCountdowns(world({ start: new Date(NOW - DAY).toISOString() }).client, NOW)
    expect(notices()).toEqual([])
  })
})

describe('what each member still has to pick', () => {
  const pool = (mode: string) => ({ ...POOL, league_mode: mode })

  it('pick\'em and Showdown: the matches left in the first matchweek', async () => {
    expect(await stillToPick(world().client, pool('showdown'), 'mia', START)).toBe('You have 2 matches to pick for Matchweek 6.')
  })

  it('all picked: nothing to say', async () => {
    const db = world({ extra: { league_predictions: ['f1', 'f2', 'f3'].map((fixture_id) => ({ entry_id: 'e-mia', fixture_id })) } })
    expect(await stillToPick(db.client, pool('showdown'), 'mia', START)).toBeNull()
  })

  it('Last Man Standing: the club', async () => {
    expect(await stillToPick(world().client, pool('last_man_standing'), 'mia', START)).toBe('Your club for Matchweek 6 is not picked yet.')
  })

  it('Table: the table', async () => {
    expect(await stillToPick(world().client, pool('table'), 'mia', START)).toBe('Your season table is not set yet.')
  })
})

const row = (o: Partial<OutboxRow>): OutboxRow => ({
  outbox_id: 1, type_key: 'pool_countdown', user_id: 'mia', to_email: null, pool_id: 'p1', dedup_key: 'k',
  payload: { firstLockAt: START }, channels: ['email', 'push'], event_at: new Date(NOW).toISOString(),
  deadline_at: START, expires_at: START, shadow: false, email_status: null, push_status: null, attempts: 1, ...o,
})

describe('composed when the outbox sends', () => {
  it('says when it starts and what is left to pick', async () => {
    const c = (await composePoolCountdown(world().client, [row({})])).get(1)!
    expect('push' in c && c.push).toMatchObject({ title: 'Prem Showdown starts in 4 days', body: 'You have 2 matches to pick for Matchweek 6.' })
  })

  it('skips a countdown to a start that has moved since — the new date gets its own', async () => {
    const out = await composePoolCountdown(world({ start: new Date(NOW + 5 * DAY).toISOString() }).client, [row({})])
    expect(out.get(1)).toEqual({ skip: 'expired' })
  })

  it('skips somebody who has left', async () => {
    expect((await composePoolCountdown(world({ members: ['boss'] }).client, [row({})])).get(1)).toEqual({ skip: 'no_longer_true' })
  })

  it('drops the admin heads-up if people joined since it was queued', async () => {
    const out = await composePoolCountdownAdmin(world().client, [row({ type_key: 'pool_countdown_admin', user_id: 'boss' })])
    expect(out.get(1)).toEqual({ skip: 'no_longer_true' })
  })

  it('names who is in, and the code to share', async () => {
    const c = (await composePoolCountdownAdmin(world({ members: ['boss', 'mia'] }).client, [row({ type_key: 'pool_countdown_admin', user_id: 'boss' })])).get(1)!
    expect('emails' in c && c.emails[0].subject).toBe('Prem Showdown starts in 4 days — it\'s you and Mia Lowe so far')
    expect('push' in c && c.push?.body).toBe('Only 2 of you so far — share the code ABC123.')
  })
})
