# SportPool caching strategy — all layers

_Drafted 2026-07-26. Answers "review all levels of caching and recommend a full strategy."
Companion to `2026-07-26_performance_optimization_audit.md` (what to stop doing) — this is
where to put what's left. Supersedes the layer sketch in `2026-07-19_caching_infrastructure_plan.md`._

---

> ⚠️ **CORRECTION 2026-07-26 (same day) — §1 and §2(a) below are WRONG.** They weight every
> pool equally, and **51% of pool records are empty shells** (69 with zero members, 251 with
> one). Weighted by *membership* instead, the median person is in a pool of **27** (mean 42.8),
> and **88% of members are in pools of 6+**. So "one fetch serves ~1 read ⇒ caching is pure
> overhead" is backwards: a shared per-pool object serves ~27 readers.
>
> **Shared server-side caching is therefore MORE valuable than this document concluded**, not
> less. The **CDN** verdict still stands, but on §2's reasons **(b) and (c)** only — auth-gated,
> viewer-shaped content, which is independent of pool size. Ignore §2(a).
>
> See `2026-07-26_scalable_architecture_plan.md` §2.1 for the corrected figures.

## 1. The access pattern decides everything

Every caching decision below falls out of one table. Measured on production:

| | |
|---|---:|
| Pools | **623** |
| Total memberships | 4,809 |
| **Median pool size** | **1 member** |
| Mean pool size | 7.7 |
| Pools with ≤ 5 members | 439 (70%) |
| Pools with ≤ 20 members | 562 (90%) |
| Pools with ≥ 100 members | **4** (0.6%) |
| Largest pool | 192 members |
| Users seen in last 30d | 3,184 |

Two properties, and they pull in opposite directions:

- **Very high key cardinality, very low requests-per-key.** 623 distinct pool keys, and the
  median key is read by one person. This is a long tail, not a hot set.
- **Extreme concentration in the tail's head.** Four pools hold a wildly disproportionate
  share of entries and predictions.

A cache only pays when **one fetch serves many reads before it expires**. For 90% of pools
that ratio is close to 1:1 — caching them is pure overhead. For the top 4 pools it's
hundreds to one. **So the strategy is not "cache pool data"; it's "cache the few things that
are actually shared, and precompute everything else."**

---

## 2. Your instinct on CDN is correct — here is the number

> "I think CDN is TOO close to the app to store numerous pool details."

Right, and it's worse than it looks. Three independent reasons pool detail must never go to
the CDN:

**a) The hit rate would be ~0%.** Median pool = 1 member. One viewer, polling on some
interval, against a TTL. That viewer populates the cache and is also the only one who reads
it. Hit rate ≈ `(requests − 1) / requests` per key per TTL window — for a single-member pool
that is *zero useful hits*. You'd pay full origin cost anyway, plus cache overhead.

**b) Vercel's edge is many isolated PoPs.** A cache entry populated in London does nothing
for a viewer in São Paulo. Splitting 623 low-traffic keys across hundreds of PoPs multiplies
the cold-miss problem rather than reducing it. Edge caching wants *few keys, many hits*;
this is *many keys, few hits* — the exact inverse.

**c) It isn't publicly cacheable in the first place.** Pool pages are auth-gated and the
content is viewer-shaped: your own picks, admin-only visibility, the reveal gate that hides
other members' predictions until lock. A shared CDN object cannot represent that without
either leaking picks or fragmenting the key by user — and keying by user takes cardinality
from 623 to ~4,800 and the hit rate to zero.

**CDN keeps exactly three jobs:** static assets, team flags/images, and the genuinely public
boards `/play/*` and `/tv/*` — few keys, identical bytes for every viewer, no auth. Those
are already on ISR (30–60s); adding `s-maxage` + SWR there is worth doing and is the *only*
CDN change recommended.

---

## 3. The blocker that has to clear before any shared cache

The largest pool's shared prediction payload, measured:

| Shape | Size |
|---|---:|
| `select('*')` — what it was | **5,420 kB** |
| Narrowed to the 8 used columns — after today's fix | **3,854 kB** |

The narrowing bought 1,566 kB (29%), as predicted. But **3.8 MB still exceeds Vercel Runtime
Cache's 2 MB per-item limit** — the current `getPoolData` shape *cannot be stored there at
all* for big pools. It's also a poor Redis citizen: 3.8 MB per key, transferred on every
miss, for the four pools that matter most.

And today that same payload is serialised into the RSC response to the browser **every 30
seconds** per open tab (`PoolDetail.tsx:666`). On cellular that is brutal for the user and
expensive in Vercel bandwidth.

> **Therefore: shrinking the pool payload is a prerequisite for the shared-cache layer, not
> a parallel nice-to-have.** Nothing in §5 works until the object fits.

The fix direction: the client needs *derived* facts from `allPredictions` (crowd consensus,
per-entry stats), not the 13,385 raw rows. Now that `computeCrowdConsensus` is split out,
the consensus can be computed server-side once and shipped as ~100 rows instead of ~13,000.

---

## 4. Layer-by-layer review

### Layer 0 — Request-scoped memoisation · **adopt, it's free**
React's `cache()` dedupes identical calls within a single render/request. No infra, no
staleness risk, no invalidation to get wrong.

Current waste it would remove: `isPoolCacheEnabled()` re-reads `sync_settings` per request;
`requireAuth()` re-resolves the same user per API call; `getScoringSource()` re-reads flags.
Small individually, but they're on literally every request.

### Layer 1 — Client cache
**Web:** exists (RSC + router cache) but is actively defeated by the 30s `router.refresh()`.
Fix the poll and this layer starts working for free.

**Mobile: nothing at all.** No react-query, no SWR — hand-rolled `useState`/`useEffect`, and
six surfaces refetch on `useFocusEffect`. Every tab switch re-runs a full load including the
uncached leaderboard route. **This is the single largest untapped win on mobile**, and it
reduces origin load without any server-side cache existing.

### Layer 2 — CDN / edge · **narrow it, don't extend it**
See §2. Public boards and assets only.

### Layer 3 — Next.js Data Cache (`unstable_cache`) · **in use, needs two changes**
Today: 45s TTL, per-pool tag, `revalidateTag(tag, { expire: 0 })` on every score change.

Two problems: (1) `expire: 0` hard-expires every affected pool at exactly the moment traffic
peaks — a goal at full-time blows the cache for everyone simultaneously. Stale-while-
revalidate is the correct semantic: serve seconds-stale to the crowd, refresh once in the
background. (2) It's regional on Vercel, so the benefit doesn't pool across regions.

Next 16.1.6 supports `'use cache: remote'` (backed by Runtime Cache) behind
`cacheComponents: true` — but that's a broad framework migration and should not ride along
with any of this.

### Layer 4 — Shared KV: Runtime Cache vs Redis

| | Vercel Runtime Cache | Redis (Upstash) |
|---|---|---|
| Infra | none | a service to run + pay for |
| Scope | **per-region**, isolated | global or single-region |
| Item limit | **2 MB** | far higher |
| Invalidation | tags (`expireTag`), ~300ms | manual keys/patterns |
| Survives deploys | yes | yes |
| Data structures | KV only | KV, **sorted sets**, hashes |

**Recommendation: don't stand up Redis yet — but the case for it is specific and real when
you do.** The reason to choose Redis here is *not* "a bigger cache". It's that a leaderboard
is a sorted set. `ZADD`/`ZREVRANGE`/`ZRANK` give you top-N and a member's rank in O(log n)
without materialising or recomputing the whole board — which is precisely the operation
these routes do most and most expensively. If Redis goes in, it should go in as the
**leaderboard data structure**, not as a generic blob cache. Using it as a blob cache buys
little over Runtime Cache and costs money.

Until then, Runtime Cache covers the need at zero infra — **once §3 clears and objects fit
under 2 MB**.

### Layer 5 — Database precompute · **highest leverage, already built, switched off**
The cheapest cache is the one you don't need, because the data is already stored in the
shape you read it in.

`entry_xp_state` and the shadow engine's materialised totals already exist. They are not
read: `sync_settings.analytics_read_from_columns = false`. Meanwhile the API routes
recompute XP, streaks and crowd stats from scratch on every request.

A leaderboard read should be an indexed `SELECT`, not a computation. This layer needs no new
infrastructure, has no staleness semantics to design, no invalidation to get wrong, and no
per-region problem. **It is strictly better than caching the computation, and it's ~80%
built.**

---

## 5. Recommended architecture

```
Browser / App
  ├─ Web: RSC + router cache        ← unblock by fixing the 30s poll
  └─ Mobile: client cache (NEW)     ← biggest mobile win; TTL + focus-dedup
        │
CDN / Edge                          ← /play/*, /tv/*, assets ONLY. Never pool detail.
        │
Vercel Function
  ├─ Layer 0: React cache()         ← free per-request dedup
  ├─ Layer 3/4: tagged cache, SWR   ← per-pool, short TTL, background refresh
  │              (Runtime Cache once payloads < 2 MB)
        │
Postgres
  └─ Layer 5: precomputed tables    ← entry_xp_state / shadow totals: READ THESE
```

**The principle:** push work *down* to Layer 5 wherever the shape is stable, and cache at
Layers 3/4 only what genuinely can't be precomputed. Keep the CDN out of per-pool data
entirely.

---

## 6. Sequencing

| # | Step | Layer | Why here |
|---|---|---|---|
| 1 | Read from `entry_xp_state` (flip `analytics_read_from_columns` after a parity pass) | 5 | Biggest lever, already built, no new infra |
| 2 | Mobile client cache | 1 | Largest untapped win; needs no server change |
| 3 | Fix the 30s poll; make it visibility-gated | 1 | Unblocks the web client cache; cuts payload volume |
| 4 | Shrink the pool payload below 2 MB | — | **Prerequisite** for step 5 |
| 5 | Per-pool tagged cache w/ SWR on the mobile API routes | 3/4 | The full-time herd fix |
| 6 | `s-maxage` + SWR on `/play/*`, `/tv/*` | 2 | Cheap, big audience, correct CDN use |
| 7 | React `cache()` on per-request lookups | 0 | Free cleanup, do alongside anything |
| 8 | Redis — **only** if leaderboards become sorted sets | 4 | Revisit under real multi-competition load |

Steps 1–3 need no new infrastructure and are where the value is concentrated.

---

## 7. Decisions — settled 2026-07-26

1. **Staleness budget: 30 seconds.** Matches the existing poll cadence and the recorded
   "predictions app, not a score ticker" principle. Drives the step-5 TTL.
2. **Mobile cache: react-query.** Takes the dependency; gives focus-dedup, TTL, background
   refetch and request de-duplication, all four of which the current hooks need.
3. **Parity pass: run now → ❌ RAN AND FAILED.** See
   `2026-07-26_analytics_parity_result.md`. 187/331 entries mismatch. Root cause is *not*
   staleness: `entry_xp_state.total_xp` has **two writers with different formulas**
   (`badges.ts` writes Σ match points + badge XP; `entryAnalytics.ts` writes
   `computeFullXPBreakdown` XP), and the analytics sweep isn't even registered in
   `vercel.json`, so `badges.ts` is the de facto owner. **Step 1 is blocked** until XP has a
   single owner — and that's a correctness fix worth doing regardless, since
   `current_level` is already read on `/pools` and `/dashboard`.
4. **Redis: hold.** Nothing in the current numbers justifies it, and steps 1–5 change the
   shape of the problem enough that the Redis design should be drawn *after* them. Revisit
   as the leaderboard *data structure* (sorted sets), not a blob cache.

### Revised order, given step 1 is blocked

Step 1 (`entry_xp_state` reads) now depends on the XP-ownership fix. Steps 2 and 3 (mobile
client cache, the 30s poll) are **independent of it** and become the next work — they need
no server change and no new infrastructure.
