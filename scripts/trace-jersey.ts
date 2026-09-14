// =============================================================
// Trace the approved jersey reference into one SVG path
// =============================================================
// The generated sheet is raster, and the app needs ~100 club colours out of one
// shape — so the reference has to become a path we can fill. No tracer is
// installed, but this repo already decodes PNG for the competition silhouettes.
//
//   npx tsx scripts/trace-jersey.ts <column 0-3>
//
// Marching squares for the outer contour, Douglas–Peucker to simplify, then
// normalised into a 0–120 viewBox so it drops straight into the harness.
// =============================================================
import { decodePng } from './lib/png'

const COL = Number(process.argv[2] ?? 2)
const { w, h, data } = decodePng('assets/jersey-explore/sheet-b.png')

// Ink = anything that is not the white ground. The white NUMBER sits inside the
// shirt and would read as ground, so we only ever walk the OUTER contour.
const isInk = (x: number, y: number) => {
  if (x < 0 || y < 0 || x >= w || y >= h) return false
  const i = (y * w + x) * 4
  const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
  if (a < 40) return false
  return !(r > 225 && g > 225 && b > 225)
}

// The sheet is four shirts in a row; take one column's worth.
const x0 = Math.floor((w / 4) * COL), x1 = Math.floor((w / 4) * (COL + 1))
let minX = x1, minY = h, maxX = x0, maxY = 0
for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) if (isInk(x, y)) {
  if (x < minX) minX = x; if (x > maxX) maxX = x
  if (y < minY) minY = y; if (y > maxY) maxY = y
}
if (maxX <= minX) { console.error('no ink found in column', COL); process.exit(1) }

// Walk the boundary: start at the topmost-leftmost ink pixel, keep the ink on
// the right (Moore neighbourhood, 8-connected).
const start: [number, number] = (() => {
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (isInk(x, y)) return [x, y]
  return [minX, minY]
})()
const N: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
const pts: [number, number][] = []
let cur = start, dir = 6, guard = 0
do {
  pts.push([cur[0], cur[1]])
  let found = false
  for (let k = 0; k < 8; k++) {
    const d = (dir + 6 + k) % 8
    const nx = cur[0] + N[d][0], ny = cur[1] + N[d][1]
    if (isInk(nx, ny)) { cur = [nx, ny]; dir = d; found = true; break }
  }
  if (!found) break
} while (!(cur[0] === start[0] && cur[1] === start[1]) && ++guard < 200000)

// Douglas–Peucker.
function simplify(p: [number, number][], eps: number): [number, number][] {
  if (p.length < 3) return p
  const [a, b] = [p[0], p[p.length - 1]]
  let idx = 0, max = 0
  const d = (q: [number, number]) => {
    const [x, y] = q, dx = b[0] - a[0], dy = b[1] - a[1]
    const den = Math.hypot(dx, dy) || 1
    return Math.abs(dy * x - dx * y + b[0] * a[1] - b[1] * a[0]) / den
  }
  for (let i = 1; i < p.length - 1; i++) { const dd = d(p[i]); if (dd > max) { max = dd; idx = i } }
  if (max <= eps) return [a, b]
  return [...simplify(p.slice(0, idx + 1), eps).slice(0, -1), ...simplify(p.slice(idx), eps)]
}
const eps = (maxX - minX) * 0.004
const simp = simplify(pts, eps)

// Normalise into a 0–120 box, centred, with the shirt 100 units tall.
const sw = maxX - minX, sh = maxY - minY
const scale = 100 / sh
const ox = 60 - (sw * scale) / 2, oy = 10
const n = (x: number, y: number): [number, number] => [
  +((x - minX) * scale + ox).toFixed(2),
  +((y - minY) * scale + oy).toFixed(2),
]

// Emit as a smooth path: every simplified vertex becomes a quadratic joint, so
// the corners read as rounded rather than faceted.
const P = simp.map(([x, y]) => n(x, y))
const mid = (a: number[], b: number[]) => [((a[0] + b[0]) / 2).toFixed(2), ((a[1] + b[1]) / 2).toFixed(2)]
let dStr = `M${mid(P[P.length - 1], P[0]).join(' ')}`
for (let i = 0; i < P.length; i++) {
  const cp = P[i], nxt = P[(i + 1) % P.length]
  dStr += `Q${cp[0]} ${cp[1]} ${mid(cp, nxt).join(' ')}`
}
dStr += 'Z'

console.log(`column ${COL}: ${pts.length} boundary px → ${simp.length} points, eps ${eps.toFixed(2)}`)
console.log(dStr)
