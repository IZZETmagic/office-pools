// One-off test: recalculatePool with matchId (scoped write) + diff-aware
// totals must produce identical values to the current DB state (which the
// full re-run just wrote), rewrite ONLY the scoped match's rows, and touch
// ZERO pool_entries rows when nothing changed.
// Run: npx tsx scripts/test-scoped-recalc-oneoff.ts <pool_id>
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const MATCH1 = '20000000-0000-0000-0000-000000000001'

async function main() {
  const poolId = process.argv[2]
  if (!poolId) { console.error('usage: ... <pool_id>'); process.exit(1) }

  const { createAdminClient } = await import('../lib/supabase/server')
  const { recalculatePool } = await import('../lib/scoring/recalculate')
  const admin = createAdminClient()

  const snap = async () => {
    const { data: ms } = await admin
      .from('match_scores').select('entry_id, match_id, total_points, calculated_at')
      .eq('pool_id', poolId).order('entry_id').order('match_id')
    const entryIds = [...new Set((ms ?? []).map((r: any) => r.entry_id))]
    const { data: pe } = await admin
      .from('pool_entries')
      .select('entry_id, scored_total_points, current_rank, last_rank_update')
      .in('entry_id', entryIds.length ? entryIds : ['00000000-0000-0000-0000-000000000000'])
      .order('entry_id')
    return { ms: ms ?? [], pe: pe ?? [] }
  }

  const before = await snap()
  console.log(`before: ${before.ms.length} match_scores rows, ${before.pe.length} entries`)

  const res = await recalculatePool({ poolId, matchId: MATCH1 })
  console.log('recalc result:', JSON.stringify(res))

  const after = await snap()

  // 1. Same row count, same values
  let valueDiffs = 0, rewrittenMatch1 = 0, rewrittenOther = 0
  const key = (r: any) => `${r.entry_id}|${r.match_id}`
  const beforeMap = new Map(before.ms.map((r: any) => [key(r), r]))
  for (const a of after.ms as any[]) {
    const b = beforeMap.get(key(a))
    if (!b) { valueDiffs++; continue }
    if (b.total_points !== a.total_points) valueDiffs++
    if (b.calculated_at !== a.calculated_at) {
      if (a.match_id === MATCH1) rewrittenMatch1++
      else rewrittenOther++
    }
  }
  console.log(`row count: before=${before.ms.length} after=${after.ms.length}`)
  console.log(`value differences: ${valueDiffs} (expect 0)`)
  console.log(`rewritten match-1 rows: ${rewrittenMatch1} (expect ${before.ms.filter((r: any) => r.match_id === MATCH1).length})`)
  console.log(`rewritten OTHER-match rows: ${rewrittenOther} (expect 0)`)

  // 2. pool_entries untouched (values unchanged → diff-aware skip)
  let peTouched = 0
  const peBefore = new Map(before.pe.map((r: any) => [r.entry_id, r]))
  for (const a of after.pe as any[]) {
    const b = peBefore.get(a.entry_id)
    if (!b || b.last_rank_update !== a.last_rank_update) peTouched++
  }
  console.log(`pool_entries rows touched: ${peTouched} (expect 0 — nothing changed)`)

  const pass = valueDiffs === 0 && rewrittenOther === 0 && peTouched === 0 && after.ms.length === before.ms.length
  console.log(pass ? 'TEST PASS' : 'TEST FAIL')
  await new Promise((r) => setTimeout(r, 5000))
  process.exit(pass ? 0 : 1)
}

main()
