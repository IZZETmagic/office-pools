# M4 — Leaderboard analytics read-path flip

**Status:** 🟡 **Unblocked, freshness fix pending** (2026-07-13) — M4a code + M4b parity built; parity caught stale columns; **re-materialize done (1575 entries fixed, parity now 0 diffs / 1850 entries)**. Still need the durable freshness mechanism (§11) before the canary/global flip. See §11.
**Author:** recreated 2026-07-13 (original was lost; roadmap flagged it missing)
**Roadmap item:** *Leaderboard precompute (read-path flip)* — `Infra`, top of "⏭️ Next — WC stability & scale".

---

## 1. Goal

The full/progressive leaderboard route recomputes **per-entry analytics on every page load**. Precompute
(already shipped, M1/M2) writes those values to `entry_xp_state` columns once per score-change. M4 flips the
**read path** to serve those columns instead of recomputing — turning an O(entries × matches) compute +
two paginated full-table reads into a single indexed join.

**Target (from prior profiling, roadmap):** ~516 ms → ~20 ms leaderboard query; match-night load test holds on
Medium compute. **Scoring/points are untouched** — this is the analytics/XP *display* layer only (see the
"which precompute" disambiguation: this is NOT the shadow scoring engine).

---

## 2. Verified current state (2026-07-13, against live prod DB + code)

M1/M2 are **fully live in production** — the in-file comments saying "DRAFT, NOT YET REGISTERED / ENABLED"
are **stale**. Evidence:

| Fact | Evidence |
|---|---|
| All analytics columns exist on `entry_xp_state` | `last_five` (text[]), `current_streak` (jsonb), `hit_rate`, `total_completed`, `exact_count`, `contrarian_wins`, `crowd_agreement_pct` (numeric), `total_xp`, `current_level` (int), `analytics_updated_at` (timestamptz) |
| Backfill done + columns fresh | 3423/5000 rows have `analytics_updated_at`; newest `2026-07-13 11:10` (last score change today). The ~1577 without are the no-prediction entries the writer intentionally skips. |
| Kill-switch ON | `sync_settings.analytics_sweep_enabled = true`; watermark `analytics_last_run_at = 2026-07-13T18:46Z` |
| Cron registered + running | **pg_cron jobid 15**, `* * * * *`, `active=true` → POSTs `https://sportpool.io/api/cron/analytics-sweep`. (All crons are pg_cron, not `vercel.json` — that file is `{}`.) |
| Writer mirrors the route exactly | `lib/analytics/entryAnalytics.ts::computePoolEntryAnalytics` is the route's per-entry block extracted verbatim (same helpers), so writer and reader **cannot drift by construction**. |

**Conclusion:** the write side needs *no* work. M4 is purely the read flip + a rollout flag + a parity gate.

---

## 3. What the route does today (`app/api/pools/[pool_id]/leaderboard/route.ts`, 493 lines)

**Reads (parallel):** `pool`, `matches` (+team joins), `teams`, `match_conduct`, `pool_settings`,
`pool_members`(+users), then `pool_entries`, then **paginated `predictions` (all entries)** and
**paginated `match_scores` (all entries)**.

**Per-entry loop (lines 268–397):** for each entry with predictions →
`matchScoresToPredictionResults` → `computeStreaks` → `computeCrowdPredictions` → `computeFullXPBreakdown`,
then derives `last_five`, `hit_rate`, `exact_count`, `level(_name)`, `total_xp`, `contrarian_wins`,
`crowd_agreement_pct`, `total_completed`. **This is the expensive part.**

**Pool-wide (lines 408–490):** `awards`, `superlatives`, `matchday_mvp`, `matchday_info` — all derived
from the per-entry analytics + live ranks.

### Dependency map — what each expensive read actually feeds

| Read / structure | Feeds | Fate under M4 |
|---|---|---|
| `allPredictions` pagination (131–153) | crowd calc; `predictions.length>0` submit-gate | **remove** (analytics come from columns; gate on `has_submitted_predictions`/analytics-row presence) |
| `match_scores` pagination (237–262) | per-entry `predResults` → analytics; `entryPredResultsMap` for `matchday_mvp` | **remove full read**; replace matchday need with a **targeted single-match query** |
| per-entry compute (291–368) | all analytics fields | **remove** — read columns instead |
| `teams`, `match_conduct`, `pool_settings` (100–107) → `teamsData`/`conduct`/`settings` (162–168) | **nothing** (built, never used again) | **drop** (bonus IO cut; verify no ref before removing) |
| `matches` (+joins) | `matchday_info`, `matchday_mvp` lastCompleted, `normalizedMatches` | **keep** |
| `pool_entries` | points, ranks, adjustment, submit flag | **keep** |
| `pool_members`+users | names | **keep** |

---

## 4. The flip

When the flag is ON, the route becomes:

```
reads:  pool, matches, pool_members(+users), pool_entries,
        entry_xp_state (analytics cols) for these entryIds        ← NEW precomputed read
        match_scores WHERE match_id = <lastCompleted> AND entry_id IN (…)  ← NEW targeted, matchday_mvp only
per-entry: map entry_xp_state row → response fields (no compute).
           level_name via LEVELS lookup on current_level (in-memory).
           missing row (no analytics yet) → existing defaults.
pool-wide: awards / superlatives / matchday_info unchanged (in-memory over leaderboard).
           matchday_mvp from the targeted match_scores query.
```

**Removed:** `allPredictions` + full `match_scores` pagination + the four per-entry compute helpers +
the three dead reads. **Net:** ~5 big reads + O(n·m) compute → 1 small indexed read (`entry_xp_state` by
`entry_id`) + 1 tiny targeted read.

### Field mapping (entry_xp_state → response)
`total_xp→total_xp`, `current_level→level` (+`level_name` via LEVELS), `last_five→last_five`,
`current_streak(jsonb)→current_streak`, `hit_rate→hit_rate`, `exact_count→exact_count`,
`contrarian_wins→contrarian_wins`, `crowd_agreement_pct→crowd_agreement_pct`, `total_completed→total_completed`.
Points/ranks (`match_points`, `bonus_points`, `point_adjustment`, `scored_total_points`, `current_rank`,
`previous_rank`, `has_submitted_predictions`) stay sourced from `pool_entries`.

---

## 5. Freshness / staleness model

- **Points, ranks, rank-movement:** always live (read from `pool_entries` every request).
- **Analytics (form, streak, xp, hit-rate, contrarian, exact):** as of the last analytics-sweep write —
  **≤ ~1 min** behind a score change (cron every minute, writes only changed pools).
- **Awards/superlatives:** Biggest Climber/Faller use live ranks (fresh); streak/contrarian/exact-based ones
  inherit the ≤1 min analytics lag. `matchday_mvp` uses the live targeted query (fresh).

**Acceptable** per product principle *"predictions app, not a score tracker — minute-cadence is sufficient."*
We deliberately **do not** trigger analytics inline in `recalculatePool` — that would re-load the scoring
hot path and worsen the *Kickoff write spike* item. Decoupled cron is the intended design.

**Parity nuance to encode (avoids false diffs):** the writer rounds `hit_rate`/`crowd_agreement_pct` to 2 dp
(`Math.round(x*10000)/100`); the current route returns the raw float. Align the reader to the same rounding
(or compare at 2 dp in the parity gate). Display already rounds, so no user-visible change.

---

## 6. Rollout flag (mirror the proven shadow rollout)

Two-step, both in `sync_settings`, default OFF → instant rollback by flipping a row:

1. **Canary:** `analytics_read_from_columns_pools` (uuid[]) — route reads columns only for listed pools;
   everyone else recomputes. Start with 1–2 known pools (incl. a rich one).
2. **Global:** `analytics_read_from_columns` (bool) — once canary + parity are clean, flip global.

Route logic: `useColumns = global === true || poolId ∈ canaryList`. Recompute path stays intact as the
fallback for the entire rollout, so rollback is a settings flip (no deploy).

---

## 7. Parity gate — "0 diffs" before flipping

Offline script `scripts/parity-entry-analytics.ts`:
1. Pick pools (all, or a sample incl. the richest).
2. Force a fresh sweep write for them (`writePoolEntryAnalytics`) so columns aren't stale.
3. For each entry, diff **stored columns** vs **fresh route-style recompute**, field by field, at 2 dp.
4. Report any non-zero diffs (expect **0**, since writer == route logic; any diff = staleness or the rounding
   nuance above).

Also compare the assembled `awards`/`superlatives`/`matchday_mvp` for a sample pool (column-fed vs
recompute-fed) to confirm the pool-wide layer is identical.

---

## 8. Staged plan (small, reversible)

| Stage | Change | Risk | Rollback |
|---|---|---|---|
| **M4a** | Add `readFromColumns` branch to the route behind the flag (canary list + global bool); keep recompute path as fallback. No behavior change while flags OFF. | low (dead code until flag) | delete branch / leave flag off |
| **M4b** | Parity script; run in a calm window; drive to 0 diffs (fix rounding alignment if needed). | none (read-only) | — |
| **M4c** | Enable canary pools; eyeball web + mobile leaderboard vs a recompute snapshot; watch perf logs. | low | clear canary list |
| **M4d** | Flip global `analytics_read_from_columns=true` in a calm window; match-night load test; confirm ~20 ms. | med | set flag false |
| **M4e** | Cleanup: remove the dead `teams`/`match_conduct`/`pool_settings` reads; delete the now-unused recompute code **only after** the flag has been stable. | low | revert commit |
| **M4f** *(optional, separate)* | Per-pool response caching (`'use cache'` + `cacheTag('leaderboard:'+poolId)`, invalidate on score change). Additive; needs care around auth. | med | remove cache wrapper |

Note: the route has **no `force-dynamic`** to drop (roadmap wording is slightly off) — it's dynamic by virtue
of being an authed handler. Caching is the M4f opportunity, not a one-line removal.

---

## 9. Scope boundaries

- **In scope:** the full_tournament / progressive leaderboard (`/api/pools/[id]/leaderboard`). Mobile consumes
  the **same route**, so it benefits with **no OTA** (same pattern as the badge_unlocks read-union).
- **Out of scope:** **bracket-picker** pools score via `bonus_scores`, not `predictions`, and have a separate
  analytics path — their precompute is a parallel ~2–3 day track (own writer + columns), tracked separately.
- **Out of scope:** shadow scoring engine cutover (different, blocked item).

---

## 10. Done when

1. Parity script = **0 diffs** (stored vs live recompute) across sampled pools, at display precision.
2. Global flag ON; leaderboard query ~**20 ms** (from ~516 ms); a match-night load test holds on Medium.
3. Dead reads removed; recompute code deleted post-stability.
4. Mobile + web leaderboards visually identical to pre-flip.

---

## 11. ⛔ Parity gate result (2026-07-13) — FLIP BLOCKED

Ran `scripts/parity-entry-analytics.ts --sample 10` (read-only). **429 diffs / 892 entries (~48%)**, including
large level gaps (e.g. stored L4 vs fresh L8). The stored `entry_xp_state` analytics/level columns do **not**
match a current recompute. Verified findings:

- **Not a data-staleness issue in the usual sense.** Example entry `6440775c` (pool `99f79ce7`): 100 `match_scores`
  rows, 660 pts, `last_rank_update` 07-10, `match_scores.updated_at` max 07-12 03:42:40, `analytics_updated_at`
  07-12 03:43:04 — i.e. analytics written *after* the last input change, inputs unchanged since. Yet stored
  `total_xp = 1015` vs a fresh recompute `= 4545`. **Same inputs, different output.**
- **Not code drift.** The only post-write commit touching the analytics compute is `8bb75bc` (07-12 20:51),
  and reading its diff confirms it computes `totalXP`/`level` *before* the badge union and does **not** change
  them (union affects only the displayed badge list, and only when `everEarnedBadgeIds` is passed — which the
  writer does not). Earlier attribution to `8bb75bc` was **wrong** and retracted.
- **The current writer is deterministic** — re-running parity on the same pool twice gives byte-identical diffs
  (59/59). So the stored value was not produced by the current compute on the current inputs.
- **Conclusion:** the columns were written **incorrectly at backfill time** (07-12 03:4x — most likely a partial
  `match_scores` read during a concurrent re-score) and, because the sweep's change-detection keys off
  `pool_entries.last_rank_update` (recalculate.ts:564–574), **settled pools never re-sweep** and the bad values
  are frozen. The 3 clean pools were written slightly later and happen to match.
- **Already user-visible (independent bug):** `entry_xp_state.current_level` is read live by the **web pools list**
  (`app/pools/page.tsx:96`) and **dashboard** (`app/dashboard/page.tsx:186`) — so those surfaces already show
  **stale levels** for settled pools. This is the web sibling of the mobile *"Pool card: level wrong"* roadmap item.

### Prerequisite before M4c/M4d
1. ✅ **Correctness re-materialize — DONE 2026-07-13.** `scripts/rematerialize-entry-analytics.ts` (diff-only writes)
   corrected **1575 entries across 189 of 520 pools**, 0 errors. Parity re-verified **0 diffs / 1850 entries** (40
   richest pools). Side effect: the live **web stale-level bug** (pools list + dashboard `current_level`) is now fixed.
2. ⏳ **Durable freshness — TO BUILD (design below).** The event sweep only refreshes pools whose `last_rank_update`
   moves, so settled pools never re-sweep and drift after any bad write / compute change. Fix = a **full backstop
   sweep** (all full/progressive pools, **diff-only** writes so it's gentle) on a moderate cadence, reusing the writer;
   optionally a post-bulk-recalc hook for faster convergence. Compute-version stamp is a later precision optimization.
3. **Re-run parity → 0 diffs**, then resume M4c (canary) → M4d (global).

M4a (flag-gated read branch, default off) and M4b (parity script) are correct and are what surfaced all of this.
Nothing is enabled in prod; no code deployed.
```
