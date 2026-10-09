# Avatar asset grants: one member can own an asset nobody else can wear

**Status:** APPROVED 2026-10-09 (rule-17 change ✅, Gift tag ✅). Steps 1–2 BUILT and committed;
migration 183 verified in a rolled-back transaction against production (16/16) but **not applied**.
Nothing pushed, no OTA. Step 3 waits on Q1 (what the gift is).

**Built differently from this draft, deliberately:**
- `anon` reads **nothing** (the draft said everyone). The only reader is the signed-in editor.
- "Fails closed" became **the editor waits**: without the gated list a gated key and a free one look
  identical, so there is nothing to hide *by*. Both editors show their loading state until ownership
  arrives, and the error state if the read fails. ⚠ Consequence: the picker code must not ship before
  183 is applied, or every editor shows "Could not load your avatar options."
- The onboarding concepts (`shared.tsx`) are **not** filtered: they are dev-only and never save, so
  the failure the draft feared (a randomiser drawing a gated asset, then a failed save) cannot happen.
**Trigger:** a one-off gift for a friend (2026-10-09). It's being built as the foundation for what
comes later: earned items, and eventually the paid cosmetics in `MONETIZATION_V2.md` §5a.

---

## 1. What it's for

A member can **own** an avatar asset. Nobody else can see it in their picker, and nobody else can
wear it, even with a forged request. Everyone else still *sees* it on the owner's face.

How the member came to own it is one column on the ownership row (`gift`, later `earned`, later
`purchase`). The gift, an earned item and a bought item all use the same lock, so the future cases
don't need a redesign.

## 2. ⚠ The recorded decision this changes, stated up front

`MONETIZATION_V2.md` **binding rule 17**: *"A paid entitlement never lives in a member-writable
column. Its own table, its own policy, and **the renderer intersects equipped-with-entitled
server-side**."* Migration 147 says the same thing and reserves `users.avatar_config` for equipped
paid items.

This plan **keeps the first two parts** (ownership lives in its own table with its own policy).
It **replaces the third**, render-time intersection, with a **write-time lock in the database**.

**Why:** there's no single server render to intersect at. The phone reads `avatar_build`
**straight from Supabase** in `useHomeData.ts:484`, `useMemberRoster.ts:68` and
`useMemberDetail.ts:64`, and composes the avatar on the device. Intersecting at render would mean
moving those reads behind the API and changing ~15 readers. A trigger on `users` gives the same
guarantee from one place: **nothing un-owned is ever stored, so nothing un-owned is ever drawn.**
That includes old app bundles, because they only ever read what the trigger let through.

**Knock-on effect:** the reserved `avatar_config` column isn't needed. Equipped items stay in
`avatar_build`, so a face stays one column, one compositor input, one answer. 147's line *"nothing
gated may live in here"* becomes *"nothing gated may live in here unguarded."* If approved, I
update rule 17's wording and record the change in the new migration's header.

## 3. Design

### 3.1 Two tables (migration 183)

| Table | Holds | Who reads | Who writes |
|---|---|---|---|
| `avatar_gated_assets` (`slot`, `asset_key`, `note`, `created_at`) | Which assets need ownership | Signed-in members (not anon) | Service role only |
| `avatar_asset_grants` (`user_id`, `slot`, `asset_key`, `source`, `granted_by`, `note`, `granted_at`) | Who owns what | **A member reads only their own rows** | Service role only |

- `slot` uses the **build's** key names (`hair`, `facialHair`, `glasses`, `earrings`, `garment`),
  not the catalog's (`facialhair`, `garments`), because the lock reads the build.
- v1 allows only those five slots, each of which has a "none" to fall back to. **Expression, eyes
  and mouth are excluded**: revoking one would leave a face with no eyes or mouth.
- `source` is CHECK-constrained to `gift | earned | purchase`. Only `gift` is used in v1. Having
  the word in the vocabulary doesn't ship anything.
- Grants are keyed on `user_id`, so they belong to the account, not to a pool (MONETIZATION_V2
  constraint 3).
- RLS is on for both tables, and insert/update/delete are revoked from `anon` and `authenticated`
  (the 182 "door" pattern). **No member-writable path to ownership exists.**

### 3.2 The lock

A `BEFORE INSERT OR UPDATE` trigger on `public.users`, active only when `avatar_build` actually
changes. For every gated asset named in the new build, it checks that the row's `user_id` holds a
grant; otherwise it **raises 42501**. A forged PATCH fails loudly instead of being quietly stripped.

⚠ **Unlike 145, the service role is not exempt.** Ownership should have one answer: a seed script
or an admin tool grants first, then equips. No context can put an asset on a face without owning it.

### 3.3 Revoking a grant removes the asset

An `AFTER DELETE` trigger on `avatar_asset_grants` sets that slot to `null` in the owner's
`avatar_build`, in the same transaction. Revocation can't be forgotten halfway. This is what makes
the write-time lock safe for refunds later.

⚠ The foreign key from grants to gated assets is `ON DELETE RESTRICT`, not `CASCADE`. Un-gating an
asset (making it free for everyone) must **not** silently strip it from its owners' faces. That has
to be a deliberate two-step, and it isn't in v1.

### 3.4 Rule 18 enforced by the database

MONETIZATION_V2 rule 18: *"Nothing live and free moves behind a player paywall."* A `BEFORE INSERT`
trigger on `avatar_gated_assets` refuses to gate an asset that any member already wears. You can
gate new art. You can't take away something people already have.

### 3.5 The pickers

- **One shared, pure helper** `pickableOptions(keys, slot, access)` in `lib/avatar/storedConfig.ts`.
  That file is already mirrored to `mobile/` under the drift guard in `avatarMirror.guard.test.ts`,
  so web and phone run the same code.
- **It fails closed:** if the ownership read fails, every gated asset is hidden. The trigger is the
  real lock; the picker is only the view.
- **Data:** two direct Supabase reads (the gated list, plus my own grants), with RLS doing the
  scoping. No new API route.
- **Call sites:**
  - Web `components/avatar/AvatarBuilder.tsx`: hair :621, glasses :634, earrings :651, facial hair
    :701, garment :736.
  - RN `mobile/app/profile/avatar.tsx`: :416, :439, :459, :518, :548.
  - RN `mobile/components/onboarding/concepts/shared.tsx` :89–91, :424. It's dev-only, but its
    randomisers could draw a gated asset and then fail on save, so it gets the filter too.
  - Admin `AvatarsTab` stays **unfiltered** on purpose: it's the art gallery.
- **The art goes in the normal catalog** (`public/avatar-assets.json`), because the compositor looks
  slots up there and every phone needs it to draw the owner's face for everyone else. The picture
  is public; only the right to wear it is restricted.

### 3.6 Granting

v1 is `scripts/grant-avatar-asset.ts --user <username> --slot hair --key <key> --note "…"`.
- **Dry run by default, `--apply` to write** (the repo's convention). `--revoke` removes a grant.
- It creates the gated row if it's missing (the §3.4 check runs here), then the grant.

An admin UI comes later.

## 4. Deliberately NOT in v1

A shop or any purchase path (MONETIZATION_V2's gates are untouched) · automatic grants for earned
items · an admin UI · gating expression, eyes or mouth · new layer types such as hats (see §8 Q1) ·
anything shown to *other* members beyond the face itself.

## 5. Release order (it matters)

1. **Migration 183.** On its own it changes nothing, because there are no gated rows yet. Verify
   it (§6) before anything else.
2. **Picker filter.** Commit → push on your word → `Vercel` check green → OTA **per platform**
   (iOS, then Android), with a clean `git status` first and both Commit lines checked.
3. **The gift.** Generate the art (Recraft) → add it to `assets/character-base/nano/<slot>/assets/`
   → `build-builder.py` → run the grant script with `--apply` → **only then** deploy the catalog.
   ⚠ The gated row must exist **before** the art reaches the catalog. Otherwise there's a window
   where anyone can equip it.

**Accepted risk:** a phone still on the pre-OTA bundle shows the gift in its picker until it
updates. Picking it fails on save with "That avatar could not be saved." Nobody can wear it.

## 6. Verification

- **Database**, in a rolled-back transaction, as `authenticated` with a **real non-super-admin's**
  claims and with flipped values (per the privilege-escalation lessons):
  1. Equipping a gated asset without a grant → 42501.
  2. Inserting your own grant → denied.
  3. Equipping it with a grant (inserted as service role) → succeeds.
  4. Deleting the grant → the slot comes back `null`.
  5. Gating an asset someone already wears → refused.
  6. Anon reading the gated list → allowed; a member reading someone else's grants → 0 rows.
- **Unit:** tests for `pickableOptions`; the mirror guard stays green; full vitest; tsc at the known
  baseline (web: 3 pre-existing FormData errors).
- **Web:** the builder in the browser pane, checking that a non-owner doesn't see the asset. For
  the owner's view, with your OK, I grant **you** the same asset for the check and revoke it
  afterwards.
- **RN:** native builds can't run here, so the screen is checked in Metro and the logic is covered
  by the shared helper's tests.

## 7. The gates

The grant table isn't a mechanic, so it doesn't need the five gates itself. **Each use of it does.**

- **The gift passes disclosure:** *"Ryan made this for you; only you can wear it."*
- **Earned items** (later) need the **affect** gate taken seriously: in a family pool, an item only
  one person can wear can produce envy rather than pride. Run the 15-year-old check when that's
  designed.
- **Paid items** stay behind MONETIZATION_V2's existing gate (PL plus a second league, >40% built
  an avatar). Nothing here opens it.

## 8. Open questions only Ryan can answer

1. **What is the gift?** A hairstyle, glasses, earrings, facial hair or a garment fits this plan
   as written. Something new (a hat, a badge, a background element) is a new layer in the
   compositor on web and phone plus the parity script, and I'd plan that separately. Does the art
   exist yet?
2. **Do you approve the rule-17 change in §2?** Write-time lock instead of render-time
   intersection, and the `avatar_config` reservation retired.
3. **Gift tag on the owner's tile?** I recommend yes: a small "Gift" label so the friend knows why
   it's there. Nobody else ever sees it.
