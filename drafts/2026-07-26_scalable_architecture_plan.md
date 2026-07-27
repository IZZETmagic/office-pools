# SportPool — scalable architecture plan

_Drafted 2026-07-26, replacing the incremental framing. **This is the master architecture
document.** It answers "what should this look like so it holds as users grow", from first
principles, deliberately setting aside the optimizations already in flight._

_Supersedes as the decision document:_ `2026-07-26_platform_optimization_plan.md` (now the
task backlog that falls out of this), `2026-07-26_caching_strategy.md`,
`2026-07-19_caching_infrastructure_plan.md`. Their measurements stand; their sequencing does
not.

_Structured against the five-pillar method in Ryan's research notes. That case study is a
photo-sharing app, so several of its conclusions are **actively wrong for us** — §4 says which
and why, with our numbers, because adopting them would be expensive and useless._

---

## 1. The finding that reframes everything

I set out to measure cost. The number that came back is a **correctness** number.

Scoring sweep duration, from `sync_runs`, worst hour of each peak:

| Hour (UTC) | Runs | Avg | **Max** | Fixtures changed |
|---|---:|---:|---:|---:|
| 2026-06-16 21:00 | 44 | 44.8s | **295.7s** | 2 |
| 2026-07-05 22:00 | 60 | 7.7s | **288.2s** | 2 |
| 2026-07-19 22:00 (final) | 60 | 5.3s | **284.1s** | 5 |
| 2026-07-01 18:00 | 60 | 5.1s | **276.1s** | 1 |
| 2026-06-29 22:00 | 60 | 4.9s | **264.3s** | 44 |

The schedule is **60 seconds**. The worst sweep in each of those hours took **4.5–5 minutes.**

Two things follow, and both matter more than any cost figure in this plan:

1. **The product guarantee is currently not met at peak.** `SPORTPOOL_VISION.md` §3 says
   *"points and standings are 100% correct, 100% of the time, and never stale by design."* At
   peak we are measurably stale by up to ~5 minutes. Not theoretically — repeatedly, in the
   final's own hour.
2. **Cost is not proportional to what changed.** The 06-16 hour moved **2 fixtures** and cost
   295s. The 06-29 hour moved **44** and cost 264s. Sweep duration is driven by the entries we
   re-touch, not the events we ingest. That is write amplification, and it is the actual
   architectural defect.

So this is not a performance plan with a correctness footnote. **The architecture is failing
its central promise under load, and it fails in a way that adding capacity does not fix** —
we already proved that by going XL→Medium in July with no loss of service
(`project_scale_downgrade_xl_medium`). The ceiling isn't hardware.

### 1.1 ⚠️ Correction: caching does NOT fix this lag. Three problems, not one.

_Added 2026-07-27 after Ryan asked whether the CPU load is the scoring engine or the crowd. It
is emphatically the crowd — and that means the fix I implied for the lag above is the wrong one._

Every statement classified by what it actually does:

| Category | DB hours | % of all DB time | Calls |
|---|---:|---:|---:|
| **READ — people looking** | 237.4 | **70.3%** | 452.8M |
| **REALTIME fanout** | 86.5 | **25.6%** | 27.0M |
| User writes (saving picks) | 8.9 | 2.6% | 590,640 |
| Scoring — rank/total writes | 2.9 | 0.9% | 1,520,915 |
| Scoring — score writes | 1.5 | 0.5% | 165,928 |
| Other writes | 0.5 | 0.1% | 2.9M |

**Scoring is 4.4 of 337.5 hours — 1.3%. Reads + realtime are 95.9%.** The realtime share is
itself audience-driven: every `pool_entries` change is decoded and authorized *per subscriber*,
so it scales with crowd size, not with goals.

**Therefore the 290s sweeps are not compute-bound — they are round-trip-bound:**

- `pool_entries` rank/total updates: **1,520,915 calls for 2.9 DB-hours = 6.9ms each.** Each
  statement is fast; there are simply a vast number of them.
- A sweep touching ~4,985 entries one-at-a-time over HTTP is **~34s of pure round-trip latency**
  before any computation.
- The **set-based** shadow engine did the same full-time work in **3.13s** — one statement
  instead of thousands.
- Confirmed live config: `prod_scoring_enabled = true`, `shadow_read_enabled_pools = []`. **The
  chatty Node engine is the live scorer.** The fast set-based engine is built, running and
  materializing, but unused for scoring since the 2026-07-20 podium rollback.

**Three separate problems, with different fixes:**

| Problem | Actual cause | Fixed by | **NOT fixed by** |
|---|---|---|---|
| Supabase CPU / cost | 96% reads + realtime | Caching, precompute, presence off Postgres | faster scoring |
| **Standings lag (§1)** | Node engine per-entry round trips | **Making shadow the real scorer (§1.1a)** | **caching** |
| Egress / bandwidth | 3.8 MB raw payload × frequency | derived object + killing the 30s poll | faster scoring |

They are linked by a feedback loop — reads saturate the DB → the sweep slows → standings are
late → people refresh harder → more reads — so caching *relieves* the lag by removing
contention. But **the direct fix for the guarantee is the shadow engine, not the cache.**
§6 and §8 are corrected accordingly.

### 1.1a The three scoring pieces, in plain terms

_Added 2026-07-27. Earlier revisions of this document said "finish the set-based scoring
cutover", which was jargon nobody had been given a definition for. **"Set-based" just means SQL
that handles every row in one statement instead of looping row by row — and the set-based engine
IS the shadow engine.** So that phrase meant "make shadow the real scorer", which is already the
stated goal. Same thing, worse words. The term is retired below._

There are three pieces, and confusing them is easy because two of them score everything:

**A — The production Node engine.** `lib/scoring/recalculate.ts`: TypeScript in a Vercel
function. Fetches predictions and matches out of the database over HTTP, computes in JavaScript,
writes results back over HTTP. Triggered by **cron jobid8** (`sync-fixtures`, every minute).
**This is what scores today** (`prod_scoring_enabled = true`). It is the source of the ~1.5M
round trips in §1.1.

**B — The shadow engine.** **12 PostgreSQL functions inside the database** —
`shadow_score_match`, `shadow_calculate_bonuses`, `shadow_finalize_totals`,
`shadow_snapshot_ranks`, `shadow_apply_changes`, plus reconcilers. No data leaves Postgres and no
Vercel function computes anything. Driven by its own crons: **jobid19 every minute**, **jobid20
every 2 minutes**, **jobid21** (diff alarm) every 15 minutes. Writes to `shadow_*` tables.
**Running right now, in parallel, for real.**

**C — The read switch.** `lib/scoring/readSource.ts` decides **per pool** whether the app reads
scores from the production tables or the shadow tables. Gate:
`sync_settings.shadow_read_enabled_pools`, currently `[]` — so every pool reads production.

**So today both engines score everything, twice, and only production's numbers are ever shown.**
That is why there are ~241 MB of `shadow_*` tables nothing reads.

**"Cutover" = adding pool ids to `shadow_read_enabled_pools`.** Done for all pools 2026-07-19,
reverted 2026-07-20 when shadow's podium branch returned empty rows (it joins `tournament_awards`,
which was empty — the same root cause prod had; see `project_tournament_podium_awards`).

#### Why shadow is the right direction — and which cost it actually saves

Ryan's stated goal: use shadow, because it is cheaper and avoids round-tripping out to compute
and write back. Correct — but §1.1 measured scoring at 1.3% of DB time, so being precise matters:

| Cost | Does shadow help? |
|---|---|
| **Wall-clock latency** | **Massively** — 3.13s vs ~290s. This is the guarantee |
| **Vercel function time** | **Yes** — no long-running Node function per sweep |
| **Vercel↔Supabase round trips / egress** | **Eliminated** — exactly the "no calculating and writing back" |
| Database CPU | **Barely** — scoring is 1.3% either way |

#### Two gaps to close before shadow can be the only engine

1. **Today we pay for both.** Shadow running in parallel is *additional* cost until production's
   engine is switched off. The cutover has **two halves**: read from shadow, **and**
   `prod_scoring_enabled = false`. Only the first half has ever been attempted.
2. **`bracket_picker` pools have no shadow arm at all.** `readSource.ts` forces them to `'prod'`
   regardless of the flag ("a stray id can never break them"). Shadow cannot be the sole engine
   until bracket_picker is covered. **Real remaining scope** — do not plan around "shadow does
   everything" until this is built.

#### Correction: the analytics sweep *does* run

`2026-07-26_analytics_parity_result.md` concluded the sweep "never runs" because `vercel.json` is
`{}`, making `badges.ts` the de facto XP owner. **That is wrong.** Crons here are **pg_cron jobs
that POST to the Next.js routes**, not Vercel crons. **jobid15 runs `analytics-sweep` every
minute and is active**, `analytics_sweep_enabled = true`, and `analytics_last_run_at` shows it
ran minutes ago. So **both XP writers have been running concurrently all along, racing** — which
makes the single-owner fix (L4a) more necessary, not less.

### 1.2 What caching is actually worth — and what it isn't

| Claim | Status |
|---|---|
| Removes ~70% of DB time | ✅ Reads are 237.4 of 337.5 hours; concentrated in the 190 pools holding 99.7% of read cost (§5.1c) |
| Cuts per-read payload ~28× | ✅ 3,854 kB → ~136 kB for the largest pool, then shared across readers |
| Makes standings prompt | ❌ **No** — that's the shadow engine (§1.1a) |
| Reduces scoring cost | ❌ Irrelevant — scoring is 1.3% |

**Egress — what I can and cannot state honestly.** No total is derivable from the database:
PostgREST aggregates each response into a **single JSON row**, so `rows` = `calls` for every
statement and carries no byte information. The authoritative figure is in the Vercel and
Supabase dashboards. Measured facts only:

- A `predictions` row as JSON: **431 bytes** full-width, **305 bytes** narrowed to the 8 used
  columns — a **29% cut**, which independently confirms the 5,420 → 3,854 kB measurement (also
  29%). Two methods, same answer.
- All 288,029 predictions as JSON ≈ **124 MB**, so one unnecessary full read costs that.
- **The dominant egress term is not the database.** It is the 3.8 MB RSC payload re-serialised
  **every 30s per open tab**. That is a client fix, not a cache.

---

## 2. The five pillars, answered with our numbers

### 2.1 Scale — small data, spiky arrival

| | |
|---|---:|
| Total database size | **916 MB** |
| Pools | 623 |
| Memberships | 4,809 |
| Users active in last 30d | 3,184 |
| Predictions | 288,029 rows / 73 MB |
| Largest pool | 192 entries / 13,385 predictions |

Growth ahead: Premier League Aug 2026 (**38 gameweeks instead of one 4-week tournament** — a
different load *shape*, not just more of it), then Showdown.

#### The pool-size statistic, corrected

Earlier drafts leaned on **"median pool = 1 member."** That figure is arithmetically right and
**decision-relevant in the wrong direction** — Ryan challenged it, correctly. Both bases,
measured:

| Basis | Median | Mean | p25 | p75 |
|---|---:|---:|---:|---:|
| **Per pool** (what the old docs used) | **1** | 7.7 | — | 8 |
| **Per member** — the pool size an actual person is in | **27** | **42.8** | 12 | 52 |

The median-of-pools is 1 because **51% of pool records are empty shells**: 69 pools with *zero*
members and 251 with exactly one. Those describe our **inventory of rows**, not our traffic.
Weighting by membership instead:

| Pool size | Pools | % of pools | Memberships | **% of members** |
|---|---:|---:|---:|---:|
| 0 | 69 | 11.1% | 0 | 0% |
| 1 | 251 | 40.3% | 251 | 5.2% |
| 2–5 | 119 | 19.1% | 331 | 6.9% |
| 6–20 | 123 | 19.7% | 1,468 | 30.5% |
| 21–50 | 46 | 7.4% | 1,454 | 30.2% |
| 51–100 | 11 | 1.8% | 741 | 15.4% |
| 100+ | 4 | 0.6% | 564 | 11.7% |

**88% of people are in pools of 6 or more. 57% are in pools of 21 or more.** The 71% of pools
with ≤5 members hold just **12% of members**.

**Why this matters:** the old caching doc used the median to argue *"one viewer per pool ⇒ a
shared cache gets ~0% useful hits ⇒ caching pool data is pure overhead."* **That reasoning was
wrong.** A shared per-pool object is read by a median of **27** people, not 1. So shared
caching and precompute are *considerably more* valuable than previously concluded — which
strengthens §5.1 rather than undermining it.

What survives unchanged is the **CDN** rejection, but on different grounds — see §4. It was
never only a hit-rate argument, and the load-bearing reason (auth-gated, viewer-shaped
content) is independent of pool size.

_Aside worth a look later: 69 pools with **zero** members — not even a creator. Consistent with
the RLS asymmetry in the open `project_bug_delete_pool_data_loss` defect, which can strip
memberships while leaving the pool row. Flagged, not diagnosed._

### 2.2 Read vs write — read-heavy at the edge, write-amplified at the core

Both, in different places, which is why single-axis answers keep missing:

- **Reads dominate request count.** `SELECT predictions.*` alone: 30.0M calls, 111.3 DB-hours,
  33% of all database time.
- **Writes dominate the critical path.** One confirmed goal fans out to every affected entry.
  Cumulatively `pool_entries` has taken **1,872,177 updates** — and each update is then
  WAL-decoded and evaluated per realtime subscriber.

Also relevant: **predictions are written once and read forever.** They're locked at kickoff and
never change. That makes them ideal precompute input and terrible cache-invalidation input —
we are currently treating them as the latter.

### 2.3 Durability — and an inversion we should be embarrassed by

| Must never lose | Fully disposable |
|---|---|
| `predictions` (a member's picks) | `user_presence` (who's looking right now) |
| `match_scores`, `bonus_scores` (the points ledger) | `api_perf_log` (266 live rows in 23 MB) |
| `pool_members`, `pool_entries` | `sync_runs` (109,775 rows, never pruned) |

**We have this exactly backwards today.** The disposable presence signal is stored in a
durably WAL-logged table, upserted every 25s per tab, generating **3,478,736 row changes** —
63% of all realtime WAL volume. Meanwhile the irreplaceable column has an **open, live data-loss
bug**: "Delete Pool" wipes every member's predictions via a client-side non-transactional
cascade, 6 pools already destroyed, 458 members exposed
(`project_bug_delete_pool_data_loss`).

That is the durability pillar answered: **we spend durability on the throwaway data and lack a
transaction on the sacred data.** Fixing that inversion is worth more than any cache.

### 2.4 Latency — a guarantee, with a floor we don't own

The target is §3: the standings move when the goal goes in. Two boundaries from the vision
that constrain every option below:

- **The floor is ingestion, not scoring.** We learn about the goal on a 60s provider poll.
  Nothing here proposes going faster; whether api-football offers push on our plan is
  unverified and should be checked before promising anything tighter.
- **Live standings ≠ live notifications.** No rank-change pushes. Four *"you've dropped to
  3rd"* alerts in one match is the exact bad feeling §1 forbids.

Current reality: **up to ~290s stale at peak** (§1). The gap between promise and delivery is
the whole job.

### 2.5 Cost — and the constraint that is *not* our constraint

Supabase Medium + Vercel, solo maintainer, Phase 2 self-funding.

I need to correct an assumption I made an hour ago: I saw `max_connections = 60` and flagged
connection exhaustion as the ceiling. **It isn't.** There is no Postgres driver in this
codebase — no `pg`, no Prisma, no Drizzle. Everything goes through PostgREST over HTTP, and
PostgREST holds a small fixed pool (`authenticator` = 5 connections). Serverless fan-out does
*not* translate into Postgres connections here. The classic serverless-Postgres failure mode
does not apply to us.

Our real ceilings, in order: **Postgres CPU during fan-out**, **PostgREST's silent 1,000-row
cap** (already a live defect class — `supabase_postgrest_row_cap`), and **realtime WAL
decoding** (24% of DB time).

---

## 3. The thesis: we are a simultaneity problem, not a volume problem

Everything above converges on one sentence.

> **Load is not proportional to users. It is proportional to (users × simultaneity), and every
> user arrives in the same 90 seconds because they are watching the same match.**

At 916 MB, we are three orders of magnitude away from any data-volume problem. What breaks is
not size — it's that a single event must be reflected for everyone at once, and both halves of
that currently scale badly:

- **Write side:** one goal → re-touch every affected entry → 290s sweeps.
- **Read side:** one goal → every viewer refetches → 30M prediction reads, plus a
  full-page poll every 30s per tab regardless of visibility.

Sharding, NoSQL, microservices and read replicas are all **volume** answers. None of them
touch simultaneity. The answers that do:

1. **Do the work once, before the crowd arrives** — precompute on write, not on read.
2. **Give the crowd one identical object to read** — so N readers cost one fetch, not N.
3. **Make the "something changed" signal tiny** — broadcast a version, not a row.
4. **Never let a refresh stampede** — single-flight, serve stale while one refresh runs.

That is the architecture in §5. It is also why the answer is *not* "buy a bigger instance" —
we already ran that experiment backwards and nothing got worse.

---

## 4. Your research, mapped onto us

Taking each item from the case study on its merits. The **❌ rows are the valuable ones** —
they're the money we don't spend.

| Item | Verdict | Reasoning, with our number |
|---|---|---|
| **Load balancer** | ✅ **Already have** | Vercel's edge *is* the load balancer. Nothing to provision, nothing to run. |
| **Horizontal scaling** | ✅ **Already have** | Functions autoscale per request. There are no servers to add. |
| **Stateless servers** | ✅ **Already true** | Auth is a JWT in cookies; no in-memory sessions. *One caveat:* Next's Data Cache is **per-region**, which is the distributed-coherence version of this problem — it's why §5 keys cache entries immutably instead of relying on shared invalidation. |
| **Vertical scaling** | ⚠️ **Used, and deliberately reversed** | XL→Medium on 2026-07-12 with no service loss. We have empirical proof capacity wasn't the constraint. Don't go back up to paper over §1. |
| **Monolith** | ✅ **Keep** | Solo maintainer. A monolith is correct and will stay correct for years. |
| **Microservices** | ❌ **Reject** — but note the seam already exists | Wrong for a team of one. Worth seeing that **scoring is already effectively a separate service**: set-based SQL on `pg_cron`, independent of the web app. That's the one correct seam, and it's already split. Don't cut more. |
| **SQL / Postgres** | ✅ **Correct, keep** | A points ledger is the textbook case for relational + ACID: delete a pool, its entries and scores must go atomically (see §2.3 — we don't do this yet, which is the bug). |
| **NoSQL** | ❌ **Reject** | Nothing unstructured at volume. Adding a second store doubles the operational surface for a solo dev and buys nothing. |
| **Indexing** | ✅ **Already good** | `predictions_entry_id_match_id_key`: 641M scans. `idx_predictions_entry_id`: 80M. Working as intended. Two are near-dead and can be dropped: `idx_predictions_match` (9,589 scans / 3.8 MB), `idx_match_scores_v2_match_id` (45,326 / 8.3 MB). Minor, but free. |
| **Caching (shared, server-side)** | ✅ **Adopt — upgraded by §2.1** | A cache pays when one fetch serves many reads. Member-weighted, one per-pool object serves a median of **27** readers (mean 42.8). The old "≈1:1, pure overhead" verdict was an artifact of counting empty pool records. This is now a clear win, and §5.1 is how to take it. |
| **Caching (Redis specifically)** | ⚠️ **Still defer — but for a different reason** | Not because hit rates are poor (they aren't — see above), but because **Vercel Runtime Cache covers it at zero infra**. When Redis earns its place it will be because **a leaderboard is a sorted set** — `ZADD`/`ZREVRANGE`/`ZRANK` give top-N and a member's rank in O(log n). Not as a blob cache. |
| **TTL vs active invalidation** | ✅ **Change now — but pick neither** | Today: `revalidateTag(tag, {expire: 0})` on every score change — active invalidation that hard-expires every affected pool at the exact moment traffic peaks. §5 uses a third option the dichotomy misses: **immutable version-keyed entries**, which need no invalidation at all. |
| **Read replicas** | ⚠️ **Trigger-gated, and never for the leaderboard** | A real lever, and a Supabase toggle rather than a rearchitecture. Two conditions: (a) precompute first — a replica of a wasteful query is still wasteful; (b) replication lag is **eventual consistency**, which directly contradicts the §2.4 guarantee. So replicas serve analytics, profile and discover — **never the live board.** |
| **Sharding** | ❌ **Reject for years** | 916 MB. Sharding is a conversation somewhere north of 100 GB. We are ~100× away. It would add a shard key, cross-shard joins and rebalancing to solve a problem we do not have. |
| **Consistent hashing** | ❌ **N/A** | Only meaningful once sharded. |
| **Shared session store** | ❌ **Not needed** | Already stateless via JWT. |
| **Primary/replica for durability** | ✅ **Already have** | Supabase runs PITR/backups. The durability gap is the missing *transaction* in §2.3, not missing replication. |

**Net:** of the fourteen items, six we already have via the platform, four are genuinely wrong
for us, and the ones that matter are precompute, immutable caching, and a deferred
sorted-set Redis. The research's headline conclusions — shard, add NoSQL, split services —
are all volume answers to our simultaneity problem.

---

## 5. Target architecture

### 5.1 The one new idea: version-keyed, precomputed pool state

```
WRITE PATH (on a confirmed goal)
  ingest (60s provider floor)
    └─ set-based scoring sweep in SQL          [EXISTS: the shadow engine, §1.1a]
        └─ materialize per-pool leaderboard object   ← NEW, own step
            └─ bump pools.state_version                ← NEW, an integer
                └─ broadcast pool:{id} → {version: N}  [exists: banter pattern, migration 022]

READ PATH (viewer)
  hears version N (or a visibility-gated refresh)
    └─ GET precomputed object, cache key = (pool_id, version)   ← immutable
        └─ leaderboard: NO overlay needed — see 5.1a
        └─ pool detail: + a small overlay for the viewer's OWN picks
```

### 5.1a What exactly is in the leaderboard object — and why it needs no personalization

Verified against `app/api/pools/[pool_id]/leaderboard/route.ts:496`. The cached object is the
**entire response body**.

| Group | Fields | Already stored in the DB? |
|---|---|---|
| Identity | `entry_id`, `entry_name`, `entry_number`, `member_id`, `user_id` | ✅ |
| Display | `full_name`, `username` | ✅ |
| Scoring | `match_points`, `bonus_points`, `point_adjustment`, `total_points` | ✅ |
| Ranking | `current_rank`, `previous_rank` | ✅ |
| Status | `has_submitted_predictions` | ✅ |
| **Form** | `last_five`, `current_streak`, `hit_rate`, `exact_count` | ❌ **recomputed per read** |
| **XP** | `level`, `level_name`, `total_xp` | ❌ **recomputed per read** |
| **Crowd** | `contrarian_wins`, `crowd_agreement_pct`, `total_completed` | ❌ **recomputed per read** |

Plus pool-wide: `prediction_mode`, `awards`, `superlatives`, `matchday_mvp`, `matchday_info`.

**~40% of this object is already sitting in the database and ~60% is recomputed from scratch on
every read** — and `entry_xp_state` **already materializes** `total_xp`, `current_level`,
`last_five`, `current_streak`, `hit_rate`, `crowd_agreement_pct` and `contrarian_wins`. That is
the §5 precompute argument reduced to a single table nobody reads.

**Three properties that make it safely shareable:**

1. **Nothing is viewer-specific.** Every field describes *the entry being displayed*, not the
   person looking. `contrarian_wins` is that entry's picks against the crowd — the same value
   whoever reads it. One object serves all members of the pool; the viewer's own row is
   highlighted client-side by matching `entry_id`. **An earlier draft of this plan claimed a
   viewer overlay was needed here. It isn't** — that applies to the pool *detail* page (own
   picks), not the leaderboard.
2. **No raw predictions appear in the output.** They are *inputs* only (`route.ts:315`). So the
   object contains nobody's actual picks, and the pre-lock reveal gate is not a concern for it.
3. **Permission is never cached.** `route.ts:69` 403s non-members. That is authorization, not
   personalization: check membership in the function, then serve the cached body. **Cache the
   payload, never the entitlement.**

Why the version key is the crux. An object keyed by `(pool_id, version)` **can never be
stale** — a change produces a *new key*, not a dirty old one. That single property collapses
four separate problems we currently have:

| Problem today | Resolved by version-keying |
|---|---|
| `expire: 0` stampedes every pool at peak | Nothing is expired. New version = new key. |
| 30s poll misses a 45s TTL ~⅓ of the time | No TTL to miss. |
| Herd of readers on a cold key | All readers on the same immutable key; single-flight fill. |
| Work repeated per reader | Cost is one *write* per version, shared by the ~27 readers of a typical pool (§2.1) — and by all 192 of the largest. |

And it directly serves the guarantee: the version bump happens **as part of scoring**, so
"standings are current" becomes a structural property rather than a race between a poll and a
TTL.

### 5.1b One object, one freshness — and the silent-default bug it removes

**Ryan's rule, adopted:** *every element shown on the leaderboard must be as live as the score
is.* The form dots are on that screen, so they are not "analytics" to be refreshed lazily —
they are part of the live surface.

Version-keying delivers this structurally: the whole object carries **one** version, so points,
form dots, streak, level, XP and rank can never disagree with each other. There is no way to
get fresh points beside stale dots, because they are the same cache entry.

**They can disagree today.** Scoring fields come from stored values, but form/XP/crowd are
recomputed per read inside a `try` — and `leaderboard/route.ts:379` swallows any failure:

```ts
} catch (_e) {
  // If analytics helpers fail, we still return basic leaderboard data
  // Analytics fields remain at their defaults
}
```

The defaults (`route.ts:300–305`) are `level = 1`, `level_name = 'Rookie'`, `total_xp = 0`,
`hit_rate = 0`, empty streak, five `no_pick` dots. So a member can be shown **correct points
next to a blank form row and Level 1 Rookie**, with no error surfaced anywhere and nothing
logged. A Level 8 player silently renders as a Level 1 Rookie.

That is a live "no bad feelings" defect independent of any caching work. Materializing the
object as a **single unit** removes the failure mode: either the new version builds completely,
or the previous version is served. Partial results stop being representable.

### 5.1c Which pools to materialize — measured, not guessed

Read cost per pool ≈ entries × predictions. Measured 2026-07-26:

| Tier | Pools | % of pools | **% of read cost** | Policy |
|---|---:|---:|---:|---|
| 0–1 entry | 240 | 38.5% | **0.0%** | compute on read |
| 2–5 | 124 | 19.9% | 0.3% | compute on read |
| 6–20 | 129 | 20.7% | 10.4% | **materialize + cache** |
| 21–50 | 46 | 7.4% | 23.4% | **materialize + cache** |
| **51+** | **15** | **2.4%** | **65.9%** | **materialize + cache (priority)** |

**15 pools carry two-thirds of the cost; 61 carry 89%; the 364 smallest carry 0.3% between
them.**

**Rule: materialize pools with ≥ 6 entries — 190 pools (31%) covering 99.7% of read cost.**
Everything below stays compute-on-read, which is today's behaviour and genuinely cheap at three
entries. Caching them would be pure overhead.

Two implementation notes:
- **Make the threshold a tunable setting**, not a hardcoded `6`, so it moves without a deploy.
- **The compute-on-read path must remain the fallback for every pool**, so a materialization gap
  degrades to "slower", never to "wrong". It already is — this is today's code path.

### 5.1d Cache lifetime — the version replaces the TTL policy

Ryan's instinct (short expiry during live play, long expiry between games) is right about the
*behaviour*. Version-keying achieves it without a policy, and strictly better:

| | With a live/idle TTL | With version-keyed keys |
|---|---|---|
| **Between matches** | Need to detect "no game on" and switch to a long TTL | Nothing bumps ⇒ the same key stays valid **indefinitely, automatically** |
| **During a match** | A 30s TTL builds in **up to 30s of staleness** | Each score change mints a **new key** ⇒ readers get new standings immediately, **0s stale** |
| **Mode detection** | Required, and a source of bugs | Not required — the version *is* the signal |

The 30s-during-live option is the one to avoid: it would guarantee up to 30 seconds of lag at
exactly the moment §1 says we must not lag.

**So the TTL becomes a safety net, not the mechanism.** Set it long (≈1 hour) purely as a
backstop against a missed version bump; correctness comes from the version, not the clock.

**Where the live/idle distinction *does* belong: the client's refresh cadence.**

| State | Client behaviour |
|---|---|
| Match live | Listen for the `pool:{id}` version broadcast; short **visibility-gated** poll as backup only |
| No match live | No polling at all — refresh on focus and on broadcast |

That is where the request-volume saving lands, and it replaces today's unconditional 30s
`router.refresh()` that runs even on backgrounded tabs.

### 5.2 What each layer does

| Layer | Role | Change from today |
|---|---|---|
| **CDN / edge** | Static assets, team flags, public `/play/*` + `/tv/*` only | Add `s-maxage` + SWR to the public boards. **Never pool detail** — the reason is that it's **auth-gated and viewer-shaped** (own picks, admin visibility, pre-lock reveal gate), which no shared public object can represent without leaking picks or keying per user. That holds regardless of pool size. Secondary: a pool's members are geographically spread across isolated PoPs (the largest pool is Chilean/Peruvian), so edge hit rates stay poor even at 27 members/pool |
| **Functions (stateless)** | Request handling, viewer overlay | Add request-scoped `cache()` for `requireAuth()`, `isPoolCacheEnabled()`, `getScoringSource()` — free, no staleness |
| **Shared cache** | The immutable `(pool_id, version)` object | Vercel Runtime Cache. **See 5.2a — the cached object is the derived one (~tens of kB), not today's 3,854 kB raw payload** |
| **Realtime** | Tiny version broadcasts on `pool:{id}` | Move `pool_entries` CDC → `realtime.send` broadcast. Move **presence off Postgres entirely** to channel presence (−63% WAL) |
| **Postgres (primary)** | Source of truth + materialized read shapes | Read from `entry_xp_state` instead of recomputing. Materialization becomes its own step, not a side effect of badge pushes |
| **Postgres (replica)** | Analytics, profile, discover — later | Trigger-gated (§6). Never the live board |
| **Redis** | Leaderboard sorted sets + single-flight locks — later | Trigger-gated (§6) |

### 5.2a Which cache, which limit — and why the 3.8 MB is not the blocker it looked like

Ryan raised this and it exposed an imprecision in the earlier drafts, which used "the cache"
to mean two different systems:

| System | Holds | Limit that applies | Does pool data go here? |
|---|---|---|---|
| **CDN / Edge** | HTTP responses at edge PoPs | Has its own size limits — **not confirmed from the docs; do not quote a figure** | **No** — and *not* for size reasons. Auth-gated and viewer-shaped (own picks, admin visibility, pre-lock reveal gate). No single shared public object is correct for two viewers, at any size |
| **Runtime Cache** | Server-side KV, per region, tag-invalidated | **2 MB per item** (verified against the official plugin docs 2026-07-26) | **Yes** — this is the shared cache in §5.1 |

**The correction:** earlier drafts said "shrink the payload below 2 MB is a *prerequisite* for
the shared cache", which reads as though we must squeeze 3,854 kB under the cap. We must not
try. That 3,854 kB is **13,385 raw prediction rows** — precisely the thing the design stops
storing.

The version-keyed object is the *derived* result. **Measured, not estimated** (2026-07-26,
largest pool, all 24 response fields reconstructed from live data): **134 kB across 192
entries — 714 bytes per entry**, plus ~2 kB of pool-wide extras. Call it **136 kB against the
2 MB cap: ~15× headroom, enough for a pool of ~2,900 entries.**

_(This supersedes an earlier 40–60 kB guess in this document, which was low by ~2.5×.)_

So there is no size blocker, and none of this is solved by finding a bigger cache. **The
derived object *is* the shrink.** One change resolves two independent problems:

1. **What we cache** — a small immutable object instead of an uncacheable one.
2. **What we ship to phones** — today the same 3.8 MB is serialised into the RSC response
   **every 30 seconds per open tab**, over cellular. That is a user-experience and bandwidth
   problem that stands entirely on its own, cache or no cache.

### 5.3 What this fixes about §1

The 290s sweep is long because scoring re-touches entries and *then* per-read work happens
downstream of it. Splitting materialization into its own step lets it be **incremental and
resumable** (only pools whose matches changed), and moves the analytics/XP computation out of
the per-recalc path. The guarantee stops depending on a sweep finishing inside 60s and starts
depending on a version bump, which is cheap.

### 5.4 Images — the one layer where "just cache it" is simply correct

A team flag never changes, so there is no staleness question and no invalidation design. This
should be the easiest thing in the document. It currently isn't.

| Asset | Served from today | Verdict |
|---|---|---|
| `/public/icons`, `/public/badges`, SVGs, manifest | ✅ Vercel CDN, automatic, long-lived immutable | **Already correct — no change** |
| **`teams.flag_url` (48 teams)** | ❌ **`flagcdn.com`** — a third-party host, hit on **every match row** | Fix |
| `pools.brand_logo_url` | Supabase Storage, unoptimized | Fix |

**`/public/flags/` already contains all 48 flags** (`ar.png`, `at.png`, …) and **nothing in
`app/`, `components/`, `lib/` or `mobile/` references them.** The only code that knows is the
email sender, which rewrites `flagcdn.com/w80/us.png` → `sportpool.io/flags/us.png`
(`send-announcement/route.ts:77`) because mail clients block unknown hosts. That swap was made
for email and never propagated to the app.

So we pay a DNS lookup + TLS handshake + third-party round trip on the most frequently
rendered image in the product, for files we already deploy — and carry a failure mode where a
slow `flagcdn` blanks every flag on every match row.

Compounding it: **zero uses of `next/image`** across 51 raw `<img>` tags, and no `images` block
in `next.config.ts`. Nothing is converted to AVIF/WebP, nothing is resized to its displayed
size, and nothing carries intrinsic `width`/`height` — so every match row contributes layout
shift.

**But do not simply repoint at `/public`.** Those 48 files are World Cup **countries**;
Premier League needs 20 **club crests**, and the sport after that needs something else again.
Committing every competition's imagery into `/public` forever is exactly the World-Cup-shaped
assumption this programme exists to remove.

**Target:** competition imagery in Supabase Storage (long `cacheControl` at upload), rendered
through `next/image` with `remotePatterns` configured. That gives Vercel edge caching, format
conversion, correct-size variants and no layout shift — identically for country flags, club
crests, and whatever comes next. One change serves all three rows above, which is why it's
worth doing once, properly.

Minor, same pass: `og-image.png` (324 kB) and `play-store-feature-graphic.png` (254 kB) are
larger than needed. Social-preview only, so low impact.

---

## 6. The growth staircase — what to build *when*

The point of this table is to stop us building ahead of need. Each row has a **measured
trigger**, not a feeling.

| Trigger (measured) | Action | Why not sooner |
|---|---|---|
| **Now — the lag fix (§1.1a)** | **Make shadow the real scorer.** (1) Fix the failing diff-alarm cron jobid21 — `shadow_score_diffs.match_id` must be nullable — so drift is actually alarmed. (2) Give shadow podium scoring. (3) Re-verify. (4) Re-cut over via `shadow_read_enabled_pools`. (5) **Then** `prod_scoring_enabled = false`, or we keep paying for both | This, **not caching**, is what makes standings prompt. 1,520,915 round trips at 6.9ms vs one 3.13s statement |
| **Now — the cost fix** | Presence off Postgres; version-keyed precompute; visibility-gate the 30s poll; single XP owner | Reads + realtime are 95.9% of DB time. This is where the load and egress actually are |
| Before shadow can be the **sole** engine | Build a `bracket_picker` shadow arm | `readSource.ts` hard-forces those pools to `'prod'`. Until this exists, both engines must keep running |
| Sweep p95 > 30s **after** shadow is the scorer | Split scoring into a per-pool queue (Vercel Queues or `pg_cron` partitions) | A queue is real complexity, and shadow should make it unnecessary — 3.13s vs a 60s budget |
| Postgres CPU > 60% sustained at peak, *after* precompute | Supabase read replica for analytics / profile / discover | A replica of a wasteful query is still wasteful. And lag breaks the board's guarantee |
| Any single pool > 1,000 entries | Leaderboard as a Redis sorted set | Largest pool is 192. `ZRANK` solves a problem we don't have yet |
| 2nd sport live **and** > ~50k MAU | Partition `predictions` by competition | 288k rows fits comfortably; partitioning early costs migration risk for nothing |
| DB > 100 GB | *Then* open the sharding conversation | We are at 916 MB |

**Everything below the third row is deliberately not being built now.** That is the plan, not
an omission.

---

## 7. "Pull back, don't undo" — what happens to the work in the tree

There are ~1,500 uncommitted lines. Against the target architecture, they split cleanly:

| Landed | Verdict | Reasoning |
|---|---|---|
| **L1** — `predictions` select narrowed to 8 columns (5,420 → 3,854 kB) | ✅ **Keep, commit** | Prerequisite either way — the object has to get under 2 MB for §5.2 |
| **L2** — `match_conduct` scoped + paginated, 13 sites via `lib/matchConduct.ts` | ✅ **Keep, commit** | This is a **correctness** fix for the 1,000-row cap, not an optimization. Verified byte-identical (206 = 206 rows) |
| **L3** — crowd consensus split + hoisted out of the per-entry loops | ✅ **Keep, commit** | O(n×m) → O(n+m), and it's precisely what §5.1 needs to ship ~100 consensus rows instead of 13,385 raw ones |
| **L4a** — XP has one definition (`computeFullXPBreakdown`), levels ratchet | ✅ **Keep the ruling** | Fixes a live user-visible bug: `current_level` renders on `/pools` and `/dashboard` today and depends on which writer touched the row last |
| **L4b** — that computation now runs inside `badges.ts` on **every recalc** | 🛑 **HOLD — this is the one to pull back** | It puts analytics work **on the scoring path**, and §1 says the scoring path is already overrunning its 60s budget by 5×. Right ruling, wrong placement: it belongs in the §5.1 materialization step, which runs once per version bump, not inside badge push detection |

So: **one item to pull back, three to land, one ruling to keep and relocate.** Nothing needs
undoing. And critically — **nothing downstream should be built on L4b's placement**, which is
what the previous plan's Phase 0 would have done.

The parity check is still the gate on reading from precompute, and it must come back clean
before `analytics_read_from_columns` flips:

```bash
npx tsx scripts/verify-analytics-parity.ts
```

---

## 8. Immediate next steps, in order

1. **Re-measure honestly.** Reset `pg_stat_statements` so we stop reasoning about 337.5
   cumulative hours that predate every fix. Record sweep p50/p95 as the guarantee metric.
2. **Relocate L4b** out of the scoring path into a materialization step; commit L1–L3 and
   L4a.
3. **Make shadow the real scorer** (§1.1a) — this, not caching, is what fixes the lag. In
   order: jobid21 alarm → shadow podium scoring → re-verify → `shadow_read_enabled_pools` →
   `prod_scoring_enabled = false`.
4. **Presence off Postgres.** Biggest single DB reduction (−63% WAL volume), deletes a table
   rather than tuning one, and retires the open `user_presence` RLS residual.
5. **Close the durability inversion** — wrap pool deletion in a transaction (§2.3). This is a
   live data-loss bug, not an optimization.
6. **Then** version-keyed precompute (§5.1), which is where the read load and egress go away.

**Not in this sequence: league scoring — HELD by Ryan 2026-07-27.** It is unimplemented and may
not land before go-live. Stated once and left as a product call, not an engineering one:
**holding it means either Premier League does not launch on SportPool, or it launches with league
pools scoring zero.** The other two multi-competition items (`advance-teams` tournament scoping,
the 1,000-row cap) only bite once a second competition exists, so they follow whatever that
decision turns out to be.

_Ordering note: step 3 was added 2026-07-27 and step 6's rationale was corrected. Earlier drafts
credited the precompute/caching work with fixing the standings lag; §1.1 shows it fixes cost and
load instead. Both are worth doing — they just fix different things._

---

## 9. Decisions I need from you

**Settled 2026-07-27**

- ✅ **Ordering — league scoring is HELD.** Unimplemented, may not land before go-live. Removed
  from the sequence; the consequence is stated once in §8 and left as a product call.
- ✅ **Shadow becomes the permanent scorer.** Ryan's stated direction. That also answers the old
  "GC shadow's 241 MB or keep it?" question — **keep it; it stops being a shadow and becomes the
  engine.** Podium scoring and a `bracket_picker` arm are the remaining scope (§1.1a).
- ✅ **The §1 framing, as corrected by §1.1.** The lag is real, but it is round-trip-bound, not
  compute-bound, and **caching does not fix it** — shadow does. Cost and lag are separate tracks.

**Still open**

1. **Presence off Postgres (§4.1)** — approve? Largest single DB reduction (−63% of realtime WAL
   volume). User-visible, so: flagged rollout, table retained until proven.
2. **The version-keyed precompute (§5.1)** — the one genuinely new design here, replacing
   TTL-and-invalidate with immutable keys. We have covered which cache it lives in (§5.2a), what
   is in it (§5.1a), which pools get it (§5.1c) and its lifetime (§5.1d). **What we have not
   covered is how the version bump is wired into scoring** — and after §1.1a that means wiring it
   into the *shadow* engine, in SQL, rather than into the Node path. Worth doing together.
3. **`bracket_picker` shadow arm** — needed before production's engine can be switched off at
   all. Build it, or accept running both engines indefinitely?

---

## 10. Explicitly rejected, with reasons

So these don't come back around:

- **Sharding, consistent hashing** — 916 MB, ~100× premature.
- **NoSQL / a second datastore** — nothing unstructured at volume; doubles ops surface for one maintainer.
- **Microservices** — wrong for team size; the one correct seam (scoring) is already split.
- **Scaling up again** — XL→Medium proved capacity isn't the constraint.
- **Redis as a blob cache** — median pool is 1 member. Only as sorted sets, later.
- **Read replica for the live leaderboard** — replication lag contradicts the guarantee.
- **CDN for pool detail** — auth-gated, viewer-shaped, ~0% hit rate at 623 keys.
- **Polling match state faster than 60s** — the floor is the provider; the code's own comment warns it pins the DB.
- **Pushes on rank change** — fails the affect gate.
- **Enabling Next Cache Components** — a broad framework migration; must not ride along with any of this.
