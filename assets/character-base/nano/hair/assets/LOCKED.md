# Locked hair assets

**These four files are frozen.** Ryan locked them on 2026-09-15. They do not get
regenerated, re-traced, re-extracted or "improved" without an explicit request naming
the asset. Same rule as `../../bases/LOCKED.md`.

| asset | paths | notes |
|---|---|---|
| `hair-m01-buzz.asset.svg` | 4 | face mask |
| `hair-m02-sidepart.asset.svg` | 4 | two base shapes — the parting splits the mass |
| `hair-m03-quiff.asset.svg` | 5 | face mask |
| `hair-m05-undercut.asset.svg` | 9 | 3 base shapes — top mass plus both shaved sides; no mask |
| `hair-m06-slickback.asset.svg` | 5 | 70px brow band — the roomiest |
| `hair-m07-curls.asset.svg` | 6 | scalloped silhouette |
| `hair-m08-bowl.asset.svg` | 6 | masked; covers the ears |
| `hair-m09-afro.asset.svg` | 7 | masked; covers the ears |
| `hair-m10-mohawk.asset.svg` | 11 | 90px brow band |
| `hair-m11-receding.asset.svg` | 4 | 104px brow band — the roomiest |
| `hair-m12-shortsides.asset.svg` | 6 | 59px brow band |
| `hair-m13-manbun.asset.svg` | 10 | bun sits above the crown |
| `hair-m14-longhair.asset.svg` | 10 | masked; first style with length past the jaw |
| `hair-m15-locs.asset.svg` | 12 | INVERTED trace — see below |
| `hair-f01-bob.asset.svg` | 10 | masked; ⚠ 10px brow band — cannot carry brows |
| `hair-f02-ponytail.asset.svg` | 7 | masked; 124px brow band |
| `hair-f03-bobswept.asset.svg` | 9 | masked; 129px brow band |
| `hair-f04-longcurly.asset.svg` | 7 | INVERTED trace; 119px brow band |
| `hair-f05-pixie.asset.svg` | 6 | unmasked; 60px brow band |
| `hair-f06-spacebuns.asset.svg` | 12 | ⚠ 13px brow band |
| `hair-f07-braids.asset.svg` | 43 | braids hang clear of the face; ⚠ 13px brow band |
| `hair-f08-topknot.asset.svg` | 9 | single high bun fused to the crown; 77px brow band |
| `hair-f09-midwavy.asset.svg` | 9 | INVERTED trace; mid-length; covers the ears |
| `hair-f11-lowbun.asset.svg` | 6 | masked; sleek, bun at the nape; 99px brow band |
| `hair-f12-halfup.asset.svg` | 13 | masked; small bun with loose length; ⚠ 27px brow band |
| `hair-f13-longstraight.asset.svg` | 7 | INVERTED trace; 46px brow band |
| `hair-f14-shag.asset.svg` | 9 | masked; stepped layers; 106px brow band |

## What an asset is

An SVG fragment containing only its own paths, in the locked base's coordinate space
(`viewBox 0 0 2048 2048`). It registers by construction — see `../../extract-hair.py`.
Compose with `../../compose.py`, which layers it onto any base and applies colour.

Colour is never baked in. Every asset uses three canonical tones: `rgb(140,122,110)` base,
`rgb(114,97,86)` shade (texture darker than the base) and `rgb(168,150,138)` light (texture
lighter than the base). `compose.py --hair-colour` derives all three from one input.

Three tones, not two, because some styles trace as a DARK base with LIGHTER texture —
short-sides does — and collapsing that to one darker "texture" token paints the texture
darker than the base and erases the detail entirely.

The base mass is identified by AREA, never by path order (Recraft sorts arbitrarily; the
first hair path is often a swoosh) and never by luminance (short-sides again).

## The face mask

SOME styles trace as one solid mass with the face painted on top — the hair has no hole of
its own. Those assets carry a `<defs><mask id="facehole">` and wrap their paths in
`<g mask="url(#facehole)">`. **Of fourteen: the afro, the bowl and the long hair.**

Most styles need no mask: the tracer gives their hair as exactly the visible hair, and a
mask then hides anything inside the head outline — which silently ate the undercut's
sideburns (6,786px). The test is whether the largest hair path covers the nose; only a
solid-blob trace does. Anything consuming an asset must take its
**full inner markup**, not just its `<path>` elements; pulling paths out with a regex
drops the mask and paints its black silhouette onto the face.

## Verifying

```sh
shasum -a 256 -c LOCKED.sha256
```

## The inverted trace (locs)

On a very hair-dominant image Recraft can invert the layering: it floods the canvas with the
hair colour, then paints a canvas-sized WHITE path over it with the hair silhouette cut out as
holes. The hair is NEGATIVE SPACE, not a shape.

Colour-based selection cannot see this — the "hair" is a full-canvas rectangle, and the
silhouette lives in a path that looks like background. Extracting it means using the white
path AS the mask, then punching out everything the base draws (face, nose, neck, shadow and
the shirt), because all of that is painted after the white path and therefore falls inside
the holes.

`extract-hair.py` detects it by the FLOOD, not by what covers it: path 0 spanning the canvas
in a hair colour. Everything base-coloured painted after it becomes the mask.

Requiring a single full-canvas WHITE cover was too narrow — the locs used one white path, but
long straight hair used TWO (left and right of the hair), so the detector missed it and the
crown vanished entirely (194,650px). Requiring only "non-white then white" was too broad — box
braids flooded with SKIN and the extractor took that as the hair mass, composing to a bald
head. The flood must be a hair colour, and what covers it is irrelevant.

## Ears

The ears stick out PAST the head outline, so the white-outside-the-head pass in the face mask
re-permits hair over them. Five assets lost their ears that way while their source PNGs plainly
drew them. The mask now re-protects the ears last — but only when the generation actually drew
them, tested by looking for an ear-sized shape at the ear position in the trace.

Ear protection applies to EVERY asset, masked or not: an unmasked style paints hair over the
whole base, so a pulled-back style like the topknot buried ears its PNG plainly drew. Whether
an ear is protected is decided by rasterising the trace and looking for ear-coloured pixels at
the ear position — not by path bounding boxes, which miss a half-covered ear because it merges
into the face path and is far wider than an ear.

Styles that legitimately cover the ears — afro, locs, midwavy — have no ear pixels in their
trace and are left covered. Ryan confirmed this is fine for longer styles.

## Styles that cannot carry eyebrows as drawn

`f01-bob` (10px), `f06-spacebuns` (13px), `f07-braids` (13px), `m02-sidepart` (9px),
`m07-curls` (13px), `m09-afro` (17px). Six of twenty-two. This constrains what the brow slot can assume.

`--allow-tight` exists in `extract-hair.py` for a deliberate override of the eye-zone check.
Nothing currently uses it: `f07-braids` needed it until the style was regenerated as two
separate ropes, which fixed the clearance as a side effect.

## Box braids: attempted and dropped

Five generations, none usable. Every version that read as box braids narrowed the jaw 20-44%,
because the style is defined by braids falling across and around the head — exactly what makes
the model shrink the skull. The one generation that held the face at 500 did so by splaying the
braids outward, and traced to a patchy result with white holes at the crown.

The locs and the two pigtails already cover braided styles. Dropped rather than forced.

It did expose a real extractor bug, now fixed: its trace flooded the canvas with SKIN and then
white, which satisfied the inverted-trace test ("non-white then white") and made the extractor
treat the skin flood as the hair mass — composing to a bald head. The flood layer must now be a
hair colour, not any base colour.

## Gaps in the source become scalp in the composite

The first topknot had the bun sitting slightly detached from the crown hair, with a notch of
BACKGROUND between them. Composited, that notch showed the locked base's SKULL instead — the
generated head is slightly smaller than the base, so empty space in the source becomes skin
once the base is behind it.

Any style with a deliberate gap inside the hair silhouette has this problem. The fix is in the
generation: the shapes must be fused into one continuous silhouette, not merely adjacent.
