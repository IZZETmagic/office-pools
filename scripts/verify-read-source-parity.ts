/**
 * Parity check for the scoring read source (lib/scoring/readSource.ts).
 *
 * For each test pool:
 *   PROD mode  — helper output MUST byte-match the old direct queries (this is
 *                the "flag-off is byte-identical" guarantee the cutover rests on).
 *   SHADOW mode — helper output MUST match a direct read of the shadow tables
 *                (validates the column mapping / adjustment derivation / key
 *                synthesis); plus an informational count of shadow-vs-prod total
 *                drift (expected: the known SF-bonus prod-staleness only).
 *
 * Read-only. Writes nothing.
 * Usage: npx tsx scripts/verify-read-source-parity.ts [poolId ...]
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
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
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
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
import { readEntryScoring, readMatchScores, readBonusScores, type EntryScoring } from '@/lib/scoring/readSource'

type Admin = ReturnType<typeof createAdminClient>

const DEFAULT_POOLS = [
  'd5dea1ee-420e-4f0b-a563-6113d53cda9d', // full_tournament, 114 entries
  'b7ddbf9d-687d-4e61-a415-807798d972e2', // progressive, 192 entries
]

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`    ${ok ? '✓' : '✗ FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const scoringEq = (a: EntryScoring, b: EntryScoring) =>
  a.match_points === b.match_points &&
  a.bonus_points === b.bonus_points &&
  a.point_adjustment === b.point_adjustment &&
  a.scored_total_points === b.scored_total_points &&
  (a.current_rank ?? null) === (b.current_rank ?? null) &&
  (a.previous_rank ?? null) === (b.previous_rank ?? null)

// Paginated sum(total_points) + count for a filtered match_scores read.
async function countAndSumMatchScores(admin: Admin, table: string, col: string, val: string): Promise<{ count: number; sum: number }> {
  let count = 0
  let sum = 0
  let offset = 0
  for (;;) {
    const { data, error } = await admin
      .from(table)
      .select('total_points')
      .eq(col, val)
      .order('entry_id', { ascending: true })
      .order('match_id', { ascending: true })
      .range(offset, offset + 999)
    if (error) throw new Error(`${table} page@${offset}: ${error.message}`)
    if (!data || data.length === 0) break
    for (const r of data as { total_points: number }[]) sum += r.total_points ?? 0
    count += data.length
    offset += data.length
    if (data.length < 1000) break
  }
  return { count, sum }
}

async function verifyPool(admin: Admin, poolId: string) {
  const { data: pool } = await admin.from('pools').select('prediction_mode').eq('pool_id', poolId).single()
  const mode = (pool as { prediction_mode?: string } | null)?.prediction_mode ?? '?'

  const { data: members } = await admin.from('pool_members').select('member_id').eq('pool_id', poolId)
  const memberIds = (members ?? []).map((m) => (m as { member_id: string }).member_id)
  const { data: rawEntries } = await admin
    .from('pool_entries')
    .select('entry_id, match_points, bonus_points, point_adjustment, scored_total_points, current_rank, previous_rank')
    .in('member_id', memberIds)
  const entries = (rawEntries ?? []) as Array<{
    entry_id: string; match_points: number | null; bonus_points: number | null
    point_adjustment: number | null; scored_total_points: number | null
    current_rank: number | null; previous_rank: number | null
  }>
  const entryIds = entries.map((e) => e.entry_id)

  console.log(`\nPOOL ${poolId} (${mode}): ${entryIds.length} entries`)

  // --- PROD: entry scoring must byte-match pool_entries ----------------------
  const prodMap = await readEntryScoring(admin, entryIds, 'prod')
  let prodMismatch = 0
  for (const e of entries) {
    const expected: EntryScoring = {
      entry_id: e.entry_id,
      match_points: e.match_points ?? 0,
      bonus_points: e.bonus_points ?? 0,
      point_adjustment: e.point_adjustment ?? 0,
      scored_total_points: e.scored_total_points ?? 0,
      current_rank: e.current_rank ?? null,
      previous_rank: e.previous_rank ?? null,
    }
    const actual = prodMap.get(e.entry_id)
    if (!actual || !scoringEq(actual, expected)) prodMismatch++
  }
  check('PROD entry-scoring == pool_entries', prodMismatch === 0, `${prodMismatch} mismatches / ${entries.length}`)

  // --- PROD: match_scores (helper in(entry_id) == direct eq(pool_id)) --------
  const prodMs = await readMatchScores(admin, entryIds, 'prod')
  const prodMsSum = prodMs.reduce((s, r) => s + (r.total_points ?? 0), 0)
  const directMs = await countAndSumMatchScores(admin, 'match_scores', 'pool_id', poolId)
  check('PROD match_scores count+sum == direct', prodMs.length === directMs.count && prodMsSum === directMs.sum,
    `helper ${prodMs.length}/${prodMsSum} vs direct ${directMs.count}/${directMs.sum}`)

  // --- PROD: bonus_scores ----------------------------------------------------
  const prodBonus = await readBonusScores(admin, entryIds, 'prod')
  const prodBonusSum = prodBonus.reduce((s, r) => s + (r.points_earned ?? 0), 0)
  let directBonusCount = 0
  let directBonusSum = 0
  {
    let offset = 0
    for (;;) {
      const { data } = await admin.from('bonus_scores').select('points_earned').in('entry_id', entryIds)
        .order('entry_id', { ascending: true }).order('bonus_id', { ascending: true }).range(offset, offset + 999)
      if (!data || data.length === 0) break
      for (const r of data as { points_earned: number }[]) directBonusSum += r.points_earned ?? 0
      directBonusCount += data.length
      offset += data.length
      if (data.length < 1000) break
    }
  }
  check('PROD bonus_scores count+sum == direct', prodBonus.length === directBonusCount && prodBonusSum === directBonusSum,
    `helper ${prodBonus.length}/${prodBonusSum} vs direct ${directBonusCount}/${directBonusSum}`)

  // --- SHADOW: entry scoring must match a direct shadow_entry_totals read -----
  const shadowMap = await readEntryScoring(admin, entryIds, 'shadow')
  const { data: rawShadow } = await admin
    .from('shadow_entry_totals')
    .select('entry_id, match_points, bonus_points, total_points, final_rank, previous_final_rank')
    .in('entry_id', entryIds)
  const shadowRows = new Map((rawShadow ?? []).map((r) => {
    const row = r as { entry_id: string; match_points: number | null; bonus_points: number | null; total_points: number | null; final_rank: number | null; previous_final_rank: number | null }
    const mp = row.match_points ?? 0, bp = row.bonus_points ?? 0, tp = row.total_points ?? 0
    return [row.entry_id, {
      entry_id: row.entry_id, match_points: mp, bonus_points: bp,
      point_adjustment: tp - mp - bp, scored_total_points: tp,
      current_rank: row.final_rank ?? null, previous_rank: row.previous_final_rank ?? null,
    } as EntryScoring]
  }))
  let shadowMismatch = 0
  for (const id of entryIds) {
    const expected = shadowRows.get(id) ?? {
      entry_id: id, match_points: 0, bonus_points: 0, point_adjustment: 0,
      scored_total_points: 0, current_rank: null, previous_rank: null,
    }
    const actual = shadowMap.get(id)
    if (!actual || !scoringEq(actual, expected)) shadowMismatch++
  }
  check('SHADOW entry-scoring == shadow_entry_totals (mapped)', shadowMismatch === 0, `${shadowMismatch} mismatches / ${entryIds.length}`)

  // --- Informational: shadow vs prod total drift -----------------------------
  let drift = 0
  let shadowAhead = 0
  for (const e of entries) {
    const s = shadowMap.get(e.entry_id)
    if (!s) continue
    const prodTotal = e.scored_total_points ?? 0
    if (s.scored_total_points !== prodTotal) {
      drift++
      if (s.scored_total_points > prodTotal) shadowAhead++
    }
  }
  console.log(`    ℹ shadow vs prod total drift: ${drift} entries (${shadowAhead} shadow-ahead) — expected = known SF-bonus staleness`)
}

async function main() {
  const admin = createAdminClient()
  const pools = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_POOLS
  console.log(`Read-source parity check — ${pools.length} pool(s)`)
  for (const p of pools) {
    try {
      await verifyPool(admin, p)
    } catch (e) {
      console.error(`  ✗ error on pool ${p}:`, (e as Error).message)
      failures++
    }
  }
  console.log(`\n${failures === 0 ? '✅ ALL PARITY CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
