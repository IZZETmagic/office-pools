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


// §4.4 — the character is in a list, not on a half-screen. Below ~36px the
// mouth is two pixels, so this row is the real acceptance test for a base.
const sizes = (dir) => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()
  const row = (bg, label) => `<div class="sizes" style="background:${bg}">
    <span class="sz">${label}</span>
    ${files.map((f) => [24, 32, 36, 64].map((px) =>
      `<img src="../${dir}/${f}" width="${px}" height="${px}" style="border-radius:50%">`).join('')).join('<i></i>')}
  </div>`
  return row('#F7F8FC', 'snow') + row('#0B0F1A', 'midnight')
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
  .sizes { display:flex; align-items:center; gap:6px; padding:14px; border-radius:12px; margin-bottom:10px; flex-wrap:wrap }
  .sizes i { width:14px; display:inline-block }
  .sz { font-size:11px; color:#8B97B8; width:64px }
  .note { border-left:3px solid #3B6EFF; padding:2px 0 2px 14px; margin:20px 0; color:#C7CCD1; max-width:70ch }
</style>
<h1>Base avatar exploration — Recraft</h1>
<p>14 Sep 2026. Newest round first. Rounds 1 and 2 are kept because what they ruled out is the reason round 3 is shaped the way it is.</p>

<div class="note" style="border-color:#EF4444">🔴 <b>Similarity assessment:
<a href="2026-09-14_avatar_duolingo_similarity.md" style="color:#5B8AFF">2026-09-14_avatar_duolingo_similarity.md</a>.</b>
On appearance the case is reasonable — every element you would <i>name</i> as Duolingo's (glasses, blush,
freckles, beards, split backgrounds, hand-drawn wobble) is absent, and SportPool blue is 11.6–27.4% of
every 5a tile against zero in theirs. On <b>provenance</b> it is not: 5a descends in two documented
generations from a style trained directly on their artwork. Treat 5a as the brief and apply it to the
Avataaars rig we already chose on licence grounds (§7b.1).</div>

<h2>Round 5 — six SportPool directions</h2>
<p>The brief: keep the playfulness, add what SportPool actually is — large radii, the primary blue, a
degree of restraint. Six directions, from our own construction grammar rather than from the reference.
It was run twice, and neither run is the answer.</p>

<div class="note"><b>5a — anchored on the approved bases.</b> The art holds and the six directions
<i>collapse into one</i>. <code>4-outline</code> came back with no outline anywhere; capsule, outline and
glyph are indistinguishable. <code>style_match: 'flexible'</code> is the loosest V4 offers and the anchor
still won. This is §7e.5's "the style pins the composition" working against us.</div>
${grid('assets/avatar-styles-anchored', 4)}

<div class="note"><b>5b — the same six, prompt only, no anchor.</b> Now they are six genuinely different
directions, and the drawing falls apart: masks on sticks, a ghost, a black silhouette, and the blue
leaking onto skin. §7c.8, exactly: it cannot hold all the variables at once.</div>
${grid('assets/avatar-styles', 3)}

<div class="note">🔴 <b>Round 6 is designed and blocked on credits.</b> Neither side of that fork is the
answer, so the next run gives each direction <i>its own</i> style built from two weighted images — the
approved base at 0.4 for warmth, proportion and framing, and that direction's own 5b sketch at 0.6 for
the thing that makes it itself. <code>scripts/gen-avatar-blend.mjs</code> is written and ready;
<code>/users/me</code> reports <b>3 credits</b> left.</div>

<h2>Round 4 — the SportPool palette</h2>
<p>The three you circled, recoloured rather than regenerated (§7c.4: generate for form, recolour for
palette). No API calls, nothing lost from the art you picked. The ground is the user's identity colour —
<code>avatarGradient</code>'s first stop, the same colour their initials already carry — and the kit is a
colourway off <code>lib/design/tokens.ts</code>. Skin and hair are untouched, per §5.3.</p>
<div class="note">The two things this had to get past, both measured: the background disc is <b>two</b>
half-elements, and in two of the three the hair and the jersey are the <b>same fill</b>. Recolouring by
colour value dyed the hair to match the shirt; roles are resolved from rendered geometry instead.</div>
${grid('assets/avatar-sportpool', 4)}

<h2>Round 4 at real size</h2>
<p>§4.4: a pool card renders a person at 24px, a banter row at 32px, a member list at 36px. Shown on both
grounds, because the app has a light and a dark theme.</p>
<div class="note"><b>These are cropped, and the crop is the reason they work at 24px.</b> Measured under a
circular crop of the raw canvas: <b>45–48%</b> of every avatar was white margin and only <b>5.5–11.4%</b>
was the identity colour — on <code>midnight</code> that margin renders as a white ring. Re-cropped to the
figure via <code>viewBox</code> (which react-native-svg honours, unlike a transform string — C1), the
margin drops to <b>3–5%</b> and the identity colour rises to <b>7.8–17.6%</b>.<br>
⚠ B-S1 is the weak one at 7.8%: its head is large against its disc, so the identity colour barely reads.</div>
${sizes('assets/avatar-sportpool')}

<h2>Round 3B — reference-led, five shapes</h2>
<p>The five reference tiles built into one vector style, which then carries the look so the prompt only
has to say who. Same five shapes as round 2.</p>
<div class="note">⚠ <b>This style is built from third-party character art.</b> Fine for deciding a direction.
The licence question bites when art generated from it ships — and §7c.8 already notes a Recraft asset may
not be copyrightable at all, which matters because the plan is to sell cosmetics on top of this.</div>
${grid('assets/avatar-simple-b', 5)}

<h2>Round 3A — the same simplification, prompt only</h2>
<p>Identical prompt and shapes, no style reference. This is what the words alone buy: the count comes down
(10–17 paths, 3–7 fills) but the colour and the composition do not land.</p>
${grid('assets/avatar-simple-a', 5)}

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
