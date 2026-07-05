-- =============================================================
-- Fix #1 (time-boxed resumable sweep) — rollout SQL  [DRAFT — NOT APPLIED]
-- =============================================================
-- Register the two sync_settings keys the time-boxed sweep uses. Default OFF →
-- the cron behaves exactly as today. Nothing changes until the flag is set true.
-- setting_value is jsonb.

-- The kill switch (default OFF).
INSERT INTO public.sync_settings (setting_key, setting_value, updated_at)
VALUES ('sweep_time_box_enabled', 'false'::jsonb, now())
ON CONFLICT (setting_key) DO NOTHING;

-- The resume cursor: pool_ids still to process from a time-boxed run. Must exist
-- (default empty array) so the cron's .update() persists progress; if absent the
-- update is a silent no-op and the sweep degrades to redo-all each run (still
-- bounded, just less efficient).
INSERT INTO public.sync_settings (setting_key, setting_value, updated_at)
VALUES ('sweep_cursor', '[]'::jsonb, now())
ON CONFLICT (setting_key) DO NOTHING;

-- TURN ON (after review + B1 measured): set sweep_time_box_enabled true.
--   UPDATE public.sync_settings SET setting_value='true'::jsonb, updated_at=now()
--   WHERE setting_key='sweep_time_box_enabled';
-- INSTANT REVERT: set it back to 'false'::jsonb (no deploy) → today's behaviour.
--   Also clear a stale cursor if reverting mid-drain:
--   UPDATE public.sync_settings SET setting_value='[]'::jsonb WHERE setting_key='sweep_cursor';
