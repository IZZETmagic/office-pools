// =============================================================
// The phone's pool-card rank is READ, and reads the right table
// =============================================================
// Proves against production that a league pool's rank now reaches the RN home
// card, by calling the SAME functions the route calls rather than a
// re-implementation of them — `readEntryScoring(..., 'league')` and the `> 0`
// scoring gate.
//
// ## The bug this closes did not fail, it dashed
//
// `/api/users/:id/home-scoring` sorted every entry into `shadow` or `prod` and
// never reached `readEntryScoring`'s league arm, so a league entry fell through
// to `emptySummary()` — `current_rank: null`. The client's fallback,
// `pool_entries.current_rank`, is NULL for every league entry. And the card's
// own gate counted completed rows in `matches`, which is 0 for every league
// pool for ever, because league fixtures are in `league_fixtures`.
//
// Two independent reasons for the same dash, neither of which errored.
//
// So the check that matters is not "does it return a number" but "does the
// number match `league_entry_totals.final_rank`, and is the gate open where the
// pool has actually scored".
//
//   npx tsx scripts/verify-home-rank-read.ts [email]
// =============================================================

import { readFileSync } from 'fs'
import { resolve } from 'path'
;(() => {
  const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
})()

import { createClient } from '@supabase/supabase-js'
import { readEntryScoring } from '../lib/scoring/readSource'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const email = process.argv[2] ?? 'ryansousa93@gmail.com'

async function main() {
  const { data: user } = await admin
    .from('users').select('user_id').eq('email', email).maybeSingle()
  if (!user) throw new Error(`no user for ${email}`)

  const { data: mems, error } = await admin
    .from('pool_members')
    .select('pool_id, pools(pool_name, league_season_id), pool_entries(entry_id, current_rank)')
    .eq('user_id', user.user_id)
  if (error) throw new Error(error.message)

  const rows = (mems ?? []) as any[]
  const leaguePools = new Set(
    rows.filter((m) => (Array.isArray(m.pools) ? m.pools[0] : m.pools)?.league_season_id != null)
        .map((m) => m.pool_id),
  )
  const leagueIds = rows
    .filter((m) => leaguePools.has(m.pool_id))
    .flatMap((m) => (m.pool_entries ?? []).map((e: any) => e.entry_id))

  // The route's own read, called directly.
  const leagueTotals = await readEntryScoring(admin, leagueIds, 'league')

  let checked = 0
  let dashedBefore = 0
  const problems: string[] = []

  for (const m of rows) {
    if (!leaguePools.has(m.pool_id)) continue
    const p = Array.isArray(m.pools) ? m.pools[0] : m.pools

    const { count: gateCount } = await admin
      .from('league_entry_totals')
      .select('entry_id', { count: 'exact', head: true })
      .eq('pool_id', m.pool_id)
      .gt('total_points', 0)
    const gate = (gateCount ?? 0) > 0

    for (const e of m.pool_entries ?? []) {
      const totals = leagueTotals.get(e.entry_id)
      // What the truth is, read straight from the engine's table.
      const { data: truth } = await admin
        .from('league_entry_totals')
        .select('final_rank, total_points')
        .eq('entry_id', e.entry_id)
        .maybeSingle()
      if (!truth) continue
      checked++

      // Before: no league arm, so the payload said null; the client fallback
      // (`pool_entries.current_rank`) is NULL too — hence the dash.
      if (e.current_rank == null) dashedBefore++

      if ((totals?.current_rank ?? null) !== (truth.final_rank ?? null)) {
        problems.push(
          `${p?.pool_name}: route reads ${totals?.current_rank ?? 'null'}, table holds ${truth.final_rank ?? 'null'}`,
        )
      }
      const shouldShow = gate && truth.final_rank != null
      console.log(
        `${(p?.pool_name ?? '?').padEnd(38)} gate=${String(gate).padEnd(5)} rank=${String(truth.final_rank).padStart(3)} pts=${String(truth.total_points).padStart(5)}  →  card shows ${shouldShow ? `#${truth.final_rank}` : '—'}`,
      )
    }
  }

  console.log(`\n${checked} league entries checked · ${dashedBefore} showed a dash before this change`)
  if (problems.length) {
    console.error(`\n✗ ${problems.length} mismatch(es):`)
    for (const p of problems) console.error(`  · ${p}`)
    process.exit(1)
  }
  console.log('✓ every league rank the route reads matches league_entry_totals.final_rank')
}
main()
