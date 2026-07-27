/**
 * P2 reconciler trial harness. Runs `reconcileStaleEntries` with an explicit cap
 * so a single pool can be exercised before the estate-wide cold sweep.
 *
 * A cap of 1 selects one entry -> one pool -> re-derives that whole pool and
 * marks every eligible entry in it. That is the smallest honest end-to-end test
 * of the real code path, kill switch included.
 *
 *   npx tsx scripts/trial-p2-rederive.ts [cap]      # default cap 1
 *
 * Read-only except for the shadow_* writes the reconciler itself performs.
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
;(() => {
  const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of envContent.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i === -1) continue
    const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
})()
import { createAdminClient } from '@/lib/supabase/server'
import { reconcileStaleEntries } from '@/lib/scoring/shadowBrackets'

const TOURNAMENT = process.env.API_FOOTBALL_TOURNAMENT_ID || '00000000-0000-0000-0000-000000000001'
const PODIUM = ['champion_correct', 'second_place_correct', 'third_place_correct']

/** PostgREST truncates any response at 1,000 rows, RPC included — so an exact
 *  1,000 means "at least 1,000", never a real total. Report it honestly. */
async function selectorCount(admin: any) {
  const { data } = await admin.rpc('shadow_entries_needing_rederive', { p_cap: 1000 })
  const n = (data ?? []).length
  return n === 1000 ? '≥1000 (PostgREST row cap)' : String(n)
}
async function podium(admin: any, table: string) {
  const out: Record<string, number> = {}
  for (const t of PODIUM) {
    const { count } = await admin.from(table).select('*', { count: 'exact', head: true }).eq('bonus_type', t)
    out[t] = count ?? 0
  }
  return out
}

async function main() {
  const cap = Number(process.argv[2] ?? 1)
  const admin = createAdminClient()

  console.log(`selector before : ${await selectorCount(admin)} entries stale`)
  console.log(`shadow podium   :`, await podium(admin, 'shadow_bonus_scores'))
  console.log(`prod podium     :`, await podium(admin, 'bonus_scores'))

  console.log(`\nrunning reconcileStaleEntries(cap=${cap})…`)
  const r = await reconcileStaleEntries(admin, TOURNAMENT, { cap })
  console.log(JSON.stringify(r, null, 2))

  console.log(`\nselector after  : ${await selectorCount(admin)} entries stale`)
  console.log(`shadow podium   :`, await podium(admin, 'shadow_bonus_scores'))

  // Partial success is the DESIGN, not a failure: quarantined pools and failed
  // chunks stay stale and are retried next run, while everything else commits.
  // Reporting "nothing marked" whenever errors exist would be a lie.
  if (!r.enabled) console.log('\n⚠ kill switch off — nothing ran.')
  else if (r.marked > 0) {
    console.log(`\n✅ progress: ${r.pools} pool(s) applied, ${r.marked} entries marked` +
                (r.quarantined ? `, ${r.quarantined} pool(s) quarantined for retry` : '') +
                (r.errors.length ? ` — ${r.errors.length} transient error(s), will retry` : ''))
  } else if (r.errors.length) { console.log('\n❌ no progress — nothing marked, will retry.'); process.exit(1) }
  else console.log('\n✅ nothing to do — selector is dry.')
}
main().catch((e) => { console.error('FAILED:', e?.message ?? e); process.exit(1) })
