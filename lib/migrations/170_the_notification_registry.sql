-- =============================================================
-- 170 — THE NOTIFICATION REGISTRY
-- =============================================================
-- N2 of the notification plan (The Notification Spine). Ryan, 2026-10-05:
-- "go ahead with N2."
--
-- One row per kind of notification SportPool sends. A row cannot exist
-- without its disclosure sentence: the one-sentence account of how the
-- notification actually works, which CLAUDE.md's disclosure gate asks for. A
-- kind we cannot explain plainly cannot be registered at all. The preferences
-- screens show these sentences to members word for word, under the switch
-- that controls them.
--
-- The seed was written from the CODE, sender by sender, on 2026-10-05 — not
-- from the plan's September catalogue, which listed 21 kinds. There are 34.
--
-- WHAT EACH COLUMN DECIDES
--   category   the member switch that governs it, one per kind. Two kinds
--              disagreed with themselves until today: deadline_changed (Admin
--              by email, Predictions by push) and round_open (Pool activity by
--              email, Predictions by push). Their senders now follow this.
--   modes      the game modes it can fire for: pools.league_mode for a league
--              pool, pools.prediction_mode for a tournament pool. NULL means
--              not tied to a mode (pool-level notices, Crews). Scoped by MODE,
--              not competition (decided 2026-10-05): the Premier League and La
--              Liga send the same notices, and a duel exists only in Showdown.
--   channels   where it goes today. 'inapp' arrives with the inbox (N5).
--   is_transactional   sent whatever the member's switches say. Exactly one
--              kind, matching how the code behaves today: a Crews invitation
--              emailed to an address with no account, which has no switches.
--   expires / expiry_window   Decision 16, written into the type: at the
--              deadline it is about, a fixed window after the event, or never
--              (Crews invitations — "no cut off"). The league notices already
--              enforce theirs in code; the rest are enforced from N3, when
--              sends go through the outbox.
--   status     live | planned | retired. Planned kinds (N7) are written down
--              so they pass the gate while being designed; nothing shows or
--              sends them. A kind is retired, never deleted: N3's outbox will
--              reference these rows.
--
-- NOT HERE, by design: Supabase Auth's own emails (password reset codes),
-- mail addressed to us (contact form, chat reports), and admin manual sends
-- (Broadcast, Templates, Send push) — how those treat preferences is N4.
--
-- ⚠ THE ROW FORMAT IS LOAD-BEARING. lib/notifications/registry.guard.test.ts
-- reads every row between the "registry rows" markers in every migration, and
-- fails unless lib/notifications/registry.ts lists exactly the same kinds with
-- the same category and status. One row per line, in exactly this shape. A
-- later migration changes the registry with the same markers and an upsert.
--
-- Members can read it. Only migrations write it.
-- =============================================================

create table public.notification_types (
  type_key            text primary key,
  category            text not null,
  modes               text[],
  channels            text[] not null,
  is_transactional    boolean not null default false,
  expires             text not null,
  expiry_window       interval,
  status              text not null default 'live',
  disclosure_sentence text not null,
  constraint notification_types_key_check check (type_key ~ '^[a-z][a-z0-9_]{2,47}$'),
  constraint notification_types_category_check check (category in
    ('POOL_ACTIVITY', 'PREDICTIONS', 'MATCH_RESULTS', 'LEADERBOARD', 'ADMIN', 'COMMUNITY', 'GAMIFICATION')),
  constraint notification_types_modes_check check (modes is null or (cardinality(modes) > 0 and modes <@ array[
    'full_tournament', 'progressive', 'bracket_picker', 'pickem', 'showdown', 'last_man_standing', 'table']::text[])),
  constraint notification_types_channels_check check (
    cardinality(channels) > 0 and channels <@ array['email', 'push', 'inapp']::text[]),
  -- Achievements has no email topic in Resend, so an Achievements email could
  -- never be switched off by the member it reached.
  constraint notification_types_no_achievements_email check (
    not (category = 'GAMIFICATION' and 'email' = any (channels))),
  constraint notification_types_expires_check check (expires in ('at_deadline', 'after_window', 'never')),
  constraint notification_types_window_check check ((expires = 'after_window') = (expiry_window is not null)),
  constraint notification_types_status_check check (status in ('live', 'planned', 'retired')),
  -- The disclosure gate, as a constraint: no sentence, no notification.
  constraint notification_types_sentence_check check (char_length(btrim(disclosure_sentence)) between 20 and 200)
);

alter table public.notification_types enable row level security;

revoke all on public.notification_types from anon, authenticated;
grant select on public.notification_types to authenticated;
grant select, insert, update, delete on public.notification_types to service_role;

create policy "Members read the notification registry"
  on public.notification_types for select to authenticated using (true);

insert into public.notification_types
  (type_key, category, modes, channels, is_transactional, expires, expiry_window, status, disclosure_sentence)
values
-- registry rows: begin
  ('matchweek_opened', 'PREDICTIONS', '{pickem,showdown}', '{email,push}', false, 'at_deadline', null, 'live', 'When a new matchweek opens for picks, we tell you, so you can pick before it locks.'),
  ('lock_reminder', 'PREDICTIONS', '{pickem,showdown}', '{email,push}', false, 'at_deadline', null, 'live', 'If you haven''t picked every match and the matchweek locks within 24 hours, we remind you once.'),
  ('matchweek_completed', 'MATCH_RESULTS', '{pickem,showdown}', '{email,push}', false, 'after_window', '48 hours', 'live', 'When a matchweek is fully played and scored, we tell you your points and where you stand.'),
  ('table_deadline', 'PREDICTIONS', '{table}', '{email,push}', false, 'at_deadline', null, 'live', 'If you haven''t set your season table and it locks within 72 hours, we remind you once.'),
  ('table_deadline_moved', 'PREDICTIONS', '{table}', '{email,push}', false, 'at_deadline', null, 'live', 'If your pool''s admin moves the table deadline, we tell you the new date.'),
  ('deadline_warning', 'PREDICTIONS', '{full_tournament,progressive,bracket_picker}', '{push}', false, 'at_deadline', null, 'live', 'If your predictions aren''t complete, we remind you 24 hours, 6 hours and 1 hour before the deadline.'),
  ('predict_reminder', 'PREDICTIONS', '{full_tournament,progressive,bracket_picker}', '{push}', false, 'at_deadline', null, 'live', 'If an entry of yours has no predictions saved and the deadline is under a week away, we remind you once a day.'),
  ('match_starting', 'PREDICTIONS', '{full_tournament,progressive,bracket_picker}', '{push}', false, 'at_deadline', null, 'live', 'About an hour before each match in your tournament kicks off, we tell you it''s starting.'),
  ('round_open', 'PREDICTIONS', '{progressive}', '{email,push}', false, 'at_deadline', null, 'live', 'When your pool''s admin opens a new round, we tell you, so you can predict it before it locks.'),
  ('deadline_changed', 'ADMIN', '{full_tournament,progressive,bracket_picker}', '{email,push}', false, 'at_deadline', null, 'live', 'If your pool''s admin changes the prediction deadline, we tell you the new one.'),
  ('predictions_submitted', 'PREDICTIONS', '{full_tournament,bracket_picker}', '{email}', false, 'after_window', '24 hours', 'live', 'When you submit your predictions, we email you a confirmation.'),
  ('round_submitted', 'PREDICTIONS', '{progressive}', '{email}', false, 'after_window', '24 hours', 'live', 'When you submit a round''s predictions, we email you a confirmation.'),
  ('predictions_auto_submitted', 'PREDICTIONS', '{full_tournament,bracket_picker}', '{email,push}', false, 'after_window', '24 hours', 'live', 'If the deadline passes while your entry has saved predictions, we submit them for you and tell you.'),
  ('round_auto_submitted', 'PREDICTIONS', '{progressive}', '{email,push}', false, 'after_window', '24 hours', 'live', 'If a round locks while you have saved predictions in it, we submit them for you and tell you.'),
  ('predictions_unlocked', 'ADMIN', '{full_tournament,progressive,bracket_picker}', '{email}', false, 'after_window', '24 hours', 'live', 'If your pool''s admin unlocks your submitted predictions, we tell you, so you can change them.'),
  ('prediction_result', 'MATCH_RESULTS', '{full_tournament,progressive,bracket_picker}', '{push}', false, 'after_window', '48 hours', 'live', 'When a match you predicted finishes, we tell you how your prediction scored.'),
  ('matchday_recap', 'MATCH_RESULTS', '{full_tournament,progressive,bracket_picker}', '{push}', false, 'after_window', '48 hours', 'live', 'When all of a day''s matches are finished, we sum up how you did in each pool.'),
  ('weekly_recap', 'MATCH_RESULTS', '{full_tournament,progressive,bracket_picker}', '{push}', false, 'after_window', '48 hours', 'live', 'On Sunday evenings, if any of your predictions were scored that week, we sum up your week.'),
  ('matchday_mvp', 'GAMIFICATION', '{full_tournament,progressive,bracket_picker}', '{push}', false, 'after_window', '48 hours', 'live', 'When you score the most points in your pool for a match, we tell you.'),
  ('streak_milestone', 'GAMIFICATION', '{full_tournament,progressive,bracket_picker}', '{push}', false, 'after_window', '48 hours', 'live', 'When your run of correct or missed predictions reaches 3, 5 or 10 matches, we tell you.'),
  ('badge_unlocked', 'GAMIFICATION', '{full_tournament,progressive,bracket_picker}', '{push}', false, 'after_window', '48 hours', 'live', 'When you earn a badge, we tell you which one.'),
  ('level_up', 'GAMIFICATION', '{full_tournament,progressive,bracket_picker}', '{push}', false, 'after_window', '48 hours', 'live', 'When your points take you up a level, we tell you.'),
  ('pool_welcome', 'POOL_ACTIVITY', null, '{email,push}', false, 'after_window', '24 hours', 'live', 'When you join a pool, we welcome you with a link to it.'),
  ('member_joined', 'POOL_ACTIVITY', null, '{push}', false, 'after_window', '24 hours', 'live', 'When someone joins a pool you run, we tell you.'),
  ('member_removed', 'ADMIN', null, '{email,push}', false, 'after_window', '48 hours', 'live', 'If a pool''s admin removes you from the pool, we tell you.'),
  ('points_adjusted', 'ADMIN', null, '{email,push}', false, 'after_window', '48 hours', 'live', 'If your pool''s admin adjusts your points, we tell you by how much and why.'),
  ('pool_archived', 'ADMIN', null, '{email,push}', false, 'after_window', '48 hours', 'live', 'If a pool you''re in is archived by its admin, we tell you.'),
  ('pool_restored', 'ADMIN', null, '{email,push}', false, 'after_window', '48 hours', 'live', 'If an archived pool you''re in is restored, we tell you.'),
  ('chat_message', 'COMMUNITY', null, '{push}', false, 'after_window', '1 hour', 'live', 'When someone posts in your pool''s chat, we tell you, unless you''ve blocked them.'),
  ('chat_mention', 'COMMUNITY', null, '{email,push}', false, 'after_window', '24 hours', 'live', 'When someone @mentions you in a pool''s chat, we tell you.'),
  ('crew_invite', 'POOL_ACTIVITY', null, '{email,push}', false, 'never', null, 'live', 'When someone adds you to their crew, we tell you.'),
  ('crew_invite_email', 'POOL_ACTIVITY', null, '{email}', true, 'never', null, 'live', 'When a crew captain invites an email address with no SportPool account, we email the invitation to it.'),
  ('crew_seat_saved', 'POOL_ACTIVITY', null, '{email,push}', false, 'at_deadline', null, 'live', 'When your crew joins a competition, we tell you a spot is saved for you until picks lock.'),
  ('crew_seat_reminder', 'POOL_ACTIVITY', null, '{email,push}', false, 'at_deadline', null, 'live', 'If you haven''t taken your saved spot and picks lock within a day, we remind you once.'),
  ('duel_drawn', 'POOL_ACTIVITY', '{showdown}', '{email,push}', false, 'at_deadline', null, 'planned', 'When the Showdown draw is made, we tell you your duel is set; who you face stays sealed until the reveal.'),
  ('duel_reveal_ready', 'POOL_ACTIVITY', '{showdown}', '{push}', false, 'at_deadline', null, 'planned', 'When your Showdown opponent is revealed, we tell you who it is.'),
  ('duel_result', 'MATCH_RESULTS', '{showdown}', '{email,push}', false, 'after_window', '48 hours', 'planned', 'When your Showdown duel is settled, we tell you the result.'),
  ('lms_eliminated', 'MATCH_RESULTS', '{last_man_standing}', '{email,push}', false, 'after_window', '48 hours', 'planned', 'If your Last Man Standing pick doesn''t win, we tell you you''re out.'),
  ('lms_survived', 'MATCH_RESULTS', '{last_man_standing}', '{push}', false, 'after_window', '48 hours', 'planned', 'When your Last Man Standing pick wins, we tell you you''re through to the next round.'),
  ('table_locked', 'PREDICTIONS', '{table}', '{email}', false, 'after_window', '48 hours', 'planned', 'When your season table locks, we send you the table you locked in.')
-- registry rows: end
;
