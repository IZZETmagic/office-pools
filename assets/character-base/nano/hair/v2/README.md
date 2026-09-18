# Hair v2 — the approved sideburn shapes

⚠ **These are not assets yet.** They are Nano Banana PNGs that Ryan has approved as the target
shape. Nothing here has been traced, extracted, tokenised or locked.

**v1 — live.** The SVG assets in `../assets/`. Those are what the product renders today and they
are untouched: chmod 444, `LOCKED.sha256`, 27/27 verifying.

**v2 — approved shapes, here.** `buzz.png`, `mohawk.png`, `receding.png`, each with its v1 render
beside it as `*-v1-for-comparison.png` so the two can be put side by side.

## What v2 changes

Only the sideburn. Every v2 sideburn measures the same:

| | v1 | v2 |
|---|---|---|
| where it ends | y455 / y434 / y466, all different | **y398–399, all the same** |
| shape at the end | dwindles to a point, some with a notch | **square flat cut, full thickness to the cut** |
| thickness at y360 | 33 / 30 / 23px | **49–51px** |
| outer edge | flush | **flush** |
| hair overhanging the ear | 0px | **0px** |

That uniformity is the point: a beard built to the same seam meets any of them without a per-pair
fix. See `../seam/SIDEBURN-RECIPE.md` for how they were made and what failed.

## Still to do before v2 is real

1. Trace each through Recraft `vectorize` (10 units each) and `extract-hair.py`.
2. Check registration and brow clearance survive the trace.
3. Convert the remaining hair styles — ⚠ run the ear-overhang check first, it is why
   `m12-shortsides` was dropped rather than converted.
4. Build the beard side of the seam so the two actually meet.
