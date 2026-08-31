-- =============================================================
-- 126 — THE ENGINE DOES NOT WAIT FOR A DEPLOY
-- =============================================================
-- ⚠ ADDITIVE ONLY. One new function, one new trigger.
-- =============================================================
--
-- Ryan, 2026-08-31, watching Arsenal lead 1-0 at Villa Park on 88 minutes with
-- his own pick on the away win: *"it should've changed blue once Arsenal took
-- the lead."*
--
-- It did not, and the front end was right not to. The duel chip is a function
-- of `league_match_scores`, and that fixture had **nine predictions and zero
-- score rows** while it was being played.
--
-- ## Why there were no rows
--
-- Migration 063 opened the engine's gate so a LIVE fixture scores, not only a
-- finished one — and the engine honours it. Called by hand against that exact
-- fixture mid-match it returned:
--
--     {"ok": true, "scored": 22, "entries": 22, "result": "0-0"}
--
-- The engine was willing. **Nothing asked it.** The only caller is the sync's
-- TypeScript, and the deployed production build still carries
--
--     if (!c.is_completed) continue        // master, syncLeagueFixtures.ts
--
-- which skips every unfinished fixture. The line was changed on the Development
-- branch many commits ago and production has not shipped it.
--
-- ## Why this is a trigger and not a deploy
--
-- Shipping master fixes tonight. It does not fix the SHAPE, which is that a
-- database-side scoring engine only runs when a particular JavaScript build in
-- a particular hosting account decides to call it. The scoring architecture
-- rule settled on 2026-07-29 says the backend computes and stores once. Ryan
-- restated it this morning in stronger terms:
--
--     "the points and rankings and all of that should be calculated on the
--      scoring engine, through Supabase... Nothing is sent or pulled to Vercel
--      to calculate and send back."
--
-- So the rule moves to where the data is. A fixture's score changing is what
-- makes it need scoring; that fact is known in the database, at the moment it
-- becomes true, and needs nobody's permission to act on it.
--
-- The sync's own call stays where it is. `league_score_fixture` is idempotent
-- and recomputes totals rather than incrementing them, so being invoked twice
-- for one goal costs one wasted pass and changes nothing. Belt and braces is
-- the right trade for the surface that pays out points.
--
-- ## ⚠ WHAT FIRES IT — the score, not the clock
--
-- `league_apply_fixture_sync` writes `live_minute` every tick of a live match.
-- Scoring on that would re-score twenty-two entries once a minute per fixture
-- to produce an identical answer. This compares OLD to NEW and fires only when
-- the GOALS, the STATUS or the COMPLETION moved — so a match that stays 1-0
-- from the 20th minute to the whistle is scored twice, not seventy times.
--
-- ⚠ Both transition tables, and no column list: Postgres refuses to combine the
-- two (0A000), the same constraint migration 125 ran into.
--
-- ## ⚠ A SCORING FAILURE MUST NOT LOSE THE FIXTURE
--
-- The TypeScript caller is explicit that scoring errors never abort the sync —
-- "the fixture data is already written and correct, and league_score_fixture is
-- idempotent, so the next tick that sees a change will score it". A trigger
-- that raised would do the opposite: roll back the score the feed just reported
-- and lose it. Hence the EXCEPTION block. It warns and carries on.
--
-- ## No recursion
--
-- `league_score_fixture` writes `league_match_scores`, `league_entry_totals` and
-- `league_fixture_state`. It does not write `league_fixtures`, verified against
-- `prosrc` before this was written, so it cannot re-enter this trigger.
--
-- ## GUARD RULE — columns dereferenced here, verified live 2026-08-31
--   league_fixtures: fixture_id, home_goals, away_goals, is_completed, status
--   sync_settings:   setting_key, setting_value (jsonb)
-- =============================================================

CREATE OR REPLACE FUNCTION public.score_league_fixture_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  f record;
BEGIN
  IF COALESCE(
       (SELECT setting_value FROM sync_settings
         WHERE setting_key = 'league_db_scoring_enabled'),
       to_jsonb(true)) = to_jsonb(false)
  THEN
    RETURN NULL;
  END IF;

  FOR f IN
    SELECT n.fixture_id
      FROM new_rows n
      JOIN old_rows o ON o.fixture_id = n.fixture_id
     WHERE (n.home_goals, n.away_goals, n.is_completed, n.status)
           IS DISTINCT FROM
           (o.home_goals, o.away_goals, o.is_completed, o.status)
       -- No goals, nothing to score. The engine would refuse anyway; this
       -- saves the call. Mirrors the TypeScript caller's only local filter.
       AND n.home_goals IS NOT NULL
       AND n.away_goals IS NOT NULL
  LOOP
    BEGIN
      -- The engine owns every rule about WHETHER to score: postponed and
      -- cancelled are refused inside it, and that refusal is not duplicated
      -- here. Two copies of that rule would be two things to keep in step.
      PERFORM league_score_fixture(f.fixture_id);
    EXCEPTION WHEN OTHERS THEN
      -- ⚠ Swallowed BY DESIGN. See the header: raising here would roll back
      -- the feed's own write. Visible in the Postgres log, and the next change
      -- to this fixture tries again.
      RAISE WARNING 'score_league_fixture_on_change: fixture % failed: %',
        f.fixture_id, SQLERRM;
    END;
  END LOOP;

  RETURN NULL;
END;
$fn$;

COMMENT ON FUNCTION public.score_league_fixture_on_change() IS
  'Scores a league fixture the moment its score, status or completion changes, '
  'from inside the database. Exists because league_score_fixture had exactly '
  'one caller — the sync''s TypeScript — and the deployed production build '
  'skips unfinished fixtures (if (!c.is_completed) continue), so a LIVE match '
  'was never scored however willing migration 063 made the engine. Fires on '
  'the SCORE, never on live_minute, or a 1-0 held from the 20th minute would '
  're-score 22 entries seventy times to no effect. Errors are warned and '
  'swallowed: raising would roll back the feed write the trigger is reacting '
  'to. Idempotent and duplicated by the sync''s own call, deliberately. '
  'Migration 126.';

DROP TRIGGER IF EXISTS score_league_fixture_upd ON league_fixtures;
CREATE TRIGGER score_league_fixture_upd
  AFTER UPDATE ON league_fixtures
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION score_league_fixture_on_change();

-- =============================================================
-- VERIFY
-- =============================================================
--   -- a live fixture gains score rows without a deploy:
--   select count(*) from league_match_scores s
--     join league_fixtures f on f.fixture_id = s.fixture_id
--    where f.status = 'live';        -- was 0 before this migration
--
--   -- and the clock alone still scores nothing:
--   update league_fixtures set live_minute = live_minute + 1
--    where fixture_id = '<a live one>';
--   -- league_match_scores.calculated_at must NOT have moved.
