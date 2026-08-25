// =============================================================
// verify-matchweek-rhythm — only the OPEN matchweek accepts picks
// =============================================================
// Decision 16: strictly one matchweek open at a time, opening automatically as
// the previous one locks. `lib/league/read.ts` -> openMatchweekId() makes the
// SCREEN obey that. Migration 058 makes the DATABASE obey it, which is the half
// that survives a stale tab, the API, and the mobile app that writes
// predictions directly — the exact reason the World Cup's post-kickoff edit bug
// had to be fixed with a trigger and not in a screen.
//
// ## Why this tests BOTH directions
//
// `enforce_league_prediction_before_lock` is a SILENT-SKIP trigger: it answers a
// rejected pick with RETURN NULL, so the row vanishes and the caller is told it
// succeeded. A test that only proved rejection would therefore pass just as
// happily if the trigger rejected EVERYTHING — which would stop all picking on
// the one live pool with three real members, with no error anywhere for anyone
// to notice.
//
// So the load-bearing assertion here is the POSITIVE one: a pick for the open
// matchweek must still be stored.
//
//   npx tsx scripts/verify-matchweek-rhythm.ts
//
// Exits 1 on any failure. Builds its own scratch season and deletes it in a
// `finally`, so a crash mid-run still tears down.
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
import { openMatchweekId } from '../lib/league/read'

const admin = createAdminClient()

// scratch namespace — every id starts dd058 so strays are greppable
const S = 'dd058000-0000-4000-8000-'
const SEASON = `${S}000000000001`
const POOL = `${S}000000000002`
const MEMBER = `${S}000000000003`
const ENTRY = `${S}000000000004`
const MW = (n: number) => `${S}00000000001${n}`
const CLUB = (n: number) => `${S}00000000002${n}`
const FIX = (n: number) => `${S}00000000003${n}`

let failures = 0
const ok = (m: string, x = '') => console.log(`    ✓ ${m}${x ? `  — ${x}` : ''}`)
const bad = (m: string, x = '') => { failures++; console.log(`    ✗ ${m}${x ? `  — ${x}` : ''}`) }
const note = (m: string) => console.log(`    · ${m}`)
const head = (m: string) => console.log(`\n  ${m}\n  ${'-'.repeat(66)}`)

async function must<T>(label: string, p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

/**
 * Try to store a pick, then READ IT BACK.
 *
 * The read-back is the whole point: the trigger drops a rejected row and
 * reports success, so the insert's own error field says nothing useful. Only
 * the row's presence distinguishes accepted from silently discarded.
 */
async function tryPick(fixtureNum: number): Promise<boolean> {
  await admin.from('league_predictions').delete().eq('entry_id', ENTRY).eq('fixture_id', FIX(fixtureNum))
  const { error } = await admin.from('league_predictions').insert({
    entry_id: ENTRY, fixture_id: FIX(fixtureNum),
    predicted_home_score: 1, predicted_away_score: 0,
  })
  if (error && !/duplicate/i.test(error.message)) throw new Error(`pick ${fixtureNum}: ${error.message}`)
  const { count, error: cErr } = await admin
    .from('league_predictions').select('*', { count: 'exact', head: true })
    .eq('entry_id', ENTRY).eq('fixture_id', FIX(fixtureNum))
  if (cErr) throw new Error(`read back ${fixtureNum}: ${cErr.message}`)
  return (count ?? 0) > 0
}

async function setup() {
  head('Setup — a scratch season: MW1 played, MW2 open, MW3 still to come')

  const users = await must('admin user',
    admin.from('users').select('user_id').eq('username', 'IZZETmagic').limit(1))
  const adminUser = ((users ?? [])[0] as { user_id: string }).user_id

  const tp = await must('league tournament',
    admin.from('pools').select('tournament_id').not('league_season_id', 'is', null).limit(1))
  const tournamentId = ((tp ?? [])[0] as { tournament_id: string }).tournament_id

  const future = new Date(Date.now() + 90 * 864e5).toISOString()

  await must('season', admin.from('league_seasons').insert({
    season_id: SEASON, competition_slug: 'scratch-058', competition_name: 'Scratch 058',
    season_label: '2026/2027', season_start_year: 2026, country_code: 'GB',
    club_count: 4, matchweek_count: 3, external_provider: 'scratch',
    external_league_id: -58, external_season: -2026, regular_season_phase: 'regular',
  }).select('season_id'))

  await must('clubs', admin.from('league_clubs').insert(
    [1, 2, 3, 4].map((n) => ({
      club_id: CLUB(n), season_id: SEASON, name: `Scratch FC ${n}`,
      short_name: `SFC${n}`, abbreviation: `S${n}`, external_club_id: -580 - n,
    })),
  ).select('club_id'))

  await must('matchweeks', admin.from('league_matchweeks').insert(
    [1, 2, 3].map((n) => ({
      matchweek_id: MW(n), season_id: SEASON, matchweek_number: n, label: `MW${n}`,
      provider_round: `r${n}`, fixture_count: 2, completed_fixture_count: 0, lock_at: future,
    })),
  ).select('matchweek_id'))

  // fixtures 1-2 in MW1, 3-4 in MW2, 5-6 in MW3
  await must('fixtures', admin.from('league_fixtures').insert(
    [1, 2, 3, 4, 5, 6].map((n) => ({
      fixture_id: FIX(n), season_id: SEASON, matchweek_id: MW(Math.ceil(n / 2)),
      fixture_number: n, home_club_id: CLUB(1), away_club_id: CLUB(2),
      kickoff_at: future, status: 'scheduled', is_completed: false,
      external_fixture_id: `scratch-058-${n}`,
    })),
  ).select('fixture_id'))

  await must('pool', admin.from('pools').insert({
    pool_id: POOL, tournament_id: tournamentId, admin_user_id: adminUser,
    pool_name: '__scratch 058 rhythm (auto-deleted)', prediction_deadline: future,
    status: 'open', prediction_mode: 'league_pickem', league_season_id: SEASON,
  }).select('pool_id'))

  await must('membership', admin.from('pool_members').insert({
    member_id: MEMBER, pool_id: POOL, user_id: adminUser, role: 'admin',
  }).select('member_id'))

  await must('entry', admin.from('pool_entries').insert({
    entry_id: ENTRY, member_id: MEMBER, entry_name: 'Rhythm Entry', entry_number: 1,
  }).select('entry_id'))

  // Finish MW1, which is what makes MW2 the open one.
  for (const n of [1, 2]) {
    const { error } = await admin.from('league_fixtures').update({
      home_goals: 1, away_goals: 0, is_completed: true,
      status: 'completed', completed_at: new Date().toISOString(),
    }).eq('fixture_id', FIX(n))
    if (error) throw new Error(`complete ${n}: ${error.message}`)
  }
  await must('rollup', admin.from('league_matchweeks')
    .update({ completed_fixture_count: 2 }).eq('matchweek_id', MW(1)).select('matchweek_id'))

  // The read side and the database must agree on WHICH matchweek is open, or
  // the screen offers one thing and the trigger accepts another.
  const rows = await must('matchweeks back',
    admin.from('league_matchweeks')
      .select('matchweek_id, matchweek_number, fixture_count, completed_fixture_count, lock_at, first_kickoff_at')
      .eq('season_id', SEASON))
  const open = openMatchweekId(rows as never, Date.now())
  if (open === MW(2)) ok('the read side says MW2 is open', 'MW1 finished, MW3 not yet its turn')
  else bad('the read side says MW2 is open', `got ${open}`)
}

async function run() {
  head('The three cases')

  const openStored = await tryPick(3)
  if (openStored) ok('MW2 — the OPEN matchweek — a pick IS stored', 'the load-bearing case')
  else bad('MW2 — the OPEN matchweek — a pick IS stored',
    'PICKING IS BROKEN. The trigger is rejecting everything; do not ship this.')

  const aheadStored = await tryPick(5)
  if (!aheadStored) ok('MW3 — NOT YET OPEN — a pick is refused', 'decision 16, enforced in the database')
  else bad('MW3 — NOT YET OPEN — a pick is refused',
    'stored. The rhythm is screen-only — migration 058 is not applied.')

  const doneStored = await tryPick(1)
  if (!doneStored) ok('MW1 — already played — a pick is refused', 'the pre-existing rule still holds')
  else bad('MW1 — already played — a pick is refused', 'stored — the completed-fixture guard regressed')

  console.log()
  if (openStored && !aheadStored && !doneStored) {
    note('Exactly one matchweek accepts picks, and it is the open one.')
  } else if (openStored && aheadStored) {
    note('BEFORE-state: the database has no concept of "open" yet. Apply migration 058.')
  }
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
    ['league_seasons', 'season_id', SEASON], ['league_clubs', 'season_id', SEASON],
    ['league_matchweeks', 'season_id', SEASON], ['league_fixtures', 'season_id', SEASON],
  ] as const) {
    const { count } = await admin.from(t).select('*', { count: 'exact', head: true }).eq(col, val)
    if ((count ?? 0) > 0) left.push(`${t}=${count}`)
  }
  if (left.length) bad('scratch data fully removed', left.join(', '))
  else ok('scratch data fully removed', 'production is exactly as it was found')
}

;(async () => {
  console.log('\n' + '='.repeat(70))
  console.log('  Does only the OPEN matchweek accept picks?')
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
      console.log(`      clean up by hand: delete from pools where pool_id='${POOL}';`)
      console.log(`                        delete from league_seasons where season_id='${SEASON}';`)
    }
  }
  console.log('\n' + '='.repeat(70))
  console.log(failures === 0 ? '  All checks passed.' : `  ${failures} CHECK(S) FAILED.`)
  console.log('='.repeat(70) + '\n')
  process.exit(failures === 0 ? 0 : 1)
})()
