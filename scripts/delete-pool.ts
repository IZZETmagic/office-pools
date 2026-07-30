/**
 * DELETE A POOL — SUPPORT ACTION. IRREVERSIBLE. DESTROYS OTHER PEOPLE'S DATA.
 *
 * This replaces the "Delete Pool" button that was removed from both the web and
 * mobile admin screens (decision 2026-07-25, migrations 040/041). That button
 * let one admin destroy every member's season on a single tap, from the browser,
 * through a five-step non-atomic cascade. Six pools and 41 entries were lost to
 * it. Admins now archive instead, which is reversible and destroys nothing.
 *
 * Deletion still has to exist — for spam, for genuine mistakes, for a GDPR
 * erasure request. It lives here because it should be slow, deliberate, run by
 * someone who knows what it does, and leave a record.
 *
 * WHAT IT DESTROYS
 * Deleting a `pools` row cascades through the FK graph (verified 2026-07-30):
 *   pools -> pool_members_pool_id_fkey ON DELETE CASCADE
 *         -> pool_entries_member_id_fkey ON DELETE CASCADE
 *         -> 21 children CASCADE: predictions, group_predictions,
 *            special_predictions, the three bracket_picker_* tables,
 *            entry_round_submissions, match_scores, bonus_scores, player_scores,
 *            point_adjustments, badge_unlocks, entry_xp_state, and 8 shadow_*
 *            tables.
 * `badge_unlocks` is designed as a permanent append-only record. It goes too.
 * There is no undo and no backup restore path at row granularity.
 *
 * USAGE
 *   npx tsx scripts/delete-pool.ts <pool_id>                  # DRY RUN — prints the blast radius
 *   npx tsx scripts/delete-pool.ts <pool_id> --confirm="<exact pool name>"
 *
 * The dry run is the default and cannot be skipped by accident: --confirm must
 * carry the pool's exact name, which you can only know by having run the dry run
 * (or looked it up deliberately).
 *
 * BEFORE YOU RUN THIS, ASK: would archiving do? It almost always would.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

;(() => {
  const envPath = resolve(process.cwd(), '.env.local')
  const envContent = readFileSync(envPath, 'utf8')
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
})()

import { createAdminClient } from '../lib/supabase/server'

const poolId = process.argv[2]
const confirmArg = process.argv.find((a) => a.startsWith('--confirm='))
const confirmName = confirmArg ? confirmArg.slice('--confirm='.length).replace(/^["']|["']$/g, '') : null

if (!poolId) {
  console.error('Usage: npx tsx scripts/delete-pool.ts <pool_id> [--confirm="<exact pool name>"]')
  process.exit(1)
}

async function main() {
  const db = createAdminClient()

  const { data: pool, error: poolErr } = await db
    .from('pools')
    .select('pool_id, pool_name, status, archived_at, created_at')
    .eq('pool_id', poolId)
    .single()

  if (poolErr || !pool) {
    console.error(`Pool ${poolId} not found.`)
    process.exit(1)
  }

  // Blast radius, counted rather than estimated.
  const { data: members } = await db
    .from('pool_members')
    .select('member_id, user_id, role')
    .eq('pool_id', poolId)

  const memberIds = (members ?? []).map((m) => m.member_id)

  let entryIds: string[] = []
  if (memberIds.length > 0) {
    const { data: entries } = await db
      .from('pool_entries')
      .select('entry_id')
      .in('member_id', memberIds)
    entryIds = (entries ?? []).map((e) => e.entry_id)
  }

  async function countFor(table: string, col: string, ids: string[]) {
    if (ids.length === 0) return 0
    let total = 0
    // Chunked: `.in()` with thousands of ids blows past URL limits, and an
    // unbounded select silently truncates at PostgREST's 1,000-row cap.
    for (let i = 0; i < ids.length; i += 200) {
      const { count } = await db
        .from(table)
        .select('*', { count: 'exact', head: true })
        .in(col, ids.slice(i, i + 200))
      total += count ?? 0
    }
    return total
  }

  const [predictions, matchScores, bonusScores, badgeUnlocks, adjustments] = await Promise.all([
    countFor('predictions', 'entry_id', entryIds),
    countFor('match_scores', 'entry_id', entryIds),
    countFor('bonus_scores', 'entry_id', entryIds),
    countFor('badge_unlocks', 'entry_id', entryIds),
    countFor('point_adjustments', 'entry_id', entryIds),
  ])

  console.log('')
  console.log('  POOL          ', pool.pool_name)
  console.log('  pool_id       ', pool.pool_id)
  console.log('  status        ', pool.status, pool.archived_at ? '(archived)' : '(NOT archived)')
  console.log('  created       ', String(pool.created_at).slice(0, 10))
  console.log('')
  console.log('  WOULD DESTROY')
  console.log('    members            ', members?.length ?? 0)
  console.log('    entries            ', entryIds.length)
  console.log('    predictions        ', predictions)
  console.log('    match_scores       ', matchScores)
  console.log('    bonus_scores       ', bonusScores)
  console.log('    badge_unlocks      ', badgeUnlocks, '  <- append-only permanent record')
  console.log('    point_adjustments  ', adjustments)
  console.log('')

  const distinctUsers = new Set((members ?? []).map((m) => m.user_id)).size
  console.log(`  ${distinctUsers} people lose this permanently. There is no undo.`)
  console.log('')

  if (!pool.archived_at) {
    console.log('  ⚠️  This pool is NOT archived. Archiving is reversible and is almost always')
    console.log('      the right answer. Consider that first.')
    console.log('')
  }

  if (confirmName === null) {
    console.log('  DRY RUN — nothing was deleted.')
    console.log(`  To delete: npx tsx scripts/delete-pool.ts ${poolId} --confirm="${pool.pool_name}"`)
    console.log('')
    return
  }

  if (confirmName !== pool.pool_name) {
    console.error(`  ✗ --confirm did not match. Expected exactly: ${pool.pool_name}`)
    process.exit(1)
  }

  // Record the intent BEFORE destroying anything. If the delete fails we are
  // left with a "tried to delete" row, which is better than the inverse — the
  // pool gone with nothing saying who removed it or when.
  await db.from('admin_audit_log').insert({
    action: 'pool_deleted',
    // Support action: no end-user performed it. performed_by is NOT NULL, so
    // this uses the pool's own admin as the nominal actor and records the truth
    // in details/summary.
    performed_by: (members ?? []).find((m) => m.role === 'admin')?.user_id ?? (members ?? [])[0]?.user_id,
    pool_id: poolId,
    summary: `SUPPORT: permanently deleted pool "${pool.pool_name}"`,
    details: {
      via: 'scripts/delete-pool.ts',
      pool_name: pool.pool_name,
      members: members?.length ?? 0,
      entries: entryIds.length,
      predictions,
      badge_unlocks: badgeUnlocks,
      was_archived: Boolean(pool.archived_at),
    },
  })

  // ONE statement. The FK graph does the rest, inside Postgres, atomically —
  // unlike the old client-side five-step version, which deleted predictions
  // first and could strand a pool with its members' data already gone.
  const { error: delErr } = await db.from('pools').delete().eq('pool_id', poolId)

  if (delErr) {
    console.error('  ✗ Delete failed:', delErr.message)
    process.exit(1)
  }

  const { count: stillThere } = await db
    .from('pools')
    .select('*', { count: 'exact', head: true })
    .eq('pool_id', poolId)

  if ((stillThere ?? 0) > 0) {
    console.error('  ✗ Delete reported success but the pool is still present. Investigate.')
    process.exit(1)
  }

  console.log(`  ✓ Deleted "${pool.pool_name}" and everything under it. Audit row written.`)
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
