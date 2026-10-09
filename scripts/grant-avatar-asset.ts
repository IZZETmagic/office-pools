// =============================================================
// Give one member an avatar asset nobody else can wear — migration 183
// =============================================================
//
//   npx tsx scripts/grant-avatar-asset.ts --user=<username> --slot=hair --key=<asset-key> [--note="…"] [--by=<username>]
//   npx tsx scripts/grant-avatar-asset.ts --revoke --user=<username> --slot=hair --key=<asset-key>
//   npx tsx scripts/grant-avatar-asset.ts --list
//
// DRY RUN by default: it reads, explains, and writes nothing. Add --apply to write to PRODUCTION.
//
// ⭐⭐ THE ORDER THAT MATTERS: run this with --apply BEFORE the art reaches the deployed
// `public/avatar-assets.json`. Gating creates the row that the lock checks; until it exists, an
// asset in the catalog is free, and anyone could put it on their face in the gap. The script warns
// when it finds the art already in the local catalog, but it cannot see what is DEPLOYED.
//
// What --apply does, in one place so nothing is half-done:
//   grant   → gates the asset if it is not gated yet (refused by the database if anyone already
//             wears it — MONETIZATION_V2 rule 18), then gives this member a `gift` grant.
//   revoke  → deletes the grant. The database takes the asset off their avatar in the same
//             transaction (migration 183 §4); the asset stays gated.
//
// ⚠ Only `gift` is offered. `earned` and `purchase` exist in the table's vocabulary and nowhere
// else — each needs its own design and its own pass through Decision 8's five gates first.
// =============================================================

import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'

;(() => {
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
import type { AvatarAssets } from '../lib/avatar/compose'
import { GATEABLE_SLOTS, type GateableSlot } from '../lib/avatar/storedConfig'

const admin = createAdminClient()

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const flag = (name: string) => process.argv.includes(`--${name}`)

const APPLY = flag('apply')
const REVOKE = flag('revoke')
const LIST = flag('list')

/** The build's slot names differ from the catalog's family names in two places. */
const CATALOG_FAMILY: Record<GateableSlot, keyof AvatarAssets> = {
  hair: 'hair',
  facialHair: 'facialhair',
  glasses: 'glasses',
  earrings: 'earrings',
  garment: 'garments',
}

function die(msg: string): never {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

/** ⚠ Errors are surfaced, never discarded — `const { data } =` hides a 400 as "nothing found". */
function check<T>(label: string, res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    // 42P01 from Postgres, PGRST205 from PostgREST's schema cache — the same fact either way.
    if (res.error.code === '42P01' || res.error.code === 'PGRST205') die(`${label}: the table does not exist — is migration 183 applied?`)
    die(`${label}: ${res.error.message}${res.error.code ? ` (${res.error.code})` : ''}`)
  }
  return res.data
}

async function userByUsername(username: string) {
  const rows = check(
    `looking up @${username}`,
    await admin.from('users').select('user_id, username, avatar_build').eq('username', username).limit(2),
  ) as { user_id: string; username: string; avatar_build: Record<string, unknown> | null }[]
  if (rows.length === 0) die(`no member has the username "${username}"`)
  return rows[0]
}

async function list() {
  const gated = check(
    'reading gated assets',
    await admin.from('avatar_gated_assets').select('slot, asset_key, note, created_at').order('created_at'),
  ) as { slot: string; asset_key: string; note: string | null }[]
  const grants = check(
    'reading grants',
    await admin.from('avatar_asset_grants').select('slot, asset_key, source, granted_at, users!avatar_asset_grants_user_id_fkey(username)'),
  ) as unknown as { slot: string; asset_key: string; source: string; users: { username: string } | null }[]

  if (gated.length === 0) {
    console.log('\nNothing is gated.\n')
    return
  }
  console.log('')
  for (const g of gated) {
    const owners = grants.filter((r) => r.slot === g.slot && r.asset_key === g.asset_key)
    console.log(`  ${g.slot}:${g.asset_key}${g.note ? `  — ${g.note}` : ''}`)
    for (const o of owners) console.log(`      @${o.users?.username ?? '?'} (${o.source})`)
    if (owners.length === 0) console.log('      (no owners)')
  }
  console.log('')
}

async function main() {
  if (LIST) return list()

  const username = arg('user')
  const slot = arg('slot') as GateableSlot | null
  const key = arg('key')
  if (!username || !slot || !key) die('needs --user=, --slot= and --key= (or --list)')
  if (!(GATEABLE_SLOTS as readonly string[]).includes(slot)) {
    die(`--slot must be one of ${GATEABLE_SLOTS.join(', ')} — expression, eyes and mouth cannot be gated (183 §1)`)
  }
  if (key.length > 64) die('--key is longer than 64 characters')

  const member = await userByUsername(username)
  const wearing = member.avatar_build?.[slot] === key

  const catalog = JSON.parse(
    readFileSync(resolve(__dirname, '..', 'public', 'avatar-assets.json'), 'utf8'),
  ) as AvatarAssets
  const family = catalog[CATALOG_FAMILY[slot]] as Record<string, string> | undefined
  const inCatalog = !!family?.[key]

  const gatedRow = check(
    'reading the gated row',
    await admin.from('avatar_gated_assets').select('slot').eq('slot', slot).eq('asset_key', key).maybeSingle(),
  )
  const grantRow = check(
    'reading the grant',
    await admin.from('avatar_asset_grants').select('source')
      .eq('user_id', member.user_id).eq('slot', slot).eq('asset_key', key).maybeSingle(),
  )

  console.log('')
  console.log(`  member    @${member.username}  (${member.user_id})`)
  console.log(`  asset     ${slot}:${key}`)
  console.log(`  catalog   ${inCatalog ? 'IN the local avatar-assets.json' : 'not in the local avatar-assets.json yet'}`)
  console.log(`  gated     ${gatedRow ? 'yes' : 'no'}`)
  console.log(`  owns it   ${grantRow ? `yes (${(grantRow as { source: string }).source})` : 'no'}`)
  console.log(`  wearing   ${wearing ? 'yes' : 'no'}`)
  console.log('')

  if (REVOKE) {
    if (!grantRow) die(`@${member.username} does not own ${slot}:${key} — nothing to revoke`)
    console.log(`  → delete the grant${wearing ? `, which takes ${slot} off their avatar (set to none)` : ''}`)
    if (!APPLY) return console.log('\n  DRY RUN — nothing written. Add --apply to write to PRODUCTION.\n')
    check('revoking', await admin.from('avatar_asset_grants').delete()
      .eq('user_id', member.user_id).eq('slot', slot).eq('asset_key', key))
    console.log('\n  ✓ revoked\n')
    return
  }

  if (grantRow) return console.log(`  @${member.username} already owns it. Nothing to do.\n`)

  if (!gatedRow && inCatalog) {
    console.log('  ⚠ The art is ALREADY in the local catalog but the asset is NOT gated. If that catalog is')
    console.log('    deployed, anyone can wear it right now — and if anyone does, the database will refuse')
    console.log('    to gate it (rule 18). Gate first, ship the art second.\n')
  }

  if (!gatedRow) console.log(`  → gate ${slot}:${key}`)
  console.log(`  → give @${member.username} a gift grant`)

  const byUsername = arg('by')
  const grantedBy = byUsername ? (await userByUsername(byUsername)).user_id : null
  const note = arg('note')

  if (!APPLY) return console.log('\n  DRY RUN — nothing written. Add --apply to write to PRODUCTION.\n')

  if (!gatedRow) {
    check(`gating ${slot}:${key}`, await admin.from('avatar_gated_assets').insert({ slot, asset_key: key, note }))
  }
  check('granting', await admin.from('avatar_asset_grants').insert({
    user_id: member.user_id, slot, asset_key: key, source: 'gift', granted_by: grantedBy, note,
  }))
  console.log(`\n  ✓ @${member.username} owns ${slot}:${key}. It appears in their picker with a Gift tag`)
  console.log('    once the art is in the deployed catalog.\n')
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)))
