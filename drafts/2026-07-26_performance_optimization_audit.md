# Full-stack performance audit — web + mobile

_Drafted 2026-07-26. Supersedes the caching-only scope of
`2026-07-19_caching_infrastructure_plan.md`, which remains valid as the caching layer
design; this document is the wider "stop doing unnecessary work" pass that has to land
underneath it._

**Framing:** caching a wasteful query makes the waste cheaper, not smaller. The order is
(1) stop asking for data we don't use, (2) stop asking repeatedly for data that hasn't
changed, (3) stop recomputing what we already computed, and only then (4) cache what's
left. Layers 1–3 also shrink what the cache has to hold, so they make layer 4 cheaper too.

---

## 0. Where the time actually goes (measured, not estimated)

From `pg_stat_statements` on `ujthamlehjyubbzxbnes`, cumulative since the counters were
last reset. Grand total across all statements: **337.5 hours** of database execution time.

| Rank | Statement | DB hours | % of all DB time | Calls | Mean |
|---|---|---:|---:|---:|---:|
| 1 | `SELECT predictions.* WHERE entry_id = ANY(...)` | **111.3** | **33.0%** | 30.0M | 9.5–89.5ms |
| 2 | Realtime WAL decoding (`wal->>...`) | 80.9 | 24.0% | 16.6M | 10.8–21.5ms |
| 3 | `row_to_json(pool_members)` join shapes | 34.5 | 10.2% | 8.6M | 404–450ms |
| 4 | `SELECT match_scores.* WHERE pool...` | 31.0 | 9.2% | 8.8M | 13.3ms |
| | **Top four combined** | **257.7** | **76.4%** | | |

Two things fall out of this table immediately:

- **A third of every second this database has ever spent working went to
  `SELECT predictions.*`.** Not to scoring, not to writes — to re-reading every prediction
  in a pool, 30 million times.
- The `row_to_json(pool_members)` shapes average **404–450ms per call** and were called
  8.6M times. These are the slowest statements in the system by mean.

Volume context: `predictions` holds **288,029 rows** across **4,985 entries**. The largest
pool (`Polla Mundialera - Banco Ripley`) has **192 entries / 13,385 predictions**; four more
pools are over 8,000.

---

## Tier 1 — Over-fetching: asking for columns and rows we never read

### 1.1 `predictions.*` in the shared pool fetch ⟵ **the single biggest item in the audit**

[`lib/poolData.ts:241`](../lib/poolData.ts) — `.select('*')` over every entry in the pool,
paginated, ordered. This is statement #1 above: **33% of all database time.**

`predictions` has 11 columns. The `PredictionData` type consumes 8. So
`confidence_level`, `created_at`, and `updated_at` — three columns, two of them
`timestamptz` — are read, `json_agg`'d, shipped over the wire, parsed, and discarded on
every single call. On the largest pool that's 13,385 rows × 3 unused columns per render.

**Honest sizing:** narrowing the column list does not by itself turn 39.6ms into 3.8ms.
The cheap 3.8ms sibling statement is a *single-entry* lookup, so it is not a fair
column-width A/B — most of the 39.6ms is row volume, not width. Expect column narrowing
to buy roughly the payload/serialisation share (~25–30%), and the *real* win to come from
Tier 2 and Tier 4 not issuing the query at all.

### 1.2 `match_conduct` read as a whole table, 14 times over

Fourteen call sites read the **entire** `match_conduct` table — no filter, no pagination:

| Surface | Location |
|---|---|
| Web page | `app/dashboard/page.tsx:141`, `app/profile/page.tsx:192` |
| API | `leaderboard/route.ts:102`, `entries/[entry_id]/analytics/route.ts:97`, `entries/[entry_id]/bracket-analytics/route.ts:101`, `bonus/calculate/route.ts:85`, `bracket-picks/calculate/route.ts:92`, `admin/advance-teams/route.ts:51` |
| **Scoring** | `lib/scoring/recalculate.ts:118`, `lib/scoring/shadowBrackets.ts:141`, `:443`, `:592` |
| Mobile | `mobile/lib/usePredictions.ts:131`, `mobile/lib/useBracketPickerPredictions.ts:113` |

**Four of these are inside the scoring engines** (`recalculate.ts` and `shadowBrackets.ts`).
Truncation there means wrong bonuses and wrong conduct tiebreaks, not just a slow page.

_Correction (Gill, 2026-07-26): an earlier draft of this section called
`shadowBrackets.ts` "the sole scorer since the 2026-07-19 cutover". That is wrong twice — the
read cutover was **rolled back on 2026-07-20** (`prod_scoring_enabled = true`), and
`shadowBrackets.ts` is a bracket **materialiser** whose own header states it never runs on the
live per-goal scoring path. The fix stands on its own merits; the severity framing did not._

`lib/poolData.ts:224` already does this correctly — it scopes to the tournament's match
ids and paginates, with a comment noting this exact bug was fixed there. The fix never
propagated to the other thirteen.

**This is also a latent correctness bug.** `match_conduct` has no `tournament_id` column,
so these reads are inherently cross-competition, and PostgREST silently caps them at 1,000
rows (see `supabase_postgrest_row_cap`). Today: 206 rows, safe. Premier League 2026/27 adds
380 matches ≈ 760 rows → **966 total**. The *next* competition after that crosses 1,000 and
card/conduct bonuses start silently computing against truncated data, with no error.

Multi-competition is the Aug 2026 target, so this needs fixing before ingestion lands, not
after.

**Status (2026-07-26): 13 of 14 fixed** via `lib/matchConduct.ts`, verified against
production data as byte-identical to the unfiltered read (206 = 206 rows, no drift, across
all three query shapes).

The exception is `admin/advance-teams/route.ts`, left deliberately with a blocker comment.
It reads matches, teams **and** conduct tournament-wide because the advancement cascade was
written for a single-tournament world — unscoped `matches` means it would resolve knockout
placeholders *across competitions*. Fixing it means deriving the tournament from `match_id`
and threading it through the cascade: a design change to advancement, not a query change.
**Blocker for the second competition.**

### 1.3 `select('*')` generally

68 occurrences across web. Most are harmless (single-row `pools`/`pool_settings` lookups).
The ones that matter are the multi-row ones already called out: `predictions` (1.1) and
`match_conduct` (1.2). Mobile is clean — it names columns nearly everywhere.

### 1.4 The RSC payload carries every member's predictions

`app/pools/[pool_id]/page.tsx:206` passes `visibleAllPredictions` into the client
component. For the largest pool that is up to 13,385 rows serialised into the Flight
payload **on every render** — and, because of Tier 2.1, every 30 seconds per open tab.

---

## Tier 2 — Redundant requests: asking again for what hasn't changed

### 2.1 The 30-second full-page poll

[`app/pools/[pool_id]/PoolDetail.tsx:666`](../app/pools/[pool_id]/PoolDetail.tsx):

```js
const interval = setInterval(() => router.refresh(), 30000)
```

Active on 4 of the tabs (`leaderboard`, `results`, `my_bracket`, `standings`). Because the
page is `export const dynamic = 'force-dynamic'`, every tick re-runs the **entire** server
component:

- `auth.getUser()` → `users` lookup → `pool_members` membership check
- `getPoolData()` — cached 45s, but a 30s poll against a 45s TTL misses roughly a third of
  the time, and misses are the expensive path
- the viewer's own predictions (uncached)
- for progressive pools: round states + submissions (uncached)
- for bracket pools viewed by an **admin**: all three `bracket_picker_*` tables paginated
  across every entry in the pool (uncached, per-viewer)
- then re-serialises the whole payload from 1.4

This runs regardless of tab visibility. It is *also* redundant with the Realtime
subscription directly above it, which already refreshes on score change with jitter — the
poll was added as a "in case Realtime misses an event" fallback and is firing
unconditionally as a primary.

This one interval is the most likely explanation for the `row_to_json(pool_members)`
statements at 8.6M calls (Tier 0 row 3).

### 2.2 Mobile re-resolves identity 11 times

Eleven mobile files run `users.select('user_id').eq('auth_user_id', ...)` on load:
`usePoolDetail`, `useHomeData`, `usePoolEntries`, `useActivity`, `usePoolBanter`,
`useDiscoverPools`, `usePendingActions`, `usePushNotificationHandlers`, `auth.tsx`,
`(tabs)/profile.tsx`, `pool-preview/[id].tsx`.

The `auth_user_id → user_id` mapping is immutable for the life of a session. Every one of
these is a round trip to fetch a constant. Web has the same shape 9 times via
`requireAuth()` (`lib/auth.ts:29`), once per API request.

### 2.3 Mobile has no client-side cache at all

No react-query, no SWR — hand-rolled `useState` + `useEffect` per hook. Combined with
`useFocusEffect` refetching on `results`, `index`, `pools`, `pool/[id]`,
`PredictionsTab`, and `useMemberRoster`, **every tab switch re-runs a full load**,
including `fetchLeaderboard` → the uncached, O(n²) route in Tier 3.1.

---

## Tier 3 — Redundant computation

### 3.1 `computeCrowdPredictions` runs once per entry, scanning the whole pool each time

[`app/api/pools/[pool_id]/leaderboard/route.ts:309`](../app/api/pools/[pool_id]/leaderboard/route.ts),
inside `for (const entry of entries)`.

`computeCrowdPredictions` (`analyticsHelpers.ts:315`) rebuilds `predsByMatch` — a full pass
over **every prediction in the pool** — on each call, then computes the per-match crowd
consensus, then applies the viewer's own picks on top.

Everything except that last step is **identical for every entry**. Only `userPredMap`,
`userIsContrarian`, and `userWasCorrect` vary.

For the largest pool: **192 entries × 13,385 predictions ≈ 2.57 million iterations** per
leaderboard request, plus 192 rebuilds of a ~13k-entry `Map`. The route is uncached, and
mobile calls it on every focus.

Splitting the pool-wide consensus (computed once) from the per-entry overlay (cheap map
lookup) makes this O(n + m) instead of O(n × m).

### 3.2 Analytics/XP recomputed on read while the precompute sits unused

Unchanged from the 2026-07-19 plan: `entry_xp_state` is materialised by the shadow engine
but `sync_settings.analytics_read_from_columns = false`, so every read recomputes.

---

## Tier 4 — Caching (the 2026-07-19 plan, still valid)

Restated in priority order, now that the tiers above shrink what needs caching:

- **4.1** Mobile API routes (`leaderboard`, `breakdown`, `analytics`, `matches/[id]/scores`)
  — no cache at all today. Short TTL + stale-while-revalidate rather than
  invalidate-on-every-score, so a full-time crowd is served stale-by-seconds from cache
  while one background refresh runs. Staleness budget is a product call (see §6).
- **4.2** Public boards `/play/*` and `/tv/*` — already ISR 30–60s; add `s-maxage` + SWR so
  the CDN absorbs them and most reads never reach origin.
- **4.3** Web pool page — already cached (45s, per-pool tag). Reconsider `expire: 0` on
  every score change: it blows every affected pool's cache at exactly the moment traffic
  peaks.
- **4.4** Shared KV/Redis — still probably unnecessary. Revisit under real load.

**Next 16.1.6 note:** Cache Components (`use cache`, `cacheLife`, `cacheTag`) is available
but **not enabled** in `next.config.ts`. The codebase is on the legacy `unstable_cache` +
route `revalidate` model. Enabling it is a separate, larger migration — not a prerequisite
for anything above, and not recommended in the same change as the fixes here.

---

## 5. Sequencing

Ordered by (value ÷ risk), and so that each step shrinks the next:

| # | Change | Tier | Risk | Why here |
|---|---|---|---|---|
| 1 | Narrow `predictions` select | 1.1 | very low | Touches the #1 statement; pure column-list change |
| 2 | Scope the 9 `match_conduct` reads | 1.2 | low | Fixes a latent correctness bug before multi-competition |
| 3 | Hoist `computeCrowdPredictions` | 3.1 | low | Pure refactor, no behaviour change; unblocks caching the route |
| 4 | Tame the 30s poll | 2.1 | low | Biggest request-count reduction; visibility-gate first |
| 5 | Cache mobile API routes | 4.1 | medium | Needs the staleness decision in §6 |
| 6 | Dedupe mobile identity | 2.2 | low | Mechanical; 11 files |
| 7 | Shrink the RSC payload | 1.4 | medium | Needs to establish what the client derives from it |
| 8 | Edge-cache public boards | 4.2 | low | Cheap, big audience |
| 9 | Mobile client cache | 2.3 | medium | Largest mobile change; do after 5 |

Items 1–4 are behaviour-preserving and can land together. 5 and 9 need product input.

---

## 6. Decisions needed from Ryan

1. **Staleness budget during live matches** — drives the Tier 4.1 TTL. The 2026-07-19 plan
   proposed 15–30s on the grounds that this is a predictions app, not a score ticker
   (`product-predictions-not-score-tracker`). Confirm 15s, 30s, or other.
2. **The 30s poll** — replace with visibility-gated + longer interval, or drop entirely and
   trust Realtime + pull-to-refresh? Dropping it is the bigger win but leans on Realtime,
   which has its own history here.
3. **Mobile client cache** — adopt a real caching layer (react-query) or hand-roll a
   lightweight TTL cache in the existing hooks? The former is a dependency and a refactor;
   the latter is more code to own.

## 7. Not in scope / deliberately excluded

- **Realtime WAL decoding at 24% of DB time** (Tier 0 row 2) is real and large, but it is a
  publication-configuration question, not an app-code one, and the banter migration to
  Broadcast-from-database (`banter_realtime_broadcast_migration`) already moved the worst
  offender. Worth its own pass — flagged, not addressed here.
- `ios/` (Swift) — not customer-facing (`production_surfaces`).
- Enabling Next Cache Components — see §4 note.
