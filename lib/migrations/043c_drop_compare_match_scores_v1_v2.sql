-- 043c — drop compare_match_scores_v1_v2, the last of the v1 scoring layer.
--
-- 043 deliberately left this one alone because, unlike the rest, it still had a
-- caller: app/api/admin/scoring-v2/route.ts. That caller is now gone, so this
-- finishes the job.
--
-- It was as dead as the others, just less obviously. It read
-- match_scores.points_earned and joined match_scores_v2 — neither the column nor
-- the table exists — so it could never return a row. The reason nobody noticed
-- is the call site:
--
--     try {
--       const { data } = await adminClient.rpc('compare_match_scores_v1_v2')
--       matchComparison = data
--     } catch { /* RPC may not exist yet — that's OK */ }
--
-- supabase-js returns errors in the result rather than throwing, so the catch
-- never fired and `data` was simply null. The endpoint reported
-- match_level_comparison: null and looked healthy.
--
-- The rest of that endpoint's comparison was no better: it diffed
-- pool_entries.total_points against scored_total_points, and total_points is
-- dead v1 storage sitting at 0 for all 4,979 entries — so it flagged every
-- scored entry in the product, 4,234 of them, as a discrepancy against zero.
-- Removed with the GET handler.
--
-- APPLIED to production 2026-08-06.

insert into dropped_function_defs_043 (proname, args, definition, backed_up_at)
select p.proname,
       pg_get_function_identity_arguments(p.oid),
       pg_get_functiondef(p.oid),
       now()
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'compare_match_scores_v1_v2';

drop function if exists public.compare_match_scores_v1_v2();

-- Rollback
-- --------
--   select definition from dropped_function_defs_043 where proname = 'compare_match_scores_v1_v2';
-- …then run what it prints. It will still return nothing: match_scores_v2 and
-- match_scores.points_earned are both long gone.
