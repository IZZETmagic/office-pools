// =============================================================
// Split an anchored style into a base + its removable parts
// =============================================================
// §7e — decompose, don't inpaint. Recraft draws the COMPLETE skull and layers
// hair on top of it, so the base is already sitting in the finished file; it is
// reached by deleting paths, not by generating anything. Verified on this art:
// dropping the hair leaves a full bald head, not a hair-shaped bite.
//
// Why this is a deletion and not a Recraft call (99d3d08): feeding an SVG back
// through /images/imageToImage has no window where the edit lands and the face
// survives — at strength 0.15 nothing changes, by 0.30 the face disintegrates.
// Preservation and edit are the same dial. Deletion preserves exactly.
//
// ⚠ The cut is BY PATH INDEX, and every index is guarded by the fill and the
// bounding box measured off the source. If the source is regenerated the guard
// fails loudly rather than cutting the wrong shape — §7e.7, detectors have traps.
//
// ⚠ In this style the head silhouette is the NEGATIVE SPACE of the two blue
// paths (3dc92ff — "the blue shapes are a mask"). They are background and mask
// at once, so they stay in the base; recolouring them is what puts the figure on
// a member's identity colour.
//
//   node scripts/split-avatar-base.mjs
// =============================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const SRC = 'assets/avatar-styles-anchored/1-capsule-square.svg'
const OUT_DIR = 'assets/avatar-base-capsule'

// ── The cut ──────────────────────────────────────────────────
// index = position among the <path> elements, 0-based. guard = [fill, x0, x1,
// y0, y1] as measured from the source; all four bounds must match within 1 unit.
const KEEP = 'base'
const CUT = {
  hair:  [{ i: 2,  guard: ['rgb(90,89,89)',   424, 1624,  39,  767] }],
  eyes:  [{ i: 5,  guard: ['rgb(254,254,254)', 1041, 1524, 719, 1009] },
          { i: 6,  guard: ['rgb(91,66,58)',    1165, 1366, 762,  962] },
          { i: 7,  guard: ['rgb(254,254,254)',  543, 1006, 718, 1009] },
          { i: 8,  guard: ['rgb(91,66,58)',     682,  884, 761,  963] }],
  brows: [{ i: 9,  guard: ['rgb(90,89,89)',   1145, 1398, 620,  681] },
          { i: 10, guard: ['rgb(90,89,89)',    658,  899, 619,  682] }],
  mouth: [{ i: 12, guard: ['rgb(90,89,89)',    963, 1081, 1134, 1190] }],
}
// Everything not listed stays in the base: the canvas, the skin mass, the two
// blue mask/background paths, and the nose.

const src = readFileSync(SRC, 'utf8')
const lines = src.split('\n')
const pathIdx = []                                    // line number of each <path>
lines.forEach((l, n) => { if (/<path /.test(l)) pathIdx.push(n) })

// ── Guard ────────────────────────────────────────────────────
const bbox = (line) => {
  const d = (line.match(/ d="([^"]+)"/) || [])[1] || ''
  const nums = (d.match(/-?\d+\.?\d*/g) || []).map(Number)
  const xs = [], ys = []
  for (let k = 0; k + 1 < nums.length; k += 2) { xs.push(nums[k]); ys.push(nums[k + 1]) }
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
}

let failed = 0
for (const [part, entries] of Object.entries(CUT)) {
  for (const { i, guard } of entries) {
    const line = lines[pathIdx[i]]
    const fill = (line.match(/fill="([^"]+)"/) || [])[1]
    const got = [fill, ...bbox(line).map(Math.round)]
    const ok = got[0] === guard[0] && guard.slice(1).every((v, k) => Math.abs(got[k + 1] - v) <= 1)
    if (!ok) { console.error(`✗ ${part}[${i}] guard failed\n    want ${guard}\n    got  ${got}`); failed++ }
  }
}
if (failed) { console.error(`\n${failed} guard failure(s) — refusing to cut.`); process.exit(1) }

// ── Write ────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true })
const header = lines[0]
const footer = '</svg>'
const cutIdx = new Set(Object.values(CUT).flat().map((e) => e.i))
const write = (name, indices) => {
  const body = indices.map((i) => lines[pathIdx[i]]).join('\n')
  writeFileSync(join(OUT_DIR, `${name}.svg`), `${header}\n${body}\n${footer}\n`)
  return indices.length
}

const baseIdx = pathIdx.map((_, i) => i).filter((i) => !cutIdx.has(i))
console.log(`${KEEP}-capsule-square.svg   ${write(`${KEEP}-capsule-square`, baseIdx)} paths  (canvas, skin, blue mask ×2, nose)`)
for (const [part, entries] of Object.entries(CUT)) {
  console.log(`part-${part}.svg${' '.repeat(Math.max(0, 16 - part.length))}${write(`part-${part}`, entries.map((e) => e.i))} paths`)
}

// ── Verify the cut is lossless ───────────────────────────────
// base ∪ parts, back in source order, must be the original path list exactly.
const reassembled = [...baseIdx, ...cutIdx].sort((a, b) => a - b).map((i) => lines[pathIdx[i]])
const original = pathIdx.map((n) => lines[n])
const same = reassembled.length === original.length && reassembled.every((l, k) => l === original[k])
console.log(same ? '\n✓ lossless — base ∪ parts reassembles the source byte-for-byte'
                 : '\n✗ REASSEMBLY DIFFERS FROM SOURCE')
if (!same) process.exit(1)
