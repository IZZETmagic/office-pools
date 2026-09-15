# Hair generation prompt

The prompt used to generate hair avatars with Nano Banana Pro, against
`bases/base-neck-100.png` as the reference. Kept here because it is the thing holding the
set coherent, and it encodes four rules that were learned the expensive way.

## The rules, and why each exists

**1. Generate onto the locked base, always.** The output inherits the base's canvas, viewBox
and head position — nose within 3px, neck within 2px. That shared coordinate space is the
only reason assets register without an anchoring system.

**2. Never demand that ears stay visible on a large style.** The first afro came back with a
head 31% narrower than the base, because forcing the ears outside a big afro makes the model
shrink the skull to fit them. Dropping that line held the head at −2.1%. Let hair cover the
ears; the z-order handles it.

**3. The hairline must clear the brow line.** Brows sit at y258–350 (1024-space) and eyes
start at y363. A slim brow needs 20–30px between the hairline and the eyes. The `04-crop`
generation left 1px and had to be rejected; the side-part left 9px and cannot carry brows.

**4. Texture is a second flat tone, with blunt tips.** Recraft's vectorizer rounds off fine
tapered points, so a swoosh ending in a sharp tip loses it in conversion.

**5. Trace texture in a SECOND pass.** The vectorizer simplifies thin shapes sitting inside a
much larger one — short-sides kept only 52% of its texture area in a single pass. Isolating
the texture tone and tracing it alone recovers 95-100%. Across the fourteen men's assets this
took retention from a measured average to **99%**. Costs 10 extra units per asset. See
`isolate-texture.py` and `extract-hair.py --texture`.

Do NOT solve this by making the texture chunkier in generation. That was tried: it works
(100% retention) but produces a visibly different, flatter haircut. Ryan rejected that
direction — keep the art, fix the trace.

## Generating

```sh
uv run "$SKILL_DIR/scripts/image.py" --prompt "$(cat hair-prompt.md | sed -n '/^---BEGIN/,/^---END/p') ... " \
  --model pro --size 1K --aspect 1:1 --reference bases/base-neck-100.png
```

Then screen for brow clearance off the PNG before paying to trace — see `extract-hair.py`.

---BEGIN PROMPT---

Flat 2D vector avatar icon, square canvas, outline-free, pure white background.

KEEP EVERYTHING IN THE REFERENCE IMAGE COMPLETELY UNCHANGED: the broad squircle head and its
exact size and shape, the flat pale peach skin with no shading on the face, the small soft
wedge nose low on the face, the two small rounded ear bumps on the sides, the neck and its
soft rounded crescent shadow beneath the chin, the royal blue shoulder dome, and the white
background.

THE HEAD SIZE IS CRITICAL. The head must stay exactly as wide and as large as it is in the
reference image. Do NOT shrink or narrow the head to make room for the hair. However big the
hairstyle is, it gets its size by extending OUTWARD and UPWARD beyond the edges of the head,
never by making the head smaller underneath it.

THE FACE STAYS COMPLETELY BLANK — no eyes, no eyebrows, no mouth, no beard, no glasses, no
freckles. Nothing on the face except the nose that is already there.

THE HAIRLINE MUST SIT HIGH. Leave a clear, generous band of bare forehead between the bottom
edge of the hair and the middle of the face — the hair must stop well above where eyebrows
would sit. Even a fringe stops high on the forehead rather than reaching down toward the
brow line. This matters more than the hairstyle looking long at the front.

HAIR COLOUR AND TEXTURE. The hair is a single bold silhouette filled with one flat medium ash
brown. On top of that base colour, add internal texture as a SECOND FLAT TONE — a slightly
darker ash brown — shaped as a few long, smooth swoosh shapes that follow the direction the
hair travels. Four or five of them, varied in length, leaving clear areas of the base colour
between them so the hair still reads as simple. Each swoosh ends in a SOFT ROUNDED END, never
a sharp point. These are SOLID FLAT SHAPES with hard crisp edges — never gradients, never soft
blends, never fine scratchy hairlines. Exactly two browns in the hair and no more.

The hair may cover the ears if the style calls for it.

NO OUTLINES anywhere. NO GRADIENTS, no shading, no lettering. Flat solid filled shapes, hard
clean edges.

---END PROMPT---
