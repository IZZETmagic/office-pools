// The email transport (lib/email/send.ts), N4. Pinned:
//   * every email names its kind: the Resend topic is the kind's switch, an always-delivered kind
//     has none, and a kind that is not live — or an Achievements notice — is refused before
//     anything is read or sent;
//   * a member whose switch is off is not emailed, and not recorded; a failed switch read sends
//     nothing; an always-delivered kind is never checked;
//   * the delivery record: one row per address with Resend's id, the final outcome only; a batch
//     is recorded in Resend's order, split into Resend's 100s, and a refused batch falls back to
//     single sends recorded once; the outbox's keyed send records its row, and a replayed key
//     records nothing;
//   * sendInternalEmail writes only to SportPool's own addresses.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const resend = vi.hoisted(() => ({ send: vi.fn(), batch: vi.fn() }))
const prefs = vi.hoisted(() => ({ off: [] as Array<{ user_id: string; category: string }>, error: null as string | null, reads: [] as string[] }))

vi.mock('../resend', () => ({ getResendClient: () => ({ emails: { send: resend.send }, batch: { send: resend.batch } }) }))
vi.mock('../topics', () => ({
  TOPICS: { POOL_ACTIVITY: 't-pool', PREDICTIONS: 't-pred', MATCH_RESULTS: 't-results', LEADERBOARD: 't-lb', ADMIN: 't-admin', COMMUNITY: 't-community', NEWS: 't-news' },
  TOPIC_KEYS: ['POOL_ACTIVITY', 'PREDICTIONS', 'MATCH_RESULTS', 'LEADERBOARD', 'ADMIN', 'COMMUNITY', 'NEWS'],
}))
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'notification_preferences') throw new Error(`unexpected table ${table}`)
      let ids: string[] = []
      let category = ''
      const q = {
        select: () => q,
        in: (_c: string, v: string[]) => { ids = v; return q },
        eq: (c: string, v: unknown) => { if (c === 'category') category = String(v); return q },
        then: (resolve: (r: unknown) => unknown) => {
          prefs.reads.push(category)
          if (prefs.error) return resolve({ data: null, error: { message: prefs.error } })
          return resolve({ data: prefs.off.filter((o) => o.category === category && ids.includes(o.user_id)), error: null })
        },
      }
      return q
    },
  }),
}))
vi.mock('@/lib/notifications/deliveries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notifications/deliveries')>()),
  recordDeliveries: vi.fn(async () => undefined),
}))

import { isInternalAddress, sendBatchEmails, sendEmail, sendInternalEmail, sendKeyedEmail } from '../send'
import { recordDeliveries } from '@/lib/notifications/deliveries'

const recorded = vi.mocked(recordDeliveries)
const rows = () => recorded.mock.calls.flatMap((c) => c[0])
const sentPayloads = () => resend.send.mock.calls.map((c) => c[0] as { to: string[]; topicId?: string })
const MAIL = { subject: 'Hello', html: '<p>Hi</p>' }
const refused = { name: 'validation_error', message: 'Invalid `to` field' }
const ok = (id: string) => ({ data: { id }, error: null })

beforeEach(() => {
  resend.send.mockReset()
  resend.batch.mockReset()
  recorded.mockClear()
  prefs.off = []
  prefs.error = null
  prefs.reads = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('every email names its kind', () => {
  it('the topic is the kind\'s switch — never the caller\'s', async () => {
    resend.send.mockResolvedValue(ok('em_1'))
    await sendEmail({ ...MAIL, to: 'mia@example.com', kind: 'round_open', userId: 'u1' })
    expect(sentPayloads()[0].topicId).toBe('t-pred')
  })

  it('an always-delivered kind has no topic and no switch read — no unsubscribe can swallow it', async () => {
    prefs.off = [{ user_id: 'u1', category: 'ADMIN' }]
    resend.send.mockResolvedValue(ok('em_1'))
    const res = await sendEmail({ ...MAIL, to: 'mia@example.com', kind: 'direct_email', userId: 'u1' })
    expect(res.success).toBe(true)
    expect(sentPayloads()[0].topicId).toBeUndefined()
    expect(prefs.reads).toEqual([])
  })

  it('a kind that is not live is refused before anything is read or sent', async () => {
    await expect(sendEmail({ ...MAIL, to: 'mia@example.com', kind: 'duel_drawn', userId: 'u1' })).rejects.toThrow('duel_drawn is planned, not live')
    await expect(sendBatchEmails([{ ...MAIL, to: 'a@example.com', kind: 'lms_survived' }])).rejects.toThrow('not live')
    expect(prefs.reads).toEqual([])
    expect(resend.send).not.toHaveBeenCalled()
    expect(resend.batch).not.toHaveBeenCalled()
  })

  it('an Achievements notice is never emailed', async () => {
    await expect(sendEmail({ ...MAIL, to: 'mia@example.com', kind: 'badge_unlocked' })).rejects.toThrow('never emailed')
  })

  it('an email without a kind does not compile', () => {
    // @ts-expect-error — the kind is required: no email can skip a member's switch
    const withoutKind = () => sendEmail({ ...MAIL, to: 'mia@example.com' })
    // @ts-expect-error — and the caller cannot pick a topic any more
    const withTopic = () => sendEmail({ ...MAIL, to: 'mia@example.com', kind: 'round_open', topicId: 't-admin' })
    expect([withoutKind, withTopic]).toHaveLength(2)
  })
})

describe('the member\'s switch', () => {
  it('switched off: not sent, not recorded', async () => {
    prefs.off = [{ user_id: 'u1', category: 'PREDICTIONS' }]
    const res = await sendEmail({ ...MAIL, to: 'mia@example.com', kind: 'round_open', userId: 'u1' })
    expect(res).toEqual({ success: false, skipped: 'switched_off' })
    expect(resend.send).not.toHaveBeenCalled()
    expect(recorded).not.toHaveBeenCalled()
  })

  it('off under another switch: sent', async () => {
    prefs.off = [{ user_id: 'u1', category: 'COMMUNITY' }]
    resend.send.mockResolvedValue(ok('em_1'))
    expect((await sendEmail({ ...MAIL, to: 'mia@example.com', kind: 'round_open', userId: 'u1' })).success).toBe(true)
  })

  it('a failed switch read sends nothing — never "nobody opted out"', async () => {
    prefs.error = 'connection reset'
    await expect(sendEmail({ ...MAIL, to: 'mia@example.com', kind: 'round_open', userId: 'u1' })).rejects.toThrow('preference read failed')
    expect(resend.send).not.toHaveBeenCalled()
  })

  it('a batch leaves out who switched off, reading each switch once', async () => {
    prefs.off = [{ user_id: 'ub', category: 'NEWS' }]
    resend.batch.mockResolvedValue({ data: { data: [{ id: 'em_a' }, { id: 'em_c' }] }, error: null })
    const res = await sendBatchEmails([
      { ...MAIL, to: 'a@example.com', kind: 'sportpool_news', userId: 'ua' },
      { ...MAIL, to: 'b@example.com', kind: 'sportpool_news', userId: 'ub' },
      { ...MAIL, to: 'c@example.com', kind: 'sportpool_news', userId: 'uc' },
    ])
    expect(prefs.reads).toEqual(['NEWS'])
    const batch = resend.batch.mock.calls[0][0] as Array<{ to: string[]; topicId?: string }>
    expect(batch.map((e) => e.to[0])).toEqual(['a@example.com', 'c@example.com'])
    expect(batch.every((e) => e.topicId === 't-news')).toBe(true)
    expect(res).toEqual({ success: true, data: { sentCount: 2, skipped: 1, total: 3 } })
    expect(rows().map((r) => [r.userId, r.providerId])).toEqual([['ua', 'em_a'], ['uc', 'em_c']])
  })
})

describe('the delivery record', () => {
  it('one address: one row, with Resend\'s id and who it was for', async () => {
    resend.send.mockResolvedValue(ok('em_1'))
    await sendEmail({ ...MAIL, to: 'mia@example.com', kind: 'deadline_changed', userId: 'u1', poolId: 'p1' })
    expect(rows()).toEqual([{
      kind: 'deadline_changed', channel: 'email', provider: 'resend', status: 'sent', userId: 'u1',
      address: 'mia@example.com', poolId: 'p1', outboxId: null, providerId: 'em_1', error: null,
    }])
  })

  it('two addresses on one email: a row each, and no user — it belongs to neither alone', async () => {
    resend.send.mockResolvedValue(ok('em_2'))
    await sendEmail({ ...MAIL, to: ['a@example.com', 'b@example.com'], kind: 'direct_email', userId: 'u1' })
    expect(rows().map((r) => [r.address, r.userId, r.providerId])).toEqual([
      ['a@example.com', null, 'em_2'],
      ['b@example.com', null, 'em_2'],
    ])
  })

  it('refused twice: one failed row, saying why', async () => {
    resend.send.mockResolvedValue({ data: null, error: refused })
    const res = await sendEmail({ ...MAIL, to: 'mia@example.com', kind: 'direct_email' })
    expect(res.success).toBe(false)
    expect(rows()).toEqual([expect.objectContaining({ status: 'failed', providerId: null, error: 'validation_error: Invalid `to` field' })])
  })

  it('refused once, then sent: one row, sent — the final outcome only', async () => {
    resend.send.mockResolvedValueOnce({ data: null, error: refused }).mockResolvedValueOnce(ok('em_3'))
    await sendEmail({ ...MAIL, to: 'mia@example.com', kind: 'direct_email' })
    expect(rows()).toEqual([expect.objectContaining({ status: 'sent', providerId: 'em_3' })])
  })

  it('a batch is recorded in the order Resend answered', async () => {
    resend.batch.mockResolvedValue({ data: { data: [{ id: 'em_a' }, { id: 'em_b' }] }, error: null })
    await sendBatchEmails([
      { ...MAIL, to: 'a@example.com', kind: 'matchweek_opened', userId: 'ua', poolId: 'p1' },
      { ...MAIL, to: 'b@example.com', kind: 'matchweek_opened', userId: 'ub', poolId: 'p1' },
    ])
    expect(rows().map((r) => [r.userId, r.providerId, r.status, r.kind])).toEqual([
      ['ua', 'em_a', 'sent', 'matchweek_opened'],
      ['ub', 'em_b', 'sent', 'matchweek_opened'],
    ])
  })

  it('a batch over 100 is split into Resend\'s 100s', async () => {
    resend.batch.mockImplementation(async (chunk: unknown[]) => ({ data: { data: chunk.map((_, i) => ({ id: `em_${i}` })) }, error: null }))
    const emails = Array.from({ length: 230 }, (_, i) => ({ ...MAIL, to: `m${i}@example.com`, kind: 'direct_email' as const }))
    const res = await sendBatchEmails(emails)
    expect(resend.batch.mock.calls.map((c) => (c[0] as unknown[]).length)).toEqual([100, 100, 30])
    expect(res).toMatchObject({ success: true, data: { sentCount: 230 } })
  })

  it('a refused batch falls back to single sends, each recorded once', async () => {
    resend.batch.mockResolvedValue({ data: null, error: refused })
    resend.send.mockResolvedValueOnce(ok('em_x')).mockResolvedValueOnce(ok('em_y'))
    await sendBatchEmails([
      { ...MAIL, to: 'a@example.com', kind: 'direct_email', userId: 'ua' },
      { ...MAIL, to: 'b@example.com', kind: 'direct_email', userId: 'ub' },
    ])
    expect(rows().map((r) => [r.userId, r.providerId])).toEqual([['ua', 'em_x'], ['ub', 'em_y']])
  })
})

describe('sendKeyedEmail — the outbox\'s sender', () => {
  const email = { ...MAIL, to: 'mia@example.com', kind: 'pool_countdown' as const, userId: 'u1', poolId: 'p1', outboxId: 77 }

  it('sends under the key, with the kind\'s topic, and records the row with the outbox id', async () => {
    resend.send.mockResolvedValue(ok('em_k'))
    expect(await sendKeyedEmail(email, 'outbox/77/countdown')).toEqual({ ok: true, replay: false })
    expect(resend.send.mock.calls[0][1]).toEqual({ idempotencyKey: 'outbox/77/countdown' })
    expect(sentPayloads()[0].topicId).toBe('t-pred')
    expect(rows()).toEqual([expect.objectContaining({ status: 'sent', providerId: 'em_k', outboxId: 77, userId: 'u1', kind: 'pool_countdown' })])
  })

  it('a replayed key went the first time: sent, and nothing recorded again', async () => {
    resend.send.mockResolvedValue({ data: null, error: { name: 'invalid_idempotent_request', message: 'key reused' } })
    expect(await sendKeyedEmail(email, 'outbox/77/countdown')).toEqual({ ok: true, replay: true })
    expect(recorded).not.toHaveBeenCalled()
  })

  it('a refusal is recorded as failed, and returned for the outbox to retry', async () => {
    resend.send.mockResolvedValue({ data: null, error: { name: 'rate_limit_exceeded', message: 'Too many requests' } })
    expect(await sendKeyedEmail(email, 'k')).toEqual({ ok: false, error: 'rate_limit_exceeded: Too many requests' })
    expect(rows()).toEqual([expect.objectContaining({ status: 'failed', outboxId: 77, error: 'rate_limit_exceeded: Too many requests' })])
  })

  it('a kind retired since it was queued fails the row — it does not throw out of the run', async () => {
    const res = await sendKeyedEmail({ ...email, kind: 'duel_result' }, 'k')
    expect(res).toEqual({ ok: false, error: expect.stringContaining('not live') })
    expect(resend.send).not.toHaveBeenCalled()
  })
})

describe('sendInternalEmail — our own inbox only', () => {
  it('writes to SportPool, recorded with no kind and no member', async () => {
    resend.send.mockResolvedValue(ok('em_in'))
    await sendInternalEmail({ ...MAIL, to: 'support@sportpool.io' })
    expect(sentPayloads()[0].topicId).toBeUndefined()
    expect(rows()).toEqual([expect.objectContaining({ kind: null, userId: null, address: 'support@sportpool.io' })])
  })

  it('refuses a member\'s address — nothing is sent', async () => {
    await expect(sendInternalEmail({ ...MAIL, to: 'mia@example.com' })).rejects.toThrow('only writes to SportPool')
    expect(resend.send).not.toHaveBeenCalled()
  })

  it('also allows the one alert address we configure ourselves', () => {
    vi.stubEnv('REPORT_ALERT_EMAIL', 'Alerts@Example.org')
    expect(isInternalAddress('alerts@example.org')).toBe(true)
    expect(isInternalAddress('someone-else@example.org')).toBe(false)
    vi.unstubAllEnvs()
  })
})
