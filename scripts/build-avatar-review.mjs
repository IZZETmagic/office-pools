// Contact sheet for the base-avatar exploration.
//   node scripts/build-avatar-review.mjs   → drafts/2026-09-14_avatar_bases.html
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// §4.5 caps a character at five fills. Counting them here makes that a number
// on the page rather than an opinion about it.
const stats = (p) => {
  const svg = readFileSync(p, 'utf8')
  // Recraft emits rgb() triples, not hex — matching only hex silently counted zero.
  const fills = new Set(
    [...svg.matchAll(/fill="(#[0-9a-fA-F]{3,8}|rgb\([^)]*\))"/g)]
      .map((m) => m[1].toLowerCase())
      .filter((f) => f !== 'none'),
  )
  return {
    fills: fills.size,
    paths: (svg.match(/<path/g) || []).length,
    gradients: (svg.match(/<(linear|radial)Gradient/g) || []).length,
    raster: (svg.match(/<image/g) || []).length,
  }
}

const card = (dir, f) => {
  const s = stats(join(dir, f))
  const warn = [s.raster && 'RASTER', s.gradients && `${s.gradients} gradients`, s.fills > 5 && `${s.fills} fills`].filter(Boolean)
  return `<figure>
    <img src="../${dir}/${f}" loading="lazy">
    <figcaption>${f.replace('.svg', '')}
      <span class="m">${s.paths} paths · ${s.fills} fills</span>
      ${warn.length ? `<span class="w">⚠ ${warn.join(' · ')}</span>` : ''}
    </figcaption>
  </figure>`
}

const grid = (dir, cols) =>
  `<div class="grid" style="--cols:${cols}">${readdirSync(dir).filter((f) => f.endsWith('.svg')).sort().map((f) => card(dir, f)).join('')}</div>`

const html = `<!doctype html><meta charset="utf-8"><title>SportPool base avatars — 2026-09-14</title>
<style>
  :root { color-scheme: dark }
  body { margin:0; padding:40px; background:#0F1115; color:#E8EAED;
         font:15px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif }
  h1 { font-size:26px; margin:0 0 4px }
  h2 { font-size:18px; margin:48px 0 4px; color:#fff }
  p  { max-width:70ch; color:#9BA1A6; margin:4px 0 20px }
  .grid { display:grid; grid-template-columns:repeat(var(--cols),1fr); gap:16px; max-width:1500px }
  figure { margin:0 }
  img { width:100%; aspect-ratio:1; display:block; border-radius:16px; background:#fff }
  figcaption { font-size:12px; color:#C7CCD1; padding-top:8px; display:flex; flex-direction:column; gap:2px }
  .m { color:#6E757C; font-size:11px }
  .w { color:#F5C518; font-size:11px }
  .note { border-left:3px solid #3B6EFF; padding:2px 0 2px 14px; margin:20px 0; color:#C7CCD1; max-width:70ch }
</style>
<h1>Base avatar exploration — Recraft</h1>
<p>14 Sep 2026. Nothing here is a candidate yet; both sheets are for picking a direction.</p>

<h2>Round 2 — the look pinned, the skull varied</h2>
<p>Three surviving directions from round 1, each turned into a Recraft style and re-run across five head
shapes. A row is one art language; along a row, only the skull is meant to move.</p>
<div class="note"><b>Read the rows, not the faces.</b> The question this sheet answers is which row could be
<i>the</i> base — the one every user customises — and whether its five shapes are different enough to be worth
offering as five.</div>
${grid('assets/avatar-shapes', 5)}

<h2>Round 1 — six directions</h2>
<p>One prompt, two extreme head shapes, six art directions. D3–D5 use the V3 curated vector styles and
return illustrated <i>scenes</i> rather than avatars — that is a structural failure, not a taste call,
and it is why round 2 is V4.1 only.</p>
${grid('assets/avatar-bases', 4)}
`

writeFileSync('drafts/2026-09-14_avatar_bases.html', html)
console.log('drafts/2026-09-14_avatar_bases.html')
