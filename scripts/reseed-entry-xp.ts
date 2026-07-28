/**
 * Silent re-seed of entry_xp_state.total_xp / .current_level onto the single
 * authoritative XP definition (computeFullXPBreakdown, via
 * computePoolEntryAnalytics).
 *
 * WHY THIS EXISTS — READ BEFORE RUNNING:
 *   lib/push/badges.ts used to write its own total_xp as
 *   `Σ match_scores.total_points + badgeXP`, a different quantity from the XP
 *   the rest of the product means, and compare it against the same LEVELS
 *   thresholds. That is now fixed: badges.ts consumes the shared value.
 *
 *   But badges.ts fires a level-up push whenever `newLevel > snapshot.level`.
 *   The corrected XP runs HIGHER than the old points figure for most entries,
 *   so the first scoring run after the fix would announce a level-up to a large
 *   number of people at once — days after the tournament ended.
 *
 *   This script closes that window: it rewrites the snapshot to the correct
 *   values WITHOUT sending anything. Once it has run, badges.ts computes the
 *   same level it finds stored, sees no crossing, and stays quiet.
 *
 * ORDERING:
 *   1. Apply migration 026 (adds entry_xp_state.highest_level_reached). This
 *      script cannot run before it — the column would not exist.
 *   2. Deploy the badges.ts fix.
 *   3. Run this immediately.
 *   Running it while the OLD code is still live is harmless but pointless — the
 *   next recalc would overwrite it with the old formula again.
 *
 * NOTE ON DEMOTIONS: computePoolEntryAnalytics already ratchets current_level
 * against highest_level_reached, so the values this writes never demote anyone.
 * The "level changing (down N)" figure in the dry-run report is measured on the
 * RAW corrected level and is what WOULD have happened without the ratchet —
 * keep it in the report as the record of what the ratchet is preventing.
 *
 * Usage:
 *   npx tsx scripts/reseed-entry-xp.ts --dry-run    # report only, writes nothing
 *   npx tsx scripts/reseed-entry-xp.ts              # apply
 *   npx tsx scripts/reseed-entry-xp.ts --dry-run <poolId>…
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
try {
  const envContent = readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
} catch {
  console.error('Could not read .env.local')
  process.exit(1)
}

import { createAdminClient } from '@/lib/supabase/server'
import { computePoolEntryAnalytics } from '@/lib/analytics/entryAnalytics'

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const explicitPools = args.filter((a) => !a.startsWith('--'))

  const admin = createAdminClient()

  let poolIds = explicitPools
  if (poolIds.length === 0) {
    const { data } = await admin.from('pools').select('pool_id')
    poolIds = ((data ?? []) as { pool_id: string }[]).map((p) => p.pool_id)
  }

  console.log(`\nRe-seed entry_xp_state XP  ${dryRun ? '[DRY RUN — no writes]' : '[APPLYING]'}`)
  console.log(`Pools: ${poolIds.length}\n`)

  let entriesSeen = 0
  let xpChanged = 0
  let levelChanged = 0
  let levelUp = 0
  let levelDown = 0
  let written = 0
  const levelMoves: string[] = []

  for (let i = 0; i < poolIds.length; i++) {
    const poolId = poolIds[i]
    let rows
    try {
      rows = await computePoolEntryAnalytics(admin, poolId)
    } catch (err) {
      console.log(`  ✗ ${poolId}: compute failed — ${(err as Error).message}`)
      continue
    }
    if (rows.length === 0) continue

    // Current stored values, for the blast-radius report.
    const ids = rows.map((r) => r.entry_id)
    const stored = new Map<string, { total_xp: number | null; current_level: number | null }>()
    for (let off = 0; off < ids.length; off += 500) {
      const { data } = await admin
        .from('entry_xp_state')
        .select('entry_id, total_xp, current_level')
        .in('entry_id', ids.slice(off, off + 500))
      for (const r of (data ?? []) as any[]) {
        stored.set(r.entry_id, { total_xp: r.total_xp, current_level: r.current_level })
      }
    }

    for (const r of rows) {
      entriesSeen++
      const s = stored.get(r.entry_id)
      if (!s) continue
      if (s.total_xp !== r.total_xp) xpChanged++
      if (s.current_level !== r.current_level) {
        levelChanged++
        if ((r.current_level ?? 0) > (s.current_level ?? 0)) levelUp++
        else levelDown++
        if (levelMoves.length < 15) {
          levelMoves.push(
            `${r.entry_id}  level ${s.current_level} → ${r.current_level}   xp ${s.total_xp} → ${r.total_xp}`,
          )
        }
      }
    }

    if (!dryRun) {
      // Write ONLY the two disputed columns plus the analytics columns we just
      // computed. No push side effects — this script never calls the push path.
      for (let off = 0; off < rows.length; off += 100) {
        const batch = rows.slice(off, off + 100).map((r) => ({
          entry_id: r.entry_id,
          total_xp: r.total_xp,
          current_level: r.current_level,
          highest_level_reached: r.highest_level_reached,
          last_five: r.last_five,
          current_streak: r.current_streak,
          hit_rate: r.hit_rate,
          total_completed: r.total_completed,
          exact_count: r.exact_count,
          contrarian_wins: r.contrarian_wins,
          crowd_agreement_pct: r.crowd_agreement_pct,
          analytics_updated_at: r.analytics_updated_at,
        }))
        const { error } = await admin.from('entry_xp_state').upsert(batch, { onConflict: 'entry_id' })
        if (error) console.error(`  upsert error pool ${poolId}:`, error.message)
        else written += batch.length
      }
    }

    if ((i + 1) % 50 === 0) console.log(`  …${i + 1}/${poolIds.length} pools`)
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Entries evaluated : ${entriesSeen}`)
  console.log(`total_xp changing : ${xpChanged}`)
  console.log(`level changing    : ${levelChanged}  (up ${levelUp}, down ${levelDown})`)
  if (!dryRun) console.log(`Rows written      : ${written}`)
  console.log(
    `\n⚠ "level up" count = how many level-up pushes badges.ts WOULD have fired\n` +
      `   had the formula changed without this re-seed.`,
  )
  if (levelMoves.length > 0) {
    console.log(`\nSample level moves:`)
    for (const m of levelMoves) console.log(`  ${m}`)
  }
  console.log(`${'='.repeat(60)}\n`)
}

main().catch((e) => {
  console.error('FAILED:', e)
  process.exit(1)
})
