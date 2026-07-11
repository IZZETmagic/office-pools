/**
 * Bulk production re-score for the knockout tie-break fix rollout (#6).
 *
 * WRITES to production. Runs recalculatePool for every full_tournament pool with
 * push delivery SUPPRESSED (SUPPRESS_PUSH_DELIVERY=true), so the mass re-score
 * updates scores + entry_xp_state snapshots but delivers ZERO pushes to users.
 *
 * ⚠️ PRECONDITION: the fix must be DEPLOYED to production FIRST. The live crons
 * run the *deployed* code — if this runs against old deployed code still live,
 * the next cron recalc will revert these corrections.
 *
 * Safety: refuses to run without --execute. Processes pools SEQUENTIALLY to
 * avoid the kickoff-style CPU/replication spike a parallel fan-out would cause.
 *
 * Usage:
 *   npx tsx scripts/recalc-full-tournament.ts --execute [--limit=N] [poolId ...]
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Suppress ALL push delivery for this process. sendPushToUser reads this at call
// time, so setting it here (before main() runs any recalc) is sufficient.
process.env.SUPPRESS_PUSH_DELIVERY = 'true'
// Keep the shadow piggyback OFF during the bulk pass; shadow is refreshed
// separately via the backfill scripts after the re-score.
process.env.SHADOW_BRACKETS_ENABLED = 'false'

// --- load .env.local (does not override vars already set above) ---
;(() => {
  const envPath = resolve(process.cwd(), '.env.local')
  try {
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
  } catch {
    console.error('Could not read .env.local')
    process.exit(1)
  }
})()

import { createAdminClient } from '../lib/supabase/server'
import { recalculatePool } from '../lib/scoring/recalculate'

async function main() {
  const args = process.argv.slice(2)
  const execute = args.includes('--execute')
  const argPools = args.filter((a) => !a.startsWith('--'))
  const limitArg = args.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity

  if (process.env.SUPPRESS_PUSH_DELIVERY !== 'true') {
    console.error('Refusing to run: SUPPRESS_PUSH_DELIVERY is not "true".')
    process.exit(1)
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }

  const admin = createAdminClient()
  let poolsQ = admin.from('pools').select('pool_id').eq('prediction_mode', 'full_tournament')
  if (argPools.length) poolsQ = poolsQ.in('pool_id', argPools)
  const { data: poolsRaw } = await poolsQ
  const pools = (poolsRaw ?? []).slice(0, limit)

  console.log(`Target: ${pools.length} full_tournament pool(s). Push delivery: SUPPRESSED.`)
  console.log(`Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)

  if (!execute) {
    console.log('\nDRY GATE: pass --execute to actually re-score. Nothing was written.')
    console.log('Reminder: deploy the fix to production BEFORE running with --execute.')
    process.exit(0)
  }

  let ok = 0
  let failed = 0
  let entriesTotal = 0
  const errors: string[] = []
  const start = Date.now()

  for (let i = 0; i < pools.length; i++) {
    const poolId = pools[i].pool_id
    try {
      const r = await recalculatePool({ poolId })
      if (r.success) {
        ok++
        entriesTotal += r.entriesProcessed
      } else {
        failed++
        errors.push(`${poolId}: ${r.error}`)
      }
      if ((i + 1) % 25 === 0 || i === pools.length - 1) {
        console.log(`  ${i + 1}/${pools.length} pools (ok ${ok}, failed ${failed})`)
      }
    } catch (e: any) {
      failed++
      errors.push(`${poolId}: ${e?.message || e}`)
    }
  }

  console.log('\n===== RE-SCORE COMPLETE =====')
  console.log(`pools ok       : ${ok}`)
  console.log(`pools failed   : ${failed}`)
  console.log(`entries scored : ${entriesTotal}`)
  console.log(`elapsed        : ${Math.round((Date.now() - start) / 1000)}s`)
  if (errors.length) {
    console.log('\nerrors:')
    for (const e of errors) console.log(`  ${e}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
