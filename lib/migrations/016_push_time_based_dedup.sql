-- Migration: Dedupe tables for time-based push notifications.
--
-- push_match_starting_sent — at most one "match starts in 1h" push per
-- user per match, regardless of how many pools the user is in that use
-- the match.
--
-- push_predict_reminder_sent — at most one daily "you haven't predicted
-- yet" reminder per user. Cleared by date (one row per day per user).
--
-- Applied via Supabase MCP on 2026-05-16.

CREATE TABLE IF NOT EXISTS push_match_starting_sent (
  user_id  uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
  sent_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_push_match_starting_match ON push_match_starting_sent(match_id);

CREATE TABLE IF NOT EXISTS push_predict_reminder_sent (
  user_id  uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  sent_on  date NOT NULL,
  PRIMARY KEY (user_id, sent_on)
);
