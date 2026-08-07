-- 043 — drop the v1 scoring layer.
--
-- These functions predate the v2 engine and have been failing at runtime ever
-- since. They insert and read match_scores columns the table has never had:
--
--     prediction_id, points_earned, points_from_ft, points_from_pso,
--     is_exact_score, is_correct_difference, is_correct_result,
--     recalculated_count
--
-- match_scores was created fresh with its current shape by the v2 engine on
-- 2026-03-27 (lib/scoring/migration_match_scores.sql). plpgsql does not validate
-- a function body at CREATE time, so all of this kept compiling and kept failing
-- the moment it was called.
--
-- calculate_match_points is doubly obsolete: it branches on the knockout_*
-- columns that migration 042 retired, and it has no 'round_32' case at all — it
-- predates the 48-team format, so a Round of 32 match fell through to ELSE 1.0.
--
-- What is dropped, and why each is safe:
--
--   recalculate_all_pool_points   Last live entry point into this layer. Its one
--                                 caller (the Scoring Config save button) was
--                                 moved to POST /api/pools/:id/recalculate.
--   process_match_result          Only ever reached through trg_calculate_points,
--                                 which is DISABLED.
--   calculate_match_points        Only called by the two above.
--   recalculate_pool_leaderboard  Only called by the two above. Reads
--                                 ms.points_earned / ms.is_exact_score, and
--                                 writes player_scores and pool_entries.total_points
--                                 — all v1 storage the leaderboard stopped
--                                 reading (total_points is fixed at 0; the
--                                 canonical column is scored_total_points).
--   trigger_calculate_points      Trigger function for trg_calculate_points.
--   trg_calculate_points          The trigger itself, on matches. Already
--                                 DISABLED — the shadow cutover turned it off.
--
-- Live scoring is unaffected. It runs through lib/scoring (recalculatePool, via
-- the sync-fixtures cron) and the shadow engine, whose own trigger
-- trg_shadow_bump_inputs_matches stays enabled and is not touched here.
--
-- Verified before writing this: zero callers in the web app, the mobile app,
-- scripts, or any deployed edge function; and the ONLY database object depending
-- on any of the six is trg_calculate_points itself.
--
-- APPLIED to production 2026-08-06. Post-migration verification:
--   of the six, only reset_match_scores survives, and it no longer names
--   recalculate_all_pool_points; dropped_function_defs_043 holds 6 rows, all
--   with a definition; matches is left with on_match_completed [DISABLED],
--   trg_shadow_bump_inputs_matches [enabled] and update_matches_updated_at
--   [enabled] — the shadow engine's trigger untouched.
--
-- The pg_depend check above only covers hard dependencies, which for plpgsql
-- means triggers and nothing else — a function that merely CALLS another is not
-- recorded there. Sweeping the bodies afterwards found one caller this missed,
-- enter_match_result; see 043b. A body sweep, not pg_depend, is the check that
-- matters when dropping plpgsql functions.
--
-- Left in place deliberately: compare_match_scores_v1_v2(). It is equally dead —
-- it reads match_scores.points_earned and joins match_scores_v2, and NEITHER
-- exists — but unlike the above it still has a caller,
-- app/api/admin/scoring-v2/route.ts:145. That call discards its error
-- (`const { data } = await adminClient.rpc(...)`), so the route's comparison
-- report has been silently empty rather than failing. Fix the route and the
-- function together; dropping the function alone changes nothing.

-- No explicit begin/commit: the migration runner wraps this file in a single
-- transaction, so the backup below and the drops at the bottom are atomic
-- together. Running it by hand through psql should be wrapped the same way.

-- The definitions exist nowhere in the repo — they were created straight against
-- the database — so dropping them would destroy the only copy. Snapshot first,
-- exactly as 042 did with pool_settings. This runs BEFORE any drop, in the same
-- transaction, so either everything is backed up and dropped or nothing is.
create table if not exists dropped_function_defs_043 as
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_functiondef(p.oid)                 as definition,
       now()                                     as backed_up_at
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('recalculate_all_pool_points', 'process_match_result',
                    'calculate_match_points', 'recalculate_pool_leaderboard',
                    'trigger_calculate_points', 'reset_match_scores');

-- reset_match_scores is NOT part of this layer and is not dropped. It is a
-- super-admin utility — audit-log the reset, clear match_conduct, null the
-- scores — and it is the only match-reset mechanism that exists; nothing in
-- TypeScript replaces it. Only its final statement belonged to v1, and it is
-- removed here because it would otherwise point at a dropped function.
--
-- It had zero callers and was already broken end-to-end: the fossil call raised,
-- which aborted the whole function, so a reset rolled back and did nothing. It
-- now performs the reset and stops. Recalculation afterwards is a separate,
-- deliberate step — POST /api/pools/:id/recalculate, or
-- scripts/recalculate-all-pools.ts for a tournament-wide reset.
create or replace function public.reset_match_scores(match_id_param uuid, reset_reason text)
returns void
language plpgsql
security definer
as $function$
DECLARE
  match_record RECORD;
  user_record RECORD;
BEGIN
  SELECT user_id INTO user_record FROM users WHERE auth_user_id = auth.uid() AND is_super_admin = TRUE;
  IF user_record.user_id IS NULL THEN RAISE EXCEPTION 'Only super admins can reset matches'; END IF;

  SELECT * INTO match_record FROM matches WHERE match_id = match_id_param;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  INSERT INTO match_reset_log (
    match_id, reset_by_user_id, previous_home_score, previous_away_score,
    previous_home_pso, previous_away_pso, previous_status, action_type, reason
  ) VALUES (
    match_id_param, user_record.user_id, match_record.home_score_ft, match_record.away_score_ft,
    match_record.home_score_pso, match_record.away_score_pso, match_record.status, 'reset', reset_reason
  );

  DELETE FROM match_conduct WHERE match_id = match_id_param;

  UPDATE matches
  SET home_score_ft = NULL, away_score_ft = NULL, home_score_pso = NULL, away_score_pso = NULL,
      winner_team_id = NULL, status = 'scheduled', is_completed = FALSE, completed_at = NULL
  WHERE match_id = match_id_param;
END;
$function$;

-- The trigger first, then the function it points at. No CASCADE anywhere below:
-- if some dependency was missed, this must fail loudly rather than quietly take
-- something else with it.
drop trigger  if exists trg_calculate_points on matches;
drop function if exists public.trigger_calculate_points();

drop function if exists public.recalculate_all_pool_points(uuid);
drop function if exists public.process_match_result(uuid, integer, integer, integer, integer);
drop function if exists public.calculate_match_points(uuid, integer, integer, integer, integer);
drop function if exists public.recalculate_pool_leaderboard(uuid);

-- Rollback
-- --------
-- Every dropped definition is stored verbatim in dropped_function_defs_043.
-- To restore one, print it and run what it prints:
--
--   select definition from dropped_function_defs_043 where proname = 'process_match_result';
--
-- To restore all six at once:
--
--   do $$
--   declare d text;
--   begin
--     for d in select definition from dropped_function_defs_043 loop
--       execute d;
--     end loop;
--   end $$;
--
-- The trigger is not in that table — recreate it disabled, as it was:
--
--   create trigger trg_calculate_points after update on matches
--     for each row execute function trigger_calculate_points();
--   alter table matches disable trigger trg_calculate_points;
--
-- Drop dropped_function_defs_043 once this has sat in production long enough
-- that restoring a v1 scoring function is no longer imaginable.
