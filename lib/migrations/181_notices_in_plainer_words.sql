-- =============================================================
-- 181 — THE NOTICES, IN PLAINER WORDS
-- =============================================================
-- Ryan, 2026-10-07, reviewing the sentences under each switch in the app: "These
-- are great just they're quite long ... Is there a way to write these better".
-- The settings screens now close each switch to one line and list its notices,
-- when opened, as a short title (lib/notifications/registry.ts) over this
-- sentence. He read this wording in place on a dev build first ("Yeah I like
-- it").
--
-- WORDING ONLY. Every row below keeps its category, modes, channels, expiry and
-- status exactly as they were — and every timing and condition in its sentence
-- (a day before / the last two hours / within a day / a week or less) is the
-- old sentence's own. What changed is the phrasing: one voice ("we'll"), the
-- condition first, nothing said twice. 21 kinds: those a member in a running
-- pool can see today. Tournament kinds keep their wording; so does
-- pool_size_nudge, which already read well.
--
-- The same "registry rows" markers, so registry.guard.test.ts replays these on
-- top of 170–180.
-- =============================================================

insert into public.notification_types
  (type_key, category, modes, channels, is_transactional, expires, expiry_window, status, disclosure_sentence)
values
-- registry rows: begin
  ('matchweek_opened', 'PREDICTIONS', '{pickem,showdown}', '{email,push}', false, 'at_deadline', null, 'live', 'When a new matchweek opens, we''ll let you know, so you can pick before it locks.'),
  ('lock_reminder', 'PREDICTIONS', '{pickem,showdown}', '{email,push}', false, 'at_deadline', null, 'live', 'If you haven''t picked every match, we''ll remind you a day before the matchweek locks, and again in its last two hours. Once you''ve picked, the reminders stop.'),
  ('matchweek_completed', 'MATCH_RESULTS', '{pickem,showdown}', '{email,push}', false, 'after_window', '48 hours', 'live', 'When a matchweek is fully played and scored, we''ll tell you your points and where you stand.'),
  ('lms_pick_open', 'PREDICTIONS', '{last_man_standing}', '{email,push}', false, 'at_deadline', null, 'live', 'While you''re still in, we''ll let you know when each matchweek opens for your pick, with the clubs you''ve already used.'),
  ('lms_pick_reminder', 'PREDICTIONS', '{last_man_standing}', '{email,push}', false, 'at_deadline', null, 'live', 'If you''re still in and haven''t picked, we''ll remind you a day before the matchweek locks, and again in its last two hours. A missed pick knocks you out.'),
  ('pool_countdown', 'PREDICTIONS', '{pickem,showdown,last_man_standing,table}', '{email,push}', false, 'at_deadline', null, 'live', 'When your pool''s first deadline is a week or less away, we''ll tell you once when it starts and what you still need to pick.'),
  ('pool_countdown_admin', 'POOL_ACTIVITY', '{pickem,showdown,last_man_standing,table}', '{email,push}', false, 'at_deadline', null, 'live', 'If a pool you run starts within a week and two people or fewer have joined, we''ll tell you once, so you can share the code.'),
  ('table_deadline', 'PREDICTIONS', '{table}', '{email,push}', false, 'at_deadline', null, 'live', 'If you haven''t set your season table, we''ll remind you once in the three days before it locks.'),
  ('table_deadline_moved', 'PREDICTIONS', '{table}', '{email,push}', false, 'at_deadline', null, 'live', 'If your pool''s admin moves the table deadline, we''ll tell you the new date.'),
  ('pool_welcome', 'POOL_ACTIVITY', null, '{email,push}', false, 'after_window', '24 hours', 'live', 'When you join a pool, we''ll send you a welcome with a link to it.'),
  ('member_joined', 'POOL_ACTIVITY', null, '{push}', false, 'after_window', '24 hours', 'live', 'When someone joins a pool you run, we''ll let you know.'),
  ('member_removed', 'ADMIN', null, '{email,push}', false, 'after_window', '48 hours', 'live', 'If a pool''s admin removes you, we''ll let you know.'),
  ('points_adjusted', 'ADMIN', null, '{email,push}', false, 'after_window', '48 hours', 'live', 'If your pool''s admin adjusts your points, we''ll tell you by how much and why.'),
  ('pool_archived', 'ADMIN', null, '{email,push}', false, 'after_window', '48 hours', 'live', 'If an admin archives a pool you''re in, we''ll let you know.'),
  ('pool_restored', 'ADMIN', null, '{email,push}', false, 'after_window', '48 hours', 'live', 'If an archived pool you''re in is restored, we''ll let you know.'),
  ('chat_message', 'COMMUNITY', null, '{push}', false, 'after_window', '1 hour', 'live', 'When someone posts in your pool''s chat, we''ll let you know, unless you''ve blocked them.'),
  ('chat_mention', 'COMMUNITY', null, '{email,push}', false, 'after_window', '24 hours', 'live', 'When someone @mentions you in a pool''s chat, we''ll let you know.'),
  ('crew_invite', 'POOL_ACTIVITY', null, '{email,push}', false, 'never', null, 'live', 'When someone adds you to their crew, we''ll let you know.'),
  ('crew_seat_saved', 'POOL_ACTIVITY', null, '{email,push}', false, 'at_deadline', null, 'live', 'When your crew joins a competition, we''ll tell you a spot is saved for you until picks lock.'),
  ('crew_seat_reminder', 'POOL_ACTIVITY', null, '{email,push}', false, 'at_deadline', null, 'live', 'If you haven''t taken the spot your crew saved and picks lock within a day, we''ll remind you once.'),
  ('sportpool_news', 'NEWS', null, '{email}', false, 'never', null, 'live', 'Now and then we''ll email you about SportPool itself: what''s new, a short survey, or an invitation to start a pool of your own.')
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
