# M4 — Read-path flip: leaderboard + form tab read from entry_xp_state

**Status: DRAFT for review. No code changed, nothing deployed.** This is the milestone that delivers the CPU win (stop per-viewer recompute) and lets us drop XL → Medium (M6).

## Goal
Point the leaderboard and form/analytics tabs (web + the APIs mobile uses) at the precomputed `entry_xp_state` columns instead of recomputing analytics on every read. Backfill (M1) + cron (M2) are already live, so the columns are populated and self-maintaining.

## The feature flag = the instant backout
New `sync_settings` row **`analytics_read_from_columns`** (jsonb bool, default **false**).
- Every changed surface reads this flag. **false → exact current behavior (live compute).** **true → read columns.**
- **Backout level 1 (instant, no deploy):** `UPDATE sync_settings SET setting_value='false' WHERE setting_key='analytics_read_from_columns';` → every surface reverts to live compute on the next request. This is the primary safety net — flipping the read path is reversible in one SQL statement.

## Fallback rules (defense in depth — even with flag ON)
A surface uses a stored column ONLY when: flag is true **AND** the entry has an `entry_xp_state` row with `analytics_updated_at IS NOT NULL`. Otherwise it falls back to live compute for that entry. This means:
- **Bracket pools** (no columns) → automatically keep live compute. No special-casing needed.
- **Any not-yet-backfilled / brand-new entry** → live compute until the cron catches it.
- So a missing/null column can never blank out a value — it silently falls back. **Backout level 2** is automatic and per-entry.

## Known tradeoff to accept
Points/rank come from `pool_entries` (updated by the scoring sweep instantly). Analytics now come from the cron (up to ~1 min behind a score change during a live match). So during live play there's a <60s window where points have ticked but form/XP/level haven't yet. Acceptable (matches sync cadence); note it. The live-compute path was instant but cost per-viewer — that's the trade we're making.

## Per-file changes

### M4a — `app/api/pools/[pool_id]/leaderboard/route.ts` (serves mobile; reference implementation)
1. Near the top, read the flag once: `readFromColumns = (sync_settings.analytics_read_from_columns === true)`.
2. Fetch the columns for all entries in ONE query (alongside the existing entries fetch):
   `select entry_id, total_xp, current_level, last_five, current_streak, hit_rate, total_completed, exact_count, contrarian_wins, crowd_agreement_pct from entry_xp_state where entry_id in (…)` → Map by entry_id.
3. In the per-entry loop (currently lines ~291–396), branch:
   ```ts
   const col = readFromColumns ? xpByEntry.get(entry.entry_id) : null
   if (col && col.analytics_updated_at != null) {
     // READ PATH — populate the same fields from columns
     last_five = col.last_five ?? []
     current_streak = col.current_streak ?? { type: 'none', length: 0 }
     hit_rate = col.hit_rate ?? 0
     exact_count = col.exact_count ?? 0
     level = col.current_level ?? 1
     level_name = getLevelName(level)           // from lib/levelNames.ts, single source
     total_xp = col.total_xp ?? 0
     contrarian_wins = col.contrarian_wins ?? 0
     crowd_agreement_pct = col.crowd_agreement_pct ?? 0
     total_completed = col.total_completed ?? 0
   } else if (predictions.length > 0) {
     // …existing live compute path, unchanged (fallback) …
   }
   ```
4. Downstream (sort, awards, superlatives) is unchanged — it only reads these fields.
5. **CPU win:** the read path skips `computeCrowdPredictions` (which today runs O(entries) PER entry → O(entries²)/request), `computeStreaks`, and `computeFullXPBreakdown`. That quadratic crowd cost is the main thing that saturated the DB.
6. **Phase-2 optimization (separate, after parity proven):** when `readFromColumns` and the pool is all-prediction-mode, SKIP the paginated `predictions` + `match_scores` fetches entirely (they're only needed for live compute). Big IO win; keep for a follow-up so the first flip is minimal-diff.

### M4a — `app/api/pools/[pool_id]/entries/[entry_id]/analytics/route.ts` (Form tab / mobile)
Same pattern: read the one entry's columns when flag-on + present; else existing live compute. Note this route returns MORE than the stored columns (accuracy-by-stage, pool-wide stats) — only swap the fields we store (xp/level/form/streak/hit/exact/contrarian/crowd); leave the rest computing for now (or store them later).

### M4b — Web (`app/pools/[pool_id]/page.tsx` + `PoolDetail` + `AnalyticsTab` / `XPProgressSection` / `LeaderboardTab`)
The web computes analytics client-side from props (pool page is `force-dynamic`). Bigger change:
1. Pool page server component: fetch `entry_xp_state` columns for the pool's entries (one query), pass down as a `xpByEntry` prop through `PoolDetail` to the tabs.
2. `LeaderboardTab` / `AnalyticsTab` / `XPProgressSection`: when flag-on + column present, use the prop instead of calling `computeFullXPBreakdown`/`computeStreaks`; else compute (fallback). Same flag + fallback rules as the API.
3. Remove `export const dynamic = 'force-dynamic'` from the pool page once reading columns (it was there to keep live compute fresh; no longer needed) — enables caching.
4. Do M4b AFTER M4a is proven (mobile flip first, lower-risk, fewer surfaces).

## Caching (M4 phase 2 — stacks on top, separate step)
Once reads are cheap column fetches:
- Cache the leaderboard response per pool (Next cache / unstable_cache or route segment cache), keyed by pool_id, with tag `leaderboard:{pool_id}`.
- Invalidate on score change: the scoring sweep / analytics cron already knows which pools changed → call `revalidateTag('leaderboard:'+poolId)` (or bump a per-pool version). During a live match this refreshes on each goal; between matches it serves cache for hours.
- This is what takes "cheap per-viewer read" to "near-zero DB hits" at thousands of viewers. Do after the read-flip is stable.

## Backout plan (layered)
1. **Instant, no deploy:** flip `analytics_read_from_columns=false` → all surfaces revert to live compute next request. (Primary.)
2. **Automatic per-entry:** null/missing column → live-compute fallback (can't blank a value).
3. **Cache backout:** if caching misbehaves, set a short/zero revalidate or disable the cache tag; reads still cheap (columns).
4. **Full revert:** `git revert` the deploy. Columns/cron remain (harmless, unread).

## Verification (before trusting the flip)
- **In-prod parity canary:** with the flag, hit the leaderboard API for sample pools with flag OFF vs ON and diff the JSON — must be identical (modulo the <60s live-lag). Script: fetch both, compare analytics fields per entry.
- **Then load test (M5):** simulate the 140+-concurrent-viewer scenario that crashed Medium; confirm cheap reads + cache hold. Gate before M6 (drop XL).

## Rollout order
M4a (leaderboard API) → parity canary → enable flag for it → watch a live match → M4b (web) → parity → caching → M5 load test → **M6 drop XL→Medium**.

## To prepare now (safe, no behavior change)
- Create the flag row default false: `INSERT INTO sync_settings(setting_key,setting_value) VALUES('analytics_read_from_columns','false') ON CONFLICT DO NOTHING;` (no code reads it yet — harmless).
- Implement M4a behind the flag (flag false in prod → zero behavior change on deploy), deploy, then flip the flag to test in a controlled window.
