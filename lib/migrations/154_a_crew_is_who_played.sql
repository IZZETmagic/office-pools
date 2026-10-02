-- 154 — a crew is who played
--
-- The Crews schema (drafts/2026-10-02_crews_plan.md §4; the decisions of 2026-10-02 in §9 and §11;
-- programme Decisions 1–3 as amended that day). Tables only — nothing writes them yet.
--
-- THE RULES THE SHAPE ENCODES
--   · You are in a crew because you PLAYED in one of its pools, or because you said yes when its
--     captain or co-captain ADDED you by exact username or email. There is no friends list.
--   · A pool is a season: crews sit BESIDE today's pools through pools.crew_id. Nothing migrates —
--     all 643 existing pools keep crew_id NULL until an admin saves one.
--   · A held seat is NOT a membership and NOT an entry. It is open while unresolved and before the
--     pool's first lock — pool_first_lock_at() from 153 — so its expiry is DERIVED, never stored, and
--     needs no cron.
--   · Exits stick: left_at/left_reason are set once. Leavers can rejoin themselves; the removed only
--     by being added back. History is read from pool_entries, so it survives any exit.
--   · A crew pool is never listed (Decision 6): CHECK on pools, because admins write pools directly.
--
-- WHY A left_at FLAG HERE, WHEN 056 REJECTED ONE FOR pool_members: 056's reason was the 136 sites
-- that read pool_members and the 23 migrations of RLS keyed on it — miss one filter and a departed
-- member keeps access. crew_members is new, has one reader (lib/crews/), and is never reached
-- through RLS. The argument does not transfer.
--
-- ⚠ ALL FOUR TABLES ARE DENY-ALL: RLS on, zero policies, admin client only. Every read and write
-- goes through an API route. That keeps the 145/151/152 class — a client writing a role or a
-- privilege column — off these tables by construction: there is nothing for a client to write.
-- They are listed in lib/league/__tests__/denyAllTables.guard.test.ts.

-- ── crews ───────────────────────────────────────────────────────────────────────────────────────
create table public.crews (
  crew_id               uuid primary key default gen_random_uuid(),
  name                  text not null check (char_length(btrim(name)) between 1 and 60),
  created_by            uuid references public.users (user_id) on delete set null,
  -- The pool it was saved from ("Keep this group together?"); NULL for a crew created directly.
  created_from_pool_id  uuid references public.pools (pool_id) on delete set null,
  created_at            timestamptz not null default now(),
  -- Set when the last member leaves (decision 9). History stays in the pools; the crew is never
  -- shown again and gets no seats.
  closed_at             timestamptz
);

comment on table public.crews is
  'A permanent group (Decision 1). Membership in crew_members; seasons are pools with crew_id set. '
  'Deny-all: admin client only. See 154.';

-- ── crew_members ────────────────────────────────────────────────────────────────────────────────
create table public.crew_members (
  crew_id             uuid not null references public.crews (crew_id) on delete cascade,
  user_id             uuid not null references public.users (user_id) on delete cascade,
  role                text not null default 'member' check (role in ('captain', 'co_captain', 'member')),
  joined_at           timestamptz not null default now(),
  -- How they got in: played in a crew pool, accepted a direct add, or made the crew.
  joined_via          text not null check (joined_via in ('played', 'invite', 'created')),
  joined_via_pool_id  uuid references public.pools (pool_id) on delete set null,
  left_at             timestamptz,
  left_reason         text check (left_reason in ('left', 'removed')),
  primary key (crew_id, user_id),
  constraint crew_members_left_pair check ((left_at is null) = (left_reason is null))
);

-- One captain and at most one co-captain among the people still in the crew.
create unique index crew_members_one_captain
  on public.crew_members (crew_id) where role = 'captain' and left_at is null;
create unique index crew_members_one_co_captain
  on public.crew_members (crew_id) where role = 'co_captain' and left_at is null;
-- My Crews: the crews a person is in.
create index crew_members_by_user on public.crew_members (user_id) where left_at is null;

comment on table public.crew_members is
  'Who is in a crew. Played in one of its pools, or accepted a direct add. Exits stick '
  '(left_at/left_reason). Deny-all: admin client only. See 154.';

-- ── crew_seats — a held seat ────────────────────────────────────────────────────────────────────
create table public.crew_seats (
  pool_id      uuid not null references public.pools (pool_id) on delete cascade,
  user_id      uuid not null references public.users (user_id) on delete cascade,
  crew_id      uuid not null references public.crews (crew_id) on delete cascade,
  held_at      timestamptz not null default now(),
  -- Open = resolved_at IS NULL AND now() < pool_first_lock_at(pool_id). Expiry is derived (153);
  -- 'released' is for an explicit release — leaving the crew, or being removed.
  resolved_at  timestamptz,
  resolution   text check (resolution in ('taken', 'declined', 'released')),
  -- Decision 2's one notice and one reminder, each sent once (the league-outbox pattern).
  notified_at  timestamptz,
  reminded_at  timestamptz,
  primary key (pool_id, user_id),
  constraint crew_seats_resolved_pair check ((resolved_at is null) = (resolution is null))
);

create index crew_seats_open_by_user on public.crew_seats (user_id) where resolved_at is null;

comment on table public.crew_seats is
  'A held seat: a reserved spot for a crew member in a crew pool. Not a membership, not an entry. '
  'Open while unresolved and before pool_first_lock_at(). Deny-all. See 154.';

-- ── crew_invites — a direct add, waiting for one Join tap ───────────────────────────────────────
create table public.crew_invites (
  invite_id        uuid primary key default gen_random_uuid(),
  crew_id          uuid not null references public.crews (crew_id) on delete cascade,
  invited_by       uuid references public.users (user_id) on delete set null,
  -- Matched by exact username or email…
  invitee_user_id  uuid references public.users (user_id) on delete cascade,
  -- …or an address with no account yet, claimed at sign-up against a VERIFIED address only.
  -- Stored lowercase (no citext on this project).
  invitee_email    text check (invitee_email is null or invitee_email = lower(btrim(invitee_email))),
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  resolution       text check (resolution in ('joined', 'declined', 'revoked')),
  constraint crew_invites_one_invitee check ((invitee_user_id is null) <> (invitee_email is null)),
  constraint crew_invites_resolved_pair check ((resolved_at is null) = (resolution is null))
);

-- One open invite per person per crew.
create unique index crew_invites_open_user
  on public.crew_invites (crew_id, invitee_user_id) where resolved_at is null and invitee_user_id is not null;
create unique index crew_invites_open_email
  on public.crew_invites (crew_id, invitee_email) where resolved_at is null and invitee_email is not null;
create index crew_invites_by_user  on public.crew_invites (invitee_user_id) where resolved_at is null;
create index crew_invites_by_email on public.crew_invites (invitee_email)   where resolved_at is null;

comment on table public.crew_invites is
  'A direct add by exact username or email, waiting for one Join tap. "No thanks" (declined) stops '
  'that crew re-inviting — enforced in lib/crews. Deny-all. See 154.';

-- ── pools: the season's crew, and "Not now" on Keep this group together? ───────────────────────
alter table public.pools
  add column crew_id uuid references public.crews (crew_id) on delete set null,
  add column crew_prompt_dismissed_at timestamptz;

-- Decision 6: a crew pool is never listed in Discover. A CHECK, not a hidden toggle, because pool
-- admins update pools directly from the client. `is true`, because is_private is nullable and a NULL
-- would pass a plain CHECK.
alter table public.pools
  add constraint pools_crew_pool_is_private check (crew_id is null or is_private is true);

create index pools_by_crew on public.pools (crew_id) where crew_id is not null;

-- crew_id is set once, by the server, and never moves: a season belongs to the crew that played it.
-- An end-user role may not touch it at all — not on UPDATE (a pool admin could attach their pool to
-- someone else's crew) and not on INSERT (the pools INSERT policy only checks admin_user_id, so a
-- client can create a pool directly). A trusted writer may set it from NULL; nothing changes it after.
create or replace function public.guard_pool_crew_id()
returns trigger
language plpgsql
security invoker          -- current_user must be the caller's role (see 152)
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.crew_id is not null and current_user in ('authenticated', 'anon') then
      raise exception 'pools: crew_id is set by the server only' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.crew_id is not distinct from old.crew_id then
    return new;
  end if;
  if current_user in ('authenticated', 'anon') then
    raise exception 'pools: crew_id is set by the server only' using errcode = '42501';
  end if;
  if old.crew_id is not null then
    raise exception 'pools: a pool''s crew is fixed once set (it was %)', old.crew_id using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.guard_pool_crew_id() is
  'pools.crew_id: never written by an end-user role; set once from NULL by a trusted writer; never '
  'changed after. See 154.';

create trigger pools_guard_crew_id
  before insert or update of crew_id on public.pools
  for each row
  execute function public.guard_pool_crew_id();

-- ── deny-all ────────────────────────────────────────────────────────────────────────────────────
alter table public.crews        enable row level security;
alter table public.crew_members enable row level security;
alter table public.crew_seats   enable row level security;
alter table public.crew_invites enable row level security;

revoke all on public.crews, public.crew_members, public.crew_seats, public.crew_invites from anon, authenticated;
