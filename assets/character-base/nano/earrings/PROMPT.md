Flat 2D vector avatar icon, square canvas, outline-free, pure white background.

KEEP EVERYTHING IN THE REFERENCE IMAGE COMPLETELY UNCHANGED: the broad squircle head and its exact size and shape, the flat pale peach skin, the small soft wedge nose low on the face, the neck and its soft rounded crescent shadow, the royal blue shoulder dome, the white background. THE NOSE MUST NOT MOVE and the HEAD MUST NOT CHANGE SHAPE OR SIZE. If a feature will not fit, make the FEATURE smaller — never rearrange the face.

⚠ THE TWO EAR BUMPS DO NOT CHANGE. They stay exactly the size, shape and position they are in the reference image. The jewellery is added ON them and hangs BELOW them; the ears themselves are not enlarged, moved, reshaped or redrawn to make room.

NO HAIR ON THE HEAD — completely bald, no hairline, no fringe. NO EYEBROWS. NO EYES. NO MOUTH. NO BEARD. The face is blank apart from the nose that is already there, plus the jewellery described below.

THE JEWELLERY IS THE SAME ON BOTH EARS, mirrored left and right, sitting on the lower part of the ear bump. It is ONE flat warm gold, a SOLID FLAT SHAPE with hard crisp edges, clearly darker than the skin so it reads against it. No outlines, no gradients, no shading, no sparkle, no highlights.

---

## Notes (2026-09-22)

⭐ **Pin the ears explicitly.** Every other family's prompt protects the nose and the head; this
one also has to protect the **ear bumps**, because the jewellery hangs off them and the obvious
failure is the model enlarging an ear to make room. The clause that worked: *"THE TWO EAR BUMPS
DO NOT CHANGE… the ears themselves are not enlarged, moved, reshaped or redrawn to make room."*
All four came back with the nose within 1px and the ears untouched.

⭐ **Say the hole out loud for a hoop.** *"The middle of the ring is open and the skin shows
through it"* — without it a hoop comes back as a solid lozenge.

⚠⚠ **A HOOP'S HOLE IS THE SAME JIGSAW AS A LENS OPENING**, with one difference: it traces in
**WHITE**, not skin, because a hoop hangs off the head into the background. `e02-hoop` traced as
a solid ring with the hole butted on top and needed the subtraction; `e04-bighoop` traced as a
genuine ring and needed none. Both outcomes are normal — the extractor reports which happened.

⚠⚠ **The EAR is not a hole.** It is a base colour, it sits inside the ear zone, and it overlaps
the stud painted on top of it — so "subtract the base-coloured paths" erases the jewellery
outright. A hole is one CONTAINED IN THE METAL'S OWN GEOMETRY.

⭐⭐ **AN EARRING IS PAINTED WITH THE EAR** — first in the stack, before anything that could
cover it. Ryan: *"if you can't see the ears then there should be no seen earring."* It first
went in FRONT of the hair, reasoning that a chosen accessory should never be invisible; that is
the wrong instinct, because hair over an ear hides an earring in life and one floating on top
reads as a mistake. Painting it with the ear makes the rule automatic — no per-style flag, no
coverage test to keep in step.

⚠ Binary in practice: only `f09-midwavy` and `m15-locs` reach the ear at all, and both cover it
COMPLETELY — so an earring is fully visible or fully hidden, never half-eaten.
