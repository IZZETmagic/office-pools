-- =============================================================
-- 139 — THE GAME REMEMBERS WHO PLAYED
-- =============================================================
-- ⚠ ADDITIVE ONLY. Two new tables, their indexes, constraints and policies.
-- NOTHING existing is replaced — no function, no trigger, no view, and no
-- column on any existing table — so there is no `md5(prosrc)` pre-check to run
-- before applying this.
--
-- ⚠⚠ APPLY THIS BEFORE DEPLOYING THE CODE THAT NAMES IT. `syncLeagueFixtures`
-- gains writes to `match_lineups` and `match_team_stats`. If that ships first,
-- PostgREST rejects the ENTIRE payload for naming a relation that does not
-- exist — which is R14's exact failure mode and would stop league fixture
-- syncing altogether, mid-season. 136 carries the same warning for the same
-- reason; it is not boilerplate.
--
-- Recommended: apply to a Supabase branch and run the VERIFY block at the
-- bottom before touching production.
--
-- Plan: ~/.claude/plans/concurrent-swimming-quiche.md → Piece 2
--
-- ## What this is for
--
-- The match detail screen's two missing tabs. `MatchTabBar` has carried a note
-- since it was written saying Line-ups and Statistics are absent because
-- "/fixtures/lineups and /fixtures/statistics are never called ... They arrive
-- when their data does." This is their data.
--
-- It is 136's sibling in every structural respect — the same XOR across the two
-- competitions, the same `side` instead of a team FK, the same display-only
-- contract, the same replace-all write. Read 136's header first; the reasoning
-- there is not repeated here, only the places this one departs.
--
-- ## What this deliberately does not do
--
-- 1. NO SCORING CONSUMER, EVER. As 136. These tables are drawn on a screen and
--    read by nothing else. A future reader tempted to compute a form guide or a
--    fair-play tiebreak from `match_team_stats` should not: it is written
--    replace-all from a feed that revises itself mid-match, and it is not a
--    ledger. `match_conduct` is where card counts live for scoring.
--
-- 2. NO `matches` ROWS. The World Cup arm of both tables stays empty for now
--    (as 136 — league first). The XOR admits it so the day somebody backfills
--    World Cup line-ups there is no migration to write, only a mapper.
--
-- 3. NO PLAYER ENTITY, AND THAT IS WHY THE LINE-UP IS `jsonb`. See the note on
--    `players` below. This is the one place this migration departs from 136's
--    shape, and it is a considered departure rather than an oversight.
--
-- 4. NO TEAM FK. As 136: `side` only. The fixture already knows who home and
--    away are, and a team FK here would need its own XOR pair (`teams` for the
--    World Cup, `league_clubs` for a league) kept in agreement with the one
--    above — four nullable FKs to answer a question with two possible answers.
-- =============================================================

BEGIN;

-- ----------------------------------------------------------------- 1. Line-ups
CREATE TABLE IF NOT EXISTS match_lineups (
  lineup_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ⚠ The XOR, exactly as 136 writes it. Two nullable FKs with real referential
  -- integrity to both competitions, both cascading, rather than a polymorphic
  -- (kind, subject_id) pair that can carry no FK to either.
  match_id      uuid REFERENCES matches(match_id)               ON DELETE CASCADE,
  fixture_id    uuid REFERENCES league_fixtures(fixture_id)     ON DELETE CASCADE,

  side          text NOT NULL,

  -- '4-2-3-1'. Provider text, shown as a caption and never parsed for meaning —
  -- the pitch is drawn from each player's `grid`, not from this string. Null
  -- when the feed publishes a line-up without one, which it does.
  formation     text,
  coach_name    text,

  -- ⚠ A BLOB, AND DELIBERATELY, WHERE 136 CHOSE ROWS.
  --
  -- 136 gave each event its own row because an event is individually
  -- meaningful: it is ordered, counted, and drawn as one line among others. A
  -- line-up is none of those things. It is written whole, read whole, and
  -- replaced whole, and no query this product will ever run asks about one
  -- player — because THERE IS NO PLAYER ENTITY. "Player detail page" is an
  -- unstarted backlog item with no route, no table and no endpoint; until it
  -- exists, twenty-two rows per fixture would be twenty-two rows nobody can
  -- address.
  --
  -- So the honest shape is the one that matches how it is used. The day a
  -- player entity arrives this becomes a normalisation with a backfill, not a
  -- rewrite: every field needed to build `match_lineup_players` is already in
  -- here, including the provider's own `player_id`.
  --
  -- Shape, as `lineupsToRows` writes it:
  --   [{ "player_id": 1438, "name": "B. Leno", "number": 1,
  --      "pos": "G", "grid": "1:1", "starter": true }, ...]
  --
  -- ⚠ `grid` IS "row:col" AND IS NULL FOR EVERY SUBSTITUTE. Verified on the
  -- live feed 2026-09-06: all 9 subs in fixture 1379342 had `grid: null` while
  -- all 11 starters had one. A renderer must place from `grid` and fall back to
  -- listing, never assume a sub can be positioned.
  --
  -- ⚠ THE NAMES ARE ABBREVIATED HERE AND NOT IN `match_events`. /lineups says
  -- "E. Nketiah" where /events says "Eddie Nketiah". Do not join the two by
  -- name — `player_id` is why it is kept.
  players       jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT match_lineups_subject_ck
    CHECK ((match_id IS NULL) <> (fixture_id IS NULL)),
  CONSTRAINT match_lineups_side_ck
    CHECK (side IN ('home','away')),
  -- A line-up is an array of players. An object or a scalar here is a mapper
  -- bug, and it is cheaper to refuse it than to find it on a screen.
  CONSTRAINT match_lineups_players_ck
    CHECK (jsonb_typeof(players) = 'array')
);

COMMENT ON TABLE match_lineups IS
  'Display only, one row per (fixture, side), written replace-all by the league fixture sync. Never scored from. See migration 139.';
COMMENT ON COLUMN match_lineups.players IS
  'Array of {player_id, name, number, pos, grid, starter}. `grid` is "row:col" and is NULL for every substitute.';

-- One line-up per side per fixture. The sync writes delete-then-insert, so this
-- is a correctness guard on a double write rather than an upsert target.
CREATE UNIQUE INDEX IF NOT EXISTS uq_match_lineups_fixture_side
  ON match_lineups(fixture_id, side) WHERE fixture_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_match_lineups_match_side
  ON match_lineups(match_id, side) WHERE match_id IS NOT NULL;

ALTER TABLE match_lineups ENABLE ROW LEVEL SECURITY;

-- As every other feed-owned table: readable by anyone signed in, written only
-- by the service role. No INSERT/UPDATE/DELETE policy, deliberately.
DROP POLICY IF EXISTS "Signed-in users can read match lineups" ON match_lineups;
CREATE POLICY "Signed-in users can read match lineups"
  ON match_lineups FOR SELECT TO authenticated USING (true);

-- --------------------------------------------------------------- 2. Team stats
--
-- ⚠ NAMED COLUMNS, NOT A KEY/VALUE TABLE, AND THE FEED IS WHY.
--
-- The provider sends `[{type: 'Ball Possession', value: '65%'}, ...]` — which
-- looks like it wants an EAV table. It does not. The screen draws a fixed list
-- of rows in a fixed order, so an EAV shape would be pivoted back on every
-- single read, and the pivot would have to know the type strings anyway.
--
-- ⚠⚠ THE TYPE SET IS NOT FIXED ACROSS FIXTURES, AND THIS IS THE THING THAT
-- WOULD HAVE BITTEN US. Sampled live 2026-09-06 across four fixtures in two
-- seasons: fixture 1379342 sent 18 types including `Passes %`,
-- `expected_goals` and `goals_prevented`; fixture 1557391 sent 16, MISSING all
-- three of those and including `Free Kicks`, which the first did not have at
-- all. The union across the sample is the 19 columns below.
--
-- Two consequences the mapper is required to honour:
--   · an ABSENT type is NULL here, never 0 — see the null note below;
--   · an UNKNOWN type is IGNORED, never an error. A 20th type appearing next
--     season must not take the fixture sync down. Adding a column for it later
--     is a two-line migration.
CREATE TABLE IF NOT EXISTS match_team_stats (
  stat_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  match_id           uuid REFERENCES matches(match_id)           ON DELETE CASCADE,
  fixture_id         uuid REFERENCES league_fixtures(fixture_id) ON DELETE CASCADE,

  side               text NOT NULL,

  -- ⚠ NULL AND ZERO ARE DIFFERENT FACTS AND MUST STAY SO.
  --
  -- `Red Cards` arrives as `null` on one fixture and `0` on another for the
  -- same real-world state: nobody was sent off. `expected_goals` arrives as
  -- null because the COMPETITION does not provide it at all. Both are stored
  -- as written, and the screen resolves them differently — a count reading
  -- null renders "0", while an xG row null on BOTH sides is hidden entirely.
  -- Coercing null to 0 here would print "xG 0.00" over a game that had 3.4.
  possession_pct     integer,   -- 'Ball Possession'  '65%'  -> 65
  shots_total        integer,   -- 'Total Shots'
  shots_on           integer,   -- 'Shots on Goal'
  shots_off          integer,   -- 'Shots off Goal'
  shots_blocked      integer,   -- 'Blocked Shots'
  shots_inside_box   integer,   -- 'Shots insidebox'
  shots_outside_box  integer,   -- 'Shots outsidebox'
  fouls              integer,   -- 'Fouls'
  free_kicks         integer,   -- 'Free Kicks'
  corners            integer,   -- 'Corner Kicks'
  offsides           integer,   -- 'Offsides'
  yellow_cards       integer,   -- 'Yellow Cards'
  red_cards          integer,   -- 'Red Cards'
  saves              integer,   -- 'Goalkeeper Saves'
  passes_total       integer,   -- 'Total passes'
  passes_accurate    integer,   -- 'Passes accurate'
  passes_pct         integer,   -- 'Passes %'         '83%'  -> 83
  -- Decimals, not counts. `numeric` rather than `real`: '1.81' is exact in
  -- decimal and is displayed to two places, so binary floating point buys
  -- nothing and can print 1.8099999.
  expected_goals     numeric,   -- 'expected_goals'   '1.81' -> 1.81
  goals_prevented    numeric,   -- 'goals_prevented'  '-0.17' -> -0.17  (signed)

  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT match_team_stats_subject_ck
    CHECK ((match_id IS NULL) <> (fixture_id IS NULL)),
  CONSTRAINT match_team_stats_side_ck
    CHECK (side IN ('home','away')),
  -- A percentage the feed sends as a string is parsed here; anything outside
  -- the range means the parse was wrong, and a silent 6500 would render a bar
  -- off the edge of the screen.
  CONSTRAINT match_team_stats_possession_ck
    CHECK (possession_pct IS NULL OR possession_pct BETWEEN 0 AND 100),
  CONSTRAINT match_team_stats_passes_pct_ck
    CHECK (passes_pct IS NULL OR passes_pct BETWEEN 0 AND 100)
);

COMMENT ON TABLE match_team_stats IS
  'Display only, one row per (fixture, side), written replace-all by the league fixture sync. Never scored from — match_conduct owns card counts for scoring. See migration 139.';
COMMENT ON COLUMN match_team_stats.red_cards IS
  'NULL and 0 both occur from the feed for "nobody was sent off". Stored as written; the screen renders a null count as 0.';
COMMENT ON COLUMN match_team_stats.expected_goals IS
  'NULL means the competition does not provide xG at all — not that it was zero. A row null on both sides is hidden rather than shown as 0.00.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_match_team_stats_fixture_side
  ON match_team_stats(fixture_id, side) WHERE fixture_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_match_team_stats_match_side
  ON match_team_stats(match_id, side) WHERE match_id IS NOT NULL;

ALTER TABLE match_team_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users can read match team stats" ON match_team_stats;
CREATE POLICY "Signed-in users can read match team stats"
  ON match_team_stats FOR SELECT TO authenticated USING (true);

COMMIT;

-- =============================================================
-- VERIFY — run after applying, on a branch first.
-- =============================================================
--
-- 1. Both tables exist with the indexes they should have.
--    expect: match_lineups 3 rows (pkey + 2 partial unique),
--            match_team_stats 3 rows (pkey + 2 partial unique)
--
-- SELECT tablename, indexname FROM pg_indexes
--  WHERE tablename IN ('match_lineups','match_team_stats') ORDER BY 1,2;
--
-- 2. RLS is on, with exactly one SELECT policy each, for `authenticated`.
--    expect: relrowsecurity = true for both; two rows, both cmd=SELECT,
--            roles={authenticated}
--
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relname IN ('match_lineups','match_team_stats');
-- SELECT tablename, policyname, cmd, roles FROM pg_policies
--  WHERE tablename IN ('match_lineups','match_team_stats') ORDER BY 1;
--
-- 3. The XOR bites, both ways, on both tables. expect: 23514 each time.
--
-- BEGIN; INSERT INTO match_lineups (side) VALUES ('home'); ROLLBACK;
-- BEGIN; INSERT INTO match_lineups (match_id, fixture_id, side)
--        VALUES ((SELECT match_id FROM matches LIMIT 1),
--                (SELECT fixture_id FROM league_fixtures LIMIT 1), 'home'); ROLLBACK;
-- BEGIN; INSERT INTO match_team_stats (side) VALUES ('home'); ROLLBACK;
--
-- 4. `players` refuses anything that is not an array. expect: 23514.
--
-- BEGIN; INSERT INTO match_lineups (fixture_id, side, players)
--        VALUES ((SELECT fixture_id FROM league_fixtures LIMIT 1), 'home',
--                '{"not":"an array"}'::jsonb); ROLLBACK;
--
-- 5. The percentage guards bite. expect: 23514 each.
--
-- BEGIN; INSERT INTO match_team_stats (fixture_id, side, possession_pct)
--        VALUES ((SELECT fixture_id FROM league_fixtures LIMIT 1), 'home', 6500); ROLLBACK;
-- BEGIN; INSERT INTO match_team_stats (fixture_id, side, passes_pct)
--        VALUES ((SELECT fixture_id FROM league_fixtures LIMIT 1), 'home', -1); ROLLBACK;
--
-- 6. A side other than home/away is refused. expect: 23514.
--
-- BEGIN; INSERT INTO match_lineups (fixture_id, side)
--        VALUES ((SELECT fixture_id FROM league_fixtures LIMIT 1), 'neither'); ROLLBACK;
--
-- 7. Nothing existing moved.
--    expect: unchanged from before this migration.
--
-- SELECT count(*) FROM league_fixtures;
-- SELECT count(*) FROM match_events;
-- =============================================================
