-- =============================================================================================
-- 163 — An answered invite forgets its address
-- =============================================================================================
-- Ryan's call, 2026-10-04 (the Privacy Policy update for the App Store submission, option b).
--
-- A crew invite to an address with no account stores that address (154) — the address of someone
-- who has never signed up. The link path already dropped it (claimInviteByToken writes
-- invitee_email = null as the invite becomes the claimer's), but every OTHER way an invite closes
-- kept it for as long as the crew existed:
--   · the captain or co-captain withdraws it          (revokeInvite)
--   · the last member leaves and the crew closes      (leaveCrew → 'emptied')
--   · the captain disbands the crew                   (disbandCrew)
--
-- The policy now says: we keep the address only while the invite is waiting for an answer. This
-- migration makes that a property of the TABLE, not of whichever code path resolves the invite.
--
--   1. A BEFORE INSERT OR UPDATE trigger clears invitee_email on any row whose resolved_at is set.
--      It fires on every write, so any future resolve path is covered too.
--   2. The invitee CHECK becomes: open ⇒ exactly one invitee (as before); resolved ⇒ no address.
--      The trigger runs before the check, so a resolve that forgets the address still passes —
--      and a write that slips past the trigger is refused rather than stored.
--   3. A resolved invite may keep its token_hash (155) with no address beside it. That is how the
--      link page can still say "already used or withdrawn" instead of "isn't valid" to someone
--      opening a withdrawn invite. The hash is of a random token: it identifies no one.
--
-- ⭐ "No thanks sticks" is unaffected. It is checked by looking up earlier invites to the same
-- address (store.inviteToCrew), but an address invite can only be DECLINED through its link, and
-- the link turns it into an invite to the claimer's account (invitee_user_id) — so a decline was
-- never recorded against an address. Withdrawn invites never blocked a re-invite.
--
-- ⭐ The claim path's roll-back (claimInviteByToken, when joining fails) writes resolved_at = null
-- and puts the address back. With resolved_at null the trigger leaves it alone, so a second try
-- still works.
--
-- Backfill: resolved invites still holding an address. Production on 2026-10-04: 0 rows (2 invites
-- in total, both open, both to accounts).
-- =============================================================================================

-- 1. Forget the address once the invite is answered --------------------------------------------
create or replace function public.crew_invite_forgets_address()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.resolved_at is not null then
    new.invitee_email := null;
  end if;
  return new;
end;
$$;

comment on function public.crew_invite_forgets_address() is
  'A resolved crew invite keeps no email address: the address is held only while the invite is '
  'open. See 163.';

drop trigger if exists crew_invite_forgets_address on public.crew_invites;
create trigger crew_invite_forgets_address
  before insert or update on public.crew_invites
  for each row execute function public.crew_invite_forgets_address();

-- 2. Backfill ------------------------------------------------------------------------------------
update public.crew_invites
   set invitee_email = null
 where resolved_at is not null
   and invitee_email is not null;

-- 3. Constraints ---------------------------------------------------------------------------------
-- Open: exactly one of account / address. Resolved: never an address (the account may be either).
alter table public.crew_invites drop constraint if exists crew_invites_one_invitee;
alter table public.crew_invites
  add constraint crew_invites_one_invitee check (
    case
      when resolved_at is null then (invitee_user_id is null) <> (invitee_email is null)
      else invitee_email is null
    end
  );

-- An open link belongs to an address; a resolved invite may keep its hash for the "used" message.
alter table public.crew_invites drop constraint if exists crew_invites_token_only_for_email;
alter table public.crew_invites
  add constraint crew_invites_token_only_for_email check (
    token_hash is null or invitee_email is not null or resolved_at is not null
  );

comment on column public.crew_invites.invitee_email is
  'An address with no account, held only while the invite is open — cleared by '
  'crew_invite_forgets_address the moment it is answered, withdrawn or closed. See 154, 163.';
