// =============================================================
// Base avatar measurement — head, neck and shoulder widths
// =============================================================
// measure-face.mjs finds the face via the eyes. A blank base has no eyes, so
// this is the companion: it works off the width profile of the flattened
// outlines instead.
//
//   head      widest row of the skin path
//   neck      narrowest row of the skin path BELOW the widest one
//   shoulder  width of the shirt element
//
// Ratios are reported against head width, because that is the number that
// barely varies between generations (§7e.3 measured head width at under 5%
// spread while eye separation moved 19%), which makes it the only stable ruler
// in a generated file.
//
//   node scripts/measure-base.mjs <dir>
// =============================================================
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { flatten } from './measure-face.mjs'

const ELEMENT = /<(path|rect|circle|ellipse|polygon)\b[^>]*>/g
const dir = process.argv[2] ?? 'assets/avatar-base3'

// ⚠ Rows need enough points to BE a row. At a 24-unit bucket many rows held a
// single point, which reads as zero width, and "narrowest row" then returned
// 0 for every file. 64 units with a 3-point floor gives a profile that matches
// the drawing: head 1092 at y≈800, neck 420 from y≈1400.
const profile = (pts, bucket = 64) => {
  const rows = new Map()
  for (const [x, y] of pts) {
    const r = Math.round(y / bucket) * bucket
    const v = rows.get(r) || [1e9, -1e9, 0]
    rows.set(r, [Math.min(v[0], x), Math.max(v[1], x), v[2] + 1])
  }
  return [...rows.entries()].filter(([, v]) => v[2] >= 3)
    .map(([y, [a, b]]) => ({ y, w: b - a })).sort((a, b) => a.y - b.y)
}

console.log(`${'file'.padEnd(16)}${'head'.padStart(7)}${'neck'.padStart(7)}${'shoulder'.padStart(10)}   ${'neck/head'.padStart(10)}${'shoulder/head'.padStart(15)}   background`)
for (const f of readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()) {
  const svg = readFileSync(join(dir, f), 'utf8')
  const els = []
  for (const tag of svg.match(ELEMENT) || []) {
    const d = (tag.match(/ d="([^"]*)"/) || [])[1]
    if (!d) continue
    const pts = flatten(d)
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    els.push({ fill: (tag.match(/fill="([^"]*)"/) || [])[1], pts,
      w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
      y1: Math.max(...ys), area: (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) })
  }
  // ⚠ The canvas and the background are TWO elements: the green is a rounded
  // rect inset inside a white canvas, so "largest area" reported the file as
  // having a white background on the two that have a margin.
  const canvas = els.reduce((a, b) => (b.area > a.area ? b : a))
  const bg = els.filter((e) => e !== canvas).reduce((a, b) => (b.area > a.area ? b : a))
  const rest = els.filter((e) => e !== canvas && e !== bg)
  const skin = rest.reduce((a, b) => (b.area > a.area ? b : a))
  // the shirt reaches the bottom edge and is not the skin
  const shirt = rest.filter((e) => e !== skin).reduce((a, b) => (b.y1 > a.y1 ? b : a))

  const rows = profile(skin.pts)
  const widest = rows.reduce((a, b) => (b.w > a.w ? b : a))
  // the neck is between the widest row and the top of the shirt
  const shirtTop = Math.min(...shirt.pts.map((p) => p[1]))
  const below = rows.filter((r) => r.y > widest.y && r.y < shirtTop && r.w > 0)
  const neck = below.length ? below.reduce((a, b) => (b.w < a.w ? b : a)) : { w: NaN }

  console.log(`${f.replace('.svg', '').padEnd(16)}${widest.w.toFixed(0).padStart(7)}${neck.w.toFixed(0).padStart(7)}${shirt.w.toFixed(0).padStart(10)}   ${(neck.w / widest.w).toFixed(2).padStart(10)}${(shirt.w / widest.w).toFixed(2).padStart(15)}   ${bg.fill}`)
}
