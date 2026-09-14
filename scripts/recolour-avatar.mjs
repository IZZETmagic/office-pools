// =============================================================
// Put the three approved bases into the SportPool palette
// =============================================================
// §7c.4: GENERATE FOR FORM, RECOLOUR FOR PALETTE. The art Ryan circled is not
// regenerated — that would lose the exact faces he picked — it is recoloured,
// which costs nothing and is reproducible.
//
// Two measured facts decide how this works, and both are §7c.3 in this art:
//
//   1. A SHAPE IS NOT AN ELEMENT. The background disc is drawn as two halves
//      (the head covers the join). Recolouring "the element under the landmark"
//      repainted half a disc and left the other half.
//   2. A FILL IS NOT A ROLE. In B-S2 the hair and the jersey are both
//      rgb(253,176,83); in B-S4 both are rgb(84,65,57). Find-and-replace on the
//      kit colour dyes the hair to match.
//
// So roles are resolved from RENDERED GEOMETRY. Every element is repainted a
// unique index colour, Chrome renders it, and the script measures each
// element's visible pixel count, centroid and bbox. Roles then fall out of
// position and size — never colour, never document order:
//
//   canvas  bbox covers the whole canvas
//   skin    largest remaining element
//   hair    highest centroid of what is left
//   kit     lowest centroid of what is left        ← separates it from hair
//   ground  the largest element after those, plus every other element sharing
//           its fill that is not inside the face    ← rejoins the two halves
//
// ⚠ An antialiased edge is a blend of two index colours and decodes as a third
// element. Only exact index values are counted; a first attempt that trusted
// the first non-background pixel resolved the ground to the face.
//
//   node scripts/recolour-avatar.mjs
// =============================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'

const SRC_DIR = 'assets/avatar-simple-b'
const OUT_DIR = 'assets/avatar-sportpool'
const BASES = ['B-S1-roundsquare', 'B-S2-oval', 'B-S4-squarejaw']
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ELEMENT = /<(path|rect|circle|ellipse|polygon)\b[^>]*>/g

const eachElement = (svg, fn) => { let i = -1; return svg.replace(ELEMENT, (tag) => fn(tag, ++i)) }
const fillsOf = (svg) => { const out = []; eachElement(svg, (t) => { out.push((t.match(/fill="([^"]*)"/) || [])[1]); return t }); return out }
const indexed = (svg) => eachElement(svg, (tag, i) => tag.replace(/fill="[^"]*"/, `fill="rgb(${i * 16},0,0)"`))
const paint = (svg, map) => eachElement(svg, (tag, i) => (map[i] ? tag.replace(/fill="[^"]*"/, `fill="${map[i]}"`) : tag))

function measure(files) {
  const html = `<html><body><div id="out">pending</div><script>
const FILES = ${JSON.stringify(files)}
const load = (s) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = s })
;(async () => {
  const out = {}
  for (const f of FILES) {
    const img = await load('file://' + f)
    const c = document.createElement('canvas'); c.width = c.height = 1024
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 1024, 1024)
    const d = x.getImageData(0, 0, 1024, 1024).data
    const els = {}
    for (let y = 0; y < 1024; y += 2) for (let px = 0; px < 1024; px += 2) {
      const o = (y * 1024 + px) * 4
      if (d[o + 3] < 200) continue
      if (d[o + 1] !== 0 || d[o + 2] !== 0 || d[o] % 16 !== 0) continue
      const i = d[o] / 16
      const e = els[i] || (els[i] = { n: 0, sx: 0, sy: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1 })
      e.n++; e.sx += px; e.sy += y
      if (px < e.x0) e.x0 = px; if (px > e.x1) e.x1 = px
      if (y < e.y0) e.y0 = y; if (y > e.y1) e.y1 = y
    }
    out[f.split('/').pop()] = Object.fromEntries(Object.entries(els).map(([i, e]) => [i,
      { px: e.n, cx: Math.round(e.sx / e.n), cy: Math.round(e.sy / e.n), bbox: [e.x0, e.y0, e.x1, e.y1] }]))
  }
  document.getElementById('out').textContent = JSON.stringify(out)
})()
<\/script></body></html>`
  writeFileSync('/tmp/measure.html', html)
  const dom = execFileSync(CHROME, ['--headless', '--disable-gpu', '--allow-file-access-from-files',
    '--virtual-time-budget=20000', '--dump-dom', 'file:///tmp/measure.html'], { encoding: 'utf8', maxBuffer: 64e6 })
  return JSON.parse(dom.match(/id="out">([\s\S]*?)<\/div>/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
}

function resolveRoles(els, fills) {
  const list = Object.entries(els).map(([i, e]) => ({ i: Number(i), ...e }))
  const covers = (e) => e.bbox[0] <= 4 && e.bbox[1] <= 4 && e.bbox[2] >= 1018 && e.bbox[3] >= 1018
  const canvas = list.filter(covers).sort((a, b) => b.px - a.px)[0]
  let rest = list.filter((e) => e !== canvas)

  const skin = rest.sort((a, b) => b.px - a.px)[0]
  rest = rest.filter((e) => e !== skin)
  const big = rest.filter((e) => e.px > skin.px * 0.1)      // ignore eyes, brows, nose, mouth
  const hair = big.slice().sort((a, b) => a.cy - b.cy)[0]
  const kit = big.slice().sort((a, b) => b.cy - a.cy)[0]

  const remaining = rest.filter((e) => e !== hair && e !== kit)
  const seed = remaining.sort((a, b) => b.px - a.px)[0]
  const inFace = (e) => e.bbox[0] >= skin.bbox[0] && e.bbox[2] <= skin.bbox[2] && e.bbox[1] >= skin.bbox[1] && e.bbox[3] <= skin.bbox[3]
  const ground = seed ? remaining.filter((e) => fills[e.i] === fills[seed.i] && !inFace(e)) : []

  return { canvas, skin, hair, kit, ground }
}

// ── The SportPool treatment ──────────────────────────────────
// The ground is the user's identity colour — avatarGradient's FIRST stop, the
// same colour their initials already carry, so one person is one colour across
// the app (lib/design/avatarGradient.ts, and its own comment: "a person who is
// teal in the chat and purple on the card reads as two people").
// The kit is a colourway off lib/design/tokens.ts, and never a crest (§5.4).
const LOOKS = [
  { key: 'primary', ground: '#3B6EFF', kit: '#F7F8FC', note: 'primary ground · snow kit' },
  { key: 'accent', ground: '#1B2340', kit: '#F5C518', note: 'ink ground · accent kit' },
  { key: 'emerald', ground: '#10B981', kit: '#0B0F1A', note: 'emerald ground · midnight kit' },
  { key: 'rose', ground: '#FB7185', kit: '#1B2340', note: 'rose ground · ink kit' },
]

mkdirSync(OUT_DIR, { recursive: true })
mkdirSync('/tmp/indexed', { recursive: true })
for (const b of BASES) writeFileSync(`/tmp/indexed/${b}.svg`, indexed(readFileSync(join(SRC_DIR, `${b}.svg`), 'utf8')))

const measured = measure(BASES.map((b) => `/tmp/indexed/${b}.svg`))
const report = []

for (const base of BASES) {
  const svg = readFileSync(join(SRC_DIR, `${base}.svg`), 'utf8')
  const fills = fillsOf(svg)
  const r = resolveRoles(measured[`${base}.svg`], fills)
  const shared = fills[r.kit.i] === fills[r.hair.i]
  report.push({
    base,
    skin: { el: r.skin.i, fill: fills[r.skin.i] },
    hair: { el: r.hair.i, cy: r.hair.cy, fill: fills[r.hair.i] },
    kit: { el: r.kit.i, cy: r.kit.cy, fill: fills[r.kit.i] },
    ground: { els: r.ground.map((e) => e.i), fill: fills[r.ground[0]?.i] },
    sharedKitHairFill: shared,
  })

  // ── Crop to the figure ─────────────────────────────────────
  // Measured: under a circular crop of the raw canvas, 45-48% of every avatar
  // is white margin and only 5.5-11.4% is the identity colour. On the dark
  // theme that margin renders as a white ring. The fix is a viewBox, which
  // react-native-svg honours — unlike a transform string (C1).
  const box = Object.values(measured[`${base}.svg`])
    .filter((e) => !(e.bbox[0] <= 4 && e.bbox[1] <= 4 && e.bbox[2] >= 1018 && e.bbox[3] >= 1018))
    .reduce((a, e) => [Math.min(a[0], e.bbox[0]), Math.min(a[1], e.bbox[1]), Math.max(a[2], e.bbox[2]), Math.max(a[3], e.bbox[3])], [1e9, 1e9, -1, -1])
  const side = Math.max(box[2] - box[0], box[3] - box[1]) * 1.04 * 2   // ×2: the viewBox is 2048 for a 1024 render
  const cx = (box[0] + box[2]), cy = (box[1] + box[3])                  // ×2 of the midpoint
  const viewBox = `${cx - side / 2} ${cy - side / 2} ${side} ${side}`

  for (const look of LOOKS) {
    const map = { [r.kit.i]: look.kit }
    for (const g of r.ground) map[g.i] = look.ground
    // The white full-canvas element is dropped rather than cropped around, so
    // the corners are transparent and the app's own surface shows through.
    map[r.canvas.i] = 'none'
    const out = paint(svg, map).replace(/viewBox="[^"]*"/, `viewBox="${viewBox}"`)
    writeFileSync(join(OUT_DIR, `${base}-${look.key}.svg`), out)
  }
  console.log(`  crop ${viewBox}`)
  console.log(`✓ ${base.padEnd(18)} skin #${r.skin.i} · hair #${r.hair.i}(y${r.hair.cy}) · kit #${r.kit.i}(y${r.kit.cy}) · ground #${r.ground.map((e) => e.i).join(',')}` +
    (shared ? `  ⚠ kit and hair share ${fills[r.kit.i]}` : ''))
}

writeFileSync(join(OUT_DIR, 'roles.json'), JSON.stringify(report, null, 2))
