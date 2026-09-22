Flat 2D vector avatar icon, square canvas, outline-free, pure white background.

KEEP EVERYTHING IN THE REFERENCE IMAGE COMPLETELY UNCHANGED: the broad squircle head and its exact size and shape, the flat pale peach skin, the small soft wedge nose low on the face, the two small rounded ear bumps, the neck and its soft rounded crescent shadow, the white background. THE NOSE MUST NOT MOVE and the HEAD MUST NOT CHANGE SHAPE OR SIZE.

⚠⚠ THE SHOULDER DOME KEEPS ITS EXACT OUTLINE. The royal blue shape below the neck stays exactly as wide as it is in the reference image and reaches exactly the same points at the left edge, the right edge and the bottom of the canvas. Do not narrow it, do not round it differently, do not lift it off the bottom. Only its NECKLINE and the garment details described below change.

⚠ IT KEEPS ITS TWO TONES: the main royal blue, and the slightly darker blue shadow panel on the right side, in the same place and the same shape as the reference. There are only these TWO blues — no third tone, no outline, no gradient, no highlight, no stitching.

NO HAIR ON THE HEAD — completely bald, no hairline, no fringe. NO EYEBROWS. NO EYES. NO MOUTH. NO BEARD. The face is blank apart from the nose that is already there.

Everything is SOLID FLAT SHAPES with hard crisp edges.

---

## Notes (2026-09-22)

⭐⭐ **PIN THE SHOULDER DOME, then change only the neckline.** *"The royal blue shape below the
neck stays exactly as wide as it is in the reference image and reaches exactly the same points
at the left edge, the right edge and the bottom of the canvas."* That is what guarantees a
garment covers at least as much as the shirt it replaces — the base's shirt is LIFTED OUT, so a
narrower garment would leave background showing at the shoulder. Measured: all four reach
x171..852 and the bottom of the canvas exactly, and every one leaves under 0.1% of the base
shirt uncovered.

⭐ **The hood may rise above the dome; say so explicitly.** *"The hood is the only thing that may
rise above the shoulder dome."*

⚠⚠ **THE ART COMES BACK WITH MORE THAN TWO BLUES.** `w01-crew` traced three tones and `w04-polo`
three, and the system has exactly two shirt tokens. Everything that is not the main body tone is
collapsed into the SHADOW token. Not a loss: the rib's spokes merge into one band and the gaps
between them are the MAIN tone, so the rib survives as light gaps in a dark arc.

⭐⭐ **ONE ASSET SERVES ALL FOUR BASES** even though their shirts differ — base-140's is **2.16%
larger in area** than base-100's, because the collar opening widens with the neck. A traced
garment comes back SOLID (the vectorizer butts the neck back over it) and the per-base neck
painted on top cuts the right collar. **The collar is paint order, not geometry.**

⚠ A garment paints in the base's own SHIRT tokens, so `--shirt` recolours it with no new token,
config field or palette.

---

## A lower neckline has to bring its own chest (2026-09-22)

Ryan: *"The crew and v neck doesn't show any more skin."* Correct, and the reason was not the
art.

⭐⭐ **THE NECK IS ALREADY PAINTED OVER THE SHIRT**, all the way down to its bottom at y1763, by
`front-neck-<N>`. So every garment already shows the WHOLE neck, and cutting a neckline lower
cannot reveal any more of it — there is nothing below. The avatar is a bust with no chest.

So a garment that opens below the neck **carries the skin it exposes**, as a `BASE_SKIN` path of
its own: `traced skin MINUS the base-100 neck`, which is exactly the part the generation
invented. `--skin` recolours it with the face.

⭐ **The prompt has to say the neckline is an OPENING, not a drawing.** The first pass asked for
a V "edged by a narrow band in the darker blue" and got exactly that — a blue V painted ON the
blue, with no skin anywhere. The wording that worked:

> Cut the neckline out of the blue so that THE PALE PEACH SKIN OF THE NECK SHOWS THROUGH IT …
> Do NOT draw the neckline as a blue line, a blue band or a darker blue shape on top of the
> blue: there must be real peach skin inside it.

⚠⚠ **AND THE SEAM IS BURIED, NOT BUTTED.** Subtracting the neck exactly leaves the chest's top
edge coincident with the neck compose paints on top — two anti-aliased edges on one line cover
~75% between them and the garment BLUE leaks through as a dashed hairline across the opening,
visible at 4x. `SEAM_BURY = 6` pushes the seam inside the neck's solid interior. Same cure as
the beard bands: **overlap hidden geometry, never butt edges.**

