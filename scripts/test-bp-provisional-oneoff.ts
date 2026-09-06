// One-off: prove the bp_provisional_scoring kill switch on one bracket pool.
// Cycle: flag ON → recalc (provisional points appear for groups with ≥1
// completed match) → flag OFF → recalc (points revert to zero) → flag ON →
// recalc (points return). Run: npx tsx scripts/test-bp-provisional-oneoff.ts <pool_id>
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

async function main() {
  const poolId = process.argv[2]
  if (!poolId) { console.error('usage: ... <pool_id>'); process.exit(1) }

  const { createAdminClient } = await import('../lib/supabase/server')
  const { recalculatePool } = await import('../lib/scoring/recalculate')
  const admin = createAdminClient()

  const setFlag = async (v: boolean) => {
    const { error } = await admin
      .from('sync_settings')
      .update({ setting_value: v })
      .eq('setting_key', 'bp_provisional_scoring')
    if (error) throw new Error(`flag update failed: ${error.message}`)
  }

  const snapshot = async () => {
    const { data } = await admin
      .from('pool_entries')
      .select('entry_id, scored_total_points, pool_members!inner(pool_id)')
      .eq('pool_members.pool_id', poolId)
      .gt('scored_total_points', 0)
    const rows = data ?? []
    const total = rows.reduce((s: number, r: any) => s + (r.scored_total_points ?? 0), 0)
    return { entriesWithPoints: rows.length, totalPoints: total }
  }

  const run = async (label: string) => {
    const r = await recalculatePool({ poolId })
    const s = await snapshot()
    console.log(`${label}: success=${r.success} entriesProcessed=${r.entriesProcessed} → entries_with_points=${s.entriesWithPoints} total_points=${s.totalPoints}`)
    return s
  }

  await setFlag(true)
  const on1 = await run('FLAG ON  (1)')
  await setFlag(false)
  const off = await run('FLAG OFF    ')
  await setFlag(true)
  const on2 = await run('FLAG ON  (2)')

  const pass = on1.entriesWithPoints > 0 && off.entriesWithPoints === 0 &&
    on2.entriesWithPoints === on1.entriesWithPoints && on2.totalPoints === on1.totalPoints
  console.log(pass ? 'TEST PASS — provisional on/off/on cycle verified' : 'TEST FAIL')
  await new Promise((r) => setTimeout(r, 5000))
  process.exit(pass ? 0 : 1)
}

main()
