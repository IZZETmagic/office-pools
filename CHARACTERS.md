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
| Head shape | **4** | ✅ settled 2026-09-14 — rounded square, oval, tapered, squarer jaw. Measurements and the reason a 5th is not generatable: **§7c.1** |
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

### ⭐ The third tier — EARNED (Ryan, 2026-09-14)

> **Free gets you a person. Paid gets you flair. Earned gets you proof.**

Cosmetics unlocked by doing something in the football — win a pool, unlock the champion's sunglasses.

⭐⭐ **This is a renderer for a system that is already live.** `badge_unlocks` is a shipped,
append-only table holding **18,580 rows** in production, RLS'd so pool members can read their pools'
unlocks, with idempotent upserts on every recalc. `SPORTPOOL_PROGRAMME.md` already lists the remaining
work as *"the profile **trophy-case** UI"*. An earned cosmetic hangs off an unlock ledger that has been
quietly recording achievements for three years.

**Passes all five gates (Decision 8), with three rules that the gates themselves generate:**

| # | Rule | From |
|---|---|---|
| **E1** | **Unlocks are earned by sporting and pool outcomes, never by app behaviour.** Not logins, not session counts, not streaks, not posting in banter. | Gate 4 — Substitution |
| **E2** | **Unlock conditions are deterministic and stated in advance.** "Win a pool → the sunglasses." A *random* item from a champion set is a loot box, and randomised packs are already cut. | Gate 5 — Variance provenance |
| **E3** | **An earned item is NEVER purchasable. Ever.** *(Ryan, 2026-09-14.)* That is the entire source of its value, and it discloses beautifully: *"you can't buy this one."* | — |

⭐ **E1 is the same principle as §6.1's motion rule** — *caused by the sport or by the user's own
choice, never by how long since they opened the app*. One rule now governs both what a character
**does** and what a character **owns**.

⚠ **Watch item, gate 2.** In a friend pool where the same person wins every year, an earned item
becomes a permanent visible marker of everyone else's not-winning. It is an *honest* record of a real
thing, so it does not fail — but check it against "no bad feelings" once real ones exist, and prefer
**subtle** earned items (sunglasses, an armband, a trim) over loud ones.

### ⭐ Kits have no names at all *(Ryan, 2026-09-14)*

A kit is a **swatch you pick and put on your avatar** — the same interaction as choosing a skin tone or
a hair colour. No preset names. No user-supplied names.

This dissolves the naming problem rather than managing it. It removes, in one move: the association
risk in our own copy, the UGC moderation surface for user-named kits, the denylist lint check, and the
acceptable-use line the ToS would otherwise need.

⚠ **This changes a clause in `MONETIZATION.md`**, which currently reads *"…and users name their own"* —
written as the mitigation for not being able to use club names. Removing naming entirely moves in the
same direction (strictly less risk) but the clause needs updating rather than quietly diverging.

⚠ **The one place a label still leaks is the shop.** A purchase needs an identifier on the receipt and
the entitlement row. Keep those as **colour-descriptive slugs** (`red-white-sleeves`,
`black-amber-hoops`) that never surface as a *name* in the UI — which keeps the association rule
intact by construction, because there is no surface for a name to appear on.

⭐ **v1's kit is generic and plain** *(Ryan)*. Patterns and colourways arrive later, paid or earned.
That is also the cheapest possible first commission.

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

> ✅ **SETTLED 2026-09-14 (Ryan): Rive is deferred, scoped to the Showdown walkout only.**

⚠ **Revisit Rive for the walkout specifically, and only after the parts-model walkout exists and is
judged insufficient.** Never before. The walkout already needs an EAS build for the Skia corridor, so
it is the one surface where C2's cost is already sunk.

**Two things since strengthened the deferral:**

1. **Part 7b makes the parts model the thing we HAVE, not the thing we'd build.** Avataaars *is* a
   parts model — SVG, flat fills, modular slots, a config object. Moving to Rive would mean
   re-authoring the whole catalogue in a second tool.
2. ⭐ **Q5 removed Rive's one real advantage.** Its killer property is a state machine idling at ~0%
   CPU where a parts model runs a ticker. **Shared boards are now fully still, so there is no ticker**
   — the cost Rive was solving no longer exists at the scale that mattered.

**The concrete revisit test**, since "judged insufficient" is mush: prototype the walk, show it to
three people who do not know it is a prototype, and if it reads robotic, **first** spend two more
animated values on hair and sleeve lag. Only if that fails does a second toolchain come back on the
table. And the walkout is easier than it looks — beats 3–5 of 8 in `MOTION_SPEC.md` are *"backlit
figures"* and *"silhouettes emerge"*; a silhouette needs no walk-cycle fidelity, and full detail only
has to land from beat 6.

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

---

# Part 7c — The base, the anchors, and the editor

> ✅ **SETTLED 2026-09-14.** Everything here came out of generating against the real
> rig and measuring the results, not from reasoning about it.

## 7c.1 Four base faces

The **base** is what never swaps: head silhouette · skin · eyes (white + separate pupil) ·
nose · ears · neck, shoulders and shirt body. **Parts** swap on top: hair · facial hair ·
eyewear · headwear · mouth · collar trim.

The base is built first because **it defines every anchor**. Where hair sits, where glasses
rest, where an earring hangs — all measured off it. Get it wrong and everything downstream
is wrong, which is exactly what happened when the hair warp was pinned to a guessed ellipse
instead of the head's real outline.

**Four shapes, chosen by Ryan** — `B1 rounded square`, `B2 oval`, `B3 tapered`,
`B5 squarer jaw`. Measured:

| Base | w/h | brow | cheek | jaw | **jaw ÷ brow** |
|---|---|---|---|---|---|
| Rounded square | 0.94 | 985 | 1151 | 935 | **0.95** — broad throughout |
| Oval | 0.72 | 855 | 833 | 672 | **0.79** — gentle taper |
| Tapered | 0.68 | 828 | 960 | 351 | **0.42** — strong taper |
| Squarer jaw | 0.67 | 826 | 966 | 389 | **0.47** — strong taper |

⚠ **Tapered and squarer-jaw are near-twins** (0.42 / 0.47, brow and cheek within 2%).
Kept deliberately; two of the four will read as similar.

🔴 **A fifth shape is not generatable.** Six attempts across both extremes — "square and
blocky with a very wide flat jaw", "heavy broad jaw flaring outward", "pear shaped",
"sharp heart shape with a tiny pointed chin", "narrow and delicate", "diamond" — produced
0.97, 0.44, 0.47, 0.42, 0.71, 0.45. **Not one escaped the shapes already in hand.** The
cheek width came back as 964, 964, 959, 966, 966 across five completely different prompts.
**Recraft varies surface detail but not underlying structure.** A fifth shape is a
designer's five minutes, or a warp of an approved outline — not a prompt.

## 7c.2 The anchor set

`anchorset.json`, built by `anchorset.py`. Per base: head bbox and w/h · crown y · chin y ·
a 7-point width profile · **a 360-bin polar outline `R(θ)`** · the outline path itself ·
eye anchors (centres, size, separation) · ear anchors where they exist.

`R(θ)` is the thing that matters: it is what `warp2.py` fits parts against, and it is why a
hairstyle authored once can be placed on all four faces.

## 7c.3 ⚠⚠ A generated asset is a picture, not a component

**The most important rule to come out of the build.** Three separate detectors broke in one
sitting, each silently, each caught only by verifying:

| Trap | What happened |
|---|---|
| **Shared fills** | Pupils, hair bun and mouth all `#5F3A28`. A naive "recolour the dark colour" turns someone's hair blue along with their eyes. |
| **Inconsistent colours** | Eye whites were `#FEFEFE` on three bases and `#EADED7` on the fourth. A colour-keyed detector reported that base as having **no eyes at all**. |
| **Welded features** | Ears are separate paths on **one** base and part of the skull outline on the other **three**. Same picture, different structure. |

And two ranking traps inside the geometric detector itself:

- ranking symmetric pairs by area found the **ears** and called them eyes (tall and narrow
  beats wide and short on area)
- adding an aspect-ratio filter then found the **eyebrows** (239×79, ratio 3.0, still more
  area than the eye whites)

**What actually works: nesting.** An eye white is the only feature on the face with another
shape inside it. Nothing else contains a pupil.

> **Every asset needs a STRUCTURE PASS before it enters the catalogue** — split shared
> fills, promote welded features to their own paths, verify every anchor by *geometry and
> nesting, never by colour*, and **report what it could not find** rather than guess.

🔴 **This blocks a slot Ryan has asked for.** Earrings need an ear to hang off. On three of
four bases there is no ear path — it is the skull outline. Path-splitting moved from
nice-to-have to prerequisite.

## 7c.4 Assets versus parameters

Several requested slots are **not drawings**:

| Needs drawing | Free — a parameter |
|---|---|
| eye shapes · brow shapes · mouth shapes · hair · facial hair · accessories · skin marks | **ear size** · **nose size** · **all colours** · **pupil position** · eye spacing |

Ears and nose vary by *scale on one asset*, not separate art. Freckles, scars, blotchy skin
and rosy cheeks are **overlays inside the face**, so they touch no anchor and cost almost
nothing.

⭐ **Colour is free, and proven.** One generated character recoloured to four different
people by find-and-replace on `fill` attributes — 7 distinct fills in the whole SVG, no API
call. So: **generate for FORM, recolour for PALETTE.** Never use Recraft's `colors`
parameter — it constrains the *entire* palette including skin, which is how we got blue
faces.

## 7c.5 ⚠ Identity versus state — the collision, and the split

Ryan asked for emotions the **user picks** in the eyes, brows and mouth. §6.2 has the **app**
driving emotion (`duel_won`, `miss`, `out`, `crowned`). Both cannot own the same slot: either
a chosen angry brow is overwritten the moment a duel settles, or every identity × state
combination needs its own art.

> ✅ **The split: identity owns the EYE SHAPE and the BROWS. The app owns the PUPIL POSITION
> and the MOUTH.**

The chosen face persists, and the app animates with the two cheapest things available —
**pupil position is a transform** (free, and it is exactly what makes a face read as alive
rather than dead-eyed), and **one mouth set** covers every state. No combinatorial art.

## 7c.6 One asset, four transforms — never four copies

Four face shapes multiply every part. The wrong way is 30 hair × 4 = **120 files**: fix a
style and you fix it four times, or three drift.

> **Store one authored asset plus four fit records** — `{scale, offset, warp}` against each
> base's `R(θ)`. Render time applies the fit. Fix once, all four faces get it.

⚠ **With an override slot.** From the warp work, roughly **one fit in five** needs a hand
nudge. So: transform by default, override by exception — budget ~24 overrides across 120
fits, not 90 redraws. Each override is a stored offset, not new art.

## 7c.7 The editor — three stages

> ✅ Stages 2 and 3 as Ryan proposed. Stage 1 replaced.

1. **Start from one of six example avatars.** *(Replaces "choose male / female / other".)*
   It seeds more than gender would — face shape, hair, features and colours together — it is
   visual rather than verbal, nobody has to categorise themselves, and "Other" stops being a
   third option that reads as an afterthought. One tap and the user is already close.
   ⭐ It also delivers **A3's dignified default** for free: whoever abandons the editor still
   ends up with something they would put beside their name.
2. **Face shape** — one of the four. Early, because everything anchors to it and changing it
   late re-fits every part. The preview must update live.
3. **Features, with colour chosen per slot as you go** — ⚠ **hair and skin first**, because
   Q3 established that is where recognition happens. Eyes, brows, mouth, accessories after.

⚠ **Do not label the bases by gender in the UI.** These heads are bald and featureless; what
reads as gendered is jaw width, and that reading **flips entirely once hair is on**. Show
four silhouettes and let hair do the work.

## 7c.8 What Recraft can and cannot do

| ✅ | ❌ |
|---|---|
| Native SVG — real `d` attributes, **zero `<image>` tags** | Ignores everything without a `style_id` — returned black outlines, running poses and an American football helmet |
| `style_id` from 1–5 references is the whole ballgame: **462 coordinates and correct structure with it, 4,344 and an editorial portrait without** | Cannot vary **skull structure** (§7c.1) |
| Isolated parts, if the hole is framed as a **positive object** ("filled with the same magenta as the background") | Cannot hold all variables at once — every generation fixes one thing and regresses another |
| Output is freely recolourable | No coordinate system; anchors must be measured afterwards |
| **$0.05** per vector generation on our model | Prompt ceiling **10,000 characters** (1,000 on V2/V3) |

⚠ **Because it cannot hold all variables at once, do not generate whole characters.**
Generate parts, composite them. Which is the parts-model architecture this document already
specifies — the generator slots in as an *asset source*, not as a character generator.

### ⭐ Costs and operating limits — verified against the live API, 2026-09-14

⚠ **"units" means two different things in this document.** Everywhere else it is SVG
coordinates (§7e.3, "149.6 units"). Here it is Recraft's billing unit: **1,000 API units =
$1.00**. Always say *API units* when it is money.

⚠⚠ **Two figures in the table above were wrong and are now corrected.** The prompt limit was
recorded as 1,000 characters; the API's own error says `prompt length should be in [1, 10000]`
for `recraftv4_styles_vector`. **Prompts have ten times the room previously assumed** — the
1,000 ceiling is V2/V3 only. And a vector generation was recorded at ~$0.08, which is the *V4 /
V4.1* vector price, not ours.

**What our calls actually cost.** We pass three models across `scripts/`; only the first is
current:

| Model | Raster | Vector | Used |
|---|---|---|---|
| `recraftv4_styles` — the approved look | 35 | **50 · $0.05** | 13 calls |
| `recraftv4_1` | 35 | 80 · $0.08 | 4 calls |
| `recraftv3` | not published | not published | 3 calls |

**The utilities are almost free**, and this changes what is worth trying:

| Operation | API units | USD |
|---|---|---|
| `POST /styles` — create a custom style from 1–5 references | **5** | $0.005 |
| `/images/eraseRegion` | **2** | $0.002 |
| `/images/crispUpscale` | 4 | $0.004 |
| `/images/vectorize`, `/images/removeBackground`, `/prompts/enhance` | 10 | $0.01 |
| `/images/imageToImage`, `/inpaint`, `/outpaint`, `/variateImage` | 40 | $0.04 |
| `/images/creativeUpscale` | 250 | $0.25 |

⭐ **Creating a style costs 5 API units** — the third-party spec's 40 is wrong by 8×. A new `style_id` is a rounding error; it is
the generations against it that cost. Never treat "make another style to test it" as expensive.

**Operating limits:**

- **5 requests/second** and **100 images/minute**, per user.
- **Failed calls are free** — API units are deducted only on a 2xx. This is why every figure
  here could be verified for nothing: an empty body or an over-long prompt returns 400 and
  bills zero. **Probe before assuming; it costs nothing.**
- ⚠ **Result URLs are signed and expire in ~24 hours.** Every script must download on receipt.
  There is no "fetch it later".
- ⚠⚠ **Two wallets that do not exchange.** Our `RECRAFT_API_KEY` spends *API units* (pay as you
  go). Recraft Studio and the remote MCP server at `mcp.recraft.ai` spend *subscription
  credits*. A tool that authenticates by OAuth is not spending our balance and cannot.
- Check the balance with `GET /v1/users/me` — free, and it returns `credits` as API units.
  **1,408 units on 2026-09-14** (≈ $1.41, ≈ 28 more V4 Styles vector generations).

**The API exposes 19 operations; we call two** — `/images/generations` and `/users/me`. Full
inventory with per-operation costs: <https://claude.ai/artifact/92Y1ftv5iF9zdhAkA3NaF1>.
Recraft's own getting-started page lists only 15; the four extra (`/images/generations/raster`,
`/generations/vector`, `/images/explore`, `/explore/similar`) are real but undocumented —
probed 2026-09-14, all returned 400 to an empty body where a fabricated path returned 404.

⚠ **The third-party OpenAPI at `api-evangelist/recraft-ai` is not safe to generate a client
from.** Its `model` enum omits every Styles and Vector variant — including all three we use —
so a validator built from it would reject the calls that work today. It is a usable map of
*paths*, and wrong about *parameters*.

⚠ **Licence:** paid tier — *"You own all Assets… Recraft hereby assigns to you all copyright
rights"* (§7.2). But **§7.7 applies to both tiers**: a perpetual, sublicensable, irrevocable
licence back to Recraft, surviving termination. Training is opt-out, the rest is not. And
**AI output may not be copyrightable at all** (*Thaler v. Perlmutter*) — a contract cannot
assign copyright that does not exist. A commissioned illustrator produces work that is
copyrightable and assignable with no licence-back. That difference matters specifically
because the plan is to **sell** cosmetics.

## 7c.9 🔴 Five rejected attempts, and what they establish

My capsule characters · the shoulders · the geometric full body · nano-banana hair on the
real rig · the Recraft characters. **All five rejected on the art. None on the structure.**
Every time the architecture held and the surface did not; every time I judged it close and
was wrong; every time Ryan caught it and I had not.

> **Conclusion of record: I am not a reliable judge of whether this art is good.** Structure,
> anchors, transforms, pipelines and measurement are reliable. Assessment of visual quality
> is not, and should not be solicited.

⭐ **And the reason the generated work keeps landing in the same uncanny place:** the
reference was *designed*. The swoop at the crown, the exact width of the face window, the
tint of the lens, the joint lines on the arms — those are not descriptions, they are
drawing. Every generated attempt approximates *a description of* a design instead of
reproducing the design. **That is what a designer buys, and it is why one is needed.**

---

---

# Part 7d — ⛔ SUPERSEDED: "Generation cannot produce a parts library"

> **The conclusion below is WRONG and Part 7e replaces it.** It is kept because
> everything except the conclusion still holds: the five fitting algorithms all
> really do fail, the structural traps are all real, and §7d.5's process lesson is
> the most important paragraph in this document. The error was inferring from
> "no route holds a head fixed" — which was only true because I kept asking the
> generator for a *part* instead of a whole avatar to take apart.

## 7d.1 The finding

**A parts library requires every part authored against ONE FIXED HEAD.** That single
relationship — this hair, on this skull, at this size — is what makes parts stack without
a fitting step. Avataaars' 27 hairstyles need no fitting at all because they were drawn
onto one 264×280 canvas with one head in it. The relationship is *baked in*, never inferred.

**A generative model has no mechanism to hold a head fixed.** Every route was tested
against the real rig:

| Route | Result |
|---|---|
| **Generate parts in isolation** | Each wig has its own arbitrary ratio between face opening and mass. The afro has a small opening in a big mass, the side part a large opening in a small one. Constrain "opening matches the head" and the afro explodes; constrain "outer size looks right" and the opening stops framing the face. **No algorithm satisfies both, because the assets were never drawn to the same head.** |
| **Generate parts ON the head** (`imageToImage`) | Redraws the face at every strength tried — 0.08, 0.14, 0.22. Asymmetric eyes, warped features, barely any hair. It is a diffusion pass over the whole image, not an edit. |
| **Inpaint hair onto the head** | Preserves everything *outside* the mask byte-identically, and **regenerates everything inside it** — including the face, which must be inside the mask because hair comes down past the ears. Returns a new head in three-quarter view. |
| **Generate whole characters** | Every character has a different head, so there are no shared bases to customise. |

⚠ **This is the thing a designer provides by construction**, not by skill: they draw on one
canvas with one head, so the relationship is exact and needs no recovery.

## 7d.2 Five fitting algorithms, and why each failed

Recorded so nobody rewrites them. Every one was an attempt to *recover by measurement*
information the assets never contained.

1. **Widest horizontal gap** → found the gap between hair and ponytail tail, and between a
   mohawk's side arcs. Not the face.
2. **Opening → brow width** → a wig's opening is *narrower* than the skull because hair
   overlaps the temples. Forcing them equal scaled the afro to **1.92×** and it filled the
   frame. ⚠ A scale near 2 on a part that already fills its canvas is nonsense on its face,
   and I read that number for hours without questioning it.
3. **Temple width** → plausible scales (0.69–1.06) and much better results, but the round
   base and the tapered base need different answers from the same asset.
4. **Iterate opening against head width at eye level** → **diverges.** A larger scale moves
   the probe toward the narrow top of the opening, demanding a larger scale again. Positive
   feedback; the afro ran away to 9.7×.
5. **Root-scan the same constraint** → stable and lands exactly at the target height, but
   still right on one base and wrong on another, because the asset's proportions are the
   problem rather than the solver's.

## 7d.3 Three structural traps in generated assets

Each broke a detector silently; each was caught only by verifying rather than trusting.

| Trap | Detail |
|---|---|
| **Shared fills** | Pupils, hair bun and mouth all `#5F3A28`. Recolour "the dark colour" and hair turns blue with the eyes. |
| **Inconsistent colours** | Eye whites were `#FEFEFE` on three bases and `#EADED7` on a fourth. A colour-keyed detector reported that base as having **no eyes**. |
| **Welded features** | Ears are separate paths on one base, part of the skull outline on three. 🔴 Blocks earrings. |
| **Painted holes** | Some parts are a solid silhouette with a **white patch drawn on top** — visually a hole, structurally a blob. Strip the patch and hair covers the face; keep it and a white blank composites over it. **Fix:** merge the white subpath into the dark one with `fill-rule="evenodd"`, which converts a painted patch into a real hole. |

Plus two ranking traps inside the geometric detector itself: ranking symmetric pairs by area
found the **ears** and called them eyes; adding an aspect-ratio filter then found the
**eyebrows**. What works is **nesting** — an eye white is the only feature with another
shape inside it.

## 7d.4 What survives, and is worth keeping

All of it is the machinery a designer's parts drop straight into:

- **Four base faces** with measured silhouettes (§7c.1)
- **`anchorset.json`** — per base: bbox, crown, chin, 7-point width profile, 360-bin polar
  outline `R(θ)`, the outline path, eye anchors
- **Role tagging by geometry and nesting**, never by colour
- **The recolour architecture** — one asset, every palette, by `fill` swap
- ⭐ **Three part classes**, which changes what metadata every asset carries:

  | Class | Anchored by | Examples |
  |---|---|---|
  | **framing** | its face opening | most hair |
  | **topper** | width + scalp contact, no opening | mohawk, hats, headbands |
  | **jaw** | chin position | beard, moustache |

- ⚠ **A fourth is implied and not built: back/front layers.** A ponytail renders *behind*
  the head. Parts need a z-order split.
- **The harness itself** — every part on every base, live colour, 32px beside each cell

## 7d.5 ⚠ The recurring process failure

> **I repeatedly verified that code ran, and reported it as evidence that the output was
> right.** "All six fitted to all four bases" meant the fitter returned a transform, not
> that the transform was correct. The circular round-trip test (§7b.8) is the same error.
> **Rendering and looking is the only honest check**, and every time Ryan looked he was
> right and I was wrong.

---

# Part 7e — ✅ Generation DOES produce a parts library — decompose, don't inpaint

> **Supersedes Part 7d's conclusion.** 7d is kept below because its five failed
> fitting algorithms and its traps are all still true and still worth not
> repeating. What was wrong was the inference: "no generative route holds a head
> fixed" was false, and it was false because I only ever asked the generator for
> a *part*. Established 2026-09-14 across 22 generations and two independent runs.

## 7e.1 The inversion

**Do not generate a hairstyle. Generate a whole avatar and take it apart.**

Recraft draws the **complete skull** and layers hair on top of it. So deleting the
hair paths from a finished avatar leaves a clean bald head — not a head with a
hair-shaped bite out of it. Every whole-avatar generation is therefore already a
matched head-and-part pair, authored together, which is precisely the thing 7d
declared impossible.

The approved reference (`X3-ponytail.svg`) split into a 22-path base and a 3-path
ponytail by **deleting three paths**. No mask, no fitting, no inpainting. That pair
had existed since the moment it was generated; a full day was spent building
machinery to manufacture something already sitting in the file.

⚠ **Inpainting is the wrong tool and was tried properly before this was found.**
A hair-only mask does hold the head still — silhouette IoU 0.992–0.998, and the
residual pixel delta is a slight global recolour, not displacement. But the
generator paints skin into the mask (7–15% of it), and the results were rejected
on sight, repeatedly. The mask constrains *where* it paints, never *what*.

## 7e.2 The pipeline

Five steps, all automatic, `align.py`:

| # | Step | Anchor | Why |
|---|---|---|---|
| 1 | **Split** | — | background, head, neck/shirt, features removed; what remains is the part |
| 2 | **Z-flag** | path order in the source | which side of the head the part belongs on |
| 3 | **Scale** | head's **widest row** | size |
| 4 | **Position** | **eye line + eye mid-x** | where the part sits on the face |
| 5 | **Seat** | scalp contact | the one scalar the face cannot supply |

Then `verify.py` passes or fails it.

## 7e.3 Registration: eyes for position, head width for scale

This is **not** the fitting that failed five times. Fitting hair to a head is
ill-posed — a wig and a skull share no landmark, which is why every attempt in
§7d.2 failed differently. Eyes to eyes is the *same feature on both sides*, and
two points give a similarity transform with nothing left to guess.

⚠⚠ **Scale must come from head width, NOT eye separation.** Measured across one
batch:

| | spread | as a scale factor |
|---|---|---|
| eye separation | 369.9 – 439.8 (**19%**) | 0.848 – 1.008 |
| head widest row | 964 – 1008 (**under 5%**) | 0.956 – 1.000 |

The generator moves the eyes around *inside* a head whose size barely varies.
Scaling by eye separation shrinks a part by up to 15%, its lower edge stops short
of the temples, and the result is a symmetric pair of gaps at u ≈ ±0.5 to ±0.9.
Ryan caught these twice; both times the cause was this.

⚠ **Not "width at the eye line" either** — that conflates head size with where the
eyes sit. The afro and curly heads measured 840 and 820 against a 964 base purely
because their eyes are higher, where any skull is narrower. The **widest row** is a
property of the head alone.

⚠ **And not the head path's bbox**, which is contaminated wherever the head path
has merged with hair or the neck (one read 1009 against a true 972).

## 7e.4 Seating — and why the aggregation IS the algorithm

Eye registration cannot fix **skull height above the eyes**, which varies 0.39–2.16
normalised and is *unobservable* once hair covers it. The head path's top edge is
not the crown: where hair merges into it, it is the hair's top (ratio 2.16); where
a fringe cuts it, it is the forehead (0.39). That information is not in the file.

So the last scalar is solved geometrically: **slide the part down until it touches
the scalp, only ever downward.** A gap column is one where the part's lowest pixel
sits above the head's topmost pixel — background showing through.

⚠⚠ **A bounding box cannot do this.** Every part's bbox already overlapped the
crown, braids included, because the skull curves away from its own bbox top — at
the braids' columns the scalp is ~90px lower than `y0`. **Contact is per-column or
it is nothing.** This is the same error as the five attempts in §7d.2: comparing
quantities measured at different places on the head.

The aggregation took three tries, and each failure is instructive:

| Rule | Result |
|---|---|
| `min` of the gap | "if any column touches, do nothing" — returned 0.0 for all seven parts |
| `max` over all columns | driven by the extreme sides, where hair is *meant* to hang free — sinks everything |
| median > 0 as a gate | hid real gaps: topknot's median was −32 while 83 columns still showed background |
| **any positive gap, close the worst, capped** | ✅ |

⚠ **A narrow band hides gaps.** The first working version measured the central 70%
— which excluded exactly the columns where topknot's gaps were. It is 0.96 now.

⚠ **The cap is tuned to seven samples.** 20% of head width, chosen so buzzcut's
required 149.6 units fits while braids' 244 gets clipped. More parts may move it.
It exists because a part that is too *narrow* for the skull reports a huge temple
gap that sliding cannot honestly fix — sinking it into the forehead trades one
visible fault for a worse one.

## 7e.5 Head placement is consistent across runs — measured, not assumed

Two independent runs a day apart, same base prompt, same `style_id`, only the
hairstyle suffix changed:

| | n | centre max \|Δ\| | centre sd | width max \|Δ\| |
|---|---|---|---|---|
| first run | 5 | 1.1 px | 0.49 px | 1.88% |
| fresh run | 8 | 0.5 px | 0.36 px | 4.71% |
| **combined** | **13** | **1.1 px** | **0.44 px** | 12 of 13 under 1.9% |

**1.1 pixels of horizontal drift on a 2048 canvas.** The style pins the composition;
it was not one lucky run.

⚠ **This was also the measurement that misled.** Horizontal was never the problem.
Eye lines run 743.7–839.3 — a **95px vertical spread** — and I reported the
horizontal agreement as proof of consistency. *Measure the axis the failure is on.*

## 7e.6 Yield — budget for degenerate generations

**2 of 15 whole-avatar generations were structurally broken (~13%).** Not
low-quality — structurally absent:

- `X7-moustache` — **no head path at all.** Skin is two half-canvas rectangles with
  facial features floating on top.
- `Z2-longstraight` — **no hair path at all.** A dark full-canvas rectangle with a
  pale shape painted over it; the "hair" is negative space.

Both are now detected and rejected rather than silently producing a face-covering
slab. ⚠ **There can be more than one full-canvas path** — taking only the largest as
background leaves the second to be classified as hair.

## 7e.7 The detectors, and the traps in each

Everything is found by **geometry and nesting, never by colour** (§7c.3 holds).

**Head** (`findhead.py`) — width 42–54% of canvas, centre within 120px of the axis,
top edge in the upper half, *and* its fill reappears on a narrow path low in the
canvas (the neck) **or** the path itself reaches past 75% (head and neck drawn as
one). ⚠ Area rank alone picks half-canvas background rectangles. ⚠ Width and centre
alone pick a black hair mass 1094 wide and dead-centred.

**Eyes** (`eyeline.py`) — a mirrored pair of nested shapes, separation 30–55% of head
width, tie-broken on **closeness to the axis**. ⚠ Nesting direction is not fixed:
`X3` is dark-almond → white → highlight; `X1` is *skin*-almond → dark pupil. ⚠ Two
cornrow braids passed every test at 645px apart. ⚠ Tie-breaking on *width* picks the
eye whites — crescents offset to one side, reading 37px off-centre.

**Eyebrows** — a mirrored pair, wide and flat, small, high on the face. ⚠ They carry
the hair's **exact** fill, so colour cannot separate them from hair.

**Vertical bands are unreliable** — the head's bottom edge is the chin when the head
is its own path (1415) and the *neck's* bottom when they are merged (1620), a 200px
swing that rejected real eyes in two files.

## 7e.8 The result

Seven styles from one fresh batch, on one base:

| part | scale | dx | dy | seat | gap columns |
|---|---|---|---|---|---|
| afro | 0.9918 | +2.5 | +95.7 | 0 | **0** |
| buzzcut | 0.9959 | +0.1 | +27.2 | 149.6 | **0** |
| curly | 0.9959 | −4.0 | +91.3 | 0 | **0** |
| bob | 1.0000 | −6.0 | −6.1 | 0 | **0** |
| topknot | 0.9563 | +38.8 | +57.7 | 65.6 | **0** |
| braids | 0.9979 | −3.0 | +33.9 | 192.6 | 16 (max 62px) |
| pixie | 0.9979 | −4.3 | +54.8 | 75.6 | 6 (max 29px) |

**5 of 7 sit flush. Two residuals, both real and both recorded:**

- **braids** — the band is genuinely too **narrow** for this skull at that height.
  Seating fixes floating, not proportion. Nothing corrects it but redrawing.
- **pixie** — 6 columns at u ±1.0, the outermost silhouette edge. A sliver where the
  hair meets the head's widest point.

⚠ **The numbers are baked into the path data, never written as a `<g transform>`.**
`react-native-svg` ignores transform strings: that asset renders perfect in a
browser and misplaced on the phone.

**Cost: ~$0.08 per part.** No designer. The whole investigation — 22 generations
including every failed inpainting route — came to about $1.80.

## 7e.9 ⭐ The process change that matters

§7d.5 recorded the failure: *verifying that code ran and reporting it as evidence
the output was right.* The fix is not "look harder", because looking is what kept
failing. **The fix is that the acceptance criterion is now code.**

`verify.py` counts columns where a part's lowest pixel sits above the head's
topmost pixel. Zero is the pass condition. Ryan had to be the gap detector three
times; he should not be the fourth.

⚠ Twice during this work a **number disagreed with what I saw, and the number was
measuring the wrong thing** — "267k pixels changed" was the background being
repainted, and "silhouette IoU 0.99" was computed on the region that by
construction cannot change. **A metric that cannot see the failure is worse than no
metric**, because it reads as confirmation. Check what a green number is actually
ranging over before believing it.


---

# Part 7f — The base of an existing style, two ways

Asked of `avatar-styles-anchored/1-capsule-square.svg`: keep every other shape,
remove hair, eyes, brows and mouth, keep nose and ears.

## 7f.1 The decomposition — free, exact, and already in the file

⭐ **§7e held on this art too.** 13 paths in, 5 out: canvas, skin mass, the two
blue paths, nose. `base ∪ parts` reassembles the source **byte-for-byte**, so the
cut is provably lossless. `scripts/split-avatar-base.mjs`, guarded on fill and
bounding box so a regenerated source fails loudly instead of cutting the wrong
shape. Output in `assets/avatar-base-capsule/`.

⚠⚠ **Recraft was NOT used, and could not have been.** The brief's own words —
"keep all the other shapes the same" — are the one thing `imageToImage` cannot do
(99d3d08: at strength 0.15 nothing changes, by 0.30 the face disintegrates;
preservation and edit are the same dial). Deletion preserves exactly. **When the
ask is removal, the tool is a text editor, not a generator.**

🔴 **There were no ears to keep.** The style never drew them — the hair covered
the temples, so the skull under it has dead-straight sides. Not a defect in the
cut; a fact about the source. Nose kept: it is a real path.

⭐ **The head silhouette is the negative space of the two blue paths** (3dc92ff).
They are background and mask at once. Good: the identity recolour is a two-fill
swap and the mask can never mismatch the backdrop — the disc problem solved
differently to 2cf6ff2's chroma key. Bad: the figure has no independent
silhouette and cannot be lifted off its disc.

⚠ 21KB per file, of which **3.7KB is drawing** — the rest is the C2PA provenance
block. Keep it in the working assets, strip it at ship time.

## 7f.2 The generation — Ryan's call, and what ten of them measured

Ryan chose a fresh generation with ears over the earless cut, told that §7c.1
means a new skull rather than this one with ears added.
`scripts/gen-avatar-base-eared.mjs`, 10 generations + 1 style, **505 API units
($0.51)**, balance 1,408 → 903.

⚠ **The source's `style_id` was lost.** `gen-avatar-styles.mjs` mints a fresh
style on every `--anchored` run and only ever printed the id. Rebuilt from the
same three approved bases → `452cd2a5-212d-4703-a912-abf2104c8790`, and **written
to `manifest.json` this time**. A style costs 5 units; losing the id costs the
whole look.

⭐ **The construction came back identical to the source** — 5 paths, canvas +
skin mass + two blue mask halves + nose, on all three clean results. So these
recolour and decompose exactly as §7f.1's base does.

🔴 **Negation does not bind. 2 of 10 drew a mouth** — and the second one did it
*after* "Absolutely no mouth line and no mouth mark of any kind" was added. The
reinforcement did not help. Budget for negated features failing at roughly the
§7e.6 degenerate rate and filter on output; do not expect a stronger prompt to fix
it.

🔴 **The square jaw never arrived, in any of the ten.** "Heavy wide square jaw,
straight jawline, broad flat chin" produced capsules and eggs every time. §7c.1 on
a third axis, now measured rather than inferred.

⚠ **The shirt-colour omission from 2cf6ff2 was repeated, by me.** With no colour
named the top came back orange, yellow, and once in the disc's own blue. Naming it
white fixed those and produced a new failure — one top came back as bare skin.
**Every unnamed attribute is a free variable, and the fix for one is not free.**


## 7f.3 ⭐ The pick, and what the chroma key cost

Ryan picked **`base-square-05`**, then: drop the blue circle, flood the frame
green. Pure fill swap — `scripts/chroma-base.mjs`, canvas + both ground halves →
`rgb(0,170,102)`, the green base3's own generation returned, reused so the key is
one value across every base we hold.

⚠⚠ **The shoulders were the background, not a shirt.** Proved by repainting the
canvas magenta — the white "top" went magenta with it. This style draws **no shirt
path at all**; the top is canvas showing through a gap in the mask, in the
1-capsule-square source too. So flooding the frame green floods the shirt, and the
delivered base ends at the neck. 2cf6ff2 said a chroma key only works if it is the
one colour nothing else shares; here the background and the shirt *are the same
shape*, so no naming discipline could have saved it.

⭐ **Arguably the right shape anyway.** §5.4 makes the kit a cosmetic layer, and a
base ending at the neck lets the kit be a part instead of being baked into the
head. The alternative — a base with shoulders on green — needs the shirt named as
its own colour at generation time, which is exactly what base3's prompt did and
ours did not.

⚠ **A 1px skin-coloured ghost traces the old disc edge.** The canvas and the two
ground halves now share a fill but are still separate shapes, and the skin disc
sits under the seam between them: **0.51% of a 1024px render**, one pixel wide.
Invisible at 24–64px, faintly visible on a share card. It cannot be fixed by
paint — stroking the ground paths to close it would eat 1px off the head
silhouette, because that silhouette IS their inner edge. The clean fix is a
generation with the green baked in as one background shape, which is what base3
has and this does not.

⭐ **Key by swapping the fill, not by raster keying.** These are vectors: replacing
`rgb(0,170,102)` is exact and free, and sidesteps the halo that exact-colour raster
keying would leave on that seam.


## 7f.4 ⭐⭐ You cannot ask for a shorter skull. You can sample for one.

"I need the head a bit shorter to fit hair asset there." Measured before changing
anything, and **the premise inverted**: skull height ÷ skull width, across all ten
generations and the source, with skull width taken as the **modal** row width so
the ears cannot inflate it the way the widest row does.

| | H/W |
|---|---|
| `v2-01` — shortest, but it drew a mouth | 1.134 |
| **`05` — the pick** | **1.147** |
| the source skull Ryan approved | 1.192 |
| `02` — tallest | 1.465 |

**05 is already the second-shortest of the ten, and already shorter than the head
he liked.** Shortening it further would take it past the approved proportion.

⭐⭐ **But the spread is the finding: 1.134 → 1.465, a 29% range, on a prompt that
never changed.** §7c.1 says the generator will not vary skull structure *on
request* — measured three times. It does not say the distribution is narrow. So
the lever for structure is **selection, not instruction**: generate more and keep
the tail you want. This is the first route to a structural target that has not
dead-ended.

⚠ **What actually read as "too tall" was the fit, not the skull.** The hair cap was
scaled 1.064 by head width (§7e.3) and under-covered — skin peeked either side of
the crown, and a bald crown reads taller than the same skull with hair on it. At
**scale ≈1.18 the cap covers and the head reads correctly**, with no change to the
base.

⭐ §7b.6's ban on scaling hair UP does not apply to this art. That ban exists
because a hairstyle carries the face opening inside its own geometry, so the hole
grows with the mass. **This hair is a slab with no opening** (6cc49e4) — it is
drawn over the skull and cropped by the mask — so scaling the cap simply lowers
the hairline and widens coverage.

**Which is §7c.6 working as designed**: the head is the anchor, and the part
carries a fit record. Fitting the head to the part is backwards, and it is
backwards *now* for free and expensively later — nothing is fitted to this base
yet, so today is the cheapest moment it will ever be to change it.


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
8. **Earned items are never purchasable** (E3), **never randomised** (E2), and **never unlocked by app
   behaviour** (E1). §5.3.

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
| **1.5** | ✅ **The asset harness — BUILT 2026-09-14.** Live colour, 32px, every part on every base. It proved the recolour and role-tagging machinery, which all still stands. | — |
| **1.6** | ✅ **The decomposition pipeline — BUILT 2026-09-14, no longer a blocker.** Generate whole avatars, discard the head, keep the part: split → z-flag → eye-register → head-width scale → seat, with `verify.py` as the acceptance test. 5 of 7 parts flush, ~$0.08 each, no designer. **Part 7e.** | — |
| **2** | **The parts model** — config → scene graph → three renderers. Bust rig only. Static, no motion. Ships to the existing `<Avatar>` call sites. | Phase 1 live |
| **3** | **The editor** — the customisation UI, mobile-first. Free catalogue only, no purchases. **Needs its own design pass — see below.** | Phase 2 rendering correctly on all six surfaces |
| **4** | **Figure rig** — full body (Part 7b §7b.5), launching on the **banter auto-share-card**, then the pool card, then the profile. States per §6.2, capped by Q5. | §8.4's edit signal |
| **5** | **The Showdown walkout** — the figure replaces the silhouette layer in `MOTION_SPEC.md`. | Phase 4 + whatever the corridor decision lands on |
| **6** | **The shop** — colourways and accessories, real money, no currency, no packs, no countdowns. | The commercial gate in `MONETIZATION.md` |

## ⭐ The figure rig launches on the banter share-card *(settled 2026-09-14)*

**Order: banter auto-share-card → pool card → profile → Showdown walkout.**

| Candidate | Why not first |
|---|---|
| **Showdown walkout** | 🔴 The most fragile dependency chain in the codebase: the walkout needs the corridor, the corridor needs Skia, **Skia is declared in `mobile/package.json` and not installed**, that needs an EAS build, and EAS builds cannot be verified on this machine. Not the chain to hang the first proof on. |
| **Profile** | Safe, and nobody looks at it. |
| ⭐ **Banter auto-share-card** | **~67% of all banter traffic** (`memory/project_backlog_banter_engagement.md`). **Server-rendered**, so it is a pure Satori target — no native code, no OTA problem, no animation at all. And it is **social**, which is the only place a character earns anything. |

⭐ **Q5 strengthens this.** With shared boards fully still, the surfaces that *do* express carry the
whole feature. The share card is the largest of those and the cheapest to build. Showdown stays the
showcase — it just must not be the thing that has to prove the system works.

⚠ **Phases 2 and 3 are the ones that decide whether this works.** Everything after is amplification.
If the editor ships and nobody edits, stop — that is the honest outcome, and it costs weeks instead
of months.

## ⭐ Phase 1.5 — the asset harness (the immediate next step)

Agreed 2026-09-14. **Animation is explicitly not in scope yet**; this is about proving the
static system holds together.

1. **A small sample of each asset class** — a few eye shapes, brows, mouths, hair, facial
   hair, accessories — plus colour selectors for skin, hair, eyes and kit.
2. **A standalone HTML file** Ryan can open and drive directly, to check shapes and hair
   match the bases and look right.

⚠ **It must test the FIT, not just the look.** The thing that silently breaks is a part
sitting wrong on one of the four bases, so every asset has to be shown **on all four faces
at once** (§7c.6), with the 32px rendering beside it (§5.2 — the surface that actually
decides legibility). A harness that only shows one face at one size would pass everything
that matters.

⭐ Precedent: `memory/project_verify_drag_pickers.md` — *never verify in a real pool, use a
throwaway harness route*. Same pattern, same reason.

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
6. ~~**§7.2 — Rive.**~~ ✅ **2026-09-14 — deferred, walkout-only.** Q5's still boards removed its one
   advantage (no ticker to idle against), and Part 7b means the parts model is what we already have.
7. ~~**§5.4 — kit naming.**~~ ✅ **2026-09-14 — kits have NO names.** A swatch you pick, like a skin
   tone. Dissolves the association risk, the UGC surface, the lint check and the ToS line. ⚠ Changes
   the *"users name their own"* clause in `MONETIZATION.md`.
8. ~~**Scope check — the figure rig's launch surface.**~~ ✅ **2026-09-14 — the banter auto-share-card
   goes first.** Then pool card → profile → Showdown walkout. See Part 9.
9. 🔴 **ONE base, or four?** *(opened 2026-09-14 by Ryan — Duolingo ships a single base.)*
   **Recommendation: drop to one for v1.** It quarters the library, quarters the alignment residuals,
   and is what Part 7e's pipeline already does — every part today is registered onto a single head.
   ⚠ **This overturns decision 7c.1**, where four bases were chosen deliberately so *"the character can
   look like the user"* (Q3). What is lost is one identity axis; what is kept is skin, hair, eyes,
   brows, nose, ears and kit. ⭐ **It is reversible**: adding base #2 later is a script run plus a
   `verify.py` review, not a re-authoring — which is exactly what was *not* true this morning.
   **Not actioned. Ryan's call.**

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
