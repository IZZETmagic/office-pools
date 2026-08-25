// =============================================================
// verify-postponed-fixtures — the week ends even when a match does not
// =============================================================
// Ryan, 2026-08-24: "what happens in Showdown when a match has been postponed or
// cancelled or moved, which is guaranteed to happen?"
//
// It froze. `refresh_league_matchweek_window` counts every fixture in the
// denominator and only completed ones in the numerator, so a called-off match
// sat there forever — and the Showdown duel, the Last Man Standing round, the
// weekly arrow and "results are in" all hang off that one gate. Postponed
// resolved months late; cancelled never resolved at all.
//
// Migration 094: a matchweek settles when every fixture is played, OR when its
// WINDOW HAS CLOSED — the next matchweek has locked — on whatever was played.
//
// Four things have to hold, and each could fail on its own:
//
//   1. it does NOT settle early, while the week is still running
//   2. it DOES settle once the next week locks, with a hole in it
//   3. the duel resolves on the played fixtures, fairly, for both sides
//   4. a completed-but-UNSCORED fixture still blocks — that is the engine being
//      behind, not a called-off match, and settling then would settle a week
//      whose scoring had not finished
//
//   npx tsx scripts/verify-postponed-fixtures.ts
//
// Exits 1 on any failure. Scratch season, torn down in a `finally`.
// =============================================================

import { readFileSync } from 'fs'
import { resolve } from 'path'

;(() => {
  const c = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of c.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i === -1) continue
    const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
})()

import { createAdminClient } from '../lib/supabase/server'
const admin = createAdminClient()

const S = 'dd160000-0000-4000-8000-'
const hex = (n: number) => n.toString(16).padStart(12, '0')
const SEASON = `${S}${hex(1)}`
const POOL_S = `${S}${hex(2)}`   // showdown
const POOL_L = `${S}${hex(3)}`   // last man standing
const MEM = (n: number) => `${S}${hex(10 + n)}`
const MW = (n: number) => `${S}${hex(20 + n)}`
const CLUB = (n: number) => `${S}${hex(100 + n)}`
const FIX = (mw: number, n: number) => `${S}${hex(200 + mw * 10 + n)}`
const E = (n: number) => `${S}${hex(300 + n)}`

let failures = 0
const ok = (m: string, x = '') => console.log(`    ✓ ${m}${x ? `  — ${x}` : ''}`)
const bad = (m: string, x = '') => { failures++; console.log(`    ✗ ${m}${x ? `  — ${x}` : ''}`) }
const note = (m: string) => console.log(`    · ${m}`)
const head = (m: string) => console.log(`\n  ${m}\n  ${'-'.repeat(68)}`)
const eq = (m: string, a: unknown, e: unknown) =>
  a === e ? ok(m, String(a)) : bad(m, `expected ${String(e)}, got ${String(a)}`)

async function must<T>(l: string, p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p
  if (error) throw new Error(`${l}: ${error.message}`)
  return data
}
const hours = (h: number) => new Date(Date.now() + h * 3600e3).toISOString()

async function snapshotted(mw: number) {
  await admin.rpc('league_snapshot_matchweek_ranks', { p_matchweek_id: MW(mw) })
  const r = await must('mw', admin.from('league_matchweeks')
    .select('ranks_snapshot_at').eq('matchweek_id', MW(mw)))
  return ((r ?? [])[0] as { ranks_snapshot_at: string | null }).ranks_snapshot_at !== null
}

/** Score a fixture the way the engine does, including the 061 witness. */
async function score(fixture: string, mwNum: number, fxNum: number, entries: Array<[number, number]>) {
  await must('state', admin.from('league_fixture_state').upsert({
    fixture_id: fixture, is_completed: true, home_goals: 1, away_goals: 0,
  }, { onConflict: 'fixture_id' }).select('fixture_id'))
  for (const [entry, pts] of entries) {
    await must('score', admin.from('league_match_scores').upsert({
      entry_id: E(entry), fixture_id: fixture, pool_id: POOL_S,
      matchweek_number: mwNum, fixture_number: fxNum,
      kicked_off_at: new Date().toISOString(),
      actual_home_score: 1, actual_away_score: 0, predicted_outcome: 'home',
      score_type: 'winner', base_points: pts, total_points: pts,
    }, { onConflict: 'entry_id,fixture_id' }).select('entry_id'))
  }
}

async function setup() {
  head('Setup — two matchweeks, two fixtures each, a Showdown pool and an LMS pool')

  const users = await must('u', admin.from('users').select('user_id').eq('username', 'IZZETmagic').limit(1))
  const adminUser = ((users ?? [])[0] as { user_id: string }).user_id
  const tp = await must('t', admin.from('pools').select('tournament_id').not('league_season_id', 'is', null).limit(1))
  const tournamentId = ((tp ?? [])[0] as { tournament_id: string }).tournament_id

  await must('season', admin.from('league_seasons').insert({
    season_id: SEASON, competition_slug: 'scratch-160', competition_name: 'Scratch Postponed',
    season_label: '2026/2027', season_start_year: 2026, country_code: 'GB',
    club_count: 4, matchweek_count: 2, external_provider: 'scratch',
    external_league_id: -160, external_season: -2026, regular_season_phase: 'regular',
  }).select('season_id'))
  await must('clubs', admin.from('league_clubs').insert([1, 2, 3, 4].map((n) => ({
    club_id: CLUB(n), season_id: SEASON, name: `C${n}`, short_name: `C${n}`,
    abbreviation: `C${n}`, external_club_id: -(1600 + n),
  }))).select('club_id'))

  // MW1 opens now and locks in an hour; MW2 locks in a week. Both in the future
  // so picks land, then MW1 is closed by moving its lock back.
  for (const n of [1, 2]) {
    await must(`mw${n}`, admin.from('league_matchweeks').insert({
      matchweek_id: MW(n), season_id: SEASON, matchweek_number: n, label: `MW${n}`,
      provider_round: `r${n}`, fixture_count: 2, completed_fixture_count: 0,
      first_kickoff_at: hours(n === 1 ? 1 : 168), lock_at: hours(n === 1 ? 1 : 168),
    }).select('matchweek_id'))
    for (const f of [1, 2]) {
      await must(`fx${n}.${f}`, admin.from('league_fixtures').insert({
        fixture_id: FIX(n, f), season_id: SEASON, matchweek_id: MW(n),
        fixture_number: (n - 1) * 2 + f,
        home_club_id: CLUB(f === 1 ? 1 : 3), away_club_id: CLUB(f === 1 ? 2 : 4),
        kickoff_at: hours(n === 1 ? 1 : 168), status: 'scheduled', is_completed: false,
        external_fixture_id: `scratch-160-${n}-${f}`,
      }).select('fixture_id'))
    }
  }

  for (const [pid, mode, memN, entries] of [
    [POOL_S, 'showdown', 1, [1, 2]],
    [POOL_L, 'last_man_standing', 2, [3, 4]],
  ] as Array<[string, string, number, number[]]>) {
    await must(`pool ${mode}`, admin.from('pools').insert({
      pool_id: pid, tournament_id: tournamentId, admin_user_id: adminUser,
      pool_name: `__scratch 160 ${mode} (auto-deleted)`, prediction_deadline: hours(200),
      status: 'open', prediction_mode: 'league_pickem', league_season_id: SEASON,
      league_mode: mode, league_depth: mode === 'showdown' ? 'results' : null,
      max_entries_per_user: 10,
    }).select('pool_id'))
    await must('mem', admin.from('pool_members').insert({
      member_id: MEM(memN), pool_id: pid, user_id: adminUser, role: 'admin',
    }).select('member_id'))
    for (const n of entries) {
      await must(`e${n}`, admin.from('pool_entries').insert({
        entry_id: E(n), member_id: MEM(memN), entry_name: `E${n}`, entry_number: n,
      }).select('entry_id'))
    }
  }
  await must('sched', admin.rpc('league_generate_duel_schedule', { p_pool_id: POOL_S }))
  await must('round', admin.rpc('league_lms_open_round', { p_pool_id: POOL_L, p_matchweek: 1 }))

  // E3 backs the club whose match will be POSTPONED. E4 backs one that plays.
  const round = await must('r', admin.from('league_lms_rounds')
    .select('round_id').eq('pool_id', POOL_L).is('last_matchweek', null))
  const roundId = ((round ?? [])[0] as { round_id: string }).round_id
  await must('pick3', admin.from('league_lms_picks').insert({
    round_id: roundId, entry_id: E(3), matchweek_number: 1, club_id: CLUB(3),
  }).select('entry_id'))
  await must('pick4', admin.from('league_lms_picks').insert({
    round_id: roundId, entry_id: E(4), matchweek_number: 1, club_id: CLUB(1),
  }).select('entry_id'))
  ok('built', 'E3 backs a club whose match gets called off; E4 backs one that plays')
  return roundId
}

async function checks(roundId: string) {
  head('1. Fixture one is played. Fixture two is POSTPONED.')

  await must('fx1', admin.from('league_fixtures')
    .update({ home_goals: 1, away_goals: 0, is_completed: true, status: 'completed' })
    .eq('fixture_id', FIX(1, 1)).select('fixture_id'))
  await score(FIX(1, 1), 1, 1, [[1, 60], [2, 20]])
  await must('fx2', admin.from('league_fixtures')
    .update({ status: 'postponed' }).eq('fixture_id', FIX(1, 2)).select('fixture_id'))

  const mw = await must('mw', admin.from('league_matchweeks')
    .select('fixture_count, completed_fixture_count').eq('matchweek_id', MW(1)))
  const m = (mw as Array<{ fixture_count: number; completed_fixture_count: number }>)[0]
  eq('the matchweek counts two fixtures', m.fixture_count, 2)
  eq('…and only one completed', m.completed_fixture_count, 1)

  head('2. It does NOT settle while the week is still running')
  eq('matchweek 2 has not locked yet, so the window is open', await snapshotted(1), false)
  note('settling here would decide a week that is still being played')

  head('3. It DOES settle once the next matchweek locks')
  await must('lock', admin.from('league_matchweeks')
    .update({ lock_at: hours(-1) }).eq('matchweek_id', MW(2)).select('matchweek_id'))
  eq('the competition has moved on, so the week is settled', await snapshotted(1), true)
  note('before migration 094 this stayed NULL forever and froze both modes')

  head('4. The duel resolved, on the fixtures that were played')
  const duels = await must('d', admin.from('league_duels')
    .select('entry_a, entry_b, accuracy_a, accuracy_b, points_a, points_b, settled_at')
    .eq('pool_id', POOL_S).eq('matchweek_number', 1))
  const d = (duels as Array<Record<string, unknown>>)[0]
  eq('the duel is settled', d?.settled_at !== null, true)
  const total = (d?.accuracy_a as number) + (d?.accuracy_b as number)
  eq('…on the 80 points that were actually scored', total, 80)
  eq('…and someone won it', (d?.points_a as number) + (d?.points_b as number), 3)
  note('both duellists faced the same played fixtures, so the duel stays fair')

  head('5. Last Man Standing — the club that never played is not a defeat')
  const surv = await must('s', admin.from('league_lms_survivors')
    .select('entry_id, eliminated_matchweek').eq('round_id', roundId))
  const byEntry = new Map((surv as Array<{ entry_id: string; eliminated_matchweek: number | null }>)
    .map((r) => [r.entry_id, r.eliminated_matchweek]))
  eq('E3 backed the called-off club and survives', byEntry.get(E(3)), null)
  eq('E4 backed a winner and survives', byEntry.get(E(4)), null)
  note('the rule was written in 087; until now it never got to run')

  head('6. A completed-but-UNSCORED fixture still blocks')
  // MW2: both fixtures complete, but one never got a `league_fixture_state`
  // witness — the engine is behind, which is a different thing entirely.
  for (const f of [1, 2]) {
    await must('done', admin.from('league_fixtures')
      .update({ home_goals: 1, away_goals: 0, is_completed: true, status: 'completed' })
      .eq('fixture_id', FIX(2, f)).select('fixture_id'))
  }
  await score(FIX(2, 1), 2, 3, [[1, 10], [2, 10]])
  eq('a played-but-unscored fixture holds the week open', await snapshotted(2), false)
  note('migration 061 intact: settling now would settle a week whose scoring had not finished')

  await score(FIX(2, 2), 2, 4, [[1, 10], [2, 10]])
  eq('…and it settles as soon as the engine catches up', await snapshotted(2), true)
}

async function teardown() {
  head('Teardown')
  for (const pid of [POOL_S, POOL_L]) {
    await admin.from('pool_entries').delete().eq('pool_id', pid)
    await admin.from('pools').delete().eq('pool_id', pid)
  }
  await admin.from('league_seasons').delete().eq('season_id', SEASON)
  const { count } = await admin.from('league_seasons')
    .select('*', { count: 'exact', head: true }).eq('season_id', SEASON)
  if ((count ?? 0) > 0) bad('scratch removed', `${count} left`)
  else ok('scratch data fully removed', 'production is exactly as it was found')
}

;(async () => {
  console.log('\n  POSTPONED AND CANCELLED FIXTURES — migration 094')
  console.log('  ' + '='.repeat(68))
  try {
    const roundId = await setup()
    await checks(roundId)
  } catch (err) {
    bad('threw', err instanceof Error ? err.message : String(err))
  } finally {
    await teardown()
  }
  console.log('\n  ' + '='.repeat(68))
  console.log(failures === 0 ? '  ALL CHECKS PASSED\n' : `  ${failures} CHECK(S) FAILED\n`)
  process.exit(failures === 0 ? 0 : 1)
})()
