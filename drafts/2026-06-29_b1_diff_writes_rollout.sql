-- =============================================================
-- B1 (change-only scoring writes) — rollout SQL  [DRAFT — NOT YET APPLIED]
-- =============================================================
-- Run these IN ORDER, in a calm window (no match kicking off within ~2h),
-- BEFORE flipping the flag on. Each is reversible. Nothing here changes
-- behaviour until scoring_diff_writes_enabled is set true.

-- -------------------------------------------------------------
-- STEP 1 — bonus_scores natural-key unique index (prerequisite)
-- -------------------------------------------------------------
-- The B1 diff path upserts bonus_scores on its natural key; this index is the
-- upsert arbiter AND defensively enforces the uniqueness the diff relies on.
-- NULLS NOT DISTINCT so rows with NULL related_match_id / related_group_letter
-- still collide on their key (PG15+; this project is PG17).
-- Verified 2026-06-29: 0 existing duplicates on this key (86,295 rows, 86,295 distinct).
-- CONCURRENTLY = no table lock; MUST run outside a transaction block (run alone).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS bonus_scores_natural_key_uniq
  ON public.bonus_scores (entry_id, bonus_type, related_group_letter, related_match_id)
  NULLS NOT DISTINCT;

-- Verify it built valid (not INVALID):
--   SELECT indexrelid::regclass, indisvalid FROM pg_index
--   WHERE indexrelid = 'public.bonus_scores_natural_key_uniq'::regclass;
-- Backout: DROP INDEX CONCURRENTLY IF EXISTS public.bonus_scores_natural_key_uniq;

-- -------------------------------------------------------------
-- STEP 2 — register the kill switch (default OFF)
-- -------------------------------------------------------------
-- The code treats an absent row as OFF, so this just makes the flag visible and
-- toggleable. setting_value is jsonb.
INSERT INTO public.sync_settings (setting_key, setting_value, updated_at)
VALUES ('scoring_diff_writes_enabled', 'false'::jsonb, now())
ON CONFLICT (setting_key) DO NOTHING;

-- -------------------------------------------------------------
-- STEP 3 — (canary) turn it ON, after Steps 1–2 and a parity check
-- -------------------------------------------------------------
-- UPDATE public.sync_settings SET setting_value = 'true'::jsonb, updated_at = now()
-- WHERE setting_key = 'scoring_diff_writes_enabled';
--
-- INSTANT REVERT (no deploy): set it back to 'false'::jsonb. Any in-flight diff
-- failure already auto-falls-back to the legacy path per-pool.
