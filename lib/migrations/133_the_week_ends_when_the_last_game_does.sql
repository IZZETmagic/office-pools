-- =============================================================
-- 133 — THE WEEK ENDS WHEN THE LAST GAME DOES
-- =============================================================
-- ⚠ BEFORE YOU RUN THIS — one live function is REPLACED
--     refresh_league_matchweek_window
--       md5(prosrc)            = 5a6d76289481cf614f93a60d924a58dc   (928 bytes)
--       md5(code, no comments) = 79d519e6cca33a0287f949e847997cb5
--   Read from production 2026-09-02 immediately before writing this file.
--
-- Risk: SPORTPOOL_PROGRAMME.md → R26. Found while testing migration 132.
--
-- ✅ APPLIED TO PRODUCTION 2026-09-02. Re-hashed after, identical:
--   refresh_league_matchweek_window  346db187c8b26e295c4d61ec5be80ec8  (1,116 b)
--
-- ## Proved in a rolled-back transaction, on the real season
--
-- Ten fixtures completed ONE AT A TIME, exactly as the sync writes them:
--
--   counts after the last whistle        10 / 10
--   SNAPSHOTTED on the whistle?          YES      (it was NO before this)
--   Showdown duels settled for the week  9        (was 0)
--   matchweek_completed outbox events    11       (one per pool in the season)
--   LMS round closed                     yes, at matchweek 3
--
-- Then a further touch to a fixture — the shape of the next sync tick — left
-- duels at 9 and outbox events at 11. **Nothing double-settles and no duplicate
-- event is queued**, because the settle triggers fire only on the NULL →
-- non-NULL transition and the snapshot returns 0 for a matchweek already
-- stamped.
-- =============================================================
--
-- **A matchweek did not snapshot on the whistle that completed it.**
--
-- Measured on production, in a rolled-back transaction: all ten fixtures of a
-- matchweek completed one at a time, `completed_fixture_count` reading 10/10,
-- every fixture carrying a scored witness — and `ranks_snapshot_at` still NULL.
-- One further touch to any fixture set it.
--
-- ## Why
--
-- Postgres fires triggers in NAME order, and on `league_fixtures` that is:
--
--   broadcast_league_fixtures_upd
--   score_league_fixture_upd            ⟵ calls league_snapshot_matchweek_ranks
--   settle_league_lms_upd
--   trg_refresh_league_matchweek_window_upd   ⟵ writes completed_fixture_count
--   update_league_fixtures_updated_at
--
-- The scorer attempts the snapshot BEFORE this function writes the count, so the
-- count it reads is always one behind. On the final whistle of a matchweek it
-- sees 9 of 10 and declines. Then this function writes 10 — and nothing
-- re-attempts, because `refresh_league_matchweek_window` did not call the
-- snapshot at all.
--
-- ## What that cost, which is more than it sounds
--
-- `ranks_snapshot_at` is the single definition of *"this matchweek is finished"*,
-- and FOUR things hang off it:
--
--   * Showdown duel settlement          (trg_league_settle_duels)
--   * Last Man Standing round closure   (trg_league_settle_lms, and 132's gate)
--   * the `matchweek_completed` outbox event — *"results are in"*
--   * the movement arrows               (previous_final_rank)
--
-- All of them were late by one write. It self-heals in production only because
-- api-football keeps touching a completed fixture afterwards — status detail,
-- and so on — which is luck, not design. **A matchweek whose last fixture is
-- never written again never snapshots at all**, and its duels never settle.
--
-- ## The fix, and why it is this one
--
-- Re-attempt the snapshot for the matchweeks this function just changed.
--
-- ⚠ IT LOOPS WHAT THE UPDATE RETURNED, NOT A STATE TEST. The obvious version is
-- `WHERE completed_fixture_count >= fixture_count AND ranks_snapshot_at IS NULL`
-- — and that would be a second copy of "is this matchweek finished", which is
-- exactly the duplication that has broken this area twice (086's lock ate the
-- engine's own write in 088; 106's empty matchweek eliminated all ten members of
-- a production pool). Worse, it would silently exclude the POSTPONED case, where
-- migration 094 settles on the window closing rather than on every game being
-- played — so the copy would not even be a faithful one.
--
-- `RETURNING` gives the precise set: the matchweeks whose counts actually moved.
-- `league_snapshot_matchweek_ranks` then decides, alone, whether each is
-- finished — including 094's case. One owner for the rule.
--
-- It is cheap. The UPDATE's own `IS DISTINCT FROM` guard means the returned set
-- is normally empty and at most one row on a whistle, and the snapshot returns 0
-- immediately for a matchweek already stamped.
--
-- ## ⚠ What this does NOT fix
--
-- A matchweek that goes quiet without completing — the postponed fixture that is
-- never rescheduled — still waits for something to touch one of its fixtures.
-- Nothing here is time-driven, and a clock cannot fire a trigger. That is the
-- job of the league crons, which are written and **not scheduled** (R21).
--
-- ## Safety
--
-- * **No recursion.** Verified against the live catalogue: of
--   `league_snapshot_matchweek_ranks`, both settle-on-snapshot triggers,
--   `league_score_duels`, `league_lms_settle`, `league_lms_open_round` and
--   `league_finalize_ranks`, **none writes `league_fixtures`** — so nothing
--   reached from here can re-enter this trigger.
-- * **No double-settling.** `trg_league_settle_duels` and `trg_league_settle_lms`
--   are `AFTER UPDATE OF ranks_snapshot_at ... WHEN (old IS NULL AND new IS NOT
--   NULL)`, so they fire exactly once, on the transition.
-- * **Errors are swallowed to a WARNING**, like 126, 131 and 132: raising would
--   roll back the feed's own fixture write, losing a result to protect a
--   snapshot.
-- * ⚠ **The security context is deliberately unchanged.** This function is
--   INVOKER, unlike every other league trigger function, and
--   `league_snapshot_matchweek_ranks` is `SECURITY DEFINER` REVOKEd from
--   `authenticated`. Only `service_role` writes `league_fixtures`, so the call
--   succeeds; adding `SECURITY DEFINER` here would be a privilege change to a
--   function this migration is only meant to un-stick, and adding it without a
--   `SET search_path` would be worse than leaving it alone.

CREATE OR REPLACE FUNCTION public.refresh_league_matchweek_window()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_mw uuid;
BEGIN
  -- ⬅ 133. The UPDATE is unchanged; it now RETURNS what it touched.
  FOR v_mw IN
    WITH touched AS (
      UPDATE league_matchweeks mw SET
        first_kickoff_at        = agg.first_k,
        last_kickoff_at         = agg.last_k,
        fixture_count           = COALESCE(agg.n, 0),
        completed_fixture_count = COALESCE(agg.done, 0),
        lock_at    = CASE WHEN mw.lock_at IS NULL OR mw.lock_at > now()
                          THEN agg.first_k - interval '1 hour' ELSE mw.lock_at END,
        updated_at = now()
      FROM league_matchweeks m2
      LEFT JOIN LATERAL (
        SELECT min(f.kickoff_at) AS first_k, max(f.kickoff_at) AS last_k,
               count(*) AS n, count(*) FILTER (WHERE f.is_completed) AS done
          FROM league_fixtures f WHERE f.matchweek_id = m2.matchweek_id
      ) agg ON true
      WHERE mw.matchweek_id = m2.matchweek_id
        AND (mw.first_kickoff_at, mw.last_kickoff_at, mw.fixture_count, mw.completed_fixture_count)
            IS DISTINCT FROM (agg.first_k, agg.last_k, COALESCE(agg.n,0), COALESCE(agg.done,0))
      RETURNING mw.matchweek_id
    )
    SELECT matchweek_id FROM touched
  LOOP
    -- ⬅ 133. The scorer already tried this, one statement too early, against a
    -- count this UPDATE had not written yet. Try again now that it has.
    -- `league_snapshot_matchweek_ranks` owns every rule about WHETHER to
    -- snapshot — including the postponed-fixture case (094) — and returns 0 for
    -- a matchweek already stamped, so calling it more often than necessary is
    -- free.
    BEGIN
      PERFORM league_snapshot_matchweek_ranks(v_mw);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'refresh_league_matchweek_window: snapshot for matchweek % failed: %',
        v_mw, SQLERRM;
    END;
  END LOOP;

  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.refresh_league_matchweek_window() IS
  'Recomputes a matchweek''s kickoff window, fixture counts and lock from its '
  'fixtures, then RE-ATTEMPTS league_snapshot_matchweek_ranks for whatever it '
  'just changed. The re-attempt is migration 133: Postgres fires triggers in '
  'name order, so score_league_fixture_upd runs BEFORE this one and asks whether '
  'the matchweek is finished using a completed_fixture_count this function has '
  'not written yet — always one behind. On the final whistle it saw 9 of 10 and '
  'declined, and nothing tried again, so Showdown settlement, LMS round closure, '
  'the matchweek_completed outbox event and the movement arrows were all late by '
  'one write. It loops the UPDATE''s RETURNING rather than testing state, so the '
  'definition of a finished matchweek stays in one place.';
