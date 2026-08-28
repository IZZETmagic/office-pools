-- =============================================================
-- 102 — THE SCORING ENGINES ARE NOT PUBLIC
-- =============================================================
-- Noticed while wiring the table-prediction save to rescore, and it is wider
-- than the one function that prompted it: **not a single league engine carries
-- an EXECUTE grant.** PostgreSQL's default is EXECUTE TO PUBLIC, and almost all
-- of them are SECURITY DEFINER — so any authenticated user could call any of
-- them, for any pool, by id.
--
-- ## How bad is it, honestly
--
-- None of them can forge points. They recompute from stored predictions and
-- stored results, so calling one is at worst a no-op and at best a rescore that
-- would have happened anyway. Two are worth more than that:
--
--   · `league_snapshot_final_standings` FREEZES the season-end table, and the
--     comment on it reads "Once taken, never retaken". It guards on the season
--     being complete, so it cannot fire early — but a function that permanently
--     fixes what everybody is paid on should not be reachable by the people
--     being paid.
--   · `league_score_table`, `league_score_duels` and `league_lms_settle` each
--     walk a whole pool. Cheap once; not free in a loop.
--
-- So: avoidable surface rather than an open door. Closed anyway, because the
-- reason it was open is that nobody wrote the line, not that anybody decided it.
--
-- ## What stays reachable, and why
--
-- Two functions are called with the USER's client on purpose and must keep
-- `authenticated`:
--
--   · `league_table_breakdown` — SECURITY INVOKER by design. RLS on
--     `league_table_predictions` is what decides whose table you may read, and
--     migration 081 is explicit that DEFINER here "would hand any member every
--     rival's prediction while the window was still open".
--   · `league_open_matchweek` — already granted in 073; restated here so the
--     whole picture is in one file.
--
-- Everything else is called from a route or a cron with `createAdminClient()`,
-- verified call site by call site before writing this.
--
-- ⚠ Trigger functions keep working regardless: a trigger executes as the table
-- owner and does not consult EXECUTE on the function. Revoking from PUBLIC does
-- not disarm `league_settle_duels_on_snapshot` or its siblings.
-- =============================================================

DO $$
DECLARE
  fn text;
  -- Service-role only. Every one of these is invoked from a server route, the
  -- fixture sync, or a cron — never from a browser session.
  engines text[] := ARRAY[
    'public.league_score_table(uuid)',
    'public.league_after_standings_change(uuid)',
    'public.league_snapshot_final_standings(uuid)',
    'public.league_score_duels(uuid, integer)',
    'public.league_generate_duel_schedule(uuid)',
    'public.league_lms_open_round(uuid, integer)',
    'public.league_lms_settle(uuid, integer)',
    'public.league_finalize_ranks(uuid)',
    'public.league_claim_score_events(integer, interval)',
    -- Added after 106 shipped a tenth engine of the same kind. It is
    -- SECURITY INVOKER, so RLS already bounds what a signed-in caller could do
    -- with it — but "the engines are not public" should not have an exception
    -- whose safety rests on a second mechanism.
    'public.league_apply_rehome(uuid, jsonb, timestamptz)'
  ];
BEGIN
  FOREACH fn IN ARRAY engines LOOP
    -- Skipped rather than failed when a signature does not match what is live:
    -- this migration is a hardening pass, and it must not block on one name.
    -- What it skipped is raised as a NOTICE so it is not silent.
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE '102: no such function, skipped: %', fn;
    END;
  END LOOP;
END $$;

-- The two the product calls with the caller's own client.
REVOKE EXECUTE ON FUNCTION public.league_table_breakdown(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.league_table_breakdown(uuid) TO service_role, authenticated;

REVOKE EXECUTE ON FUNCTION public.league_open_matchweek(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.league_open_matchweek(uuid) TO service_role, authenticated;
