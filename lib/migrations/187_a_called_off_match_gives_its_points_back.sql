-- =============================================================
-- 187 — A CALLED-OFF MATCH GIVES BACK THE POINTS IT GAVE WHILE IT WAS PLAYED
-- =============================================================
-- Plan: drafts/2026-10-10_abandoned_fixture_retraction_plan.md (approved by
-- Ryan 2026-10-10).
--
-- ## What happened
--
-- Rayo Vallecano v Athletic Club, La Liga matchweek 8, Saturday 10 Oct 2026, was
-- abandoned at 0–0 around the half-hour mark after objects were thrown onto the
-- pitch. api-football still reported it as `INT` (Match Interrupted) twelve
-- hours later, so the sync kept it live. It was hand-set to
-- cancelled/abandoned with `manual_override` that night.
--
-- While it was live, the engine scored it — 063 makes every goal re-score a live
-- fixture provisionally, which is the whole in-match feature. When the match
-- became cancelled the engine refused to score it again, as 063 says it must.
-- But refusing is all it did. The rows it had already written stayed, and so
-- did every total built from them. The only pick on this match was a miss in a
-- one-member test pool, so it cost nothing; a 0–0 pick would have kept 100
-- points from a match that never finished, permanently.
--
-- ## Three holes, one rule
--
--   1. league_score_fixture's refusal branch returned early: no DELETE, no
--      total recompute, no re-rank.
--   2. score_league_fixture_on_change (126) only called the engine when the
--      NEW goals were non-NULL, so a match called off with its goals blanked
--      never reached the engine at all.
--   3. league_fixture_state (the 061 witness) was never cleared, so it went on
--      saying "scored as live 0–0".
--
-- The rule: A FIXTURE'S SCORE ROWS ALWAYS DESCRIBE WHAT THE FIXTURE IS NOW.
--
--   live / completed, both goals       -> scored (unchanged)
--   live / completed, a NULL goal      -> nothing (a feed blip must not flicker)
--   scheduled / postponed / cancelled  -> retracted
--
-- ## What deliberately does NOT change
--
--   · The scoring path is byte for byte 066's. Only the gate above it moved.
--   · A SETTLED Showdown duel is not reopened. That mirrors 094: a late-played
--     fixture scores into the total but does not reopen the duel. A duel is a
--     result. An unsettled one simply sums fewer rows when it settles.
--   · Last Man Standing reads `is_completed` only. Table mode is a full-time
--     table and does not read league_match_scores (checked 2026-10-10).
--   · previous_final_rank and the rank history are not rewritten.
--   · Nobody is sent anything. The retraction queues `fixture_scored`, which
--     the league outbox treats as cache invalidation only.
--   · The TypeScript caller keeps its own goals filter. This trigger catches
--     every write, the hand-set one included, so no deploy is needed.
--
-- ## The disclosure gate
--
--   "If a match is abandoned or postponed after kickoff, any points it gave you
--    while it was being played are taken back."  -> passes.
--
-- =============================================================
-- BEFORE YOU RUN THIS — both functions are REPLACED
-- =============================================================
--   SELECT proname, md5(prosrc), length(prosrc) FROM pg_proc
--    WHERE proname IN ('league_score_fixture', 'score_league_fixture_on_change');
--
-- Read 2026-10-10, both identical to their files:
--   league_score_fixture            3214ea5b635f14fff25e007f6dcb8be3 / 12395  (066)
--   score_league_fixture_on_change  b9dca27ab855537416f1c532b4f142e2 / 1387   (126)
-- =============================================================

-- =============================================================
-- THE ENGINE — 066's function with a two-way gate
-- =============================================================

CREATE OR REPLACE FUNCTION public.league_score_fixture(p_fixture_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_season      uuid;
  v_mw_id       uuid;
  v_mw_number   int;
  v_fx_number   int;
  v_kickoff     timestamptz;
  v_home        int;
  v_away        int;
  v_status      text;
  v_outcome     text;
  v_completed   boolean;
  v_prev        record;
  v_changed     boolean := true;
  v_scored      int := 0;
  v_entries     int := 0;
  v_pool        uuid;
  -- 187. The retraction branch.
  v_retracted   int := 0;
  v_entry_ids   uuid[];
  v_pool_ids    uuid[];
  v_witness     int := 0;
BEGIN
  -- Serialise per fixture. Two sync runs can observe the same completion, and
  -- both would otherwise recompute the same totals concurrently.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_fixture_id::text, 1));

  SELECT f.season_id, m.matchweek_id, m.matchweek_number, f.fixture_number, f.kickoff_at,
         f.home_goals, f.away_goals, f.is_completed, f.status
    INTO v_season, v_mw_id, v_mw_number, v_fx_number, v_kickoff, v_home, v_away, v_completed, v_status
    FROM league_fixtures f
    JOIN league_matchweeks m ON m.matchweek_id = f.matchweek_id
   WHERE f.fixture_id = p_fixture_id;

  IF v_season IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'fixture not found');
  END IF;

  -- Migration 063. A LIVE fixture scores too — this is the whole in-match
  -- feature. The gate is "is it being played, and do we have a score", not
  -- "is it over".
  --
  -- Migration 187. The gate now works in BOTH directions. A fixture's score
  -- rows always describe what the fixture is NOW:
  --
  --   live / completed, both goals  -> score it (provisionally while live)
  --   live / completed, a NULL goal -> change nothing. A feed blip, or a
  --     completion a tick ahead of its goals; the next tick has them.
  --     Retracting here would make the leaderboard flicker on a provider hiccup.
  --   scheduled / postponed / cancelled -> RETRACT. Whatever was scored while
  --     it was being played comes back out. "An abandoned match's score is not
  --     a result and must not enter a standing" — 063 said so, but only
  --     enforced it on the way IN, so the score a match stood at when it was
  --     called off stayed in every total that had scored it, for good.
  --
  -- Both goals are still checked rather than assumed: `completed_ck` forbids
  -- is_completed with NULL home_goals, but away_goals is only tied to home by
  -- `result_pair_ck`, and a live fixture has neither constraint helping it.
  IF v_status IN ('live', 'completed') AND (v_home IS NULL OR v_away IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'fixture not scoreable',
                              'status', v_status, 'scored', 0, 'retracted', 0);
  END IF;

  IF v_status NOT IN ('live', 'completed') THEN
    -- ⚠ THE AFFECTED ENTRIES COME FROM THE DELETE ITSELF. The scoring path
    -- below finds them as "every entry with a score row on this fixture" —
    -- which, after this DELETE, is nobody. A copy of that step here would
    -- recompute nothing and leave every total exactly as wrong as before.
    WITH removed AS (
      DELETE FROM league_match_scores
       WHERE fixture_id = p_fixture_id
      RETURNING entry_id, pool_id
    )
    SELECT count(*)::int, array_agg(DISTINCT entry_id), array_agg(DISTINCT pool_id)
      INTO v_retracted, v_entry_ids, v_pool_ids
      FROM removed;

    IF v_retracted > 0 THEN
      -- The same recompute as the scoring path, from what is left. LEFT JOIN,
      -- so an entry whose only row was this one goes to 0 instead of keeping
      -- its old figure. bonus_points and point_adjustment are untouched, exactly
      -- as on the way in. UPDATE, not upsert: an entry that had a score row
      -- already has a totals row, because the scoring path wrote both.
      WITH totals AS (
        SELECT e.entry_id,
               COALESCE(sum(s.total_points), 0)::int                             AS match_points,
               COALESCE(count(*) FILTER (WHERE s.score_type = 'exact'), 0)::int   AS exact_count,
               COALESCE(count(*) FILTER (WHERE s.score_type <> 'miss'), 0)::int   AS correct_count
          FROM unnest(v_entry_ids) AS e(entry_id)
          LEFT JOIN league_match_scores s ON s.entry_id = e.entry_id
         GROUP BY e.entry_id
      )
      UPDATE league_entry_totals t
         SET match_points  = x.match_points,
             total_points  = x.match_points + t.bonus_points + t.point_adjustment,
             exact_count   = x.exact_count,
             correct_count = x.correct_count,
             updated_at    = now()
        FROM totals x
       WHERE t.entry_id = x.entry_id;
      GET DIAGNOSTICS v_entries = ROW_COUNT;
    END IF;

    -- The witness said "scored as <status> <score>". Nothing is scored now.
    -- 061's snapshot guard only reads the witness of a COMPLETED fixture, so
    -- clearing it on one that is not completed cannot hold a week open.
    DELETE FROM league_fixture_state WHERE fixture_id = p_fixture_id;
    GET DIAGNOSTICS v_witness = ROW_COUNT;

    -- Re-rank, and tell the outbox. `fixture_scored` is cache invalidation, not
    -- a notice (app/api/cron/league-outbox): without it a member keeps seeing
    -- the points the called-off match gave them until the cache expires.
    -- Nobody is sent anything.
    FOREACH v_pool IN ARRAY COALESCE(v_pool_ids, ARRAY[]::uuid[]) LOOP
      PERFORM league_finalize_ranks(v_pool);
      INSERT INTO league_score_events (pool_id, fixture_id, kind)
      VALUES (v_pool, p_fixture_id, 'fixture_scored')
      ON CONFLICT DO NOTHING;
    END LOOP;

    -- Asked even when nothing was retracted. Calling off the last unplayed game
    -- of a season's FINAL matchweek is what closes that week's window (094's
    -- `v_playable` skips cancelled), and before 187 nothing on this path asked.
    -- Idempotent: the function decides whether the week is done.
    PERFORM league_snapshot_matchweek_ranks(v_mw_id);

    -- ok:false is kept on purpose. The TypeScript caller reads it as "not
    -- scored, not an error", which is still exactly true.
    RETURN jsonb_build_object('ok', false, 'reason', 'fixture not scoreable',
                              'status', v_status, 'scored', 0,
                              'retracted', v_retracted, 'entries', v_entries,
                              'witness_cleared', v_witness > 0);
  END IF;

  -- The result expressed as an OUTCOME, which is what a Results-depth pool is
  -- predicting. Derived here rather than stored: it is a pure function of the
  -- score, and a second stored copy is a second thing that can disagree.
  v_outcome := CASE WHEN v_home > v_away THEN 'home'
                    WHEN v_home < v_away THEN 'away'
                    ELSE 'draw' END;

  SELECT * INTO v_prev FROM league_fixture_state WHERE fixture_id = p_fixture_id;
  IF FOUND AND v_prev.home_goals = v_home AND v_prev.away_goals = v_away
     AND v_prev.is_completed = v_completed THEN
    v_changed := false;
  END IF;

  -- ------------------------------------------------------------------
  -- Per-entry scores. One statement over every pool playing this season.
  -- ------------------------------------------------------------------
  WITH priced AS (
    SELECT
      lp.entry_id,
      pm.pool_id,
      lp.predicted_home_score AS ph,
      lp.predicted_away_score AS pa,
      lp.predicted_outcome    AS pout,
      -- NULL for every pool created before migration 064, which is exactly the
      -- Scores behaviour those pools already had.
      po.league_depth         AS depth,
      COALESCE(ps.group_exact_score, 100)        AS px_exact,
      COALESCE(ps.group_correct_difference, 75)  AS px_gd,
      COALESCE(ps.group_correct_result, 50)      AS px_win,
      -- The price of a correct TAP. Deliberately the pool's top price: in a
      -- Results pool getting the outcome right is the most that can be achieved,
      -- and `group_exact_score` is otherwise unused there. Defaults to 100, which
      -- is L-C's stated default. L-D gives this its own `results_correct` column
      -- on `league_pool_settings` and this line becomes a one-word change.
      COALESCE(ps.group_exact_score, 100)        AS px_results
    FROM league_predictions lp
    JOIN pool_entries pe  ON pe.entry_id = lp.entry_id
    JOIN pool_members pm  ON pm.member_id = pe.member_id
    JOIN pools po         ON po.pool_id = pm.pool_id
    LEFT JOIN pool_settings ps ON ps.pool_id = po.pool_id
    WHERE lp.fixture_id = p_fixture_id
      -- The pool must actually play THIS season. `league_predictions` has an FK
      -- to the fixture but nothing ties that fixture to the entry's pool until
      -- the full L4 trigger lands, so it is enforced here.
      AND po.league_season_id = v_season
      -- Migration 057. A RETIRED entry does not score.
      --
      -- 056 made leaving a pool DETACH an entry (member_id -> NULL), and the
      -- inner join to pool_members two lines up drops a detached entry on its
      -- own — which is why leave, admin-removal and discard-a-spare needed no
      -- change here. `stop participating` is the door that KEEPS the
      -- membership, so member_id stays populated and that join still matches.
      -- Without this predicate a member who stopped participating carried on
      -- being scored every matchweek.
      --
      -- Their league_match_scores rows are deliberately NOT deleted: decision
      -- 15 restores a season IN FULL, so the points have to survive. This only
      -- stops NEW scoring; the leaderboard read is what hides them.
      AND pe.retired_at IS NULL
  ),
  -- Migration 066. JUDGE first, PRICE second. They used to be one CASE
  -- evaluated twice, which meant the ladder was written out twice and could
  -- drift between the two copies. Splitting them is what lets Results add a rung
  -- to the judgement without touching the pricing at all.
  judged AS (
    SELECT
      entry_id, pool_id, ph, pa, pout, depth,
      px_exact, px_gd, px_win, px_results,
      CASE
        -- RESULTS depth: one tap, right or wrong. There is no scoreline to get
        -- exactly right and no margin, so the four-rung ladder collapses to two.
        -- `exact_count` is therefore permanently 0 for these pools and the rank
        -- cascade quietly runs four rungs instead of five — expected, per L-C.
        WHEN depth = 'results' THEN
          CASE WHEN pout = v_outcome THEN 'winner' ELSE 'miss' END
        -- SCORES depth, and NULL, which is every pool predating migration 064.
        WHEN ph = v_home AND pa = v_away THEN 'exact'
        WHEN sign(ph - pa) = sign(v_home - v_away) AND (ph - pa) = (v_home - v_away) THEN 'winner_gd'
        WHEN sign(ph - pa) = sign(v_home - v_away) THEN 'winner'
        ELSE 'miss'
      END AS score_type
    FROM priced
  ),
  scored_rows AS (
    SELECT j.entry_id, j.pool_id, j.ph, j.pa, j.pout, j.score_type,
      CASE j.score_type
        WHEN 'exact'     THEN j.px_exact
        WHEN 'winner_gd' THEN j.px_gd
        -- 'winner' means two different things by depth: the whole prize in a
        -- Results pool, the bottom rung in a Scores one. Depth is fixed per pool
        -- so it is never ambiguous within one leaderboard.
        WHEN 'winner'    THEN CASE WHEN j.depth = 'results' THEN j.px_results ELSE j.px_win END
        ELSE 0
      END AS pts
    FROM judged j
  ),
  upserted AS (
    INSERT INTO league_match_scores (
      entry_id, fixture_id, pool_id, matchweek_number, fixture_number, kicked_off_at,
      score_type, base_points, total_points,
      predicted_home_score, predicted_away_score, predicted_outcome,
      actual_home_score, actual_away_score,
      calculated_at)
    SELECT entry_id, p_fixture_id, pool_id, v_mw_number, v_fx_number, v_kickoff,
           score_type, pts, pts, ph, pa, pout, v_home, v_away, now()
      FROM scored_rows
    ON CONFLICT (entry_id, fixture_id) DO UPDATE SET
      score_type           = EXCLUDED.score_type,
      base_points          = EXCLUDED.base_points,
      total_points         = EXCLUDED.total_points,
      predicted_home_score = EXCLUDED.predicted_home_score,
      predicted_away_score = EXCLUDED.predicted_away_score,
      predicted_outcome    = EXCLUDED.predicted_outcome,
      actual_home_score    = EXCLUDED.actual_home_score,
      actual_away_score    = EXCLUDED.actual_away_score,
      calculated_at        = now()
    RETURNING entry_id, pool_id
  )
  SELECT count(*) INTO v_scored FROM upserted;

  -- ------------------------------------------------------------------
  -- Totals: RECOMPUTED from the score rows, never incremented. A correction
  -- after full time must be able to take points away, which an increment
  -- cannot do.
  -- ------------------------------------------------------------------
  WITH affected AS (
    SELECT DISTINCT lms.entry_id, lms.pool_id
      FROM league_match_scores lms
     WHERE lms.fixture_id = p_fixture_id
  ),
  totals AS (
    SELECT a.entry_id, a.pool_id,
           COALESCE(sum(s.total_points), 0)::int                              AS match_points,
           COALESCE(count(*) FILTER (WHERE s.score_type = 'exact'), 0)::int    AS exact_count,
           COALESCE(count(*) FILTER (WHERE s.score_type <> 'miss'), 0)::int    AS correct_count
      FROM affected a
      LEFT JOIN league_match_scores s ON s.entry_id = a.entry_id
     GROUP BY a.entry_id, a.pool_id
  ),
  written AS (
    INSERT INTO league_entry_totals (
      entry_id, pool_id, match_points, bonus_points, point_adjustment, total_points,
      exact_count, correct_count, updated_at)
    SELECT entry_id, pool_id, match_points, 0, 0, match_points, exact_count, correct_count, now()
      FROM totals
    ON CONFLICT (entry_id) DO UPDATE SET
      pool_id          = EXCLUDED.pool_id,
      match_points     = EXCLUDED.match_points,
      -- bonus_points and point_adjustment are NOT touched: this engine owns
      -- match points only, and an admin adjustment must survive a re-score.
      total_points     = EXCLUDED.match_points
                         + league_entry_totals.bonus_points
                         + league_entry_totals.point_adjustment,
      exact_count      = EXCLUDED.exact_count,
      correct_count    = EXCLUDED.correct_count,
      updated_at       = now()
    RETURNING entry_id
  )
  SELECT count(*) INTO v_entries FROM written;

  -- The witness records what was ACTUALLY scored. `status` used to be hardcoded
  -- 'completed', which was harmless while only finished fixtures scored and is
  -- now wrong: migration 061's snapshot guard reads `is_completed` from this row
  -- to decide whether a matchweek is fully scored, so a live fixture must leave
  -- a witness that says so.
  INSERT INTO league_fixture_state (fixture_id, home_goals, away_goals, status, is_completed, scored_at)
  VALUES (p_fixture_id, v_home, v_away, v_status, v_completed, now())
  ON CONFLICT (fixture_id) DO UPDATE SET
    home_goals = EXCLUDED.home_goals, away_goals = EXCLUDED.away_goals,
    status = EXCLUDED.status, is_completed = EXCLUDED.is_completed, scored_at = now();

  -- ------------------------------------------------------------------
  -- Ranks, the movement snapshot, and the outbox.
  --
  -- Ranking happens HERE, in SQL, immediately after the totals it ranks —
  -- per the architecture rule, the backend computes and stores once and the
  -- frontends only display. A leaderboard that ranks at read time is the
  -- read-saturation bug this product already paid for once.
  -- ------------------------------------------------------------------
  FOR v_pool IN
    SELECT DISTINCT lms.pool_id FROM league_match_scores lms WHERE lms.fixture_id = p_fixture_id
  LOOP
    PERFORM league_finalize_ranks(v_pool);

    -- One row per (pool, fixture, kind) while unprocessed — the partial unique
    -- index enforces it, so a re-score does not queue the same work twice.
    INSERT INTO league_score_events (pool_id, fixture_id, kind)
    VALUES (v_pool, p_fixture_id, 'fixture_scored')
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Freeze the movement arrows if this fixture finished its matchweek. Called
  -- unconditionally and idempotent: the function itself decides whether the
  -- matchweek is complete and whether it has already been snapshotted.
  PERFORM league_snapshot_matchweek_ranks(v_mw_id);

  RETURN jsonb_build_object(
    'ok', true,
    'fixture_id', p_fixture_id,
    'matchweek', v_mw_number,
    'result', format('%s-%s', v_home, v_away),
    -- `changed` distinguishes "scored again because the result moved" from
    -- "re-scored an unchanged result". Both write; only one is interesting.
    'changed', v_changed,
    'scored', v_scored,
    'entries', v_entries);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.league_score_fixture(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.league_score_fixture(uuid) TO service_role;

COMMENT ON FUNCTION public.league_score_fixture(uuid) IS
  'Scores one league fixture into league_match_scores, league_entry_totals and the '
  'league_fixture_state witness, then re-ranks and queues fixture_scored. Live fixtures '
  'score provisionally (063). Since 187 a fixture that is scheduled, postponed or '
  'cancelled has its rows, its totals contribution and its witness RETRACTED, so the '
  'score rows always describe what the fixture is now. A live/completed fixture with a '
  'NULL goal changes nothing. Idempotent. Migrations 055, 057, 059, 063, 066, 187.';


-- =============================================================
-- THE TRIGGER — 126's function, minus the goals filter
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
       -- 187. NO GOALS FILTER. 126 skipped any row whose NEW goals were NULL
       -- ("no goals, nothing to score"), which was true while the engine only
       -- ever added. It retracts now too, and a match called off with its
       -- goals blanked is exactly the row that filter dropped. The engine
       -- decides; this only notices that something moved. Still the score,
       -- the status and the completion only, never the clock.
  LOOP
    BEGIN
      -- The engine owns every rule about WHETHER to score, and now whether to
      -- take a score back. Neither is duplicated here.
      PERFORM league_score_fixture(f.fixture_id);
    EXCEPTION WHEN OTHERS THEN
      -- ⚠ Swallowed BY DESIGN (126): raising here would roll back the feed's
      -- own write. Visible in the Postgres log, and the next change to this
      -- fixture tries again.
      RAISE WARNING 'score_league_fixture_on_change: fixture % failed: %',
        f.fixture_id, SQLERRM;
    END;
  END LOOP;

  RETURN NULL;
END;
$fn$;

COMMENT ON FUNCTION public.score_league_fixture_on_change() IS
  'Scores a league fixture the moment its score, status or completion changes, '
  'from inside the database (126), and since 187 takes the score back out when '
  'the fixture stops being live or completed. Fires on any change to goals, '
  'status or completion, including goals going NULL, and never on live_minute. '
  'Errors are warned and swallowed: raising would roll back the feed write the '
  'trigger is reacting to. Idempotent and duplicated by the sync''s own call, '
  'deliberately. Migrations 126, 187.';

-- The trigger itself (126) is unchanged: AFTER UPDATE, statement level, both
-- transition tables. CREATE OR REPLACE keeps it pointing at the new body.

-- =============================================================
-- BACKFILL — every fixture that is not live or completed but still carries
-- score rows or a witness
-- =============================================================
-- As of 2026-10-10 that is two, and neither moves anyone's points:
--   · Rayo Vallecano v Athletic Club (1570410), cancelled/abandoned:
--     one 0-point miss in Test La Liga, and a "live 0–0" witness
--   · Arsenal v Manchester City (1557477), Premier League, scheduled for
--     29 Nov: no rows, but a witness saying "completed 2–1", written on
--     24 Aug for a match not yet played. Origin unknown; not the 094 verify
--     script, which uses a scratch season.

DO $bf$
DECLARE
  r     record;
  v_res jsonb;
  v_n   int := 0;
  v_left int;
BEGIN
  FOR r IN
    SELECT f.fixture_id, f.external_fixture_id, f.status
      FROM league_fixtures f
     WHERE f.status NOT IN ('live', 'completed')
       AND (EXISTS (SELECT 1 FROM league_match_scores s WHERE s.fixture_id = f.fixture_id)
         OR EXISTS (SELECT 1 FROM league_fixture_state w WHERE w.fixture_id = f.fixture_id))
     ORDER BY f.kickoff_at
  LOOP
    v_res := league_score_fixture(r.fixture_id);
    v_n := v_n + 1;
    RAISE NOTICE '187 backfill: % (%, %) -> %',
      r.external_fixture_id, r.fixture_id, r.status, v_res;
  END LOOP;

  -- Self-check. If anything is still left, the rule above does not hold and
  -- the whole migration rolls back rather than half-applying.
  SELECT count(*) INTO v_left
    FROM league_fixtures f
   WHERE f.status NOT IN ('live', 'completed')
     AND (EXISTS (SELECT 1 FROM league_match_scores s WHERE s.fixture_id = f.fixture_id)
       OR EXISTS (SELECT 1 FROM league_fixture_state w WHERE w.fixture_id = f.fixture_id));
  IF v_left > 0 THEN
    RAISE EXCEPTION '187 backfill: % fixture(s) still carry a score after retraction', v_left;
  END IF;

  RAISE NOTICE '187 backfill: % fixture(s) retracted, 0 left', v_n;
END
$bf$;

-- =============================================================
-- VERIFY
-- =============================================================
--   npx tsx scripts/verify-abandoned-fixture-retraction.ts  -- this migration
--   npx tsx scripts/verify-postponed-fixtures.ts            -- 094 unchanged
--   npx tsx scripts/verify-league-leaderboard.ts            -- ranks/arrows/outbox unchanged
--
--   -- nothing that is not live or completed carries a score:
--   SELECT count(*) FROM league_fixtures f
--    WHERE f.status NOT IN ('live','completed')
--      AND (EXISTS (SELECT 1 FROM league_match_scores s WHERE s.fixture_id = f.fixture_id)
--        OR EXISTS (SELECT 1 FROM league_fixture_state w WHERE w.fixture_id = f.fixture_id));
--   -- expect 0
