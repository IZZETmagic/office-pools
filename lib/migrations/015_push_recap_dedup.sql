-- Migration: Dedupe tables for matchday recap + weekly recap pushes.
-- Atomic INSERT ... ON CONFLICT DO NOTHING pattern, same as deadline
-- warnings (migration 013).
--
-- matchday is the calendar date being summarized (one row per user per
-- pool per day). week_starting is the Monday of the week being summarized
-- (one row per user per week — recap is cross-pool, not per pool, so
-- there's no pool_id column).
--
-- Applied via Supabase MCP on 2026-05-16.

CREATE TABLE IF NOT EXISTS push_matchday_recaps_sent (
  user_id      uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  pool_id      uuid NOT NULL REFERENCES pools(pool_id) ON DELETE CASCADE,
  matchday     date NOT NULL,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pool_id, matchday)
);

CREATE INDEX IF NOT EXISTS idx_push_matchday_recaps_matchday ON push_matchday_recaps_sent(matchday);

CREATE TABLE IF NOT EXISTS push_weekly_recaps_sent (
  user_id        uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  week_starting  date NOT NULL,
  sent_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_starting)
);
