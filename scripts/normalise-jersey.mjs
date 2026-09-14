// =============================================================
// Put both shirts on the same scale
// =============================================================
// ⚠ THE TWO SHIRTS WERE GENERATED SEPARATELY, so their artwork occupies
// different fractions of the 2048 viewBox — the keeper's bbox came out 898 wide
// against the outfield's 1469. Rendered at the same size they would not match.
// This wraps each in a transform so both fill the SAME target box, which also
// fixes the number's position for free.
//
//   node scripts/normalise-jersey.mjs <file> [...]
// =============================================================
import { readFileSync, writeFileSync } from 'fs'

const TARGET = { w: 1420, cx: 1024, top: 300 } // shared frame inside the 2048 box

for (const file of process.argv.slice(2)) {
  const svg = readFileSync(file, 'utf8')
  const paths = [...svg.matchAll(/<path[^>]*\/>/g)].map((m) => m[0])
  const nums = paths.flatMap((p) => (p.match(/ d="([^"]+)"/)[1].match(/-?\d*\.?\d+/g) || []).map(Number))
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9
  for (let i = 0; i < nums.length; i += 2) {
    minX = Math.min(minX, nums[i]); maxX = Math.max(maxX, nums[i])
    minY = Math.min(minY, nums[i + 1]); maxY = Math.max(maxY, nums[i + 1])
  }
  const s = TARGET.w / (maxX - minX)
  const tx = TARGET.cx - (minX + (maxX - minX) / 2) * s
  const ty = TARGET.top - minY * s
  const head = svg.slice(0, svg.indexOf('<svg'))
  const open = svg.match(/<svg[^>]*>/)[0]
  writeFileSync(file, `${head}${open}\n  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})">\n    ${paths.join('\n    ')}\n  </g>\n</svg>\n`)
  console.log(`${file}: bbox ${Math.round(maxX - minX)}x${Math.round(maxY - minY)} → scale ${s.toFixed(3)}`)
}
