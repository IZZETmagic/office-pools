# Locked mouth assets

**These files are frozen.** They do not get regenerated or "improved" without an explicit
request naming the asset. Same rule as `../../bases/LOCKED.md`.

| asset | built by | notes |
|---|---|---|
| `mouth-01-neutral.asset.svg` | `--curve 0` | the default; a level line |
| `mouth-02-smile.asset.svg` | `--curve 26` | closed-lip smile |
| `mouth-04-frown.asset.svg` | `--curve -22` | |
| `mouth-06-smirk.asset.svg` | `--lift 38 --bend 0.70 --shift 14` | ASYMMETRIC — see below |
| `mouth-07-pressed.asset.svg` | `--curve -4 --width 150 --thickness 20` | unimpressed; shorter and heavier |
| `mouth-08-wavy.asset.svg` | `--wave 7 --waves 2` | nervous squiggle |

Every one is a **single path, no mask, no transform** — the lowest-risk asset type in the
system, and the only face layer that is not exposed to the unproven `<mask>` device question.

## These are drawn, not generated

`../../mouth.py` emits them directly. No Nano Banana call, no Recraft trace, no extraction.
A closed-lip mouth is one stroke: there is nothing for a generator to invent, and the eye
round proved the model will not take direction on a dimension anyway — asking for eye height
ratios of 1.3 / 1.45 / 1.6 returned 1.66 / 1.57 / 1.60.

⚠ This is NOT the "regenerate art, never hand-edit it" rule being broken. That rule exists
because traced art has opaque structure — a shape that looks like a background can be a mask
painted over the skin, so deleting it unmasks the face. A primitive authored from scratch has
no hidden structure to break.

Only mouths that **open** need generating, because those have interior structure that has to
be drawn rather than derived: teeth, a dark gap, a tongue. That is `03-grin`, `05-open-o`,
`09-laugh` and `10-tongue`, still to come.

## Curvature is a parameter

Neutral, smile and frown are the same stroke at `--curve` 0, +26 and −22. Three assets
collapsed into one number, the same lesson as gaze in `../../gaze.py`. Before adding a mouth,
ask whether it is a parameter.

`--side -1` mirrors the smirk's curl to the left, so the other-handed smirk is a flag, not a
second asset.

## What a smirk is

⭐ A smirk is **not** a tilted straight line. That was the first attempt and it is wrong — a
uniform tilt only pivots the whole mouth, and it reads as a lopsided face rather than a wry
expression. A smirk is ASYMMETRIC CURVATURE: flat along one side, rounding up into a half
smile at the other, with the whole mouth **shifted toward the side that curls**.

That is why the centreline is a cubic. Symmetric curvature cannot express it and neither can
a tilt; the bend has to be concentrated at one end, which needs two independent control
points. With `--lift 0` the cubic reduces to the old quadratic exactly (a quadratic Q is the
cubic with C1 = P0 + ⅔(Q−P0), C2 = P3 + ⅔(Q−P3)) — verified: neutral and smile regenerate to
identical bounding boxes.

## The tone is deliberately not an iris tone

    rgb(182,122,112)   MOUTH_INK — sampled from the approved line weight, C-lightest.png

`compose.py --eye-colour` recolours the iris tokens with a plain string swap across the whole
composed document. A mouth sharing `rgb(117,62,21)` or `rgb(150,84,34)` would turn blue every
time the eyes did. The guard test enforces the separation.

## Proportions

Width 186 and thickness 17 are C-lightest's own line, measured. The centreline sits at y634
in 1024-space — where `landmarks.json` puts the mouth (centre 637), and the same fraction
between nose-bottom and chin that the reference used (0.34 of a 194px band).

⚠ Curve values are tuned for **legibility at 56px**, not for the close-up. A sagitta of 18
matches the reference smile exactly but flattens back toward neutral at leaderboard size; 26
survives the downscale. Judge a mouth at the size it will actually be seen.

## Path data is M/L only

Deliberately. Every number is then one half of an x,y pair, which is how `gaze.py`,
`extract-feature.py` and the guard test all parse path data. An `A` arc command takes 7
parameters, not 2, and would silently corrupt every bounding box they compute.

## Verifying

```sh
shasum -a 256 -c LOCKED.sha256
```
