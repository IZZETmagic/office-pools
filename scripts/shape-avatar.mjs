// =============================================================
// A full background disc, and six head shapes from one outline
// =============================================================
// Both asks are geometry, which is lucky because the Recraft balance is empty.
// Neither needs a generation, and for the head shapes geometry is the BETTER
// tool anyway: §7c.1 already concluded "a fifth shape is a designer's five
// minutes, or a warp of an approved outline — not a prompt", after six prompts
// failed to escape the four skulls already in hand. A warp also holds "keep
// everything else the same" exactly, which a generation cannot — every
// generation rerolls the hair, the colour and the features too.
//
// The art is Recraft's absolute-coordinate output: only M, L, C and z, so
// every number in a `d` attribute is part of an x,y pair and a pairwise
// transform is safe. This is the same move as scripts/waist-jersey.mjs, which
// bowed the shirt below the sleeve line rather than asking for a waist.
//
//   node scripts/shape-avatar.mjs
// =============================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const SRC = 'assets/avatar-styles-anchored/1-capsule-round.svg'
const OUT_DIR = 'assets/avatar-shapes-6'
const ELEMENT = /<(path|rect|circle|ellipse|polygon)\b[^>]*>/g

const svg = readFileSync(SRC, 'utf8')
const tags = svg.match(ELEMENT) || []
const dOf = (t) => (t.match(/ d="([^"]*)"/) || [])[1]
const fillOf = (t) => (t.match(/fill="([^"]*)"/) || [])[1]

/** Every number in the file is half of an x,y pair — true for M, L, C and z. */
const pairs = (d) => {
  const nums = d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) || []
  const out = []
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([Number(nums[i]), Number(nums[i + 1])])
  return out
}

/**
 * The OUTLINE, not the control points.
 *
 * ⚠⚠ A width profile taken from raw pair data is meaningless here: a cubic's
 * control points sit far outside the curve they describe. Measured on this
 * file, consecutive rows read 1956 and 99 — a "face" wider than the canvas,
 * from two handles that the outline never goes near. Every curve is flattened
 * to real points first, and only then measured.
 */
const flatten = (d, steps = 16) => {
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
      pts.push([
        u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
        u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
      ])
    }
    cx = x; cy = y
  }
  return pts
}
const bboxOf = (d) => flatten(d).reduce((a, [x, y]) => [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)], [1e9, 1e9, -1e9, -1e9])

// ── Identify the elements ────────────────────────────────────
// Same principle as the recolour: position and size, never colour. The canvas
// is the element whose box is the whole 2048 viewBox; skin is the largest of
// what remains; the ground is the pair of crescents sharing one fill that sit
// left and right of the head.
const VB = 2048
const els = tags.map((t, i) => ({ i, tag: t, d: dOf(t), fill: fillOf(t) })).filter((e) => e.d)
for (const e of els) { e.bbox = bboxOf(e.d); e.w = e.bbox[2] - e.bbox[0]; e.h = e.bbox[3] - e.bbox[1]; e.area = e.w * e.h }

const canvas = els.find((e) => e.bbox[0] <= 1 && e.bbox[1] <= 1 && e.bbox[2] >= VB - 1 && e.bbox[3] >= VB - 1)
const body = els.filter((e) => e !== canvas)
const skin = body.slice().sort((a, b) => b.area - a.area)[0]
// The crescents: same fill as each other, one left of centre and one right.
const byFill = new Map()
for (const e of body) (byFill.get(e.fill) || byFill.set(e.fill, []).get(e.fill)).push(e)
const ground = [...byFill.values()].find((g) => g.length === 2 && g.some((e) => (e.bbox[0] + e.bbox[2]) / 2 < VB / 2) && g.some((e) => (e.bbox[0] + e.bbox[2]) / 2 > VB / 2) && g.every((e) => e.area > skin.area * 0.1))
if (!ground) throw new Error('could not identify the two ground crescents')

// ⚠⚠ THE CRESCENTS ARE A MASK, NOT A BACKGROUND. They are painted AFTER the
// skin, not behind it: the skin path spans the full canvas (x 109-1938) and the
// two blue shapes cover its outer arcs, which is what cuts the head down to a
// face. Deleting them to "enlarge the background" did not enlarge anything — it
// unmasked the skin, and the face ballooned to the width of the canvas.
// So they stay, and they are warped with everything else so the mask keeps
// following the jaw. The bigger disc goes BEHIND them instead.
const figure = body.filter((e) => !ground.includes(e))
const gbox = ground.reduce((a, e) => [Math.min(a[0], e.bbox[0]), Math.min(a[1], e.bbox[1]), Math.max(a[2], e.bbox[2]), Math.max(a[3], e.bbox[3])], [1e9, 1e9, -1e9, -1e9])
console.log(`canvas #${canvas.i} · skin #${skin.i} · ground #${ground.map((e) => e.i).join(',')} (mask, kept) · disc bbox ${gbox.map(Math.round).join(' ')}`)

// ── A. One disc that encapsulates the whole avatar ───────────
// The two crescents are replaced by a single circle drawn FIRST, so everything
// else paints over it. Radius is the furthest figure point from the centre —
// Bézier control points are included, which overshoots the true outline
// slightly and therefore only ever errs toward more margin.
// Both crescents together span the disc's full width, so half that width is the
// original disc radius. The new circle must clear that AND every part of the
// figure the mask does not cover — the hair above it and the shoulders below.
// The skin is excluded on purpose: its outer arcs are masked, so its true width
// is not what anyone sees.
const cx = (gbox[0] + gbox[2]) / 2
const cy = (gbox[1] + gbox[3]) / 2
let r = (gbox[2] - gbox[0]) / 2
for (const e of figure) {
  if (e === skin) continue
  for (const [x, y] of flatten(e.d)) r = Math.max(r, Math.hypot(x - cx, y - cy))
}
r *= 1.10   // the disc should read AS a disc, not as a rim
const groundFill = ground[0].fill
console.log(`disc: centre ${Math.round(cx)},${Math.round(cy)} radius ${Math.round(r)}`)

// ── B. Six head shapes ───────────────────────────────────────
// The warp only touches the SKIN path, and only below the brow. Above it the
// skull is shared with the hair path, which is not warped — move one and not
// the other and the hair floats off the head.
// The band runs brow → CHIN, not brow → bottom of the path. The skin
// path includes the neck, so a band sized off its bbox put the whole warp on
// the neck: the jaw barely moved and the throat pinched instead.
// The chin is found from a width profile — the first row below the widest one
// where the face has narrowed to 55% of its maximum is the jaw/neck junction.
const profile = new Map()
for (const [x, y] of flatten(skin.d)) {
  const row = Math.round(y / 16) * 16
  const p = profile.get(row) || [1e9, -1e9]
  profile.set(row, [Math.min(p[0], x), Math.max(p[1], x)])
}
const rows = [...profile.entries()].map(([y, [x0, x1]]) => ({ y, w: x1 - x0 })).sort((a, b) => a.y - b.y)
const widest = rows.reduce((a, b) => (b.w > a.w ? b : a))
const chinRow = rows.find((r) => r.y > widest.y && r.w < widest.w * 0.55)
const browY = skin.bbox[1] + (widest.y - skin.bbox[1]) * 0.55
const chinY = chinRow ? chinRow.y : skin.bbox[3]
const headCx = (skin.bbox[0] + skin.bbox[2]) / 2
console.log(`widest row y=${widest.y} (${Math.round(widest.w)} wide) · brow y=${Math.round(browY)} · chin y=${Math.round(chinY)}`)

// Every factor returns to 1.0 at BOTH ends of the band, so the outline rejoins
// the skull above and the neck below with no step. A jaw that stays wide all
// the way to the chin leaves a notch where the neck starts — the same lesson as
// waist-jersey.mjs, where the hem had to end as wide as the chest.
const bump = (t) => Math.sin(Math.PI * t)
const SHAPES = [
  { key: '1-base', note: 'unwarped reference', fx: () => 1 },
  { key: '2-widejaw', note: 'jaw 16% wider at its widest', fx: (t) => 1 + 0.16 * bump(t) },
  { key: '3-tapered', note: 'narrows low and late — a pointed chin', fx: (t) => 1 - 0.22 * bump(Math.pow(t, 0.6)) },
  // ⚠ Measured after the first pass: widejaw and squarejaw came out 2070 and
  // 2062 wide, tapered and narrow 1726 and 1722. Six shapes collapsing to four
  // — the §7c.1 near-twin problem again. Each is now distinguished by what it
  // is FOR rather than by how wide it is: squarejaw keeps the base width and
  // earns its name from the plateau, and narrow takes in the whole skull rather
  // than only the jaw.
  { key: '4-squarejaw', note: 'base width, squared off — a corner not a curve', fx: (t) => 1 + 0.05 * Math.min(1, bump(t) * 2.6) },
  { key: '5-narrow', note: 'the whole skull 12% narrower, not just the jaw', fx: (t) => 1 - 0.12 * Math.min(1, bump(t) * 1.8), bandTop: 0 },
  { key: '6-long', note: 'jaw 18% taller, same width — the neck moves with it', fx: () => 1, fy: 1.18 },
]

mkdirSync(OUT_DIR, { recursive: true })

// The warp is applied to EVERY path, not just the skin. The hair's sideburns,
// the ears and the neckline all live in the same band; moving the face alone
// left them behind — a tapered chin floating above an unchanged collar. Because
// every factor returns to 1.0 at chinY, nothing below the jaw is touched, so
// the shoulders stay exactly as they were.
// ⚠ A feature must MOVE, never DEFORM. Eyes, brows, nose and mouth all sit
// inside the band, so warping them as outlines stretched the eyes into ovals on
// the wide jaw and squeezed them on the narrow one. Anything small is
// translated rigidly by the deformation at its own centre; only the outlines —
// skin, hair, collar — are actually reshaped.
const rigid = (d, shape) => {
  const pts = flatten(d)
  const cxp = pts.reduce((a, p) => a + p[0], 0) / pts.length
  const cyp = pts.reduce((a, p) => a + p[1], 0) / pts.length
  const top = topOf(shape)
  const t = Math.min(1, Math.max(0, (cyp - top) / (chinY - top)))
  const dx = (headCx + (cxp - headCx) * shape.fx(t)) - cxp
  const dy = !shape.fy ? 0 : (cyp <= chinY ? browY + (cyp - browY) * shape.fy : cyp + (chinY - browY) * (shape.fy - 1)) - cyp
  return d.replace(/(-?\d*\.?\d+(?:e-?\d+)?)(\s+)(-?\d*\.?\d+(?:e-?\d+)?)/g,
    (m, xs, sp, ys) => `${(Number(xs) + dx).toFixed(2)}${sp}${(Number(ys) + dy).toFixed(2)}`)
}

const topOf = (shape) => shape.bandTop === 0 ? skin.bbox[1] : browY

const warpPath = (d, shape) => shape.key === '1-base' ? d : d.replace(
    /(-?\d*\.?\d+(?:e-?\d+)?)(\s+)(-?\d*\.?\d+(?:e-?\d+)?)/g,
    (m, xs, sp, ys) => {
      const x = Number(xs), y = Number(ys)
      const top = topOf(shape)
      if (y <= top) return m
      const t = Math.min(1, (y - top) / (chinY - top))
      const nx = headCx + (x - headCx) * shape.fx(t)
      // Below the chin the stretch becomes a constant shift, so the neck and
      // shoulders travel with the longer jaw instead of being swallowed by it.
      const delta = shape.fy ? (chinY - browY) * (shape.fy - 1) : 0
      const ny = !shape.fy ? y : y <= chinY ? browY + (y - browY) * shape.fy : y + delta
      return `${nx.toFixed(2)}${sp}${ny.toFixed(2)}`
    },
  )

for (const shape of SHAPES) {
  let i = -1
  let out = svg.replace(ELEMENT, (tag) => {
    i++
    if (i === canvas.i) return tag.replace(/fill="[^"]*"/, 'fill="none"')
    const d = dOf(tag)
    if (!d) return tag
    const el = els.find((e) => e.i === i)
    const isFeature = el && el.area < skin.area * 0.06
    const nd = shape.key === '1-base' ? d : isFeature ? rigid(d, shape) : warpPath(d, shape)
    return tag.replace(/ d="[^"]*"/, ` d="${nd}"`)
  })

  // The circle goes in before the first element so it sits behind everything.
  // ⚠ Inserted ONCE, before the first element, so it paints behind everything.
  // `replace` with a /g regex hits every match — the first attempt put a disc in
  // front of each element and the last one buried the whole avatar.
  const circle = `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${groundFill}"/>`
  const first = out.search(/<(path|rect|circle|ellipse|polygon)\b/)
  out = out.slice(0, first) + circle + out.slice(first)

  // ⚠ A 1px sliver of skin shows along the mask's outer edge — measured at
  // rgb(72,113,248) against the ground's rgb(59,107,254), which is ~5% skin
  // bleeding through. It is inherited from the source art, where the mask edge
  // sits exactly on the skin edge, and the bigger flat disc only made it easier
  // to see. A ring drawn LAST, from just inside that edge out to the new
  // radius, covers both the sliver and any distortion the warp put into the
  // mask's outer edge.
  const ri = (gbox[2] - gbox[0]) / 2 - 6
  const ring = `<path fill-rule="evenodd" fill="${groundFill}" d="` +
    `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z ` +
    `M ${cx - ri} ${cy} a ${ri} ${ri} 0 1 0 ${ri * 2} 0 a ${ri} ${ri} 0 1 0 ${-ri * 2} 0 Z"/>`
  out = out.replace('</svg>', `${ring}</svg>`)
  const pad = r * 1.06
  out = out.replace(/viewBox="[^"]*"/, `viewBox="${(cx - pad).toFixed(1)} ${(cy - pad).toFixed(1)} ${(pad * 2).toFixed(1)} ${(pad * 2).toFixed(1)}"`)

  writeFileSync(join(OUT_DIR, `${shape.key}.svg`), out)
  console.log(`✓ ${shape.key.padEnd(13)} ${shape.note}`)
}
