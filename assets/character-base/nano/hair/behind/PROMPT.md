# The hair that lives behind the body

Five hair assets stop dead at the shoulder line because they were traced on a body: the
shirt, the neck and the neck shadow are cut out of them. Four of the nine styles that reach
the body carry that cut in a `<mask>`, which `headOnly()` can simply open. These five carry it
in their drawn paths, so the art has to exist before anything can show it.

| style | what is missing |
|---|---|
| `f01-bob` | the shirt bite. Its mask subtracts the neck and the neck shadow, never the shirt |
| `f03-bobswept` | the whole body bite |
| `f12-halfup` | the whole body bite |
| `f14-shag` | the whole body bite |
| `m14-longhair` | the whole body bite |

## What comes out of this

⚠ **NOT a replacement for the locked asset.** The output is a companion layer,
`hair/behind/<style>.svg`, painted immediately after the backfill and before the hair — inside
the body silhouette, where the body covers it. **A real avatar is unchanged**, and a guard test
holds that. Only `headOnly()`, which deletes the body, ever sees it.

⚠ Everything outside the body silhouette is DISCARDED. The generation redraws the whole
avatar, and only the part the body would hide is kept, so drift in the approved geometry above
the shoulder line cannot reach the product.

## The rules this prompt encodes

Beyond the four in `../../hair-prompt.md`:

**6. RESHAPE, never remove.** The obvious prompt — "the same avatar with no body" — is the one
that has failed every time it has been tried here (see the avatar pipeline memo: "no seam"
failed twice, "make the shadow rounded" worked at once). So the body STAYS and only the
STACKING changes: the hair is drawn on top of the shoulder dome instead of behind it. The
region that produces is exactly the region the body hides.

**9. ASK FOR Z-ORDER, AND ANCHOR THE SILHOUETTE.** v1 said the hair "carries on downward and hangs down
the front of the blue dome". Every style came back LONGER — `f01-bob` grew past the shoulders —
so the new piece landed detached from the locked hair with a 90-unit gap above it, and a
detached blob is worse than the notch it was meant to fill.

v2 over-corrected: "do not make the hair longer" was obeyed so exactly that the hair went back
to stopping at the blue and four of the five extracted to nothing. v3 keeps the z-order framing
and adds the clause that was actually missing — the hair's OUTLINE is pinned to the reference,
and the new piece joins on where the blue was cutting it. Same reason as
`../SIDEBURN-RECIPE.md`: a length in words goes the wrong way, so the shape is anchored to the
picture and only the cut is described.

**7. The reference is the authority on the hairstyle, not just the head.** Generating from the
bare base would invent a new bob. The reference is the composed avatar wearing that exact
locked style, so "keep the hairstyle completely unchanged" has something to point at.

**8. Never state a width or a length** — `../SIDEBURN-RECIPE.md`. Sizes arrive as a picture.
Everything here is phrased as continuity with the reference.

## Generating

```sh
uv run "$SKILL_DIR/scripts/image.py" --prompt "$(sed -n '/^---BEGIN/,/^---END/p' hair/behind/PROMPT.md)" \
  --output hair/behind/nano/<style>.png --model pro --size 1K --aspect 1:1 \
  --reference /tmp/ref/<style>.png --reference bases/base-neck-100.png
```

The reference is built with `compose.py` at the house palette — skin `#FECDB4`, shirt
`#1E76D6`, hair `#8C7A6E`, background `#FFFFFF` — so the generated image comes back in the
same tones the extractor keys on.

---BEGIN PROMPT---

Flat 2D vector avatar icon, square canvas, outline-free, pure white background.

KEEP EVERYTHING IN THE FIRST REFERENCE IMAGE COMPLETELY UNCHANGED: the broad squircle head and
its exact size and shape, the flat pale peach skin with no shading on the face, the small soft
wedge nose low on the face, the two small rounded ear bumps, the neck and its soft rounded
crescent shadow beneath the chin, the royal blue shoulder dome, and the white background.

KEEP THE HAIRSTYLE COMPLETELY UNCHANGED as well — the same silhouette, the same parting, the
same fringe, the same darker swoosh shapes in the same places, the same two flat browns. This
is the same person with the same haircut.

THE ONE CHANGE: THE BLUE NO LONGER COVERS THE BOTTOM OF THE HAIR. Look at where the hair meets
the royal blue shoulder dome in the reference — the hair is chopped off along the top edge of
the blue, as if something had been laid over it. Draw the hair passing OVER the blue instead,
so the ends the blue is hiding become visible, lying on the blue and finishing in SOFT ROUNDED
ENDS.

THE HAIR'S OUTLINE IS UNCHANGED WHEREVER THE REFERENCE ALREADY SHOWS IT: the same width at the
temples, the same width at the jaw, the same parting, the same fringe, the same swooshes in the
same places. The hairstyle does not become bigger, wider or longer. The ONLY new part of this
picture is the piece that was hidden underneath the blue, and it joins onto the hair exactly
where the blue was cutting it.

THE HEAD SIZE IS CRITICAL. The head must stay exactly as wide and as large as it is in the
reference. Do NOT shrink or narrow the head, and do NOT move the nose. The blue shoulder dome
keeps its own shape and stays exactly where it is — the hair lies on top of it.

THE FACE STAYS COMPLETELY BLANK — no eyes, no eyebrows, no mouth, no beard, no glasses, no
freckles. Nothing on the face except the nose that is already there.

HAIR COLOUR AND TEXTURE. Exactly two browns in the hair and no more: one flat medium ash brown
for the mass, one slightly darker ash brown for the texture. The new length carries the same
long, smooth swoosh shapes, each ending in a SOFT ROUNDED END, never a sharp point. SOLID FLAT
SHAPES with hard crisp edges — never gradients, never soft blends, never fine scratchy
hairlines.

NO OUTLINES anywhere. NO GRADIENTS, no shading, no lettering. Flat solid filled shapes, hard
clean edges.

---END PROMPT---
