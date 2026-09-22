Flat 2D vector avatar icon, square canvas, outline-free, pure white background.

KEEP EVERYTHING IN THE REFERENCE IMAGE COMPLETELY UNCHANGED: the broad squircle head and its exact size and shape, the flat pale peach skin, the small soft wedge nose low on the face, the two small rounded ear bumps, the neck and its soft rounded crescent shadow, the royal blue shoulder dome, the white background. THE NOSE MUST NOT MOVE and the HEAD MUST NOT CHANGE SHAPE OR SIZE. If a feature will not fit, make the FEATURE smaller — never rearrange the face.

NO HAIR ON THE HEAD — completely bald, no hairline, no fringe. NO EYEBROWS. NO EYES. NO MOUTH. NO BEARD. The face is blank apart from the nose that is already there, plus the eyewear described below.

IMAGE 2 IS THE AUTHORITY ON ONE THING ONLY: HOW HIGH ON THE FACE THE EYES SIT. The eyewear is centred on that line. IMAGE 2 IS NOT THE AUTHORITY ON ANYTHING ELSE. Do not copy its eyes. The face stays blank.

THE EYEWEAR has one lens over each eye position, a bridge across the top of the nose joining them, and a straight temple arm running from each outer corner back to the ear bump on that side. The frame is ONE flat dark charcoal grey, SOLID FLAT SHAPES with hard crisp edges, clearly darker than the skin. No outlines, no gradients, no shading, no highlights, no reflections, no glare, no glint.

---

## The temple arm, and what failed getting it there (2026-09-21)

Ryan: *"The aviators are mid ear and should follow the others over the ear?"* — `s02-aviator`
came back with a short blunt horizontal nub that stopped on the ear bump, where the three clear
styles run their arm up and back across the top of it.

⭐⭐ **RESHAPE THE ARM THAT IS THERE. Do not ask for the arm from another reference.** Two
generations asked for the arm to be *taken* from IMAGE 3 — "take from IMAGE 3 the way the arm
leaves the lens … and continues across the ear bump". Both Pro and model 2 obeyed and **kept the
old nub as well**, giving two arms on each side. `nano/s02-aviator-v2.png` and `-v3.png` are what
that looks like.

The wording that worked names the existing feature, says what is wrong with it, and reshapes it:

> THE ONE CHANGE IS THE SHAPE OF THE TEMPLE ARM. In IMAGE 2 each temple arm is a short blunt
> horizontal nub that stops on the ear bump. RESHAPE THAT SAME ARM so that it rises from the
> outer corner of the lens and lies back across the top of the ear bump, the way the arm in
> IMAGE 3 does. It is the same arm, reshaped — THERE IS EXACTLY ONE TEMPLE ARM ON EACH SIDE and
> no leftover nub, stub or second bar anywhere near the ear.

This is the same rule the avatar pipeline already records: **reshape a reference's feature,
never ask to remove or replace it.** Saying "exactly ONE" and naming the thing that must not
survive ("no leftover nub, stub or second bar") is what stopped the duplicate.

⚠ Pro did NOT floor here. The recipe's "Pro floors where model 2 moves" did not apply — both
models made the same mistake on the wrong prompt and Pro got it right on the right one. Fix the
prompt before reaching for the other model.

**Measured result:** the arm now reaches 21% across the ear, inside the 19–30% the other four
sit in; it was 13%. Nose drift on the trace: 0px.

🔴 **`s01-classic` has the same defect in a different form** — its arm is a thick wedge running
straight DOWN the head edge rather than back over the ear. Its horizontal reach measures 28%,
so the numbers do not catch it; only the crop does. Not fixed, not asked for.

---

## The glass highlight (2026-09-21)

Ryan: *"for the glasses they need to look like they have glass in them. if not it just seems
like they are empty frames."* A clear lens was a real hole with nothing in it.

⭐⭐ **THE FRAME IS NOT RE-TRACED.** `extract-glasses.py --glint <trace> <asset>` lifts ONLY the
highlight out of a new generation and adds it to the approved asset, clipped to the openings
that asset already has. Same discipline as `build-bushy.py`. It earned its keep immediately:
the `g03-bold` regeneration came back with a **much thinner frame** — it took the frame from the
highlight reference despite being told not to — and none of that reached the asset.

⚠⚠ **THE HIGHLIGHT IS THE SAME JIGSAW AS THE FRAME, one level down.** The vectorizer fills the
WHOLE lens white and butts the two skin-coloured corners back over it. Taking the white path
whole gives 99.8% of the opening — a blind, not a highlight. The band is what is left after the
corners are subtracted.

⚠⚠ **IT TRACES AS PURE WHITE, WHICH IS THE BACKGROUND TOKEN.** Left alone every highlight would
be repainted with the avatar's background colour and vanish on a white one. The extractor
retokenises it to `rgb(226,240,250)` on the way in.

⭐ **Width arrives as a PICTURE.** The first pass asked for "a single straight diagonal
highlight band" and got one so wide it covered 38% of the eye on `g03-bold`. The fix was to
generate `g02-rect` first, decide its two thin streaks were right, and hand that image back as
IMAGE 3 — "the same pair of separate parallel diagonal streaks per lens, at the same slant, at
the same narrow thickness relative to the lens". All three now sit in a 25–33% band.

⭐⭐ **AND IT IS TRANSLUCENT.** Ryan, straight after: *"The glint is there but you can't see
through it. It is glass and should be subtle so you can still see through it."* An opaque band
is a blind. `fill-opacity="0.35"`, picked off a strip from 0.18 to 0.55 — below 0.25 it
disappears, above 0.45 it starts hiding the iris.

⭐ Transparency also **deleted a derivation**. The highlight had been derived from the skin
(82% toward a cool white) purely so it would stay lighter than whatever it sat on — a
workaround for not having alpha. Compositing does that for free, so the tint is now one cool
constant, `rgb(214,234,250)`. ⚠ Cool is what carries it on the palest swatch, where the skin is
already at luminance 228.6 and there is nowhere lighter to go.

⚠⚠ This is the **first `fill-opacity` in the avatar system**. It joins `<mask>` and
`<linearGradient>` in the pile never proven on a device with react-native-svg.

⚠ `rings_of()` exists because **`flatten()` cannot read a hole.** It unions the subpaths, and a
hole unioned with the shape it sits in is a filled disc on top — the interiors vanish. An SVG
hole is a subpath resolved by fill-rule at paint time, so the rings have to be kept apart and
the nesting worked out by containment.

---

## The sunglasses glare, and the lens tone (2026-09-22)

Ryan: *"The sunglasses lens tint should be slightly lighter than black and also have a lens
glare that shows it's glass."*

⚠⚠ **`--glint` had to learn that the two families keep their glass in different places.** On a
CLEAR style the glass is the hole cut in the frame — the frame path's interior rings. On a
TINTED style the frame is SOLID and the lens is its own painted path: `s01-classic` has no
interior rings at all and `s02-aviator`'s only one is the gap between its double bridge bars,
nowhere near a lens. Clipping a sunglass glare to "the openings" would have thrown all of it
away. `glass_of()` takes the LENS path when there is one and falls back to the rings.

⭐ **The lens tone floor is set by the DARKEST FRAME, not by taste.** "Slightly lighter than
black" read literally is about `rgb(38,42,50)` — but the default frame is `rgb(34,38,46)`, so
that sits 6.6 luminance away and the frame stops reading as a rim on a black pair altogether.
`rgb(52,58,68)` keeps 20 luminance of separation. `rgb(68,75,87)` starts reading as mid-grey
rather than a sunglass lens.

⚠ The glare reuses the clear styles' highlight token and its 0.35 alpha, so a single opacity
rule covers both families.

