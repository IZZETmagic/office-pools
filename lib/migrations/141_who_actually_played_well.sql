-- =============================================================
-- 141 — WHO ACTUALLY PLAYED WELL
-- =============================================================
-- ⚠ ADDITIVE ONLY. One new table, its indexes, constraints and policy. No
-- existing table, column, function or policy is touched, so there is no
-- `md5(prosrc)` pre-check to run before applying this.
--
-- ⚠⚠ APPLY THIS BEFORE DEPLOYING THE CODE THAT NAMES IT. `syncLeagueFixtures`
-- gains a write to `match_player_stats`; if that ships first, PostgREST rejects
-- the ENTIRE payload for naming a relation that does not exist. 136, 139 and
-- 140 all carry this warning for the same reason; it is not boilerplate.
--
-- WHY NOW, AND WHY IT COSTS NOTHING
--   ⭐ WE HAVE BEEN PAYING FOR THIS DATA SINCE THE BATCHING LANDED AND THROWING
--   IT AWAY. `/fixtures?ids=` bundles `players` alongside `events`, `lineups`
--   and `statistics` — forty players per fixture, each with a rating, minutes,
--   shots, passes, tackles, duels, saves and cards. `ApiFootballFixture.players`
--   has been typed `unknown[]` and read by nothing. This migration adds a table
--   to put it in. It adds ZERO api-football calls: the bytes already arrive in
--   a response we already make, twenty fixtures at a time.
--
-- WHY A REAL TABLE AND NOT JSONB
--   139 chose jsonb for `match_lineups.players` and gave two reasons: a line-up
--   is written and read WHOLE, and this product had no player entity. Neither
--   holds here. These rows are the input to questions that span fixtures —
--   who has the best average rating this season, who has played the most
--   minutes, who is top of the assists — and a jsonb blob cannot be indexed for
--   any of them without a lateral unnest per row. The shape is also FIXED,
--   which is the other half of the argument: sampled across 920 player-rows in
--   two competitions, every single one carried the same eleven stat groups.
--   That is the opposite of `match_team_stats`, where the type set genuinely
--   varies by fixture and named columns were the risk rather than the safe bet.
--
-- ⚠ `external_player_id` IS THE PROVIDER'S ID, AND THERE IS NO FK ON IT. This
--   product still has no `players` table — "Player detail page" is an unstarted
--   backlog item — so the provider's id is the only stable identity available.
--   When a player entity does arrive, this column is what it joins on, and
--   adding the FK is a migration rather than a rewrite. Verified unique per
--   fixture across the whole sample: 920 rows, ZERO duplicate
--   (fixture, external_player_id) pairs, and `statistics` is always length 1.
--
-- THE THREE TRAPS IN THE PAYLOAD, ALL MEASURED 2026-09-09
--   ⚠⚠ `passes.accuracy` IS A COUNT AT PLAYER LEVEL, NOT A PERCENTAGE — the
--      opposite of `match_team_stats.passes_pct`, where the provider sends
--      '83%'. Checked on 604 rows carrying both: not one had accuracy greater
--      than total, and a goalkeeper reads total 27 / accuracy 17. Naming this
--      column `passes_pct` would have stored 17 as "17%" of a 27-pass game and
--      looked entirely plausible on screen. It is `passes_accurate`.
--   ⚠ `games.rating` ARRIVES AS A STRING — '7', '7.5', '10' — and is null for
--      199 of 800 sampled rows (unused substitutes). Range measured 4.9 to
--      10.0, so numeric(3,1) holds it exactly.
--   ⚠ THE PROVIDER MISSPELLS `penalty.commited`. One 't'. The mapper reads the
--      provider's spelling and the column here uses the correct one; anything
--      that "fixes" the mapper's key to match this column silently stores NULL.
--
-- ⚠⚠ THE TIMELINE IS AUTHORITATIVE FOR GOALS, NOT THIS TABLE. The two disagree
--   at the SOURCE, and measured on the first full backfill it is rare but real:
--   428 goals credited to players against 430 in `match_events`, across 146
--   fixtures. Borussia Dortmund 2-0 Hamburger SV (1575142) is the clean
--   example — the timeline has Guirassy 9' and Konstantelias 45', the scoreline
--   says 2-0, and Konstantelias's own player row carries no goal at all.
--   ⇒ ANY "top scorer" FEATURE MUST COUNT `match_events`, WHICH RECONCILES TO
--   THE SCORELINE ON ALL 146 FIXTURES. Read `goals` here only as one player's
--   line in one match, never as a season aggregate.
--
-- ⚠ NULL MEANS "NOT RECORDED", AND MOST COLUMNS ARE MOSTLY NULL. The feed sends
--   null rather than 0 for a stat a player did not register: `shots.total` is
--   null on 560 of 800 rows, `dribbles.attempts` on 502. A defender with no
--   shots gets null, not zero. Rendering these as 0 is usually right; SUMMING
--   them is right either way, since NULL sums as absent. But COUNTING non-null
--   rows to mean "players who took a shot" is only correct because of this.
--
-- ✅ APPLIED TO PRODUCTION 2026-09-09 (ujthamlehjyubbzxbnes). VERIFY run: 5
--    indexes, RLS on with one authenticated SELECT policy, and every guard bit
--    with 23514 — the XOR, an accuracy of 83 on 27 passes, a rating of 11, a
--    position of 'ST'. `replace_match_player_stats` is EXECUTE-able by
--    service_role only (anon and authenticated explicitly revoked, the lesson
--    from 140).
--
-- ✅ BACKFILLED 2026-09-09: 6,312 rows across all 146 completed fixtures, in
--    TEN api calls — the data was already inside the bundle. Ratings run 3.0 to
--    10.0, mean 6.84; no sentinel rows and no impossible pass counts stored.
--
--    ⚠ TWO REAL BUGS THE FIRST RUN FOUND, both now guarded in the mapper:
--      · `player.id = 0` is a SENTINEL and REPEATS — Marseille v Paris FC
--        (1552751) carried two id-0 players, and the unique index refused the
--        second. A 920-row sample had shown none.
--      · A rating of `0` means UNRATED, not a rating of zero. 50 rows arrived
--        that way; 44 never played and the other 6 were 1-minute cameos.
--        Storing them would have dragged every average down with phantoms.
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS match_player_stats (
  player_stat_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ⚠ THE SAME XOR AS 136 AND 139. A row belongs to a World Cup match or to a
  -- league fixture, never both and never neither. The league arm is the only
  -- one that writes today.
  match_id            uuid REFERENCES matches(match_id) ON DELETE CASCADE,
  fixture_id          uuid REFERENCES league_fixtures(fixture_id) ON DELETE CASCADE,
  CONSTRAINT match_player_stats_xor_ck CHECK ((match_id IS NULL) <> (fixture_id IS NULL)),

  side                text NOT NULL CHECK (side IN ('home','away')),

  -- ---- identity -----------------------------------------------------------
  external_player_id  integer NOT NULL,
  player_name         text    NOT NULL,
  shirt_number        integer,
  position            text CHECK (position IN ('G','D','M','F')),
  is_starter          boolean NOT NULL,
  is_captain          boolean NOT NULL,

  -- ---- the two everybody looks at first ------------------------------------
  minutes             integer CHECK (minutes IS NULL OR minutes BETWEEN 0 AND 200),
  rating              numeric(3,1) CHECK (rating IS NULL OR rating BETWEEN 0 AND 10),

  -- ---- attacking -----------------------------------------------------------
  goals               integer,
  assists             integer,
  shots_total         integer,
  shots_on            integer,
  offsides            integer,
  dribbles_attempts   integer,
  dribbles_success    integer,
  penalty_won         integer,
  penalty_scored      integer,
  penalty_missed      integer,

  -- ---- defending and goalkeeping -------------------------------------------
  goals_conceded      integer,
  saves               integer,
  tackles_total       integer,
  tackles_blocks      integer,
  interceptions       integer,
  duels_total         integer,
  duels_won           integer,
  dribbled_past       integer,
  penalty_committed   integer,   -- provider sends `commited`; see the header
  penalty_saved       integer,

  -- ---- distribution --------------------------------------------------------
  passes_total        integer,
  -- ⚠ A COUNT OF COMPLETED PASSES, NOT A PERCENTAGE. See the header.
  passes_accurate     integer,
  key_passes          integer,

  -- ---- discipline ----------------------------------------------------------
  fouls_drawn         integer,
  fouls_committed     integer,
  yellow_cards        integer,
  red_cards           integer,

  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ⚠ A COMPLETED PASS CANNOT EXCEED A PASS. The one cross-column check worth
-- having, because it is exactly what a percentage/count mix-up would violate —
-- and it would have caught the trap in the header on the first write.
ALTER TABLE match_player_stats
  ADD CONSTRAINT match_player_stats_passes_ck
  CHECK (passes_total IS NULL OR passes_accurate IS NULL OR passes_accurate <= passes_total);

ALTER TABLE match_player_stats
  ADD CONSTRAINT match_player_stats_shots_ck
  CHECK (shots_total IS NULL OR shots_on IS NULL OR shots_on <= shots_total);

ALTER TABLE match_player_stats
  ADD CONSTRAINT match_player_stats_duels_ck
  CHECK (duels_total IS NULL OR duels_won IS NULL OR duels_won <= duels_total);

-- One row per player per fixture. Replace-all makes duplicates impossible;
-- these make a double write fail LOUDLY rather than quietly doubling a total.
CREATE UNIQUE INDEX IF NOT EXISTS uq_match_player_stats_fixture_player
  ON match_player_stats(fixture_id, external_player_id) WHERE fixture_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_match_player_stats_match_player
  ON match_player_stats(match_id, external_player_id) WHERE match_id IS NOT NULL;

-- The fixture lookup the Line-ups tab will make.
CREATE INDEX IF NOT EXISTS idx_match_player_stats_fixture
  ON match_player_stats(fixture_id) WHERE fixture_id IS NOT NULL;

-- ⚠ THE CROSS-FIXTURE INDEX IS THE WHOLE REASON THIS IS NOT JSONB. "Every
-- appearance by this player" is the query a player page is made of, and without
-- this it is a sequential scan of a table that grows by 40 rows per fixture —
-- about 76,000 rows per five-league season.
CREATE INDEX IF NOT EXISTS idx_match_player_stats_player
  ON match_player_stats(external_player_id);

COMMENT ON TABLE match_player_stats IS
  'Per-player per-fixture statistics from api-football, arriving free inside the /fixtures?ids= bundle. Display-only: nothing scores from this.';
COMMENT ON COLUMN match_player_stats.passes_accurate IS
  'A COUNT of completed passes, not a percentage — unlike match_team_stats.passes_pct, which the provider sends as ''83%''.';
COMMENT ON COLUMN match_player_stats.penalty_committed IS
  'Penalties conceded. The provider spells its key `commited`, with one t.';
COMMENT ON COLUMN match_player_stats.rating IS
  'Provider rating 0-10, arriving as a string. NULL for an unused substitute.';

-- ------------------------------------------------------------------- RLS
-- ⚠ READABLE BY ANY SIGNED-IN USER, WRITABLE BY NOBODY — the same posture as
-- 136 and 139. A line-up is public information the moment it is published, and
-- nothing here is scored from, so there is no pool-scoping to do. The only
-- writer is the service role, which bypasses RLS.
ALTER TABLE match_player_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS match_player_stats_select ON match_player_stats;
CREATE POLICY match_player_stats_select
  ON match_player_stats FOR SELECT TO authenticated USING (true);

-- ------------------------------------------- the atomic replace, as 140
-- ⚠⚠ A NEW REPLACE-ALL TABLE NEEDS ITS OWN FUNCTION, OR 140 IS UNDONE FOR IT.
-- Forty rows per fixture, rewritten whole on every completion pass — exactly
-- the shape that cost fixture 1575143 its line-up on 2026-09-09 when a DELETE
-- committed and its INSERT did not. The reasoning, including why an upsert
-- cannot be used (every unique index here is partial), is in
-- `140_both_or_neither.sql`. Same posture: INVOKER, search_path pinned,
-- EXECUTE for service_role only.
--
-- ⚠ AN EMPTY SET DELETES NOTHING, as line-ups and statistics. The provider
-- holds no player statistics for some competitions at all, and going quiet for
-- a tick must not clear forty stored rows. Only the TIMELINE treats an empty
-- set as an instruction, because only VAR removes events.
CREATE OR REPLACE FUNCTION replace_match_player_stats(p_fixture_id uuid, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_written integer;
BEGIN
  IF p_fixture_id IS NULL THEN
    RAISE EXCEPTION 'replace_match_player_stats: p_fixture_id is required';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'replace_match_player_stats: p_rows must be a json array, got %',
      coalesce(jsonb_typeof(p_rows), 'null');
  END IF;

  IF jsonb_array_length(p_rows) = 0 THEN
    RETURN 0;
  END IF;

  DELETE FROM match_player_stats WHERE fixture_id = p_fixture_id;

  INSERT INTO match_player_stats
    (fixture_id, side, external_player_id, player_name, shirt_number, position,
     is_starter, is_captain, minutes, rating, goals, assists, shots_total,
     shots_on, offsides, dribbles_attempts, dribbles_success, penalty_won,
     penalty_scored, penalty_missed, goals_conceded, saves, tackles_total,
     tackles_blocks, interceptions, duels_total, duels_won, dribbled_past,
     penalty_committed, penalty_saved, passes_total, passes_accurate,
     key_passes, fouls_drawn, fouls_committed, yellow_cards, red_cards)
  SELECT p_fixture_id, r.side, r.external_player_id, r.player_name,
         r.shirt_number, r.position, r.is_starter, r.is_captain, r.minutes,
         r.rating, r.goals, r.assists, r.shots_total, r.shots_on, r.offsides,
         r.dribbles_attempts, r.dribbles_success, r.penalty_won,
         r.penalty_scored, r.penalty_missed, r.goals_conceded, r.saves,
         r.tackles_total, r.tackles_blocks, r.interceptions, r.duels_total,
         r.duels_won, r.dribbled_past, r.penalty_committed, r.penalty_saved,
         r.passes_total, r.passes_accurate, r.key_passes, r.fouls_drawn,
         r.fouls_committed, r.yellow_cards, r.red_cards
    FROM jsonb_populate_recordset(NULL::match_player_stats, p_rows) AS r;

  GET DIAGNOSTICS v_written = ROW_COUNT;
  RETURN v_written;
END
$$;

REVOKE ALL ON FUNCTION replace_match_player_stats(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION replace_match_player_stats(uuid, jsonb) TO service_role;

COMMIT;

-- =============================================================
-- VERIFY — run after applying.
-- =============================================================
--
-- 1. The table exists with its indexes.
--    expect: 4 (pkey + 2 partial unique + fixture + player = 5 rows)
--
-- SELECT indexname FROM pg_indexes WHERE tablename = 'match_player_stats' ORDER BY 1;
--
-- 2. RLS on, exactly one SELECT policy, for `authenticated`.
--
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'match_player_stats';
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'match_player_stats';
--
-- 3. The XOR bites both ways. expect: 23514 each.
--
-- BEGIN; INSERT INTO match_player_stats (side, external_player_id, player_name,
--   is_starter, is_captain) VALUES ('home', 1, 'X', true, false); ROLLBACK;
--
-- 4. ⚠ THE PASSES CHECK BITES — the one that catches a percentage stored as a
--    count. expect: 23514.
--
-- BEGIN; INSERT INTO match_player_stats (fixture_id, side, external_player_id,
--   player_name, is_starter, is_captain, passes_total, passes_accurate)
--   VALUES ((SELECT fixture_id FROM league_fixtures LIMIT 1), 'home', 1, 'X',
--           true, false, 27, 83); ROLLBACK;
--
-- 5. The rating range and the position set bite. expect: 23514 each.
--
-- BEGIN; INSERT INTO match_player_stats (fixture_id, side, external_player_id,
--   player_name, is_starter, is_captain, rating)
--   VALUES ((SELECT fixture_id FROM league_fixtures LIMIT 1),'home',1,'X',true,false,11.0); ROLLBACK;
-- BEGIN; INSERT INTO match_player_stats (fixture_id, side, external_player_id,
--   player_name, is_starter, is_captain, position)
--   VALUES ((SELECT fixture_id FROM league_fixtures LIMIT 1),'home',1,'X',true,false,'ST'); ROLLBACK;
