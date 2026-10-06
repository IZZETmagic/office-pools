// Sending invites (lib/crews/notify.ts) against an in-memory database (./fakeDb): the moment of
// adding, the cron's catch-up for anything it missed (156), and the one-time link it arms (155).

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async () => ({ success: true })) }))
vi.mock('@/lib/push/apns', () => ({ sendPushToUser: vi.fn(async () => undefined) }))
vi.mock('@/lib/email/topics', () => ({ TOPICS: { POOL_ACTIVITY: 'topic-pool-activity' } }))
// N3: an ACCOUNT's invite and every seat message are queued into the notification outbox, which
// sends them (lib/notifications). Here the queue is a spy — what matters is what was queued.
vi.mock('@/lib/notifications/outbox', () => ({
  enqueue: vi.fn(async (_admin: unknown, notices: unknown[]) => notices.map((_, i) => i + 1)),
}))

import { sendEmail } from '@/lib/email/send'
import { sendPushToUser } from '@/lib/push/apns'
import { enqueue } from '@/lib/notifications/outbox'

import { hashInviteToken } from '../inviteToken'
import { runCrewNotices, sendInviteNotice } from '../notify'
import { fakeDb } from './fakeDb'

const NOW = Date.parse('2026-10-02T12:00:00Z')
const emailed = vi.mocked(sendEmail)
const pushed = vi.mocked(sendPushToUser)
const queued = vi.mocked(enqueue)

const invite = (o: Record<string, unknown>) => ({
  crew_id: 'c1',
  invited_by: 'cap',
  invitee_user_id: null,
  invitee_email: null,
  token_hash: null,
  notified_at: null,
  resolved_at: null,
  resolution: null,
  created_at: '2026-10-01T09:00:00Z',
  ...o,
})
const seed = (switchOn: boolean, invites: Record<string, unknown>[]) => ({
  sync_settings: [{ setting_key: 'crew_notices_enabled', setting_value: switchOn }],
  crews: [{ crew_id: 'c1', name: 'Bermuda Office', closed_at: null }],
  crew_members: [{ crew_id: 'c1', user_id: 'cap', role: 'captain', left_at: null }],
  users: [
    { user_id: 'cap', username: 'dave', full_name: 'Dave Okafor', email: 'dave@x.com' },
    { user_id: 'mia', username: 'mia', full_name: 'Mia', email: 'mia@x.com' },
  ],
  crew_seats: [],
  crew_invites: invites,
})
/** The token in the one email's button: /crew-invite#<token>. */
const tokenIn = (html: string) => html.match(/\/crew-invite#([A-Za-z0-9_-]{43})"/)?.[1] ?? null

beforeEach(() => {
  emailed.mockClear()
  pushed.mockClear()
  queued.mockClear()
})

/** What the queue was asked to send, flattened across calls. */
const queuedNotices = () => queued.mock.calls.flatMap((c) => c[1] as Array<Record<string, unknown>>)

describe('an invite made while the switch is off', () => {
  it('sends nothing at the moment of adding — and stays unclaimed for the cron', async () => {
    const db = fakeDb(seed(false, [invite({ invite_id: 'i1', invitee_email: 'new@person.org' })]))
    await sendInviteNotice(db.client, 'i1')
    expect(emailed).not.toHaveBeenCalled()
    expect(db.tables.crew_invites[0]).toMatchObject({ notified_at: null, token_hash: null })
  })

  it('goes out on the next cron run once the switch is on — the catch-up (156)', async () => {
    const db = fakeDb(
      seed(true, [
        invite({ invite_id: 'acct', invitee_user_id: 'mia' }),
        invite({ invite_id: 'addr', invitee_email: 'new@person.org' }),
      ]),
    )
    expect(await runCrewNotices(db.client, NOW)).toEqual({ notices: 0, reminders: 0, invites: 2 })
    // The account's invite is QUEUED — the outbox sends it — and the address's is emailed here.
    expect(queuedNotices()).toEqual([{ type: 'crew_invite', userId: 'mia', dedupKey: 'crew_invite:acct', payload: { inviteId: 'acct' } }])
    expect(pushed).not.toHaveBeenCalled()
    expect(emailed).toHaveBeenCalledWith(expect.objectContaining({ to: 'new@person.org' }))
    for (const row of db.tables.crew_invites) expect(row.notified_at).toBe(new Date(NOW).toISOString())
  })
})

describe('N3 — queued first, stamped second', () => {
  it('an account invite whose queueing fails is NOT stamped, so the next run queues it — nothing lost', async () => {
    const db = fakeDb(seed(true, [invite({ invite_id: 'acct', invitee_user_id: 'mia' })]))
    queued.mockRejectedValueOnce(new Error('outbox down'))
    expect(await runCrewNotices(db.client, NOW)).toMatchObject({ invites: 0 })
    expect(db.tables.crew_invites[0].notified_at).toBeNull()

    expect(await runCrewNotices(db.client, NOW + 900_000)).toMatchObject({ invites: 1 })
    expect(db.tables.crew_invites[0].notified_at).not.toBeNull()
  })

  it('the moment of adding hands back the rows it queued, so the request can send them at once', async () => {
    const db = fakeDb(seed(true, [invite({ invite_id: 'acct', invitee_user_id: 'mia' })]))
    expect(await sendInviteNotice(db.client, 'acct')).toEqual([1])
  })

  it('a failure to queue does not fail the captain\'s request — the cron sends it later', async () => {
    const db = fakeDb(seed(true, [invite({ invite_id: 'acct', invitee_user_id: 'mia' })]))
    queued.mockRejectedValueOnce(new Error('outbox down'))
    await expect(sendInviteNotice(db.client, 'acct')).resolves.toEqual([])
    expect(db.tables.crew_invites[0].notified_at).toBeNull()
  })
})

describe('exactly once', () => {
  it('a second cron run sends nothing', async () => {
    const db = fakeDb(seed(true, [invite({ invite_id: 'addr', invitee_email: 'new@person.org' })]))
    await runCrewNotices(db.client, NOW)
    expect(await runCrewNotices(db.client, NOW + 900_000)).toMatchObject({ invites: 0 })
    expect(emailed).toHaveBeenCalledTimes(1)
  })
  it('an invite queued at the moment of adding is not queued again by the cron', async () => {
    const db = fakeDb(seed(true, [invite({ invite_id: 'acct', invitee_user_id: 'mia' })]))
    await sendInviteNotice(db.client, 'acct')
    await runCrewNotices(db.client, NOW)
    expect(queued).toHaveBeenCalledTimes(1)
  })
  it('a withdrawn or answered invite is never sent', async () => {
    const db = fakeDb(
      seed(true, [
        invite({ invite_id: 'w', invitee_email: 'a@b.co', resolved_at: '2026-10-01', resolution: 'revoked' }),
        invite({ invite_id: 'j', invitee_user_id: 'mia', resolved_at: '2026-10-01', resolution: 'joined' }),
      ]),
    )
    expect(await runCrewNotices(db.client, NOW)).toMatchObject({ invites: 0 })
    expect(emailed).not.toHaveBeenCalled()
    expect(pushed).not.toHaveBeenCalled()
    expect(queued).not.toHaveBeenCalled()
  })
  it('⚠ an ADDRESS\'s failed send is not retried — one missed email beats two; its link cannot be queued', async () => {
    emailed.mockRejectedValueOnce(new Error('resend down'))
    const db = fakeDb(seed(true, [invite({ invite_id: 'addr', invitee_email: 'new@person.org' })]))
    expect(await runCrewNotices(db.client, NOW)).toMatchObject({ invites: 1 })
    expect(await runCrewNotices(db.client, NOW + 900_000)).toMatchObject({ invites: 0 })
    expect(emailed).toHaveBeenCalledTimes(1)
  })
})

describe('the one-time link it arms (155)', () => {
  it('the email’s button carries the token whose hash is stored — and only the hash is stored', async () => {
    const db = fakeDb(seed(true, [invite({ invite_id: 'addr', invitee_email: 'new@person.org' })]))
    await sendInviteNotice(db.client, 'addr')
    const token = tokenIn(emailed.mock.calls[0][0].html as string)
    expect(token).not.toBeNull()
    expect(db.tables.crew_invites[0].token_hash).toBe(hashInviteToken(token!))
    expect(JSON.stringify(db.tables.crew_invites)).not.toContain(token!)
  })
  it('an invite to an account never gets a link', async () => {
    const db = fakeDb(seed(true, [invite({ invite_id: 'acct', invitee_user_id: 'mia' })]))
    await sendInviteNotice(db.client, 'acct')
    expect(db.tables.crew_invites[0].token_hash).toBeNull()
  })
})
