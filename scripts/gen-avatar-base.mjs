// =============================================================
// The blank base — bald, featureless, three body widths
// =============================================================
// Start from nothing: no hair, no eyes, no brows, no nose, no mouth. Features
// arrive later as parts on top. Three bases differing ONLY in neck and shoulder
// width, on the agreed D-softjaw skull.
//
// Two things are genuinely uncertain and are therefore MEASURED afterwards
// rather than assumed:
//
//   1. Whether Recraft will leave a face blank at all. Every reference in the
//      style has eyes, and §7e.5 showed the style pins composition hard.
//   2. Whether the three widths will actually differ. §7c.1 measured six
//      prompts for a new skull and got the same four shapes back — "Recraft
//      varies surface detail but not underlying structure." Neck and shoulder
//      width is a different axis, so it may or may not hold.
//
//   node scripts/gen-avatar-base.mjs      3 generations ≈ $0.15
// =============================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const OUT_DIR = 'assets/avatar-base'
const STYLE_ID = '2f9cf204-ca8a-457b-a551-030cc2c85add'   // built from Ryan's five picks

const key = readFileSync('.env.local', 'utf8').match(/^RECRAFT_API_KEY=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '')
const post = async (p, b) => {
  const r = await fetch('https://external.api.recraft.ai/v1' + p, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${p} ${r.status} ${t.slice(0, 200)}`)
  return JSON.parse(t)
}

// The blankness is stated many ways on purpose. A single "no face" reads as a
// style note; an itemised list of absences is a specification.
const FRAME = [
  'A completely blank featureless head and shoulders, facing forward, centred.',
  'Totally bald: no hair at all, smooth scalp.',
  'The face is entirely empty: no eyes, no eyebrows, no nose, no mouth, no ears detail, no marks.',
  'Just smooth flat blank skin from the crown to the chin. A mannequin head.',
  'Head as wide as it is tall, widest at the cheeks, narrowing very slightly to a wide soft rounded chin.',
  'Head, neck and shoulders only, cut off flat at the bottom of the shoulders. No arms.',
  'Plain solid blue top with a plain round neckline, no logo, no crest, no text.',
  'One flat skin colour, one flat top colour. No outlines, no shading, no gradients.',
  'Plain flat white background. No circle, no disc, no scene.',
].join(' ')

// The only variable.
const WIDTHS = [
  { key: '1-slim', s: 'A slim narrow neck and narrow sloping shoulders, only slightly wider than the head.' },
  { key: '2-regular', s: 'A medium neck and medium shoulders, about one and a half head-widths wide.' },
  { key: '3-broad', s: 'A thick wide neck and broad square shoulders, about two head-widths wide.' },
]

mkdirSync(OUT_DIR, { recursive: true })
let credits = 0

for (const w of WIDTHS) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const gen = await post('/images/generations', {
        prompt: `${FRAME} ${w.s}`,
        model: 'recraftv4_styles_vector',
        style_id: STYLE_ID,
        style_match: 'precise',
        size: '1024x1024',
        response_format: 'url',
      })
      const svg = await (await fetch(gen.data[0].url)).text()
      writeFileSync(join(OUT_DIR, `${w.key}.svg`), svg)   // as returned, untouched
      credits += gen.credits ?? 0
      console.log(`✓ ${w.key.padEnd(12)} ${String((svg.match(/<path/g) || []).length).padStart(3)} paths`)
      break
    } catch (e) { console.log(`  retry ${attempt} ${w.key}: ${String(e).slice(0, 120)}`) }
  }
}
console.log(`\n${credits} credits ≈ $${(credits / 1000).toFixed(2)}`)
