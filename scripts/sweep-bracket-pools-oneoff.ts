// One-off: recalc all bracket_picker pools to surface provisional group
// points after enabling bp_provisional_scoring.
// Run: npx tsx scripts/sweep-bracket-pools-oneoff.ts
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

async function main() {
  const { createAdminClient } = await import('../lib/supabase/server')
  const { recalculatePool } = await import('../lib/scoring/recalculate')
  const admin = createAdminClient()

  const { data: pools, error } = await admin
    .from('pools')
    .select('pool_id')
    .eq('prediction_mode', 'bracket_picker')
  if (error || !pools) { console.error('list failed:', error?.message); process.exit(1) }

  console.log(`recalculating ${pools.length} bracket pools (batches of 25)...`)
  const failures: string[] = []
  for (let i = 0; i < pools.length; i += 25) {
    const batch = pools.slice(i, i + 25)
    await Promise.all(batch.map(async (p) => {
      try {
        const r = await recalculatePool({ poolId: p.pool_id })
        if (!r.success) failures.push(p.pool_id)
      } catch { failures.push(p.pool_id) }
    }))
  }
  console.log(`done. failures: ${failures.length}`, failures.join(','))
  await new Promise((r) => setTimeout(r, 8000))
}

main()
