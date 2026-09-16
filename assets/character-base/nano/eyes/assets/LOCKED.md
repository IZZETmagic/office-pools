# Locked eye assets

**These files are frozen.** They do not get regenerated, re-traced, re-extracted or "improved"
without an explicit request naming the asset. Same rule as `../../bases/LOCKED.md`.

| asset | paths | notes |
|---|---|---|
| `eye-01-base.asset.svg` | 6 | neutral: 2 white + 2 iris core + 2 iris rim |
| `eye-02-happy.asset.svg` | 8 | smiling crescents — lower lid arcs up into the eye |
| `eye-03-closed.asset.svg` | 2 | closed lids; LID tone, not iris |
| `eye-04-wide.asset.svg` | 6 | surprised — h/w 1.76, small iris with white all round |
| `eye-05-narrowed.asset.svg` | 8 | sceptical — h/w 0.41 letterbox, iris cropped by the lid |
| `eye-06-sleepy.asset.svg` | 8 | drowsy — h/w 0.64, a peach lid covers the top half |
| `eye-07-wink.asset.svg` | 4 | ASYMMETRIC: open eye left, closed lid right |
| `eye-08-worried.asset.svg` | 9 | concerned — lids slope up toward the nose |

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

  `rgb(117,62,21)`   iris core
  `rgb(150,84,34)`   iris rim
  `rgb(255,255,255)` eye white
  `rgb(90,60,45)`    LID line — closed eyes, never touched by `--eye-colour`

An eye with NO white has no eyeball showing: its marks are closed LIDS, not irises, and must
stay a lid colour. Recolouring to blue turned closed eyelids bright blue, which reads as paint
rather than a shut eye.

⚠ That test is PER SIDE of the face, not per asset. `eye-07-wink` has an open eye on one side
and a closed lid on the other, so an asset-wide test would recolour the winking lid.

⚠ `eye-07-wink` is the ONLY asset that is deliberately not mirror-symmetric. Its prompt has to
override the "both eyes are exact mirror images" rule the other assets rely on.

`compose.py --eye-colour` takes ONE colour: the core gets it, the rim is derived by lightening
28%. Same shape as hair's base/shade/light.

## Proportions the base pair was built to

Measured against Ryan's reference crop:

|  | height ÷ width | gap ÷ eye width |
|---|---|---|
| reference | 1.36 | 0.30 |
| `eye-01-base` | 1.30 | 0.37 |

Expression is carried by the SHAPE OF THE OPENING, at a constant eye width of 133:

| asset | h/w |
|---|---|
| `eye-04-wide` | 1.76 |
| `eye-01-base` | 1.30 |
| `eye-06-sleepy` | 0.64 |
| `eye-05-narrowed` | 0.41 |

`eye-02-happy` and `eye-03-closed` are not on this scale — they change the SHAPE of the opening
rather than its height: a crescent and a pair of lids.

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
