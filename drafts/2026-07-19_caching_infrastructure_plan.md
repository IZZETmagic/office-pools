# Full caching infrastructure — assessment + plan

_Drafted 2026-07-19 (after the WC final). Trigger: a ~63% DB CPU hump at full-time
(22:05 UTC) despite "caching being on." Peak was survivable (no saturation), so this
is **scale-readiness for thousands**, not a fire._

## 1. Current state (verified)

| Surface | Cached? | Mechanism |
|---|---|---|
| Web pool page `/pools/[id]` | ✅ | `getPoolDataCached` → `unstable_cache`, 45s TTL, tag `pool-data-${poolId}`, invalidated on score change via `invalidatePoolCache` (`revalidateTag(..., {expire:0})`) |
| Public boards `/play/[slug]`, `/play/sargasso-sea`, `/tv/*` | ✅ | route-level ISR `export const revalidate = 60` |
| Mobile API `/api/pools/[id]/leaderboard`, `/breakdown`, `/entries/[id]/analytics`, `/matches/[id]/scores` | ❌ | compute-on-read; call `readSource` + `entryAnalytics`/`computeFullXP` live, no cache directive |
| Analytics / XP / badges | ❌ | recomputed per read; `sync_settings.analytics_read_from_columns = false` → the precomputed `entry_xp_state` columns exist but are **not read** |
| Direct mobile PostgREST reads (`user_presence`, `users`, …) | ❌ | Expo app hits `/rest/v1/*` directly (can't be cached by Next) |

Flags today: `pool_cache_enabled = true`, `analytics_read_from_columns = false`,
`shadow_read_enabled_pools = [all pools]` (shadow is the sole scorer as of the
2026-07-19 cutover).

## 2. Why full-time still spiked

1. **Hot path uncached.** Mobile leaderboard/analytics opens recompute from scratch —
   the ~400ms `pool_entries` `row_to_json` query (top of `pg_stat_statements`). Push-tap
   traffic at full-time all lands here.
2. **Web cache invalidates at the worst moment.** `expire:0` on every score change ⇒ at a
   goal/full-time every affected pool's cache is blown ⇒ next viewer per pool misses
   (thundering herd, bounded by the 45s backstop).
3. **Precompute is off.** Shadow already materializes totals into `shadow_entry_totals` +
   `entry_xp_state`; reads don't use them.

Evidence: scoring compute at full-time was one **3.13s** set-based sweep; the CPU hump was
~15–20 min wide → the width is **reads**, not calculation.

## 3. Plan — three layers, reusing what's half-built

### Layer 0 — Serve from precompute (kill compute-on-read)  ⟵ do first
The shadow engine already computes + stores every entry's totals on a cron. Make reads
**SELECT** from that instead of recomputing.
- Point the analytics/XP read path at `entry_xp_state` columns; flip
  `analytics_read_from_columns → true` **after a parity pass** (this is the M4 read-path-flip
  already built locally, branch unpushed — see [[project_backlog_leaderboard_precompute]]).
- Make `/api/pools/[id]/leaderboard` + `/breakdown` serve materialized totals directly
  (they already read `readSource`; ensure it resolves to the stored shadow totals, not a recompute).
- **Effect:** a leaderboard read drops from ~400ms recompute → a few-ms indexed SELECT.
  Foundational; makes every other layer cheap. **Biggest single lever.**
- **Risk:** correctness (must parity-check before flip). Reversible via the flag (instant).

### Layer 1 — Cache the mobile API routes, stampede-safe  ⟵ the direct fix for tonight
Wrap `/api/pools/[id]/leaderboard`, `/breakdown`, `/analytics`, `/matches/[id]/scores` in the
same per-pool tag cache as the web page — **but** replace invalidate-on-every-score with
**short TTL + stale-while-revalidate**:
- At full-time the crowd is served a few-seconds-stale board from cache while **one**
  background refresh recomputes. No herd.
- Staleness budget: 15–30s during live play is fine — this is a predictions app, not a score
  ticker (see [[product-predictions-not-score-tracker]]).
- **Effect:** this is the single change that would have flattened tonight's hump.
- **Risk:** low. Next Data Cache on Vercel is shared across instances. Gate behind a flag.

### Layer 2 — Edge/CDN the public boards
`/play/*` + `/tv/*` are public and identical for all viewers ⇒ add `s-maxage` + SWR so the CDN
serves them and most reads never reach the origin/DB.
- **Effect:** takes the public/TV audience off the DB almost entirely.
- **Risk:** low (already ISR 60s; this pushes it to the edge). Mind the security-headers
  middleware (`/tv/*` is already frame-exempt).

### Layer 3 — (optional) shared KV/Redis
Only if we want cross-instance sub-second caching beyond Next's Data Cache. Probably
unnecessary once Layer 0+1 land. Revisit under real load.

## 4. Sequencing & why

1. **Layer 0** first — makes reads cheap, de-risks everything, mostly already built.
2. **Layer 1** — the SWR API-route cache; directly removes the full-time herd.
3. **Layer 2** — edge the public boards; cheap, big audience.
4. **Layer 3** — only if metrics still say so.

None of this is net-new infra — it's finishing the shadow materialization + `entry_xp_state`
+ M4 flip and connecting them to the read paths that were left recomputing.

## 5. Open questions for Ryan
- Staleness budget during live matches — 15s? 30s? (drives Layer 1 TTL)
- Do Layer 0's parity pass on shadow totals now (bracket_picker is out of shadow scope — keep it
  on its own path), or wait until the tournament fully settles?
- Appetite for edge-caching `/tv` given the security-headers CSP?
