// =============================================================
// higgsfield/image — batch text-to-image
// =============================================================
// Submits a batch of image generations, waits for all of them, and downloads
// the results. Separate from index.ts (video) because the result shape, the
// model catalog and the failure modes are all different.
//
// BILLABLE. Prepaid credits, charged on success only; `failed` and `nsfw` are
// refunded automatically. Outputs are deleted from Higgsfield after ~7 days,
// so every result is downloaded to disk as soon as it completes — the returned
// URL is not storage.
//
//   npx tsx scripts/higgsfield/image.ts <out-dir>          # submit + wait (BILLABLE)
//   npx tsx scripts/higgsfield/image.ts <out-dir> --resume # re-poll the last batch (free)
//
// Every request_id is printed and written to manifest.json BEFORE any waiting
// starts. The SDK's own polling has a hard 300s cap and throws on timeout,
// discarding the request_id with it — and there is no list-requests endpoint,
// so a generation already paid for becomes permanently unfindable. That has
// happened once. Hence: submit, persist the ids, then poll by hand.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, join } from 'path'

;(() => {
  const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
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

const API = 'https://api.higgsfield.ai'
const TERMINAL = new Set(['completed', 'failed', 'nsfw', 'canceled'])
const TIMEOUT_MS = Number(process.env.HF_TIMEOUT_MS ?? 15 * 60 * 1000)

// The base every avatar asset will register to. Deliberately bald, browless
// and clean-shaven: hair, brows and beard have to be purely additive layers
// sitting on a neutral skull, or they will never line up with each other.
//
// Pass 1 ran this across Recraft (vector + standard) and Ideogram. Ideogram won
// on framing and warmth but soft-shaded the skull and added brows unasked.
const PASS1_PROMPT = [
  'Flat 2D vector avatar of a character, head and shoulders only, facing directly forward,',
  'perfectly symmetrical and centered. Rounded-square head with a broad jaw and generously',
  'rounded corners. Completely bald: no hair, no eyebrows, no beard, no facial hair.',
  'Simple friendly features: two plain oval eyes, a small minimal nose, a small closed',
  'neutral mouth. Flat solid colors only, no gradients, no shading, no texture, no outlines.',
  'Bold simple geometry, clean crisp edges, warm and friendly modern mobile app mascot style.',
  'Plain crewneck t-shirt, flat horizontal shoulder line, cropped at the chest.',
  'Solid flat background, centered square composition with even margin.',
].join(' ')

// Pass 2 — Ideogram only, two changes and nothing else so the comparison holds:
// harder on flatness, and the upper face goes blank.
//
// The blank face is phrased as a POSITIVE description of what is there rather
// than as a removal. Asking an image model to take a feature away reliably
// fails (the "no seam" lesson from the avatar work); describing the surface it
// should render instead works. The word "eyes" is kept out of the prompt
// entirely rather than negated, since naming a feature tends to summon it.
const PASS2_PROMPT = [
  'Flat 2D vector avatar of a character, head and shoulders only, facing directly forward,',
  'perfectly symmetrical and centered. Rounded-square head with a broad jaw and generously',
  'rounded corners. Completely bald, no hair, no beard, no facial hair.',
  'The upper half of the face is one smooth unbroken expanse of blank bare skin,',
  'entirely featureless from the top of the head down to the nose.',
  'Below that, only two small features: a small minimal nose and a small closed neutral mouth.',
  'Every shape is filled with one single uniform solid colour with hard clean edges between',
  'shapes. Absolutely no gradients, no soft shading, no ambient shadow, no highlights,',
  'no drop shadow, no texture. Natural skin tone.',
  'Bold simple geometry, warm and friendly modern mobile app mascot style.',
  'Plain crewneck t-shirt, flat horizontal shoulder line, cropped at the chest.',
  'Solid flat background, centered square composition with even margin.',
].join(' ')

interface Job { id: string; endpoint: string; input: Record<string, unknown> }

const PASS1_JOBS: Job[] = [
  // Vector mode. NOTE: this does not return SVG — Higgsfield rasterises it to
  // a 1024x1024 JPEG. Verified against the API's own result URLs.
  ...[1, 2, 3].map((n) => ({
    id: `recraft-vector-${n}`,
    endpoint: 'recraft/v4.1/text-to-image',
    input: { prompt: PASS1_PROMPT, model_type: 'vector', aspect_ratio: '1:1', resolution: '1k' },
  })),
  ...[1, 2].map((n) => ({
    id: `recraft-standard-${n}`,
    endpoint: 'recraft/v4.1/text-to-image',
    input: { prompt: PASS1_PROMPT, model_type: 'standard', aspect_ratio: '1:1', resolution: '1k' },
  })),
  { id: 'ideogram-1', endpoint: 'ideogram/v4.0', input: { prompt: PASS1_PROMPT, aspect_ratio: '1:1' } },
]

const PASS2_JOBS: Job[] = [1, 2, 3, 4].map((n) => ({
  id: `ideogram-blank-${n}`,
  endpoint: 'ideogram/v4.0',
  input: { prompt: PASS2_PROMPT, aspect_ratio: '1:1' },
}))

const PASS = process.argv.find((a) => a.startsWith('--pass='))?.slice('--pass='.length) ?? '2'
const JOBS: Job[] = PASS === '1' ? PASS1_JOBS : PASS2_JOBS

interface Submitted { id: string; endpoint: string; request_id: string; status_url: string }
interface StatusBody { status: string; request_id?: string; images?: Array<{ url?: string }>; error?: unknown }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const auth = () => ({ Authorization: `Key ${process.env.HF_CREDENTIALS}`, 'Content-Type': 'application/json' })

async function submit(job: Job): Promise<Submitted | null> {
  const res = await fetch(`${API}/${job.endpoint}`, { method: 'POST', headers: auth(), body: JSON.stringify(job.input) })
  const text = await res.text()
  if (!res.ok) {
    // Validation failures never create a request, so nothing is charged.
    console.log(`  ✗ ${job.id.padEnd(20)} HTTP ${res.status}  ${text.slice(0, 200).replace(/\s+/g, ' ')}`)
    return null
  }
  const body = JSON.parse(text) as StatusBody & { status_url?: string }
  const request_id = body.request_id!
  console.log(`  ✓ ${job.id.padEnd(20)} ${request_id}`)
  return { id: job.id, endpoint: job.endpoint, request_id, status_url: body.status_url || `${API}/requests/${request_id}/status` }
}

async function pollUntilTerminal(s: Submitted): Promise<StatusBody> {
  const started = Date.now()
  let delay = 2000
  while (true) {
    const res = await fetch(s.status_url, { headers: auth() })
    if (!res.ok) throw new Error(`${s.id}: status endpoint returned HTTP ${res.status}`)
    const body = (await res.json()) as StatusBody
    if (TERMINAL.has(body.status)) return body
    if (Date.now() - started > TIMEOUT_MS) {
      throw new Error(`${s.id}: still ${body.status} after ${Math.round(TIMEOUT_MS / 1000)}s — not lost, id ${s.request_id}`)
    }
    await sleep(delay + Math.random() * 500)
    delay = Math.min(delay * 1.5, 10000)
  }
}

async function download(url: string, outDir: string, id: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed HTTP ${res.status}`)
  const type = res.headers.get('content-type') ?? ''
  const ext = type.includes('svg') || url.includes('.svg') ? 'svg' : type.includes('webp') ? 'webp' : type.includes('jpeg') ? 'jpg' : 'png'
  const path = join(outDir, `${id}.${ext}`)
  writeFileSync(path, Buffer.from(await res.arrayBuffer()))
  return path
}

async function main() {
  const credentials = process.env.HF_CREDENTIALS
  if (!credentials || !credentials.includes(':')) {
    console.error('HF_CREDENTIALS missing or malformed in .env.local — expected "<key-id>:<key-secret>".')
    process.exit(1)
  }

  const outDir = resolve(process.argv[2] ?? 'assets/avatar-hf/base-pass1')
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  const manifestPath = join(outDir, 'manifest.json')
  const resuming = process.argv.includes('--resume')

  let submitted: Submitted[]
  if (resuming) {
    submitted = JSON.parse(readFileSync(manifestPath, 'utf8'))
    console.log(`resuming ${submitted.length} request(s) from ${manifestPath} (free)\n`)
  } else {
    console.log(`submitting ${JOBS.length} generation(s) — BILLABLE\n`)
    const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length)
    const jobs = only ? JOBS.filter((j) => j.id.startsWith(only)) : JOBS
    const results = await Promise.all(jobs.map(submit))
    submitted = results.filter((r): r is Submitted => r !== null)
    if (!submitted.length) {
      console.error('\nNothing was accepted. No credits spent.')
      process.exit(1)
    }
    // Persisted before any waiting, so no paid generation can be orphaned.
    // Merge rather than overwrite: a re-run of a subset must not orphan the
    // request ids of generations that are already paid for.
    const prior: Submitted[] = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : []
    const merged = [...prior.filter((p) => !submitted.some((s) => s.id === p.id)), ...submitted]
    writeFileSync(manifestPath, JSON.stringify(merged, null, 2))
    console.log(`\nrequest ids written to ${manifestPath}`)
    console.log(`re-poll for free with: npx tsx scripts/higgsfield/image.ts ${process.argv[2] ?? 'assets/avatar-hf/base-pass1'} --resume\n`)
  }

  const settled = await Promise.allSettled(
    submitted.map(async (s) => {
      const body = await pollUntilTerminal(s)
      if (body.status !== 'completed') return { s, body, path: null as string | null }
      const url = body.images?.[0]?.url
      if (!url) return { s, body, path: null }
      return { s, body, path: await download(url, outDir, s.id) }
    }),
  )

  console.log('results')
  let ok = 0
  for (const r of settled) {
    if (r.status === 'rejected') {
      console.log(`  ✗ ${String(r.reason?.message ?? r.reason).slice(0, 160)}`)
      continue
    }
    const { s, body, path } = r.value
    if (path) { ok++; console.log(`  ✓ ${s.id.padEnd(20)} ${path}`) }
    else console.log(`  ✗ ${s.id.padEnd(20)} ${body.status}${body.status === 'failed' || body.status === 'nsfw' ? ' (refunded)' : ''}`)
  }
  console.log(`\n${ok}/${submitted.length} downloaded to ${outDir}`)
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  // Only the message — the error object can carry request headers, and those
  // carry the credentials.
  console.error('Request error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
