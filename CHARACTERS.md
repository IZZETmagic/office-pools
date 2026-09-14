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
| **Capsule** | Rect where `r = min(w,h) / 2`. | Torso, arms, legs, hair mass, boots |
| **Half-capsule** | A capsule cut on its long axis. | Hair fringe, collar, sock top, shorts hem |
| **Quarter-capsule** | A capsule cut on both axes. | Ear, cuff, eyebrow, shoe toe |
| **Lens** | Intersection of two discs. | Smile, closed eye, badge |

**Forbidden:** any corner with a radius under `radii.xs` (6 at 1× scale). No strokes. No gradients
*inside* a character — gradients belong to the ground behind it (§5.5). No drop shadows on parts.

## 4.3 Proportion

**The full figure is 3 heads tall.** One head, one torso-and-arms, one legs-and-boots.

- 3.0 is the classic mascot proportion and the one Duolingo's humans sit near. Below 2.5 reads as a
  toy; above 4 the head stops dominating and the bust crop (§5.2) stops working.
- The head is the tallest single element in every rendering, at every size. At 24px in a leaderboard
  the head is ~16px and everything else is inference.

Pin it with a test the way `modeIdentity.test.ts` pins hue separation: a `characterProportion.test.ts`
asserting head height ÷ figure height stays in `[0.31, 0.36]` for every combination of parts. A parts
catalogue that grows over two years *will* drift otherwise.

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

| Rig | Where it renders | Composition |
|---|---|---|
| **Bust** | Leaderboards, pool cards, banter rows, member lists, emails, OG cards | Ground disc + head + a sliver of shoulder, cropped to a circle |
| **Figure** | Profile, Showdown walkout, duel card, share card, level-up, trophy case | Full 3-head figure on a ground |

**The head is byte-identical between them.** Same parts, same coordinates, different viewBox and
crop. This is Duolingo's nested-artboard idea expressed as geometry instead of as tooling: head and
body move independently because they are separately positioned, not because a tool nested them.

⚠ **This is the requirement Duolingo's avatar system fails.** Theirs is bust-only — *"big, fat
head[s]"* — which is why it can never appear in a scene. Showdown is a scene. If the parts library
cannot compose a body, Showdown gets generic silhouettes forever and the whole feature loses its best
surface.

## 5.3 The parts catalogue — v1 target

A1 and A2 say the first version must let someone build something recognisably them. That sets a
floor, and the floor is higher than Duolingo's eight categories.

| Slot | v1 options | Free | Notes |
|---|---|---|---|
| Head shape | 6 | all | round, oval, square-capsule, wide, narrow, long |
| Skin tone | 12 | all | curated ramp, §4.5 |
| Hair style | 24 | all | must include coily, locs, braids, wraps, bald, buzz, and long-under-headwear |
| Hair colour | 14 | all | includes 4 unnatural |
| Eyes | 4 shapes × 5 colours | all | shape is expression-driven at runtime (§4.4) |
| Brows | 4 | all | |
| Facial hair | 10 | all | incl. none |
| Eyewear | 8 | all | incl. none |
| Headwear | 12 | 6 free | caps, beanies, wraps, headband, none |
| Build | 4 | all | |
| **Kit colourway** | 20 | 8 free | §5.4 — the cosmetics surface |
| Boots | 6 | 3 free | |
| Accessory | 8 | 2 free | scarf, gloves, captain's armband, headphones |

Combinations at v1: on the order of 10⁹ before colourways. The number is not the point — **coverage
is**. The test for v1 is not "how many combinations" but: *can each of ten real people from the
existing user base make something they'd put next to their name?* Run it as an actual exercise with
actual people before any art is commissioned.

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

> **Rule: your character expresses a result on *your* surfaces and on *rivalry* surfaces. The shared
> leaderboard shows every character in `idle`.**

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

## 8.4 🔴 The recorded adoption gate has lost its instrument

`MONETIZATION.md` gates the shop on **>40% photo-upload adoption within 3 months of Avatars v1**.
Avatars v1 has not shipped. If characters ship *instead of* photo upload, the gate cannot be
measured — and §1.6/A1 says characters must not replace photos anyway.

**Proposed resolution, needs Ryan's call (§10 Q1):**

- Ship **Avatars v1 (photo + initials, ~3–5 days) unchanged**. It is the cheapest possible read on
  "do people care what they look like here", and A1 requires it to exist permanently regardless.
- Read the 40% gate against **"set a non-default identity"** — photo *or* character — rather than
  photo specifically.
- Add a second, better signal before any money is involved: **% of character users who changed ≥1
  part from the default within 30 days.** Adoption says they tried it; editing says it matters to
  them. Only the second predicts a purchase.

---

# Part 9 — Phasing

Deliberately not dated. Each phase is gated on the previous one's signal, not on a calendar.

| Phase | What | Gate to start |
|---|---|---|
| **0 — Now → Q1 2027** | **This document.** Grammar, catalogue, states, and *paper* design. No code. Commission or produce the v1 parts catalogue as art. Run the ten-real-people coverage test (§5.3). | — |
| **1** | **Avatars v1** — photo upload + initials. Unchanged from its existing scoping. | — |
| **2** | **The parts model** — config → scene graph → three renderers. Bust rig only. Static, no motion. Ships to the existing `<Avatar>` call sites. | Phase 1 live |
| **3** | **The editor** — the customisation UI, mobile-first. Free catalogue only, no purchases. | Phase 2 rendering correctly on all six surfaces |
| **4** | **Figure rig + states** — full body, the eight states, idle, share cards, the banter auto-card. | §8.4's edit signal |
| **5** | **The Showdown walkout** — the figure replaces the silhouette layer in `MOTION_SPEC.md`. | Phase 4 + whatever the corridor decision lands on |
| **6** | **The shop** — colourways and accessories, real money, no currency, no packs, no countdowns. | The commercial gate in `MONETIZATION.md` |

⚠ **Phases 2 and 3 are the ones that decide whether this works.** Everything after is amplification.
If the editor ships and nobody edits, stop — that is the honest outcome, and it costs weeks instead
of months.

---

# Part 10 — Open questions for Ryan

Numbered so they can be answered individually.

1. **§8.4 — the adoption gate.** Does the 40% gate move to "set a non-default identity", and is the
   30-day edit rate accepted as the real pre-purchase signal?
2. **§4.3 — 3 heads tall.** Confirm the proportion before any art is commissioned; it is expensive to
   change afterwards.
3. **§5.3 — catalogue size.** Is ~120 v1 assets the right order of magnitude, given A2 says shallow
   is worse than nothing? This is the main cost driver.
4. **Art production.** In-house, commissioned, or generated-then-hand-corrected? A2 and A4 both push
   toward a real illustrator for the base set. Duolingo's own answer was a character library that
   contractors reference — the library is the deliverable, not the drawings.
5. **§6.3 — celebration on shared boards.** Is "idle on the leaderboard, expressive on your own
   surfaces and in duels" the right line, or too conservative?
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
