import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyPaddleSignature,
  parsePaddleSignature,
  DEFAULT_TOLERANCE_SECONDS,
} from '@/lib/paddle/verifySignature'

// Paddle webhook signature verification.
//
// This is the security boundary for the only endpoint that can turn a pool into
// a paying one, and it is the only route in the codebase with no requireAuth().
// If it accepts a forged signature, anyone can grant themselves Pool Ultra.

const SECRET = 'pdl_ntfset_test_secret'
const TS = 1671552777
const BODY = '{"event_id":"evt_test","event_type":"transaction.completed"}'

// Computed independently with OpenSSL, NOT with node:crypto:
//   echo -n '1671552777:{"event_id":"evt_test","event_type":"transaction.completed"}' \
//     | openssl dgst -sha256 -hmac 'pdl_ntfset_test_secret'
//
// Hardcoding a vector from a different implementation is the point. A test that
// signs with the same createHmac call the implementation uses would pass even if
// we were signing the wrong string entirely — it would only prove we are
// self-consistent. This proves the construction `${ts}:${rawBody}` is right.
const KNOWN_GOOD_H1 = '18c74976efe1e50312b078b493fb7a375d1aa7be1221df96f4d135f6ba868469'

const sign = (ts: number, body: string, secret = SECRET) =>
  createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex')

describe('parsePaddleSignature', () => {
  it('parses the documented header format', () => {
    expect(parsePaddleSignature(`ts=${TS};h1=${KNOWN_GOOD_H1}`)).toEqual({
      ts: String(TS),
      h1: KNOWN_GOOD_H1,
    })
  })

  it('does not depend on part order', () => {
    expect(parsePaddleSignature(`h1=${KNOWN_GOOD_H1};ts=${TS}`)).toEqual({
      ts: String(TS),
      h1: KNOWN_GOOD_H1,
    })
  })

  it.each([
    ['empty', ''],
    ['no h1', `ts=${TS}`],
    ['no ts', `h1=${KNOWN_GOOD_H1}`],
    ['non-numeric ts', `ts=abc;h1=${KNOWN_GOOD_H1}`],
    ['non-hex h1', `ts=${TS};h1=zzzz`],
    ['garbage', 'not-a-signature'],
  ])('rejects %s', (_label, header) => {
    expect(parsePaddleSignature(header)).toBeNull()
  })
})

describe('verifyPaddleSignature', () => {
  it('accepts the OpenSSL-computed signature', () => {
    const result = verifyPaddleSignature(
      BODY,
      `ts=${TS};h1=${KNOWN_GOOD_H1}`,
      SECRET,
      { nowSeconds: TS },
    )
    expect(result).toEqual({ ok: true, timestamp: TS })
  })

  it('rejects a tampered body', () => {
    // The exact attack: keep a real signature, swap the payload for one that
    // grants a different pool.
    const tampered = BODY.replace('evt_test', 'evt_evil')
    const result = verifyPaddleSignature(
      tampered,
      `ts=${TS};h1=${KNOWN_GOOD_H1}`,
      SECRET,
      { nowSeconds: TS },
    )
    expect(result).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rejects a signature made with a different secret', () => {
    const forged = sign(TS, BODY, 'pdl_ntfset_wrong')
    const result = verifyPaddleSignature(BODY, `ts=${TS};h1=${forged}`, SECRET, {
      nowSeconds: TS,
    })
    expect(result).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rejects a signature over a different timestamp', () => {
    // Signature is valid for ts+1, but the header claims ts.
    const wrongTs = sign(TS + 1, BODY)
    const result = verifyPaddleSignature(BODY, `ts=${TS};h1=${wrongTs}`, SECRET, {
      nowSeconds: TS,
    })
    expect(result).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rejects a missing header', () => {
    expect(verifyPaddleSignature(BODY, null, SECRET)).toEqual({
      ok: false,
      reason: 'missing_header',
    })
  })

  it('rejects a malformed header', () => {
    expect(verifyPaddleSignature(BODY, 'garbage', SECRET)).toEqual({
      ok: false,
      reason: 'malformed_header',
    })
  })

  it('does not throw when h1 length differs from the digest length', () => {
    // timingSafeEqual throws on length mismatch; the guard must catch it first
    // or a one-character header becomes a 500 instead of a 401.
    expect(() =>
      verifyPaddleSignature(BODY, `ts=${TS};h1=ab`, SECRET, { nowSeconds: TS }),
    ).not.toThrow()
    expect(verifyPaddleSignature(BODY, `ts=${TS};h1=ab`, SECRET, { nowSeconds: TS })).toEqual({
      ok: false,
      reason: 'bad_signature',
    })
  })

  it('accepts uppercase hex', () => {
    const result = verifyPaddleSignature(
      BODY,
      `ts=${TS};h1=${KNOWN_GOOD_H1.toUpperCase()}`,
      SECRET,
      { nowSeconds: TS },
    )
    expect(result).toEqual({ ok: true, timestamp: TS })
  })

  describe('timestamp tolerance', () => {
    it('accepts an event at the edge of the window', () => {
      const result = verifyPaddleSignature(BODY, `ts=${TS};h1=${KNOWN_GOOD_H1}`, SECRET, {
        nowSeconds: TS + DEFAULT_TOLERANCE_SECONDS,
      })
      expect(result.ok).toBe(true)
    })

    it('rejects an event past the window', () => {
      const result = verifyPaddleSignature(BODY, `ts=${TS};h1=${KNOWN_GOOD_H1}`, SECRET, {
        nowSeconds: TS + DEFAULT_TOLERANCE_SECONDS + 1,
      })
      expect(result).toEqual({ ok: false, reason: 'stale' })
    })

    it('tolerates our clock running behind Paddle (future ts)', () => {
      // Clock skew is bidirectional. A 5-second window — Paddle's own SDK
      // default — fails here on any modestly skewed host.
      const result = verifyPaddleSignature(BODY, `ts=${TS};h1=${KNOWN_GOOD_H1}`, SECRET, {
        nowSeconds: TS - 60,
      })
      expect(result.ok).toBe(true)
    })

    it('checks the signature before trusting the timestamp', () => {
      // A forged event with a fresh ts must read as bad_signature, never stale —
      // otherwise the reason leaks which half failed.
      const result = verifyPaddleSignature(BODY, `ts=${TS};h1=${'0'.repeat(64)}`, SECRET, {
        nowSeconds: TS,
      })
      expect(result).toEqual({ ok: false, reason: 'bad_signature' })
    })
  })

  it('is sensitive to whitespace in the body', () => {
    // Guards the raw-body rule: request.json() + JSON.stringify() reformats,
    // and every signature would silently fail in production.
    const reformatted = JSON.stringify(JSON.parse(BODY), null, 2)
    const result = verifyPaddleSignature(
      reformatted,
      `ts=${TS};h1=${KNOWN_GOOD_H1}`,
      SECRET,
      { nowSeconds: TS },
    )
    expect(result).toEqual({ ok: false, reason: 'bad_signature' })
  })
})
