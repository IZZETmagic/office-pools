-- Migration 075: the real league table, from the feed.
--
-- Plan: drafts/2026-08-24_league_pools_full_plan.md §0.3, which OVERTURNS §3.5.
-- Product intent, *A Season in a League Pool* §6.
--
-- ============================================================
-- WHY THIS IS INGESTED AND NOT DERIVED
-- ============================================================
-- §3.5 originally specified deriving the table from our own completed fixtures
-- — 3/1/0, order by points, GD, GF. That is wrong, and the reason is POINTS
-- DEDUCTIONS: Everton were docked ten points and then eight in 2023/24, Forest
-- four. A table we compute ourselves cannot know about a deduction, so it would
-- have shown Everton ten places too high for a whole season — visibly wrong to
-- anybody who had watched Match of the Day.
--
-- And Table mode SCORES AGAINST this table, so every member's bonus would have
-- been wrong too. A cosmetic bug in the display half is a scoring bug in the
-- other.
--
-- So: the feed is the source of truth, and `league_actual_table()` — which does
-- not exist yet — is demoted to a CROSS-CHECK that raises when the two
-- disagree. That disagreement is also how a deduction gets noticed at all.
--
-- ============================================================
-- WHAT THE FEED GIVES US FOR FREE
-- ============================================================
-- api-football `/standings` returns, per club: `rank` (with the real
-- tiebreakers already applied, including head-to-head — which settles decision
-- 13 by making it not our problem), `points`, `goalsDiff`, played/won/drawn/
-- lost, a `form` strip, a `description` naming the Champions League and
-- relegation bands, and `status` — same / up / down, the movement arrows.
--
-- All of it is stored rather than recomputed, per the architecture rule: the
-- backend writes the answer down once and the front ends only display it.
--
-- ============================================================
-- ONE ROW PER CLUB PER SEASON, OVERWRITTEN
-- ============================================================
-- This is a CURRENT-STATE table, not a log. The primary key is
-- (season_id, club_id) and the sync upserts, so the table always holds the
-- standings as of `fetched_at` and nothing accumulates across 38 matchweeks.
--
-- ⚠ THAT MAKES IT UNSUITABLE FOR SCORING ON ITS OWN, and §0.3 says so: "a
-- season-end snapshot of the final standings is required before Table mode pays
-- out, so scoring never depends on a live third-party read." Table mode is the
-- next phase and that snapshot is its precondition — do not pay a Table bonus
-- straight off this table, because a feed correction in June would silently
-- restate what somebody was already awarded.

CREATE TABLE IF NOT EXISTS league_standings (
  season_id      uuid NOT NULL REFERENCES league_seasons(season_id) ON DELETE CASCADE,
  club_id        uuid NOT NULL REFERENCES league_clubs(club_id)     ON DELETE CASCADE,

  -- The feed's own position. NOT recomputed from points: it already applies the
  -- competition's real tiebreakers, which for the Premier League ends at
  -- head-to-head and which we would otherwise have to implement.
  rank           int  NOT NULL,
  points         int  NOT NULL,
  goals_diff     int  NOT NULL,
  played         int  NOT NULL,
  won            int  NOT NULL,
  drawn          int  NOT NULL,
  lost           int  NOT NULL,
  goals_for      int  NOT NULL,
  goals_against  int  NOT NULL,

  -- Recent form, most recent last, e.g. 'WWDLW'. Display only.
  form           text,
  -- The feed's band label, e.g. 'Promotion - Champions League (Group Stage)' or
  -- 'Relegation'. This is what shades the table, and it is worth taking from the
  -- feed rather than hardcoding 1-4 and 18-20: the bands move between seasons
  -- and between competitions.
  description    text,
  -- same | up | down, since the previous round. The movement arrows, free.
  movement       text CHECK (movement IS NULL OR movement IN ('same', 'up', 'down')),
  -- Group name. Always one group for a league; present so a cup group stage
  -- needs no schema change later.
  group_label    text,

  fetched_at     timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (season_id, club_id)
);

-- The table is always read whole and in order, which is what this serves.
CREATE INDEX IF NOT EXISTS league_standings_season_rank_idx
  ON league_standings (season_id, rank);

COMMENT ON TABLE league_standings IS
  'The real league table, ingested from api-football /standings. Current state, upserted per sync — NOT a log. Source of truth for display AND for Table mode scoring, because a table derived from our own fixtures cannot see points deductions. Needs a season-end snapshot before Table mode pays out (plan §0.3).';
COMMENT ON COLUMN league_standings.rank IS
  'The feed''s position, with the competition''s real tiebreakers already applied. Do not recompute it from points — that is what would lose head-to-head.';

ALTER TABLE league_standings ENABLE ROW LEVEL SECURITY;

-- Calendar-shaped reference data, exactly like league_clubs and league_fixtures:
-- world-readable, written only by the service role running the sync.
CREATE POLICY "League standings are viewable by everyone"
  ON league_standings FOR SELECT USING (true);
