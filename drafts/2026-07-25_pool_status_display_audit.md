# Pool status — full display-site audit

**Date:** 2026-07-25
**Purpose:** Map every site that displays or derives `pools.status` before changing the lifecycle model.
**Scope:** Web (`app/`, `components/`, `lib/`) + Expo RN (`mobile/`). The Swift app (`ios/`) is excluded — not customer-facing.
**Status:** Audit only. No code changed.

---

## 1. Ground truth (verified against prod `ujthamlehjyubbzxbnes`, 2026-07-25)

```
pools.status:   open = 611,  completed = 12          -- only two values exist
column:         varchar, DEFAULT 'open', NULLABLE, NO CHECK constraint
pool_round_states.state:  completed = 1840,  locked = 121
last match:     2026-07-19 19:00 UTC  (0 unfinished — tournament fully over)
```

Values referenced in code but **never written by any path**: `active`, `upcoming`, `archived`.
Value offered in admin UI but **never used in prod**: `closed` (0 rows).

---

## 2. The core diagnosis: `status` is three concepts in one column

The admin UI's own copy gives the game away:

| Value | Admin description | What it actually encodes |
|---|---|---|
| `open` | "Accepting new members" | **join-ability** |
| `closed` | "No new members" | **join-ability** |
| `completed` | "Tournament finished" | **lifecycle** |

`open`/`closed` is a *membership* toggle. `completed` is a *lifecycle* state. They are orthogonal, but
they share one column, so they're forced to be mutually exclusive. Adding `in_progress` (a *tournament
phase*, a property of the tournament, not the pool) would make it three overloaded concepts.

**Consequence — latent bug (see §6.1):** setting a pool to `closed` makes it vanish from every
member's dashboard, because dashboards filter on `status === 'open' || 'active'`.

---

## 3. Inventory — web, user-facing

### 3.1 Helper functions (status → label / color / class)

| File:line | Function | Notes |
|---|---|---|
| `app/pools/PoolsClient.tsx:122` | `getStatusAccentColor` | card left-edge accent |
| `app/pools/PoolsClient.tsx:137` | `getStatusBorderColor` | needs-predictions border, `open\|active` |
| `app/pools/PoolsClient.tsx:143` | `getPoolAction` | CTA: `completed`→"Results", `closed`→"Closed" |
| `app/pools/PoolsClient.tsx:170` | `getPoolStatusText` | points/rank blurb (not status-derived) |
| `app/pools/PoolsClient.tsx:187` | `getStatusTagClass` | Tailwind classes per status |
| `app/pools/PoolsClient.tsx:198` | `getStatusLabel` | explicit switch, **`default: return status`** (raw) |
| `app/dashboard/DashboardClient.tsx:149` | `getStatusBorderColor` | duplicate |
| `app/dashboard/DashboardClient.tsx:155` | `getPoolStatusText` | duplicate |
| `app/dashboard/DashboardClient.tsx:182` | `getStatusTagClass` | **near-duplicate** — diverges on `completed` dark token (`dark:text-neutral-400` vs `-700`) |
| `app/dashboard/DashboardClient.tsx:193` | `getStatusLabel` | exact duplicate |
| `components/ui/Badge.tsx:28` | `getStatusVariant` | shared; **returns variant only, no label** → callers render raw string |

### 3.2 Rendered badges / pills

| File:line | Surface |
|---|---|
| `app/pools/PoolsClient.tsx:655` | pool card (branded/grid) |
| `app/pools/PoolsClient.tsx:805` | pool card (variant 2) |
| `app/pools/PoolsClient.tsx:997` | pool card (list/compact) |
| `app/pools/PoolsClient.tsx:1053` | pool card (variant 4) |
| `app/dashboard/DashboardClient.tsx:525` | dashboard pool card |
| `app/pools/[pool_id]/PoolDetail.tsx:1028-1035` | header badge — **inline**, duplicates `getStatusTagClass` |
| `app/pools/[pool_id]/PoolInfoTab.tsx:175-182` | Pool Details "Status" row — **inline** ternary + naive capitalize |

### 3.3 Raw DB string reaching the user

| File:line | Issue |
|---|---|
| `app/pools/[pool_id]/PoolDetail.tsx:1034` | `closed`/`completed`/`upcoming` render as raw lowercase; only CSS `capitalize` saves it |
| `app/pools/[pool_id]/PoolInfoTab.tsx:181` | `charAt(0).toUpperCase() + slice(1)` on raw value |
| `app/pools/PoolsClient.tsx:533-536` | filter `<option>` labels naively capitalized, bypassing `getStatusLabel` |

### 3.4 Filtering / sorting / counts

| File:line | What |
|---|---|
| `app/pools/PoolsClient.tsx:248, 281-283` | `statusFilter` state + predicate |
| `app/pools/PoolsClient.tsx:393-397` | `availableStatuses` — options derived **dynamically from data present** |
| `app/pools/PoolsClient.tsx:524-539` | the status `<select>` |
| `app/pools/PoolsClient.tsx:287, 294-295` | `statusOrder` sort tier: `open/active:0, upcoming:1, closed:2, completed:3` |
| `app/pools/PoolsClient.tsx:342` | Discover search hardcodes `status: 'open'` |
| `app/pools/page.tsx:247` + `PoolsClient.tsx:428,443` | "Active" hero stat = `open\|active` |
| `app/dashboard/page.tsx:359` | **dashboard display list** filtered to `open\|active`; drives totalPools/points/bestRank |

### 3.5 Join + public landing

| File:line | What |
|---|---|
| `app/join/[pool_code]/JoinPoolClient.tsx:42` | `isOpen = status === 'open'` gates Join button |
| `app/join/[pool_code]/page.tsx:35,80` | selects + forwards status |
| `app/play/[slug]/page.tsx:62` | passes `status` into branded landing |
| `app/play/[slug]/BrandedLandingClient.tsx:597` | `isLive ? 'Live' : isComplete ? 'Final' : status === 'open' ? 'Open' : status` — **raw fallback** |
| `app/play/sargasso-sea/poolConfig.ts:8` | hardcoded `status: 'open'` |

---

## 4. Inventory — super admin

All super-admin surfaces render the **raw lowercase DB string**, because `getStatusVariant` supplies
no label.

| File:line | What |
|---|---|
| `app/admin/super/PoolsTab.tsx:342` | hardcoded `['open','closed','completed']` dropdown |
| `app/admin/super/PoolsTab.tsx:346-374` | Change-Status modal; raw badge at :360 |
| `app/admin/super/PoolsTab.tsx:352` | toast `Status changed to ${selectedStatus}` — raw value in copy |
| `app/admin/super/PoolsTab.tsx:1051` | "Change Status" quick action |
| `app/admin/super/PoolsTab.tsx:1108, 1168, 1951, 2068` | raw status in header badge, config table, table cell, mobile card |
| `app/admin/super/PoolsTab.tsx:1798-1805, 1877-1883` | filter state + per-status counts |
| `app/admin/super/PoolsTab.tsx:2000-2036` | mobile `<select>` + desktop pill row |
| `app/admin/super/PoolsTab.tsx:165, 180` | audit-log label + color for `change_pool_status` |
| `app/admin/super/BrandedPoolsTab.tsx:900, 1111, 1214` | raw status badges (3 sites) |
| `app/admin/super/UsersTab.tsx:668` | `<option>`: `name (code) — ${status}` raw in dropdown text |
| `app/admin/super/UsersTab.tsx:1148-1150` | memberships table — independent color ternary |
| `app/admin/super/StatsTab.tsx:83-87` | `STATUS_COLORS` keyed by **Title-Case** label — separate color source |
| `app/admin/super/StatsTab.tsx:260` | `activePools` KPI counts **`open` only** — diverges from user-facing `open\|active` |
| `app/admin/super/StatsTab.tsx:265-275, 446-491` | by-status donut chart + legend |
| `app/admin/super/StatsTab.tsx:560-561` | top-pools badge — another ternary |

---

## 5. Inventory — mobile (Expo)

| File:line | What |
|---|---|
| `mobile/components/pool-detail/PoolInfoTab.tsx:480` | `statusTone` |
| `mobile/components/pool-detail/PoolInfoTab.tsx:487` | `statusLabel` — naive capitalize fallback |
| `mobile/components/pool-detail/PoolInfoTab.tsx:297` | **the only pool-status badge in the whole mobile app** |
| `mobile/components/pool-detail/PoolDetailHeader.tsx:147, 275` | Share button gated on `status === 'open'` (both header variants) |
| `mobile/components/pool-detail/SettingsTab.tsx:1107` | `statusDescription` copy |
| `mobile/components/pool-detail/SettingsTab.tsx:438-458` | Open/Closed/Completed segmented picker |
| `mobile/components/pool-detail/SettingsTab.tsx:325` | mark-complete writes `status: 'completed'` |
| `mobile/components/pools/PoolsFilterBar.tsx:7, 26-31` | `StatusFilter` incl. **dead `'archived'`**; missing `'active'` |
| `mobile/app/(tabs)/pools.tsx:213` | exact-match filter, no `open`/`active` aliasing |
| `mobile/lib/useHomeData.ts:610-613` | `activePools` = `open\|active`; drives home + aggregate stats |
| `mobile/lib/useDiscoverPools.ts:61` | server-side `.eq('status','open')` |
| `mobile/lib/usePoolDetail.ts:25,72,111,134` | carries status into detail model |

**Confirmed:** mobile pool *cards* (`home/PoolCard.tsx`, `pools/PoolListItem.tsx`,
`pools/DiscoverPoolCard.tsx`) render **zero** status — 0 refs each. Mobile shows status in exactly one place.

---

## 6. Inventory — API / data layer, email, push

| File:line | What |
|---|---|
| `app/api/pools/join/route.ts:40-41` | `status !== 'open'` → "This pool is no longer accepting new members." **The only user-facing prose derived from pool status.** |
| `app/api/pools/create/route.ts:71` | new pools `status: 'open'` |
| `app/api/admin/branded-pools/route.ts:138` | branded pools `status: 'open'` |
| `app/api/pools/search/route.ts:12,25,32-33` | `status` param defaults to `'open'`; `.eq()` unless `all` |
| `app/api/admin/pools/[id]/actions/route.ts:45-68` | `change_status`, `validStatuses = ['open','closed','completed']` |
| `app/api/admin/users/[id]/route.ts:225-227` | add-to-pool list `.in('status', ['open','closed'])` |
| `app/pools/[pool_id]/admin/SettingsTab.tsx:325-329` | canonical editable set: Open / Closed / Completed |
| `app/pools/[pool_id]/admin/SettingsTab.tsx:218-225` | mark-complete writes `completed` |
| `lib/auto-archive.ts:24-25, 90` | reads `['open','active']`, writes **`'completed'`** despite "archive" naming |
| `lib/push/deadline-warnings.ts:48` | audience filter `.eq('status','open')` |
| `lib/push/time-based.ts:72, 160` | audience filters `.eq('status','open')` |

**Email/push templates: no body copy anywhere renders a pool's status.** Verified across
`lib/email/*` and `lib/push/*` — every `pools.status` reference is a server-side audience filter.
This means **the email/push surface has zero blast radius** for this change.

---

## 6.1 Latent bug found during the audit

**Setting a pool to `closed` removes it from members' dashboards.**

`closed` is offered in web pool-admin (`SettingsTab.tsx:326`), mobile pool-admin
(`SettingsTab.tsx:438-458`), and super-admin (`PoolsTab.tsx:342`), described as "No new members."
But every dashboard filters to `status === 'open' || 'active'`:

- `app/dashboard/page.tsx:359` — comment says *"Filter to only active pools for dashboard display"*;
  drives the rendered list **and** `totalPools`, `totalPoints`, `bestRank`
- `mobile/lib/useHomeData.ts:610-613` — same, drives home + aggregate stats
- `app/pools/page.tsx:247` — "Active" hero count

So an admin who closes their pool to new members mid-tournament silently makes it disappear from
every member's dashboard and drops it out of their points/rank totals.

**Severity: latent, not live.** Prod has 0 `closed` pools, so nobody has hit it. It fires the first
time any admin uses a button that both apps currently offer.

---

## 7. Cross-cutting findings

1. **8 independent status→color implementations**, no shared source of truth:
   `PoolsClient.getStatusTagClass`, `DashboardClient.getStatusTagClass` (subtly divergent),
   `PoolDetail.tsx:1029` inline, `PoolInfoTab.tsx:176` inline, `Badge.getStatusVariant`,
   `UsersTab:1148` inline, `StatsTab:560` inline + `StatsTab.STATUS_COLORS`, mobile `statusTone`.

2. **3 divergent label strategies:** explicit switch w/ raw fallback (web pools + dashboard);
   naive capitalize (web PoolInfoTab, mobile `statusLabel`, StatsTab chart); no mapping at all
   (every super-admin surface).

3. **`getStatusVariant` returns no label** — the direct cause of raw lowercase DB strings across
   all of super admin.

4. **Dead defensive branches:** `active` and `upcoming` are handled in ~8 display sites but never
   written. `archived` exists only as a mobile filter option that can never match a row.

5. **`active` counted inconsistently:** user-facing counts use `open|active`; super-admin
   `StatsTab:260` counts `open` only.

6. **No CHECK constraint** on `pools.status` — which is how the phantom `archived` value slipped
   into the mobile filter without anything failing.

---

## 8. Blast radius for the proposed change

Proposal (from discussion): keep `pools.status` as a lifecycle/visibility axis, derive the
display badge from tournament phase × pool status, don't add a stored `in_progress`.

| Area | Sites | Effort |
|---|---|---|
| Consolidate 8 color impls + 3 label impls into one shared helper | ~15 | the bulk of the work |
| Web user-facing badges | 7 render sites | mechanical once helper exists |
| Super admin (raw strings → labels) | ~14 | mechanical; improves as a side effect |
| Mobile | 1 badge + 1 filter | small — mobile barely shows status |
| Email / push | 0 | **none** |
| API contracts | 0 if `status` values unchanged | none |
| DB migration | add CHECK constraint | small, additive |

**Cheapest high-value slice:** one shared `poolStatusDisplay(pool, tournamentPhase)` helper
returning `{ label, tone }`, used everywhere. That alone kills findings 1, 2, 3 and makes the
"Final" state (§ tournament-over-but-not-yet-completed) a one-line addition.

---

## 9. Decisions taken (2026-07-25)

1. **`closed` is a join toggle** → extracted to `pools.accepting_members`. Implemented; see §10.
2. **Scope:** extraction + shared display helper. Dead-value cleanup deliberately deferred.
3. **Rollout:** phased, three deploys.

Still open:
- **Keep `active`/`upcoming` defensive branches?** Nothing writes them. They are now handled in one
  place (`lib/poolStatus.ts`) instead of eight, so the cost of keeping them is much lower.
- **Two-tier retirement (`completed` → `archived`)?** Decides whether the dead mobile "Archived"
  filter gets wired up or removed. Untouched in this pass.
- **Ship the "Final" display state?** The helper already supports it — `poolStatusDisplay(pool,
  'finished')` returns it, with tests. Nothing plumbs a `TournamentPhase` in yet, so no call site
  shows it. Wiring it is now a small, contained change.

---

## 10. What was implemented

**Migrations (written, NOT applied):**
- `lib/migrations/025_pool_accepting_members.sql` — additive: adds `accepting_members` (default
  true), backfills from `status = 'closed'`, rewrites those rows to `'open'`. Deploy 1.
- `lib/migrations/025b_pool_status_check.sql` — `CHECK (status IN ('open','completed'))`. Deploy 3,
  only after the code is live. Includes a pre-flight query and an optional `join_deadline` drop.

**New shared helpers:**
- `lib/poolStatus.ts` + `mobile/lib/poolStatus.ts` — one derivation of label+tone, plus
  `poolJoinability`. Duplicated across the two apps by necessity (separate module graphs).
- `lib/__tests__/poolStatus.test.ts` — 24 tests. The load-bearing ones assert that lifecycle and
  join-ability never leak into each other, and that no raw lowercase DB value can reach the user.

**Consolidated:** 8 status→color implementations → 1; 3 label strategies → 1. Every super-admin
surface that rendered a raw lowercase `{pool.status}` now renders a real label.

**Behavioural changes:**
- `/api/pools/join` gives two distinct refusals instead of one blanket message.
- Pool admin (web + mobile) shows a separate "New Members" control; the status picker is Open /
  Completed only.
- Super admin gains a `set_accepting_members` action, replacing the capability that setting
  `status = 'closed'` used to provide.
- `/api/admin/users/[id]` no longer excludes non-accepting pools from the add-to-pool list.

**Verification:** `tsc` clean on every touched file (repo-wide errors are pre-existing — mobile
resolved under the root tsconfig, plus an iCloud `routes.d 2.ts` duplicate); eslint delta vs HEAD is
**0** (measured in a throwaway worktree at HEAD); 143/143 tests pass.

**⚠ Deploy order is load-bearing.** The code writes `accepting_members` on save, so migration 025
MUST be applied before the code deploys. Reads are defensive (`?? true`), but writes are not.
