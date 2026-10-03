// The crew messages (lib/crews/notify.ts): the copy, and who is due what. The copy tests are rules,
// not snapshots — the things the decisions say a message must and must never do.

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/push/apns', () => ({ sendPushToUser: vi.fn() }))
vi.mock('@/lib/email/topics', () => ({ TOPICS: { POOL_ACTIVITY: 'topic-pool-activity' } }))

import {
  dueNotice,
  dueReminder,
  inviteLinkUrl,
  invitePreview,
  inviteToAccountCopy,
  inviteToEmailCopy,
  seatNoticeCopy,
  seatReminderCopy,
  untilLock,
  type SeatRow,
} from '../notify'

const NOW = Date.parse('2026-10-02T12:00:00Z')
const H = 3_600_000
const seatInput = {
  crewName: 'Friday Five-a-side',
  competition: 'Champions League 2026/27',
  mode: "Pick'em",
  poolCode: 'AB12CD',
  firstLockAt: new Date(NOW + 3 * 24 * H).toISOString(),
}
const allText = (m: { push: { title: string; body: string }; email: { subject: string; html: string } }) =>
  [m.push.title, m.push.body, m.email.subject, m.email.html].join('\n')

describe('lock times are relative — an email cannot know the reader’s timezone', () => {
  it('reads naturally at every distance', () => {
    expect(untilLock(new Date(NOW + 30 * 60_000).toISOString(), NOW)).toBe('within the hour')
    expect(untilLock(new Date(NOW + 5 * H).toISOString(), NOW)).toBe('in 5 hours')
    expect(untilLock(new Date(NOW + 24 * H).toISOString(), NOW)).toBe('in about a day')
    expect(untilLock(new Date(NOW + 3 * 24 * H).toISOString(), NOW)).toBe('in 3 days')
  })
})

describe('the seat notice and the one reminder', () => {
  it('never name the captain — they come from SportPool', () => {
    for (const m of [seatNoticeCopy(seatInput, NOW), seatReminderCopy(seatInput, NOW)]) {
      expect(allText(m)).not.toMatch(/captain|asked us/i)
    }
  })
  it('the notice says the spot goes quietly, nobody is told, and there is ONE reminder', () => {
    const html = seatNoticeCopy(seatInput, NOW).email.html
    expect(html).toContain('quietly goes when picks lock')
    expect(html).toContain('Nobody’s told either way')
    expect(html).toContain('We’ll remind you once')
  })
  it('the reminder says it is the only one', () => {
    expect(seatReminderCopy(seatInput, NOW).email.html).toContain('the only reminder we’ll send')
  })
  it("“Take your spot” is the ordinary join link, which takes the seat", () => {
    expect(seatNoticeCopy(seatInput, NOW).email.html).toContain('/join/AB12CD')
  })
  it('escapes a crew name that looks like HTML', () => {
    expect(seatNoticeCopy({ ...seatInput, crewName: '<b>Lads</b>' }, NOW).email.html).toContain('&lt;b&gt;Lads&lt;/b&gt;')
  })
})

describe('the invite names who asked — once', () => {
  const input = { inviter: 'Dave Okafor', crewName: 'Bermuda Office', people: 14 }
  it('to an account: who asked, how to answer, and that it is the only email', () => {
    const m = inviteToAccountCopy(input)
    expect(m.push.title).toBe('Dave Okafor added you to Bermuda Office')
    expect(m.email.html).toContain('Dave Okafor asked us to add you')
    expect(m.email.html).toContain('No thanks')
    expect(m.email.html).toContain('the only email about this invite')
  })
  it('to an account: the button lands where the invite can be answered, not the marketing page', () => {
    expect(inviteToAccountCopy(input).email.html).toMatch(/href="[^"]*\/dashboard"/)
  })
  const TOKEN = 'A'.repeat(43)
  const emailInput = { ...input, inviteUrl: inviteLinkUrl(TOKEN) }
  it('to an address with no account: the button is the one-time link, and the link is ONLY a token', () => {
    const m = inviteToEmailCopy(emailInput)
    expect(m.subject).toBe('Dave Okafor asked us to invite you to Bermuda Office')
    expect(m.html).toContain(`href="${inviteLinkUrl(TOKEN)}"`)
    expect(m.html).toContain('we won’t email you about it again')
  })
  it('⚠ the token rides in the fragment — never the path or query, which servers and analytics record', () => {
    const url = new URL(inviteLinkUrl(TOKEN))
    expect(url.pathname).toBe('/crew-invite')
    expect(url.search).toBe('')
    expect(url.hash).toBe(`#${TOKEN}`)
  })
  it('⚠ says to use the BUTTON — not “sign up with this email address”, which proves nothing (R36)', () => {
    const html = inviteToEmailCopy(emailInput).html
    expect(html).toContain('Use the button below to sign up')
    expect(html).not.toContain('with this email address')
  })
  it('the captain is shown the email’s own first line before pressing Invite', () => {
    expect(invitePreview(input)).toBe('Dave Okafor asked us to invite you to Bermuda Office on SportPool…')
    expect(inviteToEmailCopy({ ...input, inviteUrl: 'https://x/crew-invite#t' }).html).toContain('Dave Okafor asked us to invite you to <strong>Bermuda Office</strong> on SportPool')
  })
})

describe('our voice is plural — never “I”', () => {
  it('no first-person singular in any crew message', () => {
    const input = { inviter: 'Dave', crewName: 'Bermuda Office', people: 14 }
    const texts = [
      allText(seatNoticeCopy(seatInput, NOW)),
      allText(seatReminderCopy(seatInput, NOW)),
      allText(inviteToAccountCopy(input)),
      inviteToEmailCopy({ ...input, inviteUrl: 'https://x/crew-invite#t' }).subject + inviteToEmailCopy({ ...input, inviteUrl: 'https://x/crew-invite#t' }).html,
    ]
    for (const t of texts) {
      const prose = t.replace(/<[^>]+>/g, ' ')
      expect(prose).not.toMatch(/\b(I|I’m|I've|I’ve|I'd|I’d|me|my)\b/)
    }
  })
})

describe('who is due what', () => {
  const seat = (o: Partial<SeatRow> = {}): SeatRow => ({ pool_id: 'p', user_id: 'u', resolution: null, notified_at: null, reminded_at: null, ...o })
  const lockIn = (h: number) => new Date(NOW + h * H).toISOString()

  it('a notice: open, untold, before the lock', () => {
    expect(dueNotice(seat(), lockIn(72), NOW)).toBe(true)
    expect(dueNotice(seat({ notified_at: 'x' }), lockIn(72), NOW)).toBe(false)
    expect(dueNotice(seat({ resolution: 'taken' }), lockIn(72), NOW)).toBe(false)
    expect(dueNotice(seat(), lockIn(-1), NOW)).toBe(false)
    expect(dueNotice(seat(), null, NOW)).toBe(false)
  })
  it('the one reminder: within a day of the lock, told, still open, not yet reminded', () => {
    const told = new Date(NOW - 48 * H).toISOString()
    expect(dueReminder(seat({ notified_at: told }), lockIn(20), NOW)).toBe(true)
    expect(dueReminder(seat({ notified_at: told }), lockIn(30), NOW)).toBe(false)
    expect(dueReminder(seat({ notified_at: told, reminded_at: 'x' }), lockIn(20), NOW)).toBe(false)
    expect(dueReminder(seat({ notified_at: told, resolution: 'declined' }), lockIn(20), NOW)).toBe(false)
    expect(dueReminder(seat(), lockIn(20), NOW)).toBe(false)
    expect(dueReminder(seat({ notified_at: told }), lockIn(-1), NOW)).toBe(false)
  })
  it('a notice sent inside the window already said "about a day" — no reminder right after it', () => {
    expect(dueReminder(seat({ notified_at: new Date(NOW - 2 * H).toISOString() }), lockIn(20), NOW)).toBe(false)
  })
})

describe('the app shows the captain the same first line the email will carry', () => {
  it('mobile/lib/crews.invitePreviewText mirrors invitePreview word for word', async () => {
    // Mobile is a separate project and cannot import this module, so it keeps a copy. This is the
    // test that fails the day the two drift.
    const { invitePreviewText } = await import('../../../mobile/lib/crews')
    expect(invitePreviewText('Dave Okafor', 'Bermuda Office')).toBe(invitePreview({ inviter: 'Dave Okafor', crewName: 'Bermuda Office' }))
  })
})
