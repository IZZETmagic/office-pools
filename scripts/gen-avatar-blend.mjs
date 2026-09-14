// =============================================================
// Six directions that are BOTH different and well drawn
// =============================================================
// Two rounds established the tension by measurement, not opinion:
//
//   anchor ON   (style_id from the approved bases)  → the art holds, the six
//               directions collapse into one. '4-outline' had no outline.
//   anchor OFF  (prompt only)                        → six real directions, and
//               the drawing falls apart: masks on sticks, a ghost, a silhouette.
//
// That is §7c.8's "cannot hold all variables at once" stated as a fork. The way
// through is not to pick a side: a Recraft style can be built from SEVERAL
// images with per-image weights, so each direction gets its OWN style made of
//
//   the approved base   — the warmth, proportion and framing that were approved
//   its own sketch      — the thing that makes that direction that direction
//
// weighted toward the sketch, so the direction leads and the base civilises it.
//
//   node scripts/gen-avatar-blend.mjs     ≈ $0.33
// =============================================================
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'

const OUT_DIR = 'assets/avatar-blend'
const BASE_REF = 'assets/avatar-sportpool/B-S1-roundsquare-primary.svg'
const SKETCH_DIR = 'assets/avatar-styles'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const key = readFileSync('.env.local', 'utf8').match(/^RECRAFT_API_KEY=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '')
const post = async (path, body) => {
  const res = await fetch(`https://external.api.recraft.ai/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${path} ${res.status} ${text.slice(0, 200)}`)
  return JSON.parse(text)
}

function rasterise(svgPath) {
  const tmp = mkdtempSync(join(tmpdir(), 'ref-'))
  const page = join(tmp, 'p.html'), png = join(tmp, 'p.png')
  writeFileSync(page, `<html><body style="margin:0;background:#fff"><img src="file://${resolve(svgPath)}" width="1024" height="1024"></body></html>`)
  execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', `--screenshot=${png}`, '--window-size=1024,1024', `file://${page}`], { stdio: 'ignore' })
  return `data:image/png;base64,${readFileSync(png).toString('base64')}`
}

const FRAME = [
  'Avatar portrait: head, neck and shoulders only, facing forward, centred.',
  'Cut off flat at the bottom of the shoulders. No arms, no hands, no torso below the shoulders.',
  'Oversized head, narrow neck, shoulders about one and a half head-widths wide.',
  'Warm friendly face, two large eyes with clear round pupils, simple brows, one small nose mark, one small mouth mark.',
  'Plain sports top: no logo, no crest, no badge, no text, no numbers.',
  'Round flat background behind the figure. The skin is a natural skin tone, never blue.',
  'Broad rounded-square head, jaw as wide as the brow. Reads clearly at 24 pixels.',
].join(' ')

const DIRECTIONS = [
  { key: '1-capsule', p: 'Built from capsules, circles and rounded bars. No sharp corner anywhere. Flat solid fills, no outlines.' },
  { key: '2-squircle', p: 'Every shape a rounded square with generous even corner radii, like the app cards. Soft squircle head, squared shoulders.' },
  { key: '3-duotone', p: 'Restrained: deep navy and SportPool blue on a natural skin tone. Large simple masses, no small detail.' },
  { key: '4-outline', p: 'A single dark outline of even weight around every shape, flat fills inside. Editorial and deliberate.' },
  { key: '5-kitforward', p: 'The jersey is the hero: broad squared shoulders, crisp contrast crew collar, sleeve trim. Simplified face.' },
  { key: '6-glyph', p: 'Reduced to the fewest possible shapes, like a pictogram. Bold, graphic, readable when tiny.' },
]

mkdirSync(OUT_DIR, { recursive: true })
const baseImage = rasterise(BASE_REF)
let credits = 0

for (const d of DIRECTIONS) {
  try {
    // Weighted toward the sketch: the base alone already proved it swamps a
    // prompt, so an even blend would land back on the base.
    const style = await post('/styles', {
      model: 'recraftv4_styles_vector',
      style: 'vector_illustration',
      image_urls: [baseImage, rasterise(join(SKETCH_DIR, `${d.key}-round.svg`))],
      image_weights: [0.4, 0.6],
    })
    credits += style.credits ?? 5

    const gen = await post('/images/generations', {
      prompt: `${FRAME} ${d.p}`,
      model: 'recraftv4_styles_vector',
      style_id: style.id,
      size: '1024x1024',
      response_format: 'url',
    })
    const svg = await (await fetch(gen.data[0].url)).text()
    writeFileSync(join(OUT_DIR, `${d.key}.svg`), svg)
    credits += gen.credits ?? 0
    const fills = new Set([...svg.matchAll(/fill="(rgb\([^)]*\)|#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1]))
    console.log(`✓ ${d.key.padEnd(14)} ${String((svg.match(/<path/g) || []).length).padStart(4)} paths  ${fills.size} fills  style ${style.id.slice(0, 8)}`)
  } catch (e) {
    console.log(`✗ ${d.key}: ${String(e).slice(0, 160)}`)
  }
}
console.log(`\n${credits} credits ≈ $${(credits / 1000).toFixed(2)}`)
