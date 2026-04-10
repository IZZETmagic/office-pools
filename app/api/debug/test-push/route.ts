import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import http2 from 'node:http2'

// TEMPORARY debug endpoint — returns full APNs error details in response

// Inline the JWT generation and push send to capture all error details
async function generateJWT() {
  const APNS_KEY_ID = process.env.APNS_KEY_ID!
  const APNS_TEAM_ID = process.env.APNS_TEAM_ID!
  const APNS_PRIVATE_KEY = process.env.APNS_PRIVATE_KEY!

  const now = Math.floor(Date.now() / 1000)
  const pemBody = APNS_PRIVATE_KEY
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  )

  const header = { alg: 'ES256', kid: APNS_KEY_ID }
  const payload = { iss: APNS_TEAM_ID, iat: now }
  const encode = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const headerB64 = encode(header)
  const payloadB64 = encode(payload)
  const signingInput = `${headerB64}.${payloadB64}`

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput)
  )
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  return `${signingInput}.${sigB64}`
}

function sendH2(host: string, token: string, jwt: string, body: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${host}`)
    client.on('error', (err) => { client.close(); reject(err) })

    const bundleId = process.env.APNS_BUNDLE_ID || 'com.officepools.app'
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    })

    req.on('response', (headers) => {
      const status = headers[':status'] as number
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      req.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8')
        client.close()
        resolve({ status, body: responseBody })
      })
    })

    req.on('error', (err) => { client.close(); reject(err) })
    req.setTimeout(10000, () => { req.close(); client.close(); reject(new Error('Timeout')) })
    req.write(body)
    req.end()
  })
}

export async function GET() {
  const userId = '059bda58-a237-4dec-91d5-4dfdaa62b72d'
  const logs: string[] = []

  try {
    // Get tokens
    const supabase = createAdminClient()
    const { data: tokens, error: dbError } = await supabase
      .from('push_tokens')
      .select('token, environment')
      .eq('user_id', userId)

    if (dbError) return NextResponse.json({ error: 'DB error', detail: dbError })
    if (!tokens?.length) return NextResponse.json({ error: 'No tokens found' })

    logs.push(`Found ${tokens.length} token(s)`)

    // Check env vars
    logs.push(`APNS_KEY_ID set: ${!!process.env.APNS_KEY_ID}`)
    logs.push(`APNS_TEAM_ID set: ${!!process.env.APNS_TEAM_ID}`)
    logs.push(`APNS_PRIVATE_KEY set: ${!!process.env.APNS_PRIVATE_KEY} (len=${process.env.APNS_PRIVATE_KEY?.length ?? 0})`)
    logs.push(`APNS_BUNDLE_ID: ${process.env.APNS_BUNDLE_ID || 'com.officepools.app (default)'}`)

    // Generate JWT
    const jwt = await generateJWT()
    logs.push(`JWT generated: ${jwt.slice(0, 30)}...`)

    // Send to each token
    const results = []
    for (const t of tokens) {
      const host = t.environment === 'development' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'
      logs.push(`Sending to ${host}, token ${t.token.slice(0, 16)}..., env=${t.environment}`)

      const body = JSON.stringify({
        aps: { alert: { title: 'Debug Push', body: 'APNs HTTP/2 test' }, sound: 'default', badge: 1 },
        type: 'community', pool_id: 'debug-test',
      })

      try {
        const res = await sendH2(host, t.token, jwt, body)
        logs.push(`Response: status=${res.status}, body=${res.body}`)
        results.push({ token: t.token.slice(0, 16), env: t.environment, host, status: res.status, apns_response: res.body })
      } catch (err) {
        logs.push(`Error: ${err}`)
        results.push({ token: t.token.slice(0, 16), env: t.environment, host, error: String(err) })
      }
    }

    return NextResponse.json({ results, logs })
  } catch (err) {
    return NextResponse.json({ error: String(err), logs, stack: err instanceof Error ? err.stack : undefined })
  }
}
