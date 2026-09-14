// =============================================================
// Base avatar — round 2: hold the LOOK, vary the SKULL
// =============================================================
// Round 1 established that V4.1 holds an avatar composition and the V3 curated
// styles do not (they return scenes). Round 2 takes three round-1 outputs as
// style seeds and generates the same five head shapes under each, so every row
// is internally consistent and the only thing moving along a row is the skull.
//
// Two reasons it is built this way:
//   §7c.9 — my judgement of whether the art is good is not reliable, so the
//           three surviving directions all get a full row rather than one of
//           them getting picked here.
//   §7c.1 — "a fifth shape is not generatable" was measured on V3. V4.1 is a
//           different model, so S5 re-tests it rather than assuming it holds.
//
//   node scripts/gen-avatar-shapes.mjs      15 generations ≈ $0.77
// =============================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'

const SRC_DIR = 'assets/avatar-bases'
const OUT_DIR = 'assets/avatar-shapes'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const key = readFileSync('.env.local', 'utf8').match(/^RECRAFT_API_KEY=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '')
const post = async (path, body) => {
  const res = await fetch(`https://external.api.recraft.ai/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${path} ${res.status} ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

// Style references must be PNG/JPG/WEBP — an SVG is rejected — so the seed is
// rasterised through Chrome, which is the only renderer on this machine.
function rasterise(svgPath) {
  const tmp = mkdtempSync(join(tmpdir(), 'seed-'))
  const page = join(tmp, 'p.html')
  const png = join(tmp, 'p.png')
  writeFileSync(page, `<html><body style="margin:0"><img src="file://${resolve(svgPath)}" width="1024" height="1024"></body></html>`)
  execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', `--screenshot=${png}`, '--window-size=1024,1024', `file://${page}`], { stdio: 'ignore' })
  return `data:image/png;base64,${readFileSync(png).toString('base64')}`
}

const SEEDS = ['D1-v41-plain-broad', 'D2-v41-chunky-broad', 'D6-v41-wobble-broad']

// The style now carries the art direction, so the prompt carries only the
// subject and the skull. Everything else is pinned so the shape is the one
// variable a viewer can see (§7e.5 — the style pins the composition).
const BASE = [
  'Flat vector avatar portrait, head and shoulders, centred, facing forward.',
  'Oversized head filling most of the frame, small shoulders cropped at the bottom edge.',
  'Short simple dark hair as one solid mass. No beard, no glasses, no hat.',
  'Large eyes with clear round pupils, small simple nose, small calm mouth.',
  'Plain sports jersey with a contrast crew collar, one solid colour,',
  'no logo, no crest, no badge, no text, no numbers.',
  'Flat single-colour circular background.',
].join(' ')

const SHAPES = [
  { key: 'S1-roundsquare', s: 'Broad rounded-square head, jaw as wide as the brow, soft corners.' },
  { key: 'S2-oval', s: 'Smooth oval head, gently tapering to a soft rounded chin.' },
  { key: 'S3-tapered', s: 'Wide cheekbones narrowing sharply to a small pointed chin.' },
  { key: 'S4-squarejaw', s: 'Heavy wide square jaw, straight jawline, broad flat chin.' },
  { key: 'S5-long', s: 'Long narrow head, tall forehead, slim jaw, noticeably taller than wide.' },
]

mkdirSync(OUT_DIR, { recursive: true })
const log = []
let credits = 0

for (const seed of SEEDS) {
  const src = join(SRC_DIR, `${seed}.svg`)
  if (!existsSync(src)) { console.log(`✗ missing seed ${src}`); continue }
  // ⚠ `style` defaults to 'any' on the V4 raster models, and the vector model
  // then rejects the style outright. It must be declared vector at CREATION —
  // there is no way to convert one afterwards.
  const style = await post('/styles', {
    model: 'recraftv4_styles_vector',
    style: 'vector_illustration',
    image_urls: [rasterise(src)],
  })
  console.log(`style ${seed} → ${style.id}`)
  credits += style.credits ?? 5

  const row = await Promise.all(SHAPES.map(async (shape) => {
    try {
      const gen = await post('/images/generations', {
        prompt: `${BASE} ${shape.s}`,
        model: 'recraftv4_styles_vector',
        style_id: style.id,
        size: '1024x1024',
        response_format: 'url',
      })
      const svg = await (await fetch(gen.data[0].url)).text()
      const name = `${seed.slice(0, 2)}-${shape.key}`
      writeFileSync(join(OUT_DIR, `${name}.svg`), svg)
      credits += gen.credits ?? 0
      return { name, paths: (svg.match(/<path/g) || []).length, raster: (svg.match(/<image/g) || []).length }
    } catch (e) {
      return { name: `${seed.slice(0, 2)}-${shape.key}`, error: String(e).slice(0, 200) }
    }
  }))
  for (const r of row) console.log(r.error ? `  ✗ ${r.name} ${r.error}` : `  ✓ ${r.name.padEnd(20)} ${String(r.paths).padStart(4)} paths${r.raster ? '  ⚠ RASTER' : ''}`)
  log.push({ seed, styleId: style.id, row })
}

writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(log, null, 2))
console.log(`\n${credits} credits ≈ $${(credits / 1000).toFixed(2)}`)
