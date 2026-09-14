// =============================================================
// Six SportPool style directions, anchored on the approved bases
// =============================================================
// The round-4 avatars are the STARTING POINT, not the destination. They are
// attached as style references so the framing survives — head and shoulders,
// cut flat at the bottom, no arms — while `style_match: 'flexible'` gives the
// model room to restyle rather than reproduce. `precise` would hold the
// reference detail for detail, which is the opposite of the ask.
//
// The brief: keep Duolingo's playfulness, add what SportPool actually is —
// large radii (radii.lg 24 / xl 32 / pill 999), the primary blue #3B6EFF, and
// a degree of restraint. Six directions, each shown on two of the three
// approved heads, because a base has to hold its style across shapes.
//
// ⭐ Directions 1, 2 and 6 are drawn from our OWN construction grammar (§4.2)
// rather than from the reference. They are the ones that move furthest from
// the source art — which matters for the licence question, not just the look.
//
//   node scripts/gen-avatar-styles.mjs      12 generations ≈ $0.60
// =============================================================
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'

const SRC_DIR = 'assets/avatar-sportpool'
// ⚠⚠ MEASURED, and it cost a round: with a style_id attached the prompt's STYLE
// words are ignored. All twelve anchored generations came back as variants of
// the anchor — '4-outline' had no outline anywhere, and capsule, outline and
// glyph were indistinguishable. `style_match: 'flexible'` is the loosest V4
// offers and it was not loose enough. The anchor pins the art, which is exactly
// what §7e.5 measured it doing; here that is the problem, not the feature.
//
// So the framing moved INTO the prompt (FRAME already carried it) and the style
// reference came off. Composition is described, style is free to vary.
// Pass --anchored to reproduce the failed variant.
const ANCHORED = process.argv.includes('--anchored')
const OUT_DIR = ANCHORED ? 'assets/avatar-styles-anchored' : 'assets/avatar-styles'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const REFS = ['B-S1-roundsquare-primary', 'B-S2-oval-primary', 'B-S4-squarejaw-primary']
const ALL_FACES = [
  { key: 'round', s: 'Broad rounded-square head, jaw as wide as the brow.' },
  { key: 'square', s: 'Heavy wide square jaw, straight jawline, broad flat chin.' },
]
// One face until the six directions are proved to BE six. Adding the second
// head before that just buys two copies of the same failure.
const FACES = process.argv.includes('--bothfaces') ? ALL_FACES : ALL_FACES.slice(0, 1)

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

// Style references must be raster and at least 256px on the short edge.
function rasterise(svgPath) {
  const tmp = mkdtempSync(join(tmpdir(), 'ref-'))
  const page = join(tmp, 'p.html'), png = join(tmp, 'p.png')
  writeFileSync(page, `<html><body style="margin:0;background:#fff"><img src="file://${resolve(svgPath)}" width="1024" height="1024"></body></html>`)
  execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', `--screenshot=${png}`, '--window-size=1024,1024', `file://${page}`], { stdio: 'ignore' })
  return `data:image/png;base64,${readFileSync(png).toString('base64')}`
}

// Held constant across all six so the style is the only thing that moves.
// "Where the body cuts off is perfect" — so the framing is stated, not implied.
const FRAME = [
  'Avatar portrait: head, neck and shoulders only, facing forward, centred.',
  'Cut off flat at the bottom of the shoulders. No arms, no hands, no torso below the shoulders.',
  'Oversized head, narrow neck, shoulders about one and a half head-widths wide.',
  'Two large eyes with clear round pupils, simple brows, one small nose mark, one small mouth mark.',
  'Plain sports top: no logo, no crest, no badge, no text, no numbers.',
  'Round flat background in SportPool blue #3B6EFF. Flat colour, no gradient, no scene.',
  'Reads clearly at 24 pixels.',
].join(' ')

const STYLES = [
  { key: '1-capsule', note: 'capsule grammar (§4.2)',
    p: 'Built only from capsules, circles and rounded bars — every shape is a pill or a disc, nothing has a sharp corner anywhere. Flat solid fills, no outlines. Precise and geometric but warm.' },
  { key: '2-squircle', note: 'the app radii, literally',
    p: 'Every shape is a rounded square with generous even corner radii, like the app cards. Soft squircle head, squared shoulders with rounded corners. Flat fills, confident and tidy.' },
  { key: '3-duotone', note: 'restraint — two colours and skin',
    p: 'Strictly two colours plus a skin tone: deep navy and SportPool blue. Sophisticated and restrained, like a magazine illustration. Large simple masses, no small detail.' },
  { key: '4-outline', note: 'tests §4.2 — outlines are forbidden',
    p: 'A single confident dark outline of even weight around every shape, flat fills inside. Clean, editorial, deliberate. Modern sports branding.' },
  { key: '5-kitforward', note: 'the shirt is the product surface',
    p: 'The sports jersey is the hero: broad squared shoulders, a crisp contrast crew collar and a sleeve trim line. The face is simplified so the kit carries the character.' },
  { key: '6-glyph', note: 'the 24px end of the range',
    p: 'Reduced to the fewest possible shapes, like an icon or a pictogram. Under ten shapes in total. Bold, graphic, instantly readable when tiny.' },
]

mkdirSync(OUT_DIR, { recursive: true })

let style = null
if (ANCHORED) {
  style = await post('/styles', {
    model: 'recraftv4_styles_vector',
    style: 'vector_illustration',
    image_urls: REFS.map((r) => rasterise(join(SRC_DIR, `${r}.svg`))),
  })
  console.log(`anchor style from ${REFS.length} approved bases → ${style.id}\n`)
}
let credits = style ? (style.credits ?? 5) : 0

for (const st of STYLES) {
  for (const face of FACES) {
    const name = `${st.key}-${face.key}`
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const body = { prompt: `${FRAME} ${face.s} ${st.p}`, size: '1024x1024', response_format: 'url' }
        if (style) { body.model = 'recraftv4_styles_vector'; body.style_id = style.id; body.style_match = 'flexible' }
        else body.model = 'recraftv4_1_vector'
        const gen = await post('/images/generations', body)
        const svg = await (await fetch(gen.data[0].url)).text()
        writeFileSync(join(OUT_DIR, `${name}.svg`), svg)
        credits += gen.credits ?? 0
        const fills = new Set([...svg.matchAll(/fill="(rgb\([^)]*\)|#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1]))
        console.log(`✓ ${name.padEnd(20)} ${String((svg.match(/<path/g) || []).length).padStart(4)} paths  ${fills.size} fills   ${st.note}`)
        break
      } catch (e) {
        console.log(`  retry ${attempt} ${name}: ${String(e).slice(0, 120)}`)
      }
    }
  }
}
console.log(`\n${credits} credits ≈ $${(credits / 1000).toFixed(2)}`)
