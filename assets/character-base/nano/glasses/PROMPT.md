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
