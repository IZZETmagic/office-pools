# SportPool — vision & goal statements

> **Status: DRAFT for Ryan to correct.** Nothing here is settled.
>
> Every line is tagged:
> **[D]** *Derived* — already implied by a decision recorded in `SPORTPOOL_PROGRAMME.md`; I only wrote it down.
> **[A]** *Assumed* — my inference. Most likely to be wrong. Challenge these first.
> **[?]** *Gap* — genuinely unanswerable from the repo. Needs you. Collected in §7.

## 0. Why this document exists

`SPORTPOOL_PROGRAMME.md` is 1,267 lines and contains **no vision statement**. It records *what*
(backlog), *when* (delivery order), and *what could go wrong* (risks) — with real rigour. It never
records *why*, or *for whom*.

That gap has a cost, and it showed up in this session concretely: I proposed fixing the XP/level
system without being able to say what levels are *for*. Are they a retention mechanic? A status
symbol? A skill signal? The answer changes whether the right move was a ratchet, a recalibration, or
deleting levels entirely. I couldn't tell — so I optimised the implementation of something whose
purpose was undefined.

**A technical plan can't be judged without this.** "Scalable" is meaningless until we know scalable
*to what*, *for whom*, and *paid for how*.

---

## 1. What SportPool is

**[D] SportPool is where an existing group of people plays a competition together.**

The product is not the prediction game. The prediction game is the *occasion*. The product is the
group — its history, its rivalries, its running joke, the fact it reassembles every tournament.

This is already the single most load-bearing decision in the programme, *Decision 1 — the durable
object is the Crew*: a **Crew** is permanent, a **pool** is one crew playing one competition and
archives. Today they're collapsed into one row, "which is why the same group re-assembles from
scratch every season."

**[D] Therefore the competition is interchangeable and the group is not.** That is the actual
argument for multi-sport — not "more sports is more market", but *the crew you have shouldn't go
dormant for four years between World Cups*. Multi-sport is a **retention** strategy dressed as an
expansion strategy.

**[D] The formats are the product** (*Decision 3*): "the fact a league crew can play Score Predictor,
Last Man Standing or Final Table *is* the range. Hiding it makes SportPool look like a one-trick
pick'em app."

## 2. Who it's for

**[D] Two customers, and they are not the same person.**

| | **The Commissioner** (admin) | **The Player** |
|---|---|---|
| Wants | A group that runs itself without them being the villain | To beat people they know |
| Fails by | Quitting over conflict and time — not workload | Drifting when the group goes quiet |
| Count | **477** | **3,652** |
| Leverage | **Each one carries ~7.6 players** | — |

**[D] The commissioner is the growth lever, and it is not close.** *Decision 7*'s own table:
preventing 20% of admin churn ≈ **+722 players**, versus +365 for 10% more admins. And an **11.6%
organiser rate is ~10× the classic ~1% creator benchmark — "an outlier to defend, not a funnel to
fix."**

**[A] So the primary customer is the commissioner.** The player is who we retain; the commissioner is
who we cannot afford to lose. Every feature should be asked: *does this make the commissioner's life
easier, or does it hand them another chore?*

**[?] Who this is NOT for** is undefined. Serious bettors? Solo players with no group? Media/brand
partners? Saying no is what makes a roadmap tractable — see §7.

## 3. What we refuse to do

**[D] These are already settled and are the sharpest thing in the document.**

- **The five ethical gates** (*Decision 8*), applied at design time, not review time. The fifth is the
  one specific to this product: **all uncertainty must be inherited from the sporting event.
  Randomness we add ourselves is gambling design, whether or not money moves.**
- **The platform is the referee, the admin keeps the judgment** (*Decision 7*). "Automate the
  *chores*, never the *choices*." The platform takes the blame — *"SportPool locked picks — your
  commissioner can't change this"* — so the admin has something to point at.
- **Nothing is accepted after a match starts, by anyone including super-admin.** "The risk isn't that
  admins cheat — it's that they can be accused of it."
- **We never touch funds** (`2026-07-25_entry_fee_collection_assessment.md`). The single biggest
  risk-reducer available; keeps us outside money-transmission and Bermuda betting-licence perimeters.
- **Predictions app, not a score ticker.** Minute-cadence updates are sufficient; per-second fidelity
  is over-engineering.

**[A] One that isn't written down but is implied by all of the above: we do not build engagement
mechanics that would embarrass us if explained.** The standing check is already there — *assume a
15-year-old is in a family pool*.

## 4. What we're optimising for

**[A] Proposed primary metric: retained commissioners running a second competition with the same
crew.**

It is the one number that captures the whole thesis. It requires: the crew survived the gap
(Decision 1), rejoining was frictionless (Decision 2 — held seat), a second competition existed
(multi-sport), and the admin didn't quit (Decision 7).

**[A] Counter-metric, per the substitution gate:** sessions per player must NOT be the success
measure. *Decision 8* explicitly requires pairing every engagement mechanic with a quality counter —
"does the user end up with more of what they came for, or just more sessions?"

**[?] This is my proposal, not a recorded decision.** It could equally be total players, revenue, or
"my mates enjoy it". §7.

## 5. What "scalable" has to mean

You asked for a plan that scales as the user base grows. That needs a number, so here is the current
state measured, and the shape of the load — not a guess.

**Today (measured 2026-07-26):**

| | |
|---|---:|
| Users / active 30d | 4,043 / 3,184 |
| Pools / memberships | 623 / 4,809 |
| Predictions | 288,029 |
| Median pool size | **1 member** (mean 7.7) |
| Pools ≥ 100 members | **4** |
| Cumulative DB time | 337.5 hours |
| Infrastructure | Supabase **Medium** |

**[D] The load is spiky, not steady.** It concentrates at kickoff and full-time — a documented CPU
spike, and a ~15–20 minute read-driven hump after the final whistle. **Scaling means surviving
simultaneity, not average throughput.** 4,000 users who all open the app in the same 90 seconds is a
harder problem than 40,000 spread across a day.

**[D] The long tail is the shape.** 70% of pools have ≤5 members; 4 pools have ≥100. Any design that
assumes "big pools" optimises for 0.6% of the product. This is exactly why CDN caching of pool detail
was the wrong instinct — median pool = 1 member means a ~0% hit rate.

**[A] The multi-competition multiplier is the real scale event, and it is not gradual.** The World
Cup was 104 matches in 4 weeks with one deadline cliff. The Premier League is **380 matches across 38
matchweeks** — ~3.6× the fixtures, and *38 recurring deadline cliffs instead of one*. Add a second
concurrent competition and the spikes overlap. **The scale risk is not user growth. It is calendar
density.**

**[?] What growth are we actually planning for?** 10×? 100×? "Whatever Showdown brings"? This single
answer decides whether the technical plan is "tidy the hot paths and cache" or "re-architect
ingestion, scoring and fan-out". §7.

## 6. How this constrains the technical plan

Read against §1–§5, the performance work sorts into three tiers — and the sort is *different* from
the one I proposed on cost alone:

**Serves the vision directly**
- `match_conduct` scoping — silent wrongness; **blocks league ingestion**, which is the multi-sport
  thesis (§1). Not a performance task at all.
- Surviving simultaneity at kickoff/full-time — that *is* the product moment (§5).
- Precompute over recompute — the durable version of "don't do work at the worst second".

**Serves it indirectly**
- Over-fetch fixes, caching layers, mobile client cache. Real, but they are hygiene: they lower cost
  and latency without changing what the product can do.

**Cannot be judged yet — and this is the honest answer to your challenge**
- The **XP/level system**. It is thoroughly World-Cup-shaped: `STAGE_MULTIPLIERS` is keyed to knockout
  rounds so every league fixture falls through to ×1.0; `stadium_regular` is hardcoded to 104
  predictions; `showtime` and `grand_finale` are unreachable without a knockout stage; the level
  ladder is calibrated to ~104 matches and would be exhausted by ~matchweek 12 of 38.

  **You were right.** I fixed *who writes* the XP column without knowing *what levels are for*. The
  two-writer bug is real and worth fixing — one column, one owner is right under any design. But the
  ratchet, migration 026 and the re-seed all encode a product rule about a system that needs
  recalibrating for leagues anyway. **[?]** *What are levels for?* is a §7 question, and the answer
  decides whether that work ships, waits, or gets deleted.

---

## 7. What I need from you

Ordered by how much they change the plan.

1. **What is this, commercially?** A business, a break-even service, or something you run because you
   enjoy it? Monetisation is "⚪ Gated" in the projects table and the entry-fee assessment stops at
   legal feasibility without a decision. **This changes everything downstream** — what infrastructure
   spend is justified, whether we optimise for cost or headroom, whether "scale" means paying
   customers or just more load.

2. **What scale are we planning for, and by when?** A number and a date. 10× by EPL kickoff is a
   different plan from "steady growth, don't fall over".

3. **What are levels and badges FOR?** Retention mechanic, status symbol, skill signal, or decoration?
   Directly decides the fate of the XP work now sitting uncommitted.

4. **Who is this explicitly NOT for?** The most useful sentence in any vision document.

5. **Is my §4 primary metric right** — *retained commissioners running a second competition with the
   same crew*? If not, what replaces it?

Answer these and I'll write the technical plan against them — as a document you approve before I
touch anything. Nothing is applied or deployed; production is unchanged.
