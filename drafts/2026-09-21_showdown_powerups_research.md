# Showdown power-ups — research, options and placement

**Status:** research and proposal. **Nothing built, nothing decided.**
**Date:** 2026-09-21 · **Asked by:** Ryan — *"come up with 5–10 power-up options for Showdown; things
that don't automatically win, that are still a risk"*, then *"they should renew/expire at the halfway
point"* and *"see how these visually fit on the Duel tab."*

> ⚠ **This reopens a settled decision.** `SPORTPOOL_PROGRAMME.md` Decision 9 records
> *"there are no power-ups"*. §1 below argues for an **amendment, not a reversal**, and states the
> case against itself. If that argument isn't bought, the rest of this document falls.

---

## Contents

1. [The recorded position, and the reopening argument](#1-the-recorded-position-and-the-reopening-argument)
2. [What FPL chips actually are](#2-what-fpl-chips-actually-are--the-grammar-worth-stealing)
3. [Six structural facts about Showdown](#3-six-structural-facts-about-showdown-that-constrain-every-option)
4. [The options](#4-the-options)
5. [Recommendation, and the five gates](#5-recommendation--three-chips-one-of-each-archetype)
6. [The halfway rule](#6-the-halfway-rule--chips-renew-and-expire-at-the-midpoint)
7. [Where they land on the Duel tab](#7-where-they-land-on-the-duel-tab)
8. [Implementation shape](#8-implementation-shape)
9. [Open calls for Ryan](#9-open-calls-for-ryan)
10. [Prerequisites](#10-prerequisites-before-any-of-this-is-built)
11. [Appendix — a live disclosure bug found on the way](#appendix--a-live-disclosure-bug-found-on-the-way)

---

## 1. The recorded position, and the reopening argument

`SPORTPOOL_PROGRAMME.md` → *Modes, scoring and "power-ups"* and Decision 9 say:

> **There is no power-ups document, because there are no power-ups.**
> ❌ Rejected: **the banker** (nominate one fixture to count double). Killed on the **disclosure
> gate** — it is pools jargon that has to be taught before a first pick, which taxes exactly the
> people Results depth exists to include.

`drafts/2026-08-24_league_pools_full_plan.md` records **Double Down** dropped on the same precedent —
but its words are *"Ryan confirmed leaving it out of **v1**"*, which is a scope call rather than a
permanent refusal.

**The argument, in one line:** the banker's fault was **where it lived**, not that it existed.

The banker sat on the **fixture list**, so every member — including the casual one Results depth
exists for — had to understand it *before their first pick*. A Showdown chip declared on the
**Duel tab during the scouting phase** is invisible to anybody who ignores it: you can play a whole
season, pick every week, win the pool, and never once be shown a decision you did not ask for.

§7 turns that from a claim into a layout. It is the whole proposal.

⚠ Also true, and worth saying plainly: Decision 9's stated worry was that duels would be **too flat**
(too many draws), and its recorded fallback was *Match of the Week worth double, chosen by us*. Since
then **migration 121 raised a duel to 500/250/0** and folded duel points into the season total. The
flatness Decision 9 was hedging against is a **different problem** from the one these chips address.

---

## 2. What FPL chips actually are — the grammar worth stealing

Fantasy Premier League's chips (Wildcard, Free Hit, Bench Boost, Triple Captain) share four
properties, and it is the combination that works rather than any one of them:

1. **They are a timing decision, not a skill decision.** Everybody gets the same chip. The only
   question is *which week*.
2. **They are scarce** — one or two a season. Scarcity is what creates the agony.
3. **Their payoff is fully determined by football.** FPL adds no dice. Triple Captain on a player who
   blanks pays nothing, and that is the entire risk model.
4. **They can visibly backfire**, and backfiring is the story people tell each other.

⭐ **The finding that matters for gate 5:** a chip does **not** have to add randomness of our own.
FPL's chips are deterministic functions of real results. The uncertainty is *"I spent a scarce thing
on a week that turned out badly"* — pure opportunity cost under sporting uncertainty. That is
inherited variance, and it passes Decision 8's fifth gate cleanly.

⚠ **What not to steal:** Wildcard and Free Hit are *roster* chips. They only make sense in a game
with a squad, transfers and accumulated state. SportPool has none of that by choice — the vision
explicitly refuses fantasy depth. Any proposal that starts to smell like a transfer market is wrong
for this product.

---

## 3. Six structural facts about Showdown that constrain every option

Read these before judging the options — three of the obvious ideas die on them.

### F1 — A miss pays 0, so a multiplier can never hurt you
Fixtures pay 100 / 75 / 50 / 0 at Scores depth and 100 / 0 at Results (migration 066). Doubling a
fixture you got wrong is still 0. So *any* "×2 this match" chip is **free upside at the moment it is
played**, and its only cost is the scarcity of the chip. That is enough — it is exactly Triple
Captain — but it means **scarcity carries the entire risk**. A chip with real teeth has to put
something *already earned* at risk, and in Showdown the only earned thing is the 250 draw cushion.

### F2 — Margin does not carry ⭐ *the biggest lever in the mode*
`lib/league/duelPoints.ts`: win 500, tie 250, bye 250, loss 0. Beating someone by one point pays the
same as beating them by nine hundred.

> **Consequence: a chip that changes what a *fixture* is worth is weak here. A chip that changes what
> the *duel* is worth is strong.** Showdown wants **stake chips, not points chips.**

Almost every fantasy-game chip is a points chip. The interesting design space here is the one FPL
does not have.

### F3 — Both depths cap at 100 a fixture
So anything expressed as a multiple of a fixture or of a duel is depth-agnostic and keeps Showdown
"a layer, not a peer" (Decision 9). Anything expressed in absolute points would quietly break that.

### F4 — The result classifier is `>=`, and SQL owns every number
`duelResult()` (`lib/league/duelPoints.ts:50`) reads `>= 500 → won`, `>= 250 → tied` — so a doubled
win of 1,000 **already classifies correctly with no front-end change**. The live scoring body is
`league_score_duels` in **migration 134** (lineage 084 → 085 → 100 → 121 → 134);
`lib/league/duelPoints.ts` is a read-only mirror and `duelPoints.guard.test.ts` reads the migration
as text and fails on drift.

⚠ `DUEL_BYE === DUEL_TIE === 250` **by design**, and a bye is detected structurally
(`entry_b IS NULL`, always on side B). Nothing may tell them apart by value — and **a chip declared
on a week that turns out to be your bye must be refused or returned.**

### F5 — Phase 3 (scouting) has no decision in it
The six phases are `sealed · revealable · scouting · live · recap · sealed`. We built a whole
scouting system — dossiers, form, venue splits, lifetime tendencies, head-to-head — and it currently
informs *nothing but your picks*, which you would make anyway. A chip declared in the scouting window
is the one place a power-up can land that **gives scouting a consequence** and **never appears on the
picking surface**.

### F6 — No tie-break inside a duel, and no consumable anywhere in the codebase
Equal accuracy is 250/250, full stop — the concept note's *lifetime head-to-head* tie-break is
recorded as **owed, not approximated** (084), and `headToHead()` is display-only. Separately:
`pool_entries` has had **exactly three column additions in its entire history** (retirement,
`last_recap_seen_at`, `last_reveal_seen_duel`). There is no inventory table, no `uses_remaining`, no
grant/spend path. Chips are genuinely new infrastructure — see §8 for the cheapest shape.

---

## 4. The options

Each one: the mechanic · the one-sentence tooltip (the disclosure gate, applied as written) · where
the risk comes from · the verdict.

### 4.1 Double Stakes — *the attacking chip* ⭐ recommended
Before the matchweek locks, declare the duel double stakes. **Win = 1,000. Draw or lose = 0.** You
surrender the 250 you would have banked for a draw. Your opponent sees it the moment you declare.

> *"Call it: this duel's worth double if you win, and nothing if you don't."*

**The risk** is the cleanest in the list and entirely football's: you give up a guaranteed quarter of
a perfect week for a coin you do not get to weight. Playing it against a strong picker is brave;
playing it against a weak one wastes a chip on a week you win anyway. Exploits **F2** exactly.

### 4.2 The Gauntlet — *Double Stakes, answered* ⭐ recommended as a modifier on 4.1
Same as above, but the opponent may **accept** (both sides at double stakes) or **decline** (the duel
stays normal and only the caller is at risk). Declining costs no points.

> *"They've called it. Accept and it's worth double both ways."*

**The risk** adds a second human decision on top of the football one, which is where the banter
lives. ⚠ The decline must cost **zero points and carry zero UI shade** — no "chickened out" copy, no
badge, nothing. The moment declining looks bad, this is social pressure and fails gate 2.

### 4.3 Take the Room — *the defensive chip* ⭐ recommended
Declare before lock that this week your accuracy is **the pool's median accuracy** rather than your
own picks. Your opponent still plays normally and still has to beat that number.

> *"Away this week? Take the pool's average score instead of picking. Once a season."*

**The risk:** you commit before you know anything — you may be throwing away the week you would have
nailed, and the median loses plenty of duels on its own. Answers the real churn problem (life gets in
the way, you eat a zero *and* a defeat) **without robbing your opponent of a contest**, which is the
flaw in every "call the duel off" variant tried.
⚠ Counter-metric: it removes a week of picking. Pair it with a "did they come back?" measure.

### 4.4 The Call-Out — *the reading-your-opponent chip* ⭐ recommended
Nominate one fixture before lock. When the team sheets reveal at lock, **if you and your opponent
picked that fixture differently, it is worth double to whoever got it right.** If you both picked the
same thing, the chip does nothing at all.

> *"Name a match. If you two disagreed on it, it's worth double to whoever's right."*

**The risk** is two-layered and both layers are inherited: it can **fizzle completely** (you agreed),
and it can **pay your opponent** (you disagreed and they were right). The only option that makes the
scouting system load-bearing (F5), and the only one that turns the team-sheet reveal into a moment.

⚠ It is *not* the banker: nominated on the Duel tab about a **person**, not on the fixture list about
a **match**, and ignoring it costs a member nothing.

### 4.5 The Handshake — *the draw offer* 🟡
Offer your opponent a 250/250 draw before lock. They can accept or refuse.

> *"Offer a draw before Friday. They can say no."*

**The risk:** you give up 250 of upside, and you have just told them you are worried — which they get
to use, and to talk about.
⚠ **Collusion vector.** Two members could farm mutual 250s every week. Cap it hard, make every offer
and refusal visible to the whole pool, and it is self-policing. Cheap and very much "bring people
together", but it is the one option where the abuse case is obvious.

### 4.6 The Upset — *back the underdog* 🟡 flagged
Nominate one fixture where you back the club **below the other in the real league table** to win.
Double if you are right.

> *"Back the team below them in the table to win, and that match counts double."*

**The risk** is real (upsets run roughly one in four) and "underdog" is inherited from the actual
standings, so gate 5 is clean.
🔴 **But it is odds-shaped**, and the vision's refusal list names *bettors / odds chasers* first. It
teaches members to reason about implied probability rather than about football, and it is a points
chip in a mode that wants stake chips (F2). Included for completeness; **I would not build it.**

### 4.7 The Return Fixture — *no input at all* ⭐ recommended as a free layer
Whoever beat you, the **rematch is automatically worth double, both ways**. Nothing to declare,
nothing to learn, no chip to spend.

> *"They beat you in October. The rematch is worth double."*

Strictly a rhythm feature rather than a power-up — the risk is symmetric and imposed rather than
chosen — but it is the closest legitimate descendant of Decision 9's own blessed fallback, it has
**zero teaching cost**, and at typical pool size it fires often: 7.6 members means a round-robin cycle
is ~7 matchweeks, so a season runs about five cycles and you meet everyone five times. **Revenge is
frequent, not rare.**

### 4.8 Match of the Week — *the control*
We pick one fixture a week; it counts double for everyone.

> *"This week's big game counts double, for everyone."*

No decision, no risk, no chip. Already the programme's recorded fallback, and here as the baseline to
judge the others against: it costs nothing to explain and adds nothing to decide.

### 4.9 The Stand-In — *not a chip; a prerequisite*
A standing rule (e.g. *repeat my last week* / *home wins*) that fires if you miss a deadline, instead
of a zero.

Almost no risk, so it is not what was asked for — but **it is a prerequisite for 4.1, 4.2 and 4.4
being fair.** Losing a double-stakes duel because you were on a plane is a bad feeling *we*
manufactured, and that is exactly what the purpose clause forbids.

### 4.10 The Substitution — 🔴 reject, named so it stays closed
Change one pick after Saturday's early kick-offs.

Directly contradicts **Decision 10** (*"the product enforces information, the admin controls
timing"*) — it hands you a pick made with information the rest of the pool did not have. It would
also need a deliberate hole in migration 101's matchweek lock and in
`trg_enforce_prediction_before_kickoff`, which is a load-bearing DB trigger precisely because mobile
writes predictions directly. **Don't.**

### 4.11 Earned chips — 🔴 reject
Awarding a chip for winning three duels in a row. Rich-get-richer: it hands the strongest picker in
the pool a weapon and the weakest one nothing, in a product whose purpose clause is *no bad
feelings*. **Every chip must be given to everyone, equally, at the start of each half.**

---

## 5. Recommendation — three chips, one of each archetype

**Double Stakes (+ Gauntlet) · Take the Room · The Call-Out.**
**Three each half of the season, renewing at the halfway point — six a season** (§6). All three
declared on the **Duel tab during the scouting phase**, never on the picking surface. Plus **The
Return Fixture** as a free no-input layer and **The Stand-In** as the safety net underneath.

Three, because that is the number FPL proved people can hold in their heads, and because each one is
a different verb:

| | Archetype | Verb |
|---|---|---|
| Double Stakes | stake chip (F2) | **escalate** |
| Take the Room | hedge | **hedge** |
| The Call-Out | read your opponent (F5) | **read** |

A fourth would overlap one of those.

### The five gates, applied

| Gate | Double Stakes | Take the Room | The Call-Out |
|---|---|---|---|
| **1 Disclosure** — survives its tooltip? | ✅ the tooltip *sells* it | ✅ names the trade-off outright | ✅ the fizzle is stated up front |
| **2 Affect** — which emotion, would they thank you? | ✅ rivalry, anticipation | ✅ relief; it removes a bad feeling | ✅ rivalry; the reveal is the payoff |
| **3 Symmetry** — exit as easy as entry? | ✅ ignoring it is the default; a Gauntlet decline is free | ✅ never play it, nothing happens | ✅ same |
| **4 Substitution** — more of what they came for? | ✅ more argument about football | ⚠ **removes a week of picking** — needs a counter-metric | ✅ makes scouting matter |
| **5 Variance provenance** — inherited from the sport? | ✅ deterministic given results | ✅ deterministic given results | ✅ football + a human's disclosed choice |

**No dice anywhere.** Every payoff above is a deterministic function of real results plus decisions
people made and can see. That is the gate that would kill a *"40% chance your chip works"*, and
nothing here has one.

### 🔴 The line around monetisation, before anyone asks
**Chips must not be sold, and must not be a tier feature.** The recorded monetisation position is
that price is on **size**, and cosmetics are **colourways, not crests** — you buy the thing you
chose, never a chance at it. A purchasable chip is a **purchased competitive advantage in a pool of
friends**, which is the fastest route to a bad feeling this product has. Every member of every pool
gets the same three, free, at the start of each half.

---

## 6. The halfway rule — chips renew and expire at the midpoint

**Ryan, 2026-09-21.** Three chips for the first half, three fresh for the second; unused ones do not
carry over. **Six a season, about one every six matchweeks.**

### What it fixes
A once-a-season chip gets **hoarded and never played** — everyone waits for the perfect week and the
perfect week never announces itself. Halving the term forces the decision twice, and at six a season
a chip becomes a **rhythm rather than a rare event**, which is also what makes it teachable: you see
somebody else play one before your own turn comes. It resets **everyone equally regardless of
standing**, so it is a catch-up beat that is *not* rich-get-richer. FPL reached the same answer for
the same reason.

### ⚠ The mechanic passes gate 2. A notification about it would not.
This is the only place the rule can fail, so be exact about it.

- **The expiry itself is fine** — disclosed up front, costs you nothing you earned, and the deadline
  is the competition's own halfway point rather than a clock we invented.
- **"⏰ Your Double Stakes expires in 2 days — use it or lose it!"** is manufactured FOMO and fails
  gate 2 outright.

> **The line:** the count lives **on the card, permanently, non-escalating, and never leaves the
> app.** One word turns amber in the final week and one clause is added to the subtitle. That is the
> entire treatment.

Tooltip (gate 1): *"Three chips each half of the season. Unused ones don't carry over."* ✅

### 🔴 "Halfway" is not defined yet, and migration 143 is why
`pools.league_start_matchweek` means a pool can start at **any** matchweek.

| Definition | Verdict |
|---|---|
| **Season halfway** (MW19 of 38) | Sport-inherited and identical for everyone — but a pool starting at MW25 gets **zero** first-half chips and then a full second set. **Broken.** |
| **Pool halfway** (midpoint of the pool's own matchweek span) | ⭐ **Recommended.** Always two equal halves. Must be **resolved to a named matchweek at pool creation** — *"your chips renew at Matchweek 20"* — never a rolling clock, per migration 128's standing rule that a window is an interval from a football event and never an hour of the day. |
| Round-robin cycle | Does not map to "halfway" at all — at 7.6 members a cycle is ~7 weeks, so ~5 a season. |

⚠ **Floor it.** A pool starting at MW36 has three matchweeks and a halfway of 1.5. Below ~10
matchweeks, do not renew at all — one set for the whole pool.

⚠ **A chip you could not have played must not expire.** If your last matchweek before halfway is a
**bye** (`entry_b IS NULL`), every chip here is dead — no opponent to raise against, and a bye pays a
flat 250 regardless. Expiring it is us taking something back for a reason that is ours, not
football's. **Rule: an unplayable half rolls one chip forward**, disclosed in the same sentence.

### Two knock-ons
- **The Handshake gets more dangerous.** Six chips a season makes the draw-offer's collusion case
  materially easier to farm. If it survives at all it should stay **one per season** while the other
  three renew — or be dropped.
- **The Duels board's second rung starts working.** `ShowdownLadder` sorts
  `duel_points ↓ → wins ↓ → season total ↓`. Six doubled duels a season means `duel_points` and
  `wins` come apart far more often than today. Decide on purpose whether that is wanted.

### Volume check
6 chips × ~7.6 members ≈ **46 chip-weeks a season** over 38 matchweeks ⇒ roughly **one duel in eight
carries a chip.** Common enough to be part of the rhythm, rare enough to still be an event.

---

## 7. Where they land on the Duel tab

Read against the tab **as built today** — `mobile/components/pool-detail/DuelTab.tsx` (1,597 lines)
and `app/pools/[pool_id]/DuelsTab.tsx` (2,428 lines).

### 7.1 The pre-lock stack, with the chips card in place

```
┌─ SHOWDOWN BAND ─────────────────────┐   dark in BOTH themes · collapses on scroll
│  ‹      The Sunday Lot            ↗ │
│            Matchweek 12             │
│   (RS)    2d 04:11:38    (MK)       │ ← countdown, or the live ACCURACY score
│   Duel  │  Table  │  Room │ Banter  │
└─────────────────────────────────────┘
  1  Tale of the tape        Met 2×      ❌ NOT here — see 7.2
  2  Your sheet              7 / 10      ← the ONLY route into the picker
  3  Scouting Mia K.         W5 D1 L2
  4  What it will be decided on
  5  ▶ YOUR CHIPS      3 left · to MW19  ⬅ NEW CARD
        ⚡ Double Stakes    1,000 if you win, nothing if you don't   [USE]
        👥 Take the Room    Score the pool average instead of picking [USE]
        ◎ The Call-Out     Double to whoever's right — if you disagreed [USE]
  6  Against the room
  7  Your season
```

### 7.2 ❌ It cannot hang off the Tale of the Tape
My first instinct — the Tape is the input to the decision, so hang the chips off its foot. The file
refuses it in writing (`DuelTab.tsx:1319`):

> *"EVERY ROW IS A COMPARISON, so the winning side is BOLDED rather than labelled — the shape of the
> card **is** the comparison. Adding a 'leader' chip to each row would say the same thing twice and
> take the width to say it."*

A chips footer is not a comparison. It would be the first thing on that card that is not.

### 7.3 ✅ It goes 4th — after "What it will be decided on", before the records
The tab states its own pre-lock logic:

> *"your sheet, the opponent scouted, and the fixtures the duel will be decided on — **every one of
> those cards exists to inform a pick**."*

A chip does not inform a pick; it is a separate decision about the **stake**. So it sits after that
trio: you have seen the tape, scouted them and seen the ten games, and only then are you asked
whether to raise.

⭐ It also keeps **"Finish your picks" at position 2**, out of the chip's way. That is the whole
banker defence made physical — **the route to picking never passes through a chip.**

### 7.4 ⭐ The band needs no change at all
The band shows `accuracy_a/_b`, **never** `points_a/_b` ("500–0 is not a scoreline anybody played"),
and **a chip changes the payout, never the accuracy.** So the most expensive surface in the mode is
untouched by Double Stakes and Take the Room.

That matters because the band is not safely editable: `COLLAPSED_SPREAD = 108` is *derived* from the
live score's widest half, and `MIDDLE_COL = 160` only just clears `HH:MM:SS`. Those are Ryan's
hand-tuned numbers over ~20 rounds. ⚠ **Nothing goes in the collapsed row.**

### 7.5 The card wears `CardHeader`, and the expiry fits its `meta` slot exactly
`DuelTab.tsx:1524`: *"Six cards each inventing their own heading is how a tab reads as six screens
that happen to be stacked."*

| Slot | Value |
|---|---|
| `title` | `Your chips` |
| `meta` (hard right) | `3 left · to MW19` |
| `subtitle` | `Three each half of the season. Unused ones don't carry over.` |

⭐ `meta` is **precisely where the renew/expire rule belongs.** The whole of §6 fits the header shape
the tab already wears, with no new furniture invented for it.

Icons already exist in `mobile/components/ui/Icon.tsx`: `bolt.fill` (Double Stakes), `person.2.fill`
(Take the Room), `target` (The Call-Out). ⚠ `binoculars` is taken, by scouting.

### 7.6 ⚠ Only The Call-Out touches the in-play surface
Double Stakes and Take the Room are invisible once football starts. The Call-Out has to mark **one
row of the team sheet** — and that row's shape lives in `lib/league/duelSheet.ts` + `TeamSheetRows`,
a **byte-mirrored, guard-tested** module on both platforms. So it is the most expensive of the three
to build, and also the most watchable: the called-out row is the one you refresh for.

### 7.7 ⚠ Web and mobile already disagree about card order
RN leads with the Tape (Ryan, 2026-09-03: *"the tape leads"*); web puts Your sheet first and the Tape
fourth (`DuelsTab.tsx:1554` vs `:1697`). So "4th" is not one answer. Either place the chips card
**relative to "What it will be decided on"** on both, or accept that the two tabs differ, as the two
walkouts already do by decision.

> A five-state visual mockup of the above (scouting · declared · in play · approaching halfway ·
> renewed) is in `drafts/2026-09-21_showdown_chips_on_the_duel_tab.html` — a self-contained HTML
> file, not rendered by GitHub.

---

## 8. Implementation shape

All three recommended chips are **declarations about a duel**, not about a prediction. That matters:

- They belong on **`league_duels`** (or a small `league_duel_declarations` table keyed to
  `duel_id + entry_id`), **never on `league_predictions`**. Showdown picks are byte-identical to
  Pick'em picks — that is what makes Showdown "a layer, not a peer" (F3) — and putting a chip on the
  prediction row would drag it onto the Pick'em picking surface, which is the banker's grave again.
- **The deadline already exists and is football-anchored:** `league_matchweeks.lock_at` = first
  kickoff − 1 hour, frozen once passed (migration 101). A chip declared before `lock_at` needs no new
  clock. ⚠ Migration 128's rule applies — a chip window is an interval from a football event, never
  an hour of the day.
- **The Call-Out resolves for free at lock.** `lib/predictions/revealGate.ts` already makes both
  members' picks visible per matchweek the moment that matchweek's `lock_at` passes. *"Did we
  disagree?"* is answerable at exactly the instant the team sheets appear, with no new reveal
  machinery.
- The scoring change is **one `CASE` in `league_score_duels`** (migration 134's body), and
  `league_finalize_ranks` needs **nothing** — `(total_points + duel_points)` is already rung 2 of its
  cascade and 1,000 flows through it unchanged (F4).
- ⚠ Anything added under `lib/league/*` with a `mobile/lib/*` twin is a **byte-mirrored file with a
  guard test**. Six already exist for Showdown. A new module means a new mirror and a new guard.

---

## 9. Open calls for Ryan

1. **Does this amend Decision 9, or leave it?** My reading: amend the blanket *"there are no
   power-ups"* line, and **keep the banker rejected on its own merits** — its fault was living on the
   fixture list, and that reasoning is still right.
2. **Is a declared chip visible to your opponent?** I say **yes, always.** A hidden chip is a trap and
   fails the disclosure gate on contact; a visible one is the banter.
3. **Does Double Stakes zero the draw, or go negative?** I say **zero the draw, never negative.**
   Negative points in a pool of friends is a bad feeling with a number attached.
4. **Which halfway** — season (MW19) or pool (midpoint of its own span)? See §6. I say pool.
5. **Showdown only, or Pick'em and LMS too?** I say **Showdown only** — it is the one mode whose unit
   is a contest between two people, and every good option is stake-shaped (F2). Pick'em has no stake
   to raise; LMS already has a binary a chip would wreck.
6. **Does Take the Room use the pool median, or the opponent-excluded median?** Including your
   opponent in the average you are compared against is a small weirdness worth deciding on purpose.
7. **Does the Handshake survive at all?** If it does, one per season while the others renew.

---

## 10. Prerequisites before any of this is built

- ⛔ **Confirm real duels have settled in production.** The whole mode was built and sat undeployed
  for weeks. The deploy gap has since closed, so this is a *check* rather than a blocker — but do not
  design on top of a mode that has never scored a real entry.
- 🔴 **The ghost / walkover problem is more urgent than any chip, and it is only half fixed.**
  Migration **134** (*a member who left is not an opponent*) added `a_gone` / `b_gone` and pays 250
  against a **retired** entry. But a ghost is not a leaver: it is somebody still in the pool who
  simply stopped picking, and against them a duel is still a free 500. R28 measured **20–50%
  never-pickers** in pools full of friends. **Double Stakes against a ghost is a free 1,000**, so
  every chip here doubles a hole that already exists.
  134 is the pattern to extend, and the test is *"submitted nothing"* (no `league_predictions` rows),
  never *"scored zero"* — at Results depth you can pick all ten wrong and deserve the loss.
- **The Stand-In** (§4.9) should land before any chip that can be lost to a missed deadline.

---

## Appendix — a live disclosure bug found on the way

Not a power-up question, but it turned up while mapping the mode and it is the same gate.

**The reveal hold is 24 hours. Every member-facing surface says "two days."**
Migration 123 set 48h; **129 and 138 set it to 24h**. The copy never moved:

- `lib/leagueModeInfo.ts:138, :140, :154` — *"your next opponent opens two days after the current duel
  is decided"*
- `app/pools/[pool_id]/LeagueScoringRulesTab.tsx:198-199`
- `lib/__tests__/leagueModeCopy.guard.test.ts:140-143` — **asserts the stale wording**, so the test
  actively holds the wrong sentence in place.

`leagueModeInfo.ts:41` says *"the copy MUST carry the wait."* Right now it carries the wrong one. One
line of copy plus one line of test, and it should land before we argue about whether *new* mechanics
pass the disclosure gate.

---

### Related

- `SPORTPOOL_PROGRAMME.md` → Decision 8 (the five gates), Decision 9 (the format grid), Decision 10
  (deadlines), Decision 13 (LMS)
- `drafts/2026-08-24_league_pools_full_plan.md` — where Double Down was dropped from v1
- `drafts/2026-08-31_showdown_duel_points_plan.md` — the 500/250/0 rewrite
- `drafts/2026-09-04_showdown_ladder_plan.md` — the tiered annual ladder; shares the ghost problem
- `drafts/2026-09-21_showdown_chips_on_the_duel_tab.html` — the visual mockup for §7
