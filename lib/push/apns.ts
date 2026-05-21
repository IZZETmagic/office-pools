import { createAdminClient } from '@/lib/supabase/server'
import http2 from 'node:http2'

import { PUSH_CATEGORY_COLUMNS, type PushCategory } from './categories'
import { sendExpoPushNotification } from './expo-push'

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
 * Returns true if successful, false if failed.
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
): Promise<boolean> {
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
    const body = JSON.stringify({
      aps,
      ...(payload.data ?? {}),
    })

    console.log(`[APNs] Sending to ${host}, token ${deviceToken.slice(0, 8)}..., topic=${topic}, sandbox=${sandbox}`)

    const { statusCode, responseBody } = await sendHTTP2Request(host, deviceToken, jwt, body, topic)

    if (statusCode === 200) {
      console.log(`[APNs] Success for token ${deviceToken.slice(0, 8)}...`)
      return true
    }

    console.error(`[APNs] Error ${statusCode} for token ${deviceToken.slice(0, 8)}...: ${responseBody}`)

    // 410 Gone = token is no longer valid, clean it up
    if (statusCode === 410) {
      await removeInvalidToken(deviceToken)
    }

    return false
  } catch (err) {
    console.error(`[APNs] Exception sending to ${deviceToken.slice(0, 8)}...:`, err)
    return false
  }
}

/**
 * Send an HTTP/2 request to APNs using Node.js built-in http2 module.
 * Returns the HTTP status code.
 */
function sendHTTP2Request(
  host: string,
  deviceToken: string,
  jwt: string,
  body: string,
  topic: string
): Promise<{ statusCode: number; responseBody: string }> {
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
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      req.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8')
        client.close()
        resolve({ statusCode, responseBody })
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
 * Filter a list of user IDs down to those who haven't opted out of `category`.
 * Users with no preferences row are treated as opted-in (defaults are all-true).
 */
async function filterByCategoryOptIn(
  userIds: string[],
  category: PushCategory | undefined,
): Promise<string[]> {
  if (!category || userIds.length === 0) return userIds
  const supabase = createAdminClient()
  const column = PUSH_CATEGORY_COLUMNS[category]
  // Find users who EXPLICITLY have the column set to false; everyone else
  // (including users with no row at all) gets the push.
  const { data: optedOut } = await supabase
    .from('push_notification_preferences')
    .select(`user_id, ${column}`)
    .in('user_id', userIds)
    .eq(column, false)
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
  token: string
  environment: string | null
  bundle_id: string | null
  platform: string | null
}

async function dispatchPush(t: TokenRow, payload: PushPayload): Promise<boolean> {
  const isExpoToken = t.token.startsWith('ExponentPushToken[')
  if (t.platform === 'android' || isExpoToken) {
    return sendExpoPushNotification(t.token, payload)
  }
  return sendPushNotification(t.token, payload, t.environment === 'development', t.bundle_id)
}

/**
 * Send a push notification to all devices registered for a user.
 *
 * If `category` is set, the user's opt-out preference for that category is
 * checked first — a `false` pref silently no-ops the send. Pass `undefined`
 * to bypass the gate (admin broadcasts, member-removed, deadline-changed —
 * messages users can't reasonably mute).
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  category?: PushCategory,
): Promise<{ sent: number; total: number }> {
  const allowed = await filterByCategoryOptIn([userId], category)
  if (allowed.length === 0) return { sent: 0, total: 0 }

  const supabase = createAdminClient()

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token, environment, bundle_id, platform')
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
  let personalizedPayload = payload
  if (typeof payload.badge !== 'number') {
    const { data: unreadCount, error: unreadErr } = await supabase
      .rpc('get_user_unread_message_count', { p_user_id: userId })
    if (!unreadErr && typeof unreadCount === 'number') {
      personalizedPayload = { ...payload, badge: unreadCount }
    } else if (unreadErr) {
      console.warn(
        `[APNs] Failed to compute badge count for user ${userId.slice(0, 8)}...`,
        unreadErr,
      )
    }
  }

  const results = await Promise.allSettled(
    (tokens as TokenRow[]).map((t) => dispatchPush(t, personalizedPayload)),
  )

  const sent = results.filter(
    (r) => r.status === 'fulfilled' && r.value === true
  ).length

  return { sent, total: tokens.length }
}

/**
 * Send a push notification to multiple users in parallel.
 *
 * Same `category` opt-out semantics as `sendPushToUser`.
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
  category?: PushCategory,
): Promise<{ sent: number; total: number }> {
  if (userIds.length === 0) return { sent: 0, total: 0 }
  const allowed = await filterByCategoryOptIn(userIds, category)
  if (allowed.length === 0) return { sent: 0, total: 0 }

  const results = await Promise.allSettled(
    allowed.map((uid) => sendPushToUser(uid, payload, category)),
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
 * Send a push to ALL registered devices (for admin broadcasts).
 */
export async function sendPushToAll(
  payload: PushPayload
): Promise<{ sent: number; total: number }> {
  const supabase = createAdminClient()

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token, environment, bundle_id, platform')

  if (!tokens || tokens.length === 0) {
    return { sent: 0, total: 0 }
  }

  // Send in chunks to avoid overwhelming the connection
  const CHUNK_SIZE = 50
  let sent = 0

  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
    const chunk = tokens.slice(i, i + CHUNK_SIZE) as TokenRow[]
    const results = await Promise.allSettled(
      chunk.map((t) => dispatchPush(t, payload)),
    )
    sent += results.filter(
      (r) => r.status === 'fulfilled' && r.value === true
    ).length
  }

  return { sent, total: tokens.length }
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
