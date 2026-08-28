-- =============================================================
-- 105 — THE SYNC MAY MOVE A KICKOFF (L11)
-- =============================================================
-- Migration 053 built `league_apply_fixture_sync` to write everything about a
-- fixture EXCEPT when it is played, and said so in its own comment:
--
--     'Never writes: kickoff_at, original_kickoff_at (L11 owns rescheduling)'
--
-- That was right at the time. The arm could see a move — the mapper has flagged
-- `rescheduled` since 053 — and had nowhere to put it, so every one was counted
-- and discarded. This is L11 collecting the debt.
--
-- ⚠ BEFORE YOU RUN THIS — one live function is REPLACED
-- =============================================================
--   SELECT pg_get_functiondef('public.league_apply_fixture_sync'::regproc);
-- It should be 053's, plus nothing. If it has drifted, reconcile FIRST: this is
-- a CREATE OR REPLACE and it will silently eat anything the file does not carry.
-- =============================================================
--
-- ## Why the deadline needs no code here
--
-- `trg_refresh_league_matchweek_window_upd` already fires AFTER UPDATE OF
-- kickoff_at, and 101 made `lock_at` derive from the first kickoff. So moving a
-- fixture moves its matchweek's deadline by itself — and moves it on BOTH sides
-- when the fixture later changes matchweek, because the trigger is FOR EACH
-- STATEMENT and recomputes every one.
--
-- 101's CASE is what makes that safe: it only re-derives a lock that is NULL or
-- still in the future. A matchweek that has already locked keeps its deadline,
-- so a fixture moved into a week people have finished picking cannot retroact-
-- ively reopen it, and a fixture moved out cannot pull it shut.
--
-- ## Two guards the database owns rather than trusts
--
--   · A COMPLETED fixture's kickoff is history. Moving it would re-home a
--     played match into another matchweek and restate what was already scored,
--     so it is refused here as well as in the mapper. The one that matters is
--     this one: the mapper is a deploy, the constraint is a property.
--
--   · `original_kickoff_at` is written through COALESCE, so the FIRST value
--     recorded is the one that survives. Under a second move the mapper is
--     supposed to leave it alone, and did not for a while — the projection it
--     reads by was missing the column, so `cur.original_kickoff_at` was always
--     undefined and every move looked like the first. Whoever the original
--     belongs to, it is not the caller.
--
-- Everything else 053 established is unchanged and still load-bearing: the
-- advisory lock, the seen-stamp that costs no window recompute, the set_* flags
-- that distinguish "clear this" from "do not touch this", the manual_override
-- exclusion in SQL as well as in TypeScript, and the DISTINCT FROM that makes
-- `changed` count values APPLIED rather than rows MATCHED.
--
-- ⚠ That last one is why kickoff_at appears in the predicate as well as the SET.
-- A postponement usually moves NOTHING else — same status, same empty score —
-- so leaving it out would file every reschedule under "no change", write it,
-- and then decline to report it. The one event this migration exists to catch
-- would have been the one event it could not see.
-- =============================================================

CREATE OR REPLACE FUNCTION public.league_apply_fixture_sync(
  p_season_id uuid,
  p_seen      text[],
  p_rows      jsonb,
  p_now       timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_seen    int   := 0;
  v_changed jsonb := '[]'::jsonb;
BEGIN
  -- Serialise ingest per season. Nothing else does: the route's sweep lock covers
  -- the recalc sweep, not the target loop, and two overlapping runs leave
  -- completed_fixture_count permanently undercounted (the statement trigger's
  -- snapshot aggregate vs its EvalPlanQual re-check). Transaction-scoped, free
  -- when uncontended.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_season_id::text, 0));

  -- (a) Liveness stamp for EVERY row the arm compared, changed or not. Assigns
  --     ONLY last_synced_at, which is absent from
  --     trg_refresh_league_matchweek_window_upd's UPDATE OF list, so this costs no
  --     matchweek recompute. Without it, "the arm looked and found nothing to do"
  --     is indistinguishable in the durable store from "the arm never ran".
  --     manual_override rows are excluded here too: we did not look at them.
  IF p_seen IS NOT NULL AND array_length(p_seen, 1) > 0 THEN
    UPDATE league_fixtures f
       SET last_synced_at = p_now
     WHERE f.season_id = p_season_id
       AND f.external_fixture_id = ANY (p_seen)
       AND NOT f.manual_override;
    GET DIAGNOSTICS v_seen = ROW_COUNT;
  END IF;

  -- (b) The value write. Skipped entirely when there is nothing to write, so a
  --     quiet tick fires the window trigger zero times (a statement trigger fires
  --     even when the UPDATE matches no rows).
  IF p_rows IS NOT NULL AND jsonb_array_length(p_rows) > 0 THEN
    WITH r AS (
      -- Every optional field is paired with an explicit set_* flag. jsonb_to_recordset
      -- renders an ABSENT key and an explicit JSON null identically as SQL NULL, so
      -- without the flags "clear the score" and "do not touch the score" would be the
      -- same payload — and `status` is NOT NULL, `is_completed` is NOT NULL DEFAULT
      -- false, so getting it wrong either errors loudly or silently un-completes a
      -- finished fixture.
      SELECT * FROM jsonb_to_recordset(p_rows) AS x(
        external_fixture_id  text,
        set_status           boolean,
        status               text,
        set_status_detail    boolean,
        status_detail        text,
        set_goals            boolean,
        home_goals           integer,
        away_goals           integer,
        set_completed        boolean,
        is_completed         boolean,
        set_live             boolean,
        live_minute          integer,
        live_period          text,
        live_added           integer,
        -- L11. Both nullable timestamps, both behind their own flag for the same
        -- reason as the score.
        set_kickoff          boolean,
        kickoff_at           timestamptz,
        set_original_kickoff boolean,
        original_kickoff_at  timestamptz
      )
    ),
    resolved AS (
      SELECT
        f.fixture_id,
        CASE WHEN COALESCE(r.set_status,        false) THEN r.status                        ELSE f.status        END AS n_status,
        CASE WHEN COALESCE(r.set_status_detail, false) THEN r.status_detail                 ELSE f.status_detail END AS n_status_detail,
        CASE WHEN COALESCE(r.set_goals,         false) THEN r.home_goals                    ELSE f.home_goals    END AS n_home_goals,
        CASE WHEN COALESCE(r.set_goals,         false) THEN r.away_goals                    ELSE f.away_goals    END AS n_away_goals,
        CASE WHEN COALESCE(r.set_completed,     false) THEN COALESCE(r.is_completed, false) ELSE f.is_completed  END AS n_is_completed,
        CASE WHEN COALESCE(r.set_live,          false) THEN r.live_minute                   ELSE f.live_minute   END AS n_live_minute,
        CASE WHEN COALESCE(r.set_live,          false) THEN r.live_period                   ELSE f.live_period   END AS n_live_period,
        CASE WHEN COALESCE(r.set_live,          false) THEN r.live_added                    ELSE f.live_added    END AS n_live_added,
        -- ⚠ `AND NOT f.is_completed` is the guard, and it reads the CURRENT row
        -- rather than the incoming one on purpose: what matters is whether this
        -- fixture had already been played before the feed spoke.
        CASE WHEN COALESCE(r.set_kickoff, false) AND NOT f.is_completed
             THEN r.kickoff_at ELSE f.kickoff_at END AS n_kickoff_at,
        -- COALESCE, not CASE: the first original recorded is the one that stands.
        CASE WHEN COALESCE(r.set_original_kickoff, false) AND NOT f.is_completed
             THEN COALESCE(f.original_kickoff_at, r.original_kickoff_at)
             ELSE f.original_kickoff_at END AS n_original_kickoff_at
      FROM r
      JOIN league_fixtures f
        ON f.season_id           = p_season_id
       AND f.external_fixture_id = r.external_fixture_id
      -- manual_override enforced in SQL as well as in TypeScript. An unknown
      -- external_fixture_id simply fails to join: never inserted, never an error.
      WHERE NOT f.manual_override
    ),
    upd AS (
      UPDATE league_fixtures f
         SET status              = v.n_status,
             status_detail       = v.n_status_detail,
             home_goals          = v.n_home_goals,
             away_goals          = v.n_away_goals,
             is_completed        = v.n_is_completed,
             -- rising edge only; cleared when a completion is withdrawn (see
             -- league_fixtures_completed_at_ck).
             completed_at        = CASE WHEN v.n_is_completed THEN COALESCE(f.completed_at, p_now) ELSE NULL END,
             live_minute         = v.n_live_minute,
             live_period         = v.n_live_period,
             live_added          = v.n_live_added,
             kickoff_at          = v.n_kickoff_at,
             original_kickoff_at = v.n_original_kickoff_at,
             last_synced_at      = p_now
        FROM resolved v
       WHERE f.fixture_id = v.fixture_id
         -- RETURNING must count values APPLIED, not rows MATCHED. Without this
         -- predicate a cast bug that writes NULL to six fixtures still returns six
         -- rows and reports changed=6.
         AND (f.status, f.status_detail, f.home_goals, f.away_goals,
              f.is_completed, f.live_minute, f.live_period, f.live_added,
              f.kickoff_at, f.original_kickoff_at)
             IS DISTINCT FROM
             (v.n_status, v.n_status_detail, v.n_home_goals, v.n_away_goals,
              v.n_is_completed, v.n_live_minute, v.n_live_period, v.n_live_added,
              v.n_kickoff_at, v.n_original_kickoff_at)
      RETURNING f.fixture_id, f.external_fixture_id, f.status,
                f.home_goals, f.away_goals, f.is_completed,
                -- The caller scores off home_goals/away_goals and re-reads the
                -- standings off is_completed; a move carries neither, so it rides
                -- along in `changed` costing nothing and can be logged.
                f.kickoff_at, f.original_kickoff_at
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(u)), '[]'::jsonb) INTO v_changed FROM upd u;
  END IF;

  RETURN jsonb_build_object('seen', v_seen, 'changed', v_changed);
END;
$fn$;

COMMENT ON FUNCTION public.league_apply_fixture_sync(uuid, text[], jsonb, timestamptz) IS
  'Applies one api-football sweep for a season, in one statement. Serialised per '
  'season by an advisory lock. Stamps last_synced_at on every row seen; writes '
  'values only where a set_* flag says to and the value actually differs. '
  'Never writes: matchweek_id (L6 owns re-homing), and nothing at all to a '
  'manual_override row. 105 ADDED kickoff_at + original_kickoff_at (L11): a '
  'reschedule is written unless the fixture is already completed, and the '
  'original is COALESCEd so the first one recorded survives. Moving a kickoff '
  'fires trg_refresh_league_matchweek_window_upd, which re-derives lock_at for '
  'every matchweek that is not already locked.';
