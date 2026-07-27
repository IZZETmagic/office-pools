-- ============================================================================
-- 033 — Bump shadow_tournament_input_version when RESULTS or CONDUCT change
-- ============================================================================
-- DEPENDS ON: 029 (which created shadow_tournament_input_version, seeded at 0)
-- Plan: drafts/2026-07-27_bracket_picker_shadow_arm.md §3
--
-- WHY
-- ---
-- P2 (migration 030) can already detect "this entry was derived against an older
-- generation of tournament inputs" — `st.inputs_version < tv.version`. But
-- NOTHING BUMPS THAT VERSION, so the clause has never fired. Shadow's derived
-- data still goes stale whenever ACTUAL RESULTS or MATCH_CONDUCT change, which
-- is precisely what P2 was built to prevent.
--
-- It is harmless today (the tournament is over; standings are final) and unsafe
-- the moment a competition is live: group results would move while
-- shadow_actual_standings stayed frozen, so derived standings — and the
-- bracket_picker group points that will read them — would silently lag the real
-- table. This is the prerequisite for the bracket_picker shadow arm.
--
-- THREE DESIGN CONSTRAINTS, ALL LOAD-BEARING
-- ------------------------------------------
-- 1. STATEMENT-LEVEL, NOT ROW-LEVEL. A scoring sweep updates thousands of rows
--    in one statement. A row-level trigger would bump the version thousands of
--    times and re-derive the estate for each — recreating the fan-out problem
--    this programme keeps removing. `FOR EACH STATEMENT` + transition tables
--    bumps once per statement.
--
-- 2. IT MUST DIFF ACTUAL VALUES, NOT JUST FIRE ON UPDATE. `sync-fixtures` runs
--    EVERY MINUTE (cron jobid8) and rewrites match rows whether or not anything
--    changed. `UPDATE OF <cols>` is not enough: it fires when a column is
--    ASSIGNED, not when its value CHANGES. A trigger without the IS DISTINCT
--    FROM check below would bump every minute, forever, and re-derive all ~3,400
--    entries every minute. The diff is what makes this safe.
--
-- 3. match_conduct HAS NO tournament_id (a known defect —
--    supabase_postgrest_row_cap notes the same table is read unscoped). The
--    tournament must be resolved through matches.match_id.
--
-- COST NOTE, ACCEPTED
-- -------------------
-- Conduct changes (cards) DO legitimately change group tiebreaks, so a card can
-- change standings and must re-derive. During a live group stage that means a
-- card bumps the tournament and the reconciler re-derives affected entries at
-- 500/run. That is correct-but-heavy. It is a BACKGROUND reconciler, not the
-- live scoring path, so it costs throughput rather than latency. If it proves
-- noisy, the right narrowing is "only while the group stage is incomplete"
-- (conduct cannot change standings afterwards) — deliberately NOT done here,
-- because that assumes a group stage exists and this must hold for a league.
--
-- NOT COVERED: INSERT of new matches (importing a season's fixtures). At import
-- time no entries exist to re-derive, and the first materialize pass covers it.
--
-- Reversible: drop the three triggers and two functions.
-- Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- ============================================================================

-- 1. Results changing on `matches` -------------------------------------------
CREATE OR REPLACE FUNCTION public.shadow_bump_inputs_from_matches()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO shadow_tournament_input_version AS v (tournament_id, version, updated_at, reason)
  SELECT DISTINCT n.tournament_id, 1, now(), 'match result change'
  FROM new_matches n
  JOIN old_matches o ON o.match_id = n.match_id
  -- The diff that keeps a once-a-minute sync from re-deriving the estate.
  WHERE (n.home_score_ft, n.away_score_ft, n.home_score_pso, n.away_score_pso,
         n.winner_team_id, n.is_completed, n.status)
     IS DISTINCT FROM
        (o.home_score_ft, o.away_score_ft, o.home_score_pso, o.away_score_pso,
         o.winner_team_id, o.is_completed, o.status)
    AND n.tournament_id IS NOT NULL
  ON CONFLICT (tournament_id) DO UPDATE
    SET version    = v.version + 1,
        updated_at = now(),
        reason     = EXCLUDED.reason;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_shadow_bump_inputs_matches ON public.matches;
CREATE TRIGGER trg_shadow_bump_inputs_matches
AFTER UPDATE ON public.matches
REFERENCING NEW TABLE AS new_matches OLD TABLE AS old_matches
FOR EACH STATEMENT EXECUTE FUNCTION public.shadow_bump_inputs_from_matches();

-- 2. Conduct changing — INSERT or UPDATE (uses the NEW transition table) ------
-- No value diff here: any conduct row that appears or changes can move a group
-- tiebreak, and conduct writes are rare (unlike the per-minute match sync).
CREATE OR REPLACE FUNCTION public.shadow_bump_inputs_from_conduct_new()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO shadow_tournament_input_version AS v (tournament_id, version, updated_at, reason)
  SELECT DISTINCT m.tournament_id, 1, now(), 'match_conduct change'
  FROM new_conduct n
  JOIN matches m ON m.match_id = n.match_id      -- conduct has no tournament_id
  WHERE m.tournament_id IS NOT NULL
  ON CONFLICT (tournament_id) DO UPDATE
    SET version    = v.version + 1,
        updated_at = now(),
        reason     = EXCLUDED.reason;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_shadow_bump_inputs_conduct_ins ON public.match_conduct;
CREATE TRIGGER trg_shadow_bump_inputs_conduct_ins
AFTER INSERT ON public.match_conduct
REFERENCING NEW TABLE AS new_conduct
FOR EACH STATEMENT EXECUTE FUNCTION public.shadow_bump_inputs_from_conduct_new();

DROP TRIGGER IF EXISTS trg_shadow_bump_inputs_conduct_upd ON public.match_conduct;
CREATE TRIGGER trg_shadow_bump_inputs_conduct_upd
AFTER UPDATE ON public.match_conduct
REFERENCING NEW TABLE AS new_conduct
FOR EACH STATEMENT EXECUTE FUNCTION public.shadow_bump_inputs_from_conduct_new();

-- 3. Conduct DELETE (uses the OLD transition table) --------------------------
CREATE OR REPLACE FUNCTION public.shadow_bump_inputs_from_conduct_old()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO shadow_tournament_input_version AS v (tournament_id, version, updated_at, reason)
  SELECT DISTINCT m.tournament_id, 1, now(), 'match_conduct delete'
  FROM old_conduct o
  JOIN matches m ON m.match_id = o.match_id
  WHERE m.tournament_id IS NOT NULL
  ON CONFLICT (tournament_id) DO UPDATE
    SET version    = v.version + 1,
        updated_at = now(),
        reason     = EXCLUDED.reason;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_shadow_bump_inputs_conduct_del ON public.match_conduct;
CREATE TRIGGER trg_shadow_bump_inputs_conduct_del
AFTER DELETE ON public.match_conduct
REFERENCING OLD TABLE AS old_conduct
FOR EACH STATEMENT EXECUTE FUNCTION public.shadow_bump_inputs_from_conduct_old();

COMMENT ON FUNCTION public.shadow_bump_inputs_from_matches() IS
  'Statement-level: bumps shadow_tournament_input_version when match RESULTS '
  'actually change. The IS DISTINCT FROM diff is essential — sync-fixtures '
  'rewrites match rows every minute, and firing on assignment rather than change '
  'would re-derive every entry every minute. See migration 033.';
