// =============================================================
// The blank base — Ryan's prompt, three body widths
// =============================================================
// Prompt supplied by Ryan (from outside help) and used VERBATIM. The only
// addition is the neck/shoulder clause, which is the variable under test.
//
// ⭐ The bright green background is the interesting part: it is a chroma key,
// so the background can be lifted cleanly and the app can put the figure on the
// user's identity colour at any size. That solves the disc problem properly —
// round 8 established the style will not give up its own disc to any prompt,
// and this sidesteps the argument entirely.
//
// Run twice, because the two halves of the brief pull against each other:
//   styled    keeps our approved look, but the style has a white/blue ground
//             baked into every reference and may refuse the green.
//   unstyled  honours the prompt as written, and may lose the look.
//
//   node scripts/gen-avatar-base2.mjs     6 generations ≈ $0.39
// =============================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const OUT_DIR = 'assets/avatar-base2'
const STYLE_ID = '2f9cf204-ca8a-457b-a551-030cc2c85add'

const key = readFileSync('.env.local', 'utf8').match(/^RECRAFT_API_KEY=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '')
const post = async (p, b) => {
  const r = await fetch('https://external.api.recraft.ai/v1' + p, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${p} ${r.status} ${t.slice(0, 200)}`)
  return JSON.parse(t)
}

// Verbatim, unedited.
const PROMPT = 'Minimalist 2D vector avatar icon of a completely bald person, shoulders up, facing directly forward. Perfect center alignment. Completely blank face with NO eyes, NO eyebrows, NO mouth. Simple nose and ears must be present. Wearing a basic crewneck collar shirt. Solid flat colors, hard geometric edges, absolute symmetry. Bright green background.'

const WIDTHS = [
  { key: '1-slim', s: 'A slim narrow neck and narrow sloping shoulders, only slightly wider than the head.' },
  { key: '2-regular', s: 'A medium neck and medium shoulders, about one and a half head-widths wide.' },
  { key: '3-broad', s: 'A thick wide neck and broad square shoulders, about two head-widths wide.' },
]

const RUNS = [
  { tag: 'styled', body: { model: 'recraftv4_styles_vector', style_id: STYLE_ID, style_match: 'precise' } },
  { tag: 'plain', body: { model: 'recraftv4_1_vector' } },
]

mkdirSync(OUT_DIR, { recursive: true })
let credits = 0

for (const run of RUNS) {
  for (const w of WIDTHS) {
    const name = `${run.tag}-${w.key}`
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const gen = await post('/images/generations', {
          prompt: `${PROMPT} ${w.s}`, size: '1024x1024', response_format: 'url', ...run.body,
        })
        const svg = await (await fetch(gen.data[0].url)).text()
        writeFileSync(join(OUT_DIR, `${name}.svg`), svg)   // as returned, untouched
        credits += gen.credits ?? 0
        console.log(`✓ ${name.padEnd(18)} ${String((svg.match(/<path/g) || []).length).padStart(3)} paths`)
        break
      } catch (e) { console.log(`  retry ${attempt} ${name}: ${String(e).slice(0, 120)}`) }
    }
  }
}
console.log(`\n${credits} credits ≈ $${(credits / 1000).toFixed(2)}`)
