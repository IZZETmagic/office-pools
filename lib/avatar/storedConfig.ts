// =============================================================
// What a member's avatar looks like, as a row
// =============================================================
// `AvatarConfig` (compose.ts) is what the COMPOSITOR takes. This is what the DATABASE holds, and
// the two are deliberately not the same shape. Three fields differ, each for its own reason:
//
//   background   NOT STORED. The avatar's background IS the member's colour, which already
//                lives in users.avatar_colour as a name and is what a Showdown duel glows with.
//                Storing a hex here would be the same fact in two columns, free to disagree.
//   mark         NOT STORED. It is the SportPool brand mark. The day it signals anything —
//                staff, a tier, a competition winner — a member could already have set it with
//                a PATCH, because migration 145's trigger is a deny-list and cannot see inside
//                a jsonb value. The render site supplies it.
//   fade         NOT STORED. A debug flag on the beard fade, not a member's choice.
//
// ⭐⭐ TWO FUNCTIONS, NOT ONE: STRICT ON WRITE, TOLERANT ON READ. This asymmetry is the whole
// point of the file and it is not fussiness:
//
//   * WRITING is the only moment we control the value, so it is the only moment rejection is
//     cheap. `isStoredAvatarBuild` refuses anything it does not recognise.
//   * READING happens against a row that may have been written by a DIFFERENT DEPLOY. Preview
//     and production serve different `avatar-assets.json` from the SAME url against the SAME
//     database, so a build saved on dev after an asset is renamed is read by production's older
//     bundle. `composeAvatar` throws on exactly one field — an unknown `base` (compose.ts) —
//     and everything else degrades to nothing. So `readStoredBuild` drops what it does not
//     recognise and NEVER throws: a member's own profile page must not 500 because a hairstyle
//     was renamed.
// =============================================================

import type { AvatarAssets, AvatarConfig } from './compose'

/** What lands in `users.avatar_build`. See the header for the three fields that are missing. */
export type StoredAvatarBuild = Omit<AvatarConfig, 'background' | 'mark' | 'fade'>

const COLOUR = /^#[0-9A-Fa-f]{6}$/

const isColour = (v: unknown): v is string => typeof v === 'string' && COLOUR.test(v)
const isSlotOrNull = (v: unknown): v is string | null =>
  v === null || (typeof v === 'string' && v.length > 0 && v.length <= 64)

/**
 * ⚠ STRICT — the write path. Mirrors `isAvatarColourName` in lib/design/avatarGradient.ts, which
 * is the repo's validation idiom: a hand-rolled type guard called inline at the update, because
 * there is no zod here and the column's CHECK is shape-only by design.
 *
 * ⚠⚠ `facialHairColour` MUST BE ABSENT OR A COLOUR — never `null`. Its absence is MEANINGFUL:
 * unset means "follow the hair, lifted by BEARD_LIFT", set means "use this verbatim". A guard
 * that reconstructs the object field by field would re-introduce it as null, which Postgres
 * stores and which is neither of those two things.
 *
 * ⚠ `expression` is mutually exclusive with `eyes` + `mouth`, and COMPOSE DOES NOT ENFORCE IT —
 * it emits the expression's halves and the separate eyes independently, so a config carrying
 * both renders two sets of eyes stacked. This guard is the only place that can catch it.
 */
export function isStoredAvatarBuild(v: unknown): v is StoredAvatarBuild {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const c = v as Record<string, unknown>

  if (typeof c.base !== 'string' || !c.base) return false
  for (const k of ['skin', 'hairColour', 'eyeColour', 'mouthColour', 'shirt'] as const) {
    if (!isColour(c[k])) return false
  }
  for (const k of ['hair', 'facialHair', 'glasses', 'earrings', 'garment',
                   'expression', 'eyes', 'mouth'] as const) {
    if (k in c && !isSlotOrNull(c[k])) return false
  }
  for (const k of ['facialHairColour', 'frameColour', 'metalColour'] as const) {
    if (k in c && c[k] !== undefined && !isColour(c[k])) return false
  }
  // the XOR compose cannot enforce
  if (c.expression && (c.eyes || c.mouth)) return false
  return true
}

/**
 * ⚠ TOLERANT — the read path. Returns null rather than throwing, and strips anything this
 * deploy's bundle cannot draw. See the header for why a stored row may legitimately name assets
 * that no longer exist.
 *
 * ⚠⚠ `base` IS THE ONE THAT MATTERS. `composeAvatar` throws on an unknown base and degrades on
 * everything else, so an unrecognised base must return null here and fall back to initials —
 * anything else is a 500 on the member's own profile.
 */
export function readStoredAvatarBuild(v: unknown, assets: AvatarAssets): StoredAvatarBuild | null {
  if (!isStoredAvatarBuild(v)) return null
  if (!assets.bases[v.base]) return null

  const known = <T extends Record<string, string>>(
    slot: string | null | undefined, family: T | undefined,
  ) => (slot && family && family[slot] ? slot : null)

  return {
    ...v,
    hair: known(v.hair, assets.hair),
    facialHair: known(v.facialHair, assets.facialhair),
    glasses: known(v.glasses, assets.glasses),
    earrings: known(v.earrings, assets.earrings),
    garment: known(v.garment, assets.garments),
    expression: known(v.expression, assets.expressions),
    eyes: known(v.eyes, assets.eyes),
    mouth: known(v.mouth, assets.mouths),
  }
}

/**
 * The single place the three unstored fields are put back. ⭐ `background` arrives as a resolved
 * COLOUR, not a user id — see `avatarBackgroundFor`: a duel has already resolved both sides
 * through `duelColourIndices` and has no user id left to ask, so a caller that took one could
 * not express the shifted case at all.
 */
export function toAvatarConfig(
  build: StoredAvatarBuild,
  background: string,
  opts: { mark?: boolean } = {},
): AvatarConfig {
  return { ...build, background, mark: opts.mark ?? false }
}

/**
 * ⚠ Strip the keys the column does not hold before writing. Spreading the builder's live config
 * straight into `.update()` would persist `background`, which is the one thing this design
 * exists to keep in a single column.
 */
export function toStoredAvatarBuild(cfg: AvatarConfig): StoredAvatarBuild {
  const { background: _bg, mark: _mark, fade: _fade, ...rest } = cfg
  // ⚠ Deleted, not set to null — see the note on facialHairColour in isStoredAvatarBuild.
  const out: Record<string, unknown> = { ...rest }
  for (const k of ['facialHairColour', 'frameColour', 'metalColour']) {
    if (out[k] == null) delete out[k]
  }
  return out as StoredAvatarBuild
}

// =============================================================
// Ownership — migration 183
// =============================================================
// ⭐ Some assets are GATED: only a member holding a grant may wear one. The database is the lock
// (a trigger on `users` refuses an unowned gated asset on any write, from any role), so everything
// below is the VIEW — what a picker offers — and never the thing that decides.
//
// ⚠⚠ THE PICKER WAITS FOR THIS, IT DOES NOT GUESS. Without the gated list there is no way to tell a
// gated key from a free one, so a host that has no `AvatarAccess` yet must not render the gateable
// grids at all. Treating "unknown" as "nothing is gated" would offer the gift to everyone, and the
// save would then fail on the lock with a message that explains nothing.

/** The slots an asset can be gated in. Mirrors the CHECK on `avatar_gated_assets.slot` (183). */
export const GATEABLE_SLOTS = ['hair', 'facialHair', 'glasses', 'earrings', 'garment'] as const
export type GateableSlot = (typeof GATEABLE_SLOTS)[number]

/** How a member came to own an asset. Mirrors the CHECK on `avatar_asset_grants.source`. */
export type GrantSource = 'gift' | 'earned' | 'purchase'

/**
 * ONE request for the whole answer: every gated asset, with the caller's own grant embedded.
 * ⭐ RLS on `avatar_asset_grants` returns only the caller's rows, so the embed is empty for anything
 * they do not own — no second query, and no way to see who else owns what.
 */
export const GATED_ASSETS_SELECT = 'slot, asset_key, avatar_asset_grants(source)'

/** A row as `GATED_ASSETS_SELECT` returns it. `unknown` fields: it comes off the wire. */
export type GatedAssetRow = {
  slot: unknown
  asset_key: unknown
  avatar_asset_grants: unknown
}

/** What this member may wear beyond the free set. Keys are `slot:asset_key`. */
export type AvatarAccess = {
  gated: ReadonlySet<string>
  owned: ReadonlyMap<string, GrantSource>
}

const accessKey = (slot: string, key: string) => `${slot}:${key}`

const isGrantSource = (v: unknown): v is GrantSource =>
  v === 'gift' || v === 'earned' || v === 'purchase'

/**
 * ⚠ TOLERANT, like `readStoredAvatarBuild`: a malformed row is still GATED (so it stays hidden)
 * but is never OWNED. Erring that way costs the owner a tile until it is fixed; erring the other
 * way would offer an asset to someone the lock will then refuse.
 */
export function toAvatarAccess(rows: readonly GatedAssetRow[]): AvatarAccess {
  const gated = new Set<string>()
  const owned = new Map<string, GrantSource>()
  for (const r of rows) {
    if (typeof r.slot !== 'string' || typeof r.asset_key !== 'string') continue
    const k = accessKey(r.slot, r.asset_key)
    gated.add(k)
    const grants = Array.isArray(r.avatar_asset_grants) ? r.avatar_asset_grants : []
    const source = (grants[0] as { source?: unknown } | undefined)?.source
    if (isGrantSource(source)) owned.set(k, source)
  }
  return { gated, owned }
}

/** What a picker may offer for one slot: every free asset, plus the gated ones this member owns. */
export function pickableKeys(
  slot: GateableSlot, keys: readonly string[], access: AvatarAccess,
): string[] {
  return keys.filter((k) => {
    const a = accessKey(slot, k)
    return !access.gated.has(a) || access.owned.has(a)
  })
}

/** How this member came to own `key`, or null if it is free or not theirs. Drives the Gift tag. */
export function ownedSource(
  slot: GateableSlot, key: string | null, access: AvatarAccess,
): GrantSource | null {
  return key === null ? null : access.owned.get(accessKey(slot, key)) ?? null
}
