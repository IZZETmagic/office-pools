// =============================================================
// verify-results-depth — the two ladders, on the same match
// =============================================================
// Migrations 064/065/066. Decision 9's warning was that Scores is the WRONG
// DEFAULT for a 38-matchweek season — 760 numeric decisions between August and
// May, against 380 taps. Results was meant to be the pre-selected recommendation
// and had never been built, so every league pool that existed was implicitly
// Scores.
//
// Two scratch pools play the SAME season and the SAME fixture, one at each
// depth, so the ladders can be compared directly rather than described.
//
//   fixture finishes 2-0, a home win
//
//   SCORES pool                        RESULTS pool
//     2-0  exact          100            'home'  right   100
//     3-1  winner + margin  75            'draw'  wrong     0
//     1-0  winner only      50            'away'  wrong     0
//     0-2  wrong             0
//
// Also asserted: the XOR holds from the database side, a Results score row
// records the TAP rather than a fabricated scoreline, `exact_count` stays 0 in a
// Results pool, and depth cannot be changed once set.
//
//   npx tsx scripts/verify-results-depth.ts
//
// Exits 1 on any failure. Scratch season, torn down in a `finally`.
// =============================================================

import { readFileSync } from 'fs'
import { resolve } from 'path'

;(() => {
  const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
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
})()

import { createAdminClient } from '../lib/supabase/server'

const admin = createAdminClient()

const S = 'dd066000-0000-4000-8000-'
const SEASON = `${S}000000000001`
const POOL_S = `${S}000000000002` // scores
const POOL_R = `${S}000000000003` // results
const MEM_S = `${S}000000000004`
const MEM_R = `${S}000000000005`
const MW1 = `${S}000000000010`
const CLUB = (n: number) => `${S}00000000002${n}`
const FIX = `${S}000000000030`
const E = (n: number) => `${S}00000000004${n}`

let failures = 0
const ok = (m: string, x = '') => console.log(`    ✓ ${m}${x ? `  — ${x}` : ''}`)
const bad = (m: string, x = '') => { failures++; console.log(`    ✗ ${m}${x ? `  — ${x}` : ''}`) }
const note = (m: string) => console.log(`    · ${m}`)
const head = (m: string) => console.log(`\n  ${m}\n  ${'-'.repeat(66)}`)
const eq = (m: string, a: unknown, e: unknown) =>
  a === e ? ok(m, String(a)) : bad(m, `expected ${String(e)}, got ${String(a)}`)

async function must<T>(label: string, p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

type ScoreRow = {
  score_type: string; total_points: number
  predicted_home_score: number | null; predicted_away_score: number | null
  predicted_outcome: string | null
}
async function row(n: number): Promise<ScoreRow | undefined> {
  const rows = await must('score row', admin.from('league_match_scores')
    .select('score_type, total_points, predicted_home_score, predicted_away_score, predicted_outcome')
    .eq('entry_id', E(n)))
  return ((rows ?? [])[0] as ScoreRow | undefined)
}
async function totals(n: number) {
  const rows = await must('totals', admin.from('league_entry_totals')
    .select('total_points, exact_count, correct_count').eq('entry_id', E(n)))
  return ((rows ?? [])[0] as { total_points: number; exact_count: number; correct_count: number } | undefined)
}

async function setup() {
  head('Setup — two pools, same season, same match, different depths')

  const users = await must('admin user',
    admin.from('users').select('user_id').eq('username', 'IZZETmagic').limit(1))
  const adminUser = ((users ?? [])[0] as { user_id: string }).user_id
  const tp = await must('league tournament',
    admin.from('pools').select('tournament_id').not('league_season_id', 'is', null).limit(1))
  const tournamentId = ((tp ?? [])[0] as { tournament_id: string }).tournament_id
  const future = new Date(Date.now() + 90 * 864e5).toISOString()

  await must('season', admin.from('league_seasons').insert({
    season_id: SEASON, competition_slug: 'scratch-066', competition_name: 'Scratch 066',
    season_label: '2026/2027', season_start_year: 2026, country_code: 'GB',
    club_count: 4, matchweek_count: 1, external_provider: 'scratch',
    external_league_id: -66, external_season: -2026, regular_season_phase: 'regular',
  }).select('season_id'))

  await must('clubs', admin.from('league_clubs').insert(
    [1, 2, 3, 4].map((n) => ({
      club_id: CLUB(n), season_id: SEASON, name: `Scratch FC ${n}`,
      short_name: `SFC${n}`, abbreviation: `S${n}`, external_club_id: -660 - n,
    })),
  ).select('club_id'))

  await must('matchweek', admin.from('league_matchweeks').insert({
    matchweek_id: MW1, season_id: SEASON, matchweek_number: 1, label: 'MW1',
    provider_round: 'r1', fixture_count: 1, completed_fixture_count: 0, lock_at: future,
  }).select('matchweek_id'))

  await must('fixture', admin.from('league_fixtures').insert({
    fixture_id: FIX, season_id: SEASON, matchweek_id: MW1, fixture_number: 1,
    home_club_id: CLUB(1), away_club_id: CLUB(2), kickoff_at: future,
    status: 'scheduled', is_completed: false, external_fixture_id: 'scratch-066-1',
  }).select('fixture_id'))

  for (const [pid, depth, mid] of [[POOL_S, 'scores', MEM_S], [POOL_R, 'results', MEM_R]] as const) {
    await must(`pool ${depth}`, admin.from('pools').insert({
      pool_id: pid, tournament_id: tournamentId, admin_user_id: adminUser,
      pool_name: `__scratch 066 ${depth} (auto-deleted)`, prediction_deadline: future,
      status: 'open', prediction_mode: 'league_pickem', league_season_id: SEASON,
      league_depth: depth, max_entries_per_user: 10,
    }).select('pool_id'))
    await must(`membership ${depth}`, admin.from('pool_members').insert({
      member_id: mid, pool_id: pid, user_id: adminUser, role: 'admin',
    }).select('member_id'))
  }

  // 1-4 in the Scores pool, 5-7 in the Results pool
  for (const n of [1, 2, 3, 4]) {
    await must(`entry ${n}`, admin.from('pool_entries').insert({
      entry_id: E(n), member_id: MEM_S, entry_name: `S${n}`, entry_number: n,
    }).select('entry_id'))
  }
  for (const n of [5, 6, 7]) {
    await must(`entry ${n}`, admin.from('pool_entries').insert({
      entry_id: E(n), member_id: MEM_R, entry_name: `R${n}`, entry_number: n - 4,
    }).select('entry_id'))
  }

  await must('scoreline picks', admin.from('league_predictions').insert([
    { entry_id: E(1), fixture_id: FIX, predicted_home_score: 2, predicted_away_score: 0 },
    { entry_id: E(2), fixture_id: FIX, predicted_home_score: 3, predicted_away_score: 1 },
    { entry_id: E(3), fixture_id: FIX, predicted_home_score: 1, predicted_away_score: 0 },
    { entry_id: E(4), fixture_id: FIX, predicted_home_score: 0, predicted_away_score: 2 },
  ]).select('prediction_id'))

  await must('outcome picks', admin.from('league_predictions').insert([
    { entry_id: E(5), fixture_id: FIX, predicted_outcome: 'home' },
    { entry_id: E(6), fixture_id: FIX, predicted_outcome: 'draw' },
    { entry_id: E(7), fixture_id: FIX, predicted_outcome: 'away' },
  ]).select('prediction_id'))
  ok('four scoreline picks and three taps stored')
}

async function run() {
  head('1. The database refuses a prediction that is neither shape, or both')

  const both = await admin.from('league_predictions').insert({
    entry_id: E(1), fixture_id: FIX, predicted_home_score: 1,
    predicted_away_score: 0, predicted_outcome: 'home',
  })
  if (both.error) ok('a pick with BOTH a scoreline and a tap is refused')
  else bad('a pick with BOTH a scoreline and a tap is refused', 'it was accepted')

  const neither = await admin.from('league_predictions').insert({
    entry_id: E(2), fixture_id: FIX,
  })
  if (neither.error) ok('a pick with NEITHER is refused')
  else bad('a pick with NEITHER is refused', 'it was accepted')
  note('the XOR is a CHECK, not a convention — mobile writes here too')

  head('2. The match finishes 2-0 — a home win')
  await must('complete', admin.from('league_fixtures').update({
    home_goals: 2, away_goals: 0, is_completed: true, status: 'completed',
    completed_at: new Date().toISOString(),
  }).eq('fixture_id', FIX).select('fixture_id'))
  await must('rollup', admin.from('league_matchweeks')
    .update({ completed_fixture_count: 1 }).eq('matchweek_id', MW1).select('matchweek_id'))

  const res = await admin.rpc('league_score_fixture', { p_fixture_id: FIX })
  if (res.error) throw new Error(`score: ${res.error.message}`)

  head('3. SCORES depth — the full four-rung ladder')
  const expectS: Array<[number, string, string, number]> = [
    [1, '2-0', 'exact', 100],
    [2, '3-1', 'winner_gd', 75],
    [3, '1-0', 'winner', 50],
    [4, '0-2', 'miss', 0],
  ]
  for (const [n, pick, type, pts] of expectS) {
    const r = await row(n)
    if (r?.score_type === type && r?.total_points === pts) ok(`predicted ${pick}`, `${type} · ${pts}`)
    else bad(`predicted ${pick}`, `expected ${type}/${pts}, got ${r?.score_type}/${r?.total_points}`)
  }

  head('4. RESULTS depth — one tap, right or wrong')
  const expectR: Array<[number, string, string, number]> = [
    [5, 'home', 'winner', 100],
    [6, 'draw', 'miss', 0],
    [7, 'away', 'miss', 0],
  ]
  for (const [n, pick, type, pts] of expectR) {
    const r = await row(n)
    if (r?.score_type === type && r?.total_points === pts) ok(`tapped ${pick}`, `${type} · ${pts}`)
    else bad(`tapped ${pick}`, `expected ${type}/${pts}, got ${r?.score_type}/${r?.total_points}`)
  }
  note('a correct tap is worth the pool top price (100), not the 50 a bare winner gets')

  head('5. A Results score row records the TAP, not a fabricated scoreline')
  const r5 = await row(5)
  eq('predicted_outcome is stored', r5?.predicted_outcome, 'home')
  eq('predicted_home_score is NULL, not 1', r5?.predicted_home_score, null)
  eq('predicted_away_score is NULL, not 0', r5?.predicted_away_score, null)
  note('a sentinel 1-0 would have scored as a genuine exact and shown the member')
  note('a scoreline they never entered — Decision 9 names this trap by name')

  const r1 = await row(1)
  eq('a Scores row still keeps its scoreline', `${r1?.predicted_home_score}-${r1?.predicted_away_score}`, '2-0')
  eq('...and has no outcome', r1?.predicted_outcome, null)

  head('6. exact_count goes inert in a Results pool')
  const t5 = await totals(5)
  eq('the correct tap counts as correct', t5?.correct_count, 1)
  eq('but it is NOT an exact', t5?.exact_count, 0)
  const t1 = await totals(1)
  eq('the Scores pool still counts exacts', t1?.exact_count, 1)
  note('so the rank cascade quietly runs four rungs in a Results pool — expected')

  head('7. Depth cannot be changed once set')
  const flip = await admin.from('pools').update({ league_depth: 'scores' }).eq('pool_id', POOL_R)
  if (flip.error) ok('changing depth is refused', flip.error.message.slice(0, 60) + '…')
  else bad('changing depth is refused', 'it was accepted — mixed depths break Showdown')

  const rename = await admin.from('pools')
    .update({ pool_name: '__scratch 066 results (renamed)' }).eq('pool_id', POOL_R)
  if (!rename.error) ok('but every other column still updates freely')
  else bad('but every other column still updates freely', rename.error.message)
}

async function teardown() {
  head('Teardown')
  for (const pid of [POOL_S, POOL_R]) {
    await admin.from('pool_entries').delete().eq('pool_id', pid)
    await admin.from('pools').delete().eq('pool_id', pid)
  }
  await admin.from('league_seasons').delete().eq('season_id', SEASON)

  const left: string[] = []
  for (const [t, col, val] of [
    ['pools', 'pool_id', POOL_S], ['pools', 'pool_id', POOL_R],
    ['league_seasons', 'season_id', SEASON], ['league_fixtures', 'season_id', SEASON],
  ] as const) {
    const { count } = await admin.from(t).select('*', { count: 'exact', head: true }).eq(col, val)
    if ((count ?? 0) > 0) left.push(`${t}=${count}`)
  }
  if (left.length) bad('scratch data fully removed', left.join(', '))
  else ok('scratch data fully removed', 'production is exactly as it was found')
}

;(async () => {
  console.log('\n' + '='.repeat(70))
  console.log('  380 taps or 760 numbers — do both ladders score correctly?')
  console.log('='.repeat(70))
  try {
    await setup()
    await run()
  } catch (err) {
    failures++
    console.log(`\n    ✗ THREW: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    try { await teardown() } catch (err) {
      failures++
      console.log(`    ✗ TEARDOWN FAILED: ${err instanceof Error ? err.message : String(err)}`)
      console.log(`      by hand: delete from pools where pool_id in ('${POOL_S}','${POOL_R}');`)
      console.log(`               delete from league_seasons where season_id='${SEASON}';`)
    }
  }
  console.log('\n' + '='.repeat(70))
  console.log(failures === 0 ? '  All checks passed.' : `  ${failures} CHECK(S) FAILED.`)
  console.log('='.repeat(70) + '\n')
  process.exit(failures === 0 ? 0 : 1)
})()
