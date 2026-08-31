-- =============================================================
-- 121 — A DUEL IS WORTH HALF A PERFECT WEEK
-- =============================================================
-- ⚠ BEFORE YOU RUN THIS — two live functions are REPLACED
-- =============================================================
--   SELECT proname, md5(prosrc) FROM pg_proc
--    WHERE oid IN ('public.league_score_duels'::regproc,
--                  'public.league_finalize_ranks'::regproc);
--
-- `league_score_duels` must match migration **100**'s body, and
-- `league_finalize_ranks` must match migration **087**'s body. Those are the
-- last definitions in the repo; if either hash disagrees, production has
-- drifted and this migration would silently eat whatever the difference is.
-- STOP and diff before applying. Migration 055 was 682 bytes short of the live
-- function and CREATE OR REPLACE would have eaten ten live comment lines.
--
-- ⚠ The author of this file could NOT run that check — this session had no
-- database access (Supabase MCP unauthorised, no connection string). The
-- bodies below were reconstructed from 100 and 087 in the repo and are
-- byte-identical to them apart from the changes described here. The check is
-- therefore owed, not done.
-- =============================================================
--
-- Ryan, 2026-08-31: *"what if the duels produced more points? … if you win a
-- showdown that's 500 points, that's a big movement and shift."*
--
-- Today Showdown carries two currencies. `total_points` is what your picking
-- scored; `duel_points` is 3/1/0 and lives beside it, and the leaderboard
-- orders on duel points FIRST and accuracy only as a tiebreak. That cascade
-- makes the size of a duel point irrelevant — one win already beats any
-- accuracy total in the pool, at 3 points or at 3,000. So this migration is not
-- "change 3 to 500". It is two changes that only work together:
--
--   1. a duel is worth 500 / 250 / 0                    (league_score_duels)
--   2. the leaderboard ranks on the SUM, not a cascade   (league_finalize_ranks)
--
-- ## Where 500 comes from
--
-- Both scoring depths cap at 100 a fixture (066): Results pays 100 for the
-- right result, Scores pays 100 for an exact scoreline. So a perfect matchweek
-- is fixtures x 100 whatever the depth, and half of it is a number that means
-- the same thing in every pool.
--
-- Measured across every competition in `league_matchweeks.fixture_count`:
--
--     Premier League  38 mw   380 fx   10.00/mw   perfect 1000   half 500
--     La Liga         38 mw   380 fx   10.00/mw   perfect 1000   half 500
--     Serie A         38 mw   380 fx   10.00/mw   perfect 1000   half 500
--     Bundesliga      34 mw   306 fx    9.00/mw   perfect  900   half 450
--     Ligue 1         34 mw   306 fx    9.00/mw   perfect  900   half 450
--
-- ⚠ 500 IS A CONSTANT, and in an 18-team league it is 55.6% of a perfect week
-- rather than 50%. Neither Bundesliga nor Ligue 1 has launched. Symmetry holds
-- inside any one pool — everybody there has the same 500 available — which is
-- the gate that matters, so the drift is recorded rather than solved. If an
-- 18-team competition launches, this is the line to revisit.
--
-- ## The bye keeps matching the tie
--
-- Migration 100 raised a bye from 0 to 1 — *"no opponent, so no defeat"* — and
-- that reasoning is untouched. A bye simply moves 1 -> 250 with the tie it has
-- always been worth. It must NOT be left behind at 1: byes are shared evenly by
-- the rotation, so a stale bye value would quietly tax whoever sat out.
--
-- ## What this does NOT change
--
-- The draw, the reveal, the rotation, or where duel points are recomputed from.
-- `duel_points` is still rebuilt from the duels on every settle rather than
-- incremented, so a corrected fixture can still take points back.

-- -------------------------------------------------------------
-- 1. The values
-- -------------------------------------------------------------
-- Byte-identical to migration 100 apart from the three literals and the
-- comment above them.

CREATE OR REPLACE FUNCTION public.league_score_duels(p_pool_id uuid, p_matchweek_number integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_mode    text;
  v_settled integer := 0;
BEGIN
  SELECT league_mode INTO v_mode FROM pools WHERE pool_id = p_pool_id;
  IF v_mode IS DISTINCT FROM 'showdown' THEN
    RETURN jsonb_build_object('skipped', 'not a showdown pool');
  END IF;

  -- The weekly accuracy number is whatever the DEPTH produced: both Results and
  -- Scores write league_match_scores.total_points, so Showdown reads one column
  -- and never learns which depth it is layered over. That is the whole reason
  -- Decision 9 calls it a layer and not a peer engine.
  WITH acc AS (
    SELECT d.duel_id,
           COALESCE((SELECT SUM(s.total_points) FROM league_match_scores s
                      WHERE s.entry_id = d.entry_a AND s.pool_id = p_pool_id
                        AND s.matchweek_number = p_matchweek_number), 0) AS a,
           CASE WHEN d.entry_b IS NULL THEN NULL ELSE
             COALESCE((SELECT SUM(s.total_points) FROM league_match_scores s
                        WHERE s.entry_id = d.entry_b AND s.pool_id = p_pool_id
                          AND s.matchweek_number = p_matchweek_number), 0)
           END AS b
      FROM league_duels d
     WHERE d.pool_id = p_pool_id
       AND d.matchweek_number = p_matchweek_number
       AND d.settled_at IS NULL
  )
  UPDATE league_duels d
     SET accuracy_a = acc.a,
         accuracy_b = acc.b,
         -- 500 / 250 / 0 — half a perfect matchweek for a win, a quarter for a
         -- tie. These are LEADERBOARD points now, not a private 3/1/0 currency:
         -- league_finalize_ranks below adds them to what your picking scored.
         --
         -- A BYE IS WORTH A TIE. No opponent, so no defeat — the same rule Last
         -- Man Standing already applies to a club whose match was never played.
         -- Zero would punish a member for a fixture that did not exist, and
         -- once joins start flipping the rotation's parity the byes stop being
         -- evenly shared. (Migration 100, unchanged in reasoning.)
         points_a = CASE WHEN acc.b IS NULL THEN 250
                         WHEN acc.a > acc.b THEN 500
                         WHEN acc.a = acc.b THEN 250
                         ELSE 0 END,
         points_b = CASE WHEN acc.b IS NULL THEN NULL
                         WHEN acc.b > acc.a THEN 500
                         WHEN acc.a = acc.b THEN 250
                         ELSE 0 END,
         settled_at = now()
    FROM acc
   WHERE d.duel_id = acc.duel_id;
  GET DIAGNOSTICS v_settled = ROW_COUNT;

  -- INSERT, not UPDATE: an entry that has never picked has no totals row yet,
  -- and updating nothing would drop them off the leaderboard entirely. They are
  -- still in the pool, so they appear on 0 — the same call decision 11 makes for
  -- a late joiner in Table mode.
  --
  -- Recomputed from the duels, never incremented: a corrected fixture has to be
  -- able to take duel points back, exactly as the fixture engine does.
  INSERT INTO league_entry_totals (entry_id, pool_id, duel_points, updated_at)
  SELECT pe.entry_id, p_pool_id,
         COALESCE((
           SELECT SUM(CASE WHEN d.entry_a = pe.entry_id THEN d.points_a ELSE d.points_b END)
             FROM league_duels d
            WHERE d.pool_id = p_pool_id
              AND d.settled_at IS NOT NULL
              AND (d.entry_a = pe.entry_id OR d.entry_b = pe.entry_id)
         ), 0),
         now()
    FROM pool_entries pe
    JOIN pool_members pm ON pe.member_id = pm.member_id
   WHERE pm.pool_id = p_pool_id
     AND pe.retired_at IS NULL
  ON CONFLICT (entry_id) DO UPDATE
    SET duel_points = EXCLUDED.duel_points,
        updated_at  = now();

  PERFORM league_finalize_ranks(p_pool_id);

  RETURN jsonb_build_object('settled', v_settled, 'matchweek', p_matchweek_number);
END;
$fn$;

COMMENT ON FUNCTION public.league_score_duels(uuid, integer) IS
  'Settles one matchweek''s duels for a showdown pool. A win is 500, a tie 250, '
  'a bye 250 and a loss 0 — half a perfect matchweek for a win, since both '
  'scoring depths cap at 100 a fixture (066) and a 20-team league plays 10 a '
  'week. These are LEADERBOARD points: league_finalize_ranks adds duel_points '
  'to total_points rather than ranking on it first. duel_points is recomputed '
  'from the duels, never incremented, so a corrected fixture can take it back. '
  'Migrations 084 -> 085 -> 100 -> 121.';

-- -------------------------------------------------------------
-- 2. The sum
-- -------------------------------------------------------------
-- Byte-identical to migration 087 apart from one ORDER BY rung and its comment.
--
-- ⚠ NO MODE LOOKUP, DELIBERATELY. `duel_points` is 0 for every mode that is not
-- Showdown, so `total_points + duel_points` IS `total_points` for Pick'em,
-- Table and Last Man Standing. One expression, correct everywhere, and the
-- function still never learns what mode it is ranking — which is what has kept
-- it a single rank writer. Adding a join to `pools` here to branch on
-- league_mode would be the first crack in that.
--
-- ⚠ `total_points` SURVIVES AS THE NEXT RUNG. On an equal combined score the
-- member who earned more of it by picking finishes ahead, which is what keeps
-- the promise in leagueModeInfo.ts literally true: the weekly score is still
-- the tiebreak, it is just no longer the ONLY thing a duel outranks.

CREATE OR REPLACE FUNCTION public.league_finalize_ranks(p_pool_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ranked int := 0;
BEGIN
  -- Competing entries get a position...
  WITH ranked AS (
    SELECT t.entry_id,
           ROW_NUMBER() OVER (
             -- Three modes, one ordering. Last Man Standing leads on rounds
             -- won, which is 0 everywhere else. Showdown's duel points are now
             -- ADDED to its accuracy rather than ranked ahead of it (121), and
             -- they are 0 in every other mode, so that sum is exactly
             -- total_points for Pick'em and Table and the cascade below is
             -- untouched. A second rank writer is how two leaderboards start
             -- disagreeing about who won.
             ORDER BY t.rounds_won                       DESC,
                      (t.total_points + t.duel_points)   DESC,
                      t.total_points  DESC,
                      t.exact_count   DESC,
                      t.correct_count DESC,
                      t.bonus_points  DESC,
                      -- rung 5: joined and picked first (decision 3). It cannot
                      -- be pool_entries.predictions_submitted_at — that column
                      -- stays NULL for every league entry by design.
                      COALESCE(
                        (SELECT min(lp.created_at) FROM league_predictions lp
                          WHERE lp.entry_id = t.entry_id),
                        'infinity'::timestamptz
                      ) ASC,
                      -- total order, so an unrelated re-score never reshuffles
                      t.entry_id ASC
           )::int AS new_rank
      FROM league_entry_totals t
      JOIN pool_entries pe ON pe.entry_id = t.entry_id
     WHERE t.pool_id = p_pool_id
       AND pe.member_id IS NOT NULL   -- detached: left or was removed
       AND pe.retired_at IS NULL      -- retired: stopped participating
  )
  UPDATE league_entry_totals t
     SET final_rank = r.new_rank,
         updated_at = now()
    FROM ranked r
   WHERE t.entry_id = r.entry_id
     AND t.final_rank IS DISTINCT FROM r.new_rank;
  GET DIAGNOSTICS v_ranked = ROW_COUNT;

  -- ...and everyone else has theirs cleared, so a retired entry cannot leave a
  -- hole in the visible order or show a stale position if it is ever rendered.
  UPDATE league_entry_totals t
     SET final_rank = NULL, previous_final_rank = NULL, updated_at = now()
    FROM pool_entries pe
   WHERE pe.entry_id = t.entry_id
     AND t.pool_id = p_pool_id
     AND (pe.member_id IS NULL OR pe.retired_at IS NOT NULL)
     AND (t.final_rank IS NOT NULL OR t.previous_final_rank IS NOT NULL);

  RETURN v_ranked;
END;
$fn$;

COMMENT ON FUNCTION public.league_finalize_ranks(uuid) IS
  'The ONE rank writer for every league mode. Orders on rounds_won (Last Man '
  'Standing), then total_points + duel_points — Showdown''s duels are ADDED to '
  'its accuracy rather than ranked ahead of it (121), and duel_points is 0 in '
  'every other mode so the sum is exactly total_points there. total_points then '
  'survives as the next rung, so an equal combined score falls to whoever '
  'earned more of it by picking. Never branch on league_mode here: a second '
  'rank writer is how two leaderboards start disagreeing about who won. '
  'Migrations 059 -> 084 -> 087 -> 121.';

-- -------------------------------------------------------------
-- 3. Re-rank every league pool
-- -------------------------------------------------------------
-- The ORDER BY changed, so stored `final_rank` values are stale even where no
-- duel has settled. This is cheap and idempotent.
--
-- ⚠ NO BACKFILL OF `duel_points` IS NEEDED OR DONE. At the time of writing,
-- 0 of 333 duel rows had ever settled in either showdown pool, so every
-- points_a/points_b is NULL and every duel_points is 0 — there is nothing to
-- restate and no member has ever seen a duel total. If that is no longer true
-- when this runs, `league_score_duels` must be re-run per settled matchweek to
-- rewrite points_a/points_b at the new values FIRST; re-ranking alone would
-- leave 3/1/0 rows summed into a 500-point leaderboard.

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT pool_id FROM pools WHERE league_season_id IS NOT NULL LOOP
    PERFORM league_finalize_ranks(r.pool_id);
  END LOOP;
END $$;
