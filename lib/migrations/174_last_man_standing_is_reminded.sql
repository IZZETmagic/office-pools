-- =============================================================
-- 174 — LAST MAN STANDING IS REMINDED; EVERY REMINDER AT MOST TWICE
-- =============================================================
-- Ryan, 2026-10-06, "Yes to both":
--   1. Reminders AT MOST TWICE — a day before the matchweek locks, then once in its last two
--      hours, only to members who have not picked. (Was: once, a design note in
--      lib/league/notify.ts, never a recorded decision.)
--   2. The Last Man Standing reminders FIRST, ahead of N4.
--
-- ⚠ A MISSED LMS PICK KNOCKS YOU OUT. league_lms_settle judges an entry with no pick as not
-- surviving, and until now no notice told an LMS player to pick: the matchweek notices are
-- allow-listed to pick'em and Showdown (migration 108). On 6 Oct, 9 of the 10 players still in
-- the main LMS pool had no pick for a matchweek locking four days later.
--
-- Two new LIVE kinds, sent through the outbox (lib/league/lmsNotices.ts), and lock_reminder's
-- sentence rewritten to the new cadence, because the sentence must say what the code does. The
-- same "registry rows" markers and an upsert, so registry.guard.test.ts reads these on top of 170.
-- =============================================================

insert into public.notification_types
  (type_key, category, modes, channels, is_transactional, expires, expiry_window, status, disclosure_sentence)
values
-- registry rows: begin
  ('lock_reminder', 'PREDICTIONS', '{pickem,showdown}', '{email,push}', false, 'at_deadline', null, 'live', 'If you haven''t picked every match, we remind you a day before the matchweek locks and again in its last two hours. Once you''ve picked, we stop.'),
  ('lms_pick_open', 'PREDICTIONS', '{last_man_standing}', '{email,push}', false, 'at_deadline', null, 'live', 'When a matchweek opens for your Last Man Standing pick and you''re still in, we tell you, with the clubs you''ve already used.'),
  ('lms_pick_reminder', 'PREDICTIONS', '{last_man_standing}', '{email,push}', false, 'at_deadline', null, 'live', 'If you''re still in and haven''t picked, we remind you a day before the matchweek locks and again in its last two hours — a missed pick knocks you out.')
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
