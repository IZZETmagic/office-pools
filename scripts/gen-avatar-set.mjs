// =============================================================
// The final set, generated — six head shapes × two hair lengths
// =============================================================
// ⭐ NO GEOMETRY POST-PROCESSING. Everything Recraft returns is written to disk
// exactly as it arrives. Three attempts at editing the generated art by hand
// each degraded it, and each failure had the same shape: the file does not mean
// what it looks like. The two blue shapes are a mask painted OVER the skin, not
// a background behind it, so deleting them unmasked the face. The skin path is
// canvas-wide, so using it as a hole produced a halo instead of hair. The art
// is a picture, not a component (§7c.3), and it should be regenerated, never
// repaired.
//
// The style is the one approved on sight — the 5a anchor, built from the
// round-4 bases. Every variable but the skull and the hair is pinned by it.
//
//   node scripts/gen-avatar-set.mjs        12 generations ≈ $0.60
//   node scripts/gen-avatar-set.mjs --dry  print the prompts, spend nothing
// =============================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const OUT_DIR = 'assets/avatar-set'
const STYLE_ID = '117d0079-78f7-4bdb-b2dd-dfaebfd625fa'   // the 5a anchor
const DRY = process.argv.includes('--dry')

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

// Held constant. The framing was approved as-is — "where the body cuts off is
// perfect" — so it is stated explicitly rather than left to the style.
const FRAME = [
  'Avatar portrait: head, neck and shoulders only, facing forward, centred.',
  'Cut off flat at the bottom of the shoulders. No arms, no hands, no torso below the shoulders.',
  'Oversized head, narrow neck, shoulders about one and a half head-widths wide.',
  'Warm friendly face, natural skin tone, two large eyes with clear round pupils,',
  'simple flat brows, one small nose mark, one small mouth mark.',
  'Plain sports top: no logo, no crest, no badge, no text, no numbers.',
  // ⚠⚠ NO DISC IN THE ART. Four phrasings of "a bigger circle that contains the
  // figure" were tested against both style_match modes and all four came back
  // with the head bursting out of the disc: the style pins the composition and
  // every reference it was built from has that overflow (§7e.5, and round 5a).
  // The way out is not a better sentence — it is to stop baking a disc into the
  // art at all. The app already owns that ground: avatarGradient supplies the
  // user's identity colour and the avatar component draws the circle. A
  // disc-free figure can then sit on a ground of ANY size, which is what
  // "encapsulates the whole avatar" actually needs.
  'Plain flat white background. No circle, no disc, no coloured shape behind the figure, no scene.',
  // Pinned so the six differ by SKULL, not by hair and shirt colour rerolling.
  // ⚠ NOT a white top: on a white background the shoulders disappear and every
  // short-hair figure came back as a head on a bare neck stub. The kit has to
  // carry a colour to exist at all.
  'Dark brown hair. Plain solid blue top with a clearly visible pair of shoulders.',
  'Reads clearly at 24 pixels.',
].join(' ')

const SHAPES = [
  { key: '1-base', s: 'Broad rounded-square head, jaw as wide as the brow.' },
  { key: '2-widejaw', s: 'Heavy wide jaw, noticeably wider than the brow, full cheeks.' },
  { key: '3-tapered', s: 'Wide cheekbones narrowing sharply to a small pointed chin.' },
  { key: '4-squarejaw', s: 'Square jaw with straight sides and a broad flat chin, distinct corners.' },
  { key: '5-narrow', s: 'Narrow head throughout, slim cheeks and a slim jaw.' },
  { key: '6-long', s: 'Long head, tall forehead and a long jaw, clearly taller than wide.' },
]

const HAIR = [
  { key: 'short', s: 'Short neat hair as one solid mass, ears visible.' },
  { key: 'long', s: 'Long hair as one solid mass falling past the jaw on both sides and framing the face.' },
]

mkdirSync(OUT_DIR, { recursive: true })
let credits = 0

for (const shape of SHAPES) {
  for (const hair of HAIR) {
    const name = `${shape.key}-${hair.key}`
    const prompt = `${FRAME} ${shape.s} ${hair.s}`
    if (DRY) { console.log(`— ${name}\n  ${prompt}\n`); continue }
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const gen = await post('/images/generations', {
          prompt,
          model: 'recraftv4_styles_vector',
          style_id: STYLE_ID,
          style_match: 'precise',   // 'flexible' kept the disc; 'precise' dropped it

          size: '1024x1024',
          response_format: 'url',
        })
        const svg = await (await fetch(gen.data[0].url)).text()
        writeFileSync(join(OUT_DIR, `${name}.svg`), svg)   // as returned, untouched
        credits += gen.credits ?? 0
        const fills = new Set([...svg.matchAll(/fill="(rgb\([^)]*\)|#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1]))
        console.log(`✓ ${name.padEnd(18)} ${String((svg.match(/<path/g) || []).length).padStart(4)} paths  ${fills.size} fills`)
        break
      } catch (e) {
        console.log(`  retry ${attempt} ${name}: ${String(e).slice(0, 140)}`)
      }
    }
  }
}
if (!DRY) console.log(`\n${credits} credits ≈ $${(credits / 1000).toFixed(2)}`)
