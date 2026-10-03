-- =============================================================================================
-- 155 — An email invite is claimed by its LINK, not by its address
-- =============================================================================================
-- Ryan's call, 2026-10-02 (R36).
--
-- 154 let an invite to an address with no account be claimed by whoever signed up with that
-- address, "against a VERIFIED address only". Production has no such thing: email confirmation is
-- off, so Supabase stamps `email_confirmed_at` at sign-up — 4,820 of 4,825 email accounts were
-- "confirmed" within 5 seconds of being created, none are unconfirmed. A verified address proved
-- nothing, and whoever registered an invited address first would have taken the invite.
--
-- So the invite email carries a one-time link, and the invite goes to whoever opens it — which is
-- whoever can read that inbox. Only a SHA-256 of the token is stored: the database never holds
-- something that, read back, would open the invite.
--
--   · Set when the invite email is sent (lib/crews/notify.sendInviteNotice), for an invite to an
--     address with no account — never for an invite to an account.
--   · Cleared in the same UPDATE that resolves the invite (lib/crews/store.claimInviteByToken),
--     so a link works once.
--
-- Additive and nullable: nothing that runs today reads or writes it.
-- =============================================================================================

alter table public.crew_invites
  add column token_hash text;

-- Only an invite to an address carries a link. An invite to an account is answered in the app.
alter table public.crew_invites
  add constraint crew_invites_token_only_for_email check (token_hash is null or invitee_email is not null);

-- Looked up by hash when the link is opened; one invite per link.
create unique index crew_invites_token on public.crew_invites (token_hash) where token_hash is not null;

comment on column public.crew_invites.token_hash is
  'SHA-256 (hex) of the one-time link emailed to invitee_email. The invite goes to whoever opens the '
  'link, signed in — never to whoever signs up with a matching address (email confirmation is off; '
  'R36). Cleared when the invite resolves. See 155.';

comment on column public.crew_invites.invitee_email is
  'An address with no account yet, stored lowercase. Claimed by opening the emailed link (token_hash), '
  'never by a matching sign-up. See 155.';
