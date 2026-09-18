# Locked facial hair assets

**These files are frozen.** They do not get regenerated, re-traced, re-extracted or "improved"
without an explicit request naming the asset. Same rule as `../../bases/LOCKED.md`.

| asset | paths | notes |
|---|---|---|
| `stubble.asset.svg` | 3 | ⭐ v2 2026-09-18 — seam band + fade marker |
| `fullbeard.asset.svg` | 3 | ⭐ v2 2026-09-18 — seam band + fade marker |
| `chinstrap.asset.svg` | 3 | ⭐ v2 2026-09-18 — seam band + fade marker |
| `moustache.asset.svg` | — | v1, not yet converted |
| `soulpatch.asset.svg` | — | v1, not yet converted |

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

## The fade marker

Each of the three carries its sideburn band in `rgb(126,110,150)`, which `compose.py --fade`
fills with a hair-to-skin gradient. See `../FADE.md`.

⚠⚠ BACK-OUT: with the fade OFF the marker is swapped for the asset's own body tone — the flat
behaviour that existed before — so these assets are safe either way. Verified on all three:
fade off gives no gradient and no marker in the output; fade on gives a gradient and no marker.
Guard tests enforce both directions.

## Verifying

```sh
shasum -a 256 -c LOCKED.sha256
uv run ../../check-facialhair.py ../v2/fullbeard.png
uv run ../../check-facialhair.py ../v2/chinstrap.png --strap   # a strap is bare in the middle
```
