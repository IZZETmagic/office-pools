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
| `hair-m09-afro.asset.svg` | 7 | the ONLY masked asset; covers the ears |

## What an asset is

An SVG fragment containing only its own paths, in the locked base's coordinate space
(`viewBox 0 0 2048 2048`). It registers by construction — see `../../extract-hair.py`.
Compose with `../../compose.py`, which layers it onto any base and applies colour.

Colour is never baked in. Every asset uses two canonical tones:
`rgb(140,122,110)` base and `rgb(114,97,86)` texture. `compose.py --hair-colour` swaps
both from one input, deriving the texture tone by darkening.

## The face mask

SOME styles trace as one solid mass with the face painted on top — the hair has no hole of
its own. Those assets carry a `<defs><mask id="facehole">` and wrap their paths in
`<g mask="url(#facehole)">`. **Only the afro does, of the six.**

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
