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
| RN — Home screen (`mobile/lib/useHomeData.ts`) | `/api/users/[user_id]/home-scoring` → `readSource` | ✅ fixed |

**Every scoring read on web and the RN home screen now resolves through `readSource`.**

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
- exactly **one** carried points: entry `53a55116` (`CEM`) in
  `PES PREDICTS 2026 WORLD CUP WINNER`, 223 points with **zero** predictions

**⚠ CORRECTED 2026-07-28.** I first called that the known empty-bracket bonus inflation
and said shadow was *right* to show 0. **Both wrong.** Checked properly, the 223 is
`pool_entries.point_adjustment` — a MANUAL admin award, reason *"Based on submissions"*.
There are no `match_scores`, no `bonus_scores` and no `predictions` rows at all:

| field | value |
|---|---|
| match_points | null |
| bonus_points | null |
| **point_adjustment** | **223** |
| scored_total_points | 223 |

So shadow is **wrong** to show 0 — it is dropping a legitimate manual adjustment, because
it only writes a `shadow_entry_totals` row for entries it SCORES, and an entry with no
predictions never gets one. The adjustment lives on `pool_entries` and shadow's read path
never consults it for an entry it has no row for.

**Blast radius is exactly one entry.** Platform-wide, 164 entries carry a non-zero
`point_adjustment`; 32 are in shadow-enabled pools; 31 of those have a shadow row and
**all 31 carry the adjustment correctly and agree with prod**. CEM is the only casualty,
and no further entries are at risk on a wider cutover (0 adjusted entries outside the
enabled set lack a shadow row).

**Durable fix:** shadow must materialise a row for any entry with a non-zero
`point_adjustment`, scored or not — otherwise the same loss recurs the moment an admin
awards points to someone who didn't submit.

**Run `scripts/verify-read-paths.ts` before adding any pool to the flag**, not after.

### One trap worth naming

`requireSuperAdmin()` hands back the **user-scoped** client, not the service role. Shadow
tables are RLS deny-all (0 policies), so reading them with it returns nothing and
`readEntryScoring` zero-fills — which would have blanked every score in the super-admin
view, the one place a score discrepancy actually gets diagnosed. The admin user route
creates its own `createAdminClient()` for this; the admin pool route already had one.

---

## 2d. The RN home screen was not mis-sourced — it was dead

Routing the home screen through an API route turned up something the source audit
was not looking for. Both of its scoring queries selected columns that **do not exist
on either `match_scores` or `shadow_match_scores`**:

```
form / accuracy:  is_exact_score, is_correct_difference, is_correct_result
streak:           points_earned
```

Both 400 on every call. Both call sites destructured only `{ data }`, discarding the
error, so `data` was null and the code fell through to its empty defaults. Net effect,
for as long as this has been shipped:

- form dots on the home screen — **always empty**
- accuracy aggregates — **always zero**
- best streak — **always 0**

The boolean triple was only ever a re-derivation of `score_type`, which does exist and
already holds exactly `'exact' | 'winner_gd' | 'winner' | 'miss'`. So the fix and the
re-sourcing are the same change.

Verified against live data: the route's derivation reproduces `readRecentForm` exactly
on sampled entries, and one sample pulled **1,042 rows** — past PostgREST's 1,000-row
cap, so the old unbounded `.in()` would have truncated at exactly this scale even had
it worked.

### Shape, not just source

The route returns **one small object per entry** — form, accuracy counts, streak,
points, rank — instead of every scored row for every entry the user owns.

The counting happens in Postgres (`entry_match_score_summary`, migration 037), so
those rows never leave the database at all. Measured platform-wide, if every user
loaded their home screen once:

| | Rows leaving the database |
|---|---|
| Before | 287,098 |
| After | 4,982 |

**~58×**, and on a 40-entry sample the RPC returned 11 rows where the Node path pulled
1,042 (**94.7×**), in less wall-clock time (106 ms vs 170 ms).

Parity is exact: zero field-level mismatches across the sample — counts, streak and
form arrays all identical to the Node derivation it replaces. The function is
`SECURITY INVOKER` with EXECUTE granted to `service_role` only, so it cannot become a
route around shadow's deny-all RLS. `EXPLAIN` confirms the unused source table is
pruned from the plan entirely rather than merely filtered.

### On the 1,000-row cap — a correction

An earlier draft of this audit implied Profile's unpaginated read was actively
truncating. It was not. The worst-affected real user has **520** scored rows and
**no user currently exceeds 1,000** — the 1,042-row figure came from a test set that
deliberately unioned sampled entries, not from anyone's account.

The pagination is still right to have, and becomes load-bearing as soon as a second
competition lands: a Premier League season is 380 matches, so three PL pools puts a
user past the cap. But it was a latent risk, not a live one.

### Failure mode if the OTA lands before the web deploy

`fetchHomeScoring` is wrapped in `.catch(() => [])`, so an unreachable route leaves
form/accuracy/streak empty — identical to today's behaviour — and points and rank fall
back to the PostgREST `pool_entries` columns. Degraded, not broken, and no worse than
current. **The mobile half needs an OTA to reach users; Ryan controls that timing.**

---

## 3. What to do, in order

| # | Change | Why here |
|---|---|---|
| ~~1~~ | ~~Route the 5 web bypass surfaces through `readSource`~~ | ✅ **done** — all web surfaces resolve through `readSource` |
| ~~2~~ | ~~Move the RN home-screen scoring reads behind an API route~~ | ✅ **done** — `/api/users/[user_id]/home-scoring`; needs an OTA to reach users |
| 3 | **Kill the 30s full-page poll / ship derived consensus** | The actual egress reduction — §2a |
| 4 | Narrow the remaining web `select('*')` | Real but small; bounded queries already |

Only after 1 and 2 can `prod_scoring_enabled` go false without leaving surfaces reading dead
columns. **1 and 2 are both done** — the remaining work is item 3 (the 30s poll) and
the classic-pool cutover, neither of which blocks `prod_scoring_enabled = false`.

Still outstanding on RN: `usePoolEntries` / `usePoolDetail` / `usePredictions` read
PostgREST directly, but they read predictions and pool metadata, not scoring — they
are not part of this cutover.

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
