/**
 * Does the My Bracket tab now show the teams a member actually predicted?
 *
 * Reads a real bracket-picker entry, runs the same resolver the tab runs, and
 * reports for every knockout match whether the user's team in each slot differs
 * from who turned up — which is precisely what the new "you had" line renders.
 *
 * Writes nothing.
 *
 *   npx tsx scripts/verify-predicted-bracket.ts [entry_id]
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  const k = t.slice(0, i).trim()
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}

import { createClient } from '@supabase/supabase-js'
import { resolveFullBracketFromPicks } from '../lib/bracketPickerResolver'

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let entryId = process.argv[2]
  if (!entryId) {
    // Any entry with a full set of knockout picks.
    const { data } = await db
      .from('bracket_picker_knockout_picks')
      .select('entry_id')
      .limit(500)
    const counts = new Map<string, number>()
    for (const r of data ?? []) counts.set(r.entry_id, (counts.get(r.entry_id) ?? 0) + 1)
    entryId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }
  console.log(`entry ${entryId}\n`)

  const { data: entry } = await db
    .from('pool_entries')
    .select('entry_id, member_id, pool_members!inner(pool_id, pools!inner(tournament_id))')
    .eq('entry_id', entryId)
    .single()
  const tournamentId = (entry as any).pool_members.pools.tournament_id

  const [{ data: groupRankings }, { data: thirdPlaceRankings }, { data: knockoutPicks }] =
    await Promise.all([
      db.from('bracket_picker_group_rankings').select('*').eq('entry_id', entryId),
      db.from('bracket_picker_third_place_rankings').select('*').eq('entry_id', entryId),
      db.from('bracket_picker_knockout_picks').select('*').eq('entry_id', entryId),
    ])

  const { data: teams } = await db.from('teams').select('*').eq('tournament_id', tournamentId)
  const { data: matches } = await db
    .from('matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('match_number')

  const { knockoutTeamMap } = resolveFullBracketFromPicks({
    groupRankings: groupRankings as any,
    thirdPlaceRankings: thirdPlaceRankings as any,
    knockoutPicks: knockoutPicks as any,
    teams: teams as any,
    matches: matches as any,
  })

  const byId = new Map((teams ?? []).map((t: any) => [t.team_id, t]))
  const stages = ['round_32', 'round_16', 'quarter_final', 'semi_final', 'third_place', 'final']
  let slots = 0
  let resolved = 0
  let diverged = 0

  for (const stage of stages) {
    const ms = (matches ?? []).filter((m: any) => m.stage === stage)
    let stageDiverged = 0
    const examples: string[] = []
    for (const m of ms) {
      const slot = knockoutTeamMap.get(m.match_number)
      for (const side of ['home', 'away'] as const) {
        slots++
        const predicted = slot?.[side]
        const actualId = side === 'home' ? m.home_team_id : m.away_team_id
        if (!predicted) continue
        resolved++
        if (predicted.team_id !== actualId) {
          diverged++
          stageDiverged++
          if (examples.length < 2) {
            const actual = actualId ? byId.get(actualId)?.country_code ?? '???' : 'TBD'
            examples.push(`#${m.match_number} ${side}: ${actual} turned up, had ${predicted.country_code}`)
          }
        }
      }
    }
    console.log(
      `${stage.padEnd(14)} ${String(ms.length * 2).padStart(2)} slots, ` +
      `${String(stageDiverged).padStart(2)} show a "you had" line`,
    )
    for (const e of examples) console.log(`                 ${e}`)
  }

  console.log(
    `\n${slots} slots, ${resolved} resolved from this entry's picks, ` +
    `${diverged} diverged (${((diverged / Math.max(resolved, 1)) * 100).toFixed(1)}%)`,
  )
  if (resolved === 0) {
    console.error('\nNOTHING RESOLVED — the tab would render no "you had" lines at all.')
    process.exit(1)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
