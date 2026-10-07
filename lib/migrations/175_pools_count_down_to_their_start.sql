-- =============================================================
-- 175 — POOLS COUNT DOWN TO THEIR START
-- =============================================================
-- Ryan, 2026-10-06: "count down notifications until the start of a pool" — then "Yes, start
-- step 3".
--
-- Two new LIVE kinds, sent through the outbox (lib/pools/countdown.ts), queued hourly by the
-- league-notices cron:
--
--   pool_countdown        every member, once, as soon as the pool's first deadline is a week or
--                         less away — when it starts, and what they still have to pick. The
--                         day-before message is the existing reminder, to people with picks left
--                         only; never a second countdown.
--   pool_countdown_admin  the admin, once, at the same point, if two people or fewer have joined.
--
-- League modes only for now; the tournament modes get theirs when a tournament is next on the
-- calendar. The same "registry rows" markers, so registry.guard.test.ts reads these too.
-- =============================================================

insert into public.notification_types
  (type_key, category, modes, channels, is_transactional, expires, expiry_window, status, disclosure_sentence)
values
-- registry rows: begin
  ('pool_countdown', 'PREDICTIONS', '{pickem,showdown,last_man_standing,table}', '{email,push}', false, 'at_deadline', null, 'live', 'When your pool''s first deadline is a week or less away, we tell you once when it starts and what you still have to pick.'),
  ('pool_countdown_admin', 'POOL_ACTIVITY', '{pickem,showdown,last_man_standing,table}', '{email,push}', false, 'at_deadline', null, 'live', 'If a pool you run starts within a week and two people or fewer have joined, we tell you once, so you can share the code.')
-- registry rows: end
on conflict (type_key) do update set
  category = excluded.category,
  modes = excluded.modes,
  channels = excluded.channels,
  is_transactional = excluded.is_transactional,
  expires = excluded.expires,
  expiry_window = excluded.expiry_window,
  status = excluded.status,
  disclosure_sentence = excluded.disclosure_sentence;
