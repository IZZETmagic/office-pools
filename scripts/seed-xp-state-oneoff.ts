// One-off: seed entry_xp_state for every pool via the FIXED badge pipeline
// (lib/push/badges.ts). First run per entry is silent by design (`seeded`
// flag) — snapshots get written, no pushes fire.
// Run: npx tsx scripts/seed-xp-state-oneoff.ts
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

async function main() {
  const { createAdminClient } = await import('../lib/supabase/server')
  const { detectAndPushBadgesForPool } = await import('../lib/push/badges')

  const admin = createAdminClient()
  const { data: pools, error } = await admin.from('pools').select('pool_id')
  if (error || !pools) {
    console.error('failed to list pools:', error?.message)
    process.exit(1)
  }

  console.log(`seeding entry_xp_state across ${pools.length} pools (batches of 12)...`)
  let done = 0
  for (let i = 0; i < pools.length; i += 12) {
    const batch = pools.slice(i, i + 12)
    await Promise.allSettled(batch.map((p) => detectAndPushBadgesForPool(p.pool_id)))
    done += batch.length
    if (done % 60 === 0 || done === pools.length) console.log(`  ${done}/${pools.length}`)
  }
  console.log('seed complete')
  await new Promise((r) => setTimeout(r, 5000))
}

main()
