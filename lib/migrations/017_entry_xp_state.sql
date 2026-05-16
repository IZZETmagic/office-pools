-- Migration: Per-entry snapshot of XP / level / earned badges so the push
-- dispatcher can diff against the previous state and fire pushes only for
-- *newly* earned badges and *newly crossed* level thresholds.
--
-- Without this snapshot, every recalc would re-evaluate the full badge set
-- and have no way to tell which badges just landed. With it, the diff is a
-- simple set-subtraction.
--
-- `seeded` is the "first-run" guard: the very first time we compute state
-- for an entry, we save the snapshot but do NOT push for any of the badges
-- found — otherwise users would get spammed with every badge they've
-- already earned the moment we deploy. After the first save, `seeded` =
-- true and subsequent diffs fire pushes normally.
--
-- Applied via Supabase MCP on 2026-05-16.

CREATE TABLE IF NOT EXISTS entry_xp_state (
  entry_id          uuid PRIMARY KEY REFERENCES pool_entries(entry_id) ON DELETE CASCADE,
  total_xp          int  NOT NULL DEFAULT 0,
  current_level     int  NOT NULL DEFAULT 1,
  earned_badge_ids  text[] NOT NULL DEFAULT ARRAY[]::text[],
  seeded            boolean NOT NULL DEFAULT false,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entry_xp_state_level ON entry_xp_state(current_level);
