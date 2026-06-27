// ============================================================================
// One-off: backfill entry_xp_state analytics columns by running the SHARED
// computation (lib/analytics/entryAnalytics.ts) — the exact same function the
// cron and (later) the read path use, so values match what the leaderboard
// shows.
//
// Run ONLY in a no-match gap.
//   Dry one pool (prints, writes nothing):
//     npx tsx scripts/backfill-entry-analytics-oneoff.ts --pool <pool_id> --dry
//   Write one pool:
//     npx tsx scripts/backfill-entry-analytics-oneoff.ts --pool <pool_id>
//   Full run (all pools):
//     npx tsx scripts/backfill-entry-analytics-oneoff.ts
//
// Always --dry one small pool first and eyeball the printed values against that
// pool's LIVE web leaderboard (parity check) before any write run.
// ============================================================================
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const poolArg = args.includes('--pool') ? args[args.indexOf('--pool') + 1] : null

  const { createAdminClient } = await import('../lib/supabase/server')
  const { computePoolEntryAnalytics, writePoolEntryAnalytics } = await import('../lib/analytics/entryAnalytics')

  const admin = createAdminClient()

  let poolIds: string[]
  if (poolArg) {
    poolIds = [poolArg]
  } else {
    // Full run: prediction-mode pools only. Bracket pools are skipped — their
    // analytics model is different and needs a separate precompute (logged).
    const { data } = await admin
      .from('pools')
      .select('pool_id')
      .in('prediction_mode', ['full_tournament', 'progressive'])
    poolIds = (data ?? []).map((p: any) => p.pool_id)
  }
  console.log(`${dry ? '[DRY] ' : ''}processing ${poolIds.length} prediction pool(s)`)

  let written = 0
  let printed = 0
  let processed = 0

  if (dry) {
    for (const poolId of poolIds) {
      const rows = await computePoolEntryAnalytics(admin, poolId)
      for (const r of rows.slice(0, Math.max(0, 8 - printed))) {
        console.log(JSON.stringify(r))
        printed++
      }
    }
    console.log('[DRY] computed sample rows')
  } else {
    // Bounded concurrency so ~480 pools finish in minutes, not 15-40. Each
    // pool is independent (distinct entry_ids), so concurrent upserts are safe.
    const CONCURRENCY = 8
    for (let i = 0; i < poolIds.length; i += CONCURRENCY) {
      const batch = poolIds.slice(i, i + CONCURRENCY)
      const results = await Promise.allSettled(batch.map((pid) => writePoolEntryAnalytics(admin, pid)))
      for (const r of results) if (r.status === 'fulfilled') written += r.value
      else console.error('pool failed:', r.reason?.message ?? r.reason)
      processed += batch.length
      console.log(`  ${processed}/${poolIds.length} pools, ${written} entries written`)
    }
    console.log(`DONE: wrote ${written} entries across ${poolIds.length} prediction pools`)
  }
  await new Promise((r) => setTimeout(r, 4000))
}

main()
