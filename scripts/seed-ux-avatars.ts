// seed-ux-avatars — give every `ux-` test account a face
//
// The home cards draw real avatars now, but almost nobody has built one, so the
// member stack renders as initials and the feature cannot be reviewed. This gives
// the nine UI/UX seed accounts an avatar each, which fills the visible three slots
// on the six UI/UX pools.
//
// ⚠⚠ THE FILTER IS THE EMAIL, NOT A ROLE, and that is deliberate — the same choice
// `seed-league-ux-picks.ts` documents. A role, a flag, or "everyone in the UX pools"
// would sweep in real members, and this writes to the production `users` table. The
// pattern is anchored at BOTH ends: `^ux-<something>@sportpool.app$`.
//
// ⚠ IDEMPOTENT AND DETERMINISTIC. The config for an account is derived from a hash
// of its email, so re-running produces the same faces rather than reshuffling them,
// and an account that already has an avatar is skipped unless --force is passed.
//
// Usage:
//   npx tsx scripts/seed-ux-avatars.ts            # dry run, writes nothing
//   npx tsx scripts/seed-ux-avatars.ts --apply
//   npx tsx scripts/seed-ux-avatars.ts --apply --force   # overwrite existing faces

import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'

;(() => {
  // Walk up for `.env.local` — same reason as the other seed scripts: a git
  // worktree has no env file of its own and the real one is a few levels up.
  let dir = process.cwd()
  for (;;) {
    try {
      const envContent = readFileSync(resolve(dir, '.env.local'), 'utf8')
      for (const line of envContent.split('\n')) {
        const t = line.trim()
        if (!t || t.startsWith('#')) continue
        const i = t.indexOf('=')
        if (i === -1) continue
        const k = t.slice(0, i).trim()
        let v = t.slice(i + 1).trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
        if (!process.env[k]) process.env[k] = v
      }
      return
    } catch {
      const up = dirname(dir)
      if (up === dir) throw new Error('no .env.local in this directory or any above it')
      dir = up
    }
  }
})()

import { createAdminClient } from '../lib/supabase/server'
import { PALETTE, type AvatarAssets } from '../lib/avatar/compose'
import { readStoredAvatarBuild, type StoredAvatarBuild } from '../lib/avatar/storedConfig'
import { AVATAR_COLOUR_NAMES } from '../lib/design/avatarGradient'

const admin = createAdminClient()
const APPLY = process.argv.includes('--apply')
const FORCE = process.argv.includes('--force')

/** ⚠ Anchored at both ends. `like 'ux-%'` alone would match a real `ux-...@gmail.com`. */
const UX_EMAIL = /^ux-[^@]+@sportpool\.app$/

const assets = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'public', 'avatar-assets.json'), 'utf8'),
) as AvatarAssets

/**
 * A small deterministic PRNG seeded from the email.
 *
 * ⭐ Deterministic ON PURPOSE. Re-running must not reshuffle nine faces that Ryan
 * has already looked at — a seed script that produces different output each run
 * makes "did that change?" unanswerable.
 */
function rngFor(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h ^= h << 13; h >>>= 0
    h ^= h >> 17
    h ^= h << 5; h >>>= 0
    return h / 4294967296
  }
}

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
/** null with probability `p`, otherwise a member of `xs`. */
const maybe = <T,>(r: () => number, xs: readonly T[], p: number): T | null =>
  r() < p ? null : pick(r, xs)

function buildFor(email: string): { build: StoredAvatarBuild; colour: string } {
  const r = rngFor(email)

  const hairKeys = Object.keys(assets.hair)
  const fhKeys = Object.keys(assets.facialhair)
  const glassesKeys = Object.keys(assets.glasses)
  const earringKeys = Object.keys(assets.earrings)
  const garmentKeys = Object.keys(assets.garments)
  const exprKeys = Object.keys(assets.expressions)
  const baseKeys = Object.keys(assets.bases)

  const build = {
    base: pick(r, baseKeys),
    skin: pick(r, PALETTE.skin),
    hair: maybe(r, hairKeys, 0.05),
    hairColour: pick(r, PALETTE.hair),
    eyeColour: pick(r, PALETTE.eye),
    mouthColour: pick(r, PALETTE.mouth),
    shirt: pick(r, PALETTE.shirt),
    garment: maybe(r, garmentKeys, 0.2),
    glasses: maybe(r, glassesKeys, 0.55),
    earrings: maybe(r, earringKeys, 0.6),
    facialHair: maybe(r, fhKeys, 0.55),
    /**
     * ⚠⚠ `expression` IS EXCLUSIVE WITH `eyes` AND `mouth` — `isStoredAvatarBuild`
     * rejects a config carrying both, so these two are pinned null rather than
     * randomised.
     */
    expression: pick(r, exprKeys),
    eyes: null,
    mouth: null,
    /**
     * ⚠⚠ `facialHairColour` IS DELIBERATELY ABSENT. Unset does NOT mean "the same
     * hex as the hair" — the fallback applies a lift of +12 per channel, so writing
     * `facialHairColour: hairColour` would render a beard measurably flatter than
     * the same config with the key omitted. Absence is the value.
     */
  } as unknown as StoredAvatarBuild

  // Accessory colours only matter when the accessory is present; omitted otherwise
  // so a stored config never carries a colour for a slot it does not use.
  const withColours: Record<string, unknown> = { ...build }
  if (build.glasses) withColours.frameColour = pick(r, PALETTE.hair)
  if (build.earrings) withColours.metalColour = pick(r, ['#D4A017', '#C0C0C0', '#B76E79'])

  return {
    build: withColours as unknown as StoredAvatarBuild,
    colour: pick(r, AVATAR_COLOUR_NAMES),
  }
}

async function main() {
  console.log('')
  console.log('  Giving the ux- test accounts a face')
  console.log(`  ${APPLY ? 'APPLY — this writes to production' : 'DRY RUN — nothing is written. Add --apply.'}`)
  console.log('')

  const { data, error } = await admin
    .from('users')
    .select('user_id, email, full_name, avatar_build')
    .like('email', 'ux-%@sportpool.app')

  if (error) throw new Error(`could not read the ux- accounts: ${error.message}`)

  // ⚠ The `like` above is the coarse filter; this is the one that decides. A row
  // that does not match the anchored pattern is dropped and reported, never written.
  const rows = (data ?? []).filter((u) => {
    if (UX_EMAIL.test(u.email ?? '')) return true
    console.log(`  SKIP  ${u.email} — does not match ^ux-…@sportpool.app$`)
    return false
  })

  if (rows.length === 0) {
    console.log('  no ux- accounts found')
    return
  }

  let written = 0
  let skipped = 0

  for (const u of rows) {
    if (u.avatar_build && !FORCE) {
      console.log(`  SKIP  ${u.email} — already has a face (use --force to replace)`)
      skipped++
      continue
    }

    const { build, colour } = buildFor(u.email!)

    /**
     * ⚠⚠ VALIDATED THROUGH THE REAL READ PATH BEFORE IT IS WRITTEN. `readStoredAvatarBuild`
     * is what the app itself calls, so a config that fails here is one the phone would
     * refuse to draw — and the symptom would be an avatar that silently stays as
     * initials, which is indistinguishable from "no avatar yet". Fail loudly instead.
     */
    const parsed = readStoredAvatarBuild(build, assets)
    if (!parsed) {
      console.log(`  FAIL  ${u.email} — generated config did not survive readStoredAvatarBuild`)
      console.log(`        ${JSON.stringify(build)}`)
      continue
    }

    const summary = [
      parsed.hair ?? 'bald',
      parsed.facialHair ?? '—',
      parsed.glasses ?? '—',
      parsed.garment ?? '—',
      colour,
    ].join(' / ')

    if (!APPLY) {
      console.log(`  would set ${u.email!.padEnd(28)} ${summary}`)
      written++
      continue
    }

    const { error: upErr } = await admin
      .from('users')
      .update({ avatar_build: build, avatar_colour: colour })
      .eq('user_id', u.user_id)

    if (upErr) {
      console.log(`  FAIL  ${u.email} — ${upErr.message}`)
      continue
    }
    console.log(`  set   ${u.email!.padEnd(28)} ${summary}`)
    written++
  }

  console.log('')
  console.log(`  ${APPLY ? 'wrote' : 'would write'} ${written}, skipped ${skipped}`)
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
