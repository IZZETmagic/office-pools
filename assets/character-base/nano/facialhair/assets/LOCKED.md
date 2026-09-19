# Locked facial hair assets

**These files are frozen.** They do not get regenerated, re-traced, re-extracted or "improved"
without an explicit request naming the asset. Same rule as `../../bases/LOCKED.md`.

| asset | paths | notes |
|---|---|---|
| `stubble.asset.svg` | 3 | ⭐ v3 2026-09-19 — same contract as the full beard, no notch |
| `fullbeard.asset.svg` | 3 | ⭐ v3 2026-09-19 — straight cheek line, arched corners, buried joints |
| `bushybeard.asset.svg` | 4 | ⭐ NEW 2026-09-19 — the v3 beard plus a ragged outer growth; **no fade** |
| `moustache.asset.svg` | — | v1, not yet converted |
| `soulpatch.asset.svg` | — | v1, not yet converted |

⚠ **Chin strap removed 2026-09-19.** Ryan: *"I'm not sure how to do it properly right now."* Its
generated art stays in `../v2/` and `../nano/` as provenance; the asset, its checksum and its
manifest entry are gone. `bushybeard` took its slot.

## v2: the seam band (2026-09-18)

Every v1 sideburn was a needle and that is why no beard ever met the hair:

| | v1 band top / thickness | v2 |
|---|---|---|
| stubble | y472 / **4px** | y454 / 51px |
| fullbeard | y438 / **10px** | y454 / 50px |
| chinstrap | y479 / **3px** | y454 / 51px |

All three now share one band: a flat square top at mid-ear, ~50px thick, outer edge flush, ears
clear. A hair sideburn built to the same contract meets any of them with no per-pair fix.

⭐ Ryan found the thing the measurements missed: the v1 "stubble" was a FULL BEARD in a lighter
tone — 80.2% the same pixels as `fullbeard`, 74,716 vs 92,751, with only 161px unique to it.
That is why it never read as stubble whatever was done to its shape.

## v3: the cheek line (2026-09-19)

**Stubble got the identical treatment the same day** — straight top at y1105.8, radius-100
arches, buried joints — but with a flat top under the nose instead of the beard's notch: stubble
has no moustache to carve, and the nose simply overlaps it. Ryan picked straight over notch.
⚠ Ryan's note on locking it: at this point the stubble was the full beard in a lighter tone and
*read as one*. Every stubble artefact in the repo is a flat shape — the thing that made the
approved art read as stubble was its TONE (pale, 84% to skin, greyer than the hair line), and it
was lost when the tone became a token filled at 55%. Fixed the same day in the composers, not the
asset: `stubbleTone` = 83% toward skin, then 55% toward grey. See `../v2/README.md`.

Ryan asked for two visible changes to the full beard and chose vectors over regeneration for
both, so this version is a **geometry edit of the locked v2 paths**, not a new generation.

1. **The cheek line is straight.** v2 dropped from each moustache corner in an arc, bottomed
   out at y1232, and climbed back to the sideburn, leaving a bare semicircle either side of the
   nose. The two arcs are now one horizontal edge at the moustache's own top corners (y1105.8),
   from the moustache to each sideburn.
2. **The corner into the sideburn is an arch, not a square.** A quarter circle of **radius 100**
   (50px at 1024) carries the cheek line up into the sideburn's inner edge. Ryan picked 100 from
   60 / 100 / 140. ⭐ The arch lives in the BAND path, not the body, so `--fade` runs through it
   and there is no tone step beside the sideburn.
3. **The hairline along the sideburn joint is gone.** In v2 the band's inner edge retraced the
   body's edge coordinate for coordinate, and two anti-aliased edges on the same line leak a
   one-pixel lighter seam (measured 24 levels). Each band's inner edge is now buried 60 units
   inside the beard mass, and the body steps 30 units under the band at the cheek, so every
   joint is one shape painted over the solid interior of another.

⚠ The rule from the base: **never butt two same-colour edges — overlap the lower shape and let
the upper one clip it.**

Verified: no mid-tone pixels along either joint in flat or fade mode; the beard's outer
silhouette is unchanged to within rasteriser noise (≤6 levels on single edge pixels).

## bushybeard — the v3 beard with a ragged outer growth (2026-09-19)

Ryan wanted a messy, bushy beard. Round 1 asked for the whole beard to go unkempt and all four
generations broke the design: the top edge climbed the cheeks, the sideburns overhung the ears
and every one punched a mouth hole. He corrected the brief — *"I like the current beard design;
something on the OUTSIDES that makes it scruffier or bigger — wider and lower, but nothing
around the nose area"* — and round 2 landed it on all four tries, measured identical to the
locked beard at the notch, both sideburn tops and the cheek line.

⭐⭐ **The asset is the locked v3 beard with ONE path added underneath.** Body, both sideburn
bands, the buried joints and the arches are the locked geometry, carried over unchanged. Only
the ragged outer growth is new. That is deliberate: a trace can only see VISIBLE edges, so
re-tracing the whole beard would have lost every buried joint and handed the hairline back.

How the new path was derived, reproducibly — `../bushy/build-bushy.py`:

1. Recraft `vectorize` on the chosen render (10 units). ⚠ The traced beard is **not** the
   visible beard: it carries a hidden skirt down to y2048 behind the shirt, because the tracer
   draws each shape as a region and overpaints. Subtracting the shirt and the neck patch
   recovers the real silhouette — 99.2% IoU against the generated art.
2. ⚠⚠ The mass is CLIPPED so it can never add anything on the face above the approved top edge.
   The forbidden region is *inside the head's straight sides, above y1200, and not already
   covered by the locked beard* — which is exactly the cheeks and the philtrum notch. Below
   y1200 nothing is clipped, so the downward growth is untouched. It also may not rise above
   the bands' flat top (y909.1); the trace put them half a unit higher, and half a unit of
   solid beard above a band reads as a dark lip.
3. Simplified at tolerance 1.5 — 206 points, 0.02% area change.

⭐ **No fade on this one** (Ryan). The bands' fade marker is swapped for the plain hair token, so
it renders solid whether or not `--fade` is set. Doing it in the ASSET rather than relying on the
flag matters: the admin builder turns the fade on by default.

⚠ This is the first style that paints OVER the ears — see the same-day commit that moves the ear
paths ahead of the facial hair. Its tufts reach ~230px onto the left ear and ~160 onto the right.
The old ear-overhang rule from the hair work does NOT apply here: hair paints last and would bury
the ear, facial hair does not.

## The fade marker

`fullbeard` and `stubble` carry their sideburn band in `rgb(126,110,150)`, which `compose.py --fade`
fills with a hair-to-skin gradient. See `../FADE.md`.

⚠⚠ BACK-OUT: with the fade OFF the marker is swapped for the asset's own body tone — the flat
behaviour that existed before — so these assets are safe either way. Verified on all three:
fade off gives no gradient and no marker in the output; fade on gives a gradient and no marker.
Guard tests enforce both directions.

## Verifying

```sh
shasum -a 256 -c LOCKED.sha256
uv run ../../check-facialhair.py ../v2/fullbeard.png
uv run ../../build-builder.py        # after ANY asset change — two tracked bundles depend on it
```

⚠ **`check-facialhair.py` cannot judge `bushybeard`.** Its band, moustache and cheek probes walk
inward from the head edge assuming a flush sideburn, so on a ragged style they report a 200px
"band" at y430 and read tufts as the cheek line. Only the **tone**, **mouth** and **ears** rows
mean anything there, and all three pass. Do not chase the other numbers; the guard tests and the
checksum are what hold this asset.

⭐ The asset is rebuilt, not hand-edited: `uv run ../bushy/build-bushy.py out.svg` reproduces
`bushybeard.asset.svg` byte for byte from the locked full beard and the trace.
