-- ============================================================================
-- DRAFT MIGRATION — leaderboard precompute, phase 1 (schema only)
-- Status: DRAFT. DO NOT RUN during a live match window. Run in a post-match gap.
-- Author: drafted 2026-06-16 for review.
--
-- Purpose: extend entry_xp_state (the existing per-entry analytics snapshot)
-- to hold the analytics the leaderboard currently RE-COMPUTES on every read
-- (form, streak, hit rate, exact count, crowd stats). This is the "expand"
-- step of an expand/contract migration:
--   1. (this file) add nullable columns        -> invisible, nothing reads them
--   2. backfill via standalone script           -> invisible, nothing reads them
--   3. wire the sweep to keep them fresh         -> calm-window deploy
--   4. flip leaderboard read path to columns     -> calm-window deploy, gated on
--                                                   backfill-and-compare == 0 diffs
--
-- SAFETY: entry_xp_state is NOT on any hot read path today (the leaderboard
-- does not read it yet), so adding nullable columns has near-zero blast radius.
-- All columns are NULLable with no default => instant metadata-only change in
-- Postgres, no table rewrite, no lock of consequence.
--
-- REVERSIBILITY: nothing reads these columns until step 4, so this is fully
-- reversible by simply not proceeding. To hard-revert: ALTER TABLE ... DROP
-- COLUMN (each is independent).
-- ============================================================================

ALTER TABLE public.entry_xp_state
  ADD COLUMN IF NOT EXISTS last_five            text[],         -- form dots: 'exact'|'winner_gd'|'winner'|'miss'|'no_pick'
  ADD COLUMN IF NOT EXISTS current_streak       jsonb,          -- { type: 'hot'|'cold'|'none', length: int }
  ADD COLUMN IF NOT EXISTS hit_rate             numeric(5,2),   -- non-miss / completed * 100
  ADD COLUMN IF NOT EXISTS total_completed      integer,        -- scored matches for this entry
  ADD COLUMN IF NOT EXISTS exact_count          integer,
  ADD COLUMN IF NOT EXISTS contrarian_wins      integer,
  ADD COLUMN IF NOT EXISTS crowd_agreement_pct  numeric(5,2),
  ADD COLUMN IF NOT EXISTS analytics_updated_at timestamptz;    -- when the analytics fields above were last written

-- NOTE: level_name is intentionally NOT stored. Derive from current_level via
-- lib/levelNames.ts getLevelName() so the name has a single source of truth.

-- NOTE: total_xp and current_level already exist on entry_xp_state. The backfill
-- (step 2) will OVERWRITE them with leaderboard-accurate values (computeFullXP
-- Breakdown), which may differ slightly from the values written by the simpler
-- computeBadgeState in lib/push/badges.ts. This is intended and invisible —
-- nothing reads entry_xp_state on the leaderboard until step 4.
