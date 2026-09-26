-- 147 — a member builds their face
--
-- ⭐ Stage 3 of a member's identity. 146 let them pick their COLOUR; this lets them build the
-- FACE that sits on it. The character avatar — 25 hair styles, 15 skin tones, expressions,
-- glasses, earrings, facial hair with its own colour, garments — has existed for weeks behind
-- one admin page whose Save button is labelled "Mock — saves nothing". This is the column that
-- makes it real.
--
-- ⭐⭐ IT STORES THE CONFIG, NOT AN IMAGE, and that is the whole architecture. Every field is
-- applied at compose time, so fixing an asset updates every avatar using it. Store rendered
-- images and that becomes impossible — you would be reissuing files instead of changing a row.
-- Measured: a config is ~325 bytes, the composed SVG is 15–66 KB, and composing takes 0.8 ms.
-- See the header of lib/avatar/compose.ts, which argues this at length.
--
-- ⭐⭐ IT DOES NOT STORE THE BACKGROUND. The avatar's background IS the member's colour, which
-- already lives in users.avatar_colour as a NAME and is what a Showdown duel glows with — 146's
-- own header says so. Storing a hex here would be the same fact in two columns, free to
-- disagree, and the disagreement would show as a member whose face and duel side are different
-- colours. The render derives it: AVATAR_BACKGROUNDS[avatarIndexFor(user_id, avatar_colour)].
-- Verified index-parity: 22 names, 22 backgrounds, and compose.ts's PALETTE.background is
-- byte-identical to AVATAR_BACKGROUNDS.
--
-- ⚠⚠ THE NAME IS `avatar_build`, NOT `avatar_config`, DELIBERATELY. The cosmetics backlog
-- reserves `users.avatar_config jsonb` for EQUIPPED, PAID cosmetics. Read the next warning
-- before reusing that name for anything.

alter table public.users
  add column if not exists avatar_build jsonb;

alter table public.users
  drop constraint if exists users_avatar_build_shape_ck;

-- ⚠ SHAPE ONLY, and size IS shape. The house style — 146, and 139's players CHECK — is that the
-- database enforces shape and TypeScript enforces vocabulary, because a CHECK listing asset names
-- would pin the database to a palette that is expected to grow and turn every new hairstyle into
-- a migration ordered against a deploy.
--
-- ⚠⚠ THE LENGTH BOUND IS NOT DECORATION. This column is written by the BROWSER with the anon key
-- (the same path avatar_colour takes), so without a bound a member can PATCH a 10 MB value and
-- nothing anywhere stops them. There is no precedent to copy because the repo has this same gap
-- elsewhere: a banter message is capped at 2000 characters in the DOM and at nothing in the
-- database. A real config is ~325 bytes, so 2048 is 6x headroom.
alter table public.users
  add constraint users_avatar_build_shape_ck
  check (
    avatar_build is null
    or (jsonb_typeof(avatar_build) = 'object' and length(avatar_build::text) <= 2048)
  );

comment on column public.users.avatar_build is
  'The member''s character-avatar configuration, or NULL if they have not built one. '
  'Composed at render by lib/avatar/compose.ts. Does NOT contain the background — that is '
  'derived from avatar_colour. Cosmetic only: see migration 147 on why nothing gated may live '
  'in here.';

-- ⚠⚠ WHAT THIS MIGRATION DELIBERATELY DOES NOT DO — the section 145 and 146 both end with.
--
-- No grant and no policy. `authenticated` already holds a TABLE-level UPDATE on public.users
-- which covers columns added later, and the row scope comes from the existing policy
-- `Users can update own profile` (auth_user_id = auth.uid()). 146 relied on exactly this.
--
-- 🔴 IT DOES NOT — AND CANNOT — GUARD WHAT IS INSIDE THE JSON. 145's trigger
-- guard_users_privilege_columns is a DENY-LIST of four named columns; it cannot see into a jsonb
-- value. Everything in here is therefore self-writable by the member, forever, by design. That
-- is correct for a cosmetic and WRONG for anything earned, paid for, or granted:
--
--   * an entitlement stored as a key in here would be settable with a single PATCH
--   * so would a badge, a tier marker, or a staff flag
--
-- Anything gated MUST be its own column, or its own table with its own policy — never a key in
-- this object. That is also why `mark` (the SportPool brand mark) is excluded from the stored
-- type in lib/avatar/storedConfig.ts and supplied by the render site instead: it is the one
-- existing field that could plausibly come to mean something.
--
-- It also does not address the pre-existing hole 145 recorded: `Users can view all profiles` is
-- granted to PUBLIC with `using (true)`, so this column — like every other — is readable with the
-- anon key. It is cosmetic, so that is acceptable here; it would not be for anything else.
