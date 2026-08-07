# League path — implementation plan

> **Status:** draft for Ryan, 2026-07-30. Not started.
> **Premise correction:** an earlier version of this analysis treated the Premier League as *"a second
> competition the World Cup engine has to survive"*. That was wrong, and Ryan corrected it in session:
> **a league is a different type of competition, and it gets its own path.**

---

## 1. The premise

The World Cup code is a **bracket engine**. Its vocabulary is groups, placeholders, advancement
cascades, FIFA tiebreakers, knockout multipliers, group-based bonuses.

A league has **none of those things** — not "has them differently", *doesn't have them*. 20 clubs, 38
matchweeks, 380 fixtures, a table. Every fixture has real teams from the day the season is published.
Nothing advances. Nothing is a placeholder.

So the design rule for everything below:

> **A league pool never enters bracket code. Not guarded, not filtered — it takes a different path
> from the dispatch point onward.**

The corollary matters just as much: **the bracket engine is not touched.** It keeps serving the 623
completed World Cup pools exactly as it does today. No refactor, no retrofit, no shared-abstraction
exercise. New competition type, new path, old path left alone.

### What this premise deletes from the plan

Three things previously written down as launch blockers are **not on the league's critical path**:

| Previously called a blocker | Why it isn't |
|---|---|
| Auditing 88 unscoped `.from('matches')` call sites | Bracket-path code serving finished WC pools. Real debt, owed to the *next bracket tournament*, not to the EPL. |
| *"A league pool scores zero, silently — two bugs, fix in both engines"* | Symptom of routing a league through the knockout gate. A league path has no knockout gate to fix. See §3. |
| `teams` being World-Cup-named (`country_name`, `group_letter`, `fifa_ranking_points`) | Cosmetic. Arsenal goes in `country_name` and nothing breaks. Revisit at sport #3. |

---

## 2. Phase 0 — the door

**0.1 Apply migration 024.** Production still rejects a league tournament outright:
`tournaments_tournament_type_check` allows only `('world_cup','euros','copa_america')`, and
`matches_stage_check` has no `regular_season`. 024 is committed and tracked; it is **not applied**.
It also adds the two columns the rest of this plan leans on: `tournaments.format`
(`'groups_knockout'` | `'league'`) and `matches.round_number` (matchweek 1–38).

**0.2 Diverge the advancement dispatch.** ⚠ **Verified in production 2026-07-30 — this is a real
corruption path, not a theoretical one.**

- [sync-fixtures/route.ts:270](../app/api/cron/sync-fixtures/route.ts) sets
  `trigger: m.stage === 'group' ? 'group_complete' : 'knockout_result'`. A league fixture is
  `stage='regular_season'` — not `'group'` — so **every completed Premier League match is announced to
  the advancement engine as a knockout result.**
- `advanceKnockoutWinner` then keys purely on `match_number`, scanning all matches for a placeholder
  reading `"Winner Match N"`.
- The league importer computes its starting number **scoped to its own tournament**
  ([importLeagueSeason.ts:214](../lib/integrations/apiFootball/importLeagueSeason.ts)), so a fresh
  season numbers its fixtures **from 1**.
- Production today: WC match numbers **1–104**, 32 matches carry placeholders, and those placeholders
  reference source matches **73–102** (30 distinct).

⇒ EPL fixture **#73** completing would write a Premier League club into a completed World Cup knockout
slot, and because that WC match `is_completed`, [advance-teams:226](../app/api/admin/advance-teams/route.ts)
would then `clearDownstreamTeams` and cascade it through the finished bracket that 623 pools are
scored against. **30 such fixtures, numbers 73–102, landing around matchweek 8.**

**The fix is the divergence, not a guard:** the cascade is bracket-only. Read the tournament's
`format` at the dispatch point and route league fixtures to the league path, which has no advancement
step at all. This is correct design rather than a patch — a league genuinely has nothing to advance.

**0.3 Order matters.** 0.2 lands **before** 0.1. Applying 024 opens the door; the dispatch fix is what
makes walking through it safe.

---

## 3. Phase 1 — league scoring

### What is genuinely shared

Comparing a predicted scoreline to an actual scoreline is the same operation in any football
competition. `scoreMatch`'s inner ladder — exact → winner+GD → winner → miss, via `getWinner()` at
[core.ts:15](../lib/scoring/core.ts) — is **competition-agnostic and should stay shared.**

### What is bracket-specific and must not be inherited

Everything wrapped *around* that ladder:

- the knockout-teams gate (`checkKnockoutTeamsMatch`, [core.ts:88](../lib/scoring/core.ts))
- stage multipliers (`getStageMultiplier`) — a league has one stage
- the group-vs-knockout price split at [core.ts:153](../lib/scoring/core.ts)
- PSO bonuses — league fixtures don't go to penalties
- group-based bonuses (`lib/tournament.ts:137` iterates 12 hardcoded groups)

### The shape

A new mode calculator alongside the existing three. `recalculatePool` already dispatches on
`prediction_mode` ([recalculate.ts:182, 212](../lib/scoring/recalculate.ts)) across
`full_tournament` / `progressive` / `bracket_picker`; a league adds `calculateLeague`. Flat prices, no
multiplier, no gate, grouped by `round_number`.

### ⚠ Decide before writing a line: which engine does it live in?

All 623 pools **read shadow**, and the direction of travel is `prod_scoring_enabled=false`. Writing the
league engine in Node *and* in shadow SQL would recreate the exact hand-fork that made prod↔shadow
parity worthless during the World Cup. The *Scoring architecture rule* says compute once, store once,
aggregate in SQL.

**Recommendation: write the league engine once, in the SQL/shadow path**, and have league pools read it
from day one. They have no prod-scoring history to preserve — this is the one engine that gets to
start clean.

**Register:** add a League row to the engine register in `SPORTPOOL_PROGRAMME.md` — the rule says add a
row when you add an engine.

---

## 4. Phase 2 — matchweek deadlines and auto round-opening

**2.1 Matchweek deadlines.** Picks lock at the **first kickoff of the matchweek**, not per-fixture.
`trg_enforce_prediction_before_kickoff` locks each match at its own kickoff, which would let a Sunday
picker see Saturday's results. Must be DB-level — mobile writes predictions directly.

**2.2 Auto round-opening.** Decision 7 calls this *"a prerequisite, not polish"*, and there is **zero
code**. The World Cup opened 7 knockout rounds by super-admin bulk `pool_round_states` updates. The
EPL is **38 matchweeks × every pool**. `pool_round_states` is keyed by `round_key`; a league's round
key is the matchweek number.

This is the single largest genuinely-new piece of work in the plan and it has no World Cup analogue to
copy.

---

## 5. Phase 3 — multi-tenant sync

`sync-fixtures` reads the competition from three env globals — `API_FOOTBALL_TOURNAMENT_ID`,
`_LEAGUE_ID`, `_SEASON` ([route.ts:67](../app/api/cron/sync-fixtures/route.ts)). Loop over active
tournaments reading `external_league_id` / `external_season` per row (024 backfills both). WC is
api-football league 1; EPL is league 39, season 2025.

---

## 6. Phase 4 — the modes (Decision 9)

In dependency order. Each is additive; none blocks Phase 0–3.

1. **Pick'em / Scores** — the league engine as specified above. Nothing extra.
2. **Pick'em / Results** — needs a real `predicted_outcome` column and a pool-level depth flag.
   ⚠ **Never encode H/D/A as a sentinel scoreline** (1-0 / 0-0 / 0-1): it would score as a genuine
   exact and would show members a fabricated *"predicted 1-0"* in the breakdown views. Migration ships
   **before** any code names the column.
3. **Showdown** — a layer over whichever weekly accuracy number the depth produces. Needs the pairing
   engine and duel scoring; does not need to know the depth.
4. **Last Man Standing** — the only genuinely separate engine. One pick per matchweek, no repeats,
   repeating rounds, matchweek-level lock.
5. **Final Table** — scores into `bonus_points`, which makes it tiebreak rung 4 for free. Actual table
   derived from completed matches, as [lib/podium.ts](../lib/podium.ts) does for the podium.

---

## 7. Verification — parity is not available here

There is no sibling implementation to compare a new league engine against, and that is a **feature**:
the World Cup's worst scoring bugs survived because prod and shadow agreed with each other while both
were wrong.

Validate against the **domain** instead:

1. Take one real completed matchweek and one real member.
2. Hand-compute their points from the fixtures and their picks.
3. Compare to what the engine stored, and to what the member's screen renders.

A league pool that scores **zero** must be impossible to ship unnoticed — assert non-zero scoring on a
seeded fixture set in CI, because *silent* zero is the failure mode that already happened once.

---

## 8. Sequencing and the date

Phases 0–3 are required for *any* league pool and are independent of how many modes ship. **Work can
start on them now** — the Decision 9 mode scope does not block them.

It is ~2 weeks to mid-August. Phases 0–3 plus even one mode is not 2 weeks of work.

**Decision 2 already settled that a league pool stays joinable after first lock** — *"week 3 of 38 is
viable; a bracket is not."* Opening in early September with Phase 0–3 solid and Pick'em live costs two
matchweeks of a ten-month season, on a path the product has already blessed. That is a better trade
than compressing league scoring, given that a silently-zero-scoring flagship season is the exact
failure the vision names as unshippable.

**The call needed from Ryan:** confirm the date slip, or name what comes out.

---

## 9. Open questions

- **Which engine hosts league scoring** (§3) — recommendation is SQL-only, needs confirming.
- **League price defaults.** Decision 6 makes 100/75/50 canonical; a league has no group/knockout
  split, so it needs one flat set. Are the canonical three simply reused?
- **`predictions_submitted_at` in a 38-week season** — tiebreak rung 5 meant *committed earliest* for a
  one-shot bracket; across 38 matchweeks it can only mean *joined and picked first*.
- **Does an EPL pool need a bonus concept at all** beyond Final Table? Rung 4 is otherwise empty.
