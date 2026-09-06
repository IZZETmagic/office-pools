// One-off: compare FRESH-computed analytics vs STORED entry_xp_state columns
// for a sample of pools — validates the cron has kept columns current.
// Run: npx tsx scripts/compare-analytics-oneoff.ts <pool_id> [pool_id...]
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

async function main() {
  const poolIds = process.argv.slice(2)
  if (poolIds.length === 0) { console.error('usage: ... <pool_id> [pool_id...]'); process.exit(1) }

  const { createAdminClient } = await import('../lib/supabase/server')
  const { computePoolEntryAnalytics } = await import('../lib/analytics/entryAnalytics')
  const admin = createAdminClient()

  const eq = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b)

  for (const poolId of poolIds) {
    const fresh = await computePoolEntryAnalytics(admin, poolId)
    const ids = fresh.map((r) => r.entry_id)
    const { data: storedRows } = await admin
      .from('entry_xp_state')
      .select('entry_id, total_xp, current_level, last_five, current_streak, hit_rate, total_completed, exact_count, contrarian_wins, crowd_agreement_pct')
      .in('entry_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
    const stored = new Map((storedRows ?? []).map((r: any) => [r.entry_id, r]))

    let match = 0
    const diffs: string[] = []
    for (const f of fresh) {
      const s = stored.get(f.entry_id)
      if (!s) { diffs.push(`${f.entry_id}: no stored row`); continue }
      const fieldsMatch =
        s.total_xp === f.total_xp &&
        s.current_level === f.current_level &&
        Number(s.hit_rate) === f.hit_rate &&
        s.total_completed === f.total_completed &&
        s.exact_count === f.exact_count &&
        s.contrarian_wins === f.contrarian_wins &&
        Number(s.crowd_agreement_pct) === f.crowd_agreement_pct &&
        eq(s.last_five, f.last_five) &&
        eq(s.current_streak, f.current_streak)
      if (fieldsMatch) match++
      else if (diffs.length < 4)
        diffs.push(`${f.entry_id}: stored xp=${s.total_xp}/L${s.current_level} hit=${s.hit_rate} vs fresh xp=${f.total_xp}/L${f.current_level} hit=${f.hit_rate}`)
    }
    console.log(`pool ${poolId}: ${match}/${fresh.length} entries match exactly` + (diffs.length ? `; sample diffs:` : ''))
    for (const d of diffs) console.log(`   ${d}`)
  }
  await new Promise((r) => setTimeout(r, 3000))
}

main()
