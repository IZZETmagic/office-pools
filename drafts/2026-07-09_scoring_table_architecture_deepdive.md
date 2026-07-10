# Scoring data model deep-dive — why the "third match table", and options in shadow

**Date:** 2026-07-09 · **Status:** analysis only, no code changes · **Context:** raised while investigating the knockout tie-break bug (Eliel ticket)

## TL;DR

- The "three match tables" are **not three copies of one fact**. Two are ground truth (`matches` = actuals, `predictions` = guesses). The third (`match_scores`) is a **materialized cache** of a computation: `score = f(prediction, actual, pool_settings, resolved_bracket)`.
- You *can* "just compare predictions to actuals" — for **group** matches that's a pure per-row function. `match_scores` there is purely a performance/breakdown cache.
- You **cannot** for **knockout** matches, because scoring needs the entry's **resolved bracket** (which teams they predicted into each slot), and that is derived from the entry's *entire* prediction set — a cross-row computation, not a per-match compare. That derivation is the genuinely irreducible materialized artifact.
- So the table your instinct targets (`match_scores`) *is* reducible (it can be a view). The table that actually causes the bugs (`resolved_brackets`) is a different one — and it's the one that's hard to remove.
- **Shadow already trimmed half the redundancy** (its `shadow_match_scores` drops the denormalized snapshot columns) and its scoring is **one declarative SQL join** — which makes "turn the score table into a view" uniquely feasible in shadow.

---

## 1. What each table actually is

| Table | Role | Ground truth? | Derivable from? |
|---|---|---|---|
| `matches` | Actual fixtures + results | ✅ yes | — (source of truth) |
| `predictions` | Per-entry scoreline guesses | ✅ yes | — (source of truth) |
| `match_scores` | Per-entry-per-match **points** | ❌ no | `predictions ⋈ matches ⋈ pool_settings ⋈ resolved_bracket` |

`match_scores` is the **output** of scoring, cached as rows. It is read by ~15 surfaces (leaderboard, breakdown, analytics, badges, push recaps/results, activity feed) and written by exactly one thing — the scoring engine.

### Why it exists (why it isn't "just compare predictions to actuals")

1. **Knockout scoring is not per-match.** Points for R16 match 92 depend on *which teams the entry's bracket put in that slot* (`teams_match`). That's derived from all their group + earlier-round predictions, not from `predictions[92]` vs `matches[92]`. Pure "prediction vs actual" only works for group games.
2. **Settings dependency.** Points = `base × stage-multiplier (+ PSO)`, all from `pool_settings`. The same prediction+result scores differently in two pools.
3. **Read scale.** Recomputing every entry×match (with bracket resolution) on every leaderboard/breakdown read does not scale — that class of per-read recompute caused the 2026-06-16 read-saturation outage. Materializing is a deliberate cache.
4. **Breakdown / audit.** The UI shows *how* each match scored ("Winner + GD, 150×2 = 300"). Storing the line item makes that a cheap read and gives a point-in-time record.

### Where the redundancy critique is right

- Live `match_scores` **denormalizes** `predicted_home/away_score` (copy of `predictions`), `actual_home/away_score` (copy of `matches`), and `predicted_home/away_team_id` (copy of the bracket). Those columns are genuinely redundant.
- It's a **cache that must be kept in sync** by recalc — and that sync going stale is precisely the bug class the Eliel ticket exposed.
- For **group** matches the score is a pure function of (prediction, actual, settings) → it could be a view with no correctness cost.

### The table you can't cut

For knockouts, "did they get the two teams right" lives in **neither** `predictions[match]` **nor** `matches[match]`. It's the output of `resolveFullBracket` over the whole prediction set (group standings → R32 → R16 → …). That cross-row derivation is expensive and is the **irreducible** materialized artifact. In live it's ephemeral (in-memory per recalc); in shadow it's a stored table (`shadow_resolved_brackets`). **This — not `match_scores` — is the table that's hard to remove, and it's the one causing the bugs.**

---

## 2. Live vs shadow — how each computes

### Live (Node / TypeScript, `lib/scoring/recalculate.ts` → `full.ts`)
```
predictions + matches + teams + settings + conduct
   → resolveFullBracket(per entry, IN MEMORY)   ← bracket never stored
   → computeMatchScore(per entry×match)
   → UPSERT match_scores (diff-write) + rollup → pool_entries.scored_total_points
```
- Bracket resolution is **ephemeral**: recomputed in memory each run, then discarded. Only the *result* (`match_scores`, with the redundant snapshot columns) is stored.
- Group ranking for the UI is written by a **different** route (`bonus/calculate` → `group_predictions`) that calls the **same** `resolveFullBracket` — **but without `conductData`**. → the two paths disagree on tie-broken groups → the Eliel bug.

### Shadow (set-based SQL, `drafts/2026-07-02_shadow_match_scoring.sql`)
```
shadow_resolved_brackets   ← materialized TS resolveFullBracket output (shadowBrackets.ts), refreshed MANUALLY
shadow_score_match(match)  = ONE query:
   predictions ⋈ matches ⋈ pool_settings ⋈ shadow_resolved_brackets
   → score_type / base / mult / pso / total / teams_match  (pure CASE expressions)
   → shadow_match_scores  (lean: NO snapshot columns)
   → shadow_entry_totals (rollup + rank)
Automation: trigger on matches → shadow_score_queue → worker (cron 1 min)
```
- Scoring is **fully declarative** — a single join + `CASE`. This is the important structural difference from live.
- `shadow_match_scores` is **leaner** than live: it stores only the derived outputs (`score_type, base_points, multiplier, pso_points, total_points, teams_match`), not copies of predictions/actuals. Shadow already answered half your critique.
- **The seam:** the scoring is automated, but `shadow_resolved_brackets` is refreshed **manually** (automation file, line 11–13). So when predictions change, rounds advance, or the resolver logic changes, the bracket table goes stale while scoring keeps running against it → the "corrupt shadow" symptom.

### Side-by-side

| | Live | Shadow |
|---|---|---|
| Scoring engine | Imperative TS (per-entry loop) | Declarative SQL (set-based join) |
| Bracket resolution | In-memory, per run, discarded | Materialized table, **manual** refresh |
| Score storage | `match_scores` **+ redundant snapshot cols** | `shadow_match_scores`, **lean** |
| Refresh | Recalc jobs (diff-write) | Trigger→queue→worker (1 min) |
| Can scores be a view? | ❌ (logic is TS, not a query) | ✅ (logic already *is* a query) |
| Consistency bug source | 2 code paths resolve bracket differently (conduct in/out) | bracket table stale (manual refresh) |

---

## 3. Options to resolve this in shadow

Ordered from "smallest change" to "cleanest end-state." These are design options, not committed work.

### Option A — Make `shadow_match_scores` a VIEW, not a table
STEP 1 of `shadow_score_match` is already a pure join. Define it as a `VIEW` over `predictions ⋈ matches ⋈ pool_settings ⋈ shadow_resolved_brackets`.
- **Wins:** deletes the score table, its refresh worker, and its whole staleness class. Scores can never be stale vs current predictions/actuals/settings/bracket. Directly "cuts out the redundant table" you asked about.
- **Costs:** whole-pool leaderboard needs an aggregate sort → keep `shadow_entry_totals` (aggregate) materialized for scale; use the view for single-entry breakdowns (cheap). Live-match provisional scoring still needs the same eligibility gate in the view.
- **Feasible only in shadow** — because shadow's scoring is one declarative query. Live's TS logic can't be a SQL view without porting.

### Option B — Keep materialized scores, fix the bracket (highest correctness ROI)
The bugs come from the **bracket**, not from `match_scores` existing. Two fixes:
1. **One canonical resolver** — no `conductData` in a *predicted* bracket, FIFA-correct tie-break order — consumed by display, scoring, and bonuses. Kills the Eliel inconsistency.
2. **Automate the bracket refresh** — fold `shadow_resolved_brackets` materialization into the same trigger/queue as scoring so it can't go stale. Kills the "corrupt shadow" seam.
- **Wins:** fixes both live bug classes; no read-scale regression.
- **Costs:** doesn't reduce table count.

### Option C — Port bracket resolution into SQL (one engine, no seam)
Reimplement group standings + the knockout cascade in SQL (recursive CTE), so `shadow_resolved_brackets` is refreshed **atomically inside the same worker** as scoring — or becomes a (materialized) view itself.
- **Wins:** eliminates the manual-refresh seam entirely; one engine end-to-end; bracket and scores can never disagree.
- **Costs:** biggest lift (porting `resolveFullBracket` + tiebreakers to SQL, incl. the FIFA order + fair-play rules). Needs its own parity harness.

### Option D — Minimal-table end state (the target picture)
```
GROUND TRUTH (tables):        predictions, matches, pool_settings
IRREDUCIBLE DERIVED (materialized, auto-refreshed):  resolved standings/bracket
SCALE CACHE (materialized):   entry_totals   (leaderboard sort)
EVERYTHING ELSE (views):      per-match scores, breakdowns, bonuses
```
- This is the honest answer to "cut out the redundant table": **yes — `match_scores` becomes a view; you keep the bracket (the real irreducible derivation) and the leaderboard aggregate.**
- It's Option A + Option C together, and it's only reachable *because* shadow made scoring declarative.

---

## 4. Recommendation

1. **Do Option B first** — it fixes the actual bugs (inconsistent bracket + stale bracket) with no scale risk, and is independent of any table-count change.
2. **Then Option A** — collapse `shadow_match_scores` to a view once the bracket is trustworthy; that's the concrete "delete a table" win, safe only after B.
3. **Option C/D** is the long-term one-engine goal; pursue if/when the shadow cutover is prioritized.

**The core principle:** materialize the *expensive cross-row derivation* (the bracket) and the *leaderboard aggregate* — make the *cheap per-row stuff* (match scores) a view. Live got this backwards: it discards the expensive bracket and materializes the cheap scores (with redundant copies). Shadow is already halfway to the right shape; the manual bracket refresh and the dual-resolver inconsistency are the two things to close.
