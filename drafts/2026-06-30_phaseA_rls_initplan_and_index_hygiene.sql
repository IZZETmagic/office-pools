-- ============================================================================
-- Phase A — DB hygiene for XL -> Medium compute downgrade
-- Date: 2026-06-30
-- Goal: cut per-row CPU on RLS-protected reads + remove redundant index writes.
-- Zero behavior change, invisible to users. Applied while still on XL.
--
-- STATUS: STEPS 1 & 2 APPLIED to prod (ujthamlehjyubbzxbnes) on 2026-06-30
--         via Supabase MCP apply_migration. This file is the audit trail +
--         stages the remaining (optional) items for review.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 1 — [APPLIED] auth_rls_initplan fix (55 policies)
-- Wrap auth.uid()/auth.role() in (select ...) so Postgres evaluates them once
-- per query (InitPlan) instead of once per row. Behavior-preserving; in-place
-- ALTER POLICY = no window where a policy is missing; atomic (single txn).
-- Ref: https://supabase.com/docs/guides/database/database-advisors?lint=0003_auth_rls_initplan
-- Verified after: 0 policies with a bare auth call, 55 now wrapped.
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname, tablename, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        (qual is not null and qual ~ 'auth\.(uid|role)\(\)' and qual !~ '\(\s*select\s+auth\.')
        or
        (with_check is not null and with_check ~ 'auth\.(uid|role)\(\)' and with_check !~ '\(\s*select\s+auth\.')
      )
  loop
    execute format(
      'ALTER POLICY %I ON public.%I%s%s',
      r.policyname, r.tablename,
      case when r.qual is not null
        then ' USING (' || replace(replace(r.qual,'auth.uid()','(select auth.uid())'),'auth.role()','(select auth.role())') || ')'
        else '' end,
      case when r.with_check is not null
        then ' WITH CHECK (' || replace(replace(r.with_check,'auth.uid()','(select auth.uid())'),'auth.role()','(select auth.role())') || ')'
        else '' end
    );
  end loop;
end $$;

-- Verification (expect policies_with_bare_auth = 0):
-- with x as (select coalesce(qual,'')||' '||coalesce(with_check,'') expr
--            from pg_policies where schemaname='public')
-- select count(*) filter (where
--   (select count(*) from regexp_matches(expr,'auth\.(uid|role)\(\)','gi'))
--   > (select count(*) from regexp_matches(expr,'select\s+auth\.(uid|role)\(\)','gi'))
-- ) as policies_with_bare_auth from x;


-- ----------------------------------------------------------------------------
-- STEP 2 — [APPLIED] drop 5 exact-duplicate indexes
-- Each pair is byte-identical; the kept index serves all the same lookups.
-- Removes redundant write/maintenance overhead. Tiny/cold tables -> instant.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_matches_tournament;               -- keep idx_matches_tournament_id
DROP INDEX IF EXISTS public.idx_pools_tournament;                 -- keep idx_pools_tournament_id
DROP INDEX IF EXISTS public.idx_teams_tournament_id;              -- keep idx_teams_tournament
DROP INDEX IF EXISTS public.idx_bp_knockout_picks_entry_id;       -- keep idx_bp_knockout_entry
DROP INDEX IF EXISTS public.idx_bp_third_place_rankings_entry_id; -- keep idx_bp_third_place_entry


-- ============================================================================
-- REMAINING / OPTIONAL — staged for review, NOT yet applied.
-- ============================================================================

-- STEP 3 (optional) — add missing FK indexes on prediction tables.
-- These tables are write-COLD during live matches (predictions lock at deadline),
-- so adding indexes adds no live-sweep write cost. Benefit is modest for our
-- specific hot queries (which key on entry_id, already indexed); mostly clears
-- advisor warnings + speeds cascade/by-team lookups. Run CONCURRENTLY (cannot be
-- inside a txn) via execute_sql, one statement at a time:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_predictions_pred_winner_team ON public.predictions(predicted_winner_team_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_group_pred_pos1_team ON public.group_predictions(position_1_team_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_group_pred_pos2_team ON public.group_predictions(position_2_team_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_group_pred_pos3_team ON public.group_predictions(position_3_team_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_group_pred_pos4_team ON public.group_predictions(position_4_team_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_special_pred_champion_team ON public.special_predictions(predicted_champion_team_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_special_pred_runnerup_team ON public.special_predictions(predicted_runner_up_team_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_special_pred_third_team ON public.special_predictions(predicted_third_place_team_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bp_group_rank_team ON public.bracket_picker_group_rankings(team_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bp_knockout_match ON public.bracket_picker_knockout_picks(match_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bp_knockout_winner_team ON public.bracket_picker_knockout_picks(winner_team_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bp_third_place_team ON public.bracket_picker_third_place_rankings(team_id);
-- NOTE: deliberately SKIP bonus_scores.related_match_id (write-HOT during the
--       live recalc sweep we are trying to lighten) and tiny tables (matches=104,
--       match_conduct=156, teams=48) where a seq scan is already free.

-- STEP 4 (optional) — drop UNUSED indexes. Lower value; some may serve upcoming
-- knockout stages (R16/QF/SF/final) whose query patterns have not run yet.
-- Clearly safe now (empty tables): player_scores has 0 rows.
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_player_scores_pool;
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_player_scores_points;
-- Hold the rest until after the tournament.

-- STEP 5 (separate, needs explicit review) — consolidate 61 multiple_permissive_policies.
-- Real second-order CPU win (fewer per-row policy evals) but changes the access
-- surface, so each merge must preserve exact semantics. Treat as its own task.
