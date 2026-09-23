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


---

## Letting the generator design them (2026-09-22)

Ryan: *"Can you ask Nano banana for it to make the garments? Within our style on the base
avatar."* Six open briefs — one per family (knitwear, outerwear, sport, formal, casual,
layered) — with the design itself left to the model. Five shipped.

⭐⭐ **THE SHOULDER DOME IS THE BODY.** That is the one constraint that is not taste: a garment
can never be narrower than it, because the avatar has no bare shoulder or chest to expose. A
collar or hood MAY rise above it. All six respected it.

⭐ **The generator designs in its OWN hue** — these came back green, olive and teal. That is
fine, because the tones are tokenised on the way in and `--shirt` drives all three. It does mean
nothing can be identified by matching the base's blue.

⚠⚠ **FINDING THE BODY TONE TOOK FOUR TRIES**, and the first three are all plausible and all
wrong:

| rule | why it fails |
|---|---|
| closest to the base's blue | the design is green, olive or teal |
| the largest area | the sports top's biggest area is its LIGHT PANEL, 39% against a 22% body |
| a probe point | landed inside the knitwear's fair-isle band, which crosses the whole chest |
| the outer rim | the SHADOW PANEL is large and owns the whole right rim |

⚠⚠ **And all four share one blind spot: THE JIGSAW.** The vectorizer lays ONE tone down as the
whole dome and butts every other shape on top, and which tone it picks is arbitrary — on the
knitwear it chose the DARK one, giving it 547k of area against the body's 318k. Every path is
now reduced to what is actually VISIBLE (painter's algorithm: each shape minus everything drawn
after it) BEFORE anything is measured. Then the body is whatever owns the outer rim of the LEFT
half — collars and pockets sit inboard, and the prompt pins the shadow panel to the right.

🔴 **`i06-layered` was dropped.** Its art stops the opening around y1920 but the trace carried
skin to the canvas bottom, so it rendered as a bare strip down the chest. Regenerable; not worth
shipping as it was.

---

## The SP chest mark (2026-09-22)

🔴🔴 **THIS SLOT TAKES THE SPORTPOOL MARK ONLY.** Never a club crest, club name or kit design.
Those are protected marks, and the licence we hold covers displaying a crest in a fixture list
— not putting one on a garment a user wears. The recorded rule is **colourways, never badges**.

⭐⭐ **IT IS THE ONE ASSET HERE THAT IS NOT GENERATED.** The SportPool mark is TYPE:
`components/ui/Wordmark.tsx` is one word set in Nunito 900, and its compact form is `SP`. Asking
a generator for letters returns something letter-SHAPED, and a garbled mark is worse than no
mark — so `build-mark.py` takes the outlines from the font the product actually ships.

⭐ **Compact and mono, both per the wordmark's own rules.** `SP` is the form "for a band, a tab
bar, a favicon"; mono is "for surfaces that require all-white or all-black — a pool's
brand-coloured header … where the brand blue would either clash with the background or
disappear into it." A garment is exactly that surface.

⚠⚠ **THE SLOT IS SOLVED, NOT CHOSEN.** Ryan on the first attempt: *"the mark is bad and not
positioned properly. it should be where the team logo would normally go on a jersey."* It was 66
units too low and 75 too far out — a badge on the arm, not a crest on the chest. Three
constraints bind it at once:

| | |
|---|---|
| the shoulder | the dome is a CURVE — at y1650 the shirt only reaches x1421 |
| every neck | the neck is painted OVER the garment and base-140's reaches x1268 |
| every garment | the slot must be on all five, not just the default shirt |

Searched over the intersection of all four bases' shirts and all five garments, minus every
base's neck: the HIGHEST a 130×73 crest fits is y1640, centred x1325.

⚠⚠ **AND THAT CEILING IS NOT THE ANSWER.** Ryan, on seeing it there: *"the logo is too high it
should be lower."* A real crest does sit high — but high on a REAL chest is well below the
collar, and this avatar's chest *starts* at the collar, so the geometric ceiling read as a badge
stuck to the collarbone. Lowered to y1780, then again on *"a little lower"* to **y1845 — 61% of
the way down the visible chest** (y1519..2048). The lesson is that solving for the extreme of a
constraint is not the same as solving the design; the search tells you where it CAN go, not
where it BELONGS.

⚠ Nothing to dodge going down: the shadow panel covers that whole column on every garment, so
the crest always sits on it. Its own token is mixed most of the way to white, which is why it
reads against the body and the shadow alike. Verified 0% hidden on every neck width and 100% on
every garment at the shipped position.

⚠⚠ **A TRUETYPE OUTLINE IS QUADRATIC.** The font pen emits `Q`, which renders correctly in a
browser and in react-native-svg and is **invisible to every tool in this pipeline**, all of
which parse M, L, C and Z only — measured through one, the mark read 26 units wide instead of
180. `build-mark.py` converts to cubics, and a guard test pins the vocabulary.

⚠ The mark gets its OWN token rather than the garment's light one: a crest wants more contrast
than one step of lightening, and the sports top paints PANELS in the light token, so a mark
sharing it would vanish wherever it crossed one.

---

## The P was corrupt, and it still looked like a P (2026-09-22)

Ryan: *"the SP logo is not right though. you can use nano banana."* It was not a design problem
and the generator was not needed — **`build-mark.py` was corrupting the glyph.**

⚠⚠⚠ `SVGPathPen` emits **H and V** (horizontal and vertical lineto) as an optimisation, and the
first parser ended in `else: i += 1` — silently skipping anything it did not recognise. The
**S contains no H or V and came out perfect**; the **P is full of them**, so every coordinate
after the first was read as the wrong axis and it rendered as a slashed wedge with an angular
foot. It shipped that way and Ryan caught it by eye.

⭐⭐ **A PARSER THAT SILENTLY DROPS WHAT IT DOES NOT UNDERSTAND turns a missing branch into a
corrupted glyph that still looks like a glyph** — the worst failure mode, because it renders and
nothing throws. H and V are now handled and **any unrecognised command raises**.

⭐ The structural tell is the **counter** — the enclosed hole in the P. A whole P is two
subpaths; the mangled one was a single contour. A guard test pins S=1, P=2.


---

## Textured garments, and what the extractor learned (2026-09-23)

Ryan: *"can you kind of keep the team but give more creative freedom to nano banana to see what
it can create like a bit more texture in the shirts … if something happened to be knitted, for
example you can see all the knitting and stuff not high Fidelity."*

The set is six, replacing the five plain ones: **cable, hoops, quilt, track, waffle, fairisle**.

⭐⭐ **MY OWN BRIEF WAS THE THING BLOCKING IT.** The first one said *"no outlines, no gradients,
no shading, no texture, no stitching"* — written to keep the house style flat, and it forbade
exactly what Ryan asked for. The replacement asks for the opposite and bounds it by TECHNIQUE
rather than by amount: *"Show what the garment is MADE of … as SOLID FLAT SHAPES — repeated
blocks, bars, chevrons, diamonds — never as thin outlines, hatching, noise or gradients. Low
fidelity is right."* Flatness was never the constraint; thin marks and soft edges were.

### Two generations had to be redone, and neither was a design problem

⚠⚠ **`track` came back as a giant zip-up jacket filling the frame, no avatar in it.** The cause
was a contradiction I wrote: the silhouette clause says NO SLEEVES and NO SEAMS BREAKING THE
OUTLINE, and four lines later the sport clause asked for *"the panels, the hoops, the sleeve
seams."* Given two instructions the model picked the one that described a real garment. ⭐ The
fix was to the prompt, not the model — and the framing clause was hardened at the same time,
because the failure was one of FRAMING: *"Your picture must be the SAME PICTURE as image 1 with
a different garment painted on it … DO NOT ZOOM IN. DO NOT CROP. The garment must never be the
subject of the picture — the avatar is."*

⚠ **`quilt` came back as a life jacket** with lobes outside the dome. Regenerated asking for the
quilting as *"a grid of big rounded rectangular puff panels … each panel a solid flat block with
a darker channel between them."* Naming the STRUCTURE gets a quilt; naming the garment gets
whatever the model thinks a quilted thing looks like.

### Five extractor bugs, all of one shape

Every one was the extractor treating base-100 — the base the art is traced against — as though
it were the only base, or treating a containment test as though it were a clip.

⚠⚠⚠ **CONTAINMENT DROPS WHAT A CLIP WOULD TRIM.** `REGION.contains(bbox)` threw away any path
that poked outside the body band. `track`'s entire right-hand body reached x1801 against a
region ending at x1760, so **41 units of overhang cost it half its garment** — 270k against a
530k shirt, a hole where the shoulder is, because compose LIFTS the base shirt out. The region
is now a majority-overlap sanity gate and the dome clip is the only boundary.

⭐⭐ **AND THE INVARIANT THAT CATCHES IT: A GARMENT MUST COVER THE SHIRT IT REPLACES.** `bare`
is now computed against the dome and the extractor EXITS rather than writing an undersized
asset. Four of the six would have shipped with holes.

⚠⚠ **SOLID UNDER THE NECK.** The trace paints skin in base-100's neck column, so a garment came
back with a base-100-shaped hole — and base-085's neck is 26 units narrower on each side, which
is 26 units of background beside the neck. The necks are strictly nested (085 ⊂ 100 ⊂ 125 ⊂
140), so the garment is filled to the WIDEST and every base's own neck is painted on top of it.

⚠⚠ **SAME BUG ONE LAYER ON: the exposed chest was cut to base-100 too**, and stuck out past
base-085's neck as a pale RING of skin. Cut to the widest neck instead.

⚠⚠ **A DETAIL IS PAINT ON THE GARMENT.** `shade` and `panel` were only cut by the head, never
clipped — `track`'s stripes ran out to x1800 and rendered as bars floating in the background.
They are clipped to the body now.

⚠⚠ **ABOVE THE SHOULDER, ONLY A COLLAR — AND IT MUST BE ATTACHED.** The old allowance was the
whole canvas above the shirt line, which is almost all background: `quilt` put a band across
x625..1423 beside a neck that is 780..1268 at its widest, and it rendered as two sharp blue
WINGS under the jaw. Clamping to a collar envelope bounds WHERE a fragment may sit; it does not
say WHETHER it belongs, and two small tabs survived inside the envelope touching nothing. ⭐ So
only pieces CONTIGUOUS WITH THE DOME survive. A real collar rises out of the garment, always.

### The body tone is not a geometry question

⭐⭐ Five rules have now been tried for "which traced tone is the body": closest-to-blue, largest
area, a probe point, the outer rim, and the rim minus the canvas crop. **Each is right on some
of the art and wrong on the rest.** The cable knit settles it — its light cables run the full
height and reach the outline, so on any measure that looks at edges they ARE the ground.

So the vote stays as the DEFAULT (right on five of six) and `--body R,G,B` states the answer when
it is not. A guess that is reviewed and written into the build command beats a guess that is
inferred and trusted.

### Rebuild

```
uv run extract-garments.py /tmp/tx-t01-cable/vectorize-00.svg   garments/assets/g01-cable.asset.svg --body 37,115,195
uv run extract-garments.py /tmp/tx-t02-hoops/vectorize-00.svg   garments/assets/g02-hoops.asset.svg
uv run extract-garments.py /tmp/tx-t03-quilt/vectorize-00.svg   garments/assets/g03-quilt.asset.svg
uv run extract-garments.py /tmp/tx-t04-track/vectorize-00.svg   garments/assets/g04-track.asset.svg
uv run extract-garments.py /tmp/tx-t05-waffle/vectorize-00.svg  garments/assets/g05-waffle.asset.svg
uv run extract-garments.py /tmp/tx-t06-fairisle/vectorize-00.svg garments/assets/g06-fairisle.asset.svg
uv run build-builder.py
```

⚠ Only `g01-cable` carries an override. `-v` prints the rim tally, which is how to check the
vote before trusting it.

⚠ **NOT LOCKED.** These are pending Ryan's review; no `LOCKED.sha256` and no `chmod 444` until
he says so.
