// =============================================================
// The blank base, in the anchored look — with ears
// =============================================================
// Ryan's call (2026-09-14): the capsule-square style has no ears to keep, so
// generate a base that has them rather than ship the earless decomposition.
// Stated cost of that choice, and he took it anyway: §7c.1 — Recraft cannot
// vary skull STRUCTURE on request, so this is a NEW head, not 1-capsule-square
// with ears added. `assets/avatar-base-capsule/` remains the exact-preserved
// cut; this is the alternative, not a replacement.
//
// How the look is reproduced:
//   ⚠ The source's style_id was LOST. gen-avatar-styles.mjs mints a fresh style
//     on every --anchored run and only ever printed the id. So the style is
//     rebuilt here from the same three approved bases, and this time it is
//     written to manifest.json so the next run can reuse it.
//   §7c.8 — a style_id is the whole ballgame; without one a blank face came
//     back as a BLACK SILHOUETTE all three times (2cf6ff2).
//   ⚠⚠ With a style_id attached the prompt's STYLE words are ignored (measured,
//     gen-avatar-styles.mjs). That was a bug for the six-directions run and is a
//     FEATURE here: the anchor is exactly the look we want held. Only the
//     composition words do any work — bald, blank, ears, jaw, framing.
//
// The blank-face clause is Ryan's own prompt, verbatim, because it is the one
// measured to produce bald + nose + ears + no features (2cf6ff2). The only
// addition is the ear emphasis: with the hair gone there is nothing at the
// temples, and flat sides are exactly what the decomposition exposed.
//
//   node scripts/gen-avatar-base-eared.mjs --smoke   1 generation, ~$0.055
//   node scripts/gen-avatar-base-eared.mjs           6 generations, ~$0.31
//   node scripts/gen-avatar-base-eared.mjs --round   the round-jaw sibling
// =============================================================
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'

const OUT_DIR = 'assets/avatar-base-eared'
const SRC_DIR = 'assets/avatar-sportpool'
const REFS = ['B-S1-roundsquare-primary', 'B-S2-oval-primary', 'B-S4-squarejaw-primary']
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SMOKE = process.argv.includes('--smoke')
const ROUND = process.argv.includes('--round')
const V2 = process.argv.includes('--v2')
const N = SMOKE ? 1 : V2 ? 3 : 6

const key = readFileSync('.env.local', 'utf8').match(/^RECRAFT_API_KEY=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '')
const post = async (p, b) => {
  const r = await fetch('https://external.api.recraft.ai/v1' + p, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${p} ${r.status} ${t.slice(0, 200)}`)
  return JSON.parse(t)
}

// Style references must be raster, ≥256px on the short edge.
function rasterise(svgPath) {
  const tmp = mkdtempSync(join(tmpdir(), 'ref-'))
  const page = join(tmp, 'p.html'), png = join(tmp, 'p.png')
  writeFileSync(page, `<html><body style="margin:0;background:#fff"><img src="file://${resolve(svgPath)}" width="1024" height="1024"></body></html>`)
  execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', `--screenshot=${png}`, '--window-size=1024,1024', `file://${page}`], { stdio: 'ignore' })
  return `data:image/png;base64,${readFileSync(png).toString('base64')}`
}

// ── The prompt ───────────────────────────────────────────────
// FRAME is gen-avatar-styles.mjs's, unchanged except that its features line is
// replaced by BLANK — "two large eyes… one small mouth mark" is the exact thing
// being removed, and leaving it in would have the prompt argue with itself.
const FRAME = [
  'Avatar portrait: head, neck and shoulders only, facing forward, centred.',
  'Cut off flat at the bottom of the shoulders. No arms, no hands, no torso below the shoulders.',
  'Oversized head, narrow neck, shoulders about one and a half head-widths wide.',
  'Plain sports top: no logo, no crest, no badge, no text, no numbers.',
  'Round flat background in SportPool blue #3B6EFF. Flat colour, no gradient, no scene.',
  'Reads clearly at 24 pixels.',
].join(' ')

const BLANK = 'Completely bald with no hair at all. Completely blank face with NO eyes, NO eyebrows, NO mouth.'
  + ' Simple nose and ears must be present, both ears clearly visible, one on each side of the head.'

const FACE = ROUND
  ? 'Broad rounded-square head, jaw as wide as the brow.'
  : 'Heavy wide square jaw, straight jawline, broad flat chin.'

// Ignored while a style_id is attached (see header) — kept so the prompt still
// describes the target if the style is ever detached.
const GRAMMAR = 'Built only from capsules, circles and rounded bars — every shape is a pill or a disc,'
  + ' nothing has a sharp corner anywhere. Flat solid fills, no outlines. Precise and geometric but warm.'

// ⚠ --v2 repairs an omission in the first batch, and it is the SAME omission
// 2cf6ff2 recorded and I repeated: with no shirt colour named, the top came back
// orange, yellow, and once in the disc's own blue. White matches the source's
// shoulders. The mouth negation is reinforced because one of seven drew one
// anyway (§7e.6's degenerate budget, landing bang on ~14%).
const SHIRT = ' The sports top is plain solid white with a simple crew collar — never orange, never yellow,'
  + ' and never the same blue as the background. Absolutely no mouth line and no mouth mark of any kind.'

const PROMPT = `${FRAME} ${BLANK} ${FACE} ${GRAMMAR}${V2 ? SHIRT : ''}`

// ── Run ──────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true })
const manifestPath = join(OUT_DIR, 'manifest.json')
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}

let credits = 0
if (!manifest.style_id) {
  const style = await post('/styles', {
    model: 'recraftv4_styles_vector',
    style: 'vector_illustration',
    image_urls: REFS.map((r) => rasterise(join(SRC_DIR, `${r}.svg`))),
  })
  manifest.style_id = style.id
  manifest.style_refs = REFS
  credits += style.credits ?? 5
  console.log(`anchor style from ${REFS.length} approved bases → ${style.id}`)
} else {
  console.log(`reusing style ${manifest.style_id}`)
}
manifest.generated = manifest.generated ?? []

const tag = `${ROUND ? 'round' : 'square'}${V2 ? '-v2' : ''}`
for (let i = 1; i <= N; i++) {
  const name = `base-${tag}-${String(i).padStart(2, '0')}`
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const gen = await post('/images/generations', {
        prompt: PROMPT, size: '1024x1024', response_format: 'url',
        model: 'recraftv4_styles_vector', style_id: manifest.style_id, style_match: 'flexible',
      })
      // ⚠ Signed URLs expire in ~24h — download on receipt, never "fetch later".
      const svg = await (await fetch(gen.data[0].url)).text()
      writeFileSync(join(OUT_DIR, `${name}.svg`), svg)          // as returned, untouched
      credits += gen.credits ?? 0
      const paths = (svg.match(/<path/g) || []).length
      const fills = new Set([...svg.matchAll(/fill="(rgb\([^)]*\)|#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1]))
      manifest.generated.push({ name, paths, fills: fills.size, prompt: PROMPT })
      console.log(`✓ ${name.padEnd(18)} ${String(paths).padStart(4)} paths  ${fills.size} fills`)
      break
    } catch (e) { console.log(`  retry ${attempt} ${name}: ${String(e).slice(0, 120)}`) }
  }
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`\n${credits} API units ≈ $${(credits / 1000).toFixed(3)}   style_id recorded in ${manifestPath}`)
