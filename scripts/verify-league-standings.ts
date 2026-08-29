// =============================================================
// verify-league-standings — the real table, end to end
// =============================================================
// Plan §0.3. This is the one league feature whose foundation is a NEW
// api-football endpoint, and the client has never spoken to it before. The
// point of this script is to find out — against the live feed, with the real
// key — whether `/standings` answers at all, and whether every club it names
// maps to a `league_clubs` row.
//
// ⚠ THIS MAKES ONE REAL API CALL and writes `league_standings` for the real
// season. Both are the intended production behaviour: standings are public
// reference data, the write is an upsert, and one call against a plan already
// making 1,440 a day for fixtures is noise.
//
// ⚠ It does NOT touch predictions, scores, totals or any pool.
//
//   npx tsx scripts/verify-league-standings.ts
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
import { syncLeagueStandings } from '../lib/integrations/apiFootball/syncLeagueStandings'

const admin = createAdminClient()
let failures = 0
const ok = (m: string, x = '') => console.log(`    ✓ ${m}${x ? `  — ${x}` : ''}`)
const bad = (m: string, x = '') => { failures++; console.log(`    ✗ ${m}${x ? `  — ${x}` : ''}`) }
const note = (m: string) => console.log(`    · ${m}`)
const head = (m: string) => console.log(`\n  ${m}\n  ${'-'.repeat(66)}`)

;(async () => {
  console.log('\n' + '='.repeat(70))
  console.log('  Can we read the real league table, and does it map?')
  console.log('='.repeat(70))
  try {
    const { data: seasons } = await admin
      .from('league_seasons')
      .select('season_id, competition_name, season_label, external_league_id, external_season')
      .neq('external_provider', 'scratch')
      .order('competition_slug')
    const all = (seasons ?? []) as Array<{
      season_id: string; competition_name: string; season_label: string
      external_league_id: number; external_season: number
    }>
    if (all.length === 0) { bad('a real season exists'); return }

    // ⚠ This used to be `seasons[0]`. Written when there was exactly one league,
    // it kept reporting "All checks passed" after La Liga landed while having
    // checked only the Premier League — a verification script that silently
    // covers half of what it claims is worse than none, because it is trusted.
    console.log(`\n  ${all.length} season(s) to check: ${all.map((s) => s.competition_name).join(', ')}`)
    for (const season of all) {
    head(`1. Asking the feed — ${season.competition_name} ${season.season_label}`)
    note(`league ${season.external_league_id}, season ${season.external_season}`)

    const res = await syncLeagueStandings(admin, {
      seasonId: season.season_id,
      externalLeagueId: season.external_league_id,
      externalSeason: season.external_season,
    })

    if (res.error) {
      bad('/standings answered', res.error)
      note('If this says "refused", the key or plan does not include /standings —')
      note('and the whole phase rests on an endpoint we cannot call.')
      return
    }
    ok('/standings answered without a refusal', `${res.seen} clubs`)

    if (res.unmapped.length > 0) {
      bad(`every feed club maps to a league_clubs row`, `${res.unmapped.length} unmapped`)
      for (const u of res.unmapped) note(`unmapped: ${u.externalId} ${u.name}`)
    } else if (res.seen > 0) {
      ok('every feed club maps to a league_clubs row')
    }
    ok('rows written', String(res.written))

    head('2. What the table says')
    const { data: table } = await admin
      .from('league_standings')
      .select('rank, points, played, goals_diff, form, description, movement, club_id')
      .eq('season_id', season.season_id).order('rank').limit(6)
    const { data: clubs } = await admin
      .from('league_clubs').select('club_id, name').eq('season_id', season.season_id)
    const nameOf = new Map(((clubs ?? []) as Array<{club_id:string;name:string}>).map(c => [c.club_id, c.name]))
    for (const r of (table ?? []) as Array<Record<string, unknown>>) {
      const arrow = r.movement === 'up' ? '▲' : r.movement === 'down' ? '▼' : '–'
      note(`${String(r.rank).padStart(2)} ${arrow} ${String(nameOf.get(r.club_id as string) ?? '?').padEnd(18)}` +
           ` P${r.played} GD${r.goals_diff} ${r.points}pts  ${r.form ?? ''}  ${r.description ?? ''}`)
    }
    if ((table ?? []).length > 0) ok('the table reads back in rank order')
    else bad('the table reads back in rank order', 'no rows')

    head('3. Cross-check against our own arithmetic')
    const { data: cross, error: cErr } = await admin
      .rpc('league_standings_crosscheck', { p_season_id: season.season_id })
    if (cErr) { bad('cross-check ran', cErr.message); return }
    const rows = (cross ?? []) as Array<{ club_name: string; kind: string; feed_points: number; derived_points: number; points_delta: number }>
    const mismatch = rows.filter(r => r.kind === 'points_mismatch')
    const tiebreak = rows.filter(r => r.kind === 'tiebreak_only')
    ok('cross-check ran', `${rows.length} clubs compared`)
    note(`${tiebreak.length} tiebreak-only differences — EXPECTED, our last rung is name`)
    if (mismatch.length === 0) {
      ok('no points mismatch', 'no deduction, and our arithmetic agrees with the feed')
    } else {
      note(`${mismatch.length} POINTS mismatches — a deduction, or our fixtures are wrong:`)
      for (const m of mismatch) {
        note(`  ${m.club_name}: feed ${m.feed_points}, ours ${m.derived_points} (${m.points_delta >= 0 ? '+' : ''}${m.points_delta})`)
      }
      note('This is the detection mechanism working, not necessarily a bug.')
    }
    }
  } catch (err) {
    failures++
    console.log(`\n    ✗ THREW: ${err instanceof Error ? err.message : String(err)}`)
  }
  console.log('\n' + '='.repeat(70))
  console.log(failures === 0 ? '  All checks passed.' : `  ${failures} CHECK(S) FAILED.`)
  console.log('='.repeat(70) + '\n')
  process.exit(failures === 0 ? 0 : 1)
})()
