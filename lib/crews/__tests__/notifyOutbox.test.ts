// N3 (2026-10-05): seat notices, the reminder and an ACCOUNT's invite go through the notification
// outbox. Two halves are pinned here, against the in-memory database (./fakeDb):
//
//   * the cron QUEUES them — first, and stamps second, so nothing is lost and nothing doubled;
//   * the outbox's composers read the world at SEND time — a spot taken, or an invite answered,
//     since it was queued is skipped as no longer true rather than announced.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async () => ({ success: true })) }))
vi.mock('@/lib/push/apns', () => ({ sendPushToUser: vi.fn(async () => undefined) }))
vi.mock('@/lib/notifications/outbox', () => ({
  enqueue: vi.fn(async (_admin: unknown, notices: unknown[]) => notices.map((_, i) => i + 1)),
}))

import { sendEmail } from '@/lib/email/send'
import { enqueue } from '@/lib/notifications/outbox'
import type { OutboxRow } from '@/lib/notifications/outbox'

import { composeCrewInvites, composeCrewSeats, runCrewNotices } from '../notify'
import { fakeDb } from './fakeDb'

const NOW = Date.parse('2026-10-02T12:00:00Z')
const LOCK = '2026-10-05T11:00:00Z' // about three days out
const SOON = '2026-10-03T06:00:00Z' // inside the reminder's day
const queued = vi.mocked(enqueue)

const world = (seat: Record<string, unknown>, lockAt = LOCK) =>
  fakeDb(
    {
      sync_settings: [{ setting_key: 'crew_notices_enabled', setting_value: true }],
      pools: [{ pool_id: 'p1', pool_code: 'ABC123', crew_id: 'c1', prediction_mode: 'league_pickem', league_mode: 'pickem', league_season_id: 's1', tournament_id: null }],
      crews: [{ crew_id: 'c1', name: 'Bermuda Office', closed_at: null }],
      league_seasons: [{ season_id: 's1', competition_name: 'Premier League', season_label: '2026/27' }],
      crew_members: [{ crew_id: 'c1', user_id: 'cap', role: 'captain', left_at: null }],
      users: [{ user_id: 'cap', username: 'dave', full_name: 'Dave Okafor', email: 'dave@x.com' }, { user_id: 'mia', username: 'mia', full_name: 'Mia', email: 'mia@x.com' }],
      crew_seats: [{ pool_id: 'p1', user_id: 'mia', resolution: null, resolved_at: null, notified_at: null, reminded_at: null, ...seat }],
      crew_invites: [],
    },
    { pool_first_lock_at: lockAt },
  )

const row = (o: Partial<OutboxRow>): OutboxRow => ({
  outbox_id: 1, type_key: 'crew_seat_saved', user_id: 'mia', to_email: null, pool_id: 'p1', dedup_key: 'k',
  payload: {}, channels: ['email', 'push'], event_at: new Date(NOW).toISOString(), deadline_at: LOCK, expires_at: LOCK,
  shadow: false, email_status: null, push_status: null, attempts: 1, ...o,
})

beforeEach(() => {
  queued.mockClear()
  vi.mocked(sendEmail).mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

describe('the cron queues seat messages — it no longer sends them itself', () => {
  it('queues a due seat notice, expiring at picks lock, and stamps it', async () => {
    const db = world({})
    expect(await runCrewNotices(db.client, NOW)).toMatchObject({ notices: 1 })
    expect(queued.mock.calls[0][1]).toEqual([{
      type: 'crew_seat_saved', userId: 'mia', poolId: 'p1', dedupKey: 'crew_seat_saved:p1:mia', deadlineAt: LOCK,
    }])
    expect(db.tables.crew_seats[0].notified_at).toBe(new Date(NOW).toISOString())
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('queues the ONE reminder once picks lock within a day', async () => {
    const db = world({ notified_at: '2026-09-30T12:00:00Z' }, SOON)
    expect(await runCrewNotices(db.client, NOW)).toMatchObject({ reminders: 1 })
    expect(queued.mock.calls[0][1]).toEqual([{
      type: 'crew_seat_reminder', userId: 'mia', poolId: 'p1', dedupKey: 'crew_seat_reminder:p1:mia', deadlineAt: SOON,
    }])
  })
})

describe('the composers read the world when the outbox sends', () => {
  it('a seat still open gets its message, with the push the app opens the pool from', async () => {
    const out = await composeCrewSeats('crew_seat_saved')(world({}).client, [row({})])
    const c = out.get(1)!
    expect('emails' in c && c.emails[0].key).toBe('seat')
    expect('push' in c && c.push).toMatchObject({ data: { type: 'crew_seat', poolId: 'p1' } })
  })

  it('a spot taken since it was queued is skipped, not announced', async () => {
    const out = await composeCrewSeats('crew_seat_saved')(world({ resolution: 'joined', resolved_at: '2026-10-02T11:00:00Z' }).client, [row({})])
    expect(out.get(1)).toEqual({ skip: 'no_longer_true' })
  })

  it('an open invite names who asked', async () => {
    const db = world({})
    db.tables.crew_invites.push({ invite_id: 'i1', crew_id: 'c1', invited_by: 'cap', invitee_user_id: 'mia', resolved_at: null })
    const out = await composeCrewInvites(db.client, [row({ type_key: 'crew_invite', payload: { inviteId: 'i1' } })])
    const c = out.get(1)!
    expect('push' in c && c.push?.title).toBe('Dave Okafor added you to Bermuda Office')
    expect('push' in c && c.push?.data).toEqual({ type: 'crew_invite', crewId: 'c1' })
  })

  it('an invite answered since it was queued — or now somebody else\'s — is skipped', async () => {
    const db = world({})
    db.tables.crew_invites.push(
      { invite_id: 'done', crew_id: 'c1', invited_by: 'cap', invitee_user_id: 'mia', resolved_at: '2026-10-02T11:00:00Z' },
      { invite_id: 'other', crew_id: 'c1', invited_by: 'cap', invitee_user_id: 'someone-else', resolved_at: null },
    )
    const out = await composeCrewInvites(db.client, [
      row({ outbox_id: 1, type_key: 'crew_invite', payload: { inviteId: 'done' } }),
      row({ outbox_id: 2, type_key: 'crew_invite', payload: { inviteId: 'other' } }),
    ])
    expect([...out.values()]).toEqual([{ skip: 'no_longer_true' }, { skip: 'no_longer_true' }])
  })
})
