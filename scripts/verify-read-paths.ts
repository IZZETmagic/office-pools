/**
 * Read-path verification for the shadow cutover.
 *
 * Two questions, both of which have to hold before a pool is added to
 * `shadow_read_enabled_pools`:
 *
 *   1. Do the source-aware readers in lib/scoring/readSource.ts actually return
 *      matching data from both tables? (a plumbing check, not a maths proof —
 *      see drafts/2026-07-27 for why parity alone proves nothing)
 *
 *   2. ZERO-FILL RISK. readEntryScoring back-fills any requested entry with no
 *      row as all-zero. That is correct for the leaderboard, but every surface
 *      now overlaying shadow onto pool_entries (profile, admin, My Pools,
 *      dashboard) inherits it — so an enabled pool whose entries lack
 *      shadow_entry_totals rows will render zeros where prod showed a number.
 *      Run this BEFORE enabling a pool, not after.
 *
 * Usage: npx tsx scripts/verify-read-paths.ts
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

try {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    const k = t.slice(0, eq).trim()
    if (!process.env[k]) process.env[k] = v
  }
} catch {
  console.error('Could not read .env.local')
  process.exit(1)
}

import { createAdminClient } from '@/lib/supabase/server'
import { getShadowReadPools, readMatchScoreClassification } from '@/lib/scoring/readSource'

type Entry = {
  entry_id: string
  match_points: number | null
  bonus_points: number | null
  current_rank: number | null
  scored_total_points: number | null
  has_submitted_predictions: boolean | null
}

async function main() {
  const admin = createAdminClient()
  const pools = [...(await getShadowReadPools(admin))]
  console.log(`shadow read-enabled pools: ${pools.length}\n`)

  // --- 1. reader plumbing ---------------------------------------------------
  const { data: sample } = await admin.from('shadow_match_scores').select('entry_id').limit(400)
  const sampleIds = [...new Set((sample ?? []).map((r: { entry_id: string }) => r.entry_id))].slice(0, 6)
  if (sampleIds.length) {
    const [sRows, pRows] = await Promise.all([
      readMatchScoreClassification(admin, sampleIds, 'shadow'),
      readMatchScoreClassification(admin, sampleIds, 'prod'),
    ])
    const key = (r: { entry_id: string; match_id: string }) => `${r.entry_id}:${r.match_id}`
    const sm = new Map(sRows.map((r) => [key(r), r]))
    let diff = 0
    for (const p of pRows) {
      const s = sm.get(key(p))
      if (!s || s.score_type !== p.score_type || s.total_points !== p.total_points) diff++
    }
    console.log(`readMatchScoreClassification: ${sRows.length} shadow / ${pRows.length} prod rows, ${diff} mismatches`)
    console.log(`  columns: ${Object.keys(sRows[0] ?? {}).join(', ')}\n`)
  }

  // --- 2. zero-fill risk ----------------------------------------------------
  let entries = 0
  let missing = 0
  const blanked: string[] = []

  for (const poolId of pools) {
    const { data: mem } = await admin
      .from('pool_members')
      .select('pool_entries(entry_id, match_points, bonus_points, current_rank, scored_total_points, has_submitted_predictions)')
      .eq('pool_id', poolId)
    const rows = (mem ?? []).flatMap((m: { pool_entries?: Entry[] }) => m.pool_entries ?? [])
    if (!rows.length) continue

    const { data: tot } = await admin
      .from('shadow_entry_totals')
      .select('entry_id')
      .in('entry_id', rows.map((e) => e.entry_id))
    const have = new Set((tot ?? []).map((r: { entry_id: string }) => r.entry_id))

    for (const e of rows) {
      entries++
      if (have.has(e.entry_id)) continue
      missing++
      const prodShows =
        (e.match_points ?? 0) !== 0 || (e.bonus_points ?? 0) !== 0 || (e.scored_total_points ?? 0) !== 0
      if (prodShows) {
        blanked.push(
          `${poolId.slice(0, 8)}/${e.entry_id.slice(0, 8)} stp=${e.scored_total_points} rank=${e.current_rank} submitted=${e.has_submitted_predictions}`,
        )
      }
    }
  }

  console.log(`entries in enabled pools: ${entries}`)
  console.log(`  no shadow_entry_totals row: ${missing}`)
  console.log(`  of those, prod showed points (will now render 0): ${blanked.length}`)
  for (const b of blanked) console.log(`    ${b}`)
  if (blanked.length) {
    console.log(
      '\n  Check each before dismissing. An entry with points but NO predictions is\n' +
        '  usually a manual point_adjustment, which shadow DROPS for unscored entries\n' +
        '  (it only writes shadow_entry_totals for entries it scores) — that is real\n' +
        '  data loss, not a correction. Read pool_entries.adjustment_reason before\n' +
        '  assuming the empty-bracket bonus inflation.',
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
