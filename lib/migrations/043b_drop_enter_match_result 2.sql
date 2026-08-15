-- 043b — the one 043 missed.
--
-- enter_match_result is a thin wrapper whose entire body is a call to
-- process_match_result; it has no other work of its own. Dropping
-- process_match_result in 043 therefore left it dangling.
--
-- It was missed because the pre-flight dependency check used pg_depend, which
-- only records HARD dependencies — for plpgsql that means triggers, not calls.
-- One function calling another is invisible to it. The check that catches this
-- is a sweep of pg_get_functiondef() across the whole schema, which is what
-- found it immediately after 043 was applied.
--
-- Zero callers in the web app, the mobile app, scripts or any deployed edge
-- function. The only mention anywhere in the repo is a comment in
-- lib/advancement.ts:83 describing where winner_team_id used to come from.
--
-- APPLIED to production 2026-08-06, immediately after 043. Verified afterwards:
-- no surviving public function names any dropped object.

insert into dropped_function_defs_043 (proname, args, definition, backed_up_at)
select p.proname,
       pg_get_function_identity_arguments(p.oid),
       pg_get_functiondef(p.oid),
       now()
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'enter_match_result';

drop function if exists public.enter_match_result(uuid, integer, integer, integer, integer);

-- Rollback
-- --------
--   select definition from dropped_function_defs_043 where proname = 'enter_match_result';
-- …then run what it prints. Note it will not work until process_match_result is
-- restored from the same table first.
