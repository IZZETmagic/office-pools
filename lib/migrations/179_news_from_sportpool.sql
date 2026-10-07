-- =============================================================
-- 179 — NEWS FROM SPORTPOOL, AND A KIND FOR EVERY EMAIL WE SEND
-- =============================================================
-- N4, step 4, part 1. Ryan, 2026-10-07, choosing:
--   * support replies and one-off emails to one person → "Always delivered";
--   * Broadcast, surveys and "start a pool" → "New switch: News from SportPool".
--
-- Every email is about to have to name its kind, as every push already does
-- (N4 step 1). Four of the things we send had none:
--
--   direct_email          ALWAYS DELIVERED (transactional) — a reply to someone
--                         who wrote to us, a one-off email to one person from
--                         their admin page, a correction to their entry. Like
--                         the Crew invite, no switch blocks it.
--   sportpool_news        the NEW eighth switch, NEWS — about SportPool itself,
--                         not a pool you are in: Broadcast, the surveys, "start a
--                         pool of your own". Until now only "unsubscribe from
--                         everything" stopped these.
--   pool_size_nudge       the three "your pool is small" emails a pool's admin
--                         may get (manual sends from the template sender).
--   predictions_reminder  the manual tournament reminders (the template sender
--                         and send-pending-reminders). Tournaments only.
--
-- NEWS is EMAIL ONLY: push preferences have one column per switch and none for
-- it, so a NEWS kind with push would be a push no switch could stop. Enforced
-- here, like Achievements' no-email rule. Its Resend topic is RESEND_TOPIC_NEWS.
-- The same "registry rows" markers, so registry.guard.test.ts reads these too.
-- =============================================================

alter table public.notification_types drop constraint notification_types_category_check;
alter table public.notification_types add constraint notification_types_category_check
  check (category = any (array['POOL_ACTIVITY', 'PREDICTIONS', 'MATCH_RESULTS', 'LEADERBOARD', 'ADMIN', 'COMMUNITY', 'GAMIFICATION', 'NEWS']));
alter table public.notification_types add constraint notification_types_news_is_email_only
  check (not (category = 'NEWS' and 'push' = any (channels)));

alter table public.notification_preferences drop constraint notification_preferences_category_check;
alter table public.notification_preferences add constraint notification_preferences_category_check
  check (category = any (array['POOL_ACTIVITY', 'PREDICTIONS', 'MATCH_RESULTS', 'LEADERBOARD', 'ADMIN', 'COMMUNITY', 'GAMIFICATION', 'NEWS']));

insert into public.notification_types
  (type_key, category, modes, channels, is_transactional, expires, expiry_window, status, disclosure_sentence)
values
-- registry rows: begin
  ('direct_email', 'ADMIN', null, '{email}', true, 'never', null, 'live', 'When you write to us, or something about your account needs it, we email you directly.'),
  ('sportpool_news', 'NEWS', null, '{email}', false, 'never', null, 'live', 'Now and then we email you about SportPool itself: what''s new, a short survey, or an invitation to start a pool of your own.'),
  ('pool_size_nudge', 'POOL_ACTIVITY', null, '{email}', false, 'never', null, 'live', 'If a pool you run has only a few members, we may email you ideas for getting more people in.'),
  ('predictions_reminder', 'PREDICTIONS', '{full_tournament,progressive,bracket_picker}', '{email}', false, 'at_deadline', null, 'live', 'Before a tournament deadline, if you still have predictions to make, we may email you a reminder.')
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
