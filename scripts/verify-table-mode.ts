// =============================================================
// verify-table-mode — twenty clubs, one decision, arithmetic that holds
// =============================================================
// Migrations 077-082. Table mode is a STANDALONE MODE (plan §0.2, overturning
// Decision 9), aimed at people new to football: one ordering before the season,
// then a live comparison against the real table all the way to May.
//
// This builds a scratch season of EIGHT clubs — enough that the top four and
// the bottom three do not overlap, small enough that every number below can be
// checked by hand — and asserts the scores rather than describing them.
//
//   actual finishing order: club 1, 2, 3, 4, 5, 6, 7, 8
//
//   A  perfect                 800 positional + 500 champ + 400 top4
//                              + 250 perfect + 300 releg   = 2250
//   B  top two swapped         760 positional +   0 champ + 400 top4
//                              + 250 perfect + 300 releg   = 1710
//   C  perfect, headline_only    0 positional + 500 champ + 400 top4
//                              + 250 perfect + 300 releg   = 1450
//   D  never predicted                                     =    0
//
// B is the interesting one: swapping first and second costs the champion bonus
// and 40 positional points, but keeps the whole top-four set — which is the
// point of scoring that band as a SET rather than positionally.
//
// Also asserted, and each of these is a way the mode could quietly be wrong:
//
//   · the deadline is enforced in the DATABASE, silently, as every other
//     prediction lock in this codebase is
//   · a reorder round-trips (the DEFERRABLE unique constraint doing its job)
//   · mode and deadline are immutable once a pool exists
//   · a Table pool cannot carry a depth, and a Pick'em pool must
//   · the season-end snapshot refuses to be taken early, and refuses to be
//     retaken — and once taken, a feed correction NO LONGER MOVES A PAID SCORE
//   · the load-bearing constraint holds: `pool_entries` is never written
//
//   npx tsx scripts/verify-table-mode.ts
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
import { saveTablePrediction, readTablePrediction, readTableBreakdown } from '../lib/league/table'

const admin = createAdminClient()

const S = 'dd082000-0000-4000-8000-'
const SEASON = `${S}000000000001`
const POOL_F = `${S}000000000002` // full_table, open
const POOL_H = `${S}000000000003` // headline_only, open
const POOL_L = `${S}000000000004` // full_table, already locked
const MEM = (n: number) => `${S}00000000001${n}`
const MW1 = `${S}000000000020`
const FIX = `${S}000000000021`
const CLUB = (n: number) => `${S}00000000003${n}`
const E = (n: number) => `${S}00000000004${n}`

const CLUBS = [1, 2, 3, 4, 5, 6, 7, 8]
const ORDER_PERFECT = CLUBS.map(CLUB)
const ORDER_SWAPPED = [CLUB(2), CLUB(1), ...CLUBS.slice(2).map(CLUB)]

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

async function score(poolId: string) {
  const { data, error } = await admin.rpc('league_score_table', { p_pool_id: poolId })
  if (error) throw new Error(`league_score_table: ${error.message}`)
  return data as { scored?: number; is_final?: boolean; profile?: string; skipped?: string }
}

async function bonusOf(n: number): Promise<number | undefined> {
  const rows = await must('totals', admin.from('league_entry_totals')
    .select('bonus_points, total_points').eq('entry_id', E(n)))
  return ((rows ?? [])[0] as { bonus_points: number } | undefined)?.bonus_points
}

async function setStandings(order: string[]) {
  await must('standings', admin.from('league_standings').upsert(
    order.map((clubId, i) => ({
      season_id: SEASON, club_id: clubId, rank: i + 1,
      points: 100 - i, goals_diff: 50 - i * 5, played: 1,
      won: 1, drawn: 0, lost: 0, goals_for: 3, goals_against: 0,
      fetched_at: new Date().toISOString(),
    })),
    { onConflict: 'season_id,club_id' },
  ).select('club_id'))
}

// ---------------------------------------------------------------- setup

async function setup() {
  head('Setup — eight clubs, three pools, four entries')

  const users = await must('admin user',
    admin.from('users').select('user_id').eq('username', 'IZZETmagic').limit(1))
  const adminUser = ((users ?? [])[0] as { user_id: string }).user_id
  const tp = await must('league tournament',
    admin.from('pools').select('tournament_id').not('league_season_id', 'is', null).limit(1))
  const tournamentId = ((tp ?? [])[0] as { tournament_id: string }).tournament_id

  const future = new Date(Date.now() + 90 * 864e5).toISOString()
  const past = new Date(Date.now() - 5 * 864e5).toISOString()

  await must('season', admin.from('league_seasons').insert({
    season_id: SEASON, competition_slug: 'scratch-082', competition_name: 'Scratch 082',
    season_label: '2026/2027', season_start_year: 2026, country_code: 'GB',
    club_count: 8, matchweek_count: 1, external_provider: 'scratch',
    external_league_id: -82, external_season: -2026, regular_season_phase: 'regular',
  }).select('season_id'))

  await must('clubs', admin.from('league_clubs').insert(
    CLUBS.map((n) => ({
      club_id: CLUB(n), season_id: SEASON, name: `Scratch FC ${n}`,
      short_name: `SFC${n}`, abbreviation: `S${n}`, external_club_id: -820 - n,
    })),
  ).select('club_id'))

  await must('matchweek', admin.from('league_matchweeks').insert({
    matchweek_id: MW1, season_id: SEASON, matchweek_number: 1, label: 'MW1',
    provider_round: 'r1', fixture_count: 1, completed_fixture_count: 0, lock_at: future,
  }).select('matchweek_id'))

  // One fixture, deliberately INCOMPLETE — the snapshot must refuse while it is.
  await must('fixture', admin.from('league_fixtures').insert({
    fixture_id: FIX, season_id: SEASON, matchweek_id: MW1, fixture_number: 1,
    home_club_id: CLUB(1), away_club_id: CLUB(2), kickoff_at: future,
    status: 'scheduled', is_completed: false, external_fixture_id: 'scratch-082-1',
  }).select('fixture_id'))

  const pools: Array<[string, string, string, number]> = [
    [POOL_F, 'full_table', future, 1],
    [POOL_H, 'headline_only', future, 2],
    [POOL_L, 'full_table', past, 3],
  ]
  for (const [pid, profile, lockAt, memN] of pools) {
    await must(`pool ${profile}`, admin.from('pools').insert({
      pool_id: pid, tournament_id: tournamentId, admin_user_id: adminUser,
      pool_name: `__scratch 082 ${profile} (auto-deleted)`, prediction_deadline: future,
      status: 'open', prediction_mode: 'league_pickem', league_season_id: SEASON,
      league_mode: 'table', league_depth: null,
      league_table_profile: profile, league_table_lock_at: lockAt,
      max_entries_per_user: 10,
    }).select('pool_id'))
    await must(`membership ${profile}`, admin.from('pool_members').insert({
      member_id: MEM(memN), pool_id: pid, user_id: adminUser, role: 'admin',
    }).select('member_id'))
  }

  // ⚠ The band sizes are DERIVED from the competition since migration 089, and
  // this scratch season carries no feed descriptions — so it would fall back to
  // proportional (2 and 1 for eight clubs) and the hand-checked totals below
  // would all change. Pinned explicitly so section 3 tests the ARITHMETIC;
  // section 6 tests the derivation itself.
  for (const pid of [POOL_F, POOL_H, POOL_L]) {
    await must('bands', admin.from('league_pool_settings').insert({
      pool_id: pid, table_top_n: 4, table_relegation_n: 3,
    }).select('pool_id'))
  }

  const entries: Array<[number, number, string]> = [
    [1, 1, 'A perfect'], [2, 1, 'B swapped'], [3, 1, 'D silent'],
    [4, 2, 'C headline'], [5, 3, 'E locked out'],
  ]
  for (const [n, memN, label] of entries) {
    await must(`entry ${label}`, admin.from('pool_entries').insert({
      entry_id: E(n), member_id: MEM(memN), entry_name: label, entry_number: n,
    }).select('entry_id'))
  }

  await setStandings(ORDER_PERFECT)
  ok('scratch season built', '8 clubs ranked 1..8, one incomplete fixture')
}

// ---------------------------------------------------------------- checks

async function schemaGuards() {
  head('1. The two levels cannot disagree, and neither can move')

  const { error: depthErr } = await admin.from('pools')
    .update({ league_depth: 'scores' }).eq('pool_id', POOL_F)
  if (depthErr) ok('a Table pool is refused a depth', depthErr.message.slice(0, 58))
  else bad('a Table pool is refused a depth', 'the CHECK allowed it')

  const { error: modeErr } = await admin.from('pools')
    .update({ league_mode: 'pickem' }).eq('pool_id', POOL_F)
  if (modeErr) ok('league_mode is immutable', modeErr.message.slice(0, 58))
  else bad('league_mode is immutable', 'the mode changed')

  const { error: lockErr } = await admin.from('pools')
    .update({ league_table_lock_at: new Date().toISOString() }).eq('pool_id', POOL_F)
  if (lockErr) ok('the deadline is immutable', lockErr.message.slice(0, 58))
  else bad('the deadline is immutable', 'the deadline moved')

  // A club from another competition is a bug, not a lost race — it RAISES.
  const other = await must('a foreign club',
    admin.from('league_clubs').select('club_id').neq('season_id', SEASON).limit(1))
  const foreignClub = ((other ?? [])[0] as { club_id: string } | undefined)?.club_id
  if (foreignClub) {
    const { error } = await admin.from('league_table_predictions')
      .insert({ entry_id: E(1), club_id: foreignClub, predicted_position: 1 })
    if (error) ok('a club from another season is refused', 'raises, not silently dropped')
    else bad('a club from another season is refused', 'it was accepted')
  } else {
    note('no foreign club available to test with')
  }
}

async function writing() {
  head('2. Writing, reordering, and the deadline')

  const a = await saveTablePrediction(admin, E(1), ORDER_PERFECT)
  eq('A saves twenty… eight clubs', a.stored, 8)
  eq('A was not locked out', a.locked, false)

  const b = await saveTablePrediction(admin, E(2), ORDER_SWAPPED)
  eq('B saves a different ordering', b.stored, 8)

  await saveTablePrediction(admin, E(4), ORDER_PERFECT)

  // The reorder that the DEFERRABLE unique constraint exists for: two clubs
  // genuinely share a position mid-statement.
  const reordered = [...ORDER_PERFECT]
  ;[reordered[0], reordered[7]] = [reordered[7], reordered[0]]
  const r = await saveTablePrediction(admin, E(1), reordered)
  eq('a reorder that swaps two positions is accepted', r.locked, false)
  const back = await readTablePrediction(admin, E(1))
  eq('…and round-trips in the new order', back.order[0], CLUB(8))

  // Put A back to perfect for the scoring section.
  await saveTablePrediction(admin, E(1), ORDER_PERFECT)
  const restored = await readTablePrediction(admin, E(1))
  eq('…and back again', restored.order[0], CLUB(1))

  // The locked pool. Silent at the database, reported by the write path.
  const locked = await saveTablePrediction(admin, E(5), ORDER_PERFECT)
  eq('a write after the deadline is refused', locked.locked, true)
  eq('…and stores nothing at all', locked.stored, 0)
  note('refused silently by the trigger; the write path reads back and reports it')
}

async function scoring() {
  head('3. The arithmetic')

  const f = await score(POOL_F)
  eq('the full_table pool scored every entry', f.scored, 3)
  eq('…and says it is provisional', f.is_final, false)

  const h = await score(POOL_H)
  eq('the headline_only pool scored its entry', h.scored, 1)

  eq('A  perfect ordering',        await bonusOf(1), 2250)
  eq('B  top two swapped',         await bonusOf(2), 1710)
  eq('C  perfect, headline_only',  await bonusOf(4), 1450)
  eq('D  never predicted',         await bonusOf(3), 0)

  note('B keeps the top-four SET (400 + 250) while losing the champion bonus')

  // The breakdown must agree with the engine, because it is the same formula.
  const { rows, error } = await readTableBreakdown(admin, E(2))
  if (error) { bad('the breakdown reads', error); return }
  eq('the breakdown covers every club', rows.length, 8)
  const positional = rows.reduce((s, r) => s + (r.points ?? 0), 0)
  eq('…and its positional total matches the engine', positional, 760)
  eq('…club named, not blank', typeof rows[0]?.club_name === 'string' && rows[0].club_name.length > 0, true)
  const swapped = rows.find((r) => r.club_id === CLUB(2))
  eq('…B’s predicted champion is shown one place out', swapped?.delta, 1)

  // Decision 11: a member with no prediction is still ON the leaderboard.
  const rowsD = await must('D row', admin.from('league_entry_totals')
    .select('entry_id').eq('entry_id', E(3)))
  eq('a non-predictor still has a totals row', (rowsD ?? []).length, 1)
}

async function snapshot() {
  head('4. The season-end snapshot — what a paid score is allowed to depend on')

  const early = await must('snapshot early',
    admin.rpc('league_snapshot_final_standings', { p_season_id: SEASON }))
  eq('refused while a fixture is unplayed', (early as { skipped?: string }).skipped, 'season not complete')

  await must('complete the fixture', admin.from('league_fixtures')
    .update({ is_completed: true, status: 'completed', home_goals: 2, away_goals: 0 })
    .eq('fixture_id', FIX).select('fixture_id'))

  const taken = await must('snapshot',
    admin.rpc('league_snapshot_final_standings', { p_season_id: SEASON }))
  eq('taken once the season is over', (taken as { written?: number }).written, 8)

  const again = await must('snapshot again',
    admin.rpc('league_snapshot_final_standings', { p_season_id: SEASON }))
  eq('never retaken', (again as { skipped?: string }).skipped, 'already final')

  const f = await score(POOL_F)
  eq('scoring now reports itself final', f.is_final, true)
  eq('…and A is unchanged by the freeze', await bonusOf(1), 2250)

  // THE POINT OF THE WHOLE MECHANISM. A correction arrives after payout.
  await setStandings([...ORDER_PERFECT].reverse())
  await score(POOL_F)
  eq('a feed correction after the snapshot does NOT move a paid score', await bonusOf(1), 2250)
  note('without the snapshot this would now read 0 — the table it was scored against would be gone')
}

async function loadBearing() {
  head('5. The load-bearing constraint')

  const entries = await must('entries', admin.from('pool_entries')
    .select('entry_id, has_submitted_predictions, point_adjustment, predictions_submitted_at')
    .in('entry_id', [E(1), E(2), E(3), E(4), E(5)]))
  const rows = (entries ?? []) as Array<{
    has_submitted_predictions: boolean; point_adjustment: number | null
    predictions_submitted_at: string | null
  }>
  eq('has_submitted_predictions untouched', rows.every((r) => r.has_submitted_predictions === false), true)
  eq('point_adjustment untouched', rows.every((r) => (r.point_adjustment ?? 0) === 0), true)
  eq('predictions_submitted_at untouched', rows.every((r) => r.predictions_submitted_at === null), true)
  note('these two columns are the only doors from a league entry into World Cup scoring')
}

async function bandsAreDerived() {
  head('6. The bands FREEZE with the table')

  // This season was frozen in section 4, and nothing was described before that —
  // so the snapshot carries no band labels and there is nothing to read.
  const before = await must('bands', admin.rpc('league_default_bands', { p_season_id: SEASON }))
  const b = before as { top_n: number; relegation_n: number; source: string }
  eq('with nothing frozen to read, it extrapolates', b.source, 'proportional')
  eq('…top band for eight clubs', b.top_n, 2)
  eq('…relegation band for eight clubs', b.relegation_n, 1)
  note("20% and 15% are the Premier League's own ratios — the only defensible extrapolation")

  // THE POINT. A re-tagged table arrives after the season is over: an extra
  // Champions League place on coefficient, a cup winner shifting the Europa
  // places. Ryan named this before the code did — the bands move for reasons
  // that have nothing to do with the season being predicted.
  await must('retag', admin.from('league_standings')
    .update({ description: 'Promotion - Champions League (League phase)' })
    .eq('season_id', SEASON).in('rank', [1, 2, 3, 4, 5]).select('club_id'))
  await must('retag', admin.from('league_standings')
    .update({ description: 'Relegation - Whatever' })
    .eq('season_id', SEASON).in('rank', [7, 8]).select('club_id'))

  const after = await must('bands', admin.rpc('league_default_bands', { p_season_id: SEASON }))
  const a = after as { top_n: number; relegation_n: number; source: string }
  eq('a re-tagged table does NOT move the frozen top band', a.top_n, b.top_n)
  eq('…nor the relegation band', a.relegation_n, b.relegation_n)
  eq('…and it still reports where it read them', a.source, 'proportional')
  note('before migration 091 this read the LIVE labels and would now say top 5')

  // And an explicit pool setting still beats everything.
  const scored = await must('score', admin.rpc('league_score_table', { p_pool_id: POOL_F }))
  const bands = (scored as { bands?: { top_n: number } }).bands
  eq('an explicit pool setting still overrides the derived band', await bonusOf(1), 2250)
  eq('…and the engine reports which bands it read', typeof bands?.top_n, 'number')
  note('deriving the bands is what scripts/verify-league-bands.ts covers, across eight competitions')
}

async function teardown() {
  head('Teardown')
  for (const pid of [POOL_F, POOL_H, POOL_L]) {
    const mem = await admin.from('pool_members').select('member_id').eq('pool_id', pid)
    for (const m of (mem.data ?? []) as Array<{ member_id: string }>) {
      await admin.from('pool_entries').delete().eq('member_id', m.member_id)
    }
    await admin.from('pools').delete().eq('pool_id', pid)
  }
  await admin.from('league_standings_final').delete().eq('season_id', SEASON)
  await admin.from('league_seasons').delete().eq('season_id', SEASON)

  const left: string[] = []
  for (const [t, col, val] of [
    ['pools', 'pool_id', POOL_F], ['pools', 'pool_id', POOL_H], ['pools', 'pool_id', POOL_L],
    ['league_seasons', 'season_id', SEASON], ['league_fixtures', 'season_id', SEASON],
    ['league_standings', 'season_id', SEASON], ['league_standings_final', 'season_id', SEASON],
  ] as const) {
    const { count } = await admin.from(t).select('*', { count: 'exact', head: true }).eq(col, val)
    if ((count ?? 0) > 0) left.push(`${t}=${count}`)
  }
  if (left.length) bad('scratch data fully removed', left.join(', '))
  else ok('scratch data fully removed', 'production is exactly as it was found')
}

;(async () => {
  console.log('\n  TABLE MODE — migrations 077-082')
  console.log('  ' + '='.repeat(68))
  try {
    await setup()
    await schemaGuards()
    await writing()
    await scoring()
    await snapshot()
    await loadBearing()
    await bandsAreDerived()
  } catch (err) {
    bad('threw', err instanceof Error ? err.message : String(err))
  } finally {
    await teardown()
  }
  console.log('\n  ' + '='.repeat(68))
  console.log(failures === 0 ? '  ALL CHECKS PASSED\n' : `  ${failures} CHECK(S) FAILED\n`)
  process.exit(failures === 0 ? 0 : 1)
})()
