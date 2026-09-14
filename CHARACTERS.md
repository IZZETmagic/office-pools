# SportPool Characters — research and base plan

**Started:** 13 September 2026 · **Status:** PLAN ONLY. Nothing here is built and nothing should be
built for months. Every number is a proposal, not a commitment.

This document has two halves. The first is research into how Duolingo actually builds and animates
its characters — sourced, with the failures included. The second is a character system for SportPool
derived from that research, from `lib/design/` as it exists today, and from the decisions already
recorded in `MONETIZATION.md` and `SPORTPOOL_PROGRAMME.md`.

**What already exists and what this supersedes.** `memory/project_backlog_avatar_cosmetics.md`
scoped this as Phases A–E in commercial terms — what it is worth, when it lands, what gates it.
That document stays. This one is the *product and craft* half it never had: what a character is made
of, how it moves, where it renders, and what it costs. Where the two differ, the differences are
named in §10 rather than left to be discovered.

---

# Part 1 — What Duolingo actually does

## 1.1 The construction grammar is a hard rule, not a style

The single most transferable thing Duolingo did is refuse to let illustration be taste.

> All of Duolingo's illustrations are made from three basic shapes: the rounded rectangle, the
> circle, and the rounded triangle… all illustrations are geometric and created with wholes, halves
> and quarters of four basic shapes. The pathfinder tool can be used to cut shapes as needed, but
> **every shape must have rounded edges. Pointy shapes are off-brand.**

Four named principles sit under it:

| Principle | The rule |
|---|---|
| **Rhythm** | Shapes of similar visual weight are predictable and uninteresting. Vary the weight. |
| **Simplicity** | Use the fewest shapes possible — stylistically *and* practically. |
| **Perspective** | Flat. Depth is allowed only on the same line of sight. |
| **Detail** | Restraint, so artwork does not go noisy at small sizes. |

Characters follow from it directly: **head and body are 1–2 basic shapes each**. Five main eye
styles, all geometric. Colour is deliberately scarce — *"too many colors can hurt legibility when an
object scales to a small size."*

Duo himself contributes four traits that every human character inherits, which is what makes an owl
and a schoolteacher read as the same world: geometric simplicity, oversized expressive eyes, a
distinctive body shape, and **detached feet** — Duo's feet separate from his body in motion, and can
bend, lengthen and wiggle.

**Why this matters to us:** the rule is what lets contractors, interns and a dozen artists produce
work that looks like one hand. Duolingo built a character library specifically so artists could
reference and reuse rather than reinvent. A one-person team needs that discipline *more*, not less,
because there is nobody to catch drift.

## 1.2 The cast and the avatar are two different products

This is the distinction most summaries miss, and it is the one that matters most for us.

**The cast** — Duo, Lily, Zari, Eddy, Junior, Bea, Oscar, Lin, Vikram, Falstaff, Lucy — are
*authored personalities*. Lily is a deadpan goth; Vikram is her opposite; Eddy is a well-meaning
fitness dad raising Junior. They took **18 months** of workshops and iteration, they have
relationships, and they are deliberately drawn from cultures underrepresented in Western media. They
are hand-made, finite, and central: they voice the sentences, they have their own celebration
animations, and they carry the emotional investment that keeps someone coming back to a thing that
"doesn't happen overnight."

**The avatar** is a user-configured face in the same visual language. Eight customisation
categories, shipped in 2023: skin tone and body shape, facial expression, eye colour, hairstyle and
colour, glasses style and colour, facial hair and colour, headwear and colour, clothing colour,
background colour.

The cast is the brand. The avatar is a feature. Duolingo got the first one very right and the second
one wrong (§1.6).

## 1.3 The animation system: Rive, state machines, nested artboards

Duolingo animates its World Characters in [Rive](https://rive.app), and has been public about why:
compact files suitable for mobile, clean integration across iOS/Android/web, and a **State Machine**
that makes large-scale interactive character animation feasible inside a production app.

The architecture, from their lip-sync work and from the Rive-powered Video Call feature:

- **Poses and mouths are separate states**, connected in the state machine and exported as one
  runtime file. 20+ mouth shapes (visemes) were designed, each character getting a set that reflects
  its personality.
- **Nothing is pre-rendered.** They ship audio plus phoneme timing data and trigger animation at
  runtime — *"data transfer to an absolute minimum."* Tap a single word, only that word animates.
  Finish the exercise early and the animation stops mid-speech.
- **Modular blending instead of pre-baked sequences.** For the Video Call character: eight head
  animations × eight body animations combining dynamically → **64+ variations of neutral idle**, so
  the idle never visibly loops.
- **Nested artboards** separate head from body so they move independently.
- The whole thing stays **under one megabyte**.
- On top of speech: idle behaviour — head nods, blinking, eyebrows — and reaction states keyed to
  correct/incorrect.

The runtime property that matters most for a battery-powered device: a Rive state machine at idle
approaches **0% CPU**, because there is no keyframe ticker running when no input has changed. Lottie
has no equivalent — a Lottie file is passive and the logic lives in your code.

## 1.4 They invented a job to make the handoff work

Duolingo created a **creative technologist** role that sits physically between animators, product
designers and engineers. Animators build the motion; creative technologists build the state-machine
logic the animators can't, write the spec documenting every input, and hand engineers a
production-ready file. Their words: *"the design is the final product"* — no back-and-forth
re-creating the animator's intent in code.

**Read this as a cost signal.** The pipeline is excellent *and* it needs a discipline that does not
exist on this project. That is an argument for a system that needs fewer specialists, not for hiring
one. It is the single strongest input into §7's architecture call.

## 1.5 Celebration design — and the part they don't say out loud

Duolingo's streak milestone work is the best-documented celebration design in the industry. Three
objectives drove the phoenix redesign:

1. **Universal legibility.** Research found "keeping the flame alive" did not translate across
   cultures. A bird in profile does — many flags and cultures already use one.
2. **More celebration.** Static balloons → animated transformation, with *"multiple passes of rough
   animation"* because *"timing is everything."*
3. **Shareability.** A simple, attractive share card, designed as part of the feature rather than
   bolted on.

Escalation is explicit: milestone day counts (7, 30, 100, 365, 1000) stop the flow. The phoenix, the
owl on fire, the full-screen sequence **do not fire on ordinary days**. A smaller "trampoline Duo"
handles 5- and 10-answer streaks mid-lesson.

⚠ **What their published material never addresses is when *not* to celebrate.** There is no stated
fatigue principle, no counter-metric. The rarity is implied by the milestone ladder and nothing
else. We should not inherit that gap — see §6.4.

## 1.6 🔴 The avatar rollout is the most useful thing in this research, because it went badly

Duolingo shipped the avatar creator in 2023 and, in **September 2024, removed custom profile
pictures entirely**. Users who had uploaded a photo — a pet, a family moment, something that was the
actual reason they opened the app — could not go back. Refuse to build an avatar and you got letter
initials.

The community reaction, consistently reported:

- **Lost personal connection.** The removed photos were meaningful; the replacement was not.
- **Aesthetic mismatch.** "Ugly", "cartoonish", *not what an adult doing a serious thing wants
  attached to their name.*
- **Shallow customisation.** Little was added after launch despite promises. The result is
  bust-only — a head, no body — which caps how much of "you" it can express.
- **Forced adoption.** No opt-out that preserved dignity. Initials or a cartoon.

**Four rules fall out of this, and they are binding on everything below:**

| # | Rule |
|---|---|
| **A1** | **A character is added, never substituted.** Photo upload and initials both survive forever. Whoever wants a character gets one; nobody is pushed. |
| **A2** | **Shallow customisation is worse than none.** If a user cannot make something recognisably *them* on day one, do not ship it. The failure mode is not "fewer options", it is "everyone looks the same and nobody feels represented." |
| **A3** | **The default must be dignified.** The state a user who never opens the editor lands in has to be something they'd be happy to have beside their name in front of their colleagues. |
| **A4** | **Adults are the audience.** SportPool's users are office colleagues, pub regulars and family. Cute has a ceiling here that it does not have in a language app used by teenagers. Aim at *stylised*, not *childlike*. |

---

# Part 2 — What to take and what to leave

## Take

1. **A construction rule with teeth.** One shape vocabulary, written down, enforced. (§4)
2. **Head and body as separate concerns.** Duolingo's nested artboards; our two rigs. (§5.2)
3. **Eyes carry the emotion.** They scale; mouths don't. (§4.4)
4. **Modular blending over pre-baked sequences.** Few parts, many combinations. (§6.2)
5. **Colour scarcity as a legibility rule**, not an aesthetic preference. (§4.5)
6. **The share card is part of the feature**, designed with it, not after it. (§6.5)
7. **An escalation ladder** so the big moment stays big. (§6.4)

## Leave

1. **Their shape vocabulary.** Rounded rectangle + circle + rounded triangle with everything rounded
   *is* the Duolingo look. Copying it produces a knock-off that is legally exposed and creatively
   dead. We need our own vocabulary, equally strict. (§4.2)
2. **The two-pipeline production model.** Rive + animators + creative technologists is correct at
   their scale and unaffordable at ours. (§7)
3. **Replacing the existing identity.** A1.
4. **Bust-only.** Showdown needs a figure that walks. (§5.2)
5. **Celebrating everything.** Their private-celebration model does not survive contact with a
   shared leaderboard. (§6.3)

---

# Part 3 — What SportPool already owns

Nothing below is new work. It is the material the character system is made from, and it is more
complete than it looks.

## 3.1 The palette

`lib/design/tokens.ts` — a full mirror of `mobile/theme/colors.ts`, drift-guarded by
`lib/design/__tests__/tokens.test.ts`. Seven neutrals (`snow` → `midnight`), `primary` `#3B6EFF`,
`accent` `#F5C518`, semantic green/red/amber, and the mode-invariant prediction tiers —
`tierExact` `#E2B830`, `tierWinnerGd` `#52D660`, `tierWinner` `#30B7FF`, `tierMiss` `#A1A6A0`.

Radii: `xs 6 · sm 12 · md 18 · lg 24 · xl 32 · pill 999`. Spacing on a 2/4/8/12/16/24/32/48/64/96
scale.

## 3.2 The identity colour — already load-bearing, already anticipating this

`lib/design/avatarGradient.ts` hashes `user_id` into ten gradient pairs. The comments are explicit
about why, and they are constraints on everything below:

> The order is load-bearing: the index comes from a hash of the user id, so reordering or resizing
> this list reassigns everyone's colour… **Append only.**

> a person who is teal in the chat and purple on the card reads as two people.

`avatarInk(userId)` derives two lightness steps (0.52 for light grounds, 0.70 for dark) with measured
WCAG figures for all ten colours. And critically:

> Derived rather than hand-listed so a colour added to the palette, **or one a member eventually
> picks on their profile**, gets the same treatment for free.

**The colour system was already built for the day a user picks their own.** §5.5 uses that.

## 3.3 The mode identity ring

`modeIdentityColor` in `tokens.ts` gives all seven modes a hue, measured to a minimum pairwise
separation of 28° and pinned by `modeIdentity.test.ts`. Showdown is magenta `#C026D3`; Last Man
Standing crimson `#E11D48`. These are available to the character system as *context* colour (the
ground behind a figure on a Showdown card) and must never be used as *identity* colour.

## 3.4 The kit grammar

`mobile/components/scouting/kit/` is a 14-component kit with its own `tone.ts` colour grammar,
shipped in the 2026-09-12 scouting cohesion build. It already contains a `Crest.tsx`. The scouting
work established that one colour grammar plus a shared kit is what makes disparate surfaces read as
one system — the character system is the third consumer of that idea, not the first.

## 3.5 The Showdown motion spec — which already reserved the slot

`assets/showdown-storyboard/MOTION_SPEC.md` §"Forward compatibility" is unambiguous:

> The animation is authored so the hero-subject layer (the figure silhouettes shown in beats 3–7) is
> a **distinct z-layer that can be replaced without changing timing, easing, or beat structure.**…
> In a future world where character avatars + cosmetics ship, this layer becomes the user's
> customized character with equipped cosmetic items rendered in. Same template, swapped content.

Eight beats over 4.0s; figures on screen from 1.0s (beats 3–8). The character system inherits that
timing rather than inventing one.

## 3.6 🔴 The constraints that will actually bite

| # | Constraint | Source | Consequence for characters |
|---|---|---|---|
| **C1** | **`react-native-svg` ignores SVG `transform` strings.** | `memory/project_rn_home_card.md` | Every part transform must be a prop (`x`/`y`/`rotation`/`origin`), never an attribute string. A parts model authored as raw SVG *will* silently render wrong on the phone. |
| **C2** | **Native code cannot ship in an OTA.** | `memory/project_eas_ota_pending.md` | Rive, Lottie and Skia all require an EAS build. Every character change would be a store release. |
| **C3** | **Native builds cannot be produced or verified on this machine.** | `memory/project_native_builds_blocked.md` | Anything native is unverifiable during development. |
| **C4** | **Skia is declared in `mobile/package.json` and not installed.** | `SKIA_CORRIDOR_SPEC.md` §2 | `@shopify/react-native-skia": "2.2.12"`, `node_modules/@shopify/` empty. It is not a free dependency to lean on. |
| **C5** | **`mobile/**` is in `.vercelignore`**, so web cannot import from it. | `tokens.ts` header | Any shared character code must live in `lib/` with a mirrored copy and a drift test, the same pattern as `tokens.ts`, `avatarGradient.ts` and `lib/email/brand.ts`. |
| **C6** | **A stale OTA beats a fresh build.** | `memory/gotcha_stale_ota_beats_fresh_build.md` | Check `eas channel:view` before concluding a character change didn't work. |

---

# Part 4 — The construction grammar

> **The rule: every part of a SportPool character is a capsule, a disc, or a capsule cut by another
> capsule. There are no other shapes. There are no outlines. Each part is one flat fill.**

## 4.1 Why a capsule

The pill (`radii.pill = 999`) is already the app's most characteristic shape: the mode chip, every
progress bar, every avatar circle, the form dots. A character built from capsules is *native to the
existing UI* in a way that a rounded-rectangle character would not be — and it is not Duolingo's
vocabulary, which needs the rounded triangle to work.

It is also the shape football already uses. A sleeve is a capsule. A sock is a capsule. A limb is a
capsule. The grammar and the subject agree, which is what makes a rule feel inevitable rather than
imposed.

## 4.2 The vocabulary

| Primitive | Definition | Used for |
|---|---|---|
| **Disc** | Circle. | Head, eyes, ball, buttons |
| **Soft rect** | Rect with **four independent corner radii**. A capsule is the case where all four are maxed. | Torso, arms, legs, boots, garments |
| **Half-capsule** | A capsule cut on its long axis. | Hair fringe, collar, sock top, shorts hem |
| **Quarter-capsule** | A capsule cut on both axes. | Ear, cuff, eyebrow, shoe toe |
| **Lens** | Intersection of two discs. | Smile, closed eye, badge |

**Forbidden:** No strokes. No gradients *inside* a character — gradients belong to the ground behind
it (§5.5). No drop shadows on parts.

⚠⚠ **The original rule said every part is a capsule with `r = min(w,h)/2`. That rule produced
snowmen** (Ryan, 2026-09-13) — it forces *every corner of every part to full round*, so a torso is a
pill and an arm is a pill, and pills can only sit *beside* each other. **A joint needs a flat edge,
and the rule outlawed flat edges.** Roundness is a choice per corner, not a law: a shirt has round
shoulders and a **flat hem**; shorts have a flat waist and a notch; a neck ends flat and disappears
into the collar.

⚠ **Second correction, same class** (Ryan, 2026-09-13): a short-sleeve shirt is **one T-shaped
garment**, not a body plus two sleeves. Drawn as separate objects in a different colour they read as
shoulder pads floating above the person. The sleeve is the shirt's own yoke, in the shirt's own
colour, with the trim reduced to a thin cuff — and the kit pattern runs across it, because it is the
same garment.

⚠ **Third, and the general form of all three:** every seam must **overlap deeply** rather than kiss.
The arm tucks under the sleeve, the legs run up inside the shorts, the head sits over the collar.

## 4.3 Proportion — two numbers, not one

> ✅ **SETTLED 2026-09-13** (Ryan, against a reference image, using the interactive model sheet).

**The figure is 3.35 skull-heights tall at a default hair volume of 1.00, with 55% of the non-head
height given to the torso.** All three numbers are required. Any one of them alone is not a
specification.

| Number | Value | Range across the catalogue |
|---|---|---|
| **Skeleton** | 3.35 skull-heights, crown of skull to sole | fixed |
| **Hair volume** | 1.00 | 0.4 (buzz) → 1.5 (afro, long hair, full beard) |
| **Balance** | 55% of the non-head height to the torso | fixed |

⚠⚠ **The measurement trap, and the reason this needed settling before any art was commissioned.**
A reference character that reads as *"about two heads tall, big chunky head"* is typically **~3.3–3.4
skull-heights** with a hair-and-beard mass half again the size of the skull under it. Give an
illustrator "3.35 heads" without the second number and you get a lanky figure that looks nothing like
the reference. **The mass, not the skeleton, is what makes a character read as a mascot.** Verified by
drawing it: two figures at an identical 3.35 skeleton read as 3.1 and 2.1 apparent heights when hair
volume alone is moved from 0.35 to 1.45.

- Below ~2.75 reads as a toy, which collides with **A4**. Above ~3.6 the head stops dominating, and
  every list renders a person at 24–36px where the head *is* the character.
- **The height over 3.0 goes to the torso, not the legs.** The torso is the surface every kit,
  jersey, tattoo and badge is sold on — a short torso caps what the shop can sell. A long torso over
  short legs also reads as charming rather than childish.

Pin both with a test the way `modeIdentity.test.ts` pins hue separation: a
`characterProportion.test.ts` asserting skull height ÷ figure height stays in `[0.28, 0.32]` and hair
volume stays inside `[0.4, 1.5]`, for every combination of parts. A catalogue that grows over two
years *will* drift otherwise.

### The mass is one shape, and the face is a window in it

Taken from the reference and confirmed by drawing it: hair and beard are **one capsule behind the
skull**, not two parts stuck on. The face is a smaller skin capsule drawn *over* it, and the beard
setting **shrinks that window** rather than adding a beard asset.

| Beard | Visible skin | Mechanism |
|---|---|---|
| None | full skull — 0.86 × 1.00 | mass clipped at ear level (`y ≤ 0.60`) |
| Short | 0.86 × 0.95 of skull | mass clipped at the jaw (`y ≤ 1.02`) |
| Full | 0.72 × 0.86 of skull | mass uncut |

One shape, three states, one clip rectangle. Cheaper than three beard assets, and it is the reason a
single hair-volume number can change the whole silhouette.

## 4.4 The eyes carry everything

At the sizes SportPool actually renders a person — 24px on a pool card, 32px in a banter row, 36px
on a member list — **a mouth is 2 pixels and contributes nothing.** The eyes are the only feature
with enough area to read.

So the emotional state model (§6) drives the **eyes and the head angle**, and the mouth is a
tie-breaker that only exists above ~64px. This is not a simplification of Duolingo's approach — it is
the opposite conclusion from the same principle (*detail restraint so artwork isn't noisy at small
sizes*) applied to our sizes rather than theirs. Duolingo can spend 20+ visemes on a mouth because
their character is a half-screen tall and speaking. Ours is in a list.

Proposed eye set: **4 shapes** (open disc, half-lidded, closed lens, wide) × pupil position (5) ×
brow (4: neutral, raised, furrowed, one-raised). 80 expressions from 13 assets.

## 4.5 Colour scarcity

**A character is at most 5 fills**: skin, hair, kit body, kit trim, and one accent. Everything else
is a tint of one of those or the ground.

At 24px more than five colours is mud. This is the same reasoning already in `avatarGradient.ts`
("tuned to keep white initials legible") and in the scouting build's one-colour-grammar decision.

⚠ **Skin tones are a palette, not a slider.** A continuous slider produces a long tail of near-grey
and near-orange choices that look broken beside each other in a leaderboard. A curated ramp — 12
tones, hand-checked against both `snow` and `midnight` grounds — is both more respectful and more
robust. Hair colour same: a ramp, including the unnatural end, not a colour wheel.

---

# Part 5 — The character system

## 5.1 What a character is

```
Character = Ground + Figure
  Ground  = one colour (the identity colour, §5.5) + optional pattern
  Figure  = Head + Body
    Head  = shape · skin · hair · eyes · brows · mouth · [facial hair] · [headwear] · [eyewear]
    Body  = build · kit · [sleeves] · shorts · socks · boots · [accessory]
```

Stored as one JSON object. Rendered by one function. Everything else in this document is a
consequence of that sentence.

## 5.2 Two rigs, one parts library

> ✅ **The crop was SETTLED 2026-09-13 as a chest crop, not a head crop.**

| Rig | Where it renders | Composition |
|---|---|---|
| **Bust** | Leaderboards, pool cards, banter rows, member lists, emails, OG cards | Ground disc + head + shoulders + **upper chest**, cropped to a circle |
| **Figure** | **Pool card**, profile, Showdown walkout, duel card, share card, level-up, trophy case | Full 3.35-skull figure on a ground |

**The bust is a passport crop**, cutting at roughly **1.72 skull-heights** from the crown of the hair
mass — far enough down that the collar, the neckline trim, the top of the kit pattern and the chest
badge slot all read at 32px.

⚠ **This costs head legibility and was chosen anyway.** A head crop puts ~21px of head inside a 24px
circle; a chest crop puts ~13px. The trade is deliberate: **everything the shop sells lives below the
jaw**, and a jersey nobody sees is a jersey nobody buys. A large hair mass costs again here — the
mass eats circle before the face does.

**The figure rig also goes on the pool card**, not only the profile and the duel. The pool card is the
most-looked-at surface in the app and it has the room.

**The head is byte-identical between them.** Same parts, same coordinates, different viewBox and
crop. This is Duolingo's nested-artboard idea expressed as geometry instead of as tooling: head and
body move independently because they are separately positioned, not because a tool nested them.

⚠ **This is the requirement Duolingo's avatar system fails.** Theirs is bust-only — *"big, fat
head[s]"* — which is why it can never appear in a scene. Showdown is a scene. If the parts library
cannot compose a body, Showdown gets generic silhouettes forever and the whole feature loses its best
surface.

## 5.3 The parts catalogue — v1 target

> ✅ **SETTLED 2026-09-13.** Ryan: *"basic and free to start with various coloured clothes and hair
> and a few accessories… then maybe we add tattoos or jewellery or eventually jersey… custom
> celebrations or fight stances for Showdown, sticker packs for the in-app chat."*

### The rule: free gets you a person, paid gets you flair

**Everything that constitutes looking like yourself is free. Everything that constitutes showing off
is paid.** The whole v1 catalogue is free — there is no partial free tier, because a part-free
character editor reads as a demo, which is A2's failure mode with a price tag on it.

⚠⚠ **Skin tone and hair are free forever, with no paid variants, ever.** Not "free at launch" —
permanently out of scope for the shop, and it belongs in §8.3's cut list. A cosmetics store that
charges for hair textures is a story you do not want, and it is exactly the SKU a future someone
reaches for when the shop needs filling.

### v1 — all free

| Slot | v1 options | Notes |
|---|---|---|
| Head shape | 4 | round, oval, wide, long |
| Skin tone | 12 | curated ramp, §4.5. **Never paid.** |
| Hair style | 30 | must include coily, locs, braids, wraps, bald, buzz, long-under-headwear. **Never paid.** |
| Hair colour | 14 | includes 4 unnatural. **Never paid.** |
| Hair volume | continuous 0.4–1.5 | §4.3 — carried by the style, not chosen separately |
| Eyes | 4 shapes × 5 colours | shape is expression-driven at runtime (§4.4) |
| Brows | 4 | |
| Facial hair | 7 | incl. none; drives the face-window size (§4.3) |
| Eyewear | 6 | incl. none; must be able to fully occlude the eyes |
| Headwear | 12 | caps, beanies, wraps, headband, none |
| Build | 4 | |
| Kit colourway | 8 patterns × colour | §5.4 |
| Boots | 4 | |
| Accessory | 5 | scarf, gloves, armband, headphones, none |

~120 assets, re-weighted from the first draft: **hair and skin got the money**, paid for by cutting
head shapes, facial hair, eyewear, boots and accessories. Almost all of "can I look like me" is
front-loaded into hair and skin, and the user base is Bermudian and North American office pools —
coily, locs, braids and wraps are load-bearing, not a box-tick.

⚠ **30 hair and 12 skin are the floor, not the target** *(Ryan, 2026-09-13: "I definitely do not want
leaner. I want enough that the character can look like the user.")*. Cutting either is where "basic"
stops meaning *a smaller product* and starts meaning *a product that quietly excludes people* — which
is A2's real failure mode.

⭐ **Hair volume being continuous (§4.3) buys more than it looks.** One "short curly" asset covers a
range of volumes instead of needing three baked variants, so 30 styles is closer to *30 styles × a
volume range* than to 30 fixed looks. The re-weighting is cheaper than the raw count suggests.

### Later — the paid layer

Tattoos · jewellery · jerseys and premium colourways · headwear drops · custom Showdown celebrations ·
Showdown fight stances · chest-badge designs.

⚠ **Sticker packs are not an avatar slot.** They share the art pipeline and the shop, but they are a
**chat** product with their own moderation surface. Tracked as a sibling, not a character part.

### The coverage test is Ryan's, not mine

The first draft tested *"can ten real people make something recognisably them"* — unbounded, because
self-recognition always wants one more option. The bar is Ryan's instead:

> *"There's enough variety that people can see that there are clearly two different avatars or
> characters for these people."*

Finite, and measurable. It is comfortably met: pools cluster at **10–18 members**, and there are ten
hashed ground colours before a single character part is chosen. **Variety is not the risk. Depth in
hair and skin is.**

## 5.4 🔴 The kit problem — colourways, never crests

This is settled in `MONETIZATION.md` as **RM-12** and it is not reopenable:

> Club crests, names and kit designs are protected marks; api-football's `crest_url` is licensed for
> display in a fixture list, not for resale as a cosmetic… **Resolved by design, not by
> risk-acceptance:** kits are sold as **colourways** — stripes, halves, a colour and a trim — with
> no crest, sponsor or club name anywhere in the product, and users name their own.

Today's `drafts/2026-09-13_legal_review_logos.md` sharpens why this matters more than it looks: the
realistic enforcement route against a small app is **not litigation, it is an IP complaint to Apple
and Google**, which can pull a listing with little process and no notice. A cosmetics shop selling
club kits is the single most complaint-attracting thing this product could ship.

**The colourway grammar** — a pattern, a primary, a secondary, a trim:

| Pattern | |
|---|---|
| Solid · Stripes (vertical) · Hoops (horizontal) · Halves · Sash · Quarters · Shoulders · Trim-only | |

8 patterns × primary × secondary × trim is a very large space from a tiny asset set, and it is
*exactly* how football kits are actually described.

⚠⚠ **The legal line is in the copy, not the art.** A red shirt with white sleeves is a colourway. The
same shirt called "The Gunners", "North London" or sold in a "Premier League pack" is a claim about
association. **Presets are named by colour and nothing else** — "Red & White Sleeves", "Black and
Amber Stripes". Users may name their own kit; that naming is user content and needs the same
moderation path as a pool name. This rule should be a lint check on the catalogue file, not a style
note, because it will be the first thing that erodes.

## 5.5 The identity colour survives — and this is the important continuity call

`avatarGradient.ts` exists because a person must be the same colour in the chat and on the card. If
characters simply replace it, that continuity is lost and every derived surface — `avatarInk()` on
charts, the 6px rank bars, the ring on the home card — loses its anchor.

**So the hashed colour becomes the character's ground.**

- A user with no character: gradient disc + initials. Exactly today's behaviour. Unchanged forever.
- A user with a character: the *same* gradient disc, with their figure on it.
- A user who picks a ground colour: it overrides the hash and is stored.

`avatarColor()` and `avatarInk()` change from `(userId)` to `(user)`, reading a stored value and
falling back to the hash. The comment in `avatarGradient.ts` already blessed this — *"or one a member
eventually picks on their profile, gets the same treatment for free"* — and `avatarInk` is derived
rather than hand-listed precisely so it keeps working.

⚠ **The append-only rule still binds.** `AVATAR_GRADIENTS` must not be reordered or resized. A user
who picks a custom ground is opting out of the hash, not changing it.

⚠ **A custom ground still has to pass contrast.** `withLightness` normalisation must run on the
chosen colour, or someone picks `#F7F8FC` and becomes invisible on `snow`. Clamp lightness on write,
not on read.

---

# Part 6 — Motion

## 6.1 States are facts about the sport, never facts about the user's engagement

Gate 5 — **all uncertainty inherited from the sporting event** — has a motion corollary that is
worth stating as its own rule:

> **A character state must be caused by something that happened in a match, or by something the user
> chose to do. Never by how long it has been since they opened the app.**

Worked example, because this is the one that will get proposed:

- *"Your character looks anxious when the deadline is close and your picks aren't in."*
  **Cut.** The emotion doing the work is guilt, and the cause is app-absence, not sport. Fails gate
  2 (Affect) and the disclosure gate — the tooltip would read *"we make your character sad so you
  come back"*, which is the exact failure `CLAUDE.md` names.
- *"Your character wears your kit once your picks are in."*
  **Passes.** The tooltip reads *"you're in kit because your picks are locked"* — a fact, caused by
  something the user did, and useful at a glance. It is also the more *effective* of the two,
  because an empty kit slot is information rather than a mood.

## 6.2 The state model

Eight states. Each is one head pose + one eye shape + one body pose, blended — the Duolingo
modular-combination idea, at a size we can afford.

| State | Trigger | Rig | Surface |
|---|---|---|---|
| `idle` | default | both | everywhere |
| `ready` | picks submitted for the open matchweek | both | your own card |
| `exact` | an exact-score prediction landed | bust | your result row |
| `miss` | prediction missed | bust | your result row |
| `duel_won` | a Showdown duel settled in your favour | figure | duel card, banter |
| `duel_lost` | a Showdown duel settled against you | figure | duel card, banter |
| `out` | eliminated in Last Man Standing | figure | LMS board |
| `crowned` | pool won, or a milestone badge | figure | share card, trophy case |

**Idle is the one that has to be good.** It is on screen 99% of the time. Duolingo's answer —
8 heads × 8 bodies = 64 non-repeating idle variations — is the right shape of answer. Ours can be
cheaper: **a blink on an irregular 3–7s interval, a 2px breathe on a 4s cycle, and a head-angle
offset seeded from `user_id`** so twelve people in a leaderboard are not twelve identical metronomes.
Seeding from the id (rather than randomising) means the same person is always tilted the same way,
which is the same identity-continuity argument as the colour hash.

⚠ **Idle must not animate in a list.** Twelve simultaneously breathing characters on a leaderboard is
a battery bill and a distraction from a ranking. Lists render the seeded *static* pose. Animation is
for the single-character surfaces: your own card, the profile, the duel, the walkout.

## 6.3 Celebration is social here, and that changes it

Duolingo's celebrations are private — you against the app, nobody watching. SportPool's leaderboard
is a room full of people you know. `SPORTPOOL_VISION.md`'s "no bad feelings" is not compatible with a
character dancing on a board where eleven other people just lost.

> ✅ **SETTLED 2026-09-14 (Ryan): FULLY STILL on every shared surface.** The leaderboard, the pool
> card and every member list show each character in `idle` — one neutral pose, no result states, no
> motion. A character expresses a result only on **your own** surfaces (your card, your profile, your
> share card) and on **rivalry** surfaces (duels).

The alternatives were weighed and rejected: letting everyone express their own week puts a
disappointed face beside someone's name in front of their colleagues every week; and a capped
"positive-only" version still asks the board to carry mood. Still is the version that cannot go
wrong, and the rank and points beside it already tell the truth without help.

**Three things follow, and two of them are savings:**

1. **The art budget drops.** `miss`, `out` and `duel_lost` only ever need to exist at duel and profile
   size — never across the catalogue, never at 24px. Every state is something a designer draws.
2. **§6.2's "idle must not animate in a list" rule stops being a caveat and becomes the default.**
   Lists render one seeded static pose. No ticker, no battery cost, nothing to tune.
3. ⚠ **It puts more weight on the surfaces that *do* express.** If the leaderboard is still, the duel
   card and the banter share-card are where the character earns its keep — which sharpens Q8.

Rivalry surfaces are the exception because gate 2 explicitly permits rivalry as an affect — and
Showdown is a consented, symmetrical, one-to-one duel. A `duel_won` strut in front of the one person
you beat is banter. The same animation on the pool leaderboard is gloating at ten people who didn't
opt in.

⚠ This also means `out` (LMS elimination) needs care. Elimination is real and must be shown — but it
is shown as *state*, not as *humiliation*. A character that sits down is honest; a character that
cries is a bad feeling manufactured by us.

## 6.4 The celebration budget

Duolingo publishes an escalation ladder and no restraint principle. We should have both.

| Tier | Frequency | Treatment |
|---|---|---|
| **Micro** | many per matchweek | a pose change on your own row. No sound, no overlay, no interruption. |
| **Moment** | ~1 per matchweek | duel result, weekly rank change. Contained in a card. |
| **Event** | a handful per season | pool won, LMS survival to final two, a milestone badge. Full-screen, share card generated. |

**The counter-metric (gate 4, Substitution):** if Event-tier celebrations are working, *pick quality
and pool completion* rise. If sessions rise and completion doesn't, the celebration is doing
engagement work rather than product work and the tier should shrink. Name the metric before
building, not after.

## 6.5 The share card is part of the feature

Duolingo designed the milestone share card *with* the animation. `MOTION_SPEC.md` already treats the
share artifact as a first-class output. The character system should produce, from the same config:

1. **Static share PNG** — figure + ground + result, 1080×1080 and 1080×1920.
2. **The banter auto-card** — `memory/project_backlog_banter_engagement.md` records that ~67% of
   banter messages are already auto share-cards. That is the highest-traffic character surface in the
   product and it exists today. It should be in v1 scope, not v2.

## 6.6 Accessibility

- **`prefers-reduced-motion` / `AccessibilityInfo.isReduceMotionEnabled()` disables every idle and
  every transition.** States still change — they cut instead of blending. A reduced-motion user must
  not lose *information*, only movement.
- **No state is conveyed by motion alone.** `out` must read as eliminated from a still frame.
- **Every rendered character carries an `alt` / `accessibilityLabel` of the person's name**, not a
  description of the avatar. A screen reader user wants "Sarah", not "a character with brown hair".
- ⚠ `camera=()` in the production Permissions-Policy header will block in-app photo capture if photo
  avatars ever gain a camera path — recorded in `memory/project_security_headers.md`.

---

# Part 7 — Architecture

## 7.1 The surfaces a character must render on

| Surface | Runtime | Animation possible? |
|---|---|---|
| Next.js web | React DOM | yes |
| Expo RN | `react-native-svg` 15.12.1 + Reanimated 4.1.6 | yes |
| **Email** (Resend) | static image only | **no** |
| **OG / share cards** | server-rendered PNG | **no** |
| **Remotion** (Showdown video cards) | React DOM in a headless render | frame-by-frame |
| **TV boards** (`/tv/[slug]`) | Next.js, long-lived, unattended | should not |

**Three of six cannot run an animation runtime at all.** Any format that cannot produce a static PNG
on a server is disqualified from half the product on its own.

## 7.2 The format decision

| Option | Web | RN | Server PNG | OTA-able | Verdict |
|---|---|---|---|---|---|
| **Parts model → SVG** | ✅ inline | ✅ `react-native-svg` | ✅ Satori + resvg | ✅ | **Recommended** |
| **Rive** | ✅ (~200KB WASM) | ⚠ native module, dev build required | ❌ | ❌ C2 | Hero-only, later |
| **Lottie** | ✅ | ⚠ native module | ❌ | ❌ C2 | No — passive, and we need response |
| **Skia** | ❌ | ⚠ declared, not installed (C4) | ❌ | ❌ C2 | Corridor only, per its own spec |

### The recommendation: one parts model, rendered three ways

**A character is a JSON config. A pure function turns that config into a scene graph of primitives.
Three thin renderers consume the scene graph** — `<svg>` on web, `react-native-svg` on mobile, Satori
on the server. Motion is Reanimated (native) / CSS transforms (web) applied to *named nodes in the
scene graph*, not baked into the art.

Why this and not Rive, given Rive is plainly the better animation tool:

1. **It is the only option that renders in an email and on an OG card.** Not a preference — half the
   surfaces have no runtime.
2. **It ships over the air.** C2 means a Rive character is a store release per change; a parts-model
   character is an OTA. Over a two-year catalogue that is the difference between a living feature and
   a frozen one.
3. **It can be verified on this machine.** C3 means native character work is unverifiable during
   development, which is an unacceptable place to put a feature whose entire value is visual.
4. **One art pipeline.** §1.4 — Duolingo's excellence needs a creative technologist standing between
   animator and engineer. A `.riv` file would need every part authored a second time, in a second
   tool, with a state machine maintained in parallel with the catalogue. One pipeline that is 80% as
   good beats two pipelines at 100% that one person cannot keep in sync.

⚠ **The honest cost:** idle animation in a parts model runs a ticker; Rive's state machine idles at
~0% CPU. Mitigation is §6.2's rule — lists render static poses, and only single-character surfaces
animate. If that rule is ever broken, this decision becomes wrong.

⚠ **Revisit Rive for the walkout specifically, and only after the parts-model walkout exists and is
judged insufficient.** Never before. The walkout already needs an EAS build for the Skia corridor, so
it is the one surface where C2's cost is already sunk.

### C1 is a real trap here

`react-native-svg` ignores SVG `transform` **strings**. A parts catalogue authored as SVG snippets
with `transform="translate(…) rotate(…)"` will render correctly on web and silently wrong on the
phone — the exact failure recorded in `memory/project_rn_home_card.md`.

**Mitigation:** the catalogue stores *geometry and numbers*, never SVG markup. Position, rotation and
origin are fields on the part; each renderer applies them in its own idiom. A test should assert no
catalogue entry contains the substring `transform=`.

## 7.3 Data model

```
avatar_config  jsonb   on profiles/users — the character
avatar_url     text                      — the photo, unchanged, still supported (A1)
avatar_color   text                      — chosen ground; NULL = use the hash (§5.5)
```

Resolution order for rendering a person: `avatar_config` → `avatar_url` → initials on hashed
gradient. Three tiers, none removed, forever.

`memory/project_backlog_avatar_cosmetics.md` already called this:

> `<Avatar>` component API — should accept either a URL prop (Phase A) **OR** a config object
> (Phases B+). Build the component to handle both from day one if possible.

`components/ui/Avatar.tsx` takes `person: AvatarPerson` today, which is the right shape — widen
`AvatarPerson`, don't add a second component.

⚠ **Ownership of purchased items is not `avatar_config`.** Equipped ≠ owned. An `entitlements` table
is the record of purchase; `avatar_config` only names what is currently worn. Conflating them means a
config edit can grant an item.

⚠ **PostgREST's 1,000-row cap** (`memory/supabase_postgrest_row_cap.md`) applies to any unbounded
read of a catalogue or of entitlements. Bound them from the first query.

## 7.4 Server rendering

Satori (JSX + CSS → SVG) + resvg (SVG → PNG) on a Vercel function, cached hard by config hash. This
serves emails, OG cards, TV boards and Remotion stills from the same parts model.

⚠ **Satori supports a subset of CSS and no SVG filters.** The grammar in §4.2 — flat fills, no
strokes, no gradients inside the figure, no shadows — is partly *chosen* to stay inside that subset.
Cheap discipline now; a rewrite if broken later.

⚠ `memory/project_caching_strategy.md`: precompute beats cache. A character PNG should be written
once at config-save time, not rendered per request.

---

---

# Part 7b — The rig: where the art actually comes from

> ✅ **SETTLED 2026-09-14.** Four routes were tested against real artwork, not argued about.
> This section records what each one proved, so nobody re-runs them.

## 7b.1 The answer

**Adopt the Avataaars rig. Restyle it with the SportPool palette. Commission only the football half.**

Avataaars (Pablo Stanley, free for commercial use, no attribution) is the only free-tier modular
rig that is flat vector, carries a full skin range, and already ships a **clothing slot with its own
colour** — the hook the kit colourway system needs. **Open Peeps** (same author, **CC0**) has the best
hair and cultural range of anything available and is public domain, so its shapes can be redrawn into
the Avataaars rig without asking anyone.

Both licences permit modification. **We are adopting a rig, not a look** — anchors, slot structure and
a working parts model, which is the expensive part of this problem.

⚠ **The real cost of Avataaars is that it is everywhere.** Used as-is, SportPool looks like every side
project on the internet. Restyling is not optional polish, it is the point.

## 7b.2 Every shipping avatar product does it this way

Snap's Bitmoji pipeline is *"flat shape layers, custom color lookup tables, and distinct canvas
coordinate grids"*, with each user's avatar stored as a **serialized JSON state object**. Mii, Memoji,
Zepeto and Duolingo are the same shape of thing. **Nobody generates parts.** §7.3's `avatar_config
jsonb` is, almost exactly, Snap's state object — the architecture in this document was right; only the
question of where the art comes from was open.

🔴 **Correction to the record:** `memory/project_backlog_avatar_cosmetics.md` recommends **Ready Player
Me** as the Phase B build option. It **shut down on 31 January 2026** after the Netflix acquisition —
creator, developer APIs, all of it. That line is dead.

## 7b.3 Licence filter — it removes half the field

| Licence | Commercial | Modify | Attribution | Rigs |
|---|---|---|---|---|
| Free commercial | ✅ | ✅ | none | **Avataaars** |
| CC0 1.0 | ✅ | ✅ | none — public domain | **Open Peeps**, Notionists, Lorelei |
| CC BY 4.0 | ✅ | ✅ | **visible credit** | Personas, Micah, Big Smile, Miniavs |

Licences read from each asset's own embedded RDF metadata, not from a summary page. A credit line
beside a paywall is a decision, not a blocker — **Personas** is arguably the best-looking of the lot and
a licence email to Draftbit is cheap. Two rule themselves out immediately: **Lorelei renders every face
uncoloured** (no skin tones at all, fails Q3 before anything else) and **Notionists is monochrome** (no
kit colour possible).

## 7b.4 Catalogue reality, measured from source

| Slot | Sketch file (2018) | npm package | Q3 target | |
|---|---|---|---|---|
| Hair | ~10 | **27** | 30 | 3 short |
| Headwear | in Top | **7** | 12 | 5 short |
| Skin tone | 7 | 7 defaults, **any hex** | 12 | ✅ config |
| Hair colour | 10 | 10 defaults, **any hex** | 14 | ✅ config |
| Eyes / brows / mouth | 12/13/12 | **12/13/12** | — | ✅ exceeds |
| Facial hair | — | **5** | 7 | 2 short |
| Eyewear | in Top | **7** | 6 | ✅ |
| Clothing | 21 | **9** + any hex | 8 colourways | 🔴 none is a kit |
| Nose | 1 | **1** | — | ⚠ |
| Body below chest | none | **none** | full figure | see §7b.5 |

⭐ **The skin gap costs nothing.** Skin and hair are each a flat `<rect fill="#hex">` masked to the
shape. Going from 7 tones to Q3's 12 is **adding five hex values** — no drawing.

⚠ **Strip the graphic tees** before anything ships: `bat, bear, cumbia, deer, diamond, hola, pizza,
resist, skull`. Off-brand for football, and some carry references we have no reason to inherit.

## 7b.5 Full body: solved, and cleanly

The bust is not missing a body — it is **cropped**, and it terminates in a clean flat edge.

| Measured fact | Value |
|---|---|
| Canvas | 280 × 280, content wrapped in `<g transform="translate(8)">` |
| Head | y 33..182 → **H = 149** |
| Shirt | x 40..240, path ends `L232,110 L32,110` — flat, **exactly on the canvas floor** |
| 3.35 heads (§4.3) | 33 + 3.35 × 149 = **532** → extend the canvas by 252 |

Everything below the chest — torso continuation, arms, hands, shorts with the leg-hole notch, hooped
socks, boots — is ~90 lines of soft-rects and one garment path, fully config-driven. **The torso
continuation uses the same hex as the shirt, so the seam is invisible.**

⚠⚠ **THE GOTCHA: `viewboxMask`.** DiceBear wraps all content in `<g mask="url(#viewboxMask)">`, and
that mask is a 280×280 rect. Leave it alone and **everything below y=280 is silently clipped** — the
figure renders as a bust no matter what you draw. Grow the mask before the canvas. Cost one blank
render and a wasted debugging pass.

⚠ Quality: the body reads as amateur beside professionally-drawn Avataaars heads (stubby arms, no
wrist, rectangular legs, no matching shadow). **It is a working skeleton for a refinement brief, not
shippable art** — which is a far cheaper commission than a blank page.

## 7b.6 ⭐ Growing a hairstyle without growing the face opening

Ryan's idea, and the most reusable technique to come out of this.

**Uniform scaling fails** because the hair silhouette carries the face opening inside its own geometry
— scale the mass and the hole scales with it, exposing a rim of scalp. Scaling *down* works (a smaller
hole hides behind the head); scaling *up* never can.

**The warp that works:**

1. Extract the **head's own path** from the same SVG (`fill="#CE8E62"`), sample it, and build a polar
   radius lookup `R(θ)` around the head's centre — in canvas coords, cropping below the chin (y > 205)
   so the neck and shoulders don't pollute it.
2. For every hair point: `r ≤ R(θ)` → **untouched**. `r > R(θ)` → `r' = R + (r − R) × k`.

The interface stays exactly steady; only the mass beyond the real head outline grows. Curves are
sampled to a dense polyline first — the warp is non-affine and cannot be expressed on control points.

⚠⚠ **Anchor to the head's REAL OUTLINE, never a fitted ellipse.** The first attempt pinned an ellipse
whose centre came from measuring *rendered pixels* (`cx = 120.5`). The head **path** is symmetric about
`x = 132` local — `x = 133` in the hair's frame. **12.5 units off, entirely to one side**, which
produced a clean result on the left and a visible gap on the right. Ryan spotted it; I hadn't.

**Yield across the catalogue:**

| Style type | Shrink | Grow |
|---|---|---|
| Voluminous — fro, curly, dreads, bigHair, frizzle, shaggy | ✅ | ✅ warp |
| Close-cropped — shortFlat, theCaesar, shortRound | ✅ | ❌ spikes — almost all of the shape is *inside* the skull, so only tips get pushed |

2–3 genuine variants per voluminous style, from professionally-placed curves that are only moved. This
also **partially resurrects Q2's hair-volume parameter** — as discrete steps, not a continuous slider.

⚠ Costs: a warped path is ~2,300 points against ~250 (≈9× bytes); silhouettes go faceted above about
k=1.7 at 26 samples/segment; and **`bigHair` contains a degenerate arc** (start == end) that crashes
`svgpathtools` — one style in 27, needs a guard.

## 7b.7 The four routes, and why three of them stop

| Route | Verdict |
|---|---|
| **I author the art** | ❌ Structure right, surface wrong. Avataaars' hair is **13,953 hand-placed coordinates** across 36 components; one afro path alone has 266. My whole character used ~40. The gap is not capability, it is the **look-and-nudge loop** — an illustrator makes hundreds of micro-corrections per shape on continuous visual judgement; I write blind, render, and reason in words. Evidence: Ryan caught the snowman bodies, the floating shoulders and the right-side gap. I fixed all three within minutes of each being *named*, and spotted none of them. |
| **nano-banana generates parts** | ⚠ It **can** isolate a part — but only if the hole is described as a **positive thing** (*"the face opening is filled with the same magenta as the background"*), never as a negation. Against a real rig: ~50% failure per generation, unreliable anchors, and the output is a **different art style** sitting on Avataaars faces. Worse than the 27 styles already in the package. **Root cause is unfixable by prompting: the model emits pixels, has no coordinate system, and each generation is an independent sample.** |
| **Extend the body geometrically** | ✅ Works — §7b.5. |
| **Derive variants by transform** | ✅ Works — §7b.6, once anchored to the real outline. |

## 7b.8 Three verification lessons

1. **A round-trip test using the same flawed parser on both sides is circular.** My hand-rolled path
   transformer reported 256 numbers in, 256 out, zero mismatches — while producing a broken path. Only
   the **render** caught it. Cause: SVG arc commands pack their flags without separators (`a5 5 0
   0110 10`), which greedy number-matching misreads.
2. **Never hand-roll SVG path parsing.** `svgpathtools` round-tripped pixel-identically first try, and
   correctly *refuses* `sx ≠ sy` on arcs — a non-uniformly scaled circular arc is a rotated ellipse arc.
3. **Prefer path data to rendered pixels for any measurement.** My naive bbox said `x -41..249, y
   -46..246`; the real one is `x 17..249, y 0..193` — wrong on every bound, because I assumed
   alternating x,y pairs on paths that are relative with arcs.

## 7b.9 Security audit — the Sketch library

`Avatar_Library.sketch`, SHA-256 `04002e1f2b1220f64f3cab061254df96867a4f675a3b4eeb280a618170391f15`.
**Clean.** Real ZIP (9 entries), no path traversal, no symlinks, no exec bits, 4.5× compression ratio,
**zero URLs** in 3.5M chars of JSON, no scripts/eval/shell/binaries, and every entry verified as JSON
or PNG **by magic bytes, not extension**. The one flagged token, `.sketchplugin`, is inert layout
settings left by *Symbol Organizer*. Authentic: Sketch 48.1, five pages including `@pablostanley`.

⚠ `avataaars`, `@dicebear/core`, `@dicebear/collection` and `react-nice-avatar` all have **no npm
install hooks** (`preinstall`/`install`/`postinstall`/`prepare`) — the real attack surface, and it is
clean. All are **single-maintainer**, so account takeover is the realistic risk rather than today's
code: pin exact versions and trust the lockfile hash.

---

# Part 8 — The gates

## 8.1 The disclosure gate

> *"Build a character that looks like you. It shows up on your card, in banter, and walks out for
> your Showdown duels. Some kits and accessories cost money; none of them affect your score."*

Says the whole mechanism, including that it's paid, and does not kill it. **Passes.**

## 8.2 The five gates (Decision 8)

| Gate | Assessment |
|---|---|
| **1. Disclosure** | ✅ Above. |
| **2. Affect** | ✅ Pride, self-expression, rivalry — all named as fine. ⚠ Conditional on §6.1 (no absence-triggered states) and §6.3 (no gloating on shared boards). |
| **3. Symmetry** | ✅ Exit must be as easy as entry: one tap back to a photo or initials, at any time, with no confirmation friction and no "are you sure you want to lose your character". A1 makes this structural. |
| **4. Substitution** | ⚠ **The gate that needs work.** Does a character give more of what people came for, or just more sessions? Counter-metric required before building: pool completion and pick submission rate, tracked against character adoption. If characters rise and completion doesn't, this is decoration. |
| **5. Variance provenance** | ✅ **Only if the three already-cut mechanics stay cut.** |

## 8.3 Three mechanics that are already cut and must stay cut

Recorded in `MONETIZATION.md`:

1. **Premium currency ("PoolPoints")** — fails disclosure. Price is in dollars.
2. **Limited-edition drops / weekly countdowns** — fails affect: manufactured FOMO.
3. **Randomised packs** — fails variance provenance. Randomness we add is gambling design whether or
   not money moves, and the standing check is *assume a 15-year-old is in a family pool*.

> Cutting all three still describes Fortnite's real shop.

Two more to add, specific to characters:

4. **No cosmetic may affect scoring, pick accuracy, tiebreaks, or anything visible on a leaderboard
   beside a number.** Non-negotiable in a friend pool.
5. **No character state may be driven by another user's behaviour.** "Your rival's character is
   taunting you" is social pressure with a costume on.
6. **Skin tone and hair are never sold.** §5.3. Permanently out of scope, not deferred.
7. **A chest badge slot never carries a real crest.** The slot is fine; its content is abstract or
   user-made. §5.4, RM-12.

## 8.4 The adoption gate — split in two

> ✅ **SETTLED 2026-09-13.** One gate was guarding two different doors.

`MONETIZATION.md` gates the shop on **>40% photo-upload adoption within 3 months of Avatars v1**.
Avatars v1 has not shipped, so it has never been measured — and it is a poor instrument in both
directions. For *"should we build characters?"* it is actively misleading: plenty of people will not
put their face beside their name in a work pool but would happily build a cartoon, so **low photo
adoption is an argument for characters, not against them**. For *"should we build a shop?"* it is too
weak: uploading a photo is ten seconds of effort, and a purchase needs three minutes of investment.

**The resolution:**

| Door | Gate |
|---|---|
| **Characters** (Phases 2–4) | **Ungated.** This is the product experience, and it stands on its own. |
| **The shop** (Phase 6) | **Edit depth** — % of character users who changed ≥1 part from the default within 30 days. |

Adoption says they tried it; **editing says it matters to them**, and only the second predicts someone
reaching for a card. Ship Avatars v1 regardless — it is 3–5 days and **A1** makes photos permanent
anyway — but do not let its number decide whether characters get built.

⚠ **The numeric threshold is deliberately left open.** 40% was invented for a different feature and
re-using the digits would launder a guess into the record. Record the *shape* of the gate now; set the
number when there is data.

⭐ **There is a free signal available today that beats both.** `memory/project_backlog_banter_engagement.md`
records that **~67% of banter messages are already auto share-cards** — people are pushing images
carrying their identity into pools right now, unprompted. Query that before picking any threshold.

---

# Part 9 — Phasing

Deliberately not dated. Each phase is gated on the previous one's signal, not on a calendar.

| Phase | What | Gate to start |
|---|---|---|
| **0 — Now → Q1 2027** | **This document.** Grammar, catalogue, states, and *paper* design. Adopt the Avataaars rig (Part 7b), extend the skin/hair ramps, derive the hair volume variants, and scope the football commission. Run the distinguishability test (§5.3). | — |
| **1** | **Avatars v1** — photo upload + initials. Unchanged from its existing scoping. | — |
| **2** | **The parts model** — config → scene graph → three renderers. Bust rig only. Static, no motion. Ships to the existing `<Avatar>` call sites. | Phase 1 live |
| **3** | **The editor** — the customisation UI, mobile-first. Free catalogue only, no purchases. **Needs its own design pass — see below.** | Phase 2 rendering correctly on all six surfaces |
| **4** | **Figure rig + states** — full body, the eight states, idle, share cards, the banter auto-card. | §8.4's edit signal |
| **5** | **The Showdown walkout** — the figure replaces the silhouette layer in `MOTION_SPEC.md`. | Phase 4 + whatever the corridor decision lands on |
| **6** | **The shop** — colourways and accessories, real money, no currency, no packs, no countdowns. | The commercial gate in `MONETIZATION.md` |

⚠ **Phases 2 and 3 are the ones that decide whether this works.** Everything after is amplification.
If the editor ships and nobody edits, stop — that is the honest outcome, and it costs weeks instead
of months.

## 🔴 The editor is a real product and it is not designed yet

Flagged by Ryan 2026-09-13. Phase 3 is one row in a table and it is carrying more than one row's
worth of work.

**The catalogue decision in §5.3 makes the editor harder, not easier** — and that coupling is the
point. ~120 assets across 13 slots on a phone cannot be a row of swatches; it needs real navigation,
a live preview that does not stutter while a slider moves, and an ordering that puts hair and skin
first because that is where recognition happens. Depth only pays off if the editor makes it
reachable; otherwise 30 hair styles is a scrolling chore and the user takes the third one.

Things the editor has to settle that nothing above answers:

- **Order of slots.** Skin and hair first, or body first? Recognition says face-first.
- **Randomise / surprise me.** The cheapest path to a non-default character, and the thing that
  makes A3's "dignified default" much easier to hit.
- **Undo, and leaving without saving.** A character is fiddly; losing twenty taps is the classic rage-quit.
- **The preview's rig.** Bust, figure, or both at once — the user is choosing a thing that renders two ways.
- **Where it lives.** Profile, onboarding, or both — and whether it is ever forced (it must not be: A1).
- **Live preview cost on a mid-range Android**, given the parts model re-renders on every change.

Not scoped here. Worth its own pass before Phase 3 starts, and probably its own set of questions.

---

# Part 10 — Open questions for Ryan

Numbered so they can be answered individually. Answered ones are struck through with their decision.

1. ~~**§8.4 — the adoption gate.**~~ ✅ **2026-09-13 — split in two.** Characters ungated; the shop
   gated on 30-day edit depth. Threshold deliberately unset. Free/paid line: *free gets you a person,
   paid gets you flair* (§5.3).
2. ~~**§4.3 — proportion.**~~ ✅ **2026-09-13 — 3.35 skull-heights, hair volume 1.00 (range 0.4–1.5),
   55% to the torso, chest bust crop.** Settled against a reference image using the interactive model
   sheet. The measurement trap is recorded in §4.3.
3. ~~**§5.3 — catalogue size.**~~ ✅ **2026-09-13 — ~120 at the re-weighted split, and explicitly not
   leaner.** Ryan: *"I definitely do not want leaner. I want enough that the character can look like
   the user."* 30 hair / 12 skin are the floor, not the target.
4. ~~**Art production.**~~ ✅ **2026-09-14 — adopt the Avataaars rig, restyle it, commission only the
   football half.** Full findings in **Part 7b**, including the licence filter, the measured catalogue,
   the working full-body extension, the hair-warp technique, and the four routes tested with the reason
   each did or did not work. Ready Player Me is dead (shut down 31 Jan 2026) and that line in
   `memory/project_backlog_avatar_cosmetics.md` needs striking.
5. ~~**§6.3 — celebration on shared boards.**~~ ✅ **2026-09-14 — FULLY STILL.** `idle` on every
   shared surface; expression only on your own surfaces and in duels.
6. **§7.2 — Rive.** Agreed as deferred, revisited only for the walkout after a parts-model version
   exists and is judged insufficient?
7. **§5.4 — kit naming.** Colour-only preset names accepted as a hard rule with a lint check?
8. **Scope check.** Is Showdown the launch surface for the figure rig, or should it be the profile
   (lower risk, lower reward)?

---

## Sources

Duolingo, primary:
[Building character](https://blog.duolingo.com/building-character/) ·
[How Duolingo Animates Its World Characters](https://blog.duolingo.com/world-character-visemes/) ·
[Reshaping Duo](https://blog.duolingo.com/reshaping-duo/) ·
[Streak milestone design & animation](https://blog.duolingo.com/streak-milestone-design-animation) ·
[Streak celebration parties](https://blog.duolingo.com/streak-celebration-parties/) ·
[Vikram's redesign](https://blog.duolingo.com/vikram-redesign/) ·
[Design hub](https://blog.duolingo.com/hub/design/) ·
[Brand & illustration guidelines](https://design.duolingo.com/illustration/shape-language) *(now
redirects to the blog hub; content quoted from indexed copies)*

Rive:
[Duolingo's AI-powered Video Call brings Lily to life](https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life) ·
[Creative technologists — Duolingo's solution to the designer-to-developer handoff](https://rive.app/blog/creative-technologists-duolingo-s-solution-to-the-designer-to-developer-handoff) ·
[Rive as a Lottie alternative](https://rive.app/blog/rive-as-a-lottie-alternative) ·
[Adding Rive to Expo](https://rive.app/docs/runtimes/react-native/adding-rive-to-expo) ·
[rive-app/rive-react-native](https://github.com/rive-app/rive-react-native)

Reception and analysis:
[Duolingo Avatar Creator — how it works and why it's unpopular](https://duoplanet.com/duolingo-avatar-creator/) ·
[Duolingo introduces avatar creator](https://duoplanet.com/duolingo-introduces-avatar-creator-for-select-users/) ·
[Duolingo character names — the complete guide](https://duoplanet.com/duolingo-character-names/) ·
[Lottie vs Rive: file size & performance](https://unicornicons.com/blog/lottie-vs-rive-performance) ·
[Rive vs Lottie complete comparison](https://unicornicons.com/learn/rive-vs-lottie)

Technique:
[DiceBear](https://www.dicebear.com/introduction/) ·
[vercel/satori](https://github.com/vercel/satori)

Internal:
`CLAUDE.md` · `SPORTPOOL_PROGRAMME.md` (Decision 8, Decision 9) · `MONETIZATION.md` (Vector 1,
RM-12, Principle 7) · `SPORTPOOL_VISION.md` · `lib/design/tokens.ts` · `lib/design/avatarGradient.ts` ·
`components/ui/Avatar.tsx` · `assets/showdown-storyboard/MOTION_SPEC.md` ·
`assets/showdown-storyboard/SKIA_CORRIDOR_SPEC.md` · `drafts/2026-09-13_legal_review_logos.md` ·
`memory/project_backlog_avatar_cosmetics.md`
