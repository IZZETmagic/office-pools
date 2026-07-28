-- Migration: ratchet the displayed XP level so it can never go down.
--
-- WHY (2026-07-26 — drafts/2026-07-26_analytics_parity_result.md):
-- entry_xp_state.total_xp / .current_level had two writers computing different
-- quantities: lib/push/badges.ts wrote `Σ match_scores.total_points + badgeXP`
-- while lib/analytics/entryAnalytics.ts wrote computeFullXPBreakdown's XP
-- (BASE_XP[tier] × STAGE_MULTIPLIERS + crowd/streak bonus events + badge XP).
-- Both were measured against the same LEVELS thresholds, last-writer-wins.
--
-- Correcting that to a single definition moves 1,048 entries: 817 up, but
-- 231 DOWN — people who had already been shown "Level 9 Oracle" would silently
-- become "Level 8 Manager".
--
-- The product already takes a position on this for badges: badge_unlocks is
-- append-only precisely so "an earned badge never vanishes on recompute".
-- highest_level_reached applies the same keep-once rule to levels.
--
-- SEMANTICS (read carefully — current_level is NOT the raw level):
--   total_xp               stays HONEST — it reflects real XP and may fall.
--   current_level          the level to DISPLAY, i.e. already ratcheted.
--                          entryAnalytics.ts writes the floored value here, so
--                          the simple readers that select this column raw
--                          (app/pools/page.tsx, app/dashboard/page.tsx) get the
--                          floor for free and can never show a demotion.
--   highest_level_reached  the high-water mark that PRODUCES that floor. Equal
--                          to current_level by construction today; it exists
--                          separately because surfaces that recompute level
--                          LIVE (the analytics + leaderboard routes) never read
--                          current_level, and need a stored mark to floor
--                          against — that is the `everReachedLevel` parameter
--                          on computeFullXPBreakdown.
--
-- The raw, unfloored level is never stored. It is always recoverable as
-- computeLevel(total_xp), since total_xp stays honest.
--
-- Backfilled from current_level so nobody is demoted by this migration itself.

ALTER TABLE entry_xp_state
  ADD COLUMN IF NOT EXISTS highest_level_reached int;

UPDATE entry_xp_state
   SET highest_level_reached = GREATEST(COALESCE(highest_level_reached, 1), COALESCE(current_level, 1))
 WHERE highest_level_reached IS DISTINCT FROM
       GREATEST(COALESCE(highest_level_reached, 1), COALESCE(current_level, 1));

ALTER TABLE entry_xp_state
  ALTER COLUMN highest_level_reached SET DEFAULT 1;

UPDATE entry_xp_state SET highest_level_reached = 1 WHERE highest_level_reached IS NULL;

ALTER TABLE entry_xp_state
  ALTER COLUMN highest_level_reached SET NOT NULL;
