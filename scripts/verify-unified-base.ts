/**
 * Does folding the knockout:group ratio into the round multipliers preserve
 * every pool's scoring?
 *
 * Run BEFORE migration 042 is applied. For every pool, every knockout stage and
 * every scoring tier it compares
 *
 *   old:  floor(knockout_base * multiplier)
 *   new:  floor(group_base    * (multiplier * ratio))
 *
 * and reports any pool where the two differ. The engine floors after
 * multiplying, so small representation error is usually absorbed — this checks
 * whether "usually" is "always" at the precision the columns can actually hold.
 *
 *   npx tsx scripts/verify-unified-base.ts            # default numeric(8,6)
 *   npx tsx scripts/verify-unified-base.ts --scale 1  # what the columns hold today
 */

import { createClient } from '@supabase/supabase-js'

const SCALE = (() => {
  const i = process.argv.indexOf('--scale')
  return i === -1 ? 6 : Number(process.argv[i + 1])
})()

const STAGES = [
  ['round_32', 'round_32_multiplier'],
  ['round_16', 'round_16_multiplier'],
  ['quarter_final', 'quarter_final_multiplier'],
  ['semi_final', 'semi_final_multiplier'],
  ['third_place', 'third_place_multiplier'],
  ['final', 'final_multiplier'],
] as const

const TIERS = [
  ['exact', 'group_exact_score', 'knockout_exact_score'],
  ['gd', 'group_correct_difference', 'knockout_correct_difference'],
  ['winner', 'group_correct_result', 'knockout_correct_result'],
] as const

/** Round to the scale a numeric(p,s) column would store. */
const quantise = (n: number, scale: number) => {
  const f = 10 ** scale
  return Math.round(n * f) / f
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }
  const db = createClient(url, key)

  // Page explicitly: an unbounded select silently truncates at 1,000 rows.
  const rows: Record<string, number>[] = []
  const PAGE = 500
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('pool_settings')
      .select('*')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    rows.push(...(data as Record<string, number>[]))
    if (data.length < PAGE) break
  }
  console.log(`pool_settings rows: ${rows.length}\nquantising multipliers to ${SCALE} dp\n`)

  let exact = 0
  const drifted: { pool: string; detail: string[]; maxDelta: number }[] = []
  let maxMultiplier = 0

  for (const s of rows) {
    const ratio = s.knockout_exact_score / s.group_exact_score
    const detail: string[] = []
    let maxDelta = 0

    for (const [stage, multCol] of STAGES) {
      const oldMult = Number(s[multCol] ?? 1)
      const newMult = quantise(oldMult * ratio, SCALE)
      maxMultiplier = Math.max(maxMultiplier, newMult)

      for (const [tier, groupCol, knockoutCol] of TIERS) {
        const before = Math.floor(s[knockoutCol] * oldMult)
        const after = Math.floor(s[groupCol] * newMult)
        if (before !== after) {
          maxDelta = Math.max(maxDelta, Math.abs(after - before))
          if (detail.length < 4) detail.push(`${stage}/${tier}: ${before} → ${after}`)
        }
      }
    }

    if (detail.length === 0) exact++
    else drifted.push({ pool: String(s.pool_id), detail, maxDelta })
  }

  console.log(`exactly preserved : ${exact}`)
  console.log(`drifted           : ${drifted.length}`)
  console.log(`largest multiplier the migration would write: ${maxMultiplier.toFixed(SCALE)}\n`)

  if (drifted.length) {
    drifted.sort((a, b) => b.maxDelta - a.maxDelta)
    console.log('worst drift (pool_id, largest per-match point change, examples):')
    for (const d of drifted.slice(0, 20)) {
      console.log(`  ${d.pool}  ±${d.maxDelta}  ${d.detail.join('; ')}`)
    }
  }

  process.exit(drifted.length ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
