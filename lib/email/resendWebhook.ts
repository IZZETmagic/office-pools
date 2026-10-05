import { getResendClient } from './resend'

/**
 * Verify a Resend webhook from the request's own headers. Returns the parsed
 * event, or THROWS if it does not verify.
 *
 * ⚠ The SDK's `headers` is NOT the web `Headers` — it is Resend's own
 * `{ id, timestamp, signature }`, which it maps onto svix-id, svix-timestamp
 * and svix-signature. Passing `request.headers` straight through sends
 * `undefined` for all three, so every genuine webhook is rejected as a bad
 * signature, silently. The type checker caught it on 2026-10-05; the test
 * beside this signs a real payload so the behaviour is pinned too.
 *
 * `raw` must be the body exactly as received — the signature covers the bytes.
 */
export function verifyResendWebhook(
  raw: string,
  headers: { get(name: string): string | null },
  secret: string,
): unknown {
  const id = headers.get('svix-id')
  const timestamp = headers.get('svix-timestamp')
  const signature = headers.get('svix-signature')
  if (!id || !timestamp || !signature) throw new Error('Missing svix-id, svix-timestamp or svix-signature')
  return getResendClient().webhooks.verify({
    payload: raw,
    headers: { id, timestamp, signature },
    webhookSecret: secret,
  })
}
