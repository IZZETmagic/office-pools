import { createAdminClient } from '@/lib/supabase/server'
import http2 from 'node:http2'

import { recordDeliveries, type Delivery, type DeliveryContext } from '@/lib/notifications/deliveries'
import { NOTIFICATION_TYPES, type NotificationTypeKey } from '@/lib/notifications/registry'
import { PUSH_CATEGORY_COLUMNS, type PushCategory } from './categories'
import { sendExpoPushNotification, type PushAttempt } from './expo-push'

// =============================================================
// APNs HTTP/2 Push Notification Client
// Uses JWT (ES256) via Web Crypto API — no extra dependencies.
// APNs REQUIRES HTTP/2 — uses Node.js built-in http2 module.
// =============================================================

const APNS_KEY_ID = process.env.APNS_KEY_ID!
const APNS_TEAM_ID = process.env.APNS_TEAM_ID!
const APNS_PRIVATE_KEY = process.env.APNS_PRIVATE_KEY! // .p8 file contents
const BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'com.officepools.app'

// Cache the JWT for reuse (valid for 1 hour, refresh at 50 min)
let cachedToken: { jwt: string; expiresAt: number } | null = null

/**
 * Generate an APNs JWT using Web Crypto (ES256).
 * The .p8 key is a PEM-encoded PKCS#8 EC private key.
 */
async function generateAPNsJWT(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  // Return cached token if still valid
  if (cachedToken && now < cachedToken.expiresAt) {
    return cachedToken.jwt
  }

  // Parse PEM → DER
  const pemBody = APNS_PRIVATE_KEY
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))

  // Import the key
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  // Build JWT header + payload
  const header = { alg: 'ES256', kid: APNS_KEY_ID }
  const payload = { iss: APNS_TEAM_ID, iat: now }

  const encode = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

  const headerB64 = encode(header)
  const payloadB64 = encode(payload)
  const signingInput = `${headerB64}.${payloadB64}`

  // Sign with ECDSA P-256
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  )

  // Convert DER signature to raw r||s format for JWT
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const jwt = `${signingInput}.${sigB64}`

  // Cache for 50 minutes (token valid for 1 hour)
  cachedToken = { jwt, expiresAt: now + 50 * 60 }

  return jwt
}

type PushPayload = {
  title: string
  body: string
  data?: Record<string, string>
  // Per-recipient iOS app icon badge count. Populated by sendPushToUser
  // (which computes the user's unread message count via the
  // get_user_unread_message_count RPC) before dispatching. If undefined,
  // sendPushNotification OMITS the badge field from the APNs payload so
  // iOS leaves the current badge value alone — important for broadcasts
  // and any path that doesn't know the recipient user_id.
  //
  // Why per-recipient and not hard-coded `badge: 1` like before: a hard
  // 1 set the badge on every push and was never cleared, so phones got
  // stuck at "1" forever. Sending the actual count means the badge
  // mirrors reality (and naturally drops to 0 when the user reads
  // everything, since iOS clears the badge on `badge: 0`).
  badge?: number
}

/**
 * Send a push notification to a single device token via HTTP/2.
 * APNs requires HTTP/2 — Node.js fetch only does HTTP/1.1.
 * Returns the attempt: whether APNs took it, its `apns-id`, and APNs's reason
 * when it refused — the delivery record keeps all three.
 *
 * `bundleId` overrides the global APNS_BUNDLE_ID — required for routing pushes
 * to a different binary (e.g. Swift app vs Expo app share an Apple team but
 * have separate bundle IDs). When null/undefined, falls back to env default.
 */
export async function sendPushNotification(
  deviceToken: string,
  payload: PushPayload,
  sandbox = false,
  bundleId?: string | null
): Promise<PushAttempt> {
  try {
    const jwt = await generateAPNsJWT()
    const host = sandbox ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'
    const topic = bundleId ?? BUNDLE_ID

    // Only include `badge` in the APNs payload when the caller has
    // computed it (per-recipient unread count). When omitted, iOS leaves
    // the current badge value untouched — the right default for any
    // code path that can't know the recipient (broadcasts, etc.).
    const aps: Record<string, unknown> = {
      alert: { title: payload.title, body: payload.body },
      sound: 'default',
    }
    if (typeof payload.badge === 'number') {
      aps.badge = payload.badge
    }
    // expo-notifications on iOS populates the in-app
    // `notification.request.content.data` field from userInfo["body"]
    // — NOT from the top level of the APNs payload. If we spread our
    // custom { type, pool_id, ... } into userInfo's root (alongside
    // `aps`), expo-notifications can't see them and content.data
    // ends up null on the device, breaking every push deep-link.
    //
    // Nesting payload.data under a "body" key so the SDK picks it up.
    // The Swift app (pre-Expo) reads userInfo directly so it was fine
    // either way — we noticed this only after the Expo dev client
    // started consuming pushes.
    const requestBody = JSON.stringify({
      aps,
      body: payload.data ?? {},
    })

    console.log(`[APNs] Sending to ${host}, token ${deviceToken.slice(0, 8)}..., topic=${topic}, sandbox=${sandbox}`)

    const { statusCode, responseBody, apnsId } = await sendHTTP2Request(host, deviceToken, jwt, requestBody, topic)

    if (statusCode === 200) {
      console.log(`[APNs] Success for token ${deviceToken.slice(0, 8)}...`)
      return { ok: true, providerId: apnsId, error: null }
    }

    console.error(`[APNs] Error ${statusCode} for token ${deviceToken.slice(0, 8)}...: ${responseBody}`)

    // 410 Gone = token is no longer valid, clean it up
    if (statusCode === 410) {
      await removeInvalidToken(deviceToken)
    }

    return { ok: false, providerId: apnsId, error: `${statusCode} ${apnsReason(responseBody)}` }
  } catch (err) {
    console.error(`[APNs] Exception sending to ${deviceToken.slice(0, 8)}...:`, err)
    return { ok: false, providerId: null, error: err instanceof Error ? err.message : String(err) }
  }
}

/** APNs answers a refusal with `{"reason":"BadDeviceToken"}`; the reason is what's worth keeping. */
function apnsReason(body: string): string {
  try {
    const reason = (JSON.parse(body) as { reason?: unknown }).reason
    if (typeof reason === 'string') return reason
  } catch {
    /* not JSON — keep the raw body */
  }
  return body
}

/**
 * Send an HTTP/2 request to APNs using Node.js built-in http2 module.
 * Returns the HTTP status code, the body, and APNs's `apns-id` for the message.
 */
function sendHTTP2Request(
  host: string,
  deviceToken: string,
  jwt: string,
  body: string,
  topic: string
): Promise<{ statusCode: number; responseBody: string; apnsId: string | null }> {
  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${host}`)

    client.on('error', (err) => {
      client.close()
      reject(err)
    })

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    })

    req.on('response', (headers) => {
      const statusCode = headers[':status'] as number
      const apnsId = typeof headers['apns-id'] === 'string' ? headers['apns-id'] : null
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      req.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8')
        client.close()
        resolve({ statusCode, responseBody, apnsId })
      })
    })

    req.on('error', (err) => {
      client.close()
      reject(err)
    })

    // Set a timeout to avoid hanging connections
    req.setTimeout(10000, () => {
      req.close()
      client.close()
      reject(new Error('APNs request timed out'))
    })

    req.write(body)
    req.end()
  })
}

/**
 * The switch a kind of notification belongs to, from the registry. Every push
 * names its kind (N4, 2026-10-07): there is no way to send one without, so no
 * push can skip the member's switch, and none can go out that the registry —
 * and the sentence members read there — does not know about.
 *
 * ⚠ Throws for a kind that is not live. A planned or retired kind reaching a
 * sender is a programming error, and failing loudly beats sending it.
 */
function switchFor(kind: NotificationTypeKey): PushCategory {
  const spec = NOTIFICATION_TYPES[kind]
  if (!spec) throw new Error(`push: ${String(kind)} is not in the notification registry`)
  if (spec.status !== 'live') throw new Error(`push: ${kind} is ${spec.status}, not live`)
  return spec.category
}

/**
 * Filter a list of user IDs down to those who haven't switched `category` off.
 * Users with no preferences row are treated as opted-in (defaults are all-true).
 */
async function filterByCategoryOptIn(userIds: string[], category: PushCategory): Promise<string[]> {
  if (userIds.length === 0) return userIds
  const supabase = createAdminClient()
  const column = PUSH_CATEGORY_COLUMNS[category]
  // Find users who EXPLICITLY have the column set to false; everyone else
  // (including users with no row at all) gets the push.
  const { data: optedOut, error } = await supabase
    .from('push_notification_preferences')
    .select(`user_id, ${column}`)
    .in('user_id', userIds)
    .eq(column, false)
  // ⚠ A failed read is an error, never a default: "no opt-outs found" read off
  // a failed query would push to somebody who switched it off.
  if (error) throw new Error(`push: preference read failed: ${error.message}`)
  const optedOutSet = new Set(
    ((optedOut ?? []) as unknown as Array<{ user_id: string }>).map((r) => r.user_id),
  )
  return userIds.filter((id) => !optedOutSet.has(id))
}

/**
 * Per-token dispatch — routes APNs tokens (iOS, hex device tokens) to APNs
 * direct, Expo push tokens (Android, ExponentPushToken[...]) to Expo's
 * hosted relay. Picks the right path based on the stored `platform` column,
 * with a token-shape fallback for legacy rows where platform may be wrong.
 */
type TokenRow = {
  id: string
  token: string
  environment: string | null
  bundle_id: string | null
  platform: string | null
}

/** Which provider a token goes through: Expo's relay for Android and Expo tokens, APNs direct otherwise. */
function platformOf(t: TokenRow): 'apns' | 'expo' {
  return t.platform === 'android' || t.token.startsWith('ExponentPushToken[') ? 'expo' : 'apns'
}

async function dispatchPush(t: TokenRow, payload: PushPayload): Promise<PushAttempt & { provider: 'apns' | 'expo' }> {
  if (platformOf(t) === 'expo') {
    return { provider: 'expo', ...(await sendExpoPushNotification(t.token, payload)) }
  }
  return { provider: 'apns', ...(await sendPushNotification(t.token, payload, t.environment === 'development', t.bundle_id)) }
}

/**
 * Send a push notification to all devices registered for a user.
 *
 * `kind` is the registry kind being sent. Its switch is checked first — a
 * member who switched it off is skipped (`{ sent: 0, total: 0 }`). There is no
 * way to bypass the switch: the last sender that could, the admin push tool,
 * was deleted on 2026-10-07.
 *
 * Every device it goes to gets a row in the delivery record (migration 176),
 * with `context` saying where the send came from when the caller knows.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  kind: NotificationTypeKey,
  context: DeliveryContext = {},
): Promise<{ sent: number; total: number }> {
  // Delivery kill-switch. A process that sets SUPPRESS_PUSH_DELIVERY=true (e.g.
  // a bulk historical re-score) runs all detection + entry_xp_state snapshot
  // bookkeeping but delivers ZERO pushes — so a mass recalc never spams users,
  // and never defers a badge-diff flood to the next live recalc either. The
  // deployed app never sets it, so live scoring is unaffected. This is the sole
  // delivery choke point (sendPushToUsers delegates here).
  if (process.env.SUPPRESS_PUSH_DELIVERY === 'true') {
    return { sent: 0, total: 0 }
  }

  const allowed = await filterByCategoryOptIn([userId], switchFor(kind))
  if (allowed.length === 0) return { sent: 0, total: 0 }

  const supabase = createAdminClient()

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('id, token, environment, bundle_id, platform')
    .eq('user_id', userId)

  if (!tokens || tokens.length === 0) {
    return { sent: 0, total: 0 }
  }

  // Compute the recipient's iOS app icon badge count once, then attach it
  // to the payload so every device this user owns (iPhone, iPad, etc.) gets
  // the same number. If the caller already set payload.badge (rare, but
  // some flows might want a specific count), respect it. If the RPC fails,
  // omit the badge — better to leave the current count untouched than to
  // crash the whole push because of a stat-counter lookup.
  //
  // get_user_badge_count = unread banter messages + total pending actions
  // in user_pending_actions (migration 019). Whichever push trigger called
  // this sendPushToUser has already inserted its row into
  // user_pending_actions (if applicable), so the count reflects this
  // notification too.
  let personalizedPayload = payload
  if (typeof payload.badge !== 'number') {
    const { data: badgeCount, error: badgeErr } = await supabase
      .rpc('get_user_badge_count', { p_user_id: userId })
    if (!badgeErr && typeof badgeCount === 'number') {
      personalizedPayload = { ...payload, badge: badgeCount }
    } else if (badgeErr) {
      console.warn(
        `[APNs] Failed to compute badge count for user ${userId.slice(0, 8)}...`,
        badgeErr,
      )
    }
  }

  const rows = tokens as TokenRow[]
  const results = await Promise.allSettled(rows.map((t) => dispatchPush(t, personalizedPayload)))

  const deliveries: Delivery[] = results.map((r, i) => {
    const attempt = r.status === 'fulfilled'
      ? r.value
      : { provider: platformOf(rows[i]), ok: false, providerId: null, error: r.reason instanceof Error ? r.reason.message : String(r.reason) }
    return {
      kind,
      channel: 'push',
      provider: attempt.provider,
      status: attempt.ok ? 'sent' : 'failed',
      userId,
      poolId: context.poolId ?? null,
      outboxId: context.outboxId ?? null,
      pushTokenId: rows[i].id,
      providerId: attempt.providerId,
      error: attempt.error,
    }
  })
  await recordDeliveries(deliveries)

  return { sent: deliveries.filter((d) => d.status === 'sent').length, total: rows.length }
}

/**
 * Send a push notification to multiple users in parallel.
 *
 * Same `kind` and switch semantics as `sendPushToUser`.
 *
 * Per-recipient badge counts: this fans out via `sendPushToUser` so each
 * user gets a payload with their own unread-messages count. The previous
 * implementation queried all tokens in one bulk SQL call and dispatched
 * with a shared payload — faster, but couldn't personalize the badge.
 * For alpha-scale fan-outs (a banter message to a pool of 10-20 members)
 * the per-user overhead is negligible. If we ever fan out to thousands
 * of recipients we can batch-compute badges in a single SQL query and
 * inline-dispatch, but that's a perf optimization, not correctness.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
  kind: NotificationTypeKey,
  context: DeliveryContext = {},
): Promise<{ sent: number; total: number }> {
  if (userIds.length === 0) return { sent: 0, total: 0 }
  const allowed = await filterByCategoryOptIn(userIds, switchFor(kind))
  if (allowed.length === 0) return { sent: 0, total: 0 }

  const results = await Promise.allSettled(
    allowed.map((uid) => sendPushToUser(uid, payload, kind, context)),
  )

  let sent = 0
  let total = 0
  for (const r of results) {
    if (r.status === 'fulfilled') {
      sent += r.value.sent
      total += r.value.total
    }
  }
  return { sent, total }
}

/**
 * Remove an invalid token from the database.
 */
async function removeInvalidToken(token: string) {
  try {
    const supabase = createAdminClient()
    await supabase.from('push_tokens').delete().eq('token', token)
    console.log(`[APNs] Removed invalid token ${token.slice(0, 8)}...`)
  } catch (err) {
    console.error('[APNs] Failed to remove invalid token:', err)
  }
}
