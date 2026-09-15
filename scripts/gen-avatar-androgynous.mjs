// =============================================================
// One base that reads as EITHER — the candidates, and the test
// =============================================================
// The brief: a single face shape that works masculine or feminine, with hair
// and features doing the gendering. §7c.7 reached the same place from the other
// side — "what reads as gendered is jaw width, and that reading flips entirely
// once hair is on. Show the silhouettes and let hair do the work."
//
// ⭐ The search space comes from Ryan's five picks, measured: every one sits at
// face width ÷ height between 0.90 and 1.02, and everything he rejected falls
// outside it (widejaw 0.79, tapered 0.81, long 0.72, narrow 1.13). So the
// candidates vary CHARACTER inside that band — corners, jaw, softness — rather
// than running along a wide-to-long axis.
//
// ⭐ THE ACCEPTANCE TEST IS CODE, not my eye (§7e.9). Each candidate is
// generated twice from an IDENTICAL skull description, changing only the hair.
// A base that holds its proportions across that change is doing the work
// itself; one whose face narrows the moment you say "long hair" is not a base,
// it is the generator gendering the skull for us — which is the exact thing
// this brief is trying to avoid.
//
//   node scripts/gen-avatar-androgynous.mjs   1 style + 8 generations ≈ $0.41
// =============================================================
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'

const PICKS = 'assets/avatar-picks'
const OUT_DIR = 'assets/avatar-androgynous'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const key = readFileSync('.env.local', 'utf8').match(/^RECRAFT_API_KEY=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '')
const post = async (p, b) => {
  const r = await fetch('https://external.api.recraft.ai/v1' + p, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${p} ${r.status} ${t.slice(0, 200)}`)
  return JSON.parse(t)
}
function rasterise(svgPath) {
  const tmp = mkdtempSync(join(tmpdir(), 'pick-'))
  const page = join(tmp, 'p.html'), png = join(tmp, 'p.png')
  writeFileSync(page, `<html><body style="margin:0;background:#fff"><img src="file://${resolve(svgPath)}" width="1024" height="1024"></body></html>`)
  execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', `--screenshot=${png}`, '--window-size=1024,1024', `file://${page}`], { stdio: 'ignore' })
  return `data:image/png;base64,${readFileSync(png).toString('base64')}`
}

// Disc-free: round 8 established the style will not give up its tight disc to
// any prompt, and the app owns that ground anyway (avatarGradient + the avatar
// component draw the circle, at whatever size the surface needs).
const FRAME = [
  'Avatar portrait: head, neck and shoulders only, facing forward, centred.',
  'Cut off flat at the bottom of the shoulders. No arms, no hands.',
  'Oversized head, narrow neck, clearly visible shoulders.',
  'Warm friendly face, natural skin tone, large eyes with round pupils,',
  'simple flat brows, one small nose mark, one small mouth mark.',
  'Plain solid blue top, no logo, no crest, no text, no numbers.',
  'Plain flat white background. No circle, no disc, no coloured shape behind the figure, no scene.',
  'Dark brown hair. Reads clearly at 24 pixels.',
].join(' ')

// All four are as wide as they are tall. They differ in how the jaw is drawn,
// which is the variable §7c.7 says carries the gender reading.
const CANDIDATES = [
  { key: 'A-softsquare', s: 'Head as wide as it is tall, square jaw with generously rounded corners, flat broad chin.' },
  { key: 'B-round', s: 'Head as wide as it is tall, evenly rounded all the way around, no corners and no visible jaw line.' },
  { key: 'C-squircle', s: 'Head as wide as it is tall, straight flat sides and a flat bottom with softly rounded corners, like a rounded square.' },
  { key: 'D-softjaw', s: 'Head as wide as it is tall, widest at the cheeks, narrowing very slightly to a wide soft rounded chin.' },
]

// ⚠ The ONLY difference between the two runs of a candidate. No word here may
// describe a face, or the test measures the prompt instead of the skull.
const HAIR = [
  { key: 'short', s: 'Short neat hair as one solid mass, ears visible.' },
  { key: 'long', s: 'Long hair as one solid mass falling past the jaw on both sides.' },
]

mkdirSync(OUT_DIR, { recursive: true })
const refs = readdirSync(PICKS).filter((f) => f.endsWith('.svg')).sort()
const style = await post('/styles', {
  model: 'recraftv4_styles_vector',
  style: 'vector_illustration',
  image_urls: refs.map((f) => rasterise(join(PICKS, f))),
})
console.log(`style from ${refs.length} picks → ${style.id}\n`)
let credits = style.credits ?? 5

for (const c of CANDIDATES) {
  for (const h of HAIR) {
    const name = `${c.key}-${h.key}`
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const gen = await post('/images/generations', {
          prompt: `${FRAME} ${c.s} ${h.s}`,
          model: 'recraftv4_styles_vector',
          style_id: style.id,
          style_match: 'precise',   // round 8: 'flexible' kept the disc, 'precise' dropped it
          size: '1024x1024',
          response_format: 'url',
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
