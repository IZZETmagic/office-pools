-- Migration 054a (L4): the league guard on lite_recalc_entry.
--
-- Ships FIRST and ALONE, ahead of the rest of L4.
--
-- ============================================================
-- WHY THIS IS NET-NEW WORK AND NOT A VERIFICATION
-- ============================================================
-- The design records this guard as having shipped "once, at L0, migration 049,
-- never touched again", and L4's exit criteria merely VERIFY it. It never
-- shipped. Confirmed three ways on 2026-08-22:
--
--   1. pg_get_functiondef('lite_recalc_entry') returned the original
--      two-statement body: no IF, no EXISTS, no reference to `pools` at all.
--   2. The only migration naming lite_recalc_entry was 047, a
--      REVOKE/GRANT/COMMENT migration that does not replace the body.
--   3. The slots the design reserved were consumed by the L0 reverts:
--      048 = l0_revert_league_arms_from_shadow_functions,
--      049 = l0_revert_league_schema_from_matches (the matches.round_number
--      drop — the change that caused the outage).
--
-- Nobody noticed because L0's own verification inspected pg_get_functiondef of
-- OTHER functions. A guard believed shipped for two phases was never there.
--
-- ============================================================
-- WHAT THE HAZARD IS
-- ============================================================
-- lite_recalc_entry is SECURITY DEFINER and is called from the browser after
-- every admin point adjustment (app/pools/[pool_id]/admin/MembersTab.tsx:412
-- and mobile/components/pool-detail/AdjustPointsSheet.tsx:162).
--
-- On a league pool it does two wrong things. It OVERWRITES scored_total_points
-- with match_points + bonus_points + point_adjustment, all World Cup columns a
-- league never populates. And its tiebreakers 2 and 3 count rows in
-- `match_scores`, empty for a league pool, so every entry collapses to the
-- created_at tiebreak and the pool is re-ranked by signup order.
--
-- Containment does NOT come from RLS or from archived_at. The function is
-- SECURITY DEFINER owned by `postgres`, and postgres has rolbypassrls = true,
-- so RLS never applied; archived_at is an admin-flippable flag on a path that
-- ignores it. No guard in this phase may depend on either.
--
-- ============================================================
-- WHY THIS PREDICATE
-- ============================================================
-- Reads ONLY public.pools(pool_id, prediction_mode). Both columns exist today
-- (verified against information_schema immediately before applying), so this has
-- NO phase dependency: it does not wait on league_season_id, which arrives in
-- 054b. That is precisely why it can ship first and alone.
--
-- EXISTS, not a scalar subquery. The scalar form is three-valued: for an unknown
-- p_pool_id it yields NULL, PL/pgSQL treats NULL as false, and the World Cup arm
-- runs anyway. EXISTS is two-valued and fails closed.
--
-- public.-qualified because proconfig IS NULL on this function (no SET
-- search_path). The three pre-existing UNQUALIFIED references below are
-- deliberately left alone — qualifying them is a behaviour change, and belongs
-- with the in-body authorization work migration 047's header defers.
--
-- No PERFORM league_rescore_pool: that function is L7 and does not exist, and
-- both call sites already UPDATE point_adjustment before invoking this RPC.

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pools' AND column_name='prediction_mode'
  ) THEN
    RAISE EXCEPTION 'Migration 054a: pools.prediction_mode not found — the guard would bind at runtime and raise on first call.';
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.lite_recalc_entry(p_entry_id uuid, p_pool_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- L4 containment. This function's tiebreakers 2 and 3 read `match_scores`,
  -- which is empty for a league pool, so every league entry collapses to a
  -- created_at ordering; and it overwrites scored_total_points with
  -- 0 + 0 + adjustment. A league pool is scored by its own engine (L7).
  IF EXISTS (
    SELECT 1 FROM public.pools
    WHERE pool_id = p_pool_id
      AND prediction_mode = 'league_pickem'
  ) THEN
    RETURN;
  END IF;

  -- 1. Recompute scored_total_points for the single entry
  UPDATE pool_entries
  SET scored_total_points = COALESCE(match_points, 0)
                          + COALESCE(bonus_points, 0)
                          + COALESCE(point_adjustment, 0)
  WHERE entry_id = p_entry_id;

  -- 2. Re-rank all entries in the pool using v2 tiebreaker logic
  WITH ranked AS (
    SELECT pe.entry_id,
           ROW_NUMBER() OVER (
             ORDER BY COALESCE(pe.scored_total_points, 0) DESC,
                      (SELECT COUNT(*) FROM match_scores ms
                       WHERE ms.entry_id = pe.entry_id
                       AND ms.score_type = 'exact') DESC,
                      (SELECT COUNT(*) FROM match_scores ms
                       WHERE ms.entry_id = pe.entry_id
                       AND ms.score_type != 'miss') DESC,
                      COALESCE(pe.bonus_points, 0) DESC,
                      pe.created_at ASC
           ) as new_rank
    FROM pool_entries pe
    JOIN pool_members pm ON pe.member_id = pm.member_id
    WHERE pm.pool_id = p_pool_id
  )
  UPDATE pool_entries pe
  SET current_rank = r.new_rank,
      last_rank_update = NOW()
  FROM ranked r
  WHERE pe.entry_id = r.entry_id;
END;
$function$;

COMMENT ON FUNCTION public.lite_recalc_entry(uuid, uuid) IS
  'Recomputes scored_total_points and re-ranks one pool after an admin point adjustment. SECURITY DEFINER. Returns immediately for a league pool (prediction_mode = league_pickem) — its tiebreakers read match_scores, which a league never populates, and it would re-rank the pool by signup order. Keyed on prediction_mode, NOT league_season_id, so it has no phase dependency. EXECUTE revoked from PUBLIC and anon by migration 047. Guard added by 054a after it was found never to have shipped at L0. ⚠ STILL MISSING an in-body authorization check: any authenticated user can re-rank any World Cup pool by id.';

-- ============================================================
-- VERIFICATION — all performed against production, results recorded
-- ============================================================
-- CREATE OR REPLACE succeeding proves NOTHING (PL/pgSQL binds column references
-- at runtime). The function was EXECUTED against both a league entry and a World
-- Cup entry inside a rolled-back transaction:
--
--   LEAGUE     rank 7->7, total 4242->4242, last_rank_update unmoved
--              => UNTOUCHED (correct)
--   WORLD CUP  total 1750->1761 (a +11 adjustment applied), last_rank_update moved
--              => STILL RECALCULATES (correct — no regression)
--   UNKNOWN    an unrecognised pool_id ran without error and took the World Cup
--              arm => EXISTS is two-valued, as intended
--
-- Structural checks on pg_get_functiondef afterwards:
--   IF EXISTS blocks .......... 1
--   'prediction_mode' .......... 1
--   'league_season_id' ......... 0   (no phase dependency)
--   'league_rescore_pool' ...... 0
--   proacl ..................... postgres | authenticated | service_role (047 intact)
