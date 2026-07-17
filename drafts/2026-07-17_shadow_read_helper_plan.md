# Shadow read-path — read helper build plan

_Drafted 2026-07-17._

**END GOAL (Ryan, 2026-07-17): sunset the Node production scoring engine (`lib/scoring/recalculate.ts`) entirely; shadow becomes the sole scoring engine.** This doc is **Phase 1** of that sunset — the reversible READ cutover that proves shadow correct in the live app before we pull the plug on prod. It is the safe first step under either terminal architecture (see the arc below). Production scoring stays the source of truth until read is 100% shadow and stable.

### The full sunset arc
- **Phase A — shadow fidelity** (shared, shadow-only, zero customer impact): fix the parity alarm, widen `shadow_match_scores`, add the rank-movement snapshot. Needed no matter how we cut over.
- **Phase 1 — READ cutover** (this doc): read helper + per-pool flag → flip reads pool-by-pool → global. Reversible live validation.
- **Phase 2 — WRITE cutover / the actual sunset**: retire the Node recalc. ⚠ recalc is coupled to non-scoring side-effects (push notifications, `badge_unlocks`, `entry_xp_state` analytics snapshots, rank snapshots) — these must be re-homed onto the shadow pipeline or decoupled first. Scope this as its own workstream.
- **Phase 3 — decommission**: delete `recalculate.ts` + its cron; retire vestigial legacy columns.

### Terminal architecture — DECIDED 2026-07-17: **A (read-first)**
- **A. App reads shadow (read-first)** ✅ CHOSEN: the read helper is permanent; shadow_* tables are canonical; legacy scoring columns retired. Retiring prod = a deletion. Granular + reversible cutover; lands at the clean, tournament-agnostic store.
- ~~B. Shadow writes legacy tables (writer-swap)~~ — not chosen.

Consequence: **D1 is settled → widen `shadow_match_scores`** (the app reads it permanently, so it must carry the full read surface; reconstruct-at-read is off the table).

## 0. One-paragraph summary

Add a **single server-side read helper** that, per pool, reads scored/ranked data from either the prod columns (`pool_entries` / `match_scores` / `bonus_scores`) or the shadow tables (`shadow_entry_totals` / `shadow_match_scores` / `shadow_bonus_scores`), gated by a `sync_settings.shadow_read_enabled_pools` JSONB array of pool IDs. Because **the mobile app reads scoring exclusively through the web API routes**, routing those routes (plus the handful of web-only SSR read sites) through the helper flips both clients at once, per pool, with no mobile OTA. Rollback = empty the array. Before any pool can be flipped, three coverage gaps in the shadow tables must close (breakdown columns, rank-movement snapshot, the broken parity alarm).

---

## 1. The switch

**Flag:** `sync_settings.shadow_read_enabled_pools` — a JSONB **array of pool_id strings**. `[]` (or absent) = everyone reads prod. Add a pool_id = that pool reads shadow, on web + mobile. Remove it = instant rollback.

This mirrors the existing flag convention exactly (verified in DB): `setting_key` text + `setting_value` JSONB, read via
```ts
const { data } = await admin.from('sync_settings')
  .select('setting_value').eq('setting_key', 'shadow_read_enabled_pools').maybeSingle()
const enabled = (data?.setting_value as string[] | null) ?? []
```
Same shape as `scoring_engine_version`, `pool_cache_enabled`, `scoring_diff_writes_enabled`.

**Orthogonal to `analytics_read_from_columns`.** That existing flag gates the *`entry_xp_state`* precompute (XP / level / form — the gamification layer), a different table and concern. The shadow flag governs core scoring (points + rank). Keep them independent; the helper does not touch `entry_xp_state`.

**bracket_picker pools are hard-excluded.** They have zero shadow coverage (separate `lib/bracketPickerScoring.ts` engine). The helper returns `'prod'` for any `prediction_mode = 'bracket_picker'` pool regardless of the flag, so a stray id in the array can never break them.

---

## 2. Why this is one chokepoint, not two

- **Mobile** reads all scoring via the web API — `mobile/lib/api.ts`: `fetchLeaderboard → GET /api/pools/:id/leaderboard`, `breakdown → …/breakdown`, `analytics → …/analytics`. Zero direct column reads in `mobile/` (confirmed by grep). So the API routes are shared; flipping them flips mobile with **no app deploy / no OTA**.
- **Web in-pool** surfaces (leaderboard, breakdown, results, community, everyone-else) do **not** each hit the DB — they render off **one** SSR fetch, `lib/poolData.ts` `getPoolDataUncached` (pulls `pool_entries(*)` + `match_scores` + `bonus_scores`), passed as props. So converting `poolData.ts` alone covers all of them; the ~25 in-pool components are prop-consumers that inherit for free.
- **Web cross-pool** surfaces (dashboard, pools list, profile, peer-activity, push/email) are separate SSR/cron reads that span many pools at once — these are the wrinkle (see §7 D5).

Net: for a given pool, the read-source decision lives in **two** server chokepoints — `poolData.ts` (web) + the pool API routes (mobile). Both clients inherit it. A flipped pool is internally consistent across phone and web (no "100 on mobile, 50 on laptop").

---

## 3. The read helper — `lib/scoring/readSource.ts`

**✅ BUILT + verified (tsc + eslint clean) 2026-07-17.** Exports `getScoringSource` (+ `getShadowReadPools`), `readEntryScoring` → `Map<entry_id, EntryScoring>`, `readMatchScores` → `MatchScoreData[]`, `readBonusScores` → `BonusScoreData[]`. Shadow readers map column names (`total_points`→`scored_total_points`, `final_rank`→`current_rank`, `previous_final_rank`→`previous_rank`), derive `point_adjustment = total−match−bonus`, and synthesise the missing `id`/`bonus_id` PKs from natural keys. Prod mode reads the identical columns/tables/order as today ⇒ **flag-off is byte-identical**. bracket_picker forced to `prod`. The **Gap 2 TS wire** (`shadow_snapshot_ranks` alongside `snapshot_pool_ranks` in `lib/scoring/snapshotRanks.ts`) is also done.

Returns the **same normalized shape the routes already consume** (prod column names), so each caller changes one call, not its downstream logic.

```ts
export type ScoringSource = 'shadow' | 'prod'

// 'prod' if pool not in flag list OR prediction_mode === 'bracket_picker'
export async function getScoringSource(
  admin: AdminClient, poolId: string, predictionMode: string,
): Promise<ScoringSource>

export type EntryTotals = {
  entry_id: string
  match_points: number
  bonus_points: number
  point_adjustment: number
  scored_total_points: number      // canonical total
  current_rank: number | null
  previous_rank: number | null
}
export async function readEntryTotals(
  admin: AdminClient, entryIds: string[], source: ScoringSource,
): Promise<Map<string, EntryTotals>>

export type MatchScoreRow = { /* == match_scores read shape (see §4) */ }
export async function readMatchScores(
  admin: AdminClient, entryIds: string[], source: ScoringSource,
): Promise<MatchScoreRow[]>

export type BonusScoreRow = {
  entry_id: string; bonus_category: string; bonus_type: string
  description: string; points_earned: number
}
export async function readBonusScores(
  admin: AdminClient, entryIds: string[], source: ScoringSource,
): Promise<BonusScoreRow[]>
```

In `source === 'prod'` these `select` from the prod tables exactly as today. In `source === 'shadow'` they select from the shadow tables and **map the column names** (details in §4). Callers keep their pagination loops; the helper just supplies the query.

---

## 4. Column mapping — prod → shadow (verified against live schema)

### 4a. Rollup: `pool_entries` → `shadow_entry_totals`

| Read need | prod (`pool_entries`) | shadow (`shadow_entry_totals`) | status |
|---|---|---|---|
| canonical total | `scored_total_points` | `total_points` | ✅ rename |
| match points | `match_points` | `match_points` | ✅ |
| bonus points | `bonus_points` | `bonus_points` | ✅ |
| point adjustment | `point_adjustment` | folded into `total_points` | ⚠ derive `total − match − bonus`; `adjustment_reason` lives only in `pool_entries` |
| overall rank | `current_rank` | `final_rank` | ✅ rename |
| **previous rank (movement)** | `previous_rank` (snapshotted) | — none — | ❌ **net-new (Gap 2)** |

### 4b. Per-match: `match_scores` → `shadow_match_scores`

Shadow **has**: `score_type, base_points, multiplier, pso_points, total_points, teams_match` (+ `entry_id, match_id, pool_id, calculated_at`).

Shadow is **missing 12 columns** the read surface needs — **Gap 1**:
`match_number, stage, predicted_home_score, predicted_away_score, actual_home_score, actual_away_score, predicted_home_pso, predicted_away_pso, actual_home_pso, actual_away_pso, predicted_home_team_id, predicted_away_team_id`

- Leaderboard "form"/streaks/XP + the analytics route need the subset `match_number, stage, score_type, total_points`.
- The points-breakdown modal needs **all** of the above (predicted/actual scores, PSO, and knockout predicted team names).

### 4c. Bonus: `bonus_scores` → `shadow_bonus_scores`

Breakdown reads `bonus_category, bonus_type, description, points_earned` — **shadow_bonus_scores already has all four.** ✅ Clean swap, no schema change.

---

## 5. Phase A — coverage gaps to close BEFORE any flip

**Migration drafts — ✅ APPLIED + VERIFIED 2026-07-17** (Supabase migrations `shadow_phaseA_0_parity_alarm`(+`_diffkind`), `shadow_phaseA_1_widen_match_scores`, `shadow_phaseA_2_rank_snapshot`): [`_0_parity_alarm.sql`](2026-07-17_shadow_phaseA_0_parity_alarm.sql) · [`_1_widen_match_scores.sql`](2026-07-17_shadow_phaseA_1_widen_match_scores.sql) · [`_2_rank_snapshot.sql`](2026-07-17_shadow_phaseA_2_rank_snapshot.sql).
- **Gap 0** — was a *two-part* fix: `match_id` NULL **and** a `diff_kind` CHECK that rejected `entry_total_mismatch`. Alarm now runs: 639 shadow-ahead / **0 shadow-behind** (known SF-bonus prod-staleness).
- **Gap 1** — `shadow_match_scores` widened + backfilled (4 batches). Verified: **285,986 rows, 0 mismatches** vs `match_scores` across all 12 columns (group predicted-team NULL matches prod; knockout bracket mapping correct).
- **Gap 2** — `previous_final_rank` + `shadow_snapshot_ranks` live; 3,425 rows seeded. **Remaining:** the one-line TS wire in `lib/scoring/snapshotRanks.ts` ships with Phase 1.

### Gap 0 (prerequisite): fix the parity alarm
`shadow_detect_diffs()` (cron jobid 21) fails 100% — it inserts `entry_total_mismatch` rows with a NULL `match_id` into `shadow_score_diffs`, which is `NOT NULL`. This is our cutover green-light instrument; it must work first. Fix = make `shadow_score_diffs.match_id` nullable (or supply a sentinel), then re-run. Pure DB, no deploy. _(Tracked in the shadow-engine memory; do first.)_

### Gap 1: widen `shadow_match_scores` for the breakdown/analytics surface
**Recommendation — widen to a drop-in mirror.** Add the 12 columns from §4b and populate them in the `shadow_score_match` RPC (it already joins `matches`, `predictions`, and `shadow_entry_bracket` at scoring time, so the inputs are in scope — an additive INSERT). Then backfill by re-running the scorer over completed matches. This makes the read helper a pure table-swap and lets the parity alarm compare column-for-column.
_Alternative (leaner, riskier): keep shadow_match_scores lean and have the helper JOIN `matches` + `predictions` + `shadow_entry_bracket` to reconstruct breakdown rows at read time. Less storage, but duplicates the breakdown route's assembly logic (drift risk) and complicates parity diffing. See Decision D1._

### Gap 2: rank-movement snapshot
Prod freezes `current_rank → previous_rank` at each matchday baseline via `snapshot_pool_ranks(p_pool_ids)` (called on match-go-live when no other match is live — from the sync-fixtures cron and the `/api/pools/snapshot-ranks` admin route). `shadow_finalize_totals` only ever recomputes `final_rank` fresh; **there is no shadow `previous_rank`.** Without it, movement arrows (▲/▼) and the Biggest Climber/Faller superlatives are wrong in shadow-read mode.
**Fix:** add `previous_final_rank` to `shadow_entry_totals` + a `shadow_snapshot_ranks(p_pool_ids)` fn (copy `final_rank → previous_final_rank`), and call it at the **same trigger points** as `snapshot_pool_ranks` so both engines snapshot in lockstep. Helper maps `previous_final_rank → previous_rank`. See Decision D2.

### Gap 3: point adjustment (minor)
Shadow folds `point_adjustment` into `total_points`. Helper derives the displayed value as `total − match − bonus`. `adjustment_reason` (breakdown modal only) is admin metadata with no scoring analog — read it from `pool_entries` in both modes. No shadow schema change.

---

## 6. Call sites to route through the helper

**✅ ALL 7 POOL-SCOPED CHOKEPOINTS WIRED 2026-07-17** (behind the default-off flag; tsc clean; lint-neutral — 66 errs vs 67 pre-existing baseline; NOT deployed). `poolData.ts` (+ a `safeRead` wrapper preserving `throwOnFetchError`), leaderboard route, breakdown route, analytics route, `entryAnalytics.ts`, `matches/[id]/scores` route, and `play/[slug]/getLeaderboard.ts` (covers all 4 public/TV boards — the sargasso-sea local `getLeaderboard` is dead, type-only import). Flag absent ⇒ every pool resolves to `prod` ⇒ byte-identical. **Flip procedure:** set `sync_settings.shadow_read_enabled_pools = '["<pool_id>"]'` **and** call `invalidatePoolCache(pool_id)` (poolData is cached). Cross-pool surfaces deliberately left on prod (§7 D5).

**Confirmed (read directly, must convert):**
- `app/api/pools/[pool_id]/leaderboard/route.ts` — `pool_entries` rollup (L120-123) + `match_scores` (L243-249). _API — shared with mobile._
- `app/api/pools/[pool_id]/entries/[entry_id]/breakdown/route.ts` — `match_scores` (L155-159) + `bonus_scores` (L169-172) + totals. _API — shared with mobile._
- `app/api/pools/[pool_id]/entries/[entry_id]/analytics/route.ts` — `match_scores` (L213-216) + `current_rank` (L240). _API — shared with mobile._
- `app/play/[slug]/getLeaderboard.ts` + `app/play/sargasso-sea/getLeaderboard.ts` — `pool_entries(scored_total_points, current_rank, previous_rank)`. _Public, unauthenticated SSR — separate consumers._
- `app/pools/page.tsx`, `app/dashboard/page.tsx` — scored total + rank (level stays on `entry_xp_state`). _Web SSR._

**Full sweep inventory:** _(to be inserted from the read-site audit — the confirmed list above is the core; the sweep captures the SSR/TV/long-tail stragglers)._

**Not converted:** the rank-snapshot writer, emails, admin, and any cron that writes rather than reads user-facing scores. Write path is out of scope for this phase.

---

## 7. Decisions needed (Ryan)

- **D1 — shadow_match_scores: widen vs reconstruct-at-read?** ✅ DECIDED: **widen** (forced by Terminal A — app reads it permanently).
- **D2 — movement: add `previous_final_rank` + `shadow_snapshot_ranks` mirroring the prod snapshot?** Recommend **yes** (only way movement parity holds).
- **D3 — confirm bracket_picker hard-exclude in the helper** (recommend yes; they have no shadow arm).
- **D4 — pilot pool.** Pick a low-stakes staff/tester pool, ideally one currently in prod↔shadow parity (avoid the pools with the known prod-stale SF bonus so the pilot isn't confounded).

---

## 8. Build order

1. **Gap 0** — fix parity alarm (`match_id` nullable), re-run, confirm it reports the known SF drift. _(DB only)_
2. **Gap 1** — widen `shadow_match_scores` + populate in `shadow_score_match` + backfill completed matches. _(DB + backfill)_
3. **Gap 2** — `previous_final_rank` column + `shadow_snapshot_ranks` fn + wire into the two snapshot trigger points. _(DB + one line in the sync-fixtures cron + admin route)_
4. **Helper** — build `lib/scoring/readSource.ts` (flag read + the 3 readers, both sources). _(Code; default source = prod → no behavior change)_
5. **Route call sites** through the helper (§6), still defaulting to prod. Deploy. Verify byte-identical output with the flag empty (pure refactor).
6. **Parity gate** — parity alarm green across all shadow-covered pools (prod stale-SF converged or accepted).
7. **Flip the pilot pool** — add its id; validate leaderboard + breakdown + analytics on web and on the mobile testers; diff shadow-read vs prod-read for that pool.
8. **Widen** pool-by-pool (classic pools only) → then swap the array flag for a global boolean.

Steps 1-3 are shadow-only DB work (no customer impact). Step 5 is a pure refactor behind a default-off flag. The first customer-visible change is step 7, scoped to one pool, reversible in one edit.

---

## 9. Testing & rollback

- **Rollback:** empty `shadow_read_enabled_pools`. Instant, server-side, both clients.
- **Green-light:** the parity alarm at 0 true-errors for the pool(s) being flipped (shadow-ahead-on-stale-prod is acceptable and expected; shadow-behind is a blocker).
- **Refactor safety (step 5):** with the flag empty, helper output must be byte-identical to today — diff a few pools' API responses before/after.
- **Pilot validation (step 7):** for the pilot pool, compare the shadow-read response against a forced prod-read of the same pool; expect equality except the known prod-stale SF bonus (where shadow is correct).

## 10. Out of scope (later phases)

- Write cutover (shadow writes `pool_entries`/`match_scores`/`bonus_scores`; retire the Node recalc).
- A bracket_picker shadow arm.
- Folding the 3 bespoke reconcilers into the P2 version-watermark (durable-rearchitecture roadmap, independent of read cutover).
