// =============================================================
// verify-league-live-scoring — a match, scored goal by goal
// =============================================================
// Migration 063 opened the engine's gate so a LIVE fixture scores, not only a
// finished one. This walks one match through five score changes and asserts the
// points move correctly at each step, then lands on the right number at full
// time.
//
// The narrative is the one from the product doc: you predicted 2-1, and your
// position moves as the match unfolds.
//
//   0-0 live  -> draw, you predicted a home win        -> miss       0
//   1-0 live  -> home win by 1, you said home by 1     -> winner_gd 75
//   2-1 live  -> exactly your scoreline                -> exact    100
//   2-2 live  -> a late equaliser takes it all back    -> miss       0
//   2-1 FT    -> the equaliser is disallowed           -> exact    100
//
// That last step matters more than it looks: it is the proof that points can be
// TAKEN BACK. Totals are recomputed from the score rows rather than incremented,
// which is the property that makes scoring a match five times safe.
//
// Also asserted: postponed and cancelled fixtures are REFUSED even carrying a
// score (an abandoned match is not a result), and a live fixture holds the
// weekly movement arrows open until the match actually ends.
//
//   npx tsx scripts/verify-league-live-scoring.ts
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

const S = 'dd063000-0000-4000-8000-'
const SEASON = `${S}000000000001`
const POOL = `${S}000000000002`
const MEMBER = `${S}000000000003`
const ENTRY = `${S}000000000004`
const MW1 = `${S}000000000010`
const CLUB = (n: number) => `${S}00000000002${n}`
const FIX = (n: number) => `${S}00000000003${n}`

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

async function setState(
  n: number,
  o: { status: string; h: number | null; a: number | null; completed: boolean },
) {
  const { error } = await admin.from('league_fixtures').update({
    status: o.status, home_goals: o.h, away_goals: o.a, is_completed: o.completed,
    completed_at: o.completed ? new Date().toISOString() : null,
  }).eq('fixture_id', FIX(n))
  if (error) throw new Error(`setState ${n}: ${error.message}`)
}

/** Score a fixture and hand back the engine's own verdict. */
async function score(n: number): Promise<{ ok: boolean; reason?: string; status?: string }> {
  const { data, error } = await admin.rpc('league_score_fixture', { p_fixture_id: FIX(n) })
  if (error) throw new Error(`score ${n}: ${error.message}`)
  return (data ?? {}) as { ok: boolean; reason?: string; status?: string }
}

async function points(): Promise<number> {
  const rows = await must('totals', admin.from('league_entry_totals')
    .select('total_points').eq('entry_id', ENTRY))
  return ((rows ?? [])[0] as { total_points: number } | undefined)?.total_points ?? 0
}

async function scoreType(n: number): Promise<string | null> {
  const rows = await must('score row', admin.from('league_match_scores')
    .select('score_type').eq('entry_id', ENTRY).eq('fixture_id', FIX(n)))
  return ((rows ?? [])[0] as { score_type: string } | undefined)?.score_type ?? null
}

async function setup() {
  head('Setup — one entry, predicting 2-1')

  const users = await must('admin user',
    admin.from('users').select('user_id').eq('username', 'IZZETmagic').limit(1))
  const adminUser = ((users ?? [])[0] as { user_id: string }).user_id
  const tp = await must('league tournament',
    admin.from('pools').select('tournament_id').not('league_season_id', 'is', null).limit(1))
  const tournamentId = ((tp ?? [])[0] as { tournament_id: string }).tournament_id
  const future = new Date(Date.now() + 90 * 864e5).toISOString()

  await must('season', admin.from('league_seasons').insert({
    season_id: SEASON, competition_slug: 'scratch-063', competition_name: 'Scratch 063',
    season_label: '2026/2027', season_start_year: 2026, country_code: 'GB',
    club_count: 4, matchweek_count: 1, external_provider: 'scratch',
    external_league_id: -63, external_season: -2026, regular_season_phase: 'regular',
  }).select('season_id'))

  await must('clubs', admin.from('league_clubs').insert(
    [1, 2, 3, 4].map((n) => ({
      club_id: CLUB(n), season_id: SEASON, name: `Scratch FC ${n}`,
      short_name: `SFC${n}`, abbreviation: `S${n}`, external_club_id: -630 - n,
    })),
  ).select('club_id'))

  await must('matchweek', admin.from('league_matchweeks').insert({
    matchweek_id: MW1, season_id: SEASON, matchweek_number: 1, label: 'MW1',
    provider_round: 'r1', fixture_count: 2, completed_fixture_count: 0, lock_at: future,
  }).select('matchweek_id'))

  await must('fixtures', admin.from('league_fixtures').insert(
    [1, 2].map((n) => ({
      fixture_id: FIX(n), season_id: SEASON, matchweek_id: MW1, fixture_number: n,
      home_club_id: CLUB(1), away_club_id: CLUB(2), kickoff_at: future,
      status: 'scheduled', is_completed: false, external_fixture_id: `scratch-063-${n}`,
    })),
  ).select('fixture_id'))

  await must('pool', admin.from('pools').insert({
    pool_id: POOL, tournament_id: tournamentId, admin_user_id: adminUser,
    pool_name: '__scratch 063 live scoring (auto-deleted)', prediction_deadline: future,
    status: 'open', prediction_mode: 'league_pickem', league_season_id: SEASON,
  }).select('pool_id'))

  await must('membership', admin.from('pool_members').insert({
    member_id: MEMBER, pool_id: POOL, user_id: adminUser, role: 'admin',
  }).select('member_id'))

  await must('entry', admin.from('pool_entries').insert({
    entry_id: ENTRY, member_id: MEMBER, entry_name: 'Live Entry', entry_number: 1,
  }).select('entry_id'))

  // 2-1 on fixture 1, and a throwaway pick on fixture 2 so the matchweek has
  // something to score when we need it to complete.
  await must('picks', admin.from('league_predictions').insert([
    { entry_id: ENTRY, fixture_id: FIX(1), predicted_home_score: 2, predicted_away_score: 1 },
    { entry_id: ENTRY, fixture_id: FIX(2), predicted_home_score: 0, predicted_away_score: 0 },
  ]).select('prediction_id'))
  ok('entry predicts 2-1 on fixture 1')
}

async function run() {
  head('1. Nothing has kicked off')
  const sched = await score(1)
  eq('a scheduled fixture is refused', sched.ok, false)
  eq('...and scores nothing', await points(), 0)

  head('2. The match unfolds — points move on every goal')
  const steps: Array<[string, number, number, string, number]> = [
    // label,            h, a, expected score_type, expected points
    ['kick-off, 0-0',    0, 0, 'miss',       0],
    ['1-0 to the home side', 1, 0, 'winner_gd', 75],
    ['2-1 — exactly your prediction', 2, 1, 'exact', 100],
    ['2-2, a late equaliser', 2, 2, 'miss',   0],
  ]
  for (const [label, h, a, type, pts] of steps) {
    await setState(1, { status: 'live', h, a, completed: false })
    const r = await score(1)
    if (!r.ok) { bad(`${label} — the engine scored it`, `refused: ${r.reason}`); continue }
    const st = await scoreType(1)
    const p = await points()
    if (st === type && p === pts) ok(label, `${type} · ${p} pts`)
    else bad(label, `expected ${type}/${pts}, got ${st}/${p}`)
  }
  note('every step RECOMPUTED the total — the 2-2 took the 100 back, it did not add')

  head('3. Full time — the equaliser is disallowed')
  await setState(1, { status: 'completed', h: 2, a: 1, completed: true })
  const ft = await score(1)
  eq('the engine scored the final result', ft.ok, true)
  eq('score type is exact', await scoreType(1), 'exact')
  eq('POINTS LAND ON THE RIGHT NUMBER', await points(), 100)

  head('4. An abandoned match is not a result')
  for (const status of ['postponed', 'cancelled']) {
    await setState(2, { status, h: 3, a: 0, completed: false })
    const r = await score(2)
    eq(`a ${status} fixture is refused even carrying a score`, r.ok, false)
  }
  eq('and it contributed nothing', await scoreType(2), null)

  head('5. A live fixture holds the weekly arrows open')
  // Fixture 1 is finished. Put fixture 2 LIVE and mark the matchweek complete —
  // the rollup can run ahead of the whistle. Migration 061 must still refuse to
  // freeze the arrows, because fixture 2's witness says it is not done.
  await setState(2, { status: 'live', h: 1, a: 1, completed: false })
  await must('rollup', admin.from('league_matchweeks')
    .update({ completed_fixture_count: 2 }).eq('matchweek_id', MW1).select('matchweek_id'))
  await score(2)

  const mid = await must('mw', admin.from('league_matchweeks')
    .select('ranks_snapshot_at').eq('matchweek_id', MW1))
  eq('arrows stay open while a fixture is still being played',
    ((mid ?? [])[0] as { ranks_snapshot_at: string | null }).ranks_snapshot_at, null)

  await setState(2, { status: 'completed', h: 1, a: 1, completed: true })
  await score(2)
  const done = await must('mw', admin.from('league_matchweeks')
    .select('ranks_snapshot_at').eq('matchweek_id', MW1))
  const snap = ((done ?? [])[0] as { ranks_snapshot_at: string | null }).ranks_snapshot_at
  if (snap) ok('and freeze the moment the last match ends')
  else bad('and freeze the moment the last match ends', 'still null')

  // 0-0 predicted, 1-1 actual: right outcome, right margin -> winner_gd
  eq('the second fixture scored on its merits', await scoreType(2), 'winner_gd')
}

async function teardown() {
  head('Teardown')
  await admin.from('pool_entries').delete().eq('pool_id', POOL)
  await admin.from('pools').delete().eq('pool_id', POOL)
  await admin.from('league_seasons').delete().eq('season_id', SEASON)

  const left: string[] = []
  for (const [t, col, val] of [
    ['pools', 'pool_id', POOL], ['pool_members', 'pool_id', POOL],
    ['pool_entries', 'pool_id', POOL], ['league_predictions', 'entry_id', ENTRY],
    ['league_entry_totals', 'entry_id', ENTRY], ['league_match_scores', 'entry_id', ENTRY],
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
  console.log('  Does the leaderboard move while the match is still on?')
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
      console.log(`      by hand: delete from pools where pool_id='${POOL}';`)
      console.log(`               delete from league_seasons where season_id='${SEASON}';`)
    }
  }
  console.log('\n' + '='.repeat(70))
  console.log(failures === 0 ? '  All checks passed.' : `  ${failures} CHECK(S) FAILED.`)
  console.log('='.repeat(70) + '\n')
  process.exit(failures === 0 ? 0 : 1)
})()
