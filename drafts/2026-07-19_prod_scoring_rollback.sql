-- ============================================================================
-- ROLLBACK RUNBOOK — revert the shadow cutover (production scoring back ON)
-- Staged 2026-07-19. Both engines' data is intact — this is a toggle, not a
-- rebuild. Pick the scenario; run top-to-bottom.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- SCENARIO A — PRECAUTIONARY (shadow is fine, you just want prod back on).
--   Users stay on correct numbers throughout.
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Old engine back ON (instant; ~15s for the app to pick it up).
UPDATE sync_settings SET setting_value = 'true'::jsonb, updated_at = now()
WHERE setting_key = 'prod_scoring_enabled';

-- 2. (Leave reads on shadow for now — shadow is live + correct while prod
--    re-catches-up. Let a match event re-score prod, or force it via the admin
--    recalc. Then, once prod == shadow, run step 3.)

-- 3. Point reads back at prod (drop shadow reads). ONLY after prod is current.
--    Reversible; re-widen anytime.
UPDATE sync_settings SET setting_value = '[]'::jsonb, updated_at = now()
WHERE setting_key = 'shadow_read_enabled_pools';


-- ─────────────────────────────────────────────────────────────────────────
-- SCENARIO B — EMERGENCY (shadow is WRONG; get off it in seconds).
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Old engine back ON.
UPDATE sync_settings SET setting_value = 'true'::jsonb, updated_at = now()
WHERE setting_key = 'prod_scoring_enabled';

-- 2. Make the prod LEADERBOARD current instantly (copy shadow's live totals+ranks
--    into prod's columns). Touches only entries that have a shadow row
--    (bracket_picker never went off, so it is skipped and already current).
--    ⚠ Only run this if shadow is TRUSTED; in a "shadow is wrong" case, SKIP this
--    and instead force a full prod recalc (step 3-alt) to recompute from source.
UPDATE pool_entries pe
SET match_points = st.match_points, bonus_points = st.bonus_points,
    scored_total_points = st.total_points, current_rank = st.final_rank,
    last_rank_update = now()
FROM shadow_entry_totals st
WHERE st.entry_id = pe.entry_id
  AND (pe.scored_total_points IS DISTINCT FROM st.total_points
       OR pe.current_rank IS DISTINCT FROM st.final_rank);

-- 3. Point reads back at prod.
UPDATE sync_settings SET setting_value = '[]'::jsonb, updated_at = now()
WHERE setting_key = 'shadow_read_enabled_pools';

-- 3-alt. FULL prod refresh (recompute from source, not from shadow) — use when
--    shadow can't be trusted. Re-score every pool via the admin recalc:
--       POST https://sportpool.io/api/pools/<pool_id>/recalculate   (per pool), or
--    trigger the scoring sweep. NOTE the DB trigger (process_match_result) only
--    re-fires on a match UPDATE, so a match completed while prod was OFF will not
--    auto-rescore — use the recalc path above.


-- ─────────────────────────────────────────────────────────────────────────
-- PARTIAL revert (keep some pools on shadow): set the array to just those ids,
--   e.g.  '["<pool_id_1>","<pool_id_2>"]'.
-- Verify parity anytime:  npx tsx scripts/verify-read-source-parity.ts <pool_id>
-- ─────────────────────────────────────────────────────────────────────────
