// =============================================================
// Face proportion measurement — the shared detector
// =============================================================
// Finds the face in a generated avatar and reports width ÷ height. Written once
// here because three different ad-hoc versions have now been wrong, each in the
// way §7c.3 and §7e.7 predicted:
//
//   ⚠ "largest non-canvas element"  → in a long-hair file that is the HAIR, so
//     it compared hair to face and reported 26.5% drift where there was 14.5%.
//   ⚠ "nested pair ranked by area"  → a PONYTAIL is a dark shape with something
//     nested in it, and it outranked a real eye. Exactly §7e.7's cornrow braids
//     passing every test at 645px apart.
//
// What actually works: eyes are a MIRRORED PAIR — same height, equal and
// opposite distance from the axis. The face is then the smallest element
// containing both, since the hair contains them too whenever it is long.
//
//   node scripts/measure-face.mjs <file.svg> [...]
// =============================================================
import { readFileSync } from 'fs'

const ELEMENT = /<(path|rect|circle|ellipse|polygon)\b[^>]*>/g

export const flatten = (d, steps = 16) => {
  const toks = d.match(/[MLCZz]|-?\d*\.?\d+(?:e-?\d+)?/g) || []
  const pts = []
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, cmd = 'M'
  const num = () => Number(toks[i++])
  while (i < toks.length) {
    if (/[MLCZz]/.test(toks[i])) cmd = toks[i++]
    if (cmd === 'Z' || cmd === 'z') { cx = sx; cy = sy; continue }
    if (cmd === 'M') { cx = num(); cy = num(); sx = cx; sy = cy; pts.push([cx, cy]); cmd = 'L'; continue }
    if (cmd === 'L') { cx = num(); cy = num(); pts.push([cx, cy]); continue }
    const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num()
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, u = 1 - t
      pts.push([u ** 3 * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x,
                u ** 3 * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y])
    }
    cx = x; cy = y
  }
  return pts
}

const contains = (a, b) => a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3]

export function measureFace(file) {
  const svg = readFileSync(file, 'utf8')
  const els = []
  for (const tag of svg.match(ELEMENT) || []) {
    const d = (tag.match(/ d="([^"]*)"/) || [])[1]
    if (!d) continue
    const p = flatten(d)
    const bb = p.reduce((a, [x, y]) => [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)], [1e9, 1e9, -1e9, -1e9])
    els.push({ bb, w: bb[2] - bb[0], h: bb[3] - bb[1], cx: (bb[0] + bb[2]) / 2, cy: (bb[1] + bb[3]) / 2, area: (bb[2] - bb[0]) * (bb[3] - bb[1]) })
  }
  if (!els.length) return { error: 'no drawable elements' }
  const canvas = els.reduce((a, b) => (b.area > a.area ? b : a))
  const axis = canvas.cx

  // Nesting narrows the field; symmetry picks the pair out of it.
  const nested = els.filter((e) => e.area < canvas.area * 0.06 && els.some((x) => x !== e && contains(e.bb, x.bb)))
  let eyes = null, best = Infinity
  for (let a = 0; a < nested.length; a++) for (let b = a + 1; b < nested.length; b++) {
    const A = nested[a], B = nested[b]
    const sameHeight = Math.abs(A.cy - B.cy) / canvas.h
    const mirrored = Math.abs((A.cx - axis) + (B.cx - axis)) / canvas.w
    const sameSize = Math.abs(A.area - B.area) / Math.max(A.area, B.area)
    const opposite = (A.cx - axis) * (B.cx - axis) < 0      // one each side of the axis
    if (!opposite) continue
    const score = sameHeight * 3 + mirrored * 3 + sameSize
    if (score < best) { best = score; eyes = [A, B] }
  }
  if (!eyes) return { error: 'no mirrored nested pair — eyes not found' }

  // The hair contains the eyes too when it is long; the face is the smaller.
  const holders = els.filter((e) => eyes.every((y) => contains(e.bb, y.bb)) && e.area < canvas.area * 0.95)
  if (!holders.length) return { error: 'nothing contains both eyes' }
  const face = holders.reduce((a, b) => (b.area < a.area ? b : a))
  return { w: face.w, h: face.h, ratio: face.w / face.h, eyeScore: best }
}

if (process.argv[2]) {
  for (const f of process.argv.slice(2)) {
    const r = measureFace(f)
    console.log(r.error ? `${f.split('/').pop().padEnd(26)} ✗ ${r.error}`
      : `${f.split('/').pop().padEnd(26)} ${r.w.toFixed(0)} x ${r.h.toFixed(0)}   w/h ${r.ratio.toFixed(2)}`)
  }
}
