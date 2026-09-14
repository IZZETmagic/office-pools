# Base avatars — Duolingo similarity assessment

**14 Sep 2026.** Asked: would the round-5a avatars infringe Duolingo's avatars?

> ⚠ **I am not a lawyer and this is not legal advice.** What follows is an engineering assessment —
> what is measurably shared, what is measurably ours, and where the provenance runs. The last of
> those is the part that matters, and it is the part I cannot clear.

---

## 1. The short answer

**On appearance alone, the case for us is reasonable. On provenance, it is not, and provenance is
what a claim would actually run on.**

Nothing in the 5a set reproduces a specific Duolingo character. But these images descend, in two
documented generations, from a Recraft style trained directly on five Duolingo avatars — and that
chain is written down in this repo, in the commit messages, and in Recraft's own stored style
objects. It converts *"these look similar"*, which is weak, into *"these were made from theirs"*,
which is not.

**The good news is that the fix is already the plan of record in two separate places, and it costs
us nothing we have built.**

---

## 2. What is measurably different

Top colours by area, 512×512, quantised to 8 levels per channel:

| | Their 5 tiles | Our 7 (5a) |
|---|---|---|
| Ground colour | grey, purple+green, yellow, cream, navy — **often split into two** | **SportPool blue `#3B6EFF`, always one flat colour** |
| Blue as % of image | not in any top-4 | **11.6 – 27.4% of every single one** |
| Mean nearest-colour distance, ours → theirs | — | **35 in RGB** |

⚠ **Skin tones overlap almost exactly** — the closest pairs are 0, 8, 8, 11, 11 apart. That is not
evidence of copying and could not be avoided: human skin is a narrow gamut and every flat-vector
avatar system on earth lands in it. It is also the least protectable thing in the picture.

**Feature inventory** — their signature elements, and whether ours have them:

| Their signature | In ours? |
|---|---|
| Thick coloured-rim glasses (4 of 5 tiles) | **No — none** |
| Rosy cheek patches | **No** |
| Freckles | **No** |
| Large rounded beard mass | **No** |
| Flag face-paint / country motifs | **No** |
| Two-tone split background | **No — single flat disc** |
| Hand-drawn wobble, deliberate asymmetry | **No — geometrically regular** |
| Ears with earrings | Ears as plain bumps, no jewellery |
| Open mouths, tongues, varied expressions | One small flat bar |

Every element a person would actually *name* when describing a Duolingo avatar is absent from ours.

---

## 3. What is shared, and whether that matters

Circular ground behind a head-and-shoulders figure · oversized head on a narrow neck · hair as one
solid mass · white almond eye-whites with large dark round pupils · flat fills, no outlines, no
gradients · cropped flat at the shoulders.

**These are the conventions of the entire flat-vector avatar genre**, not Duolingo's invention —
Bitmoji, Memoji, Mii, Zepeto, Avataaars, Open Peeps, Notionists and Personas all share most of them
(§7b.2, §7b.3, measured from source). Copyright protects a specific expression, not a style or a
genre, and "flat cartoon head on a coloured circle" is a genre.

⭐ **And we chose that vocabulary before this exploration existed.** §7b.1 settled on the Avataaars
rig on the same day, on licence and catalogue grounds. The shared conventions are ones we had
already independently committed to.

---

## 4. 🔴 The part I cannot clear: provenance

The chain, in full:

| Step | What happened | Artefact |
|---|---|---|
| 1 | Five Duolingo avatars cropped from a supplied screenshot | `/tmp/duoref/ref0-4.png` |
| 2 | A Recraft vector style built **from those five images** | style `745b584d-e451-49c3-94f3-38b8ab1af3bb` |
| 3 | Round 3B generated under that style | `assets/avatar-simple-b/` |
| 4 | Round 4 recoloured 3B — a colour change, not a redraw | `assets/avatar-sportpool/` |
| 5 | A second style built from the round-4 images | style `117d0079-78f7-4bdb-b2dd-dfaebfd625fa` |
| 6 | **Round 5a generated under that style** | `assets/avatar-styles-anchored/` |

Two things follow, and both are worse than the visual resemblance:

- **It is discoverable.** The reference images are stored inside Recraft against the account, the
  style objects persist, and the derivation is described in commit messages `5ce4023` and `7bb5a1f`
  and on the review page. There is no version of this where the chain is not findable.
- **It cannot be cured by editing the output.** Round 4 already proved that recolouring changes
  nothing structural — that was the point of it. Nudging shapes on a derived asset produces a
  derived asset.

⚠ **Do not delete the styles or the commits to tidy this up.** Destroying the record of how
something was made, after the question has been asked, is a substantially worse position than the
one we are in. Change what ships, not the audit trail.

⚠ **Second-order, and independent of Duolingo entirely:** AI output is very likely not
copyrightable (*Thaler v. Perlmutter*; IP audit §11). So even setting infringement aside, **we could
not stop anyone copying this artwork** — which is a poor foundation for something the plan is to
sell cosmetics on (§8.3).

---

## 5. What is not at risk

- **Trade dress / passing off** — different market, different product, no consumer meeting a
  SportPool avatar would think they were in a language-learning app.
- **The individual characters** — Duo the owl and the named cast are their protected characters and
  we have not gone near them. §1.2 already separates the cast from the avatar system.
- **The research itself** — proportions, anchors, the parts model, the five gates. All of Part 4
  onwards is ours and is unaffected.

---

## 6. What to do — and it is already decided twice

**The exploration is the specification. It was never going to be the art.**

§7c.9 reached this already: *"that is what a designer buys, and it is why one is needed."* The IP
audit §11 reached it from the other side: *"if any of it matters commercially, have it redrawn by a
human under a work-for-hire agreement."* And §7b.1 already picked the vehicle.

| # | Action | Why |
|---|---|---|
| 1 | Treat 5a as a **brief**, never as shipping art | It is the cheapest thing on this list and it is already true |
| 2 | Apply the chosen direction to the **Avataaars rig** (§7b.1) | Free commercial use, modification permitted, no attribution — we are licensed to restyle it, and we picked it before this |
| 3 | Take hair and range from **Open Peeps** where needed | CC0. Public domain. Nothing to ask anyone |
| 4 | For the final restyle, **commission a human** under work-for-hire | Fixes infringement exposure *and* the copyrightability gap in one step. §7c.9's conclusion |
| 5 | Write the direction down as **numbers**, not pictures | §4.3 already does this — 3.35 skull-heights, 55% balance, hair volume 0.4–1.5. A spec an illustrator can work from is not derived from anyone |
| 6 | Keep the Recraft styles and commits **as they are** | Audit trail. See §4 |

**Nothing built is wasted.** What the 27 generations bought is knowledge — the framing, the
proportion, the shoulder width, the crop, which directions read at 24px, and the measured fact that
a style anchor beats prompt words. All of that transfers to a licensed rig unchanged.

---

## 7. What I could not verify

- Whether Duolingo asserts rights over its avatar *system* as opposed to its named cast. Their
  avatar rollout is public (§1.6) but I have found no published position on derivative styles.
- Whether Recraft retains or trains on uploaded style references beyond the licence-back in §7.7 of
  their terms (§7c.8). Training is opt-out; the licence-back is not.
- Anything about UK vs US treatment of AI-assisted derivative works. This needs a solicitor, not me.
