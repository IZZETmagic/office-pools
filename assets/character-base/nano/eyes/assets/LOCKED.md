# Locked eye assets

**These files are frozen.** They do not get regenerated, re-traced, re-extracted or "improved"
without an explicit request naming the asset. Same rule as `../../bases/LOCKED.md`.

| asset | paths | notes |
|---|---|---|
| `eye-01-base.asset.svg` | 6 | the neutral base pair: 2 white + 2 iris core + 2 iris rim |

## What an eye asset is

An SVG fragment holding only its own paths, in the locked base's coordinate space
(`viewBox 0 0 2048 2048`). It registers by construction — generated onto the locked base, so it
already lives there. Compose with `../../compose.py --eyes`.

Eyes paint AFTER hair. Every hair asset is verified to leave the eye zone clear, so this cannot
hide them and it guarantees a fringe never buries the eyes.

## Two tones, not one

The iris is drawn with a DARKER CORE and a LIGHTER RIM, and that is real in the generated art —
two clusters at luminance 74 and 98 holding ~916px and ~574px. It is not a tracing artifact.
Collapsing them to a single ink flattens the artwork.

  `rgb(117,62,21)`  iris core
  `rgb(150,84,34)`  iris rim
  `rgb(255,255,255)` eye white

`compose.py --eye-colour` takes ONE colour: the core gets it, the rim is derived by lightening
28%. Same shape as hair's base/shade/light.

## Proportions the base pair was built to

Measured against Ryan's reference crop:

|  | height ÷ width | gap ÷ eye width |
|---|---|---|
| reference | 1.36 | 0.30 |
| `eye-01-base` | 1.30 | 0.37 |

⚠ The eyes are CLOSE-SET. An earlier prompt said "a generous gap of bare peach between them",
which produced a gap/eye of 1.09–1.21 — three to four times too wide — through several rounds
before it was caught. Any new eye asset must hold gap/eye near 0.3.

⚠ Eye height resists direction. Asking for ratios of 1.3 / 1.45 / 1.6 returned 1.66 / 1.57 /
1.60 — the model snaps to its own preferred eye shape. Size responds; height does not. If a
specific height is needed, scale the paths at extraction rather than re-prompting.

## Verifying

```sh
shasum -a 256 -c LOCKED.sha256
```
