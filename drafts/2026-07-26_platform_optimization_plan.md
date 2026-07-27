# SportPool platform optimization plan — task backlog

> ⚠️ **DEMOTED 2026-07-26, same day.** This was written as the master plan, then Ryan
> redirected: *pull back, don't undo* — look at the whole app from first principles rather
> than sequencing more work on top of the optimizations already in flight.
>
> **The master document is now `2026-07-26_scalable_architecture_plan.md`.** Read that first.
> It reframes §10's sequencing (the sweep overruns are a *broken product guarantee*, not a cost
> problem) and it holds one landed item this plan would have built on — see its §7.
>
> **What survives here:** the per-item findings, evidence and measurements in §2–§9. They are
> unchanged and still the detail behind the architecture plan. **What does not:** the phase
> ordering in §10, and the assumption in §2 that all four landed items should be extended.

_Drafted 2026-07-26. It consolidates and supersedes the
sequencing in:_

- `2026-07-19_caching_infrastructure_plan.md` — caching layers (still valid as design)
- `2026-07-26_performance_optimization_audit.md` — the DB read audit (Tiers 1–4)
- `2026-07-26_caching_strategy.md` — the all-layers caching call
- `2026-07-26_analytics_parity_result.md` — the blocker those two hit

_Those four remain the detail; this is the whole-platform view, the sequence, and the
decisions. **Nothing here has been executed beyond what §2 marks as landed.**_

---

## 1. What we are optimizing *for*

`SPORTPOOL_VISION.md` §3 settled this today, and it changes the priority of this entire
document:

> **A goal goes in — the standings move.** Points and standings are 100% correct, 100% of the
> time, and never stale by design.

And §3.3, explicitly:

> The earlier draft filed caching, over-fetch fixes and precompute as *hygiene*. That is now
> wrong. **Precompute is how we keep the guarantee.**

So this is not a cost-reduction plan that happens to make things faster. **It is
guarantee-keeping work.** The test for every item below is not "does this save money" but
*"does this make the leaderboard more certain to be right and current under load?"* Cost
savings are a by-product and are reported as such.

Two constraints inherited from the vision, both of which kill work that would otherwise look
attractive:

- **We do not build a ticker** (§3.1). Nothing here proposes polling match state faster than
  the 60s ingest. The floor is the data provider, not us.
- **Live standings ≠ live notifications** (§3.4.2). No item below adds a push on rank change.

And one hard date: **Premier League 2026/27, Aug 2026.** Three items in §7 are not
optimizations at all — they are defects that only *manifest* when a second competition
exists. They have a deadline the rest of this plan does not.

---

## 2. Status ledger — what is already written, and what it is waiting on

Substantial work is **already in the working tree, uncommitted**. The plan starts by landing
and verifying it, not by writing more.

| # | Change | Files | State |
|---|---|---|---|
| L1 | `predictions` select narrowed to the 8 used columns | `lib/poolData.ts` | ✅ written · measured 5,420 kB → 3,854 kB (−29%, as predicted) |
| L2 | `match_conduct` reads scoped + paginated via a shared helper | `lib/matchConduct.ts` + 13 call sites | ✅ written · verified byte-identical to the unfiltered read (206 = 206 rows, all 3 query shapes) |
| L3 | `computeCrowdPredictions` split into `computeCrowdConsensus` + `applyCrowdOverlay`, hoisted out of both per-entry loops | `analyticsHelpers.ts`, `leaderboard/route.ts`, `entryAnalytics.ts` | ✅ written · O(n×m) → O(n+m) |
| L4 | **XP has one owner.** `badges.ts` no longer invents `total_xp`; it consumes `computePoolEntryAnalytics`. Level ratchets via `highest_level_reached` | `badges.ts`, `entryAnalytics.ts`, `xpSystem.ts`, migration `026`, `xpSystem.level-ratchet.test.ts`, `scripts/reseed-entry-xp.ts` | ✅ written · **unverified against production** |

**L4 is the keystone.** It fixes the two-writer bug that blocked the read-path flip
(`project_bug_entry_xp_two_writers`), and it is a user-visible correctness fix in its own
right — `current_level` is already rendered on `/pools` and `/dashboard`, so today the level a
member sees depends on which writer touched their row last.

It also moved `computePoolEntryAnalytics` **onto the scoring path** (`badges.ts` runs from
`recalculate.ts` on every recalc). That is deliberate and it is the right trade — it keeps
`entry_xp_state` fresh as a by-product of scoring instead of depending on a sweep that
`vercel.json` never registered — but it means **the scoring path now carries analytics
cost**, and the scoring path is the one with the documented kickoff spike. That has to be
measured before it ships, not after.

### The immediate gate

```bash
npx tsx scripts/verify-analytics-parity.ts
```

Last run: **187/331 entries mismatched.** Until that comes back clean, nothing downstream of
precompute can proceed. Everything in §4–§6 that does *not* depend on it is marked
independent.

---

## 3. The measured baseline

From `pg_stat_statements` and `pg_stat_user_tables` on `ujthamlehjyubbzxbnes`, cumulative
since counters were reset. **337.5 hours** of total DB execution time.

| Rank | Statement | DB hours | % | Calls |
|---|---|---:|---:|---:|
| 1 | `SELECT predictions.* WHERE entry_id = ANY(...)` | 111.3 | **33.0%** | 30.0M |
| 2 | **Realtime WAL decoding** (`wal->>...`) | 80.9 | **24.0%** | 16.6M |
| 3 | `row_to_json(pool_members)` join shapes | 34.5 | 10.2% | 8.6M |
| 4 | `SELECT match_scores.* WHERE pool...` | 31.0 | 9.2% | 8.8M |
| | **Top four** | **257.7** | **76.4%** | |

Rows 1, 3 and 4 are the read audit — addressed by L1/L3 and §5. **Row 2 was explicitly
excluded from that audit** ("flagged, not addressed"). It is the second-largest cost in the
platform and no plan has covered it. §4 does.

Shape of the estate, because it decides every caching answer:

| | |
|---|---:|
| Pools | 623 |
| **Median pool size** | **1 member** |
| Pools ≤ 20 members | 562 (90%) |
| Pools ≥ 100 members | 4 (0.6%) |
| Largest pool | 192 entries / 13,385 predictions |
| Users seen in last 30d | 3,184 |

**Many keys, few reads per key** — the inverse of what a CDN wants. This is why §6 narrows
edge caching rather than extending it.

---

## 4. Layer A — Realtime / CDC · **the largest untouched item**

24% of all DB time, and no prior document addressed it. Measuring row-changes per published
table makes the cause unambiguous.

Tables in the `supabase_realtime` publication, by row changes (`upd + ins + del`):

| Table | Row changes | Share of CDC volume | Subscribers found in code |
|---|---:|---:|---|
| **`user_presence`** | **3,478,736** | **62.6%** | web `PresenceProvider.tsx:312` — `event:'*'`, **no filter** |
| **`pool_entries`** | **1,878,636** | **33.8%** | web `PoolDetail.tsx:627` (filtered), mobile `usePoolEntries` (filtered) |
| `user_pending_actions` | 112,540 | 2.0% | mobile `usePendingActions` (filtered) |
| `pool_members` | 60,713 | 1.1% | mobile ×3 (filtered) |
| `matches` | 9,981 | 0.2% | mobile ×2 |
| `pool_round_states` | 8,094 | 0.1% | **none found** |
| `pool_messages` | 4,838 | 0.1% | mobile ×2 (INSERT) |
| `pool_message_reactions` | 343 | <0.1% | **none found** |
| `user_activity` | 0 | 0% | **none found** — table is empty |

**Two tables are 96.5% of it.**

### 4.1 `user_presence` — an ephemeral signal stored durably · 63% of CDC volume

`user_presence` is a *derived, disposable* fact ("is this person looking right now"). We
store it in a durably-WAL-logged Postgres table, upsert it **every 25 seconds per open tab**
(`PresenceProvider.tsx:43`), and subscribe to it with `event: '*'` **and no filter**.

That last detail is the expensive one. Every one of the 3.48M changes is WAL-decoded once and
then authorization-evaluated *per subscriber* — so cost is **O(changes × concurrent
viewers)**. It gets quadratically worse exactly as we succeed. For a platform targeting
thousands, that is the wrong shape.

**Supabase Presence is the purpose-built primitive for this** — channel-based, in-memory,
never touches WAL or the WAL decoder. Moving to it removes ~63% of CDC volume *and* 3.5M
writes/vacuum churn, and deletes a table rather than optimizing one.

- **Effect:** the single largest available DB reduction in this plan.
- **Risk:** medium — presence is user-visible, and there is a known open `user_presence` RLS
  residual (`project_backlog_mobile_error_triage`) that this would retire rather than fix.
  Behind a flag, with the table left in place until the channel version is proven.
- **Caveat to check first:** presence currently has a `postgres_changes` fast-path *plus* a
  poll (`PresenceProvider.tsx:292`). Confirm which one users actually depend on before
  removing either.

### 4.2 `pool_entries` — irreducible, but tunable · 34% of CDC volume

These 1.87M updates *are* the guarantee: scoring writes ranks and totals, clients learn the
standings moved. We do not want fewer of these events; we want each to cost less.

Two things to verify rather than assume:

1. **Are the writes diff-gated?** `scoring_diff_writes_enabled = true` is on
   (`project_scale_downgrade_xl_medium`), but confirm it covers `pool_entries` and not only
   `match_scores`. A sweep that rewrites an unchanged row still produces WAL and still wakes
   every subscriber.
2. **Is the payload minimal?** `postgres_changes` ships the whole row. The client needs
   "something changed in this pool, refetch" — a `realtime.send` broadcast on a
   `pool:{id}` topic carries a few bytes instead, and we already have that pattern working
   from the banter migration (`022_banter_realtime_broadcast.sql`,
   `banter_realtime_broadcast_migration`). **This is the proven reusable fix, not a new
   design.**

### 4.3 Publication hygiene — honest sizing

Three published tables have no subscriber in the codebase (`pool_round_states`,
`pool_message_reactions`, `user_activity` — the last is empty). Removing them is correct
hygiene and reduces decoder surface, but at 8,437 combined row changes it is **0.2% of the
volume. Do it, don't count on it.** I am flagging it so it isn't mistaken for a win.

> **Method caveat:** `pg_stat_user_tables` and `pg_stat_statements` may have different reset
> points, so the 63%/34% split is internally consistent within the table counters but should
> not be multiplied against the 80.9 DB-hours figure to produce a precise hours-saved
> estimate. Re-measure after a counter reset (§9).

---

## 5. Layer B — Precompute · highest leverage, ~80% built, switched off

The cheapest cache is the one you don't need because the data is already stored in the shape
you read it in. `entry_xp_state` and the shadow engine's materialised totals already exist.
`sync_settings.analytics_read_from_columns = false`, so **every read recomputes anyway.**

A leaderboard read should be an indexed `SELECT`, not a computation — no staleness semantics,
no invalidation, no per-region problem. It is strictly better than caching the computation.

**Chain to unblock it** (steps 1–2 are L4, already written):

1. ✅ One definition of `total_xp` — `computeFullXPBreakdown`, reached via
   `computePoolEntryAnalytics`
2. ✅ `badges.ts` consumes it instead of inventing one; level ratchets so the correction
   cannot demote the ~231 entries already shown a higher level
3. ⬜ **Re-run the parity check — must come back clean**
4. ⬜ Decide the sweep question: `vercel.json` is `{}`, so no Vercel cron is registered at
   all. L4 makes the scoring path refresh these columns, which may make the sweep
   unnecessary — but that needs confirming for pools that are *not* being recalculated
   (completed competitions, pools with no live matches). **Open question in §8.**
5. ⬜ Flip `analytics_read_from_columns → true`. Instantly reversible via the flag.

**Effect:** a leaderboard read drops from a ~400ms recompute to a few-ms indexed SELECT. This
is what §1 means by "precompute is how we keep the guarantee" — it is the difference between
standings that are current under load and standings that queue.

---

## 6. Layer C — Request volume, payload, and cache

### 6.1 The 30-second full-page poll · biggest request-count reduction

`PoolDetail.tsx:666` — `setInterval(() => router.refresh(), 30000)`, active on 4 tabs,
against a `force-dynamic` page. Every tick re-runs the entire server component: auth →
membership check → `getPoolData` (45s TTL, so a 30s poll misses ~⅓ of the time, and misses
are the expensive path) → the viewer's predictions → round states → for admins, all three
`bracket_picker_*` tables paginated across every entry.

It runs **regardless of tab visibility**, and it is redundant with the Realtime subscription
immediately above it, which already refreshes on score change with jitter. It was added as a
fallback and is firing as a primary. This is the most likely source of the 8.6M
`row_to_json(pool_members)` calls (baseline row 3).

It also defeats the web client cache entirely — fixing it makes RSC + router cache start
working for free.

Because of §1, this cannot simply be *lengthened*: the fallback exists so standings can't
silently stall. Correct shape: **visibility-gate it, lengthen it, and keep Realtime as the
primary** — so an open tab still updates on the goal, and a backgrounded tab costs nothing.

### 6.2 The payload is a hard blocker for any shared cache

| Shape | Size (largest pool) |
|---|---:|
| `select('*')` — before L1 | 5,420 kB |
| Narrowed to 8 columns — after L1 | **3,854 kB** |

**3.8 MB still exceeds Vercel Runtime Cache's 2 MB per-item limit.** The current
`getPoolData` shape *cannot be stored there at all* for the pools that matter most. It is
also serialised into the RSC response **every 30 seconds per open tab** — brutal on cellular,
expensive in bandwidth.

> **Shrinking this is a prerequisite, not a parallel nice-to-have.**

The fix direction is now available because of L3: the client needs *derived* facts (crowd
consensus, per-entry stats), not 13,385 raw rows. `computeCrowdConsensus` can run server-side
once and ship ~100 rows instead of ~13,000.

### 6.3 Then, and only then, cache

| Layer | Call |
|---|---|
| **0 — React `cache()`** | **Adopt, it's free.** Dedupes `isPoolCacheEnabled()`, `requireAuth()`, `getScoringSource()` within a request. No staleness, no invalidation. |
| **1 — Client** | Web: exists, defeated by 6.1. Mobile: **nothing at all** — see 6.4. |
| **2 — CDN** | **Narrow it.** Assets, flags, and the genuinely public `/play/*` + `/tv/*` only. Add `s-maxage` + SWR there. **Never pool detail** — median pool is 1 member, so hit rate ≈ 0%; Vercel's edge is many isolated PoPs, which multiplies cold misses across 623 low-traffic keys; and it is auth-gated and viewer-shaped anyway (own picks, admin visibility, the pre-lock reveal gate). Keying by user takes cardinality to ~4,800 and the hit rate to zero. |
| **3 — Next Data Cache** | In use (45s, per-pool tag). Change `revalidateTag(tag, {expire: 0})` → stale-while-revalidate. `expire: 0` hard-expires every affected pool at the exact moment traffic peaks: a goal at full time blows the cache for everyone simultaneously. SWR serves seconds-stale to the crowd while **one** background refresh runs. |
| **4 — Shared KV** | Runtime Cache once 6.2 clears. **Hold on Redis** — but the case for it is specific: a leaderboard *is* a sorted set. `ZADD`/`ZREVRANGE`/`ZRANK` give top-N and a member's rank in O(log n). If Redis goes in, it goes in as the **leaderboard data structure**, not a generic blob cache. |
| **5 — DB precompute** | §5. Highest leverage. |

**The principle:** push work *down* to Layer 5 wherever the shape is stable; cache at 3/4
only what genuinely cannot be precomputed; keep the CDN out of per-pool data entirely.

### 6.4 Mobile · largest untapped win, needs no server change

- **No client cache exists.** No react-query, no SWR — hand-rolled `useState`/`useEffect`,
  and six surfaces refetch on `useFocusEffect`. **Every tab switch re-runs a full load**,
  including the uncached, formerly-O(n²) leaderboard route. Decision already recorded:
  **react-query** (`2026-07-26_caching_strategy.md` §7.2).
- **Identity is re-resolved 11 times.** Eleven files run
  `users.select('user_id').eq('auth_user_id', …)` on load. The mapping is immutable for the
  life of a session. Web has the same shape 9× via `requireAuth()`. Mechanical fix.
- **Cold start** remains open from the mobile perf initiative (`project_mobile_perf_ota`),
  alongside Banter open/close and icon consolidation.

---

## 7. Layer D — Multi-competition blockers · **hard deadline: Aug 2026**

These are not optimizations. They are latent defects that stay invisible until a second
competition exists, and Premier League 2026/27 is the target. They are in this plan because
the same audit found them and they share the same code.

| # | Defect | Why it detonates on competition #2 |
|---|---|---|
| D1 | **`advance-teams` reads matches, teams and conduct tournament-wide** (`admin/advance-teams/route.ts`, left with a blocker comment) | Unscoped `matches` means the advancement cascade resolves knockout placeholders **across competitions**. Fixing it means deriving the tournament from `match_id` and threading it through — a design change to advancement, not a query change. |
| D2 | **PostgREST's silent 1,000-row cap** (`supabase_postgrest_row_cap`) | `match_conduct` has no `tournament_id`. Today 206 rows. PL adds 380 matches ≈ 760 rows → 966. The *next* competition crosses 1,000 and conduct bonuses silently compute on truncated data, with no error. L2 fixed 13 of 14 sites; D1 is the 14th. |
| D3 | **A league pool scores ZERO, silently** (`project_backlog_league_ingestion`) | The group/knockout binary is in the scoring *price lookup*, not just the gate. Migration 024 + the importer are deliberately uncommitted until scoring handles leagues. |

D3 is the reason migration 024 is sitting in the tree unapplied, and it gates the whole
Premier League launch — it belongs to the multi-sport project, but **no amount of
optimization matters if a league pool scores zero.** Flagging it here so the sequence in §8
doesn't accidentally outrank it.

---

## 8. Layer E — Frontend delivery · **zero measurement exists**

No prior document covers what the browser actually downloads and renders. What I can see
statically:

| Finding | Evidence |
|---|---|
| **`next/image` is used 0 times. 51 raw `<img>` tags.** | Dominated by `team.flag_url`, `pool.brand_logo_url`, `homeFlagUrl`/`awayFlagUrl` — remote URLs, no width/height, no AVIF/WebP conversion, no responsive `srcset`, no built-in lazy loading. Flags appear on **every match row**, so this is the highest-frequency image in the product. |
| **64% of `app/` is client-side** | 69 of 107 `.tsx` files carry `'use client'`. `PoolDetail` is a very large client component. |
| **`recharts` ships to the client** | The one heavy dependency in an otherwise lean list; worth confirming it is only on analytics routes. |
| **No image optimization config** | `next.config.ts` has redirects and security headers only — no `images` block. |

Note that `Permissions-Policy: camera=()` will block future Avatars photo-capture
(`project_security_headers`) — unrelated to perf, but it lives in the same file and should be
handled in the same pass.

**The first step here is to measure, not to fix.** A bundle analysis and a Lighthouse/Speed
Insights baseline, then decide. Guessing at frontend work without numbers is exactly the
mistake §1 of the audit warns about — and unlike the DB, we have no data at all here yet.

---

## 9. Layer F — Storage hygiene and retention

Not latency, but real spend on a Medium-tier instance, and all of it unbounded.

| Table | Live rows | Size | Problem |
|---|---:|---:|---|
| `api_perf_log` | 266 | **23 MB** | 878k inserts / 891k deletes. Bloat from pure churn — 23 MB carrying 266 rows. Needs aggressive per-table autovacuum, or it is the wrong shape for Postgres. |
| `sync_runs` | 109,775 | 21 MB | **Zero deletes, ever.** No retention policy. Grows forever. |
| `user_pending_actions` | 37,801 | 12 MB | 112k inserts, 139 deletes. No retention. |
| `shadow_*` (7 tables) | — | **~241 MB** | Larger than the prod scoring tables it shadows (`match_scores` 121 MB + `bonus_scores` 67 MB = 188 MB). |

The shadow footprint needs a **decision, not a cleanup**. The read cutover was reverted
2026-07-20 (`project_shadow_scoring_engine`) because shadow's podium branch joined an empty
`tournament_awards`, so right now reconciler crons maintain 241 MB that nothing reads. Either
Phase 2 permanence proceeds (shadow needs podium scoring first — `project_tournament_podium_awards`)
or WC2026 shadow rows get garbage-collected. Both are legitimate; drifting is not. **§10.**

Also note the parity-alarm cron (jobid21) is still **failing** — `shadow_score_diffs.match_id`
needs to be nullable. Small fix, but it means we currently have no alarm on shadow drift.

---

## 10. Sequence

Ordered by (value ÷ risk), and so each step shrinks the next. Two tracks run in parallel
because they have different deadlines.

### Track 1 — Guarantee (no external deadline, highest value)

| Phase | Steps | Gate to exit |
|---|---|---|
| **P0 · Land what's written** | Verify L1–L4. Re-run `verify-analytics-parity.ts`. **Measure the new scoring-path cost** that L4 added (`badges.ts` → `computePoolEntryAnalytics`) against the kickoff-spike history. | Parity clean **and** scoring sweep duration not regressed |
| **P1 · Realtime** | 4.1 presence → Supabase Presence (flagged). 4.2 verify diff-gating; move `pool_entries` fanout to broadcast. 4.3 prune the publication. | CDC WAL volume re-measured after a counter reset |
| **P2 · Precompute** | §5 steps 4–5. Resolve the sweep question. Flip `analytics_read_from_columns`. | Leaderboard read is a SELECT; flag-reversible |
| **P3 · Request volume** | 6.1 visibility-gate the poll. 6.4 react-query + identity dedupe. 6.3 React `cache()`. | Request counts down; no staleness regression on an open tab |
| **P4 · Payload + cache** | 6.2 ship consensus not raw rows, get under 2 MB. Then 6.3 layers 2/3/4 — SWR on the API routes, `s-maxage` on `/play/*` + `/tv/*`. | Payload < 2 MB **before** any shared cache is switched on |
| **P5 · Frontend** | §8 — measure first (bundle + Lighthouse), then decide. | A baseline exists |
| **P6 · Hygiene** | §9 retention, autovacuum, the jobid21 fix, the shadow decision. | — |

### Track 2 — Multi-competition (hard: Aug 2026)

| Order | Item | Note |
|---|---|---|
| 1 | **D3** — league scoring (price lookup, not just the gate) | Gates the PL launch entirely; belongs to the multi-sport project but outranks everything in Track 1 |
| 2 | **D1** — scope `advance-teams` to a tournament | Design change to the advancement cascade |
| 3 | **D2** — closed by D1 (the 14th `match_conduct` site) | — |

**P0 is not optional and nothing else should start before it.** There are ~1,500 lines of
uncommitted changes in the tree, four of them on the scoring path. Building on top of
unverified work is how the two-writer bug survived as long as it did.

---

## 11. Decisions I need from you

1. **Presence (4.1) — approve the move off Postgres?** It is the largest single DB win in the
   plan and it deletes a table rather than tuning one, but presence is user-visible and it
   touches the open RLS residual. Flagged rollout, table retained until proven.
2. **The 30s poll (6.1)** — visibility-gate + lengthen, keeping Realtime primary? Given §1 I
   don't think we can just delete the fallback, but I want that confirmed rather than assumed.
3. **The analytics sweep (§5 step 4)** — now that L4 refreshes `entry_xp_state` on the scoring
   path, do we still register a cron in `vercel.json` for pools that aren't being recalculated
   (completed competitions, no live matches)? My read: yes, but at a much lower cadence.
4. **Shadow's 241 MB (§9)** — Phase 2 permanence (needs podium scoring first) or GC the
   WC2026 rows? Right now we pay to maintain data nothing reads.
5. **Track ordering** — I have D3/league scoring outranking all of Track 1 because a league
   pool scoring zero makes the optimization moot. Confirm, or tell me P0–P2 come first.

Item 5 is the one that changes what I do next. The rest can be answered as we reach them.

---

## 12. How we will know it worked

Optimization claims without a re-measurement are how the earlier "prod↔shadow parity proves
correctness" mistake happened (`feedback-parity-is-not-an-oracle`). So, per phase:

- **Reset `pg_stat_statements` at P0** so post-change numbers aren't diluted by the 337.5
  cumulative hours. Record the top-10 before and after each phase.
- **P1:** row-changes per published table, and the `wal->>` statement's share of DB time.
- **P2:** mean duration of the leaderboard route — target is a few ms, not ~400 ms.
- **P3:** request count per open pool tab per minute; `row_to_json(pool_members)` call count.
- **P4:** measured payload size for the largest pool, and cache hit rate on the API routes.
- **P5:** Lighthouse / Speed Insights before and after.
- **Throughout:** sweep duration at kickoff. If the guarantee gets *less* certain, the
  optimization failed regardless of what the cost graph says.

---

## 13. Explicitly out of scope

- **Enabling Next.js Cache Components** (`use cache`, `cacheLife`, `cacheTag`). Available on
  16.1.6 but not enabled; the codebase is on legacy `unstable_cache` + route `revalidate`. It
  is a broad framework migration and must not ride along with any of the above.
- **`ios/` (Swift)** — not customer-facing (`production_surfaces`).
- **Polling match state faster than 60s** — §1, and the code's own comment warns it pins the
  DB. If we want tighter, the question is whether api-football offers push on our plan
  (unverified — `SPORTPOOL_VISION.md` §3.4.1).
- **Pushes on rank change** — fails the affect gate (§3.4.2).
- **Redis** — until leaderboards are sorted sets (6.3 layer 4).
