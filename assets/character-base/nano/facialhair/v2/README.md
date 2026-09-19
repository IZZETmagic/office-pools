# Facial hair v2 — the beard side of the seam

⚠ **Not assets yet.** Nano Banana PNGs that Ryan has approved as the target shape. Nothing here
is traced, extracted, tokenised or locked. v1 in `../assets/` is untouched and still what the
product renders.

## Approved so far

| asset | approved | band flat top | band thickness | was |
|---|---|---|---|---|
| `stubble.png` | 2026-09-18 | y454 | 51px | y472 / **4px** |
| `fullbeard.png` | 2026-09-18 | y454 | 50px | y438 / **10px** |
| `chinstrap.png` | 2026-09-18 | y454 | 51px | y479 / **3px** |

All three now share one band: flat square top at mid-ear, ~50px thick, outer edge flush, ears
clear, one flat tone. Every v1 sideburn was a needle of 3-10px, which is why none of them ever
met the hair.

Check any of them with:

```sh
uv run check-facialhair.py facialhair/v2/fullbeard.png
uv run check-facialhair.py facialhair/v2/chinstrap.png --strap
```

⚠ `--strap` skips the mouth-hole test. A chinstrap is a strap around the jaw and is SUPPOSED to
be bare in the middle — without the flag it reported 19,100px of "hole" on the locked chinstrap,
which is just its face. A permanently-red signal is one people learn to ignore.

## stubble — approved 2026-09-18

`stubble.png`, with the current asset beside it as `stubble-v1-for-comparison.png`. Each
approved shape has its live counterpart beside it the same way.

| | v1 (live) | v2 (approved) |
|---|---|---|
| band flat top | y472 | **y454** — mid-ear |
| band thickness | **4px** — a needle | **51px** |
| centre under the nose | y582 | y572 |
| cheek boundary | y613 | y612 |
| tone | one flat tone | one flat tone |

The band is the change that matters. v1's sideburn tapers to a 4px needle, which is why it never
met the hair — see `../../hair/seam/SIDEBURN-RECIPE.md`. v2's 51px band with a flat square top at
mid-ear is the same spec the three approved hair shapes are built to.

Check any candidate with:

```sh
uv run check-facialhair.py facialhair/v2/stubble.png
```

## The three things that went wrong, so they get checked and not eyeballed

⭐ **The locked "stubble" is a full beard in a lighter tone.** Measured against `fullbeard` it is
**80.2% the same pixels** — 74,716 vs 92,751, with only 161px that stubble has and fullbeard does
not. Ryan spotted this by eye. It is why the asset never read as stubble whatever we did to its
shape, and it is worth checking the same way before trusting any other "variant" in the set.

⚠ **A gradient cannot be tokenised.** Several rounds came back with the band fading smoothly at
the top. It looks right and it is unusable: `compose.py` recolours by swapping flat `fill` values,
so a faded beard would stay fixed-grey while the rest of the avatar recoloured — wrong on dark
skin, which is the exact failure the derived `STUBBLE` token exists to prevent. The checker now
fails anything with a tone spread over 6.

⚠ **It will punch a mouth-shaped hole in the beard.** Two of the three final samples did, 8,535px
and 6,387px of skin inside the mass, with the prompt explicitly forbidding it. A hole in the beard
is what killed the per-expression beard approach earlier in this project. Checked automatically.

## Two things still open

1. **The cheek notch depth.** Nano Banana puts it at y603-616 and will not move it — ~24 attempts
   across six framings, both models, with and without references. A geometry script did move it
   (603 → 543) but Ryan chose the generated shape, so the script was deleted rather than left
   lying around in a pipeline that forbids hand-editing art.
2. ~~**The `STUBBLE` mix ratio.**~~ **Resolved 2026-09-19.** At 0.55 a solid mass read as a beard
   at every hair/skin combination. Measured off `stubble.png`, the approved tone is 84% of the way
   to the skin in lightness *and greyer than the hair-to-skin line*, so a bigger ratio alone was
   not enough. The derivation is now `stubbleTone`: 83% toward the skin, then 55% toward its own
   grey — in `compose.py`, `lib/avatar/compose.ts` and `builder-template.html`, with a guard test
   that fails if any of the three drifts.
