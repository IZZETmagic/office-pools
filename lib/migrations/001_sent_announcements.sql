-- Migration: Create sent_announcements table for idempotent announcement sends
-- Run this in the Supabase SQL editor before deploying the updated send-announcement route.

CREATE TABLE IF NOT EXISTS sent_announcements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  sent_by uuid NOT NULL REFERENCES users(user_id),
  created_at timestamptz DEFAULT now() NOT NULL
);

-- RLS: Only super admins can read/write
ALTER TABLE sent_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage sent_announcements"
  ON sent_announcements
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.user_id = sent_announcements.sent_by
        AND users.is_super_admin = true
        AND users.auth_user_id = auth.uid()
    )
  );
