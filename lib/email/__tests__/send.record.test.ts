// The email transport's delivery record (lib/email/send.ts, migration 176). Pinned: one row per
// address with Resend's id; the final outcome only (a retry that succeeds is one 'sent' row, not
// a failure and a success); a batch is recorded in the order Resend answered, and a batch that
// falls back to single sends is recorded once, not twice; the outbox's keyed send records its row
// and a replayed key records nothing — that email went, and was recorded, the first time.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const resend = vi.hoisted(() => ({ send: vi.fn(), batch: vi.fn() }))
vi.mock('../resend', () => ({ getResendClient: () => ({ emails: { send: resend.send }, batch: { send: resend.batch } }) }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => { throw new Error('no database in tests') } }))
vi.mock('@/lib/notifications/deliveries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notifications/deliveries')>()),
  recordDeliveries: vi.fn(async () => undefined),
}))

import { sendBatchEmails, sendEmail, sendKeyedEmail } from '../send'
import { recordDeliveries } from '@/lib/notifications/deliveries'

const recorded = vi.mocked(recordDeliveries)
const rows = () => recorded.mock.calls.flatMap((c) => c[0])
const MAIL = { subject: 'Hello', html: '<p>Hi</p>' }
const refused = { name: 'validation_error', message: 'Invalid `to` field' }

beforeEach(() => {
  resend.send.mockReset()
  resend.batch.mockReset()
  recorded.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('sendEmail', () => {
  it('one address: one row, with Resend\'s id and who it was for', async () => {
    resend.send.mockResolvedValue({ data: { id: 'em_1' }, error: null })
    await sendEmail({ ...MAIL, to: 'mia@example.com', kind: 'deadline_changed', userId: 'u1', poolId: 'p1' })
    expect(rows()).toEqual([{
      kind: 'deadline_changed', channel: 'email', provider: 'resend', status: 'sent', userId: 'u1',
      address: 'mia@example.com', poolId: 'p1', outboxId: null, providerId: 'em_1', error: null,
    }])
  })

  it('two addresses on one email: a row each, and no user — it belongs to neither alone', async () => {
    resend.send.mockResolvedValue({ data: { id: 'em_2' }, error: null })
    await sendEmail({ ...MAIL, to: ['a@example.com', 'b@example.com'], userId: 'u1' })
    expect(rows().map((r) => [r.address, r.userId, r.providerId, r.kind])).toEqual([
      ['a@example.com', null, 'em_2', null],
      ['b@example.com', null, 'em_2', null],
    ])
  })

  it('refused twice: one failed row, saying why', async () => {
    resend.send.mockResolvedValue({ data: null, error: refused })
    const res = await sendEmail({ ...MAIL, to: 'mia@example.com' })
    expect(res.success).toBe(false)
    expect(rows()).toEqual([expect.objectContaining({ status: 'failed', providerId: null, error: 'validation_error: Invalid `to` field' })])
  })

  it('refused once, then sent: one row, sent — the final outcome only', async () => {
    resend.send.mockResolvedValueOnce({ data: null, error: refused }).mockResolvedValueOnce({ data: { id: 'em_3' }, error: null })
    await sendEmail({ ...MAIL, to: 'mia@example.com' })
    expect(rows()).toEqual([expect.objectContaining({ status: 'sent', providerId: 'em_3' })])
  })
})

describe('sendBatchEmails', () => {
  it('records each email with the id Resend gave it, in order', async () => {
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

  it('a refused batch falls back to single sends, each recorded once', async () => {
    resend.batch.mockResolvedValue({ data: null, error: refused })
    resend.send.mockResolvedValueOnce({ data: { id: 'em_x' }, error: null }).mockResolvedValueOnce({ data: { id: 'em_y' }, error: null })
    await sendBatchEmails([{ ...MAIL, to: 'a@example.com', userId: 'ua' }, { ...MAIL, to: 'b@example.com', userId: 'ub' }])
    expect(rows().map((r) => [r.userId, r.providerId])).toEqual([['ua', 'em_x'], ['ub', 'em_y']])
  })
})

describe('sendKeyedEmail — the outbox\'s sender', () => {
  const email = { ...MAIL, to: 'mia@example.com', kind: 'pool_countdown' as const, userId: 'u1', poolId: 'p1', outboxId: 77 }

  it('sends under the key, and records the row with the outbox id', async () => {
    resend.send.mockResolvedValue({ data: { id: 'em_k' }, error: null })
    expect(await sendKeyedEmail(email, 'outbox/77/countdown')).toEqual({ ok: true, replay: false })
    expect(resend.send.mock.calls[0][1]).toEqual({ idempotencyKey: 'outbox/77/countdown' })
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
})
