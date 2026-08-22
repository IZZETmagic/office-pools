-- Migration 052: finish what 049 started, now that the code fix is deployed.
--
-- 051 restored matches.round_number as a hotfix because the DEPLOYED tree still
-- selected it and PostgREST answered 42703, silently rendering zero fixtures on
-- every pool page. Commit 4631b9b removed the column from all five read sites
-- and went live on 2026-08-22 (GitHub Production deployment for 4631b9b;
-- Vercel status "Deployment has completed"). The prop is no longer needed, so
-- the World Cup schema goes back to having no league-shaped hole.
--
-- Ordering note: this direction is the safe one. Selecting FEWER columns than
-- exist always works, so the code deploy could land at any time; only the DROP
-- had to wait for it. The reverse — dropping first — is what caused the outage.
--
-- ============================================================
-- ALSO: two orphaned helpers from the pre-pivot league work
-- ============================================================
-- Migration 048 reverted the league arms out of the shared shadow scoring
-- functions by inlining the predicates back. It left the helpers behind:
--
--   stage_has_scheduled_teams(p_stage text) -> p_stage IN ('group','regular_season')
--   mode_submits_per_round(p_mode text)     -> p_mode  IN ('progressive','league_pickem')
--
-- Both are LANGUAGE sql IMMUTABLE over a text argument, reference no columns,
-- and were verified on 2026-08-22 to have ZERO callers among all public
-- functions. They cannot break anything — but they advertise 'regular_season'
-- and 'league_pickem' as live World Cup concepts to the next reader, which is
-- exactly the confusion the L0 revert existed to remove.
--
-- Both drops are GUARDED rather than blind: if something has started calling
-- them, or any function still names round_number, this refuses instead of
-- breaking it. That is the guard rule from 049's header applied to the thing
-- that actually reads the column — which is the step that was missed.

DO $guard$
DECLARE
  v_callers int;
BEGIN
  SELECT count(*) INTO v_callers
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND p.proname NOT IN ('stage_has_scheduled_teams', 'mode_submits_per_round')
    AND (pg_get_functiondef(p.oid) ~* '\mstage_has_scheduled_teams\M'
      OR pg_get_functiondef(p.oid) ~* '\mmode_submits_per_round\M');

  IF v_callers > 0 THEN
    RAISE EXCEPTION
      'Migration 052: % function(s) still call stage_has_scheduled_teams or mode_submits_per_round — not dropping them.',
      v_callers;
  END IF;
END $guard$;

DO $guard2$
DECLARE
  v_fns text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_fns
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ~* '\mround_number\M';

  IF v_fns IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 052: function(s) still reference round_number: %', v_fns;
  END IF;
END $guard2$;

ALTER TABLE public.matches DROP COLUMN IF EXISTS round_number;

DROP FUNCTION IF EXISTS public.stage_has_scheduled_teams(text);
DROP FUNCTION IF EXISTS public.mode_submits_per_round(text);

-- ============================================================
-- Verification — all confirmed against production after applying
-- ============================================================
--   round_number / round_label on matches ......... gone
--   orphan league helper functions ................ gone
--   any function still naming round_number ........ none
--   matches_stage_check ........................... the 7 World Cup stages only
--   distinct stages present in matches ............ exactly those 7
--   deployed MATCH_COLUMNS projection ............. 104 rows, no error
--   https://sportpool.io/ ......................... 200
--
-- The standing guard is `npx tsx scripts/verify-select-columns.ts`, which
-- checks every .select()/.eq()/.in()/.order() column in the tree against what
-- PostgREST will actually accept. Run it before any future DROP COLUMN.
