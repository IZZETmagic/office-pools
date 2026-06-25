# Leaderboard Scale Plan — getting off XL + fixing egress

> **Status:** ACTIVE execution doc. Created 2026-06-25. This is the single reference for the
> compute (XL) + egress remediation. Update the checkboxes and "Decisions log" as we go.
> **Golden rule for this whole change:** it works today — it's just expensive. We never break a
> working surface to make it cheaper. Every step is flag-gated or trivially revertible, verified
> before the next step, and the **current expensive code stays in place as the fallback** until
> its replacement is proven.

---

## 0. How to use this document

- **Plain-language pre-brief (REQUIRED before every phase):** before any code is written for a phase,
  Claude first tells Ryan, in simple non-technical terms: (a) **what will change**, (b) **what users will
  see/feel (if anything)**, (c) **what could go wrong and how we'd undo it**. No phase starts until Ryan
  has had that brief and said go. The goal is that Ryan always knows — in everyday language — exactly what
  we're doing to the live app and why it's safe.
- Work **top to bottom**. Do not start a phase until the previous phase's **Exit gate** is checked and I've asked you the **Decision question** for it.
- Every phase has: **Goal → Changes → Supabase/platform traps → Self-audit → Exit gate (question for you) → Backout**.
- Nothing here deploys during a live match. Deploys happen in a **calm window** (no match kicking off within ~2 hours, funnel clear).
- "Self-audit" = I run typecheck + an **independent reviewer agent** + a **parity check** before claiming a step is done. We learned the hard way (the analytics cron) that my first pass can carry silent bugs; the re-audit is mandatory, not optional.

---

## 1. Root cause (settled, evidence-based — do not relitigate)

From `pg_stat_statements` on 2026-06-25:

| What | Calls | DB CPU |
|---|---|---|
| `SELECT predictions.* WHERE entry_id IN (...)` | **6.7M** | **~89 hrs** |
| Realtime WAL decode (subscription system) | 10.5M | ~58 hrs |
| `SELECT match_scores.*` | 2.6M | ~7 hrs |

Whole `predictions` table = **254,219 rows**. We pulled "a pool's predictions" **6.7 million times**.

**Root cause (one sentence):** the web pool page renders the leaderboard by pulling the entire
pool's raw predictions + match_scores and computing in the browser, and it re-runs that pull on
**every Realtime event for every viewer** (`app/pools/[pool_id]/page.tsx` is `force-dynamic` and
the comment on line ~24 confirms `router.refresh()` fires on every Realtime event).

This single pattern is **both** problems on two different meters:
- **Compute** (the 89 hrs of prediction pulls) → why we're on **XL**.
- **Egress** (those same rows shipped out) → the **86.4% PostgREST** egress.

Realtime is a *second* compute load (WAL decode) but is egress-cheap (5.9%); it's the **trigger**
that multiplies the pulls.

**Therefore:** one architecture fixes both. They were never two separate problems.

---

## 2. Target architecture (one design, three layers)

Standard pattern: a **materialized read model + cache + event-driven invalidation** — i.e. the
"compute once, store, read everywhere" principle already in `CLAUDE.md`, finished.

- **Layer 2 — Cache** (per-pool data, invalidate on score change). *Fewer DB hits.*
- **Layer 1 — Read model** (store everything the leaderboard shows; read it, never recompute). *Smaller/zero raw pulls.*
- **Layer 3 — Realtime discipline** (narrow subscriptions, debounce refresh). *Stop the trigger multiplying.*

**Sequence decision (settled):** **Caching first, then read model, then realtime.**
Rationale: caching is the *fastest* and *lowest-risk-to-the-live-app* route off XL (it changes
where data comes from, not what the screen renders — zero UI rewrite), and it is a *permanent*
component, not a throwaway. The read model is the durable egress fix but requires rewriting the
most-viewed UI mid-tournament, so it goes second once XL pressure is off.
**The one fact that would flip the order:** if the page's per-user and per-pool data can't be
cleanly separated for caching (leak risk). **Phase 0 verifies exactly this before we commit.**

---

## 3. Supabase & platform limitations to design around (READ EVERY PHASE)

These have bitten us before. Every new/changed query must be checked against this list.

1. **PostgREST 1000-row default cap (THE big one).** Any `.from().select()...` returns **max 1000
   rows silently** — no error, just truncation. This caused the analytics-cron missed-pools bug.
   - **Rule:** any query that *could* return >1000 rows MUST either paginate with `.range(off, off+999)`
     in a loop (see existing pattern in `page.tsx` lines ~170–336 and `lib/analytics/entryAnalytics.ts`)
     OR aggregate server-side in SQL/RPC (see `get_changed_analytics_pools`).
   - **High-risk tables here:** `predictions` (254k rows), `match_scores` (160k), `bonus_scores` (50k),
     and the bracket_picker tables. Per-pool slices can exceed 1000 for big pools.
2. **Large `.in()` lists.** Thousands of `entry_id`s in one `.in()` can hit URL-length/perf limits via
   PostgREST. Prefer a server-side join (RPC) for pool-wide pulls; paginate when using `.in()`.
3. **Realtime costs DB CPU even when egress is tiny.** WAL decode scales with subscribed tables/rows.
   Narrow subscriptions (Layer 3); don't subscribe to broad tables.
4. **`CREATE INDEX` locks the table** briefly. Use a calm window, or `CREATE INDEX CONCURRENTLY`
   (cannot run inside a transaction). ~5k-row tables are sub-second; `predictions` (254k) is not — use CONCURRENTLY.
5. **Cron overlap.** Vercel/pg_cron runs can overlap; long runs need a lock (we built
   `try_acquire_analytics_lock`). Any new cron needs the same.
6. **`maxDuration`.** Functions are killed at the limit (cron is 120s). Bound work per run; never
   assume a single run processes everything.
7. **Admin client bypasses RLS.** Caching shared per-pool data uses the **admin client deliberately**.
   The flip side: **never put per-user data inside a shared cache** (leak risk). This is the Phase 0 check.
8. **`numeric(p,s)` columns force rounding.** `entry_xp_state.hit_rate`/`crowd_agreement_pct` are
   `numeric(5,2)` → 2dp. Any live-compute path compared against them must round identically (this was
   a real parity bug). Round in code, don't rely on the column.
9. **Cached vs uncached egress billing.** Cache hits bill at $0.03/GB vs $0.09 uncached, and Supabase
   only counts cache hits for *Storage* — our DB-response caching happens at **Vercel**, so cache hits
   mean **zero Supabase egress**, not "cheaper Supabase egress."
10. **`revalidateTag` only runs in the Next.js runtime.** If the scoring sweep runs outside Next
    (Supabase pg_cron / edge function), it cannot call `revalidateTag` directly — it must ping a Next
    route, OR we rely on the short-TTL backstop. **Phase 0 confirms how the sweep is invoked.**
11. **Next.js 16.1.6 caching model.** Use `'use cache'` + `cacheTag`/`cacheLife` (or `unstable_cache`
    as fallback). The page stays dynamic (per-user); only the **per-pool data fetch** is cached. Exact
    API/config (`cacheComponents` flag) verified in Phase 0 against installed version — do not assume.

---

## 4. Roadmap (phased, gated)

Legend: ☐ todo · ☑ done. Each phase ends with a **question for Ryan** before proceeding.

### Phase 0 — Spike & verify (NO production changes) — *de-risks the whole plan*
**Goal:** confirm the two assumptions the plan rests on, so we don't commit to the wrong path.

- ☐ **0.1** Read installed Next 16.1.6 caching API: is `'use cache'` available/configured? Does it need
  `cacheComponents` in `next.config`? Confirm `revalidateTag` + `cacheLife` usage. Write findings here.
- ☐ **0.2** Map `page.tsx` data into **per-pool (shareable)** vs **per-user (must stay dynamic)**:
  - Per-pool (cacheable): `pool`, `members`+entries, `settings`, `teams`, `matches`, `match_conduct`,
    `bonus_scores`, `match_scores`, `allPredictions`, all `bracket_picker_*` (all-entries), `bp_provisional_scoring`.
  - Per-user (NOT cacheable): `auth.getUser`, `users` lookup, `membership`, `isAdmin`, `userEntries`,
    `userPredictions` (default entry), per-user `bp*` for default entry, `roundSubmissions`.
  - ☐ Confirm the per-pool set can be fetched by a single `'use cache'` function with the **admin client**
    and contains **no per-user field**. If clean → caching-first confirmed. If messy → escalate to me, we re-sequence.
- ☐ **0.3** Confirm how the scoring sweep is invoked (Vercel cron route vs pg_cron) → decides whether
  tag-invalidation is direct or needs a revalidate endpoint (limitation #10).
- ☐ **0.4** Confirm `match_conduct` is fetched **unfiltered** today (line ~154) — flag as a free win.

**Exit gate / DECISION QUESTION 0:** "Phase 0 found X (clean split / messy split / sweep is Y). Do we
proceed caching-first as planned, or re-sequence?" — *I will ask you this with the findings before any code.*

**Backout:** none (read-only spike).

---

### Phase 1 — Layer 2: cache the per-pool data (the XL fix)

Done in two safe sub-steps so the first, simplest version already relieves XL.

#### Phase 1a — short-TTL cache (simplest possible, big win, lowest risk)
**Goal:** stop 6.7M per-viewer pulls without any invalidation wiring — bound staleness by time alone.
- ☐ Extract the per-pool fetches (from 0.2) into one `getPoolData(poolId)` function marked `'use cache'`,
  with `cacheLife` ≈ **30–60s**, fetched via **admin client**, **fully paginated** (limitation #1).
- ☐ `page.tsx` calls `getPoolData(poolId)` for shared data; keeps per-user fetches inline/dynamic.
- ☐ Fix the `match_conduct` unfiltered pull (scope to tournament) while we're here (0.4).
- ☐ Gate behind `sync_settings` flag **`pool_cache_enabled`** (default false) so we can switch caching
  off instantly without a deploy. (Mirror existing flag pattern.)

**Supabase traps to check here:** #1 (paginate predictions/match_scores/bonus/BP), #7 (admin client, no
per-user field in cache), #11 (exact `'use cache'` API).

**Self-audit:**
- ☐ Typecheck.
- ☐ Independent reviewer agent: hunt for (a) any per-user field leaking into the cached function,
  (b) any un-paginated query, (c) staleness > TTL, (d) output differs from current render.
- ☐ **Parity:** with flag off vs on, the rendered leaderboard for 3 sample pools (1 small, 1 large >1000
  predictions, 1 bracket pool) is **identical** except up-to-TTL freshness.
- ☐ Canary: enable flag for the test window, watch `pg_stat_statements` calls for the predictions query
  drop sharply, and confirm no visible UI change.

**Exit gate / DECISION QUESTION 1a:** "Caching is live behind the flag, predictions-pull calls dropped
from N to M, no visual change, staleness ≤60s. OK to leave it on and move to invalidation (1b)?"

**Backout:** set `pool_cache_enabled=false` (instant, no deploy) → page reverts to direct fetches =
**exactly today's behaviour**. If needed, Vercel instant-rollback to the pre-Phase-1 deploy.

#### Phase 1b — event invalidation (freshness without waiting for TTL)
**Goal:** refresh a pool's cache the moment its scores change, so we can keep TTL short *and* fresh.
- ☐ In the scoring sweep (`lib/scoring/recalculate.ts`, where `last_rank_update` is stamped ~line 619),
  trigger `revalidateTag('pool-'+poolId)` for each changed pool — directly if the sweep runs in Next
  (per 0.3), else via a small authenticated `/api/revalidate` route the sweep calls.
- ☐ Keep the short TTL as a backstop (so a missed invalidation self-heals in ≤60s).

**Self-audit:**
- ☐ Reviewer agent: confirm invalidation fires for *every* changed pool, can't throw and break the sweep
  (wrap in try/catch — invalidation failure must never block scoring), and isn't called per-entry (dedupe per pool).
- ☐ Verify: change a score in a test pool → cached leaderboard updates within seconds, not 60s.

**Exit gate / DECISION QUESTION 1b:** "Invalidation works; leaderboards update on score change. Ready to
plan the load test + XL drop?"

**Backout:** invalidation is additive; remove the call or rely on TTL. Caching flag still the master off-switch.

---

### Phase 2 — Load test, then drop XL → Medium
**Goal:** prove DB CPU is comfortably low under match-like load *before* downgrading.
- ☐ Load test: simulate match-window traffic (many concurrent pool views + Realtime refreshes) against
  the cached path. Watch DB CPU, connections, `pg_stat_statements`.
- ☐ Only if CPU sits well within Medium's headroom → schedule the downgrade in a calm window.

**Exit gate / DECISION QUESTION 2:** "Load test shows peak DB CPU at X% (Medium headroom is Y). Recommend
dropping to Medium on [date/time, calm window]. Proceed?" — *your call, I won't downgrade without it.*

**Backout:** re-upgrade XL (near-instant). Document the exact current tier in `memory/supabase_project.md`.

---

### Phase 3 — Layer 1: read model (the egress fix; makes reads never pull raw data)
**Goal:** the leaderboard reads stored values; raw predictions are pulled only for editing/scoring.
Most of this is **already built** (`entry_xp_state` backfilled 4,872/4,872; cron + mobile read path exist).
- ☐ **3.1** Finish storing everything the surfaces display (the gap is the **form tab's full XP breakdown**
  — needs the breakdown stored as JSON, "M4c"). Inventory each displayed value → confirm a stored source.
- ☐ **3.2** Flip the **web** Leaderboard/Analytics tabs to read stored values (remove client recompute),
  behind existing flag **`analytics_read_from_columns`**. Keep the current compute path as the **fallback**
  when a column is missing (bracket pools, un-swept entries).
- ☐ **3.3** Flip the **mobile** leaderboard API read path (already built, `analytics_read_from_columns`).
- ☐ **3.4** Re-point the cached `getPoolData` to fetch the **small** stored rows instead of raw predictions
  (cache wrapper stays; only the query inside changes — minimal rework, as promised).
- ☐ **3.5** Apply the analytics-cron hardening already drafted (`drafts/2026-06-20_analytics_cron_hardening.sql`)
  before relying on the cron for freshness.

**Supabase traps:** #1 (the small reads are <1000/pool but verify), #8 (numeric rounding parity), #5 (cron lock).

**Self-audit:**
- ☐ Typecheck + reviewer agent on each flip.
- ☐ **Parity the correct way:** compare the **live route/page output** with the flag ON vs OFF for sample
  entries (NOT writer-vs-writer — that's the comparison that hid the rounding bug). Must match to displayed precision.
- ☐ Canary a few pools with the read flag before global flip.

**Exit gate / DECISION QUESTION 3:** "Read model is live for web+mobile, parity verified, egress on the
PostgREST predictions query dropped to ~zero for leaderboard views. Confirm before removing any old path?"

**Backout:** `analytics_read_from_columns=false` (instant) → live compute path (still present) takes over.
Cache flag independent.

---

### Phase 4 — Layer 3: realtime discipline (final compute trim)
**Goal:** stop `router.refresh()` re-rendering the whole page on every event; cut WAL-decode load.
- ☐ Narrow Realtime subscriptions to only what a pool view needs; debounce/throttle refresh.
- ☐ Consider replacing full-page refresh with targeted state updates from the subscription payload.

**Self-audit:** reviewer agent + manual: live updates still arrive; no missed updates; CPU for WAL decode drops.

**Exit gate / DECISION QUESTION 4:** "Realtime trimmed, live updates intact, WAL-decode CPU down X%. Done?"

**Backout:** revert the client subscription change (UI-only, no data risk).

---

## 4b. Cost model (verified against Vercel pricing 2026-06-25)

**Plan: Vercel Pro** is required (Hobby = non-commercial + hard caps, no overage; Enterprise unnecessary).
Pro = $20/mo + usage credit + on-demand. Caching needs **no plan change**.

**Honest accounting — caching RELOCATES bytes, it doesn't delete them:**
- ⬇️ **Supabase compute (XL)** — big drop (DB stops executing the heavy query). *The unambiguous win → off XL.*
- ⬇️ **Supabase egress** — drop (queries don't hit Supabase).
- ⬆️ **Vercel Data Cache storage** — trivial (~0.12 GB total).
- ⬆️ **Vercel Data Cache reads/writes** — cheap (cents; image-cache proxy ≈ $0.40/1M reads, $4/1M writes).
- ⬆️ **Vercel Fast Origin Transfer** — **goes UP**: Data Cache reads are billed here, so the function still
  moves ~the same byte volume per render, just from cache instead of Supabase. **This is the meter to watch.**
- ➡️ **Vercel→browser (Fast Data Transfer)** — unchanged in Phase 1a.

**Implication for sequencing (does not change the plan, sharpens it):** caching = the fast **compute** fix
(off XL). The **byte** cost is only truly reduced by **Layer 1** (cache a small precomputed snapshot, not the
raw blob) + **Layer 3** (fewer renders). So Layer 1 must follow caching promptly, or we trade the Supabase
egress overage for a Vercel Fast Origin Transfer bill. End state (L1+L2+L3): small snapshot, cached, fetched
rarely → cheap on every meter. Exact regional $/GB rates to confirm on vercel.com/pricing before XL-drop sign-off.

## 5. Global backout plan (panic buttons, fastest first)

| Lever | How | Effect | Speed |
|---|---|---|---|
| Caching off | `sync_settings.pool_cache_enabled=false` | Page fetches direct = today's behaviour | instant, no deploy |
| Read model off | `sync_settings.analytics_read_from_columns=false` | Live compute path resumes | instant, no deploy |
| Analytics cron off | `sync_settings.analytics_sweep_enabled=false` | Stops background writes (reads unaffected) | instant, no deploy |
| Code rollback | Vercel **Instant Rollback** to last known-good deploy | Whole app to prior version | ~seconds |
| Compute rollback | Re-upgrade Supabase XL | Restores headroom if Medium too small | ~minutes |

**Known-good baseline:** tag the current commit before Phase 1 (`git tag pre-scale-plan`). The current
expensive code IS the working fallback — **we do not delete the live-compute path or the direct fetches
until Phase 3 parity is proven and you sign off.** Every phase leaves the previous working path intact behind a flag.

---

## 6. Self-audit methodology (applied every phase, non-negotiable)

1. `tsc --noEmit` clean on touched files.
2. **Independent reviewer agent** with an adversarial brief specific to the change (leaks, pagination,
   staleness, parity, error-swallowing). We re-audit the *fixes* too (the cron taught us the first fix can add bugs).
3. **Parity check on live output**, flag ON vs OFF — never writer-vs-writer.
4. **Canary** a small set of pools before any global flag flip.
5. **Pagination check**: grep every new query for a `.range()` loop or SQL aggregation (limitation #1).
6. Watch `pg_stat_statements` before/after to confirm the intended call/CPU drop actually happened.

---

## 7. Decisions log (append as we go)

- 2026-06-25 — Root cause confirmed via pg_stat_statements (predictions pull = 6.7M calls / ~89 hrs CPU).
- 2026-06-25 — Sequence set: **cache → read model → realtime**. Rationale + flip-condition in §2.
- 2026-06-25 — Mobile (14 testers) de-prioritised; all load is the website.
- 2026-06-25 — **Phase 1b built (uncommitted, NOT deployed).** `poolCacheTag()` + `invalidatePoolCache()`
  in `lib/poolData.ts`; `recalculatePool` calls it once per pool on the success path (`recalculate.ts:299`).
  Uses Next 16 `revalidateTag(tag, { expire: 0 })` (single-arg form deprecated). Typecheck clean. Independent
  audit: **PASS all points, no issues** — fully try/catch wrapped + synchronous so it can never affect/slow
  scoring; throws caught in non-request (script) contexts; no circular import; fires once per pool (not per
  entry). Caching piece (1a+1b) now code-complete. Next gate: deploy (flag OFF) in calm window → flip
  `pool_cache_enabled` true with canary (watch predictions-pull call count drop + leaderboard freshness).
- 2026-06-25 — **Phase 1a built (uncommitted, NOT deployed, flag default OFF).** New `lib/poolData.ts`
  (`getPoolData`/`getPoolDataCached`/`getPoolDataUncached`/`isPoolCacheEnabled`); `page.tsx` refactored to
  fetch shared per-pool data via it, per-user data stays inline. Typecheck clean. Independent audit:
  **no Critical/Major** — no per-user leak, full parity on uncached path, pagination correct (also fixed a
  latent un-paginated bracket-picker truncation bug), `match_conduct` now tournament-scoped (was whole-table),
  flag fails safe to today's behavior. One deliberate behavior change: `fetchAllPages` THROWS on a query error
  instead of silently returning partial rows (so a partial leaderboard is never cached). Next: Phase 1b
  (wire `revalidateTag('pool-data-'+poolId)` into the sweep) before flipping `pool_cache_enabled` true.
- 2026-06-25 — **Phase 0 complete.** Findings: (0.1) no `cacheComponents` in next.config → use
  **`unstable_cache`** (scoped, no global config change), not `'use cache'`. (0.2) per-pool vs per-user
  split is **clean**; only fix = predictions pull must use **admin client** inside the cache (no per-user
  field leaks). (0.3) `recalculatePool` runs **inside Next** (called from `app/api/cron/sync-fixtures` etc.)
  → `revalidateTag` callable directly, no extra endpoint. (0.4) `match_conduct` pulled unfiltered — fix in 1a.
  **Decision Q0: proceed caching-first.**
- 2026-06-25 — **Phase 1a/1b final parity verified + committed (flag OFF, not deployed).** Final audit caught
  one real divergence: `allBP*` (bracket all-entries) was being fetched with the ADMIN client in the shared
  cache, but its RLS is per-VIEWER (non-admins read only their own picks) — caching it shared would have
  changed visible standings for 803 non-admin members across 51 live bracket pools. FIX: `allBP*` removed from
  the shared cache entirely and fetched per-viewer with the user client in page.tsx (exactly as the original).
  Confirmation audit: **bracket data now matches original exactly.** Net: with cache OFF, the page is provably
  zero-visual-change (all shared tables are member-readable so admin-client returns identical data; match_conduct
  filter is a proven no-op for the single tournament; fetchAllPages logs+breaks like the original).
  DEFERRED correctness items (separate, Ryan-timed — they CHANGE visible standings, so not bundled): (a) bracket
  all-entries 1000-row truncation for ADMIN viewers of ~13 large pools; (b) the pre-existing quirk that non-admin
  bracket viewers see provisional scoring only for their own entry, stored for others.
- _add new decisions here…_

## 8. Open questions for Ryan (will be asked at the gates above)
- Q0 (after spike): proceed caching-first or re-sequence? (depends on per-user/per-pool split)
- Q1a: leave caching on after canary?
- Q1b: invalidation good → plan load test?
- Q2: load-test numbers OK → drop to Medium on [date]?
- Q3: read model parity OK → start retiring old paths?
- Q4: realtime trim done?
