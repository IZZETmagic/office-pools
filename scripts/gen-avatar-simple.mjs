// =============================================================
// Base avatar — round 3: SIMPLER, and two ways of getting there
// =============================================================
// Round 2 was rejected: too complex. The feedback was the style in the
// reference, and fewer shapes. So this round strips the prompt to the bone and
// runs the identical five head shapes twice:
//
//   A  prompt only   — V4.1 vector, no style at all
//   B  reference-led — the reference tiles become a vector style, which then
//                      carries the look so the prompt only has to say who
//
// ⚠ Track B's style is built from third-party character art supplied for
// direction. Fine for exploring; the licence question bites when art generated
// from it is SHIPPED, and §7c.8's licence note already says a Recraft asset may
// not be copyrightable at all. Flagged, not decided here.
//
//   node scripts/gen-avatar-simple.mjs A     ≈ $0.40
//   node scripts/gen-avatar-simple.mjs B     ≈ $0.26
// =============================================================
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'

const TRACK = (process.argv[2] ?? 'A').toUpperCase()
const OUT_DIR = `assets/avatar-simple-${TRACK.toLowerCase()}`
const REF_DIR = '/tmp/duoref'

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

// Every clause here removes something. Round 2 failed by addition — carved
// hair, a yoke, a collar, ears, a neck, a vignette — so this prompt is written
// as a subtraction list and the positives are held to one shape each.
const BASE = [
  'Extremely simple flat vector avatar, head and shoulders, facing forward, centred.',
  'Only four flat colours in total.',
  'The head and face are one single solid skin shape.',
  'The hair is one single solid mass, no strands, no notches, no parting.',
  'Two large white almond eyes, each with one dark round pupil.',
  'Eyebrows are two short flat dark marks. The nose is one tiny simple mark. The mouth is one tiny simple mark.',
  'No ears, no neck, no shading, no highlights, no outlines, no gradients, no shadows, no texture, no small details.',
  'The shoulders are one plain solid shape cut off flat at the bottom edge:',
  'no collar, no logo, no crest, no text, no numbers.',
  'Flat solid single-colour round background, no vignette, no scene.',
  'The head fills most of the frame. Bold, minimal, friendly, like a simple app profile icon.',
].join(' ')

const SHAPES = [
  { key: 'S1-roundsquare', s: 'Broad rounded-square head, jaw as wide as the brow.' },
  { key: 'S2-oval', s: 'Smooth oval head, gently tapering to a soft rounded chin.' },
  { key: 'S3-tapered', s: 'Wide cheekbones narrowing sharply to a small pointed chin.' },
  { key: 'S4-squarejaw', s: 'Heavy wide square jaw, straight jawline, broad flat chin.' },
  { key: 'S5-long', s: 'Long narrow head, tall forehead, slim jaw, taller than wide.' },
]

let styleId = null
let credits = 0
if (TRACK === 'B') {
  const refs = readdirSync(REF_DIR).filter((f) => f.startsWith('ref') && f.endsWith('.png')).sort()
  const style = await post('/styles', {
    model: 'recraftv4_styles_vector',
    style: 'vector_illustration',
    image_urls: refs.map((f) => `data:image/png;base64,${readFileSync(join(REF_DIR, f)).toString('base64')}`),
  })
  styleId = style.id
  credits += style.credits ?? 5
  console.log(`style from ${refs.length} references → ${styleId}`)
}

mkdirSync(OUT_DIR, { recursive: true })

// One at a time with retries: round 2 lost three generations to transient
// fetch failures, and a retry is far cheaper than a re-run.
for (const shape of SHAPES) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const body = { prompt: `${BASE} ${shape.s}`, size: '1024x1024', response_format: 'url' }
      if (styleId) { body.model = 'recraftv4_styles_vector'; body.style_id = styleId }
      else body.model = 'recraftv4_1_vector'

      const gen = await post('/images/generations', body)
      const svg = await (await fetch(gen.data[0].url)).text()
      writeFileSync(join(OUT_DIR, `${TRACK}-${shape.key}.svg`), svg)
      credits += gen.credits ?? 0
      const fills = new Set([...svg.matchAll(/fill="(#[0-9a-fA-F]{3,8}|rgb\([^)]*\))"/g)].map((m) => m[1]))
      console.log(`✓ ${TRACK}-${shape.key.padEnd(16)} ${String((svg.match(/<path/g) || []).length).padStart(4)} paths  ${fills.size} fills`)
      break
    } catch (e) {
      console.log(`  retry ${attempt} ${shape.key}: ${String(e).slice(0, 120)}`)
    }
  }
}
console.log(`\n${credits} credits ≈ $${(credits / 1000).toFixed(2)}`)
