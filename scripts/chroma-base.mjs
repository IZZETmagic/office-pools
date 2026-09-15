// =============================================================
// The chosen base on a chroma key — drop the disc, flood the frame
// =============================================================
// Ryan picked base-square-05 and asked for the blue circle gone and the whole
// background green. That is a pure fill swap: §7c.4, generate for form and
// recolour for palette, never regenerate art that has been picked.
//
// ⚠⚠ THE SHOULDERS ARE THE BACKGROUND, NOT A SHIRT. Verified by repainting the
// canvas magenta: the white shoulder shapes went magenta with it. This style
// draws no shirt path at all — the "top" is the canvas showing through a gap in
// the mask, exactly as it is in the 1-capsule-square source. So flooding the
// frame green necessarily floods the shirt, and the figure ends at the neck.
// That is a consequence of the construction, not a bug in the recolour, and it
// is 2cf6ff2's lesson again: a chroma key only works if it is the one colour
// nothing else shares — here the background and the shirt ARE the same shape.
//
// ⭐ Which is arguably the right shape for a parts model anyway: §5.4 makes the
// kit a cosmetic layer, and a base that ends at the neck lets the kit be a part
// rather than something baked into the head.
//
// The three roles are not re-derived here (recolour-avatar.mjs does that the
// hard way, from rendered geometry). They were measured directly off this file:
// canvas = the element whose bbox is the whole canvas, ground = the two halves
// sharing the blue fill. §7c.3's "a shape is not an element" still applies —
// the disc is TWO paths and both must move.
//
//   node scripts/chroma-base.mjs
// =============================================================
import { readFileSync, writeFileSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'
import sharp from 'sharp'

const SRC = 'assets/avatar-base-eared/base-square-05.svg'
const OUT = 'assets/avatar-base-eared/base-square-05-green.svg'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

// The green base3's own generation came back with — reused so the key is one
// value across every base we hold, not a new one invented per file.
const CHROMA = 'rgb(0,170,102)'
const CANVAS = 'rgb(254,254,254)'
const GROUND = 'rgb(60,106,254)'

const src = readFileSync(SRC, 'utf8')
// Counted by split, not by regex — "rgb(254,254,254)" is a capture group, and a
// half-escaped pair silently counts zero rather than failing.
const count = (hay, needle) => hay.split(needle).length - 1
const before = { canvas: count(src, CANVAS), ground: count(src, GROUND) }
if (before.canvas !== 1 || before.ground !== 2) {
  console.error(`✗ expected 1 canvas + 2 ground fills, found ${before.canvas} + ${before.ground}`)
  process.exit(1)
}

const out = src.split(CANVAS).join(CHROMA).split(GROUND).join(CHROMA)
writeFileSync(OUT, out)

// ── Verify on the RENDER, not the source ─────────────────────
// §7e.9: the acceptance criterion is code. A grep proving the string is gone
// says nothing about whether the frame actually reads as one flat key.
const tmp = mkdtempSync(join(tmpdir(), 'chroma-'))
const page = join(tmp, 'p.html'), png = join(tmp, 'p.png')
writeFileSync(page, `<html><body style="margin:0"><img src="file://${process.cwd()}/${OUT}" width="900" height="900"></body></html>`)
execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', `--screenshot=${png}`, '--window-size=900,900', `file://${page}`], { stdio: 'ignore' })

const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
const tally = {}
let blue = 0
for (let i = 0; i < data.length; i += info.channels) {
  const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
  tally[`${r},${g},${b}`] = (tally[`${r},${g},${b}`] || 0) + 1
  if (b > 200 && r < 120 && g < 160) blue++            // any survivor of the disc
}
const total = info.width * info.height
const [topColour, topCount] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]

const checks = [
  ['no blue survives anywhere in the render', blue === 0, `${blue} px`],
  ['the key is the chroma green', topColour === '0,170,102', `rgb(${topColour})`],
  ['the key floods the frame (>55%)', topCount / total > 0.55, `${(topCount * 100 / total).toFixed(1)}%`],
]
console.log(`${OUT}\n`)
for (const [label, ok, detail] of checks) console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(42)} ${detail}`)
console.log(`\n  ⚠ the figure now ends at the neck — the shoulders were the canvas`)
if (!checks.every(([, ok]) => ok)) process.exit(1)
