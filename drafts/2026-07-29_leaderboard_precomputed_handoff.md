# Handoff: make the web leaderboard read precomputed totals

_Written 2026-07-28 for a fresh session. Everything here is verified against production
data or the compiler, not assumed. Start at §3._

---

## 1. The one-sentence problem

Opening a pool pulls **26,770 rows** (13,385 `predictions` + 13,385 `match_scores`) to
render a leaderboard that needs **192** — one per entry — because `LeaderboardTab`
computes two stats client-side that an existing endpoint already returns precomputed.

| | Rows | Pool open |
|---|---|---|
| Now | 26,770 | **7,721 kB** |
| Target | ~192 | **~340 kB** |

## 2. Why it's only two stats

`LeaderboardTab` derives exactly these from the raw arrays:

- **`hitRate`** ← all 13,385 `match_scores` rows
- **`contrarianWins`** ← all 13,385 `predictions` rows

`GET /api/pools/[pool_id]/leaderboard` already returns, per entry, computed server-side
through `readSource`:

```
match_points  bonus_points  point_adjustment  total_points  current_rank  previous_rank
has_submitted_predictions  last_five  current_streak  hit_rate  exact_count
level  level_name  total_xp  contrarian_wins  crowd_agreement_pct  total_completed
```

Both are in that list. **The mobile app already consumes this route.** The web page does
not — it recomputes from raw rows. That duplication is the entire payload problem.

## 3. ⚠ The trap that will break this if you miss it

**The leaderboard API has NO bracket_picker support.** Verified: zero references to
`bracket_picker` in `app/api/pools/[pool_id]/leaderboard/route.ts`. That mode is scored
client-side in `LeaderboardTab` via `calculateBracketPickerPoints` →
`computedBPBonusMap`.

Swapping all pools to the API would silently zero every bracket_picker leaderboard —
**99 of 623 pools**.

**This is fine, because the payload problem is not in those pools.** bracket_picker stores
picks in `bracket_picker_group_rankings` / `_third_place_rankings` / `_knockout_picks`,
**not** in `predictions`. The 13,385-row payload belongs to full_tournament and
progressive pools — exactly the ones the API handles.

**So: swap by mode.** Non-bracket_picker → API. bracket_picker → keep the current
client-side path until the API grows a bp arm (separate, tracked work).

## 4. Steps

1. **Measure first.** Re-run the payload measurement on pool
   `b7ddbf9d-687d-4e61-a415-807798d972e2` (192 entries) so you have a before number in
   this session. Pattern: `getPoolDataUncached(poolId, true)` + `JSON.stringify` per key.
   Expect ~7,721 kB.

2. **`LeaderboardTab`: consume the API for non-bracket_picker.** Fetch
   `/api/pools/${poolId}/leaderboard` on mount (`poolId` is already a prop — added
   2026-07-28). Use its `hit_rate` and `contrarian_wins` instead of the client-side
   `entryStatsMap` derivation. Keep the bracket_picker branch untouched.

3. **Delete the now-dead derivations** — `matchScoresByEntry`, `matchScoresLookup`, and
   the `entryStatsMap` internals that consume them. (`storedMatchPointsMap` was already
   removed in `79aaa25` after proving its fallback could only ever return 0.)

4. **Drop the arrays from pool open.** In `lib/poolData.ts`, stop fetching
   `matchScores` + `allPredictions` for the default path. The other tabs still need them —
   load per tab (see §5).

5. **Verify** (§6), then measure again. Target ~340 kB.

## 5. Who else uses the two arrays

These must keep working — move them to tab-open fetches, don't just delete:

| Consumer | Needs | Note |
|---|---|---|
| Results / analytics / my-bracket | per-**selected-entry** slice | already filtered: `matchScores.filter(entry_id === selected)` |
| `PointsBreakdownModal`, `results/MatchCard` | wide per-entry rows | **already done** — fetch `/api/pools/:id/entries/:entry_id/match-scores` |
| Member predictions ("see everyone's picks") | `allPredictions` | **⚠ must stay behind the server-side `computeReveal` gate in `page.tsx:178`** — it strips other members' unlocked picks *before* they reach the browser. Any lazy-load MUST re-apply it server-side, never client-side |
| `/live` delta merge | narrow scores | `mergeMatchScores` in `liveMerge.ts`, 19 tests |

## 6. Verification

- **Numbers unchanged:** pick a full_tournament pool, compare every leaderboard row's
  points/rank/hit-rate before and after. Any diff is a real bug, not a rounding artifact.
- **bracket_picker untouched:** open a bp pool (e.g. *Connor Wants A Baby Bracket*) and
  confirm the leaderboard still populates. If it's empty, the mode fork in §3 was missed.
- **Reveal gate intact:** as a non-admin in a pool with unlocked picks, confirm other
  members' pending predictions are absent from the network payload — not merely hidden.
- `npm run test` (176 passing), `npx tsc --noEmit`, and lint **at baseline** — this repo
  has pre-existing lint errors, so compare counts rather than expecting zero.

## 7. Already done — don't redo

| Commit | What |
|---|---|
| `79aaa25` | Removed the client-side match-points sum (proved dead: 673 entries with null `match_points`, none with any score row) |
| `05bc490` | Narrowed pool-wide `match_scores` to 8 columns + added the per-entry wide route. 12,683 → 7,721 kB |
| `05a7bab` | `/live` delta: refreshes send 33 kB, not the whole payload |
| `10a9c68` | `liveMerge` extracted + 19 unit tests |

Shipped to production and green. Local, unpushed: `79aaa25`, `05bc490`, `6eff4f8`,
`d829d5e`.

## 8. Related, deliberately not in scope

- **C1 — shadow drops manual `point_adjustment` on unscored entries.** One casualty today
  (`CEM`, 223 pts). **Must be fixed before widening the cutover past 83 pools**, or it
  becomes a pattern. See `drafts/2026-07-28_defects_found.md`.
- **Phase 3, the cutover itself:** 83 of 623 pools read shadow;
  `prod_scoring_enabled = true`. See `drafts/2026-07-28_shadow_cutover_plan.md`.

## 9. Lesson from the session that produced this

Two errors worth not repeating:

1. **I optimised the refresh path first.** The ask was reads on *pool open*. The refresh
   work is real (388×) but wasn't what was asked for.
2. **I then trimmed columns instead of rows.** 22→8 columns on an array of 13,385 rows
   that shouldn't be fetched at all — a 5 MB win where ~7.4 MB was available. **Ask
   whether the data is needed before making it smaller.**

And one that saved the work: when narrowing the payload, **change the TypeScript type in
the same commit as the query**. Narrowing a SELECT while leaving the wide type hands
consumers `undefined` silently — the exact shape of the RN home-screen bug found this
session, where four non-existent columns 400'd for months behind a discarded error.
