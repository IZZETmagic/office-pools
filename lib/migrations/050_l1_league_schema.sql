-- Migration 050 (L1): the Premier League backend — nine purpose-built tables.
--
-- The first phase that BUILDS. L0 (048, 049) restored the World Cup and closed
-- the holes; this creates the league's own structure beside it. Nothing here
-- touches a World Cup table, function, trigger or policy.
--
-- Design: drafts/2026-08-22_premier_league_backend_design_v3_1.md §1, whose
-- base DDL is carried from v2 §1 with deltas in v3 §1.4a and v3.1 §1.3a.
-- Assembled here into one authoritative artifact, because a DDL spread across
-- three documents is itself a defect source.
--
-- ============================================================
-- WHAT A LEAGUE IS, IN THE SHAPE OF THE SCHEMA
-- ============================================================
-- 20 clubs, each playing every other twice, home and away, across 38
-- matchweeks, ending in a table. Nothing advances; nothing is a placeholder.
-- So: no `stage`, no `group_letter`, no `*_placeholder`, no `winner_team_id`,
-- no penalty-shootout columns. A club is a club — `name`, `short_name`,
-- `abbreviation`, `crest_url` — not a country with a flag.
--
-- Two shape decisions carried from the design and not compromised:
--
--   * `league_fixtures.matchweek_id` is a hard FK, not an integer. As an
--     ordinal it would need re-scoping by season and phase on every query,
--     which is the three-predicate dance the World Cup path needs today.
--   * `fixture_number` is display and tiebreak only, NEVER chronology. Leagues
--     reschedule, and six fixtures kick off simultaneously at Saturday 15:00.
--     The ordering key is the pair (kicked_off_at DESC, fixture_number DESC),
--     carried on the score row.
--
-- ============================================================
-- DELIBERATELY DEFERRED, WITH REASONS
-- ============================================================
--   * `assert_league_prediction_pool` — its body reads `pools.league_season_id`,
--     which L4 adds. PL/pgSQL binds columns at RUNTIME, so creating it now
--     would succeed and then raise on the first league prediction. This is the
--     defect class that has appeared five times in this project; here it is
--     avoided by ordering. It lands in L4 with the column.
--   * `broadcast_pool_leaderboard()`'s corrected body and its two league
--     triggers — that edits a function attached to a live World Cup table and
--     carries a mandatory pre-attach test. L7.
--   * `league_bonus_scores` — a league writes zero bonus rows in v1. A table
--     with no writer invites one. It arrives with Final Table.
--
-- Fully reversible: DROP TABLE. Nothing references these yet.
--
-- ============================================================
-- APPLIED 2026-08-22 as 050a (tables) + 050b (triggers, RLS)
-- ============================================================
-- Split into two migrations so a failure isolates. Verified after:
--
--   9 tables, RLS enabled on all 9
--   8 policies  — 4 calendar SELECT USING (true), 4 transcribed from `predictions`
--   8 triggers  — 1 lock, 3 matchweek-window, 4 updated_at
--   33 indexes, 12 CHECK constraints
--   deny-all (RLS on, zero policies) on exactly: league_match_scores,
--     league_entry_totals, league_fixture_state, league_score_events
--   World Cup untouched: 104 matches, shadow sum 12,840,082
--
-- EXERCISED against a throwaway season, then deleted. Not "the tables exist" —
-- the constraints and triggers were made to do their jobs:
--
--   window trigger      fixture #1 kicks off 15:00, fixture #2 at 12:30;
--                       lock_at correctly resolved to 12:30 — the earlier
--                       KICKOFF, not the lower fixture_number. This is the
--                       whole reason fixture_number is not chronology.
--   ordinal collision   two rounds sharing provider_round -> 23505 unique violation
--   open but empty      lock_at set with fixture_count 0 -> 23514
--   club plays itself   -> 23514
--   completed, no score -> 23514  (`matches` permits exactly this)
--   half a scoreline    -> 23514
--   lock, open          pick accepted (1 row)
--   lock, passed        pick SILENTLY skipped (0 rows) — the designed behaviour
--   freeze invariant    a passed lock stayed passed after the fixture was
--                       rescheduled a day later
--
-- Cleanup verified: all nine league tables back to 0 rows, World Cup and
-- pool_entries untouched.

BEGIN;

-- ============================================================ 1. Season
CREATE TABLE league_seasons (
  season_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_slug      text        NOT NULL,   -- 'premier-league'
  competition_name      text        NOT NULL,   -- 'Premier League'
  season_label          text        NOT NULL,   -- '2026/27'
  season_start_year     integer     NOT NULL,
  country_code          char(3)     NOT NULL,   -- 'ENG'
  club_count            integer     NOT NULL,
  matchweek_count       integer     NOT NULL,
  first_kickoff_at      timestamptz,
  last_kickoff_at       timestamptz,
  logo_url              text,
  external_provider     text        NOT NULL DEFAULT 'api_football',
  external_league_id    integer     NOT NULL,   -- 39
  external_season       integer     NOT NULL,   -- 2026
  regular_season_phase  text        NOT NULL,   -- the feed's own string, verbatim
  imported_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_seasons_provider_key  UNIQUE (external_provider, external_league_id, external_season),
  CONSTRAINT league_seasons_slug_year_key UNIQUE (competition_slug, season_start_year),
  CONSTRAINT league_seasons_clubs_ck      CHECK (club_count BETWEEN 4 AND 30),
  CONSTRAINT league_seasons_mw_ck         CHECK (matchweek_count BETWEEN 1 AND 60)
);

COMMENT ON TABLE league_seasons IS
  'One competition instance (Premier League 2026/27). No status column on purpose: competition state is date-computed, never authored — tournaments.status still read ''upcoming'' a month after the World Cup final.';

-- ============================================================ 2. Clubs
CREATE TABLE league_clubs (
  club_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id        uuid    NOT NULL REFERENCES league_seasons(season_id) ON DELETE CASCADE,
  name             text    NOT NULL,      -- 'Manchester United'
  short_name       text    NOT NULL,      -- 'Man Utd'
  abbreviation     char(3) NOT NULL,      -- 'MUN'
  crest_url        text,
  external_club_id integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_clubs_season_ext_key  UNIQUE (season_id, external_club_id),
  CONSTRAINT league_clubs_season_abbr_key UNIQUE (season_id, abbreviation),
  CONSTRAINT league_clubs_season_name_key UNIQUE (season_id, name)
);
CREATE INDEX idx_league_clubs_season ON league_clubs(season_id);

COMMENT ON TABLE league_clubs IS
  'Clubs in one season. Replaces storing "Arsenal" in teams.country_name with a 3-char code in teams.country_code.';

-- ============================================================ 3. Matchweeks
CREATE TABLE league_matchweeks (
  matchweek_id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id               uuid    NOT NULL REFERENCES league_seasons(season_id) ON DELETE CASCADE,
  matchweek_number        integer NOT NULL,
  label                   text    NOT NULL,          -- 'Matchweek 7'
  provider_round          text    NOT NULL,          -- 'Regular Season - 7', verbatim
  fixture_count           integer NOT NULL DEFAULT 0,
  completed_fixture_count integer NOT NULL DEFAULT 0,
  first_kickoff_at        timestamptz,
  last_kickoff_at         timestamptz,
  lock_at                 timestamptz,               -- first kickoff, then FROZEN
  ranks_snapshot_at       timestamptz,               -- v3.1 §1.3a
  open_notified_at        timestamptz,
  lock_reminder_sent_at   timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_matchweeks_season_no_key    UNIQUE (season_id, matchweek_number),
  CONSTRAINT league_matchweeks_season_round_key UNIQUE (season_id, provider_round),
  CONSTRAINT league_matchweeks_no_ck            CHECK (matchweek_number BETWEEN 1 AND 60),
  CONSTRAINT league_matchweeks_empty_has_no_lock_ck
    CHECK ((fixture_count = 0) = (lock_at IS NULL))
);
CREATE INDEX idx_league_matchweeks_season_no ON league_matchweeks(season_id, matchweek_number);
CREATE INDEX idx_league_matchweeks_lock      ON league_matchweeks(season_id, lock_at);

COMMENT ON CONSTRAINT league_matchweeks_season_round_key ON league_matchweeks IS
  'Structurally kills the ordinal-collision class. Belgium and Scotland split into parallel groups that reuse each other''s round numbers; two rounds sharing an ordinal cannot both exist here. The importer''s procedural guard becomes declarative.';
COMMENT ON CONSTRAINT league_matchweeks_empty_has_no_lock_ck ON league_matchweeks IS
  'Makes "open but empty" a constraint violation rather than a plausible render — the silent-emptiness class this project keeps producing.';
COMMENT ON COLUMN league_matchweeks.lock_at IS
  'The deadline: the matchweek''s first kickoff, frozen once passed. Stored, not computed — the World Cup path recomputes MIN(match_date) on every prediction write.';

-- ============================================================ 4. Fixtures
CREATE TABLE league_fixtures (
  fixture_id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id             uuid    NOT NULL REFERENCES league_seasons(season_id)       ON DELETE CASCADE,
  matchweek_id          uuid    NOT NULL REFERENCES league_matchweeks(matchweek_id) ON DELETE CASCADE,
  fixture_number        integer NOT NULL,
  home_club_id          uuid    NOT NULL REFERENCES league_clubs(club_id),
  away_club_id          uuid    NOT NULL REFERENCES league_clubs(club_id),
  kickoff_at            timestamptz NOT NULL,
  original_kickoff_at   timestamptz,
  venue                 text,
  home_goals            integer,
  away_goals            integer,
  status                text    NOT NULL DEFAULT 'scheduled',
  status_detail         text,
  live_minute           integer,
  live_period           text,
  live_added            integer,
  is_completed          boolean NOT NULL DEFAULT false,
  completed_at          timestamptz,
  external_fixture_id   text    NOT NULL,
  last_synced_at        timestamptz,
  result_pushes_sent_at timestamptz,
  manual_override       boolean NOT NULL DEFAULT false,               -- v3 §1.4a
  manual_override_by    uuid REFERENCES users(user_id),               -- v3 §1.4a
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_fixtures_season_ext_key UNIQUE (season_id, external_fixture_id),
  CONSTRAINT league_fixtures_season_num_key UNIQUE (season_id, fixture_number),
  CONSTRAINT league_fixtures_clubs_ck       CHECK (home_club_id <> away_club_id),
  CONSTRAINT league_fixtures_status_ck      CHECK (status IN ('scheduled','live','completed','postponed','cancelled')),
  CONSTRAINT league_fixtures_result_pair_ck CHECK ((home_goals IS NULL) = (away_goals IS NULL)),
  CONSTRAINT league_fixtures_completed_ck   CHECK (NOT is_completed OR home_goals IS NOT NULL)
);
CREATE INDEX idx_league_fixtures_mw     ON league_fixtures(matchweek_id, kickoff_at, fixture_number);
CREATE INDEX idx_league_fixtures_season ON league_fixtures(season_id, kickoff_at, fixture_number);
CREATE INDEX idx_league_fixtures_open   ON league_fixtures(season_id, kickoff_at) WHERE NOT is_completed;

COMMENT ON COLUMN league_fixtures.fixture_number IS
  'Display and tiebreak ONLY — not chronology. Leagues reschedule and six fixtures share a Saturday 15:00 kickoff. Order by (kicked_off_at DESC, fixture_number DESC).';
COMMENT ON CONSTRAINT league_fixtures_completed_ck ON league_fixtures IS
  'matches permits is_completed=true with NULL scores. This does not.';
-- NOTE: manual_override_by carries a FK to users, which the design left as a
-- bare uuid. Deliberate, for consistency with pools.archived_by (migration 040).

-- ============================================================ 5. Predictions
CREATE TABLE league_predictions (
  prediction_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id             uuid NOT NULL REFERENCES pool_entries(entry_id)      ON DELETE CASCADE,
  fixture_id           uuid NOT NULL REFERENCES league_fixtures(fixture_id) ON DELETE CASCADE,
  predicted_home_score integer NOT NULL,
  predicted_away_score integer NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_predictions_entry_fixture_key UNIQUE (entry_id, fixture_id),
  CONSTRAINT league_predictions_home_ck CHECK (predicted_home_score BETWEEN 0 AND 20),
  CONSTRAINT league_predictions_away_ck CHECK (predicted_away_score BETWEEN 0 AND 20)
);
CREATE INDEX idx_league_predictions_fixture   ON league_predictions(fixture_id);
CREATE INDEX idx_league_predictions_entry_upd ON league_predictions(entry_id, updated_at DESC);

COMMENT ON TABLE league_predictions IS
  'League picks. Same natural key and cascade semantics as predictions_entry_id_match_id_key, so every counting query is a two-token repoint. ⚠ Every existing reader of `predictions` sees NOTHING for a league entry — that is the fork''s central hazard, handled by the containment trigger in L4.';

-- ============================================================ 6. Match scores
CREATE TABLE league_match_scores (
  entry_id             uuid    NOT NULL REFERENCES pool_entries(entry_id)      ON DELETE CASCADE,
  fixture_id           uuid    NOT NULL REFERENCES league_fixtures(fixture_id) ON DELETE CASCADE,
  pool_id              uuid    NOT NULL REFERENCES pools(pool_id)              ON DELETE CASCADE,
  matchweek_number     integer NOT NULL,
  fixture_number       integer NOT NULL,
  kicked_off_at        timestamptz NOT NULL,
  score_type           text    NOT NULL,
  base_points          integer NOT NULL,
  total_points         integer NOT NULL,
  predicted_home_score integer NOT NULL,
  predicted_away_score integer NOT NULL,
  actual_home_score    integer NOT NULL,
  actual_away_score    integer NOT NULL,
  calculated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, fixture_id),
  CONSTRAINT league_match_scores_type_ck
    CHECK (score_type IN ('exact','winner_gd','winner','miss'))
);
CREATE INDEX idx_lms_entry_chron ON league_match_scores(entry_id, kicked_off_at DESC, fixture_number DESC);
CREATE INDEX idx_lms_pool_calc   ON league_match_scores(pool_id, calculated_at DESC);
CREATE INDEX idx_lms_fixture     ON league_match_scores(fixture_id);

COMMENT ON CONSTRAINT league_match_scores_type_ck ON league_match_scores IS
  'Identical four-value vocabulary to shadow_match_scores_score_type_check. Every downstream consumer buckets on these exact strings; a league must not invent a fifth outcome.';

-- ============================================================ 7. Entry totals
CREATE TABLE league_entry_totals (
  entry_id            uuid PRIMARY KEY REFERENCES pool_entries(entry_id) ON DELETE CASCADE,
  pool_id             uuid    NOT NULL REFERENCES pools(pool_id) ON DELETE CASCADE,
  match_points        integer NOT NULL DEFAULT 0,
  bonus_points        integer NOT NULL DEFAULT 0,
  point_adjustment    integer NOT NULL DEFAULT 0,
  total_points        integer NOT NULL DEFAULT 0,
  final_rank          integer,
  previous_final_rank integer,
  exact_count         integer NOT NULL DEFAULT 0,
  correct_count       integer NOT NULL DEFAULT 0,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_let_pool ON league_entry_totals(pool_id);

COMMENT ON TABLE league_entry_totals IS
  'Column names are load-bearing: they are the identifiers broadcast_pool_leaderboard() dereferences off its transition table. Match them and the realtime leaderboard is inherited unchanged; rename one and the trigger raises at runtime.';

-- ============================================================ 8. Fixture state
CREATE TABLE league_fixture_state (
  fixture_id   uuid PRIMARY KEY REFERENCES league_fixtures(fixture_id) ON DELETE CASCADE,
  home_goals   integer,
  away_goals   integer,
  status       text,
  is_completed boolean,
  scored_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE league_fixture_state IS 'The reconciler''s diff mirror. shadow_match_state''s role, own table.';

-- ============================================================ 9. Outbox
CREATE TABLE league_score_events (
  event_id     bigserial PRIMARY KEY,
  pool_id      uuid NOT NULL REFERENCES pools(pool_id)              ON DELETE CASCADE,
  fixture_id   uuid NOT NULL REFERENCES league_fixtures(fixture_id) ON DELETE CASCADE,
  kind         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  claimed_at   timestamptz,
  processed_at timestamptz,
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  CONSTRAINT league_score_events_kind_ck CHECK (kind IN ('fixture_scored','pool_rescored'))
);
CREATE UNIQUE INDEX uq_lse_pending ON league_score_events (pool_id, fixture_id, kind) WHERE processed_at IS NULL;
CREATE INDEX idx_lse_pending ON league_score_events (created_at) WHERE processed_at IS NULL;

COMMENT ON TABLE league_score_events IS
  'Outbox giving side effects an owner: SQL cannot call TypeScript, so XP, badges, result pushes and cache invalidation need a durable handoff. Not a second source of truth — scoring is committed before the event exists, and a lost row costs a push, never a point.';

-- ============================================================ Triggers
-- The lock. Silent-skip, mirroring enforce_prediction_before_kickoff, because
-- mobile writes predictions directly through PostgREST and a RAISE surfaces
-- there as an opaque failure. The API layer makes it loud by comparing the
-- returned row count to the request (design §7.2).
-- GUARD RULE: reads league_fixtures.is_completed and league_matchweeks.lock_at.
-- Both columns exist above; neither table is a World Cup table.
CREATE FUNCTION enforce_league_prediction_before_lock() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE v_lock timestamptz; v_done boolean;
BEGIN
  SELECT mw.lock_at, f.is_completed INTO v_lock, v_done
    FROM league_fixtures f
    JOIN league_matchweeks mw ON mw.matchweek_id = f.matchweek_id
   WHERE f.fixture_id = NEW.fixture_id;
  IF v_done IS TRUE THEN RETURN NULL; END IF;
  IF v_lock IS NOT NULL AND v_lock <= now() THEN RETURN NULL; END IF;
  RETURN NEW;
END; $fn$;

CREATE TRIGGER trg_enforce_league_prediction_before_lock
  BEFORE INSERT OR UPDATE ON league_predictions
  FOR EACH ROW EXECUTE FUNCTION enforce_league_prediction_before_lock();

-- Matchweek window. LEFT JOIN from the matchweek side on purpose: an INNER
-- join drops a matchweek that just lost its last fixture, leaving
-- fixture_count stale-nonzero forever.
-- GUARD RULE: reads only league_fixtures and league_matchweeks columns above.
CREATE FUNCTION refresh_league_matchweek_window() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  UPDATE league_matchweeks mw SET
    first_kickoff_at        = agg.first_k,
    last_kickoff_at         = agg.last_k,
    fixture_count           = COALESCE(agg.n, 0),
    completed_fixture_count = COALESCE(agg.done, 0),
    lock_at    = CASE WHEN mw.lock_at IS NULL OR mw.lock_at > now()
                      THEN agg.first_k ELSE mw.lock_at END,
    updated_at = now()
  FROM league_matchweeks m2
  LEFT JOIN LATERAL (
    SELECT min(f.kickoff_at) AS first_k, max(f.kickoff_at) AS last_k,
           count(*) AS n, count(*) FILTER (WHERE f.is_completed) AS done
      FROM league_fixtures f WHERE f.matchweek_id = m2.matchweek_id
  ) agg ON true
  WHERE mw.matchweek_id = m2.matchweek_id
    AND (mw.first_kickoff_at, mw.last_kickoff_at, mw.fixture_count, mw.completed_fixture_count)
        IS DISTINCT FROM (agg.first_k, agg.last_k, COALESCE(agg.n,0), COALESCE(agg.done,0));
  RETURN NULL;
END; $fn$;

CREATE TRIGGER trg_refresh_league_matchweek_window_ins
  AFTER INSERT ON league_fixtures FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_league_matchweek_window();
CREATE TRIGGER trg_refresh_league_matchweek_window_upd
  AFTER UPDATE OF kickoff_at, is_completed ON league_fixtures FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_league_matchweek_window();
CREATE TRIGGER trg_refresh_league_matchweek_window_del
  AFTER DELETE ON league_fixtures FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_league_matchweek_window();

-- updated_at, reusing the existing shared helper.
CREATE TRIGGER update_league_seasons_updated_at     BEFORE UPDATE ON league_seasons     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_league_matchweeks_updated_at  BEFORE UPDATE ON league_matchweeks  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_league_fixtures_updated_at    BEFORE UPDATE ON league_fixtures    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_league_predictions_updated_at BEFORE UPDATE ON league_predictions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================ RLS
ALTER TABLE league_seasons        ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_clubs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_matchweeks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_fixtures       ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_predictions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_match_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_entry_totals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_fixture_state  ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_score_events   ENABLE ROW LEVEL SECURITY;

-- Calendar tables: world-readable, mirroring the live matches / teams policies.
CREATE POLICY "League seasons are viewable by everyone"    ON league_seasons    FOR SELECT USING (true);
CREATE POLICY "League clubs are viewable by everyone"      ON league_clubs      FOR SELECT USING (true);
CREATE POLICY "League matchweeks are viewable by everyone" ON league_matchweeks FOR SELECT USING (true);
CREATE POLICY "League fixtures are viewable by everyone"   ON league_fixtures   FOR SELECT USING (true);

-- Predictions: the four `predictions` policies, transcribed with entry_id
-- repointed. Read live from pg_policy rather than reconstructed. The
-- predictions_locked / archived_at conditions carry over unchanged.
-- These are launch-blocking, not hardening: deny-all is what mobile's anon
-- client hits, and both the empty read and the 400 on write are discarded.
CREATE POLICY "Users can view own league predictions" ON league_predictions FOR SELECT USING (
  EXISTS (SELECT 1 FROM pool_entries pe
            JOIN pool_members pm ON pe.member_id = pm.member_id
            JOIN users u         ON pm.user_id   = u.user_id
           WHERE pe.entry_id = league_predictions.entry_id
             AND u.auth_user_id = (SELECT auth.uid())));

CREATE POLICY "Pool admins can view all league predictions" ON league_predictions FOR SELECT USING (
  EXISTS (SELECT 1 FROM pool_entries pe
            JOIN pool_members pm ON pe.member_id = pm.member_id
           WHERE pe.entry_id = league_predictions.entry_id
             AND is_pool_admin(pm.pool_id)));

CREATE POLICY "Users can insert league predictions" ON league_predictions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM pool_entries pe
            JOIN pool_members pm ON pe.member_id = pm.member_id
            JOIN users u         ON pm.user_id   = u.user_id
            JOIN pools po        ON po.pool_id   = pm.pool_id
           WHERE pe.entry_id = league_predictions.entry_id
             AND u.auth_user_id = (SELECT auth.uid())
             AND pe.predictions_locked = false
             AND po.archived_at IS NULL));

CREATE POLICY "Users can update own league predictions" ON league_predictions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM pool_entries pe
            JOIN pool_members pm ON pe.member_id = pm.member_id
            JOIN users u         ON pm.user_id   = u.user_id
            JOIN pools po        ON po.pool_id   = pm.pool_id
           WHERE pe.entry_id = league_predictions.entry_id
             AND u.auth_user_id = (SELECT auth.uid())
             AND pe.predictions_locked = false
             AND po.archived_at IS NULL));

-- Scoring tables: RLS on, NO policies — deny-all, service-role only.
-- Mirrors shadow_match_scores.

COMMIT;
