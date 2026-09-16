# Locked mouth assets

**These files are frozen.** They do not get regenerated, re-traced, re-extracted or "improved"
without an explicit request naming the asset. Same rule as `../../bases/LOCKED.md`.

| asset | paths | notes |
|---|---|---|
| `mouth-01-neutral.asset.svg` | 1 | the default; a level line |
| `mouth-02-smile.asset.svg` | 1 | closed-lip smile |
| `mouth-03-grin.asset.svg` | 3 | open: teeth + interior + tongue |
| `mouth-04-frown.asset.svg` | 1 | |
| `mouth-05-open-o.asset.svg` | 1 | surprise; an upright oval opening, INTERIOR tone not lip |
| `mouth-06-smirk.asset.svg` | 1 | ASYMMETRIC — see below |
| `mouth-07-pressed.asset.svg` | 1 | unimpressed; shorter and heavier |
| `mouth-08-wavy.asset.svg` | 1 | nervous squiggle |
| `mouth-09-laugh.asset.svg` | 3 | open: teeth + interior + tongue |
| `mouth-10-tongue.asset.svg` | 2 | playful; tongue hangs BELOW a closed line |

Generated with Nano Banana Pro against `../../bases/base-neck-100.png`, traced with Recraft
`vectorize`, extracted by `../../extract-feature.py mouth`. Sources in `../nano/`.

## They were drawn first, and then regenerated

An earlier set was drawn directly as geometry by a `mouth.py` script (see commit `5b23101` if
it is ever wanted). Six closed-lip mouths, free and mathematically exact. Ryan asked to try the
Nano Banana route anyway, and the comparison settled it:

- **Closed lines: no real difference.** Nano came out 7% wider and measurably *less*
  symmetric (mirror disagreement 6.1% vs 3.4% on the smile). The generated colour does not
  even survive — extraction normalises both to the same token.
- **Open mouths: nano wins outright.** The tooth band tapers into the corners, the opening's
  lower edge curves independently of the upper, and the tongue sits as a dome with a dark rim.
  The drawn grin collapsed into a pale sliver at 56px.

⭐ The lesson is not "generate everything". It is that **generation earns its cost where there
is interior structure to invent**, and earns nothing on a shape that is one stroke. The whole
set is generated here for one provenance and one character, which is a consistency decision,
not a quality one.

## What a smirk is

⭐ A smirk is **not** a tilted straight line. That was the first attempt and it reads as a
lopsided face, because a uniform tilt only pivots the mouth. It is ASYMMETRIC CURVATURE: flat
along one side, rounding up into a half smile at the other, with the whole mouth **shifted
toward the side that curls**. The prompt has to say all three parts or the model returns a
tilt.

## Tokens

    rgb(182,122,112)   MOUTH_INK    the lip / the line
    rgb(118,72,68)     MOUTH_DARK   the inside of an open mouth
    rgb(206,116,112)   MOUTH_TONGUE
    rgb(255,255,255)   MOUTH_TEETH  never recoloured

⚠ None of these may collide with the iris tokens `rgb(117,62,21)` / `rgb(150,84,34)`.
`compose.py --eye-colour` swaps those across the whole composed document, so a mouth sharing
one would turn blue every time the eyes did. The guard test enforces it, stated as "no iris
token" rather than a closed palette so the rule survives new open mouths.

`--mouth-colour` takes ONE colour: the lip gets it, the interior is derived 0.65 darker, the
tongue 1.13 lighter. ⚠ On `10-tongue` that flattens the design slightly — its line and tongue
are further apart in the generated art than a 1.13 ratio reproduces.

## Classifying the parts, and why it is not by luminance order

The extractor has to decide which traced path is lip, interior, tongue or teeth. Ordering
alone fails in two directions and both were seen:

- "darkest = interior" called **05-open-o** a *lip* — it has only one tone.
- it called **10-tongue**'s *line* an interior — there the darker tone is the lip and the
  lighter one is the tongue, the opposite of the grin.

What works:

1. white → teeth.
2. **luminance < 100 → interior.** This one tone can be named absolutely: measured across the
   set the interiors land at 62–69 while every lip and tongue sits at 131–148.
3. a mid tone **contained inside an interior** → tongue.
4. otherwise, with two mid tones, the lighter one → tongue **only if it reaches lower** than
   the darker. Lightness alone cannot do it: lip and tongue tones overlap (131–135 vs
   139–148), so the bottom edge is what separates them.
5. anything left → lip.

## Two silent failures this set produced

⚠ **The extraction band was too small and ate the laugh's teeth.** `landmarks.json` mouth
`placement` is 28px tall — the median of the closed LINE mouths — and `observed` predates any
open mouth. The laugh's tooth band centred 7 units above the `observed` ceiling and vanished
with no error. The zone now carries an explicit `extract` band running from below the nose to
the chin. Same failure that lost both eye whites on the first eye run.

⚠ **A mouth that is too big makes the model move the NOSE.** The first laugh came back with
the nose 110px higher, because the mouth would not otherwise fit — the same reflex that made
the first afro shrink the skull by 31%. Registration is by construction and that breaks it.
The prompt now says explicitly: if the mouth will not fit, make the MOUTH smaller, never
rearrange the face. **Check nose drift on every new open mouth** — nine of ten registered to
within 1px, so an outlier is obvious.

## Verifying

```sh
shasum -a 256 -c LOCKED.sha256
```

Nose registration, which the checksums cannot see:

```sh
# every trace should put the nose at y954-1132, the locked base's own position
```
