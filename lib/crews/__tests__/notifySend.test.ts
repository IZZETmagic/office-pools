// Sending invites (lib/crews/notify.ts) against an in-memory database (./fakeDb): the moment of
// adding, the cron's catch-up for anything it missed (156), and the one-time link it arms (155).

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async () => ({ success: true })) }))
vi.mock('@/lib/push/apns', () => ({ sendPushToUser: vi.fn(async () => undefined) }))
vi.mock('@/lib/email/topics', () => ({ TOPICS: { POOL_ACTIVITY: 'topic-pool-activity' } }))

import { sendEmail } from '@/lib/email/send'
import { sendPushToUser } from '@/lib/push/apns'

import { hashInviteToken } from '../inviteToken'
import { runCrewNotices, sendInviteNotice } from '../notify'
import { fakeDb } from './fakeDb'

const NOW = Date.parse('2026-10-02T12:00:00Z')
const emailed = vi.mocked(sendEmail)
const pushed = vi.mocked(sendPushToUser)

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
})

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
    expect(pushed).toHaveBeenCalledWith('mia', expect.objectContaining({ title: 'Dave Okafor added you to Bermuda Office' }), 'POOL_ACTIVITY')
    expect(emailed).toHaveBeenCalledWith(expect.objectContaining({ to: 'new@person.org' }))
    for (const row of db.tables.crew_invites) expect(row.notified_at).toBe(new Date(NOW).toISOString())
  })
})

describe('exactly once', () => {
  it('a second cron run sends nothing', async () => {
    const db = fakeDb(seed(true, [invite({ invite_id: 'addr', invitee_email: 'new@person.org' })]))
    await runCrewNotices(db.client, NOW)
    expect(await runCrewNotices(db.client, NOW + 900_000)).toMatchObject({ invites: 0 })
    expect(emailed).toHaveBeenCalledTimes(1)
  })
  it('an invite sent at the moment of adding is not sent again by the cron', async () => {
    const db = fakeDb(seed(true, [invite({ invite_id: 'acct', invitee_user_id: 'mia' })]))
    await sendInviteNotice(db.client, 'acct')
    await runCrewNotices(db.client, NOW)
    expect(pushed).toHaveBeenCalledTimes(1)
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
  })
  it('⚠ a failed send is not retried — one missed message beats two (as the seat notices)', async () => {
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
