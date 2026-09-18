# The sideburn recipe

How `buzz-APPROVED.png` and `mohawk-APPROVED.png` were made. Ryan approved buzz on 2026-09-17
and mohawk the same day, as the target shape for hair sideburns: **a band at full thickness ending in a square flat horizontal cut, level with the top
of the ear (y399 at 1024), outer edge flush with the head's silhouette, both sides identical.**

Follow this exactly for the next style. It took about twenty generations to find and almost
every shortcut in it was tried and failed first — the failures are listed at the bottom because
they are the part that saves the time.

## The measurements it must hit

Read at 1024px against the locked base:

| | value | why |
|---|---|---|
| ear bump | y400–511 | the ear sits **entirely outside** the head edge, at x < 258 |
| head edge | x258 / x765, straight from y320 to y615 | so "flush" is exact, not approximate |
| **the cut** | **y399** | level with the top of the ear; the whole ear sits below it |
| thickness at the cut | full, no taper | ~42–51px on buzz |

Check any candidate with:

```sh
uv run measure-sideburn.py hair/seam/<candidate>.png    # width at the edge per row + where it stops
```

## ⭐⭐ THE RULE THAT CHANGES EVERYTHING (Ryan, 2026-09-17)

> "the side burns must all look the same — if you have to change the rest of the asset then
> okay, just make sure that the type of textures follow"

**The sideburn is not negotiable; the haircut is.** That inverts the references, and it is the
difference between four passes and giving up.

`m11-receding` resisted twelve generations across both models and six framings, never moving off
y473, for one reason: every attempt treated the RECEDING HAIRCUT as the thing to preserve and the
sideburn as the thing to adjust. The moment that flipped, it worked.

**So for any style that resists, do this instead of passes 1–4:**

| image | role |
|---|---|
| 1 | `bases/base-neck-100.png` — canvas and head |
| 2 | **`buzz-APPROVED.png` — the avatar to REPRODUCE**, sideburns included, verbatim |
| 3 | the target style's locked render — **the hairline / style authority, and nothing else** |

Frame it as: *reproduce IMAGE 2, keep its sideburns exactly, keep its texture style; CHANGE ONE
THING — the hairline, which comes from IMAGE 3.*

The sideburn then transfers wholesale because it is being copied, not described. Thickness came
out at 51px against buzz's 51px, first try.

⚠ It still needs the cut prompt chained afterwards, and more of it than the other styles:
**y593 → 569 → 546 → 454 → 454 → y398.** Feed each output back in as IMAGE 2 with
`buzz-APPROVED.png` as IMAGE 3, the authority on how far down the sideburn reaches. Results
oscillate; take the good one and carry on.

⚠ Expect to fix the haircut afterwards. Reproducing buzz brings buzz's hairline with it, so the
style ends up under-expressed — receding came back barely receding at all and needs a follow-up
pass that deepens the recession while explicitly freezing the sideburns.

## The four passes

Each pass feeds the next. **The model is the variable in passes 3 and 4 — do not use Pro there.**

### Pass 1 — the HEIGHT DONOR (Pro)

Generate the style with **no sideburn at all**. This exists only to be a reference later; it is
never the deliverable and its texture will be wrong.

References: `bases/base-neck-100.png`, the style's own generation in `hair/men/`,
and `hair/nosideburn/buzz-nosb.png`.

The load-bearing paragraph:

> IMAGE 3 is the authority on ONE THING ONLY: HOW FAR DOWN THE SIDES OF THE HEAD THE HAIR
> REACHES. Ignore its haircut completely — its shape on top is irrelevant. Look only at its
> lower edge on the sides.
>
> ⚠⚠ COPY THAT LOWER EDGE FROM IMAGE 3. In IMAGE 3 the hair stops HIGH on the side of the head.
> Its bottom edge on each side sweeps up and away well ABOVE the little rounded ear bump. In
> front of and below the ear there is NOTHING but bare peach skin — no strip of hair, no stub,
> no wisp.

Lands at **y394–399**. Keep it.

### Pass 2 — TEXTURE + SQUARE END (Pro)

References: `bases/base-neck-100.png`, **a render of the LOCKED asset** (not the `hair/men/`
original — see failures), and the pass-1 output.

Render the locked asset first:

```sh
uv run compose.py bases/base-neck-100.svg /tmp/x.svg --hair hair/assets/hair-<style>.asset.svg
# then screenshot it at 1024 with headless Chrome
```

Say of IMAGE 2: *"reproduce its hair EXACTLY as drawn … the same number of darker swoosh
strokes, in the same places, at the same lengths, curving the same way … Do not invent, add,
remove or restyle a single stroke."*

Say of IMAGE 3: *"the authority on how far down the hair reaches. Ignore its texture completely,
it is wrong."*

Then the change:

> The hair comes down the side of the face and KEEPS ITS FULL THICKNESS right to the very
> bottom, then stops on a STRAIGHT HORIZONTAL LINE — cut flat straight across, as if trimmed
> with clippers. The corner where the flat bottom meets the front edge is a SQUARE CORNER, a
> clean right angle. Not a point, not a curve, not a rounded end, not a taper, not a notch.

Gets the square end and the right texture, but lands **too low**. Expected.

⚠⚠ **HOW LOW MATTERS.** Buzz landed at y455 and passes 3–4 walked it up from there. Mohawk landed
at **y512**, and from y512 passes 3 and 4 did NOTHING — three attempts returned the same y511.
The shortening steps only bite from around **y455**.

If pass 2 overshoots past ~y470, do not continue. Repeat the PASS 4 prompt against pass 2's own
output until one lands in range — mohawk took three tries and the results oscillated
(y511 → y511 → **y453** → y511), so take the good one and carry on from it. Then run passes 3
and 4 normally. Mohawk needed eight passes in total rather than four.

### Pass 3 — SHORTEN (model **2**, not Pro)

References: `bases/base-neck-100.png` + the pass-2 output.

> CHANGE ONE THING ONLY: THE SIDEBURNS ARE FAR TOO LONG. CUT THEM MUCH SHORTER. … Remove roughly
> the bottom third of each sideburn. You are only cutting it shorter — the thickness, the square
> flat end and the flush outer edge all stay exactly as they are.

⭐ **Pro floors at y455 and will not move.** Nano Banana 2 on the identical prompt and reference
goes to **y428**. Flash also floors at y455. This is the single highest-value line in this file.

### Pass 4 — RAISE TO THE SEAM (model **2**)

References: `bases/base-neck-100.png`, the pass-3 output, **and the pass-1 output again**.

> IMAGE 3 is the authority on ONE THING ONLY: HOW FAR DOWN THE SIDE OF THE HEAD THE HAIR
> REACHES. Ignore its texture, ignore the shape of its lower edge — those are wrong. Look ONLY
> at the height at which its hair stops on the side of the face.
>
> CHANGE ONE THING ONLY: RAISE THE FLAT BOTTOM CUT OF BOTH SIDEBURNS so it sits at exactly the
> height where the hair stops in IMAGE 3. … you are moving the cut UP, not reshaping it.

Lands on **y399**. Done.

⭐⭐ **The height must arrive as a PICTURE, in a third reference, declared the authority on one
thing.** The same pass asked in words — "raise it a little bit higher", with the identical
model and reference — went the WRONG WAY, to y443.

## What failed, so nobody tries it again

- **Stating a width or a length.** "One third as wide" returned the original width. "Half as
  wide" delivered a quarter. "Less than half as long" produced no change at all.
- **"A band of even thickness."** Reliably drags the sideburn LONG — y455, y457, y512, y598,
  y615 across many attempts, whatever else the prompt says. The words *band* and *strip* carry
  a length prior. Pass 2 only works because "square flat cut" is paired with a height donor.
- **Hand-painting a guide image.** A Python-drawn rectangle handed back as a reference came back
  **98.7% pixel-identical** — the model returned the drawing rather than redrawing it, so the
  output was geometry, not art. Ryan called this out: it is not using the generator.
- **Asking in words to shorten.** Moves ~20px per pass then floors, and sometimes reverses:
  y598 → 558 → 530 → 519 → 501 → 475 → 475 → 475.
- **Using the `hair/men/` original as the texture reference.** It carries its own long sideburn
  in and the model copies it. Render the LOCKED asset instead.
- **Pushing one attribute too hard.** One attempt re-rolled the whole head — narrower skull,
  nose lost, ears moved — which breaks registration by construction. Always check the head, not
  just the sideburn.
- ⚠ **Writing style language from the FILENAME.** `m10-mohawk` is not a strip mohawk with shaved
  sides — it is a swept-up crest. A prompt describing "a central strip along the middle of the
  skull, sides cut right down" fought the real art and made the output worse. **Open the locked
  render and describe what is actually there** before writing a word about the haircut.
- **Avoiding the word "sideburn"** ("the bottom edge of the hair mass") helps for pass 1, where
  the answer is "no hair below the ear". It does not help once a thickness is required.

## Files

| file | what it is |
|---|---|
| `buzz-APPROVED.png` | the approved target shape |
| `buzz-locked.png` | render of the locked buzz asset — the pass-2 texture authority |
| `buzz-step1.png` | pass 1, the height donor (texture is wrong, height is right) |
| `buzz-sq-v1.png` | pass 2 output, y455 |
| `buzz-m2.png` | pass 3 output, y428 |
| `buzz-hi-b.png` | pass 4 output = `buzz-APPROVED.png`, y399 |
| `mohawk-APPROVED.png` | approved 2026-09-17, y398 — eight passes, see the pass-2 warning |
| `mohawk-locked.png` | render of the locked mohawk asset — the pass-2 texture authority |
| `mohawk-step1.png` | pass 1, the height donor |
| `mohawk-sq.png` | pass 2 output, y512 — OVERSHOT, this is what the warning is about |
| `mohawk-r2.png` | the raise-pass retry that got back into range, y453 |
| `mohawk-m2.png`, `mohawk-p4.png` | passes 3 and 4 from r2 |
| `receding-locked.png` | render of the locked receding asset |
| `receding-step1.png` | pass 1 height donor, y398 — the four-pass route then STALLED at y473 |
| `receding-sq.png` | pass 2, y474 — the stall |
| `receding-c3.png`, `receding-c5.png` | the inverted-reference route: sideburn correct at y398/51px |

⚠ `receding-c5.png` has the approved sideburn but Ryan says the hair does not read as receding —
the hairline needs to pull much further back. NOT approved. Next step is a follow-up pass that
deepens the recession with the sideburns explicitly frozen.

⚠ Not traced, not extracted, not locked. The hair assets in `hair/assets/` are untouched — this
is a shape Ryan has approved, not an asset yet.
