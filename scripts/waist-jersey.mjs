// =============================================================
// Put a waist in the jersey — geometrically, not by prompt
// =============================================================
// Recraft heard "slight taper" as "A-line dress" three times running. The shape
// is already right, so this bows the BODY edges inward instead: every point
// below the sleeve line moves toward the centre by a sine bump that is zero at
// the sleeves, peaks at the mid-torso and returns to zero at the hem — so the
// hem stays exactly as wide as the chest.
//
//   node scripts/waist-jersey.mjs <amplitude>   e.g. 0.045 for 4.5%
// =============================================================
import { readFileSync, writeFileSync } from 'fs'

const AMP = Number(process.argv[2] ?? 0.065)
const SRC = process.argv[3] ?? 'assets/jersey-explore/jersey-outfield.svg'
const OUT = process.argv[4]
const svg = readFileSync(SRC, 'utf8')
const paths = [...svg.matchAll(/<path([^>]*)\sd="([^"]+)"([^>]*)\/>/g)]

// Every coordinate in the file, so the bounding box is the whole shirt.
const nums = (d) => d.match(/-?\d*\.?\d+/g).map(Number)
let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9
for (const [, , d] of paths) {
  const n = nums(d)
  for (let i = 0; i < n.length; i += 2) {
    minX = Math.min(minX, n[i]); maxX = Math.max(maxX, n[i])
    minY = Math.min(minY, n[i + 1]); maxY = Math.max(maxY, n[i + 1])
  }
}
const cx = (minX + maxX) / 2, H = maxY - minY

// ⚠ THE SLEEVES MUST NOT MOVE. They are the widest part of the shape and they
// sit in the upper third; squeezing them would pull the whole shoulder in. The
// bow starts below them.
const sleeveBottom = minY + H * 0.42
const hem = maxY
const factor = (y) => {
  if (y <= sleeveBottom) return 1
  const t = (y - sleeveBottom) / (hem - sleeveBottom)   // 0 at sleeve line, 1 at hem
  return 1 - AMP * Math.sin(Math.PI * t)                 // zero at both ends, max mid-torso
}

let out = svg
for (const [full, pre, d, post] of paths) {
  const warped = d.replace(/(-?\d*\.?\d+)(\s+)(-?\d*\.?\d+)/g, (m, xs, sp, ys) => {
    const x = Number(xs), y = Number(ys)
    const nx = cx + (x - cx) * factor(y)
    return `${nx.toFixed(2)}${sp}${ys}`
  })
  out = out.replace(full, `<path${pre} d="${warped}"${post}/>`)
}
const dest = OUT ?? `assets/jersey-explore/jersey-outfield-waist${String(AMP).replace('0.', '')}.svg`
writeFileSync(dest, out.replace('SportPool outfield jersey', `SportPool outfield jersey, waist ${(AMP * 100).toFixed(1)}%`))
console.log(`${dest}  bbox ${Math.round(maxX - minX)}x${Math.round(H)}  sleeveBottom ${Math.round(sleeveBottom)}  amp ${AMP}`)
