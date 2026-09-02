// =============================================================
// The phone's pool-card level is READ, and reads the right thing
// =============================================================
// Proves against production data that the level the RN home card now shows
// comes from `entry_xp_state.current_level`, and that it is NULL exactly where
// the web card also shows nothing (league pools).
//
// The bug this closes did not fail — it rendered a confident wrong number. So
// the check that matters is not "does it return something" but "does what it
// returns differ from what the phone used to compute". If those agreed, the
// fix would be pointless; the count of disagreements is the evidence.
//
//   npx tsx scripts/verify-home-level-read.ts
// =============================================================

import { readFileSync } from 'fs'
import { resolve } from 'path'
;(() => {
  const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i === -1) continue
    const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
})()

import { createAdminClient } from '../lib/supabase/server'
import { getLevelName } from '../lib/levelNames'

/** The table that used to live on the phone, kept HERE only to measure the gap. */
const OLD_MOBILE_TIERS: Array<[number, number]> = [
  [5000, 10], [4000, 9], [3000, 8], [2500, 7], [2000, 6],
  [1500, 5], [1000, 4], [500, 3], [100, 2],
]
function oldMobileLevel(points: number): number {
  for (const [min, lvl] of OLD_MOBILE_TIERS) if (points >= min) return lvl
  return 1
}

async function main() {
  const admin = createAdminClient()
  let failures = 0

  // ---- 1. league pools are identifiable, and their entries get no level ----
  const { data: leaguePools, error: lpErr } = await admin
    .from('pools').select('pool_id')
    .not('league_season_id', 'is', null)
    .returns<Array<{ pool_id: string }>>()
  if (lpErr) throw lpErr
  const leagueIds = new Set((leaguePools ?? []).map((r) => r.pool_id))
  console.log(`league pools: ${leagueIds.size}`)
  if (leagueIds.size === 0) {
    console.log('⚠ no league pools — the NULL-level branch is untested by this run')
  }

  // ---- 2. every entry, with its stored level and its scored total ----
  // ⚠ PAGED. The first draft of this script read it unbounded and got back
  // exactly 1,000 rows — PostgREST's cap, silent and error-free. Reading the
  // truncated set would have "verified" a fifth of production.
  type EntryRow = { entry_id: string; pool_id: string; scored_total_points: number | null }
  const all: EntryRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('pool_entries')
      .select('entry_id, pool_id, scored_total_points')
      .order('entry_id')
      .range(from, from + 999)
      .returns<EntryRow[]>()
    if (error) throw error
    all.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  console.log(`entries: ${all.length}`)

  // ⚠ page it — an unbounded read silently truncates at 1,000.
  const levels = new Map<string, number | null>()
  const ids = all.map((e) => e.entry_id)
  // ⚠ 100, not 500. A 500-id `.in()` builds a 19.6 kB URL and the server
  // rejects it at the 16 kB header limit — a failure that looks like a network
  // error, not a query that is too big.
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await admin
      .from('entry_xp_state').select('entry_id, current_level')
      .in('entry_id', ids.slice(i, i + 100))
      .returns<Array<{ entry_id: string; current_level: number | null }>>()
    if (error) throw error
    for (const r of data ?? []) levels.set(r.entry_id, r.current_level)
  }
  console.log(`entry_xp_state rows: ${levels.size}`)

  // ---- 3. the measurement that justifies the change ----
  let leagueEntries = 0, wcWithLevel = 0, wcNoRow = 0, disagreed = 0, agreed = 0
  const samples: string[] = []
  for (const e of all) {
    if (leagueIds.has(e.pool_id)) { leagueEntries++; continue }
    const stored = levels.get(e.entry_id)
    if (stored == null) { wcNoRow++; continue }
    wcWithLevel++
    const old = oldMobileLevel(e.scored_total_points ?? 0)
    if (old !== stored) {
      disagreed++
      if (samples.length < 5) {
        samples.push(
          `    ${e.entry_id.slice(0, 8)}  ${e.scored_total_points ?? 0} pts → ` +
          `phone said L${old} (${['','Rookie','Beginner','Amateur','Contender','Competitor','Tactician','Strategist','Expert','Master','Legend'][old]}), ` +
          `stored is L${stored} (${getLevelName(stored)})`,
        )
      }
    } else agreed++
  }

  console.log(`\nleague entries (level suppressed, as on web): ${leagueEntries}`)
  console.log(`World Cup entries with a stored level:        ${wcWithLevel}`)
  console.log(`World Cup entries with NO xp row:             ${wcNoRow}`)
  console.log(`\n  old phone calc AGREED with stored:  ${agreed}`)
  console.log(`  old phone calc DISAGREED:           ${disagreed}`)
  if (samples.length) console.log('\n  sample disagreements:\n' + samples.join('\n'))

  if (wcWithLevel > 0 && disagreed === 0) {
    console.log('\n❌ zero disagreements — the two would be interchangeable and this fix proves nothing')
    failures++
  }
  if (wcWithLevel === 0 && leagueEntries === 0) {
    console.log('\n❌ nothing was actually checked')
    failures++
  }

  console.log(failures === 0 ? '\n✅ PASS' : `\n❌ ${failures} failure(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
