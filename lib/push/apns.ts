import { createAdminClient } from '@/lib/supabase/server'
import http2 from 'node:http2'

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
}

/**
 * Send a push notification to a single device token via HTTP/2.
 * APNs requires HTTP/2 — Node.js fetch only does HTTP/1.1.
 * Returns true if successful, false if failed.
 */
export async function sendPushNotification(
  deviceToken: string,
  payload: PushPayload,
  sandbox = false
): Promise<boolean> {
  try {
    const jwt = await generateAPNsJWT()
    const host = sandbox ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'

    const body = JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: 'default',
        badge: 1,
      },
      ...(payload.data ?? {}),
    })

    console.log(`[APNs] Sending to ${host}, token ${deviceToken.slice(0, 8)}..., sandbox=${sandbox}`)

    const { statusCode, responseBody } = await sendHTTP2Request(host, deviceToken, jwt, body)

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
  body: string
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
      'apns-topic': BUNDLE_ID,
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
 * Send a push notification to all devices registered for a user.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; total: number }> {
  const supabase = createAdminClient()

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token, environment')
    .eq('user_id', userId)

  if (!tokens || tokens.length === 0) {
    return { sent: 0, total: 0 }
  }

  const results = await Promise.allSettled(
    tokens.map((t) =>
      sendPushNotification(t.token, payload, t.environment === 'development')
    )
  )

  const sent = results.filter(
    (r) => r.status === 'fulfilled' && r.value === true
  ).length

  return { sent, total: tokens.length }
}

/**
 * Send a push notification to multiple users in parallel.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<{ sent: number; total: number }> {
  if (userIds.length === 0) return { sent: 0, total: 0 }

  const supabase = createAdminClient()

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token, environment')
    .in('user_id', userIds)

  if (!tokens || tokens.length === 0) {
    return { sent: 0, total: 0 }
  }

  const results = await Promise.allSettled(
    tokens.map((t) =>
      sendPushNotification(t.token, payload, t.environment === 'development')
    )
  )

  const sent = results.filter(
    (r) => r.status === 'fulfilled' && r.value === true
  ).length

  return { sent, total: tokens.length }
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
    .select('token, environment')

  if (!tokens || tokens.length === 0) {
    return { sent: 0, total: 0 }
  }

  // Send in chunks to avoid overwhelming the connection
  const CHUNK_SIZE = 50
  let sent = 0

  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
    const chunk = tokens.slice(i, i + CHUNK_SIZE)
    const results = await Promise.allSettled(
      chunk.map((t) =>
        sendPushNotification(t.token, payload, t.environment === 'development')
      )
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
