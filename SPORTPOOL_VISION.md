# SportPool — Purpose, Vision & Strategy

> **Status: settled 2026-07-26** with Ryan, in session. This supersedes
> `drafts/2026-07-26_vision_and_goals.md`, which was a draft awaiting his correction — and which got
> the central claim wrong (see *§9.3*).
>
> `SPORTPOOL_PROGRAMME.md` records **what** we're building, **when**, and **what could go wrong**.
> This file records **why**, and **for whom**. It should change rarely. When a programme item and this
> document disagree, this document wins — or one of them is wrong and needs saying out loud.

---

## 1. Purpose — why this exists

> ### SportPool exists to bring people together around sport.

The prediction is not the product. The prediction is the **excuse** — a reason for a group of people
to talk to each other every day for the length of a competition, to care about a Tuesday fixture
they'd otherwise ignore, and to argue about it the way friends do.

Three clauses, all load-bearing:

- **Bring people together** — *bring*, not *keep*. This includes people who have never played
  together. We are not only in the business of preserving groups that already exist.
- **Make the sport matter more** — a fixture you have called is a fixture you watch.
- **No bad feelings** — nobody finishes a competition feeling cheated, embarrassed, nagged, or
  ganged up on. Fun and banter, not resentment.

That third clause is the one most products in this category get wrong, and it is not decoration. It
is the reason *Decision 7 — platform as referee* exists: the platform enforces locks and deadlines
**and says so**, so the commissioner is never the villain, and so an admin can never be *accused* of
cheating even when they haven't. **"No bad feelings" is the purpose; "the platform takes the blame"
is the mechanism.** Read in that order, Decision 7 stops being an admin-tooling choice and becomes a
purpose-critical one.

## 2. Vision — the world we're trying to make

> ### Anywhere there's a competition worth watching, people watch it together.

Six colleagues. A family across three time zones. A bar full of strangers who become regulars. A crew
that formed for one World Cup and has played everything since. SportPool is how they play it —
whatever the sport, whatever the format, however well they already know each other.

**The ambition is deliberately unbounded.** There is no target user count and no date, by choice
(Ryan, 2026-07-26). Build it well, let demand set the pace.

**But unbounded ambition is not a licence to pre-build.** Growth is not the thing we plan *for*; it is
the thing we must never be the reason we *lose*. Operationally that resolves to one testable rule:

> **If we woke up to 10× tomorrow, would this fail loudly or fail silently?**
>
> Loud failure — slow pages, timeouts, a queue backing up — is acceptable and fixable. **Silent
> wrongness is not shippable**, at any scale.

This is not an abstraction in this codebase. It is the exact shape of our three worst live problems:
PostgREST truncating an unbounded read at 1,000 rows with no error; a league fixture scoring **zero,
silently**, because the group/knockout binary is welded into the scoring price lookup; and the team-
advancement cascade resolving placeholders across competitions once a second one exists. All three are
the same defect class, and all three are why "just add servers" was never the answer.

## 3. The product guarantee — the leaderboard is live

> ### A goal goes in, a touchdown is scored, a basket drops — **the standings move.**

Ryan, 2026-07-26: *"This is what the group, the banter, the laughs really come from."*

This sits above the strategy, not inside it, because it is **causally upstream of §1**. A leaderboard
that updates at full time produces a *result*. A leaderboard that moves on the goal produces a
*reaction* — and the reaction is the thing people say to each other. **The swing is the banter.**
Everything in §1 depends on this working; nothing in §1 is delivered by a scoreboard that catches up
later.

**Points and standings are 100% correct, 100% of the time, and never stale by design.**

### 3.1 We don't chase the ball. We chase the consequence.

This replaces the older, blunter "predictions app, not a score ticker" rule, which was right about the
cost and wrong about the boundary.

| ❌ Not ours | ✅ Ours, non-negotiably |
|---|---|
| Minute-by-minute match tickers, live commentary, possession stats, per-second polling of match state | The instant a goal is **confirmed**, every affected pool's standings are correct |
| Redrawing a scoreboard nobody came here to watch | Reflecting the *consequence* of the goal in the thing people actually came for |

We do not need to know the ball is in the box. We need the table to move the moment it hits the net.

### 3.2 This is already the architecture's intent — verified, not assumed

| Fact | Source |
|---|---|
| Live matches are **already scored**, not just completed ones | `lib/scoring/core.ts:222` — `is_completed \|\| status === 'live'` |
| Recalculation **already fires on any score change**, live or final | `app/api/cron/sync-fixtures/route.ts:304` |
| Today's cadence is a **60-second** fixture sync | `sync-fixtures/route.ts:309, 323` |

So this is not a new capability. It is the promotion of an existing behaviour from *nice* to
**non-negotiable** — which is a change in how we prioritise, not in what we build first.

### 3.3 It is also the most expensive promise in the product

It is the exact thing that has already taken the site down. After the opening match, completion sweeps
ran **78s → 268s against a 60-second interval**, stacked, and pinned the database at ~100% for ~20
minutes. The mitigations built since — the atomic overlap lease with `sweep_pending`, and the
time-boxed resumable sweep — exist because of this promise.

**Therefore the performance and precompute work is re-sorted.** The earlier draft filed caching,
over-fetch fixes and precompute as *hygiene* — "lowers cost and latency without changing what the
product can do." That is now wrong. **Precompute is how we keep the guarantee.** Leaderboard
precompute, bounded reads and surviving simultaneity move up beside correctness work, because a
leaderboard that is late is a product failure, not a performance regression.

### 3.4 Three boundaries this guarantee does *not* cross

1. **"Live" has a floor we don't control.** The binding constraint is **ingestion, not scoring** — we
   learn about the goal when the data provider tells us. Going below 60s means either faster polling
   (which the code's own comment warns pins the DB) or provider push. *Whether api-football offers
   push/webhooks on our plan is unverified — check it before promising anything tighter than 60s.*
2. **Live leaderboard ≠ live notifications.** The guarantee is that standings are correct **when you
   look**. Pushing every lead change fails gate 2 (affect): four *"you've dropped to 3rd"* pushes in
   one match is precisely the bad feeling §1 forbids. The swing is drama when you're watching and
   nagging when you're not.
3. **Standings move backwards, and that's the point.** Top at 1–0, level at 1–1, gone by the 80th
   minute. That is the drama, and it does **not** conflict with the XP ratchet (§9.2): *levels* never
   demote, *standings* absolutely do.

## 4. Who it's for

Two customers. They are not the same person and they fail in different ways.

| | **The Commissioner** | **The Player** |
|---|---|---|
| Wants | To host something their people enjoy, without becoming the villain | To have something at stake, and someone to say it to |
| Fails by | Quitting over **conflict and time** — not workload | Drifting when the group goes quiet, or when they fall out of contention |
| Count | **477** | **3,652** |
| Leverage | Each one carries **~7.6 players** | — |

**The commissioner is the primary customer.** Not because they matter more, but because losing one
loses eight. Decision 7's own table: preventing 20% of admin churn ≈ **+722 players**, versus +365 for
10% more admins. An 11.6% organiser rate is ~**10× the classic ~1% creator benchmark** — *an outlier
to defend, not a funnel to fix.*

The standing question for any feature: **does this make the commissioner's life easier, or hand them
another chore?**

## 5. Who it's NOT for

Settled 2026-07-26.

- **Bettors and odds chasers.** Anyone who wants stakes, odds, cash-out, or anything that behaves like
  a sportsbook. Already implied by *we never touch funds* and gate 5; now stated as an audience
  refusal, which is stronger.
- **Fantasy-depth obsessives.** Season-long roster management, transfers, waivers, trades. A different
  game with a different weekly workload, and it competes with the thing we're actually for.

**Deliberately *not* refused:**

- **Strangers with no group.** Consistent with Decision 5 — Discover lists all public pools and we run
  official SportPool pools per major competition. Under §1's *bring*, these are **first-class
  on-ramps, not fallbacks**.
- **Mass public / media leagues.** Ryan's ruling: *keep it open — possible revenue*. A broadcaster or
  brand running a thousand-person pool is a live strategic option, not a closed door. Recorded as an
  open tension with §6.1 rather than resolved, because at that size the social layer is untested.

## 6. Strategy — the six bets

### 6.1 Bring them together first; the crew is how they come back

The **crew** (Decision 1) is a permanent group; a **pool** is one crew playing one competition, and it
archives. That decision stands unchanged — but its status changes here. **The crew is the retention
mechanism, not the purpose.** The purpose is the gathering. The crew is what makes the gathering
*repeatable*, so a group doesn't go dormant for four years between World Cups.

This ordering matters practically: it means a crewless user is a **target**, not an edge case, and
Discover, official pools and share-link pools are funded accordingly.

### 6.2 Win by keeping commissioners, not by finding more

See §4. The 478th admin is by construction the person with the smallest, least enthusiastic group. The
best growth available is not recruiting them — it is not losing the 477 we have. **Admin retention is
currently unmeasured on every dashboard** (risk R7), which makes our biggest lever invisible.

### 6.3 The formats are the range

Decision 3. That a league crew can play Pick'em, Showdown or Last Man Standing **is** the product's
range. Hiding it makes SportPool look like a one-trick pick'em app. A format is a named preset that
carries its own scoring — *the admin chooses a game, never assembles one.*

**Names corrected 2026-07-30** (Decision 9 — the EPL format grid). This line previously read *"Score
Predictor, Last Man Standing or Final Table"*. The settled shape is **three modes** — Last Man
Standing, Pick'em, Showdown — with a **Results or Scores** depth choice on the latter two, and **Final
Table** as an optional season-long add-on any mode can carry rather than a mode of its own. Depth
exists to serve §1: a ten-month season asked in exact scorelines is 760 numeric decisions, which is
homework, and homework does not *bring* anyone anywhere.

Multi-sport follows from §6.1: it is a **retention** strategy wearing an expansion strategy's clothes.

### 6.4 The platform takes the blame

Decision 7. Automate the *chores*, never the *choices*. The override wall is **kickoff, not the
deadline** — up to kickoff an admin can extend, reopen for everyone, reopen for one person, nudge,
remove, re-invite; after a match starts **nothing is accepted, by anyone, including super-admin**. The
override log is published to members because it is the admin's *proof they were fair*.

Downstream of §1's "no bad feelings", not of tidiness.

### 6.5 Earn the right to charge — then charge everyone, fairly

Ryan, 2026-07-26: *"a combination between a real business and self-funding — still in the self-funding
phase, refining the product before full monetisation. Monetisation will be a massive success and
achievement for us."*

So the commercial posture is **staged, and the stage is named**:

| | |
|---|---|
| **Now (Phase 2)** | Refine. Cover costs. Judge infrastructure on cost-per-user and durability, not on unit economics we don't have yet. |
| **Then (Phase 1)** | A real business. Monetisation is the milestone that marks the transition — not a background task. |

The recorded May 2026 plan (four tiers: Free / Plus $19 / Max $49 / Ultra $500-per-tournament) is
**admin-pays**. Its own risk register flags the flaw: *RM-04 — the consumer admin tier alone is
structurally low-revenue; at 50K users, admin-only ≈ $89K/yr.*

Ryan's addition directly answers RM-04: **every user should be monetisable, not just admins** — tiered
admin pricing by pool size, a cosmetics store, player subscriptions (enhanced statistics, banter
enhancements), and venue/bar sponsorship. That is now the strategic direction; the May tier table is
one lane within it, not the whole plan. It needs re-costing against §9.1 and §9.2 before it ships.

### 6.6 Every element of uncertainty comes from the sport

Gate 5, restated because it constrains §6.5 specifically. **Randomness we add ourselves is gambling
design, whether or not money moves.** For a cosmetics store this draws a clean, non-negotiable line:

- ✅ **You buy the thing you chose.** Deterministic purchase, price shown, item shown.
- ❌ **You buy a chance at the thing.** Loot boxes, randomised crates, "spin to unlock" — a refusal,
  not a design debate. It also fails the standing check: *assume a 15-year-old is in a family pool.*

## 7. What we refuse

Settled, and not re-openable without a stated reason.

1. **The five gates**, applied when a mechanic is *designed*, not at review: disclosure · affect ·
   symmetry · substitution · variance provenance (Decision 8).
2. **We never touch funds.** The single biggest risk-reducer available; keeps us outside
   money-transmission and Bermuda betting-licence perimeters. Prize money stays off-platform.
3. **Nothing is accepted after a match starts** — by anyone, including super-admin.
4. **No randomness we invented.** §6.6.
5. **No mechanic that would embarrass us if explained in a one-sentence tooltip.**
6. **We don't build a match ticker** — but we never let the leaderboard lag. §3.1 is the boundary, and
   it is a sharper line than the old "minute cadence is sufficient" rule it replaces.

## 8. How we know it's working

**Primary metric — repeat commissioners.** *Commissioners who run a second competition with the same
crew.* It is the whole thesis in one number: the crew survived the gap (D1), rejoining was frictionless
(D2), a second competition existed (multi-sport), and the admin didn't quit (D7). Currently
**unmeasured** — R7.

Because §1 is about people talking, the primary metric alone is not enough. Two counters, per gate 4:

### 8.1 The purpose counter-metric — and it is currently failing

> **The share of pool members who actually said something.**

If SportPool exists to bring people together and they don't speak, we have built a scoreboard. Today,
from the Jul 2026 banter analysis: ~1,383 messages across ~315 people, **~7% of members post**, and
**~67% of messages are auto-generated share cards** rather than something a person wrote.

**That is the purpose statement failing its own measure.** It promotes *Boost banter engagement* from
a medium-priority feature to a purpose-critical one — and given §3, it is also the sharpest available
test of whether live standings are actually producing the reaction we claim they do.

### 8.2 Sessions per player is a counter-metric, never a success measure

Gate 4 (substitution): *does the user end up with more of what they came for, or just more sessions?*
Every engagement mechanic ships paired with a quality counter, or it doesn't ship.

## 9. What this changes — conflicts to resolve

The point of writing this down is that it contradicts things we've already planned.

### 9.1 🔥 The paid tiers put banter and XP behind a paywall — the free tier can't deliver the purpose

The May 2026 tier table has, on **Free**: banter — *off*; Form tab (XP, badges, level runway) —
*off*; How Others Predicted — *off*.

Read against §1 and §8.1, this paywalls the purpose. A free pool is a group of people who cannot talk
to each other. And per §9.2 it withholds the retention mechanic from exactly the players most likely
to drift. Open question 4 in the monetisation plan already asks *"free tier banter — fully off vs
read-only?"* — this document answers it: **not fully off.** The final shape (read-only, capped,
delayed) is a design call; charging for the ability to speak is not.

**This is a conflict, not a ruling — it needs Ryan's decision.** It also weakens Free→Plus upsell,
which is why it's a real trade and not a free win.

### 9.2 The XP ruling, and what it costs

**Ryan's ruling (2026-07-26): XP and levels exist for retention — specifically so that players who
are not at the top of the pool still matter and still come back.** Not a skill ranking.

Measured against the code, that ruling is **directionally satisfied but capped**:

| Fact | Source |
|---|---|
| A missed prediction still earns **10 XP** for turning up (`submitted` tier) | `xpSystem.ts:83` |
| An exact score earns **120 XP** — 12× the participation floor | `xpSystem.ts:80` |
| Predicting **all 104** World Cup matches and getting **every one wrong** = 1,040 XP → **Level 4 of 10** | `LEVELS`, `xpSystem.ts:86–96` |
| Level 10 needs 7,500 XP | `xpSystem.ts:96` |

So **the bottom four levels are participation and the top six are accuracy.** Under Ryan's ruling
that's the right shape but the wrong ceiling — a devoted, unlucky player tops out below halfway.

Consequences, in order:

1. **The uncommitted ratchet work is correct — ship it.** If levels are for retention, you must not be
   able to *lose* standing after a bad week. Migration `026_entry_xp_highest_level.sql`, the level
   ratchet and the re-seed are right under this ruling. (`total_xp` staying honest while only the
   *level* ratchets is also right — and see §3.4.3: standings fall, levels don't.)
2. **The two-writer bug is right to fix regardless.** One column, one owner, under any design.
3. **It cannot be paywalled** (§9.1). A retention mechanic aimed at drifting players, withheld from
   the tier most likely to contain them, is self-defeating.
4. **It needs per-competition recalibration before EPL, and that needs measuring, not estimating.**
   `STAGE_MULTIPLIERS` has no `regular_season` key, so every league fixture falls through to ×1.0;
   `stadium_regular` is hardcoded to 104 predictions; `showtime` and `grand_finale` are unreachable
   without a knockout stage. A pure-participation EPL season (380 × 10) = 3,800 XP → Level 7, and a
   competent predictor with bonuses stacked on top exhausts the ladder well before matchweek 38.
   *An earlier draft asserted "exhausted by matchweek 12" — that figure is unverified; treat the
   exhaustion point as needing measurement.*
5. **Gate 4 applies.** It is now explicitly a retention mechanic, so it ships with a quality counter —
   §8.1 is the natural one.

### 9.3 The crew is demoted from purpose to mechanism

The earlier draft read Decision 1 as the product thesis: *"the product is the group."* Ryan's
correction is **bring**, not **keep** (§1). Decision 1 itself is unchanged and still correct — but
work aimed at people who *don't yet have a crew* (Discover ranking, official pools, share-link
onboarding, the crewless first experience) is **first-class**, not a fallback tier beneath crew work.

### 9.4 The cosmetics store has a hard line through it

§6.6. Deterministic purchases only. This should be written into the cosmetics item before any of it is
scoped, not discovered during review.

### 9.5 Big public pools stay open, and the tension is recorded

Ryan's ruling: keep it open as possible revenue. It sits in genuine tension with §6.1 — at
thousand-person scale the social layer that §1 depends on is untested. **Not resolved.** The trigger
for resolving it is a real prospect, not a hypothetical.

### 9.6 The performance backlog is no longer hygiene

Per §3.3. Leaderboard precompute, bounded reads and surviving simultaneity are now **guarantee-keeping
work**, ranked beside correctness rather than below it. Anything that makes the leaderboard late is a
product failure.

## 10. Still open

> **Both live decisions were deferred by Ryan on 2026-07-29** — not rejected. Each carries a trigger
> below so the deferral doesn't quietly become a default.

- **§9.1 — free-tier banter.** Needs Ryan's call; blocks monetisation design. **Trigger:** whenever
  monetisation is next picked up — this is the first question in that work, not a detail inside it.
- **How live is "live"?** The 60-second sync is the floor today. Three sub-questions: does our data
  provider offer push/webhooks; is sub-60s worth what it costs the DB; and — the sharp one — the
  time-boxed resumable sweep. **Verified against production 2026-07-26: `sweep_time_box_enabled` has
  no row in `sync_settings` at all.** The code reads it via `maybeSingle()`, so a missing row falls
  through to `false` — meaning **the outage protection built after the June meltdown has never run in
  production, and it is off by omission rather than by decision.** It matters both ways under §3: it
  prevents the pile-up that makes the leaderboard hours late, but it does so precisely by *allowing a
  pool to lag a run* during a heavy completion. That trade now needs an explicit call. **Trigger: EPL
  kickoff, mid-August 2026** — it is moot while nothing is being scored, and load-bearing the moment a
  38-matchweek season starts producing weekly completion sweeps across every pool.
- **The monetisation plan needs re-costing** against "every user monetisable" (§6.5) rather than
  admin-only. RM-04 stands until it does.
- **Admin retention is unmeasured** (R7). The clean baseline is the WC→EPL transition, which is
  happening now and closes at EPL start.
- **The XP exhaustion point for a 38-week league** — measure it, don't estimate it (§9.2.4).
- **Whether §8.1's counter-metric is the right one.** It's proposed here, not proven.

---

*Purpose, ambition, refusals, primary metric, the live-leaderboard guarantee, the XP ruling and the
big-pool ruling were settled with Ryan on 2026-07-26. Everything in §9 and §10 is open work, and
nothing in this document has been applied to code.*
