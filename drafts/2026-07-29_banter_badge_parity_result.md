# Banter badge parity — RESULT: ❌ DO NOT FLIP (and the fix is now cheap)

_Run 2026-07-29. The question: can Banter's per-member badge list read
`entry_xp_state.earned_badge_ids` instead of deriving badges from every prediction
and score row in the pool?_

## Verdict

**No — reading the stored ids today would be wrong in BOTH directions.** But the
one thing that blocked the stored set from being complete is now available, so the
fix is small.

| | |
|---|---:|
| Members compared (4 pools) | 341 |
| Identical badge set | 75 |
| **Differing** | **266** |

Every difference is one of three named causes. There is no random drift.

## Cause 1 — `dark_horse` is missing from the stored set, for 266 of 341 members

`lib/push/badges.ts` says so in its own header: it is a *slim* re-implementation of
the badge rules that **skips `dark_horse`** because it "needs pool-wide crowd %".
It implements 11 of the 12 definitions.

So if Banter read `earned_badge_ids`, **266 members would lose the 🐴 Dark Horse
badge from beside their name.** That is the whole blocker, and it is not subtle:
it is 78% of members in the sample.

**This is now cheap to fix.** `dark_horse` = correctly predicted an outcome fewer
than 25% of the pool picked. Migration 039 already returns, per match, the
home/draw/away split for the submitted population — which is exactly the input
badges.ts lacked. One RPC call per pool inside `computePoolEntryAnalytics` closes
it, using the same counted aggregate the Form tab now reads.

## Cause 2 — `legend` stored for 9 members who do not currently derive it

`legend` = reach Level 10. Levels **ratchet** (migration 026): once shown, never
taken away. So a member who hit Level 10 keeps `legend` in the stored set even if a
live recompute now puts them lower.

**The stored value is the correct one here.** The live derivation is the one that
is wrong, because it re-derives from current XP and ignores the high-water mark.
This is the same class of bug as the levels I fixed earlier today, one layer down.

## Cause 3 — `top_dog` stored for 4 members who are not currently #1

`top_dog` = reach #1 on the leaderboard. It is **transient** by nature, and
`xpSystem.ts` already takes a position on it: the `displayedBadges` logic
deliberately EXCLUDES `top_dog` from the badges it re-surfaces from
`badge_unlocks`, on the grounds that it means "currently #1".

The stored snapshot does not apply that exclusion, so it keeps a `top_dog` a member
has since lost.

⚠️ **This needs a product ruling, not a code fix**, and the two answers give
different behaviour:
- *"Top Dog means you ARE #1"* → the live derivation is right; the stored set
  should drop it when the member is overtaken.
- *"Top Dog means you REACHED #1"* → the stored set is right, and it should be
  append-only like every other badge.

The keep-once principle behind `badge_unlocks` and the level ratchet points at the
second. The existing code comment points at the first. They contradict each other,
which is why this is a decision rather than a bug.

## What has to happen before the flip

1. **Add `dark_horse` to `badges.ts`**, using
   `pool_match_prediction_accuracy(pool_id, true)` for the crowd split.
2. **Rule on `top_dog`** (above). Whichever way, make the stored set and the
   display agree.
3. **Leave `legend` alone** — stored is correct; if anything the live path should
   floor against the ratchet the way the level display now does.
4. **Re-run this check.** It must come back with 0 differing members.
5. Only then point Banter's `memberLevels` at the stored row.

Until then Banter keeps deriving badges live, which means it keeps pulling the
pool-wide arrays — it is the last consumer that does so for an aggregate reason
rather than a per-member one.

## Method

For each member, the check takes the same "best entry" Banter picks, computes
`computeFullXPBreakdown(...).earnedBadges` exactly as `CommunityTab.tsx` does, and
compares the id set against `entry_xp_state.earned_badge_ids`. Pools sampled:
`b7ddbf9d` (192 entries), `4ed0d3b6` (77), `d166d281` (25), `fef5260a` (62).

Input size is asserted before comparing — a short read changes the crowd consensus
for every member at once and would look exactly like real drift. That failure mode
bit this session three times; see the note in `supabase_postgrest_row_cap`.
