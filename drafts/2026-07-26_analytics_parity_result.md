# Analytics read-path parity pass — RESULT: ❌ DO NOT FLIP

_Run 2026-07-26 via `npx tsx scripts/verify-analytics-parity.ts`. This was step 1 of the
caching strategy (serve analytics from `entry_xp_state` instead of recomputing per read)._

## Verdict

**Parity failed. The read-path flip is blocked, and the blocker is a pre-existing data bug
that is already visible to users today.**

| | |
|---|---:|
| Entries compared | 331 |
| Exact matches | 144 |
| Rounding-only (expected) | 0 |
| **Real mismatches** | **187** |
| Missing stored rows | 0 |
| Pools clean / mismatched | 5 / 5 |

Mismatches by field: `total_xp` 187, `current_level` 73, `crowd_agreement_pct` 16,
`contrarian_wins` 12.

The split was perfectly mode-shaped: **all 5 clean pools were `progressive`, all 5 failing
pools were `full_tournament`.**

## Root cause: two writers, two different definitions of "XP", one column

`entry_xp_state.total_xp` and `.current_level` are written by **two independent code paths
that compute fundamentally different quantities**. Last writer wins.

**Writer A — `lib/push/badges.ts:400`** (runs on *every* scoring recalc, via
`recalculate.ts:319`):

```ts
const matchPoints = scores.reduce((sum, s) => sum + s.total_points, 0)  // SCORING POINTS
const totalXP = matchPoints + badgeXP
```

**Writer B — `lib/analytics/entryAnalytics.ts:238`** (the analytics sweep):

```ts
total_xp: xp.totalXP   // computeFullXPBreakdown: base match XP (stage multipliers)
                       // + bonus XP events (crowd/streak) + badge XP
```

Writer A sums **scoring points**. Writer B sums **XP** — a different unit, computed from
stage multipliers and crowd/streak bonus events. They are not two implementations of one
formula; they are two different formulas.

### Proof

For four mismatched entries, `stored_total_xp − Σ match_scores.total_points` yields a clean
badge-XP residual, and **two entries with the identical badge set yield the identical
residual (355)**:

| entry | stored | Σ match points | implied badge XP | badges |
|---|---:|---:|---:|---|
| 8625aa82 | 3780 | 3425 | **355** | 6 badges |
| d221bdd9 | 3080 | 2725 | **355** | same 6 badges |
| ab17057f | 3635 | 3200 | 435 | 7 (＋showtime) |
| c9578afa | 3865 | 3550 | 315 | 5 (−ice_breaker) |

The stored value is exactly Writer A's formula. `analytics_updated_at` is set on these rows
regardless — so **the timestamp lies**: it records when Writer B last ran, not what wrote
the value now in the column.

### Why the mode split

- **`full_tournament` pools** were recalculated 2026-07-20 11:53 → Writer A overwrote
  `total_xp` → `analytics_updated_at` still shows the earlier backfill (11:54) → mismatch.
- **`progressive` pools** had their analytics backfill run 2026-07-21 13:52, *after* their
  last recalc (07-20 11:49) → Writer B's value survived → clean.

Mixed-sign deltas (mostly positive, one −13) are explained: the two formulas simply differ
per entry, with no consistent direction. That is what ruled out plain staleness.

### ~~And the sweep never runs~~ — ⚠️ WRONG, corrected 2026-07-27

> **This section was mistaken and its conclusion is reversed.** It inferred from `vercel.json`
> being `{}` that the analytics sweep is unregistered, and therefore that Writer A is the sole de
> facto owner.
>
> **Crons in this project are `pg_cron` jobs that POST to the Next.js routes — not Vercel
> crons.** `vercel.json` says nothing about what runs. Verified against `cron.job`:
> **jobid15 runs `/api/cron/analytics-sweep` every minute and is `active`**,
> `sync_settings.analytics_sweep_enabled = true`, and `analytics_last_run_at` shows it running
> minutes ago.
>
> **So both writers have been running concurrently all along, racing each other** — a
> once-a-minute sweep against every scoring recalc. That is *worse* than a single de facto
> owner, and it makes the single-owner fix more necessary, not less. It also explains the
> mixed-sign deltas better than the "backfill vs recalc ordering" story below.
>
> The rest of this document — the two-formula root cause, the proof, and the required fixes —
> stands unchanged.

_Original text:_ `vercel.json` is `{}` — the analytics-sweep cron is not registered, exactly as
its own header comment says ("NOT in vercel.json yet"). So in production Writer A is the de facto
owner of `total_xp`/`current_level`; Writer B has only ever run as a one-off backfill.

## Why this matters beyond caching

`entry_xp_state.current_level` is **already read in production** — `app/pools/page.tsx:95`
and `app/dashboard/page.tsx:188`. So users are already shown a level derived from whichever
writer touched their row last. Two members with identical performance can display different
levels depending only on whether their pool was recalculated after the backfill.

This is not a caching problem and was not introduced by the performance work. The parity
pass surfaced it.

## Ruled out

- **My `computeCrowdPredictions` refactor.** Re-ran the same pool with the refactor stashed:
  identical 5/5 mismatches. Innocent.
- **Stale inputs.** For the failing pool: 0 entries submitted/saved/created after the
  snapshot; `matches` unchanged since 07-19 22:05; ranks unchanged since 07-20 11:53:32;
  `match_scores` older than the snapshot. Same inputs, different output.
- **Pool composition drift** (which would change crowd consensus for everyone). Zero
  membership or submission changes after the snapshot.
- **The `numeric(5,2)` rounding difference** (`hit_rate`, `crowd_agreement_pct` are rounded
  by the writer, unrounded in the route). Real but cosmetic — the checker classifies it
  separately and it accounted for **0** of the failures.

## What has to happen before the flip

1. **Decide the definition of `total_xp`.** One formula, one owner. `computeFullXPBreakdown`
   is the richer and more intentional one (it is what the Form tab and leaderboard show);
   `badges.ts` appears to use match points as a convenient proxy for level thresholds.
2. **Make `badges.ts` stop writing `total_xp`/`current_level`,** or make it call the same
   function. It needs a level for level-up pushes — it should read the agreed value, not
   invent one.
3. **Register the analytics sweep** in `vercel.json`, with the trigger it already describes
   (pools whose `last_rank_update` moved).
4. **Re-run this parity check.** It must come back clean.
5. Only then flip the read path.

Steps 1–2 are a correctness fix that should happen **whether or not** the caching work
proceeds, because the level shown to users today is already ambiguous.

## Re-running

```bash
npx tsx scripts/verify-analytics-parity.ts
```

Defaults to a representative sample (3 biggest + 2 smallest pools per prediction mode).
`--all` for every pool (slow); or pass explicit pool ids. Read-only, writes nothing.
Exits non-zero on failure, so it can gate a deploy.
