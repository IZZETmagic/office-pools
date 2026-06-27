// One-off: re-run v2 scoring for every pool after the pagination fix
// (f54da0e). Run with: npx tsx scripts/rerun-scoring-oneoff.ts
// Loads .env.local manually, then sweeps all pools in batches of 25 —
// same batch size as the production sync route.
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Minimal .env.local loader (no dotenv dependency): KEY=VALUE lines only.
const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

async function main() {
  const { createAdminClient } = await import('../lib/supabase/server')
  const { recalculatePool } = await import('../lib/scoring/recalculate')

  const admin = createAdminClient()
  const { data: pools, error } = await admin.from('pools').select('pool_id')
  if (error || !pools) {
    console.error('failed to list pools:', error?.message)
    process.exit(1)
  }

  console.log(`recalculating ${pools.length} pools in batches of 25...`)
  const failures: Array<{ pool_id: string; error: string }> = []
  let done = 0

  for (let i = 0; i < pools.length; i += 25) {
    const batch = pools.slice(i, i + 25)
    await Promise.all(
      batch.map(async (p) => {
        try {
          const r = await recalculatePool({ poolId: p.pool_id })
          if (!r.success) failures.push({ pool_id: p.pool_id, error: r.error ?? 'unknown' })
        } catch (e: any) {
          failures.push({ pool_id: p.pool_id, error: e?.message ?? String(e) })
        }
      }),
    )
    done += batch.length
    console.log(`  ${done}/${pools.length}`)
  }

  console.log(`done. failures: ${failures.length}`)
  for (const f of failures) console.log('  FAILED', f.pool_id, f.error)
  // Fire-and-forget push promises inside recalculatePool need a moment to
  // settle before the process exits.
  await new Promise((r) => setTimeout(r, 10_000))
}

main()
