// =============================================================
// verify-last-man-standing — five ways a week can end, and what happens next
// =============================================================
// L-K. Pick one club a matchweek to WIN. Wrong and you are out. When one player
// is left the round ends and a new one opens with everybody back in — Decision 9,
// because a single elimination is over in five or six matchweeks of thirty-eight
// and a pool dead in September fails the purpose clause.
//
// The mode has exactly five ways a matchweek can end for you, and every one of
// them is a different line of code. All five are played out here, in one
// matchweek, against the same fixtures:
//
//   pick a club that WINS      → survive
//   pick a club that LOSES     → out
//   pick a club that DRAWS     → out        (a draw is not survival)
//   pick nothing               → out        (no auto-pick: it would show you a
//                                            decision you never made)
//   pick a club that DIDN'T PLAY → survive   (you were not beaten)
//
// Then the round machinery: the club-once-per-round rule, the matchweek-level
// lock, a round closing on one survivor, and the next one opening with the
// eliminated back in.
//
//   npx tsx scripts/verify-last-man-standing.ts
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

const S = 'dd110000-0000-4000-8000-'
const SEASON = `${S}000000000001`
const POOL = `${S}000000000002`
const POOL_PICK = `${S}000000000003`
const MEM = (n: number) => `${S}00000000001${n}`
const MW = (n: number) => `${S}00000000002${n}`
const CLUB = (n: number) => `${S}00000000003${n}`
const FIX = (mw: number, n: number) => `${S}0000000004${mw}${n}`
const E = (n: number) => `${S}00000000005${n}`

let failures = 0
const ok = (m: string, x = '') => console.log(`    ✓ ${m}${x ? `  — ${x}` : ''}`)
const bad = (m: string, x = '') => { failures++; console.log(`    ✗ ${m}${x ? `  — ${x}` : ''}`) }
const note = (m: string) => console.log(`    · ${m}`)
const head = (m: string) => console.log(`\n  ${m}\n  ${'-'.repeat(68)}`)
const eq = (m: string, a: unknown, e: unknown) =>
  a === e ? ok(m, String(a)) : bad(m, `expected ${String(e)}, got ${String(a)}`)

async function must<T>(label: string, p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

const hours = (h: number) => new Date(Date.now() + h * 3600e3).toISOString()

async function openRound(mw: number) {
  const { data, error } = await admin.rpc('league_lms_open_round', { p_pool_id: POOL, p_matchweek: mw })
  if (error) throw new Error(`open round: ${error.message}`)
  return data as { round?: number; entries?: number; skipped?: string }
}
async function settle(mw: number) {
  const { data, error } = await admin.rpc('league_lms_settle', { p_pool_id: POOL, p_matchweek: mw })
  if (error) throw new Error(`settle: ${error.message}`)
  return data as { round?: number; eliminated?: number; standing?: number; round_closed?: boolean; winners?: number }
}
async function currentRound(): Promise<{ round_id: string; round_number: number } | undefined> {
  const rows = await must('open round', admin.from('league_lms_rounds')
    .select('round_id, round_number').eq('pool_id', POOL).is('last_matchweek', null))
  return (rows ?? [])[0] as { round_id: string; round_number: number } | undefined
}
async function pick(roundId: string, entry: number, mw: number, club: number) {
  return admin.from('league_lms_picks')
    .insert({ round_id: roundId, entry_id: E(entry), matchweek_number: mw, club_id: CLUB(club) })
    .select('entry_id')
}
async function standing(roundId: string) {
  const rows = await must('survivors', admin.from('league_lms_survivors')
    .select('entry_id, eliminated_matchweek, is_winner').eq('round_id', roundId))
  return (rows ?? []) as Array<{ entry_id: string; eliminated_matchweek: number | null; is_winner: boolean }>
}

async function setup() {
  head('Setup — six clubs, three fixtures a matchweek, five players')

  const users = await must('admin user',
    admin.from('users').select('user_id').eq('username', 'IZZETmagic').limit(1))
  const adminUser = ((users ?? [])[0] as { user_id: string }).user_id
  const tp = await must('league tournament',
    admin.from('pools').select('tournament_id').not('league_season_id', 'is', null).limit(1))
  const tournamentId = ((tp ?? [])[0] as { tournament_id: string }).tournament_id

  await must('season', admin.from('league_seasons').insert({
    season_id: SEASON, competition_slug: 'scratch-110', competition_name: 'Scratch 110',
    season_label: '2026/2027', season_start_year: 2026, country_code: 'GB',
    club_count: 6, matchweek_count: 4, external_provider: 'scratch',
    external_league_id: -110, external_season: -2026, regular_season_phase: 'regular',
  }).select('season_id'))

  await must('clubs', admin.from('league_clubs').insert(
    [1, 2, 3, 4, 5, 6].map((n) => ({
      club_id: CLUB(n), season_id: SEASON, name: `Scratch FC ${n}`,
      short_name: `SFC${n}`, abbreviation: `S${n}`, external_club_id: -1100 - n,
    })),
  ).select('club_id'))

  for (let n = 1; n <= 4; n++) {
    await must(`mw${n}`, admin.from('league_matchweeks').insert({
      matchweek_id: MW(n), season_id: SEASON, matchweek_number: n, label: `MW${n}`,
      provider_round: `r${n}`, fixture_count: 3, completed_fixture_count: 0,
      first_kickoff_at: hours(24 * n), lock_at: hours(24 * n),
    }).select('matchweek_id'))
    const pairs: Array<[number, number]> = [[1, 2], [3, 4], [5, 6]]
    for (let i = 0; i < pairs.length; i++) {
      await must(`fx${n}.${i}`, admin.from('league_fixtures').insert({
        fixture_id: FIX(n, i), season_id: SEASON, matchweek_id: MW(n), fixture_number: (n - 1) * 3 + i + 1,
        home_club_id: CLUB(pairs[i][0]), away_club_id: CLUB(pairs[i][1]),
        kickoff_at: hours(24 * n), status: 'scheduled', is_completed: false,
        external_fixture_id: `scratch-110-${n}-${i}`,
      }).select('fixture_id'))
    }
  }

  for (const [pid, mode, memN, entries] of [
    [POOL, 'last_man_standing', 1, [1, 2, 3, 4, 5]],
    [POOL_PICK, 'pickem', 2, [6, 7]],
  ] as Array<[string, string, number, number[]]>) {
    await must(`pool ${mode}`, admin.from('pools').insert({
      pool_id: pid, tournament_id: tournamentId, admin_user_id: adminUser,
      pool_name: `__scratch 110 ${mode} (auto-deleted)`, prediction_deadline: hours(24 * 4),
      status: 'open', prediction_mode: 'league_pickem', league_season_id: SEASON,
      league_mode: mode, league_depth: mode === 'pickem' ? 'results' : null,
      max_entries_per_user: 20,
    }).select('pool_id'))
    await must(`membership ${memN}`, admin.from('pool_members').insert({
      member_id: MEM(memN), pool_id: pid, user_id: adminUser, role: 'admin',
    }).select('member_id'))
    for (const n of entries) {
      await must(`entry ${n}`, admin.from('pool_entries').insert({
        entry_id: E(n), member_id: MEM(memN), entry_name: `E${n}`, entry_number: n,
      }).select('entry_id'))
    }
  }
  ok('scratch season built', '4 matchweeks, 6 clubs, 5 players + a control pool')
}

async function theSchema() {
  head('1. A Last Man Standing pool has no depth, and that is enforced')

  const { error } = await admin.from('pools').update({ league_depth: 'results' }).eq('pool_id', POOL)
  if (error) ok('a depth is refused', error.message.slice(0, 56))
  else bad('a depth is refused', 'the CHECK allowed it')

  head('2. Opening a round')

  const r = await openRound(1)
  eq('round one opens', r.round, 1)
  eq('…with every entry in it', r.entries, 5)

  const again = await openRound(1)
  eq('a second round cannot open while one is running', again.skipped, 'a round is already open')
  note('one open round at a time, or an entry would hold two lives and the club rule would mean nothing')
}

async function theFiveWays() {
  head('3. Five ways a matchweek ends')

  const round = await currentRound()
  if (!round) { bad('an open round exists'); return }

  // E1 picks a winner, E2 a loser, E3 a draw, E4 nothing, E5 a club whose
  // fixture never completes.
  for (const [entry, club] of [[1, 1], [2, 2], [3, 3], [5, 5]] as const) {
    const { error } = await pick(round.round_id, entry, 1, club)
    if (error) bad(`E${entry} picks club ${club}`, error.message)
  }
  const picked = await must('picks', admin.from('league_lms_picks')
    .select('entry_id').eq('round_id', round.round_id).eq('matchweek_number', 1))
  eq('four picks in, one player silent', (picked ?? []).length, 4)

  // THE rule: a club may be used once per round.
  const { error: dupErr } = await pick(round.round_id, 1, 1, 1)
  if (dupErr) ok('the same club twice in one round is refused', 'lms_club_once_per_round')
  else bad('the same club twice in one round is refused', 'it was accepted')

  // Results: club 1 wins, club 3 draws, club 5's fixture never completes.
  await must('fx1 result', admin.from('league_fixtures')
    .update({ home_goals: 1, away_goals: 0, is_completed: true, status: 'completed' })
    .eq('fixture_id', FIX(1, 0)).select('fixture_id'))
  await must('fx2 result', admin.from('league_fixtures')
    .update({ home_goals: 1, away_goals: 1, is_completed: true, status: 'completed' })
    .eq('fixture_id', FIX(1, 1)).select('fixture_id'))
  // FIX(1,2) — clubs 5 and 6 — is deliberately left unplayed.

  const res = await settle(1)
  eq('three players go out', res.eliminated, 3)
  eq('two are still standing', res.standing, 2)
  eq('…so the round keeps running', res.round_closed, false)

  const s = await standing(round.round_id)
  const outAt = new Map(s.map((r) => [r.entry_id, r.eliminated_matchweek]))
  eq('picked a winner → survives', outAt.get(E(1)), null)
  eq('picked a loser → out', outAt.get(E(2)), 1)
  eq('picked a DRAW → out', outAt.get(E(3)), 1)
  note('a draw is not survival — that is what the name of the mode means')
  eq('picked nothing → out', outAt.get(E(4)), 1)
  note('no auto-pick: choosing for somebody would show them a decision they never made')
  eq('picked a club that never played → survives', outAt.get(E(5)), null)
  note('you were not beaten. Gameable in theory, but it burns one of your twenty clubs')

  const marks = await must('pick results', admin.from('league_lms_picks')
    .select('entry_id, result').eq('round_id', round.round_id).eq('matchweek_number', 1))
  const byEntry = new Map(((marks ?? []) as Array<{ entry_id: string; result: string }>)
    .map((r) => [r.entry_id, r.result]))
  eq('the pick itself records what happened', byEntry.get(E(2)), 'eliminated')
}

async function theLock() {
  head('4. The lock is at MATCHWEEK level')

  const round = await currentRound()
  if (!round) { bad('an open round exists'); return }

  // Matchweek 1 has locked. A pick for it must be refused even though matchweek
  // 1's later fixtures have not all kicked off — that gap is exactly what a
  // per-fixture lock would leave open for a Sunday picker.
  await must('lock mw1', admin.from('league_matchweeks')
    .update({ lock_at: hours(-1) }).eq('matchweek_id', MW(1)).select('matchweek_id'))

  const { error } = await pick(round.round_id, 1, 1, 4)
  const landed = await must('after', admin.from('league_lms_picks')
    .select('club_id').eq('round_id', round.round_id).eq('entry_id', E(1)).eq('matchweek_number', 1))
  eq('a pick for a locked matchweek is refused', (landed ?? []).length, 1)
  eq('…and the original stands', (landed as Array<{ club_id: string }>)[0]?.club_id, CLUB(1))
  if (error) note('refused loudly'); else note('refused silently by the trigger, as every prediction lock here is')

  // Somebody already out cannot keep playing.
  const { error: outErr } = await pick(round.round_id, 2, 2, 6)
  const outPicks = await must('out picks', admin.from('league_lms_picks')
    .select('entry_id').eq('round_id', round.round_id).eq('entry_id', E(2)).eq('matchweek_number', 2))
  eq('an eliminated player cannot pick again', (outPicks ?? []).length, 0)
  if (outErr) note(`refused: ${outErr.message.slice(0, 40)}`)
}

async function roundEnds() {
  head('5. The round ends, and the next one opens with everybody back in')

  const round = await currentRound()
  if (!round) { bad('an open round exists'); return }

  // E1 survives matchweek 2, E5 does not.
  const r1 = await pick(round.round_id, 1, 2, 3)
  if (r1.error) bad('E1 picks club 3 for MW2', r1.error.message)
  const r5 = await pick(round.round_id, 5, 2, 6)
  if (r5.error) bad('E5 picks club 6 for MW2', r5.error.message)

  await must('fx result', admin.from('league_fixtures')
    .update({ home_goals: 2, away_goals: 0, is_completed: true, status: 'completed' })
    .eq('fixture_id', FIX(2, 1)).select('fixture_id'))   // club 3 beats club 4
  await must('fx result', admin.from('league_fixtures')
    .update({ home_goals: 3, away_goals: 0, is_completed: true, status: 'completed' })
    .eq('fixture_id', FIX(2, 2)).select('fixture_id'))   // club 5 beats club 6

  const res = await settle(2)
  eq('one player left', res.standing, 1)
  eq('…so the round closes', res.round_closed, true)
  eq('…with one winner', res.winners, 1)

  const totals = await must('totals', admin.from('league_entry_totals')
    .select('entry_id, rounds_won, final_rank').eq('pool_id', POOL))
  const t = new Map(((totals ?? []) as Array<{ entry_id: string; rounds_won: number; final_rank: number | null }>)
    .map((r) => [r.entry_id, r]))
  eq('a row for every player', (totals ?? []).length, 5)
  eq('the survivor has a round', t.get(E(1))?.rounds_won, 1)
  eq('everyone else has none', t.get(E(3))?.rounds_won, 0)
  eq('rounds won leads the table', t.get(E(1))?.final_rank, 1)

  const next = await currentRound()
  eq('a new round is already open', next?.round_number, 2)
  const back = await standing(next!.round_id)
  eq('…with everybody back in, including the first one out', back.length, 5)
  eq('…and nobody carrying an elimination', back.every((r) => r.eliminated_matchweek === null), true)
  note('this is the whole design — a pool dead in September fails the purpose clause')

  // The club rule resets with the round.
  const reuse = await pick(next!.round_id, 1, 3, 1)
  eq('a club used last round can be used again this one', reuse.error === null, true)
}

async function beforeTheRound() {
  head('7. A matchweek from BEFORE the round started is not this round\u2019s business')

  // Found in production 2026-08-24: catching up matchweek 1 fired the settle
  // trigger for a round that began at matchweek 2. Nobody had a pick for a round
  // that did not exist yet, so "no pick is elimination" took EVERYONE out at
  // once — and the everybody-out rule then made all of them joint winners of a
  // round they never played.
  const round = await currentRound()
  if (!round) { bad('an open round exists'); return }

  const before = await standing(round.round_id)
  const res = await settle(1)   // round 2 began at matchweek 3
  eq('settling an earlier matchweek is refused', (res as { skipped?: string }).skipped,
     'matchweek precedes the round')

  const after = await standing(round.round_id)
  eq('nobody was eliminated by it', after.filter((r) => r.eliminated_matchweek !== null).length, 0)
  eq('…and the round is still open', after.length, before.length)
  note('the guard is the round\u2019s own first_matchweek — a round cannot judge football it predates')
}

async function control() {
  head('6. The control — a Pick’em pool is untouched')

  for (const [entry, pts] of [[E(6), 40], [E(7), 80]] as const) {
    await must(`control total ${entry}`, admin.from('league_entry_totals').upsert({
      entry_id: entry, pool_id: POOL_PICK, total_points: pts, match_points: pts,
    }, { onConflict: 'entry_id' }).select('entry_id'))
  }
  await must('rank control', admin.rpc('league_finalize_ranks', { p_pool_id: POOL_PICK }))
  const rows = await must('control', admin.from('league_entry_totals')
    .select('entry_id, rounds_won, duel_points, final_rank').eq('pool_id', POOL_PICK))
  const m = new Map(((rows ?? []) as Array<{ entry_id: string; rounds_won: number; duel_points: number; final_rank: number | null }>)
    .map((r) => [r.entry_id, r]))
  eq('rounds won is zero', [...m.values()].every((r) => r.rounds_won === 0), true)
  eq('duel points are zero', [...m.values()].every((r) => r.duel_points === 0), true)
  eq('the higher pick score still ranks first', m.get(E(7))?.final_rank, 1)
  note('two leading keys added this session, and the settled cascade still decides Pick’em')
}

async function teardown() {
  head('Teardown')
  for (const pid of [POOL, POOL_PICK]) {
    await admin.from('pool_entries').delete().eq('pool_id', pid)
    await admin.from('pools').delete().eq('pool_id', pid)
  }
  await admin.from('league_seasons').delete().eq('season_id', SEASON)

  const left: string[] = []
  for (const [t, col, val] of [
    ['pools', 'pool_id', POOL], ['pools', 'pool_id', POOL_PICK],
    ['league_seasons', 'season_id', SEASON], ['league_lms_rounds', 'pool_id', POOL],
    ['league_fixtures', 'season_id', SEASON],
  ] as const) {
    const { count } = await admin.from(t).select('*', { count: 'exact', head: true }).eq(col, val)
    if ((count ?? 0) > 0) left.push(`${t}=${count}`)
  }
  if (left.length) bad('scratch data fully removed', left.join(', '))
  else ok('scratch data fully removed', 'production is exactly as it was found')
}

;(async () => {
  console.log('\n  LAST MAN STANDING — migrations 086-087')
  console.log('  ' + '='.repeat(68))
  try {
    await setup()
    await theSchema()
    await theFiveWays()
    await theLock()
    await roundEnds()
    await beforeTheRound()
    await control()
  } catch (err) {
    bad('threw', err instanceof Error ? err.message : String(err))
  } finally {
    await teardown()
  }
  console.log('\n  ' + '='.repeat(68))
  console.log(failures === 0 ? '  ALL CHECKS PASSED\n' : `  ${failures} CHECK(S) FAILED\n`)
  process.exit(failures === 0 ? 0 : 1)
})()
