/**
 * One-off backfill of the precomputed analytics columns on `entry_xp_state`.
 *
 * WHY THIS EXISTS
 *   `entry_xp_state.total_xp` / `.current_level` had two writers computing
 *   different quantities until 2026-07-26 (see
 *   drafts/2026-07-26_analytics_parity_result.md). The fix made
 *   computePoolEntryAnalytics the single owner — but rows last written by the
 *   OLD writer are never refreshed, because the analytics sweep is event-driven
 *   off `pool_entries.last_rank_update` and nothing rescores a finished
 *   competition. This walks every pool once so the stored values match the one
 *   agreed formula, which is the gate on the leaderboard read flip.
 *
 * WHAT IT WRITES
 *   Only `entry_xp_state`, only via writePoolEntryAnalytics — the same function
 *   the sweep and the scoring path call, so this cannot invent a third
 *   definition. It never touches scoring tables.
 *
 * LEVELS RATCHET: computeFullXPBreakdown floors the displayed level at
 * `highest_level_reached`, so a corrected formula can raise a level but never
 * lower one. This script asserts that and reports any demotion loudly — a
 * non-zero demotion count means the ratchet is not working and should be
 * investigated before the read flip.
 *
 * Usage:
 *   npx tsx scripts/backfill-entry-analytics.ts            # every pool
 *   npx tsx scripts/backfill-entry-analytics.ts <poolId>…  # specific pools
 *   npx tsx scripts/backfill-entry-analytics.ts --dry-run  # report only, no writes
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

// --- .env.local loader (mirrors the other runner scripts) -------------------
const envPath = resolve(process.cwd(), '.env.local')
try {
  const envContent = readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
} catch {
  console.error('Could not read .env.local')
  process.exit(1)
}

import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/paginate'
import { computePoolEntryAnalytics, writePoolEntryAnalytics } from '@/lib/analytics/entryAnalytics'

type Snapshot = { entry_id: string; total_xp: number | null; current_level: number | null }

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const explicitPools = args.filter((a) => !a.startsWith('--'))

async function main() {
  const admin = createAdminClient()

  const poolIds = explicitPools.length
    ? explicitPools
    : (
        await fetchAllRows<{ pool_id: string }>(
          (from, to) => admin.from('pools').select('pool_id').range(from, to),
          'pools',
        )
      ).map((p) => p.pool_id)

  console.log(`${dryRun ? '[DRY RUN] ' : ''}backfilling ${poolIds.length} pools\n`)

  // Before-snapshot. Paged: entry_xp_state is ~5k rows, well over the 1,000 cap.
  const before = new Map<string, Snapshot>()
  for (const r of await fetchAllRows<Snapshot>(
    (from, to) => admin.from('entry_xp_state').select('entry_id, total_xp, current_level').range(from, to),
    'entry_xp_state before',
  )) {
    before.set(r.entry_id, r)
  }
  console.log(`snapshot: ${before.size} existing rows\n`)

  let written = 0
  let processed = 0
  const errors: Array<{ pool_id: string; message: string }> = []
  const BATCH = 4

  for (let i = 0; i < poolIds.length; i += BATCH) {
    const batch = poolIds.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map((pid) =>
        dryRun ? computePoolEntryAnalytics(admin, pid).then((r) => r.length) : writePoolEntryAnalytics(admin, pid),
      ),
    )
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') written += r.value
      else errors.push({ pool_id: batch[idx], message: String((r.reason as Error)?.message ?? r.reason) })
    })
    processed += batch.length
    if (processed % 40 === 0 || processed === poolIds.length) {
      console.log(`  ${processed}/${poolIds.length} pools · ${written} rows · ${errors.length} errors`)
    }
  }

  if (dryRun) {
    console.log(`\n[DRY RUN] would have written ${written} rows across ${poolIds.length} pools`)
    if (errors.length) console.log(`errors: ${errors.length}`)
    return
  }

  // After-snapshot + diff.
  const after = new Map<string, Snapshot>()
  for (const r of await fetchAllRows<Snapshot>(
    (from, to) => admin.from('entry_xp_state').select('entry_id, total_xp, current_level').range(from, to),
    'entry_xp_state after',
  )) {
    after.set(r.entry_id, r)
  }

  let levelUp = 0
  let levelDown = 0
  let xpChanged = 0
  let newRows = 0
  const demotions: string[] = []

  for (const [entryId, post] of after) {
    const pre = before.get(entryId)
    if (!pre) {
      newRows++
      continue
    }
    if ((pre.total_xp ?? 0) !== (post.total_xp ?? 0)) xpChanged++
    const preLevel = pre.current_level ?? 1
    const postLevel = post.current_level ?? 1
    if (postLevel > preLevel) levelUp++
    if (postLevel < preLevel) {
      levelDown++
      if (demotions.length < 10) demotions.push(`${entryId}: ${preLevel} -> ${postLevel}`)
    }
  }

  console.log('\n==================================================================')
  console.log(`Pools processed   : ${poolIds.length}`)
  console.log(`Rows written      : ${written}`)
  console.log(`New rows          : ${newRows}`)
  console.log(`total_xp changed  : ${xpChanged}`)
  console.log(`Levels UP         : ${levelUp}`)
  console.log(`Levels DOWN       : ${levelDown}   ${levelDown > 0 ? '⚠️  RATCHET FAILURE — investigate' : '(expected: 0)'}`)
  if (demotions.length) demotions.forEach((d) => console.log(`  ${d}`))
  if (errors.length) {
    console.log(`\nErrors            : ${errors.length}`)
    errors.slice(0, 10).forEach((e) => console.log(`  ${e.pool_id}: ${e.message}`))
  }
  console.log('==================================================================')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
