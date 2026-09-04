# Showdown Ladder — an annual tiered league

> **Status:** scoping document. Nothing here is built and nothing is decided beyond the three calls
> Ryan made on 2026-09-04 (below). Written against `tester-gate/allowlist-in-the-app`, which is the
> trunk — `origin/master` is **373 commits behind** and last moved **2026-08-24**.

**The three calls made 2026-09-04, which this document is written to:**

1. **An individual climbs**, not a crew. Your division is ~20 people we placed you with.
2. **SportPool runs it.** One official ladder per competition; self-serve for admins comes later.
3. **Movement is decided by where you finish in your division** — football-true, not by a
   cross-tier accuracy ranking.

Call 3 is the expensive one and §5.2 is about paying for it honestly.

---

## 1. Showdown as it actually is today

Ryan's question was *"whether it's exact or just results."* **It is both, and that is not a
loose end — it is the design.**

### 1.1 The two axes

Decision 9 settles a grid of **three modes × two depths**, and depth is a property of a mode rather
than a submenu inside it:

| | **Results** (home / draw / away) | **Scores** (exact goals) |
|---|---|---|
| **Pick'em** | ✅ | ✅ |
| **Showdown** | ✅ | ✅ |
| **Last Man Standing** | its own pick shape — no depth axis | |
| **Table** | one prediction, all season — no depth axis | |

So a Showdown pool carries `pools.league_mode = 'showdown'` **plus** a `league_depth` of `results`
or `scores`. The CHECK constraint restated in migration 083 makes the depth mandatory for Showdown
and forbidden for Table and Last Man Standing.

**Results is the pre-selected recommendation for a league season**, and Decision 9 argues it in one
line: 10 fixtures × 38 matchweeks is **380 taps** at Results depth and **760 numeric decisions** at
Scores. *"A month of World Cup scorelines is a burst; ten months of them is homework."*

### 1.2 Why the duel never learns which depth it is over

This is the part that matters for a ladder. `league_score_duels` reads **exactly one number** per
side:

```sql
SUM(league_match_scores.total_points)  -- for that entry, that pool, that matchweek
```

Both depths price into that same column, and both **cap at 100 a fixture** (migration 066: Results
pays 100 for the right result; Scores pays 100 for an exact scoreline, then 75 / 50 down the ladder).
So the duel layer compares two integers and never asks where they came from. That is precisely what
Decision 9 means by *"Showdown is a layer, not a peer engine"* — it is **not** the fourth scoring
engine, it is a comparison sitting on top of the Pick'em engine's output.

For the ladder this has one hard consequence, in §5.4: **the whole ladder must run at one depth.**

### 1.3 The draw

- **A published round-robin, not a random weekly draw.** The May concept note specified *"every
  Monday the system randomly pairs all active players."* That was **overturned on gate 5** (Decision
  8: all uncertainty must be inherited from the sport). Who you happen to draw is our dice, and
  across 38 matchweeks it does not average out — one member can face the pool's best picker eight
  times and another once. Ryan's call, 2026-08-24.
- **Circle method, in SQL.** `league_generate_duel_schedule` fixes the first entry and rotates the
  rest; `n−1` rounds cover every pair exactly once. Odd pools get a NULL padding entry that rides
  the rotation, so **byes are shared equally**.
- **Sealed, not published** — Ryan reversed the publishing half on 2026-08-30. Migration **116**
  gates `league_duels` in RLS on `league_duel_is_revealed()`; **119** opens one duel at a time (when
  the **previous** matchweek settles, not when this one opens for picks); **129** holds it a day
  after the last game; **128** lands it at a watchable hour. The reveal is a one-way door.
- **Round order is permuted per cycle** (118), hashed from `(pool_id, cycle)` and **never
  `random()`**, so a member cannot derive their late-cycle opponents by elimination — and so a
  regeneration after somebody joins produces the *same* future for every week nobody has seen.
- **Regeneration never rewrites a settled duel.** It is wired into three doors: create, join, and
  `retireEntries` (which owns all four leave paths).

### 1.4 What a duel is worth

`lib/league/duelPoints.ts`, owned by migration **121**:

| | value | why |
|---|---|---|
| `DUEL_WIN` | **500** | half a perfect matchweek — 10 fixtures × 100 cap = 1,000 |
| `DUEL_TIE` | **250** | a quarter |
| `DUEL_BYE` | **250** | ⚠ identical to a tie **by design** — no opponent, so no defeat |
| `DUEL_LOSS` | **0** | |

Ryan raised these from 3/1/0 on 2026-08-31: *"if you win a showdown that's 500 points, that's a big
movement and shift."* And the raise only works because it came with a second change —
`league_finalize_ranks` now orders on **`(total_points + duel_points)`**, one number, with
`total_points` as the next rung. Under the old cascade (duel points ranked *first*) the size of a
duel point was irrelevant: one win beat any accuracy total in the pool at 3 points or at 3,000.

⚠ **Never compare a duel's points to 3 or 1.** `headToHead()` did, and `poolCards.ts` did for four
days after 121 — which showed a member who had **won** a red form dot while the leaderboard had
them going up. Nothing errored. `duelPoints.guard.test.ts` now scans every reader.

### 1.5 Scale, for the ladder arithmetic

A 38-matchweek Results-depth season:

- perfect accuracy = 380 fixtures × 100 = **38,000**
- perfect duel record = 38 × 500 = **19,000**
- **duels are one third of a perfect season.** Substantial, but accuracy still dominates — which is
  the right ratio for gate 5, because accuracy is the half inherited entirely from the football.

### 1.6 ⛔ The thing that has to be said first

**Showdown has never scored a real entry.** Zero production pools carry `league_mode = 'showdown'`,
because the wizard that creates one is undeployed. The programme records this as **R21**, and it is
the single largest fact in this document: *everything below is a plan to build a ladder on an engine
that has never run in front of a member.*

Worse, migration **121 is applied in production** while the deployed `DuelsTab` still classifies
anything that is not exactly 3 or 1 as a loss. The moment a duel settles in production today, a
member who won is shown a defeat.

**The deploy is prerequisite zero.** Nothing in §6 should start before a real Showdown pool has
played a real matchweek.

---

## 2. What a ladder is, and what it is not

Today a **pool** is one group playing one competition for one season, and it archives. There is no
object that survives a season. Decision 1 anticipates one — *"the durable object is the Crew"* —
but the Crew is **not built**, and in any case it is a durable *group*, and Ryan's call is that an
**individual** climbs.

So the ladder introduces the product's **first durable per-person object**. That is the real weight
of this project, and it is worth naming plainly: it is not a pool mode, it is a layer above pools
that outlives them.

```
  LADDER (permanent, per competition)         "Premier League Showdown Ladder"
    └── LADDER SEASON (annual)                2027/28
          └── GRADE (a rung)                  Pearl · Obsidian · Silver · Bronze
                └── DIVISION (a pools row)    "Bronze 14" — 20 members, one Showdown pool
                      └── the existing engine, entirely unchanged
```

A **division is an ordinary Showdown pool**. Everything from §1 runs inside it untouched: the
circle-method draw, the seal, the reveal, the recap, the band, the 500/250/0, the one rank writer.
The ladder is the thing that *creates* those pools each August and *reads* their final ranks each
May.

That is the whole architectural bet, and it is why this is affordable at all.

---

## 3. The design

### 3.1 The division is 19 or 20, and the season is exactly two round-robins

This is the piece of luck the whole design rests on.

The circle method gives `n−1` rounds per cycle, and an odd `n` pads to `n+1`. So:

| division size | rounds per cycle | cycles in 38 matchweeks |
|---|---|---|
| **20** | 19 | **exactly 2** |
| **19** (one bye a week, rotated) | 19 | **exactly 2** |

A division of 19 or 20 plays **a double round-robin over a 38-matchweek Premier League season, with
every pair meeting exactly twice.** That is the Premier League's own structure, arrived at without
writing a line of scheduling code — and because migration 118 permutes the round order per cycle,
the return fixture does not arrive as a mirror of the first. It reads like a real fixture list.

That 19-or-20 flexibility also solves the leftovers: a ladder will never divide into exact 20s, and
a division of 19 costs nothing — the bye is worth a tie, and the rotation shares it equally.

### 3.2 The pyramid, and why its shape is forced

The grades need a shape that makes **"win your division, go up · bottom three go down"** balance
exactly, because Ryan's call is divisional rank and a rule that does not balance needs a
cross-division ranking to patch it.

Let grade *T* have `D` divisions. It sends `D` champions up and `3D` relegated down. For the grade
above to receive exactly `D` promoted into exactly `D` vacated seats, it must relegate `D` — so it
must have `D/3` divisions.

**The pyramid is forced to 1 : 3 : 9 : 27.**

| grade | divisions | seats | up | down |
|---|---|---|---|---|
| **Pearl** | 1 | 20 | — | 3 |
| **Obsidian** | 3 | 60 | 1 each (3) | 3 each (9) |
| **Silver** | 9 | 180 | 1 each (9) | 3 each (27) |
| **Bronze** | 27 | 540 | 1 each (27) | — |
| | **40** | **800** | | |

Every arrow balances. And the rule a member has to understand is one sentence:

> **Win your division and you go up. Finish in the bottom three and you go down.**

**Growth goes downward, never sideways.** When the bottom grade fills, a **new grade opens beneath
it** (81 divisions, 1,620 seats — five grades hold 2,420; six hold 7,280). New players enter at the
bottom. An existing player is never pushed down by other people arriving, which would be the worst
possible thing to have to explain.

⚠ **The metal names need an ordering a member can read without being taught.** Bronze → Silver →
Obsidian → Pearl fails that: nothing tells you whether Obsidian outranks Pearl. This is the
disclosure gate applied to a *name*, and it is cheap to fix now and expensive later, once people
have a grade they identify with. Growing downward also means the *bottom* name changes as the ladder
deepens, so the naming scheme has to be open-ended at the bottom rather than the top.

### 3.3 The season

| | |
|---|---|
| **Divisions form** | pre-season, from last season's finishing positions (§3.5) |
| **Play** | 38 matchweeks, unchanged Showdown — sealed draw, weekly reveal, weekly recap |
| **The division table** | ranked by `total_points + duel_points`, the one rank writer, no new code |
| **Season ends** | when the last matchweek settles (`ranks_snapshot_at`) |
| **Movement computed** | champion up, bottom three down |
| **Grade written** | to the member's ladder record; the division pool archives |

**The division table is the season's story and the ladder is its consequence.** A member sees one
table all year — 19 rivals, home and away — and a grade that only moves in May.

### 3.4 Season 1 — the placement problem, and the shape that solves it

Season 1 has no history to seed on, and Ryan's call (divisional rank) makes the seeding load-bearing:
if Bronze 14 happens to be full of experts and Bronze 3 full of novices, the wrong people go up.

**Recommendation: spend the first four matchweeks placing people, then form divisions of 17–18.**

| | |
|---|---|
| MW 1–4 | no duels. Everyone picks the same fixtures. Pure accuracy, no opponent, so division composition cannot affect it |
| MW 5 | divisions form, snake-seeded on those four matchweeks' accuracy |
| MW 5–38 | **34 matchweeks = exactly 2 cycles of a 17- or 18-player division** (17 rounds) |

The arithmetic is the same happy accident as §3.1: 18 → 17 rounds → 34 matchweeks, exact. And the
engine already does the hard part — migrations **095** and **117** mean the generator only schedules
**unlocked** matchweeks, so a division pool created at MW5 is naturally scheduled MW5–38 and never
back into August. *This is the cheapest possible version of a placement season.*

From season 2 the ladder seeds on itself, divisions return to 19–20, and the season is the full 38.

**The alternative, if losing the duel for four weeks is unacceptable:** seed season 1 on **World Cup
2026 accuracy**. We have 3,652 players' worth of it, it is earned rather than assigned, and it is
inherited from the sport — gate 5 clean. ⚠ But raw `scored_total_points` is **not comparable across
pools**, because pools ran different scoring configs; Decision 6 exists precisely because three
default sets disagree. It would have to be a **rate** (correct picks ÷ picks made), for which
migration 038 `pool_match_prediction_accuracy` already derives the home/draw/away half in SQL. And it
places nobody who is new to SportPool, who would need a default rung anyway.

### 3.5 Seeding from season 2 — snake, deterministic, disclosed

Within a grade, order everyone by last season's finishing position and deal them into divisions
**snake-wise** (1→A, 2→B, 3→C, 3→C, 2→B, 1→A …). Divisions come out as equal as the data allows,
the rule is one line, and it is **deterministic** — the same input produces the same divisions, the
way migration 118 makes the round permutation deterministic rather than `random()`.

⚠ **Snake-seeding does not make divisions equal. It makes them as equal as last season's data.** §5.2
is about being honest that this is a mitigation and not a proof.

### 3.6 The tiebreak that decides a promotion

`league_finalize_ranks`'s cascade ends `… bonus_points DESC, min(prediction created_at) ASC,
entry_id ASC`. **`entry_id` is a UUID.** Inside a pool that is a sensible total order that stops an
unrelated re-score reshuffling the table. **Deciding a promotion on it is a coin flip we introduced**
— exactly the thing gate 5 forbids.

**Recommendation: head-to-head decides a tied promotion or relegation, computed at season end only.**

Migration 084 rejected the concept note's lifetime-H2H tiebreak for a real reason — *"it is pairwise,
so it cannot be expressed as a sort key over one row"* — and that objection is entirely about the
**live** leaderboard. At season end you are resolving a *known, small, tied set* over settled duels,
so a pairwise pass is trivial and `headToHead()` in `lib/league/duels.ts` already computes it. Use
`duelResult()`, never a literal (§1.4).

This also finally pays off the concept note's second tiebreak, which the programme has carried as
**owed** since August.

---

## 4. The five gates

Decision 8, applied at design time.

| gate | verdict |
|---|---|
| **1 · Disclosure** | ✅ *"Win your division and you go up. Finish bottom three and you go down. Your division is 19 others we placed you with, seeded on where you finished last season."* Survives a tooltip. ⚠ The **names** do not yet (§3.2) |
| **2 · Affect** | ✅ for promotion, rivalry, a table you read all year. ⚠ **Relegation is designed to feel bad** — §5.3 |
| **3 · Symmetry** | ⚠ **Needs work.** Exit from a private pool is leaving a group of friends. Exit from a ladder means forfeiting a grade you spent a season earning, and that asymmetry is the whole point of a ladder. Minimum: leaving is one tap, and a returning member gets their grade back within one season (§5.1) |
| **4 · Substitution** | ✅ more of what they came for — a fixture list, a table, a rival — not more sessions. Counter-metric: **matchweeks picked per member**, not logins |
| **5 · Variance provenance** | ⚠ **This is the open one.** §5.2 |

**Standing check — a 15-year-old is in a family pool.** A ladder puts them in a division with 19
adult strangers, with Banter. That is a different room from the family pool, and §5.5 is the
consequence.

---

## 5. The problems, ranked by how much they can sink this

### 5.1 🔴 The ghost problem — the biggest risk in the document

A 38-week season with strangers will lose people. When it does, **a duel against a member who has
stopped picking is a free 500** — and that is precisely the unearned variance the round-robin exists
to remove. Drawn against a ghost twice while somebody else draws a live rival twice, you are not
playing the same game.

**This is not hypothetical.** Risk **R28** measured it on the two scored Pick'em pools in production:
*Matchweek Pick'em* has 10 entries and **8** totals rows; *Pick'em: Exact Scores* has 4 and **2**.
So **20–50% of members in pools with people they know have never picked at all.** On a ladder of
strangers, over ten months, expect worse.

**Recommendation, and it is nearly free because the mechanic already exists:**

> A duel against an entry that submitted **no picks at all** that matchweek is scored as a **bye for
> the live side — 250, not 500.** You did not beat a player; you were handed a walkover, and a
> walkover is not a win.

Migration 100 already established the reasoning in the other direction — *"no opponent, so no
defeat"* — and this is its mirror: **no live opponent, so no victory.** It removes the windfall
without inventing a mechanic, and it is one `CASE` arm in `league_score_duels`.

Three details that must be got right:

- **A ghost is "submitted nothing", never "scored zero".** At Results depth you can pick all ten and
  get them all wrong. Check for the absence of `league_predictions` rows, not for a zero.
- **The ghost still gets 0.** The bye protects a member from an absence *the rotation* caused. It
  must not protect one from an absence they caused, or 38 × 250 = 9,500 points accrue to someone who
  never opened the app.
- **Two ghosts is 0 and 0**, not a 250 tie. Today's `acc.a = acc.b` arm would pay them both.

⚠ And this rule must **not** be silently applied to ordinary Showdown pools without a call — in an
office pool, beating the colleague who forgot is part of the joke.

### 5.2 🔴 Gate 5 — your division is our placement, and that is real

The honest statement of the problem, since Ryan chose divisional rank:

- **Inside a division there is no draw-luck at all.** A double round-robin means everyone plays
  everyone twice. This is already strictly fairer than any ladder that pairs randomly, and it is the
  strongest thing we can say.
- **Between divisions, strength varies, and we assigned it.** If Bronze 14 is stronger than Bronze 3,
  the same performance promotes in one and not the other. **That is our dice, not the football's.**

Migration 118's defence does not transfer. It argued that permuting the round order was fine because
*"what gate 5 protects is the thing a member's points depend on: who they are drawn against, and how
often"* — and the permutation provably leaves that untouched. **Division assignment changes exactly
that thing.** So this needs its own answer, not a borrowed one.

**The answer that holds:** in real football your division is not assigned, it is **earned** — and
nobody calls the Championship gambling design because its 24 clubs are unequal. From season 2 the
ladder has the same property: you are where last season put you, snake-seeded so the remaining
inequality is as small as the data allows. **Season 1 is the only genuinely unearned placement**, and
§3.4's four-week placement window is what buys it back — everyone measured on the same fixtures
before anyone is placed.

**What must be recorded rather than claimed:**

- Snake seeding **reduces** division-strength variance; it does not remove it. Nobody should write
  copy that says divisions are equal.
- Measure it in season 1 — the spread of mean division accuracy at each grade is one query — and
  publish the number internally. If the spread is large enough that a top-quartile picker in a strong
  division finishes below a median picker in a weak one, that is the trigger to revisit call 3.

### 5.3 🟡 Relegation versus "no bad feelings"

§1 of the vision is *bring people together · make the sport matter more · **no bad feelings***, and
relegation is a mechanic engineered to feel bad. That tension is real and it does not dissolve.

What makes it survivable:

- **Nobody is ever out.** Relegation moves you between rungs, never off the ladder. Next August you
  still have 19 opponents, a fixture list and a table. Contrast Last Man Standing, which had to be
  redesigned into repeating rounds for exactly this reason — *"a pool dead in September fails the
  purpose clause outright."*
- **Give the bottom half something to play for.** The concept note's **Banter Cup** — best head-to-head
  record against the eventual champion — is the right shape, and now cheap: the H2H pass is already
  being written for §3.6. Survival is itself a story in football; the product should treat it as one.
- **Never relegate someone for disappearing.** A member who stops picking should **lapse**, not drop:
  they leave the ladder and re-enter at their last grade if they return within a season. *"You were
  relegated because you had a baby in November"* is the sentence to design away from. This is also
  the honest half of gate 3.
- **No public shaming.** The ladder never surfaces "relegated" as a badge, a push, or a share card.

### 5.4 🟡 The ladder is one depth, and it must be Results

Both depths cap at 100 a fixture, so the *maxima* match — but the *distributions* do not. Exact
scorelines are rare; at Scores depth a good season's total is far below a good Results season's, so
**a Scores division and a Results division at the same grade would produce ladder points that mean
different things**, and a champion of one is not comparable to a champion of the other.

`league_depth` is per pool and locked at creation. **The ladder must fix it once, for every division,
at every grade** — and per Decision 9 it must be **Results**: 380 taps over ten months rather than
760 numeric decisions, aimed at the member most likely to stop picking in November, who is exactly
the member a stranger ladder cannot afford to lose.

Scores could later be a **parallel ladder**, never a division inside this one.

### 5.5 🟡 Two things a division of strangers needs that a pool of friends does not

- **Moderation.** Banter in a private pool is self-policing. A division is 20 strangers under our
  logo — Decision 5 already says *"a listed pool is content published under our logo"* and asks for a
  report path. A ladder makes that mandatory, not optional. ~7% of members post today; that is a
  small surface, but the 15-year-old standing check applies to all of it.
- **Identity.** `components/ui/Avatar.tsx` hashes a colour from `user_id` so a person is the same
  circle everywhere — that is enough for a private pool. Twenty strangers arguing over ten months
  will want more, and *Avatars v1* (Storage bucket, `avatar_url`, upload) does not exist.

### 5.6 🟡 Naming collisions in the schema

Two words are already taken, and both would be taken *in this exact area of the code*:

- **`tier`** — `pools.tier` is monetisation: `free` / `plus` / `max` / `ultra`, with caps enforced by
  a DB trigger. Bronze/Silver/Obsidian/Pearl must **never** be called `tier` in the schema.
- **`band`** — migrations 089–093 use "band" for the *real* league table's Champions League / Europa /
  Conference / relegation runs.

**Keep "tier" in the copy; use `grade` in the schema** (`ladder_grades`, `ladder_members.grade_id`).

### 5.7 🟡 A division of 20 is illegal on the free tier

`pool_tier_member_cap('free')` returns **10**, enforced by `trg_pool_member_tier_cap`, and the join
route already branches on its SQLSTATE. A 20-member division breaks it on the 11th member.

Not hard, but it must be an explicit call rather than a discovered failure: either the ladder's
division pools are platform-owned and exempt (`tier_enforced_from` NULL, which is what every
pre-existing pool already carries), or the ladder writes them at a tier with no cap. **Whichever is
chosen, write down why**, because "the platform can create pools that ignore the paid caps" is a hole
somebody will find.

---

## 6. What it costs

### 6.1 Reused with no change at all

The whole of §1. `league_generate_duel_schedule` · `league_score_duels` · `league_finalize_ranks` ·
the settle trigger · the seal and reveal (116–120, 123, 127–129) · `ShowdownBand` ·
`DuelRevealCeremony` / `DuelRevealCorridor` · `DuelRecapSheet` · the duel decision page ·
`/duel-live` · the RN `DuelTab` and `ShowdownDuelHeader` · `league_seasons` / `league_matchweeks` /
`league_fixtures` and the sync · `pool_members` / `pool_entries` / `retireEntries`.

**This is the reason the project is affordable.** A division is a Showdown pool, and Showdown is
built.

### 6.2 New — the ladder layer

| | what |
|---|---|
| **Schema** | `ladders` · `ladder_seasons` · `ladder_grades` · `ladder_divisions` (→ `pool_id`) · `ladder_members` (person → grade, with history). The first per-person object that survives a season |
| **Division formation** | a job: read the grade's roster, snake-seed, create one `pools` row per division, add members + entries. The duel schedule then generates itself on create |
| **Season rollover** | a job: read every division's final ranks, compute movement, resolve ties by H2H (§3.6), write next season's grades, archive the pools |
| **Entry** | "Join the ladder" — not the pool wizard. One tap, one competition, no configuration |
| **Surfaces** | your division table · your grade and the pyramid · your ladder history. Web and RN |
| **Copy** | the disclosure-gate sentence, everywhere it belongs |

### 6.3 Changed

| | what | why |
|---|---|---|
| `league_score_duels` | the walkover rule | §5.1 |
| the settle trigger | it loops **every** Showdown pool in the season and full-re-ranks each | §7 |
| `poolCards.ts` / Discover | a division is not a pool you browse or join by link | it would appear in both today |
| join / leave | tier cap, and what leaving a division means mid-season | §5.7, §5.3 |

### 6.4 Owed before this starts

| | |
|---|---|
| ⛔ **R21 — the deploy gap** | Showdown has never scored a real entry. **Prerequisite zero** |
| 🔴 **R28 — zero-pick entries are absent from the leaderboard** | on a division table an absent member is a hole, and it is the ghost population from §5.1 |
| 🟡 **The `DuelsTab` fallback** | `enginePoints?.get(...) ?? r.w * DUEL_WIN + r.d * DUEL_TIE` is a second implementation of the arithmetic in the browser — the exact divergence the scoring architecture rule exists to prevent |

---

## 7. What breaks at scale

The engine is not the risk — the crowd is, which is the settled reading of this system.

**The one genuine engine finding.** `league_settle_duels_on_snapshot` (084) fires once per matchweek
and loops:

```sql
FOR v_pool IN SELECT pool_id FROM pools
 WHERE league_season_id = NEW.season_id AND league_mode = 'showdown' ...
LOOP PERFORM league_score_duels(v_pool.pool_id, NEW.matchweek_number); END LOOP;
```

Every iteration ends in a full `league_finalize_ranks` for its pool. Written for a handful of pools,
that is right. **A ladder makes it O(divisions) sequential function calls inside one `AFTER UPDATE`
trigger on one row** — 40 at 800 players, 364 at 7,280. It will not be wrong, it will be *slow*, and
it is on the path that keeps the leaderboard live, which the vision ranks as guarantee-keeping work
rather than hygiene. **Set-based or queued, before the ladder, not after.**

Everything else is comfortable:

| at 7,280 players / 364 divisions | |
|---|---|
| duel rows | 380 per division per season → **138,320 a season**. Trivial |
| `league_predictions` | 20 × 10 × 38 = 7,600 per division → **2.8M a season**. Notable, not alarming |
| reads + realtime | **this is the cost.** Reads and realtime are ~96% of DB time and presence alone is 63.6% of replicated writes. A division is a small room, which helps — but there are hundreds of them, all live at 3pm Saturday |
| caching | cache the **season**, never the pool. A division table is per-pool and moves on a goal |

---

## 8. What I would cut from v1

- **Cross-grade anything.** No inter-division cups, no global leaderboard, no cross-grade fixtures.
  One table, one grade, one rule.
- **Self-serve ladders.** Ryan's call already — official first.
- **Crew ladders.** A separate object with its own rollover; it should learn from season 1.
- **Anything predicting the pyramid's growth.** Open the next grade down when the bottom one fills,
  not before. *"Unbounded ambition is not a licence to pre-build."*
- **Cosmetics attached to a grade.** Every gate says wait.

---

## 9. Open calls

| # | call | why it cannot be defaulted |
|---|---|---|
| 1 | **Season 1 placement:** four-week window (§3.4) or World Cup seed | Changes division size (18 vs 20), season length (34 vs 38) and whether the duel is absent for a month |
| 2 | **The grade names** | Bronze → Silver → Obsidian → Pearl has no readable ordering, and the scheme must be open-ended **downward**. Fix before anyone owns a grade |
| 3 | **The walkover rule (§5.1)** — ladder only, or all Showdown pools? | In an office pool, beating the colleague who forgot is part of the joke |
| 4 | **Lapse vs relegate** for a member who stops picking (§5.3) | Kinder and better for gate 3, but it means a grade can be held by somebody who did not play |
| 5 | **What the division table shows.** Migration 121 settled that duel points are **added** to accuracy. A ladder makes the pressure for a football-shaped **P W D L Pts** table much stronger | Reopening 121 is a real decision, not a display tweak — do not do it by accident |
| 6 | **Moderation and identity (§5.5)** — how much ships with season 1 | 20 strangers under our logo for ten months |

---

## Sources

Trunk `tester-gate/allowlist-in-the-app` @ `348303a` (2026-09-04). Migrations 083, 084, 085, 095,
100, 116–123, 127–129. `lib/league/duelPoints.ts`, `lib/league/duels.ts`, `lib/leagueModeInfo.ts`,
`scripts/verify-showdown.ts`, `app/api/pools/create/route.ts`, `app/api/pools/join/route.ts`,
migration 075 (tier caps), migration 067 (pool tiers). `SPORTPOOL_PROGRAMME.md` Decisions 1, 3, 5, 6,
8, 9, 11, risks R21/R23/R28, the engine register. `SPORTPOOL_VISION.md` §1, §4, §5, §7, §9.5.

⚠ **Not verified against the database.** This session had no Supabase access, so every claim about
*production state* is quoted from the programme rather than measured. The claims about *code* are
read from the trunk directly.
