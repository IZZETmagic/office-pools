// =============================================================
// higgsfield/index — Seedance 2.5 text-to-video smoke test
// =============================================================
// Minimal end-to-end example against the Higgsfield API: submit one
// text-to-video generation, wait for it, print the URL.
//
// Billing is prepaid credits and this script SPENDS THEM — every successful
// run is a real, charged generation. `failed` and `nsfw` are not charged and
// any reserved credits are refunded automatically.
//
// Outputs are deleted from Higgsfield after ~7 days. The URL this prints is
// not durable storage; download anything worth keeping.
//
//   npx tsx scripts/higgsfield/index.ts                 # submit + wait (BILLABLE)
//   npx tsx scripts/higgsfield/index.ts <request_id>    # resume an existing one (free)
//
// Why this polls by hand rather than using subscribe({ withPolling: true }):
// the SDK's built-in polling has a hard 300s cap and THROWS on timeout, which
// discards the request_id along with it — a generation you have already paid
// for becomes unfindable, and there is no list-requests endpoint to recover
// it. So the id is captured and printed first, and the wait is ours.

import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local the same way the other scripts here do — no dotenv
// dependency, KEY=VALUE lines only. Credentials live in the environment and
// are never printed, logged or echoed back out.
;(() => {
  const envPath = resolve(process.cwd(), '.env.local')
  const envContent = readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
})()

import { config, higgsfield } from '@higgsfield/client/v2'

const MODEL = 'bytedance/seedance-2.5/text-to-video'
const API = 'https://api.higgsfield.ai'

// Per the API docs. 'canceled' is terminal but is absent from the SDK's
// status union, so it is tracked here explicitly rather than inferred.
const TERMINAL = new Set(['completed', 'failed', 'nsfw', 'canceled'])

const TIMEOUT_MS = Number(process.env.HF_TIMEOUT_MS ?? 20 * 60 * 1000)

interface StatusBody {
  status: string
  request_id?: string
  video?: { url?: string }
  images?: Array<{ url?: string }>
  error?: unknown
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Backoff per the docs: start at 2s, grow to a 10s ceiling, jitter each wait.
async function pollUntilTerminal(statusUrl: string, credentials: string): Promise<StatusBody> {
  const started = Date.now()
  let delay = 2000
  let last = ''

  while (true) {
    const res = await fetch(statusUrl, { headers: { Authorization: `Key ${credentials}` } })
    if (!res.ok) throw new Error(`status endpoint returned HTTP ${res.status}`)

    const body = (await res.json()) as StatusBody
    if (body.status !== last) {
      console.log(`  [${String(Math.round((Date.now() - started) / 1000)).padStart(4)}s] ${body.status}`)
      last = body.status
    }
    if (TERMINAL.has(body.status)) return body

    if (Date.now() - started > TIMEOUT_MS) {
      throw new Error(
        `still ${body.status} after ${Math.round(TIMEOUT_MS / 1000)}s — not lost, resume with:\n` +
          `  npx tsx scripts/higgsfield/index.ts ${body.request_id ?? '<request_id>'}`,
      )
    }

    await sleep(delay + Math.random() * 500)
    delay = Math.min(delay * 1.5, 10000)
  }
}

function report(body: StatusBody): never {
  console.log(`status      ${body.status}`)

  switch (body.status) {
    case 'completed': {
      const url = body.video?.url
      if (!url) {
        console.error('\nReported completed but returned no video URL — treating as a failure.')
        process.exit(1)
      }
      console.log(`\nvideo       ${url}`)
      console.log('\nNote: Higgsfield deletes outputs after ~7 days. Download it to keep it.')
      process.exit(0)
    }
    case 'failed':
      console.error('\nGeneration failed. Not charged; any reserved credits are refunded.')
      process.exit(1)
    case 'nsfw':
      console.error('\nBlocked by content moderation. Not charged; any reserved credits are refunded.')
      process.exit(1)
    case 'canceled':
      console.error('\nRequest was canceled.')
      process.exit(1)
    default:
      console.error(`\nUnexpected terminal state: ${body.status}`)
      process.exit(1)
  }
}

async function main() {
  const credentials = process.env.HF_CREDENTIALS
  if (!credentials) {
    console.error('HF_CREDENTIALS is not set.')
    console.error('Add it to .env.local as:  HF_CREDENTIALS=<key-id>:<key-secret>')
    console.error('Generate the pair at https://console.higgsfield.ai')
    process.exit(1)
  }
  if (!credentials.includes(':')) {
    // Shape check only — the value itself is never printed.
    console.error('HF_CREDENTIALS is malformed. Expected "<key-id>:<key-secret>".')
    process.exit(1)
  }

  config({ credentials })

  // Resume mode: poll a generation that already exists. Costs nothing.
  const resumeId = process.argv[2]
  if (resumeId) {
    console.log(`resuming    ${resumeId}`)
    report(await pollUntilTerminal(`${API}/requests/${resumeId}/status`, credentials))
  }

  console.log(`submitting  ${MODEL}  (billable)`)

  const submitted = await higgsfield.subscribe(MODEL, {
    input: {
      prompt: 'A cinematic scene at sunset',
      duration: 5,
      resolution: '720p',
      aspect_ratio: '16:9',
      output_format: 'mp4',
      generate_audio: true,
    },
    // Deliberately false — see the note at the top of this file.
    withPolling: false,
  })

  // Printed before anything can throw, so the id is never lost again.
  console.log(`request_id  ${submitted.request_id}`)
  console.log(`resume with npx tsx scripts/higgsfield/index.ts ${submitted.request_id}`)

  if (TERMINAL.has(submitted.status)) report(submitted as StatusBody)

  const statusUrl = submitted.status_url || `${API}/requests/${submitted.request_id}/status`
  report(await pollUntilTerminal(statusUrl, credentials))
}

main().catch((err) => {
  // Deliberately narrow: only the message, never the whole error object, which
  // can carry request headers and therefore the credentials.
  console.error('Request error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
