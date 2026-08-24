import { createHmac, timingSafeEqual } from 'node:crypto'

// Paddle webhook signature verification.
//
// Contract read from https://developer.paddle.com/webhooks/signature-verification
// on 2026-08-24, not from memory:
//
//   * Header:    `Paddle-Signature`
//   * Format:    `ts=1671552777;h1=eb4d0dc8853be92b7f...`
//   * Signed:    HMAC-SHA256 over the literal string `${ts}:${rawBody}`
//   * Key:       the notification destination's endpoint secret (`pdl_ntfset_…`)
//   * Raw body:  "Don't transform or process the raw body of the request,
//                including adding whitespace or applying other formatting."
//
// ⚠ THE RAW-BODY RULE IS THE EASIEST THING TO GET WRONG. `await request.json()`
// then `JSON.stringify(...)` produces a byte-identical-looking string that is
// NOT byte-identical — key order and number formatting can both shift — and
// every signature silently fails. The route must call `request.text()` FIRST
// and hand that exact string here.
//
// WHY THIS IS HAND-ROLLED RATHER THAN `paddle.webhooks.unmarshal()`
// The SDK does this correctly, but pulling in @paddle/paddle-node-sdk for one
// HMAC buys a dependency, a version-drift surface, and its own opinion about
// the tolerance window (documented default: 5 seconds — see below). The
// algorithm is fully specified and 30 lines. The typed payload the SDK also
// provides is replaced by the narrow local types in ./transactionCompleted.ts,
// which cover only the handful of fields we actually read.

export type VerifyResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: 'missing_header' | 'malformed_header' | 'bad_signature' | 'stale' }

/**
 * Default tolerance: 5 minutes.
 *
 * Paddle's own SDK defaults to 5 SECONDS, which we deliberately do not copy:
 *
 *  1. Five seconds is inside normal clock-skew range between two hosts. A
 *     server drifting a few seconds rejects every genuine event, and the
 *     failure looks identical to an attack.
 *  2. Paddle retries a failed delivery up to 60 times across 3 days, and the
 *     docs do not state whether a retry is re-signed with a fresh `ts`. If it
 *     is not, a 5-second window rejects every retry — turning one slow response
 *     into permanent loss of that purchase.
 *  3. The thing a tight window protects against is replay, and replay is
 *     already harmless here: `pool_purchases_paddle_txn_key` makes a replayed
 *     transaction a no-op at the database. We are not relying on the clock for
 *     correctness, only for hygiene.
 *
 * So: wide enough to survive skew and retries, narrow enough that a captured
 * signature is not useful indefinitely.
 */
export const DEFAULT_TOLERANCE_SECONDS = 300

/** Parse `ts=…;h1=…`. Order-independent; unknown parts ignored. */
export function parsePaddleSignature(header: string): { ts: string; h1: string } | null {
  const parts = header.split(';')
  let ts: string | undefined
  let h1: string | undefined

  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key === 'ts') ts = value
    else if (key === 'h1') h1 = value
  }

  if (!ts || !h1) return null
  if (!/^\d+$/.test(ts)) return null
  if (!/^[0-9a-f]+$/i.test(h1)) return null
  return { ts, h1 }
}

/**
 * Verify a Paddle webhook.
 *
 * @param rawBody   the request body EXACTLY as received (request.text())
 * @param header    the `Paddle-Signature` header value
 * @param secret    the notification destination endpoint secret (`pdl_ntfset_…`)
 * @param nowSeconds injectable clock, for tests
 */
export function verifyPaddleSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  {
    toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
    nowSeconds = Math.floor(Date.now() / 1000),
  }: { toleranceSeconds?: number; nowSeconds?: number } = {},
): VerifyResult {
  if (!header) return { ok: false, reason: 'missing_header' }

  const parsed = parsePaddleSignature(header)
  if (!parsed) return { ok: false, reason: 'malformed_header' }

  const expected = createHmac('sha256', secret)
    .update(`${parsed.ts}:${rawBody}`)
    .digest('hex')

  // Constant-time compare. A plain `===` leaks how many leading characters
  // matched via timing, which is enough to forge a signature byte by byte.
  // timingSafeEqual throws on length mismatch, so that is checked first — and
  // the length itself is not a secret.
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(parsed.h1.toLowerCase(), 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' }
  }

  // Signature is genuine; only now is the timestamp worth trusting.
  const ts = Number(parsed.ts)
  if (Math.abs(nowSeconds - ts) > toleranceSeconds) {
    return { ok: false, reason: 'stale' }
  }

  return { ok: true, timestamp: ts }
}
