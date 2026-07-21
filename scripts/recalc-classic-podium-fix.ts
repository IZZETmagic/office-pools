/**
 * One-off production re-score: podium-bonus fix (champion/runner-up/third place).
 *
 * Context: tournament_awards was empty, so the Node engine never awarded the
 * Tournament Podium Bonus; prod scoring was ALSO switched off during the shadow
 * cutover. After populating tournament_awards + flipping prod_scoring_enabled=true,
 * this re-scores every CLASSIC pool (full_tournament + progressive) so the podium
 * bonus + the final-match scoring that prod missed are written to prod tables.
 * bracket_picker pools are excluded (they were never affected + have their own
 * bp_* podium bonuses).
 *
 * WRITES to production. Push delivery is SUPPRESSED (SUPPRESS_PUSH_DELIVERY=true)
 * so the mass re-score delivers ZERO pushes. Pools are processed SEQUENTIALLY to
 * avoid a kickoff-style CPU/replication spike. Refuses to run without --execute.
 *
 * Usage:
 *   npx tsx scripts/recalc-classic-podium-fix.ts            # dry gate (counts only)
 *   npx tsx scripts/recalc-classic-podium-fix.ts --execute  # re-score all classic pools
 *   npx tsx scripts/recalc-classic-podium-fix.ts --execute <poolId ...>   # only these
 *   npx tsx scripts/recalc-classic-podium-fix.ts --execute --limit=N
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Suppress ALL push delivery for this process (read at call time by sendPushToUser).
process.env.SUPPRESS_PUSH_DELIVERY = 'true'
// Keep the shadow piggyback OFF during the bulk pass.
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
import { isProdScoringEnabled } from '../lib/scoring/prodScoringFlag'

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

  // The kill switch makes recalculatePool a NO-OP that still returns
  // success:true (lib/scoring/recalculate.ts:88-97). On 2026-07-20 that is how
  // a run printed "pools ok: 523, failed: 0" having written absolutely nothing.
  // Refuse to start rather than report a phantom success.
  if (!(await isProdScoringEnabled(admin))) {
    console.error(
      'Refusing to run: prod_scoring_enabled is FALSE. recalculatePool would skip every\n' +
      'classic pool and still report success. Set it true before re-scoring.'
    )
    process.exit(1)
  }

  let poolsQ = admin
    .from('pools')
    .select('pool_id, prediction_mode')
    .in('prediction_mode', ['full_tournament', 'progressive'])
  if (argPools.length) poolsQ = poolsQ.in('pool_id', argPools)
  const { data: poolsRaw, error: poolsErr } = await poolsQ
  if (poolsErr) {
    console.error('Failed to list pools:', poolsErr.message)
    process.exit(1)
  }
  const pools = (poolsRaw ?? []).slice(0, limit)

  console.log(`Target: ${pools.length} classic pool(s) [full_tournament + progressive]. Push delivery: SUPPRESSED.`)
  console.log(`Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)

  if (!execute) {
    console.log('\nDRY GATE: pass --execute to actually re-score. Nothing was written.')
    process.exit(0)
  }

  let ok = 0
  let failed = 0
  let entriesTotal = 0
  let bonusTotal = 0
  const errors: string[] = []
  const start = Date.now()

  for (let i = 0; i < pools.length; i++) {
    const poolId = pools[i].pool_id
    try {
      const r = await recalculatePool({ poolId })
      if (r.success && r.entriesProcessed === 0) {
        // Zero entries scored is legitimate for an empty pool (53 of 524 classic
        // pools have none) and a silent failure for any pool with members. Only
        // pay for the check on the suspicious ones.
        const { count } = await admin
          .from('pool_members')
          .select('member_id', { count: 'exact', head: true })
          .eq('pool_id', poolId)
        if ((count ?? 0) > 0) {
          failed++
          errors.push(`${poolId}: reported success but scored 0 of ${count} member(s)`)
          continue
        }
      }
      if (r.success) {
        ok++
        entriesTotal += r.entriesProcessed
        bonusTotal += r.bonusScoresWritten
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
  console.log(`pools ok        : ${ok}`)
  console.log(`pools failed    : ${failed}`)
  console.log(`entries scored  : ${entriesTotal}`)
  console.log(`bonus rows wrote: ${bonusTotal}`)
  console.log(`elapsed         : ${Math.round((Date.now() - start) / 1000)}s`)
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
