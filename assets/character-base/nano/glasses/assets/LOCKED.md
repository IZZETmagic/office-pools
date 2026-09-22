# Locked eyewear assets

**These files are frozen.** They do not get regenerated, re-traced, re-extracted or "improved"
without an explicit request naming the asset. Same rule as `../../bases/LOCKED.md`.

| asset | paths | notes |
|---|---|---|
| `g01-round.asset.svg` | 2 | clear · round · v2 2026-09-21 — two-streak glass highlight |
| `g02-rect.asset.svg` | 2 | clear · rectangular · v2 2026-09-21 — the highlight the other two copy |
| `g03-bold.asset.svg` | 2 | clear · bold square · v2 2026-09-21 — two-streak highlight |
| `s01-classic.asset.svg` | 3 | tinted · v2 2026-09-22 — frame, lens, glare. ⚠ see the arm note |
| `s02-aviator.asset.svg` | 3 | tinted · v3 2026-09-22 — arm reshaped over the ear, then glare |

Locked 2026-09-22, after Ryan reviewed the set.

## The contract

**Three tokens, and a clear style carries only the first and last:**

| token | is |
|---|---|
| `rgb(64,70,78)` | the FRAME. Takes `--frame-colour` verbatim. |
| `rgb(96,126,156)` | the LENS. Its presence is what makes a style TINTED — compose infers it, there is no manifest. Painted `rgb(52,58,68)`, a near-black, whatever the frame. |
| `rgb(226,240,250)` | the HIGHLIGHT, at `fill-opacity="0.35"`. On a clear style it is the glass; on a tinted one, the glare. |

⭐⭐ **A CLEAR LENS IS A REAL HOLE.** The opening is cut out of the frame path as an interior
ring, not painted over. Eyewear composes OVER the eyes, so anything opaque there hides them —
and taking the traced frame at face value gives exactly that, because the vectorizer paints the
frame solid and butts the openings back on top as skin-coloured discs.

⚠ **`fill-opacity` is the only transparency in the avatar system.** It lives here, in the
asset, not in the compositors. Unproven on a device with `react-native-svg`, alongside `<mask>`
and `<linearGradient>`.

⚠ **No strokes.** Only hair is sealed that way; a guard test asserts every other family is clear
of `stroke="rgb(`.

## Where they sit

Over the eyes and **over the hair**. Measured against the head silhouette (x506..1534),
98.4–99.5% of every asset here sits INSIDE it, temple included — so there is no ordering that
fronts the lenses and leaves the arms behind. The nose still comes last.

A tinted style **suppresses the eyes entirely**, because the eye is bigger than the lens: the
default eye leaves 8.8% of its area outside `s01-classic` and `eye-hearts` leaves 29.5%.

## Open, deliberately not fixed

🔴 **`s01-classic`'s temple arm** runs straight DOWN the head edge instead of back over the ear,
which is what the other four do. Its horizontal reach measures 28%, so the numbers do not catch
it — only a crop at the ear does.

🔴 **`s01-classic`'s glare covers 46.4% of its lens**, against 33.5% on the aviator and 25–33%
on the clear three. Its streaks came back fatter. Left as generated.

Both were flagged to Ryan and left. One regeneration would address them together.

## Verifying

```sh
shasum -a 256 -c LOCKED.sha256
uv run ../../build-builder.py        # after ANY asset change — two tracked bundles depend on it
npx vitest run lib/design/__tests__/avatarAssets.guard.test.ts
```

⭐ The highlight is added, not hand-drawn: `uv run ../../extract-glasses.py --glint <trace>
<asset>` lifts ONLY the highlight from a generation and clips it to the asset's own glass, so
the approved frame cannot move. It caught a regeneration that came back with a much thinner
`g03-bold` frame.
