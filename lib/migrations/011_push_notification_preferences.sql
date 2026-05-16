-- Migration: Per-user push notification category preferences. One row per
-- user, one boolean column per category, all defaulting to true so newly-
-- registered users get every push until they opt out.
--
-- Email preferences live in Resend (managed via /api/notifications/preferences).
-- Push preferences are device-targeted and need to be queryable from the
-- dispatcher (`lib/push/apns.ts`), so they live in Postgres.
--
-- Categories: see lib/push/categories.ts. GAMIFICATION is push-only — no email
-- topic exists for it. The other 6 mirror the Resend topic keys.
--
-- Applied via Supabase MCP on 2026-05-16.

CREATE TABLE IF NOT EXISTS push_notification_preferences (
  user_id        uuid PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  pool_activity  boolean NOT NULL DEFAULT true,
  predictions    boolean NOT NULL DEFAULT true,
  match_results  boolean NOT NULL DEFAULT true,
  leaderboard    boolean NOT NULL DEFAULT true,
  admin          boolean NOT NULL DEFAULT true,
  community      boolean NOT NULL DEFAULT true,
  gamification   boolean NOT NULL DEFAULT true,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE push_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own push prefs"
  ON push_notification_preferences
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.user_id = push_notification_preferences.user_id
        AND users.auth_user_id = auth.uid()
    )
  );
