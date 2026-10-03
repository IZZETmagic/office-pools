-- =============================================================================================
-- 156 — An invite that was never sent still goes
-- =============================================================================================
-- Ryan's call, 2026-10-02 (Gill's finding while recording 8b).
--
-- An invite's push/email was sent only at the moment of adding (lib/crews/notify.sendInviteNotice),
-- and only if `sync_settings.crew_notices_enabled` was on then. An invite made while the switch was
-- off — or whose request died before sending — was never sent and never retried. Since 155 that is
-- worse for an address with no account: its one-time link is armed only as the email goes out, so
-- an unsent invite could never be claimed at all, and it would sit open, quietly answering "Invite
-- sent" to any repeat (one open invite per address).
--
-- `notified_at` is the same claim the seat notices use (crew_seats.notified_at): set by a
-- conditional UPDATE that only succeeds while it is still NULL, before anything is sent — so the
-- moment of adding and the cron (lib/crews/notify.runCrewNotices) can both try, and exactly one
-- sends. Like the seat notices, a claimed invite whose send fails is NOT retried: one missed
-- message is better than two. The captain can withdraw it and add the person again.
--
-- Additive and nullable. Production has no invites yet (checked 2026-10-02).
-- =============================================================================================

alter table public.crew_invites
  add column notified_at timestamptz;

-- The cron's catch-up: open invites nobody has sent yet, oldest first.
create index crew_invites_unsent on public.crew_invites (created_at)
  where resolved_at is null and notified_at is null;

comment on column public.crew_invites.notified_at is
  'When its one push/email was claimed for sending — at the moment of adding, or by the crew-notices '
  'cron if that did not happen (switch off, request died). Claimed before sending; never retried. '
  'See 156.';
