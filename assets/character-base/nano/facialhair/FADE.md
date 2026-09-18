# The beard fade — how it works and how to back it out

## What it does

A facial hair asset paints its **sideburn band** in the marker tone `rgb(126,110,150)`.
`compose.py --fade` (and `compose.ts` with `fade: true`) turns that one path into a vertical
`<linearGradient>` running from the **skin** colour at the top to the **hair** colour at the
bottom, so the beard dissolves into the face the way a barber fade does.

Because the stops are derived from `--hair-colour` and `--skin` at compose time, it is correct
on every hair and skin combination automatically — the same derivation `STUBBLE` already uses.

## Why a gradient and not stripes

Ryan supplied a reference and it measured **63 distinct tones across 64 rows**, every one on the
hair-to-skin blend line. A true continuous gradient.

Generating the fade as flat stripes was tried first and does not work:

| attempt | result |
|---|---|
| 1 step | a hard edge, obviously banded |
| 4 stripes | still visibly banded; steps of 27% |
| ~13 stripes | smooth enough, but it vectorises to **26 paths per beard** and the steps fall below a pixel at 56px |

⭐ The gradient is also *less* work than the stripes: the asset stays one flat token and one
path, so `extract-feature.py` has nothing new to classify.

## ⚠⚠ BACK-OUT

**It is OFF by default.** With the flag off the marker is swapped for the flat hair colour —
exactly what the compositor did before this existed. Nothing renders differently.

To remove it entirely:

```sh
git revert <the commit that added the fade>
```

Nothing depends on it. No shipped asset carries the marker, and a guard test asserts that, so
the feature is currently inert in production.

The guard tests in `lib/design/__tests__/avatarAssets.guard.test.ts` enforce all of it:

- the default path emits no `linearGradient` and no `url(#`
- the marker never survives into output, in either mode
- with the fade on, the stops are skin-at-top and hair-at-bottom
- no shipped asset carries the marker

## ⚠ Unverified

`<linearGradient>` is supported by `react-native-svg` but has **never been proven on a physical
device** in this project. It joins the `<mask>` on three hair assets in that same pile. Prove it
on a device before any asset starts using the marker.

## The asset side — how the band gets marked

`extract-feature.py facialhair --fade-band` tokenises the sideburn band separately from the
beard mass, so `compose.py --fade` has something to fill.

⭐ **The band is found by POSITION, not colour.** It is the part of the beard hugging the head's
straight vertical sides (x516 / x1532 in 2048 units) above the jaw, under 400 units wide. Colour
cannot do it: a generated band may or may not be painted a distinct tone, and the vectorizer
quantises tones unpredictably.

⚠ `is_band` must parse the `d` attribute ONLY. The first version ran the number regex over the
whole `<path …>` element, which swallowed the fill's `rgb(140,122,110)` components as
coordinates and dragged every bounding box toward the origin — no band ever matched, silently.

⚠⚠ BACK-OUT applies here too: without `--fade-band` every path takes the single token exactly as
before.

Proved end to end on 2026-09-18 — `fullbeard-v10` traced through Recraft, extracted with
`--fade-band` (2 of 3 paths tokenised as the band), composed with `--fade`. Ryan approved the
result.

## Still to do

1. **The fade only spans the band's upper third.** The gradient's extent is set by the marked
   path, and `fullbeard-v10` only had its top third as a separate shape. To fade across the
   whole band, generate the beard with the FULL band as one distinct region.
2. **No asset is committed yet.** The approved shapes live in `../hair/v2/` and `v2/` as PNGs.
3. **Texture is lost on a single-pass trace.** `hair/v2/buzz.png` traced to 3 paths against the
   locked asset's 4 — the swoosh strokes went. It needs `isolate-texture.py` and
   `extract-hair.py --texture`, which is another 10 units per style. See `../hair-prompt.md`.
