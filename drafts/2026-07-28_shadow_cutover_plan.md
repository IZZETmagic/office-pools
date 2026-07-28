# Plan: read the precomputed shadow totals, and finish the cutover

_2026-07-28. Concrete and sequenced. Numbers measured, not estimated._

---

## The root cause, stated plainly

The shadow engine already computes and stores every entry's totals in
`shadow_entry_totals` (`match_points`, `bonus_points`, `total_points`, `final_rank`).
`/api/pools/[pool_id]/leaderboard` already reads them and returns a fully-computed
leaderboard — ranks, last-five, streak, hit rate, exact count. **Mobile calls it.**

The **web** pool page does not. `LeaderboardTab.tsx:124` pulls all 13,385 `match_scores`
rows into the browser and sums `total_points` per entry — to re-derive a number that is
already sitting in one column, precomputed.

> **Two leaderboard implementations exist. The web one ignores the shadow engine's output
> and recomputes from raw rows.** That is the entire problem, and it is why pool open is
> 12.7 MB.

Measured on the largest pool (192 entries, 104 matches):

| Component of pool open | Wire size | Needed by the default tab? |
|---|---|---|
| `matchScores` (13,385 rows × 22 cols) | 8,477 kB | **No** — totals are precomputed |
| `allPredictions` (13,385 rows) | 3,815 kB | **No** — other tabs only |
| `members` | 218 kB | Yes |
| `matches` | 121 kB | Yes |
| **total** | **12,683 kB** | |

---

## Phase 1 — web leaderboard reads the precomputed totals (the whole win)

**Change:** the pool page stops passing raw `matchScores` / `allPredictions` to the
leaderboard, and renders from the same precomputed shape the API already returns.

**Files:**
- `lib/poolData.ts` — `getPoolDataUncached`: drop `matchScores` + `allPredictions` from
  the default fetch. Keep `members`, `matches`, `settings`, `teams`, `bonusScores`.
- `app/pools/[pool_id]/LeaderboardTab.tsx` — delete `matchScoresByEntry`,
  `storedMatchPointsMap` and the client-side sums (lines ~91–131); read
  `entry.match_points` / `bonus_points` / `scored_total_points` / `current_rank`, which
  `readEntryScoring` already puts on each entry.
- `app/pools/[pool_id]/page.tsx` — stop threading the two arrays into `PoolDetail`.

**Expected:** pool open **12,683 kB → ~340 kB** (members + matches + settings + bonus).
**~37×.** Verify by re-running the measurement script against `getPoolData`.

**Risk:** low. The numbers already exist on the entry rows; this deletes a re-derivation
rather than changing a formula. Any mismatch means prod and shadow disagree, which is
exactly what we want surfaced.

## Phase 2 — the other tabs fetch their own data

`allPredictions` and wide `matchScores` are genuinely needed by results, analytics,
my-bracket and member-predictions. They are **not** needed to open a pool.

- Results / analytics / my-bracket: fetch on tab open, scoped to the selected entry
  (`entryMatchScores` is already `matchScores.filter(entry_id === selected)` — ~104 rows,
  not 13,385).
- `PointsBreakdownModal` + `results/MatchCard`: fetch the wide rows for the one entry
  being viewed. **A route already exists:**
  `app/api/pools/[pool_id]/entries/[entry_id]/breakdown/route.ts`.
- Member predictions ("see everyone's picks"): fetch on that tab only, still behind the
  existing server-side `computeReveal` gate.

Compiler-verified: only **3 files** touch the 14 wide columns — the breakdown route, the
breakdown modal, and `MatchCard`. Nothing pool-wide needs them.

## Phase 3 — finish the cutover

Today: `prod_scoring_enabled = true`, **83 of 623 pools** read shadow (all
`bracket_picker`). 540 pools still read prod.

1. **Fix C1 first — non-negotiable.** Shadow drops manual `point_adjustment` on *unscored*
   entries (`CEM`, 223 pts). One casualty today because 31 of 32 adjusted entries in
   shadow pools happen to be scored. Widening to 540 pools turns a one-off into a pattern.
   Fix = materialise a `shadow_entry_totals` row for any entry with a non-zero adjustment,
   scored or not.
2. **Run `scripts/verify-read-paths.ts`** against the candidate pools — it reports exactly
   the zero-fill exposure that C1 is an instance of.
3. **Recalculate, then enable, in batches** (the existing recipe): recalc a batch, confirm
   shadow totals equal prod totals, add those pool ids to `shadow_read_enabled_pools`.
   Rollback is always `[]`.
4. **`prod_scoring_enabled = false`** only after all 623 read shadow and the parity alarm
   (jobid 21) is green across a full cycle.
5. Podium ownership must be in SQL before the Node engine can be deleted — see the
   2026-07-27 gap audit.

---

## Order

**Phase 1 is independent of Phase 3** and delivers the payload win on its own — do it
first, it is the smallest change with the largest measured effect. Phase 3 is the actual
cutover and is gated on C1. Phase 2 is cleanup that Phase 1 makes possible.

## What I got wrong getting here

I optimised the *refresh* path (388× on refreshes, shipped) because that is what the
backlog item described, without checking it against the original ask — reads on **pool
open**. The refresh work is real and stands, but it was not the thing asked for, and the
duplicated leaderboard computation above was sitting in plain sight the whole time.
