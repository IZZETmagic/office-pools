// =============================================================
// The hair catalogue — one skull, many hairstyles
// =============================================================
// The base is D-softjaw: widest at the cheeks, narrowing slightly to a wide
// soft chin. Chosen on measurement — least skull drift between hair lengths
// (8.0% against 14.5 / 16.2 / 21.7) and the only candidate inside Ryan's
// 0.90-1.02 band both times.
//
// Everything is held constant except the hairstyle clause, because §7e's parts
// route needs matched pairs: every whole-avatar generation is a head AND a hair
// drawn together, so the hair part comes free with the avatar. Verified on our
// own art — dropping the hair paths leaves a complete bald head, and the hair
// lifts out as a single slab drawn behind the face.
//
// ⚠ The skull WILL still drift a few percent between generations. That is
// expected and it stops mattering once the base is one fixed asset: these are
// generated to harvest their HAIR, not their heads.
//
//   node scripts/gen-avatar-hair.mjs ponytail
//   node scripts/gen-avatar-hair.mjs            all styles in the list
// =============================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const OUT_DIR = 'assets/avatar-hair'
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

const FRAME = [
  'Avatar portrait: head, neck and shoulders only, facing forward, centred.',
  'Cut off flat at the bottom of the shoulders. No arms, no hands.',
  'Oversized head, narrow neck, clearly visible shoulders.',
  'Warm friendly face, natural skin tone, large eyes with round pupils,',
  'simple flat brows, one small nose mark, one small mouth mark.',
  'Plain solid blue top, no logo, no crest, no text, no numbers.',
  'Plain flat white background. No circle, no disc, no coloured shape behind the figure, no scene.',
  'Dark brown hair. Reads clearly at 24 pixels.',
  // The D-softjaw skull, word for word from the candidate that won.
  'Head as wide as it is tall, widest at the cheeks, narrowing very slightly to a wide soft rounded chin.',
].join(' ')

const STYLES = {
  // A ponytail is mostly BEHIND the head from the front, so each variant says
  // explicitly where the tail should be visible — otherwise it reads as a bun.
  'ponytail-high': 'Hair pulled back smoothly into a high ponytail on top of the back of the head, with the tail visible above and behind the shoulders.',
  'ponytail-low': 'Hair pulled back smoothly into a low ponytail at the nape of the neck, with the tail falling visibly behind one shoulder.',
  'ponytail-side': 'Hair pulled back smoothly into a ponytail, the tail draped forward over one shoulder and clearly visible at the front.',
}

const wanted = process.argv[2]
const picked = Object.entries(STYLES).filter(([k]) => !wanted || k.includes(wanted))
mkdirSync(OUT_DIR, { recursive: true })
let credits = 0

for (const [name, hair] of picked) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const gen = await post('/images/generations', {
        prompt: `${FRAME} ${hair}`,
        model: 'recraftv4_styles_vector',
        style_id: STYLE_ID,
        style_match: 'precise',
        size: '1024x1024',
        response_format: 'url',
      })
      const svg = await (await fetch(gen.data[0].url)).text()
      writeFileSync(join(OUT_DIR, `${name}.svg`), svg)   // as returned, untouched
      credits += gen.credits ?? 0
      console.log(`✓ ${name.padEnd(16)} ${String((svg.match(/<path/g) || []).length).padStart(3)} paths`)
      break
    } catch (e) { console.log(`  retry ${attempt} ${name}: ${String(e).slice(0, 120)}`) }
  }
}
console.log(`\n${credits} credits ≈ $${(credits / 1000).toFixed(2)}`)
