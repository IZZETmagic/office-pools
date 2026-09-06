-- =============================================================
-- 136 — THE GAME REMEMBERS WHAT HAPPENED
-- =============================================================
-- ⚠ ADDITIVE ONLY. One new table, three new columns, two new constraints and
-- one new policy. NOTHING existing is replaced — no function, no trigger, no
-- view — so there is no `md5(prosrc)` pre-check to run before applying this.
--
-- ⚠⚠ APPLY THIS BEFORE DEPLOYING THE CODE THAT NAMES IT. `syncLeagueFixtures`
-- gains a write to `match_events` and to `league_fixtures.referee` /
-- `home_goals_ht` / `away_goals_ht`. If that ships first, PostgREST rejects the
-- ENTIRE payload for naming a column that does not exist — not just the new
-- fields — which is R14's exact failure mode and would stop league fixture
-- syncing altogether, mid-season.
--
-- Recommended: apply to a Supabase branch and run the VERIFY block at the
-- bottom before touching production.
--
-- Plan: ~/.claude/plans/adaptive-painting-wombat.md → Phase 1
--
-- ✅ APPLIED TO PRODUCTION 2026-09-06 (ujthamlehjyubbzxbnes). VERIFY block run
--    after: 5 indexes, RLS on with one authenticated SELECT policy, 3 columns,
--    pair constraint present, 1752 league_fixtures / 104 matches unchanged. All
--    three constraint-bite checks refused with 23514 (XOR both-null, XOR
--    both-set, half-written HT pair).
--
-- ## What this is for
--
-- The match detail screen's Facts tab. `/fixtures/events` has been fetched on
-- the World Cup arm every minute since migration 007 and handed to
-- `eventsToConduct`, which keeps CARD COUNTS PER TEAM for fair-play scoring and
-- throws every goal, minute and player away. Nothing in the product has ever
-- stored who scored. This table is the other half of that payload.
--
-- ## What this deliberately does not do
--
-- 1. NO SCORING CONSUMER, EVER. `match_conduct` exists because the World Cup
--    tiebreak needs it; this is display-only, and that is the whole reason it
--    can be a single table across both competitions (see the XOR below) rather
--    than a fork. A future reader tempted to compute anything from these rows
--    should read them from the engine's tables instead: this one is written
--    replace-all from a feed that revises itself, and it is not a ledger.
--
-- 2. NO `matches` COLUMNS. The World Cup arm of this table stays empty for now
--    (Ryan, 2026-09-06 — league first), so `matches.referee` and half-time
--    columns would be schema nobody writes. They are a two-line follow-up on
--    the day somebody wants World Cup timelines backfilled.
--
-- 3. NO TEAM FK. See the note on `side`.
-- =============================================================

BEGIN;

-- ------------------------------------------------------------------ 1. Events
CREATE TABLE IF NOT EXISTS match_events (
  event_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ⚠ TWO NULLABLE FKs WITH AN XOR, NOT A POLYMORPHIC (kind, subject_id) PAIR.
  -- The polymorphic shape was considered and rejected for `pools` for exactly
  -- the reason that applies here — it can carry no FK to either side, so a
  -- deleted fixture orphans its timeline silently (v2 §2.1, reaffirmed in v3
  -- and v3.1). This shape is what `pools` actually shipped: real referential
  -- integrity to both competitions, and both cascade.
  match_id      uuid REFERENCES matches(match_id)               ON DELETE CASCADE,
  fixture_id    uuid REFERENCES league_fixtures(fixture_id)     ON DELETE CASCADE,

  -- ⚠ THE SIDE, NOT THE TEAM. A team FK would need its own XOR pair — `teams`
  -- for the World Cup, `league_clubs` for a league — which is four nullable
  -- FKs and a paired constraint to keep them agreeing with the two above. The
  -- only question the screen ever asks is "which column", and the fixture
  -- already knows who home and away are.
  --
  -- ⚠ FOR AN OWN GOAL THIS IS THE SIDE THAT BENEFITS — AND SO IS THE FEED'S.
  -- api-football attributes an own goal to the team it counted FOR, with
  -- `player` set to the man who put it in his own net, so the two are from
  -- opposite squads by design. `eventsToTimeline` copies `team` straight
  -- across. An earlier version "corrected" it by flipping, which cost 14 of 137
  -- backfilled fixtures their scoreline. Do not reintroduce that.
  side          text    NOT NULL,
  kind          text    NOT NULL,

  -- Scorer, carded player, or the player LEAVING for a substitution.
  player_name   text,
  -- Assist, or the player ARRIVING for a substitution.
  related_name  text,

  minute        integer NOT NULL,
  extra_minute  integer,

  -- ⚠ Six things can share the 45th minute and `minute` alone cannot order
  -- them. This is the index in the provider's own array, which is the only
  -- ordering information the payload carries.
  sort_index    integer NOT NULL,

  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT match_events_subject_ck
    CHECK ((match_id IS NULL) <> (fixture_id IS NULL)),
  CONSTRAINT match_events_side_ck
    CHECK (side IN ('home','away')),
  CONSTRAINT match_events_kind_ck
    CHECK (kind IN ('goal','own_goal','penalty','yellow','red','second_yellow',
                    'var_goal_cancelled','subst')),
  -- 120 + a generous tail for a long stoppage in extra time.
  CONSTRAINT match_events_minute_ck
    CHECK (minute BETWEEN 0 AND 130),
  CONSTRAINT match_events_extra_ck
    CHECK (extra_minute IS NULL OR extra_minute BETWEEN 0 AND 30)
);

COMMENT ON TABLE match_events IS
  'The timeline a match detail screen draws: goals, cards, VAR reversals and substitutions, with minutes and names. Display only — it has no scoring consumer and must not acquire one. Written replace-all per fixture, because api-football gives events no stable id and a VAR reversal REMOVES one from the payload; an upsert would leave a disallowed goal on the screen for good.';
COMMENT ON CONSTRAINT match_events_subject_ck ON match_events IS
  'Exactly one competition owns a row. The alternative — an untyped (kind, id) pair — cannot carry a foreign key, which is why it was rejected for pools and is rejected here.';

CREATE INDEX IF NOT EXISTS idx_match_events_fixture
  ON match_events(fixture_id, minute, sort_index) WHERE fixture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_match_events_match
  ON match_events(match_id, minute, sort_index) WHERE match_id IS NOT NULL;

-- Replace-all already makes duplicates impossible; these make a double-write
-- fail LOUDLY instead of quietly rendering every goal twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_match_events_fixture_slot
  ON match_events(fixture_id, sort_index) WHERE fixture_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_match_events_match_slot
  ON match_events(match_id, sort_index) WHERE match_id IS NOT NULL;

-- ------------------------------------------------------------------- 2. RLS
-- ⚠ READABLE BY ANY SIGNED-IN USER, and that is correct rather than lax. These
-- are public football facts — who scored, and when — not pool-scoped data.
-- Nothing here is derived from anybody's picks. Making it readable is what lets
-- the phone read it directly and saves an API route that would exist only to
-- re-publish what the BBC already has.
--
-- No INSERT/UPDATE/DELETE policies: writes are service-role only, like every
-- other feed-owned table.
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users can read match events" ON match_events;
CREATE POLICY "Signed-in users can read match events"
  ON match_events FOR SELECT TO authenticated USING (true);

-- --------------------------------------------------- 3. Referee + half time
-- Both arrive on the `/fixtures` payload we already parse (`ApiFootballFixture`
-- carries `fixture.referee` and `score.halftime`) and have been dropped on
-- ingest since the league arm was written.
ALTER TABLE league_fixtures ADD COLUMN IF NOT EXISTS referee       text;
ALTER TABLE league_fixtures ADD COLUMN IF NOT EXISTS home_goals_ht integer;
ALTER TABLE league_fixtures ADD COLUMN IF NOT EXISTS away_goals_ht integer;

-- ⚠ A PAIRED CHECK, MIRRORING `league_fixtures_result_pair_ck`, AND THE WRITER
-- MUST DIFF IT AS A PAIR. `fixtureToMatchUpdate` diffs each side of the
-- full-time score alone, and mappers.ts records that this is what raises 23514
-- in production the first time the provider reports `{1, null}` mid-write. The
-- half-time pair has the same hazard and the same answer.
--
-- Safe to add to the existing 380 rows: both columns are NULL on every one of
-- them, and NULL = NULL is TRUE under `IS NULL` comparison, so the check holds.
ALTER TABLE league_fixtures DROP CONSTRAINT IF EXISTS league_fixtures_ht_pair_ck;
ALTER TABLE league_fixtures ADD CONSTRAINT league_fixtures_ht_pair_ck
  CHECK ((home_goals_ht IS NULL) = (away_goals_ht IS NULL));

COMMENT ON COLUMN league_fixtures.referee IS
  'Match official, verbatim from api-football (e.g. "S. Barrott"). Display only.';
COMMENT ON COLUMN league_fixtures.home_goals_ht IS
  'Half-time score. Written as a pair with away_goals_ht — see league_fixtures_ht_pair_ck.';

COMMIT;

-- =============================================================
-- VERIFY (run after applying; every line should read as stated)
-- =============================================================
-- 1. The table exists with the XOR and both unique slots.
--    expect: 4 indexes (pkey + 2 partial btree + 2 partial unique = 5 rows)
-- SELECT indexname FROM pg_indexes WHERE tablename = 'match_events' ORDER BY 1;
--
-- 2. RLS is on with exactly one policy, SELECT, for authenticated.
--    expect: rowsecurity = true; one row, cmd = 'SELECT', roles = {authenticated}
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'match_events';
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'match_events';
--
-- 3. The XOR actually refuses both-null and both-set.
--    expect: BOTH raise 23514 (run inside a transaction you roll back)
-- BEGIN;
--   INSERT INTO match_events (side, kind, minute, sort_index)
--     VALUES ('home','goal',10,0);                       -- both null  -> 23514
-- ROLLBACK;
--
-- 4. The new columns exist and the pair check is present.
--    expect: 3 rows; then 1 row named league_fixtures_ht_pair_ck
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'league_fixtures'
--     AND column_name IN ('referee','home_goals_ht','away_goals_ht') ORDER BY 1;
-- SELECT conname FROM pg_constraint WHERE conname = 'league_fixtures_ht_pair_ck';
--
-- 5. The pair check refuses a half-written pair.
--    expect: 23514 (roll this back)
-- BEGIN;
--   UPDATE league_fixtures SET home_goals_ht = 1 WHERE fixture_id =
--     (SELECT fixture_id FROM league_fixtures LIMIT 1);  -- away still null -> 23514
-- ROLLBACK;
--
-- 6. Nothing existing moved.
--    expect: unchanged from before the migration
-- SELECT count(*) FROM league_fixtures;
-- =============================================================
