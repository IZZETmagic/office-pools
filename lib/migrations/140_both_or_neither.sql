-- =============================================================
-- 140 — BOTH OR NEITHER
-- =============================================================
-- ⚠ ADDITIVE ONLY. Three new functions. No table, column, index, policy or
-- existing function is touched, so there is no `md5(prosrc)` pre-check to run
-- before applying this.
--
-- ⚠⚠ APPLY THIS BEFORE DEPLOYING THE CODE THAT NAMES IT, and before running
-- either backfill script again. `syncLeagueFixtures` and both backfills call
-- these by name; a missing function is a PostgREST 404 on every write, which
-- for the sync means no timeline, no line-ups and no statistics at all. 136 and
-- 139 carry the same warning for the same reason; it is not boilerplate.
--
-- WHY THIS EXISTS
--   Three places replace a fixture's rows, and all three did it as two separate
--   PostgREST calls: DELETE the fixture's rows, then INSERT the new set. There
--   is no transaction around a pair of HTTP requests, so the window between
--   them is real, and on 2026-09-09 it opened. `backfill-match-lineups-stats`
--   reported:
--
--     1 failure(s):
--       1575143: lineup insert: TypeError: fetch failed
--
--   The DELETE had committed. The INSERT never reached the database. That
--   Bundesliga fixture was left with ZERO line-up rows — emptier than before
--   the run started — and the only thing between that and permanent loss was a
--   line at the end of a script's output and someone re-running it.
--
--   ⚠ THE SAME WINDOW IS OPEN IN THE LIVE SYNC, where nobody reads the output.
--   Steps 7b3, 7b4 and 7b5 have exactly this shape. A dropped socket mid-match
--   blanks a timeline until the next tick refetches — and on the COMPLETION
--   tick, which fires once, until somebody notices.
--
-- WHY A FUNCTION RATHER THAN AN UPSERT
--   An upsert would need no migration at all, and was the first thing tried.
--   PostgREST cannot use these tables' unique indexes as ON CONFLICT arbiters,
--   because every one of them is PARTIAL (`WHERE fixture_id IS NOT NULL`, the
--   other half of 136/139's match_id XOR) and PostgREST's `on_conflict` takes
--   column names with no way to state the index predicate. Measured against
--   production on 2026-09-09, on both tables:
--
--     there is no unique or exclusion constraint matching the ON CONFLICT
--     specification
--
--   So the choice was widening the indexes to suit the client, or putting the
--   two statements where they belong. A plpgsql function body runs in a single
--   transaction: the DELETE and the INSERT now commit together or not at all.
--
-- ⚠ NOT `SECURITY DEFINER`, DELIBERATELY. These run as the caller, and the only
--   caller is the service role, which bypasses RLS already. A definer function
--   would hand every signed-in user a write path into three deny-all tables and
--   quietly undo 136 and 139's RLS. EXECUTE is granted to service_role alone.
--
-- ⚠ `fixture_id` COMES FROM THE PARAMETER, NEVER FROM THE PAYLOAD. Each row is
--   re-stamped with the fixture whose rows were just deleted, so a caller
--   cannot delete fixture A's timeline and insert fixture B's. The `match_id`
--   arm is left NULL by omission, which is what the XOR wants.
--
-- ✅ APPLIED TO PRODUCTION 2026-09-09 (ujthamlehjyubbzxbnes), in two parts:
--    `both_or_neither`, then `both_or_neither_revoke_anon_authenticated` when
--    the VERIFY block found the REVOKE had not reached `anon`/`authenticated`.
--    The file above now carries the corrected form; a fresh apply is one step.
--
--    VERIFY run in full against production. All three functions INVOKER with
--    search_path pinned; EXECUTE false for public, anon and authenticated, true
--    for service_role. ⭐ THE ATOMICITY CHECK PASSED ON REAL DATA: a fixture
--    holding 14 events, handed a row with `side='neither'`, raised 23514 and
--    still held 14 afterwards — table total 2430 before and after. Empty `[]`
--    kept both line-up rows and both stat rows. A null fixture_id and a
--    non-array payload were both refused by name. A payload naming a DIFFERENT
--    fixture was written to the parameter's fixture and left the other alone.
--    Nothing moved: 2430 match_events, 292 match_lineups, 292 match_team_stats,
--    unchanged either side.
-- =============================================================

BEGIN;

-- ------------------------------------------------------------------ events
CREATE OR REPLACE FUNCTION replace_match_events(p_fixture_id uuid, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_written integer;
BEGIN
  IF p_fixture_id IS NULL THEN
    RAISE EXCEPTION 'replace_match_events: p_fixture_id is required';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'replace_match_events: p_rows must be a json array, got %',
      coalesce(jsonb_typeof(p_rows), 'null');
  END IF;

  DELETE FROM match_events WHERE fixture_id = p_fixture_id;

  -- ⚠ COLUMNS LISTED EXPLICITLY so `event_id` and `created_at` take their
  -- defaults. `jsonb_populate_recordset` fills a missing key with NULL rather
  -- than with the column default, so `SELECT *` here would insert a NULL
  -- primary key and fail every time.
  INSERT INTO match_events
    (fixture_id, side, kind, player_name, related_name, minute, extra_minute, sort_index)
  SELECT p_fixture_id, r.side, r.kind, r.player_name, r.related_name,
         r.minute, r.extra_minute, r.sort_index
    FROM jsonb_populate_recordset(NULL::match_events, p_rows) AS r;

  GET DIAGNOSTICS v_written = ROW_COUNT;
  RETURN v_written;
END
$$;

-- ----------------------------------------------------------------- line-ups
CREATE OR REPLACE FUNCTION replace_match_lineups(p_fixture_id uuid, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_written integer;
BEGIN
  IF p_fixture_id IS NULL THEN
    RAISE EXCEPTION 'replace_match_lineups: p_fixture_id is required';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'replace_match_lineups: p_rows must be a json array, got %',
      coalesce(jsonb_typeof(p_rows), 'null');
  END IF;

  -- ⚠ AN EMPTY SET DELETES NOTHING, and this is the one place the rule has to
  -- live in the database rather than in three callers. `[]` is the ordinary
  -- answer before the feed publishes an XI; clearing a stored line-up because
  -- the provider went quiet for a tick is exactly the loss this migration is
  -- about. The timeline is different — see `replace_match_events`, where an
  -- empty set is a real instruction because VAR removes events.
  IF jsonb_array_length(p_rows) = 0 THEN
    RETURN 0;
  END IF;

  DELETE FROM match_lineups WHERE fixture_id = p_fixture_id;

  INSERT INTO match_lineups (fixture_id, side, formation, coach_name, players)
  SELECT p_fixture_id, r.side, r.formation, r.coach_name, r.players
    FROM jsonb_populate_recordset(NULL::match_lineups, p_rows) AS r;

  GET DIAGNOSTICS v_written = ROW_COUNT;
  RETURN v_written;
END
$$;

-- --------------------------------------------------------------- statistics
CREATE OR REPLACE FUNCTION replace_match_team_stats(p_fixture_id uuid, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_written integer;
BEGIN
  IF p_fixture_id IS NULL THEN
    RAISE EXCEPTION 'replace_match_team_stats: p_fixture_id is required';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'replace_match_team_stats: p_rows must be a json array, got %',
      coalesce(jsonb_typeof(p_rows), 'null');
  END IF;

  -- Same rule as line-ups, same reason: a stat never vanishes as a correction,
  -- it goes to zero, and zero is sent as a value.
  IF jsonb_array_length(p_rows) = 0 THEN
    RETURN 0;
  END IF;

  DELETE FROM match_team_stats WHERE fixture_id = p_fixture_id;

  INSERT INTO match_team_stats
    (fixture_id, side, possession_pct, shots_total, shots_on, shots_off,
     shots_blocked, shots_inside_box, shots_outside_box, fouls, free_kicks,
     corners, offsides, yellow_cards, red_cards, saves, passes_total,
     passes_accurate, passes_pct, expected_goals, goals_prevented)
  SELECT p_fixture_id, r.side, r.possession_pct, r.shots_total, r.shots_on,
         r.shots_off, r.shots_blocked, r.shots_inside_box, r.shots_outside_box,
         r.fouls, r.free_kicks, r.corners, r.offsides, r.yellow_cards,
         r.red_cards, r.saves, r.passes_total, r.passes_accurate, r.passes_pct,
         r.expected_goals, r.goals_prevented
    FROM jsonb_populate_recordset(NULL::match_team_stats, p_rows) AS r;

  GET DIAGNOSTICS v_written = ROW_COUNT;
  RETURN v_written;
END
$$;

-- ⚠ THE GRANTS ARE PART OF THE FIX, NOT HOUSEKEEPING. A new function is
-- EXECUTE-able by PUBLIC by default. These three write to tables whose RLS
-- allows SELECT and nothing else, so an `authenticated` caller would be
-- refused by RLS anyway — but relying on that is relying on a second mechanism
-- to cover the first. Only the service role has any business calling these.
--
-- ⚠⚠ AND `FROM PUBLIC` IS NOT ENOUGH ON SUPABASE — this was wrong when first
-- applied, and the VERIFY block below caught it within the minute. `anon` and
-- `authenticated` hold EXECUTE through ALTER DEFAULT PRIVILEGES on the public
-- schema, which is a DIRECT grant rather than membership in PUBLIC, so
-- revoking from PUBLIC left both of them exactly as they were:
--   public_can_execute false, anon true, authenticated true.
-- Both roles have to be named.
REVOKE ALL ON FUNCTION replace_match_events(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION replace_match_lineups(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION replace_match_team_stats(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION replace_match_events(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION replace_match_lineups(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION replace_match_team_stats(uuid, jsonb) TO service_role;

COMMIT;

-- =============================================================
-- VERIFY — run after applying, on a branch first.
-- =============================================================
--
-- 1. All three exist, are INVOKER, and have their search_path pinned.
--    expect: 3 rows, prosecdef = false, proconfig = {search_path=public,pg_temp}
--
-- SELECT proname, prosecdef, proconfig FROM pg_proc
--  WHERE proname IN ('replace_match_events','replace_match_lineups',
--                    'replace_match_team_stats') ORDER BY 1;
--
-- 2. PUBLIC cannot execute them; service_role can.
--    expect: false, false, false / true, true, true
--
-- SELECT has_function_privilege('public', p.oid, 'EXECUTE'),
--        has_function_privilege('service_role', p.oid, 'EXECUTE'), p.proname
--   FROM pg_proc p
--  WHERE p.proname LIKE 'replace_match_%' ORDER BY p.proname;
--
-- 3. ⚠ IT IS ATOMIC. The whole point. A row that violates a constraint must
--    take the DELETE down with it and leave the stored set exactly as it was.
--    expect: the count before and the count after are IDENTICAL, and the
--            statement raised 23514 (a side of 'neither' fails the CHECK).
--
-- SELECT count(*) FROM match_events
--  WHERE fixture_id = (SELECT fixture_id FROM match_events LIMIT 1);
-- SELECT replace_match_events(
--          (SELECT fixture_id FROM match_events LIMIT 1),
--          '[{"side":"neither","kind":"goal","sort_index":0,"minute":1}]'::jsonb);
-- SELECT count(*) FROM match_events
--  WHERE fixture_id = (SELECT fixture_id FROM match_events LIMIT 1);
--
-- 4. A real replace round-trips to the same count it was given.
--    expect: 2, and match_team_stats unchanged in total.
--
-- BEGIN;
-- SELECT replace_match_team_stats(
--          (SELECT fixture_id FROM match_team_stats LIMIT 1),
--          (SELECT jsonb_agg(to_jsonb(t) - 'stat_id' - 'created_at')
--             FROM match_team_stats t
--            WHERE t.fixture_id = (SELECT fixture_id FROM match_team_stats LIMIT 1)));
-- SELECT count(*) FROM match_team_stats;
-- ROLLBACK;
--
-- 5. An empty array leaves line-ups and statistics ALONE, and clears events.
--    expect: 2, 2, then 0 — and the line-up count unchanged throughout.
--
-- BEGIN;
-- SELECT replace_match_lineups((SELECT fixture_id FROM match_lineups LIMIT 1), '[]'::jsonb);
-- SELECT count(*) FROM match_lineups
--  WHERE fixture_id = (SELECT fixture_id FROM match_lineups LIMIT 1);
-- ROLLBACK;
--
-- 6. The guards bite. expect: an exception each time.
--
-- SELECT replace_match_events(NULL, '[]'::jsonb);                  -- required
-- SELECT replace_match_events(gen_random_uuid(), '{"a":1}'::jsonb); -- not an array
--
-- 7. ⚠ A PAYLOAD CANNOT SMUGGLE IN ANOTHER FIXTURE. `fixture_id` in the JSON is
--    ignored in favour of the parameter. expect: 1 row, on p_fixture_id, and
--    NOTHING written against the fixture named in the payload.
--
-- BEGIN;
-- SELECT replace_match_events(
--          (SELECT fixture_id FROM league_fixtures LIMIT 1),
--          jsonb_build_array(jsonb_build_object(
--            'fixture_id', (SELECT fixture_id FROM league_fixtures OFFSET 1 LIMIT 1),
--            'side','home','kind','goal','minute',1,'sort_index',0)));
-- ROLLBACK;
