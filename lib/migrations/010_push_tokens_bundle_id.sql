-- Migration: Add bundle_id column to push_tokens so the APNs dispatcher
-- can route a push to the correct app (Swift `com.officepools.app` vs Expo
-- `com.officepools.expo`). Nullable on purpose — existing Swift-app rows
-- stay valid; the dispatcher falls back to the APNS_BUNDLE_ID env var when
-- a token has no explicit bundle_id.
--
-- Run this in the Supabase SQL editor before merging the Expo push code.

ALTER TABLE push_tokens
  ADD COLUMN IF NOT EXISTS bundle_id text;

-- Optional but useful: an index for stats / debugging queries that filter
-- by bundle (e.g. "how many Expo-app users have push enabled").
CREATE INDEX IF NOT EXISTS idx_push_tokens_bundle_id ON push_tokens(bundle_id);
