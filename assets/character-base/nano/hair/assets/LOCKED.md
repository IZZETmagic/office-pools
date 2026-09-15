# Locked hair assets

**These four files are frozen.** Ryan locked them on 2026-09-15. They do not get
regenerated, re-traced, re-extracted or "improved" without an explicit request naming
the asset. Same rule as `../../bases/LOCKED.md`.

| asset | paths | notes |
|---|---|---|
| `hair-m01-buzz.asset.svg` | 4 | face mask |
| `hair-m02-sidepart.asset.svg` | 4 | two base shapes — the parting splits the mass |
| `hair-m03-quiff.asset.svg` | 5 | face mask |
| `hair-m05-undercut.asset.svg` | 9 | 3 base shapes — top mass plus both shaved sides |
| `hair-m07-curls.asset.svg` | 6 | scalloped silhouette |
| `hair-m09-afro.asset.svg` | 7 | face mask; covers the ears |

## What an asset is

An SVG fragment containing only its own paths, in the locked base's coordinate space
(`viewBox 0 0 2048 2048`). It registers by construction — see `../../extract-hair.py`.
Compose with `../../compose.py`, which layers it onto any base and applies colour.

Colour is never baked in. Every asset uses two canonical tones:
`rgb(140,122,110)` base and `rgb(114,97,86)` texture. `compose.py --hair-colour` swaps
both from one input, deriving the texture tone by darkening.

## The face mask

Styles that overlap the face trace as one solid mass with the face painted on top — the
hair has no hole of its own. Those assets carry a `<defs><mask id="facehole">` and wrap
their paths in `<g mask="url(#facehole)">`. Anything consuming an asset must take its
**full inner markup**, not just its `<path>` elements; pulling paths out with a regex
drops the mask and paints its black silhouette onto the face.

## Verifying

```sh
shasum -a 256 -c LOCKED.sha256
```
