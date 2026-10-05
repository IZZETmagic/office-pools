-- =============================================================
-- 168 — EMAIL PREFERENCES LIVE IN POSTGRES
-- =============================================================
-- Question 5 of the notification plan. Ryan, 2026-10-05: "build it now."
--
-- Until now email preferences lived ONLY in Resend, as topic subscriptions,
-- and the preferences page asked Resend over the network on every load. Push
-- preferences live in push_notification_preferences. No single query could
-- say what a member is willing to receive.
--
-- notification_preferences is the one table every channel will share. Only
-- channel 'email' is written today — moving push in needs the app to change,
-- and this does not. It is SPARSE: a missing row means ENABLED, which is
-- correct because all six Resend topics default to opt_in (verified
-- 2026-10-05), so a row exists only where somebody changed something.
--
-- WHO WRITES IT — and members are deliberately granted NO write:
--   * PATCH /api/notifications/preferences updates Resend FIRST and this
--     table second, so a change can never land here and not where email is
--     actually enforced;
--   * POST /api/webhooks/resend, on contact.topics.updated — an unsubscribe
--     from an email's footer happens in Resend, and this brings it home;
--   * scripts/import-email-preferences.ts — the one-off copy, and re-syncs.
-- A member writing this table directly would change what their page shows
-- without changing what Resend sends. So: read your own, write nothing — no
-- write GRANT and no write policy, so there is no door to leave open.
-- =============================================================

create table public.notification_preferences (
  user_id    uuid        not null references public.users(user_id) on delete cascade,
  category   text        not null,
  channel    text        not null,
  enabled    boolean     not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, category, channel),
  constraint notification_preferences_category_check check (category in
    ('POOL_ACTIVITY', 'PREDICTIONS', 'MATCH_RESULTS', 'LEADERBOARD', 'ADMIN', 'COMMUNITY', 'GAMIFICATION')),
  constraint notification_preferences_channel_check check (channel in ('email', 'push', 'inapp'))
);

comment on table public.notification_preferences is
  'One row per member x category x channel that they CHANGED; a missing row means enabled. Email rows are kept equal to Resend: the preferences route writes Resend first, and the Resend webhook mirrors footer unsubscribes. Members read their own; only the server writes. Migration 168.';

alter table public.notification_preferences enable row level security;

revoke all on public.notification_preferences from anon, authenticated;
grant select on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.notification_preferences to service_role;

-- Supabase's guidance: TO a role, auth.uid() wrapped in a select so it is
-- evaluated once per statement, and no join back to the source table.
create policy "Members read their own notification preferences"
  on public.notification_preferences
  for select
  to authenticated
  using (
    user_id in (select u.user_id from public.users u where u.auth_user_id = (select auth.uid()))
  );
