// =============================================================
// Base avatar exploration — Recraft
// =============================================================
// Round 1 is a DIRECTION sheet, not a candidate. Six visual directions × two
// face shapes, one prompt, so the variable on the page is the art and nothing
// else. Ryan picks a direction; round 2 turns the winner into a style_id and
// generates the shape spread off it.
//
// Why it is built this way:
//   §7c.8  — without a style the generator wanders. V4.1 did not exist when
//            that was written, so D1/D2/D6 test it unstyled; D3/D4/D5 use V3
//            with a curated style, which is the closest thing to the old
//            style_id route that needs no reference art of our own.
//   §7c.4  — never send Recraft's `colors`. It constrains skin too, which is
//            how we got blue faces. Generate for FORM, recolour afterwards.
//   §5.4   — no crest, no badge, no text, ever. Stated three ways because the
//            generator puts a sponsor on a shirt if you let it.
//   §4.2   — no strokes, no gradients, no drop shadows.
//   §7e.6  — budget ~13% structurally broken output. Nothing is filtered here;
//            broken ones are visible on the sheet and that is the point.
//
//   node scripts/gen-avatar-bases.mjs --smoke     one generation, ~$0.08
//   node scripts/gen-avatar-bases.mjs             the full sheet, ~$0.96
// =============================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const OUT_DIR = 'assets/avatar-bases'
const API = 'https://external.api.recraft.ai/v1/images/generations'

const key = (() => {
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue
    const m = readFileSync(f, 'utf8').match(/^RECRAFT_API_KEY=(.+)$/m)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')  // .env.local quotes the value
  }
  throw new Error('RECRAFT_API_KEY not found in .env.local or .env')
})()

// ── The prompt ───────────────────────────────────────────────
// Under 1,000 characters (§7c.8). Every clause earns its place; the negatives
// are the ones that actually came back wrong in past runs.
const BASE = [
  'Flat vector avatar portrait, head and shoulders, centred, facing forward.',
  'Oversized rounded head filling most of the frame, small shoulders cropped at the bottom edge.',
  'Solid flat fills only: no outlines, no strokes, no gradients, no shadows, no texture.',
  'Large almond eyes, white with big dark round pupils, thin flat eyebrows, small simple nose, small calm mouth.',
  'Hair is one solid mass with a few carved notches, never individual strands.',
  'Wearing a plain sports jersey with a contrast crew collar and shoulder yoke, one solid colour,',
  'absolutely no logo, no crest, no badge, no text, no numbers, no sponsor.',
  'Friendly caricature, warm and approachable, playful proportions.',
  'Flat single-colour circular background. Few colours. Reads clearly at 24 pixels.',
].join(' ')

const NEGATIVE = 'outlines, strokes, gradients, shadows, texture, text, letters, numbers, logos, crests, photorealism, 3d render, noisy detail'

// ── The two shapes ───────────────────────────────────────────
// Deliberately the extremes of the four in §7c.1 (jaw÷brow 0.95 vs 0.42). If a
// direction cannot hold even these apart, it will not hold four.
const SHAPES = [
  { key: 'broad', suffix: 'Broad rounded-square head, wide flat jaw as wide as the brow.' },
  { key: 'taper', suffix: 'Strongly tapered head, wide cheekbones narrowing to a small rounded chin.' },
]

// ── The six directions ───────────────────────────────────────
const DIRECTIONS = [
  { key: 'D1-v41-plain', model: 'recraftv4_1_vector', extra: '' },
  { key: 'D2-v41-chunky', model: 'recraftv4_1_vector', extra: 'Bold chunky geometric shapes, very few colours, confident simple silhouette.' },
  { key: 'D3-v3-roundish', model: 'recraftv3_vector', style: 'Roundish flat', extra: '' },
  { key: 'D4-v3-vivid', model: 'recraftv3_vector', style: 'Vivid shapes', extra: '' },
  { key: 'D5-v3-cutout', model: 'recraftv3_vector', style: 'Cutout', extra: '' },
  { key: 'D6-v41-wobble', model: 'recraftv4_1_vector', extra: 'Soft hand-drawn wobble on every edge, slightly imperfect, storybook warmth.' },
]

const jobs = []
for (const d of DIRECTIONS) {
  for (const s of SHAPES) {
    jobs.push({
      name: `${d.key}-${s.key}`,
      model: d.model,
      style: d.style,
      prompt: `${BASE} ${s.suffix}${d.extra ? ' ' + d.extra : ''}`,
    })
  }
}

const smoke = process.argv.includes('--smoke')
const queue = smoke ? jobs.slice(0, 1) : jobs

async function run(job) {
  const body = {
    prompt: job.prompt,
    model: job.model,
    size: '1024x1024',
    n: 1,
    response_format: 'url',
  }
  if (job.style) body.style = job.style
  // negative_prompt is V2/V3 only — sending it to V4.1 is rejected.
  if (job.model.startsWith('recraftv3')) body.negative_prompt = NEGATIVE

  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) return { job, error: `${res.status} ${text.slice(0, 300)}` }

  const json = JSON.parse(text)
  const url = json.data?.[0]?.url
  if (!url) return { job, error: `no url in response: ${text.slice(0, 300)}` }

  const svg = await (await fetch(url)).text()
  const dest = join(OUT_DIR, `${job.name}.svg`)
  writeFileSync(dest, svg)
  return {
    job,
    dest,
    credits: json.credits,
    bytes: svg.length,
    // §7c.8's own pass/fail: a real vector result has path data and no <image>.
    paths: (svg.match(/<path/g) || []).length,
    rasterTags: (svg.match(/<image/g) || []).length,
  }
}

mkdirSync(OUT_DIR, { recursive: true })

const results = []
for (let i = 0; i < queue.length; i += 3) {
  results.push(...(await Promise.all(queue.slice(i, i + 3).map(run))))
  process.stdout.write(`  …${Math.min(i + 3, queue.length)}/${queue.length}\n`)
}

let credits = 0
for (const r of results) {
  if (r.error) { console.log(`✗ ${r.job.name}  ${r.error}`); continue }
  credits += r.credits ?? 0
  const flag = r.rasterTags > 0 ? '⚠ RASTER' : r.paths < 8 ? '⚠ thin' : 'ok'
  console.log(`✓ ${r.job.name.padEnd(22)} ${String(r.paths).padStart(4)} paths  ${(r.bytes / 1024).toFixed(0)}kB  ${flag}`)
}
console.log(`\n${results.filter((r) => !r.error).length}/${queue.length} generated · ${credits} credits ≈ $${(credits / 1000).toFixed(2)}`)
writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(results.map((r) => ({ ...r.job, error: r.error, paths: r.paths })), null, 2))
