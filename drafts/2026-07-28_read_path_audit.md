# Read-path audit — shadow coverage + egress

_2026-07-28. Answers: (1) does every web + RN read path go through the shadow engine, and
(2) does it fetch only what it needs. Companion to `2026-07-26_scalable_architecture_plan.md`,
whose §1.1 measured **READ = 70.3% of all database time** — reads are the cost._

**Headline: no.** Scoring reads split cleanly into two populations, and only one of them can
ever see shadow.

---

## 1. The pattern: detail surfaces use readSource, summary surfaces bypass it

| Surface | Path | Sees shadow? |
|---|---|---|
| Pool leaderboard, points breakdown, entry analytics | `readSource` | ✅ |
| Public boards `/play/*` | `readSource` | ✅ |
| `lib/poolData.ts` (the shared pool fetch) | `readSource` | ✅ |
| `lib/analytics/entryAnalytics.ts` | `readSource` | ✅ |
| Web — My Pools list (`app/pools/page.tsx`) | `readSource` | ✅ fixed |
| Web — Dashboard (`app/dashboard/page.tsx`) | `readSource` | ✅ fixed |
| Web — Profile (`app/profile/page.tsx`) | `readSource` | ✅ fixed |
| Web — Activity API (`app/api/users/[user_id]/activity/route.ts`) | `readSource` | ✅ fixed |
| Web — Admin pool + user routes (`app/api/admin/{pools,users}/[id]`) | `readSource` | ✅ fixed |
| **RN — Home screen** (`mobile/lib/useHomeData.ts:436,627`) | **direct PostgREST `match_scores`** | ❌ |

**Every web surface now resolves through `readSource`.** Only the RN direct-PostgREST
hooks remain, and they cannot be fixed in place — see §1a.

**Consequence before the fix:** all 859 bracket_picker members read shadow on the pool
leaderboard, and prod on the My Pools list and the app home screen. Same member, same score, two
sources. They agree today only because prod and shadow are at parity — the moment they diverge
(a bug, a stale sweep, a rollback) the two surfaces disagree and there is no signal telling anyone.

**This is a genuine hole in the cutover plan**, not a nice-to-have: `prod_scoring_enabled = false`
would leave these surfaces reading columns nothing maintains.

### 1a. The RN app is the larger half

Mobile is split:

- **Leaderboard / breakdown / analytics** go through the **web API routes**, which use
  `readSource` ⇒ they DO follow shadow. ✅
- **Home screen and pool-detail hooks hit PostgREST directly** (`useHomeData`, `usePoolEntries`,
  `usePoolDetail`, `usePredictions`, …) ⇒ they can never follow shadow, because `readSource` is
  server-side TypeScript the app never executes. ❌

So "point mobile at shadow" is not a config change. Either those hooks move behind an API route
that uses `readSource`, or the app needs its own source-resolution — and duplicating that logic in
the client is exactly the divergence this programme keeps removing. **Route them through the API.**

---

## 2. Over-fetching — better than expected, with one structural exception

The 2026-07-26 audit's two worst offenders are already fixed and shipped:

| Item | Then | Now |
|---|---|---|
| `predictions.*` in the shared pool fetch (33% of all DB time) | `select('*')`, 11 cols | narrowed to the 8 used — **5,420 kB → 3,854 kB** on the largest pool |
| `match_conduct` read unscoped at 14 sites | full-table, silent 1,000-row truncation | scoped + paginated via `lib/matchConduct.ts` (13 of 14; `advance-teams` remains) |

**The RN app is clean.** Zero `select('*')` anywhere in `mobile/` — every query names its columns,
e.g. `match_scores → entry_id, points_earned, calculated_at`. Nothing to fix.

**Web `select('*')` that remains is bounded**, not full-table: `bracket_picker_*` scoped by
`.eq('entry_id', …)`, or pool-wide with `.in(...) + .range(...)` pagination. Worth narrowing for
payload size, but it is not the egress problem.

### 2a. The real remaining egress problem is payload shape, not column lists

`getPoolData` still ships **3,854 kB** of raw prediction rows for the largest pool, and
`PoolDetail.tsx:666` re-serialises it into the RSC response **every 30 seconds per open tab**,
regardless of tab visibility. That is the dominant egress term — bigger than any `select('*')` —
and it is a client fix (kill the poll, ship derived consensus ~100 rows instead of ~13,000), not a
query fix. See the architecture plan §5.2a and §6.1.

---

## 2b. Three readers, not one — over-fetch is a real trap here

Routing a surface through `readSource` is not automatically a win. `readMatchScores`
returns the 22 columns in `MATCH_SCORE_SHARED_COLS`; Profile needs 4 and the activity
feed needs 9. Using the general reader would have fixed the source while making the
egress **worse** — the opposite of the goal. So the module now has three readers, chosen
by what the surface renders:

| Reader | Columns | Bounding | Used by |
|---|---|---|---|
| `readMatchScores` | 22 | paginated (all rows) | full breakdowns |
| `readMatchScoreClassification` | 4 | paginated (all rows) | Profile prediction labels |
| `readRecentMatchScoreEvents` | 9 | `limit` (newest N) | activity feed |
| `readRecentForm` | 2 | `limit 5` | form dots |

Profile's previous query was also **unpaginated** — a user in enough pools silently hit
PostgREST's 1,000-row cap and stopped seeing older predictions classified. Fixed by
construction now.

For entries spanning both sources (a user in one cut-over pool and one prod pool), the
feed reads each source separately and merges: the global newest-N is a subset of
(newest-N from each), so this is exact, not an approximation.

---

## 2c. The zero-fill hazard these overlays inherit

`readEntryScoring` back-fills any requested entry that has no row as all-zero. That is
right for the leaderboard, but every surface now overlaying shadow onto `pool_entries`
inherits it: an enabled pool whose entries lack `shadow_entry_totals` rows renders zeros
where prod showed a number.

Measured across all 83 enabled pools (`scripts/verify-read-paths.ts`):

- 998 entries, **139 with no `shadow_entry_totals` row**
- **none** of the 139 had submitted predictions
- exactly **one** carried points: entry `53a55116` in `PES PREDICTS 2026 WORLD CUP WINNER`,
  223 points with **zero** predictions

That last one is the known empty-bracket bonus inflation, where shadow is **right** to
show 0. So unifying the read path removes an inflated number rather than creating a
wrong one — and the profile/admin views now agree with the leaderboard, which already
read shadow.

**Run `scripts/verify-read-paths.ts` before adding any pool to the flag**, not after.

### One trap worth naming

`requireSuperAdmin()` hands back the **user-scoped** client, not the service role. Shadow
tables are RLS deny-all (0 policies), so reading them with it returns nothing and
`readEntryScoring` zero-fills — which would have blanked every score in the super-admin
view, the one place a score discrepancy actually gets diagnosed. The admin user route
creates its own `createAdminClient()` for this; the admin pool route already had one.

---

## 3. What to do, in order

| # | Change | Why here |
|---|---|---|
| ~~1~~ | ~~Route the 5 web bypass surfaces through `readSource`~~ | ✅ **done** — all web surfaces resolve through `readSource` |
| 2 | **Move the RN home-screen scoring reads behind an API route that uses `readSource`** | The larger half. Do NOT reimplement source resolution in the app. |
| 3 | **Kill the 30s full-page poll / ship derived consensus** | The actual egress reduction — §2a |
| 4 | Narrow the remaining web `select('*')` | Real but small; bounded queries already |

Only after 1 and 2 can `prod_scoring_enabled` go false without leaving surfaces reading dead
columns. **1 is done; 2 is the remaining blocker.**

---

## 4. Verification

A surface is correctly wired when, for a shadow-enabled pool, it renders the **same** numbers as
the pool leaderboard. The practical test: enable one pool, then compare its member's score on the
leaderboard vs the My Pools list vs the app home screen. Today those can silently differ.

`scripts/verify-read-paths.ts` automates both halves: it exercises the readers against
live data and reports the zero-fill risk per enabled pool.

For egress specifically: re-measure with `pg_stat_statements` **after a counter reset** (the
337.5-hour cumulative figure predates every fix), and read the actual bytes from the Vercel and
Supabase dashboards — PostgREST aggregates responses into a single JSON row, so `rows` in
`pg_stat_statements` is always 1 and carries no size information.
