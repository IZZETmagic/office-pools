import { describe, it, expect, beforeAll } from 'vitest'
import { Webhook } from 'svix'
import { verifyResendWebhook } from './resendWebhook'

// These sign a REAL payload with Svix — the scheme Resend uses — and push it
// through the exact function the webhook route calls. That is what catches
// the failure a mocked verify never would: the right headers not reaching it.

const SECRET = 'whsec_' + Buffer.from('sportpool-test-secret-0123456789').toString('base64')
const BODY = JSON.stringify({
  type: 'contact.topics.updated',
  created_at: '2026-10-05T12:00:00.000Z',
  data: { email: 'member@example.com', topics: [{ id: 't-match', subscription: 'opt_out' }] },
})

const signed = (body: string, opts: { secret?: string; at?: Date; id?: string } = {}) => {
  const at = opts.at ?? new Date()
  const id = opts.id ?? 'msg_test_1'
  const signature = new Webhook(opts.secret ?? SECRET).sign(id, at, body)
  return new Headers({
    'svix-id': id,
    'svix-timestamp': String(Math.floor(at.getTime() / 1000)),
    'svix-signature': signature,
  })
}

beforeAll(() => {
  // getResendClient needs a key to construct; verifying never calls Resend.
  process.env.RESEND_API_KEY ??= 're_test_not_a_real_key'
})

describe('verifyResendWebhook', () => {
  it('accepts a correctly signed body and returns the event', () => {
    const event = verifyResendWebhook(BODY, signed(BODY), SECRET) as { type: string }
    expect(event.type).toBe('contact.topics.updated')
  })
  it('rejects a body changed after signing — the signature covers the raw bytes', () => {
    const tampered = BODY.replace('opt_out', 'opt_in')
    expect(() => verifyResendWebhook(tampered, signed(BODY), SECRET)).toThrow()
  })
  it('rejects a body signed with a different secret', () => {
    const other = 'whsec_' + Buffer.from('somebody-else-entirely-0123456').toString('base64')
    expect(() => verifyResendWebhook(BODY, signed(BODY, { secret: other }), SECRET)).toThrow()
  })
  it('rejects a request with the svix headers missing', () => {
    expect(() => verifyResendWebhook(BODY, new Headers(), SECRET)).toThrow(/Missing/)
  })
  it('rejects a replay — a correctly signed request an hour old', () => {
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    expect(() => verifyResendWebhook(BODY, signed(BODY, { at: anHourAgo }), SECRET)).toThrow()
  })
})
