// =============================================================
// verify-abandoned-fixture-retraction — a called-off match gives its points back
// =============================================================
// Rayo Vallecano v Athletic Club, 10 Oct 2026: abandoned at 0–0 after objects
// were thrown onto the pitch. While it was live the engine scored it
// provisionally (063). When it was called off the engine refused to score it
// again, and left everything it had already written exactly where it was.
//
// Migration 187: a fixture's score rows always describe what it is NOW.
//
//   live / completed, both goals       -> scored
//   live / completed, a NULL goal      -> nothing (a feed blip must not flicker)
//   scheduled / postponed / cancelled  -> retracted
//
// Eight properties, each of which could fail on its own:
//
//   1. a live 0–0 scores an exact pick, provisionally
//   2. called off WITH its goals kept: rows gone, totals and ranks recomputed,
//      the witness cleared, the cache told
//   3. bonus_points and point_adjustment survive the retraction
//   4. a SETTLED Showdown duel is not reopened
//   5. resumed: it scores again
//   6. called off with its goals BLANKED: the trigger still reaches the engine
//      (126 used to drop exactly this row)
//   7. a live fixture whose goals blip to NULL keeps its rows
//   8. every other fixture's rows are untouched throughout
//
//   npx tsx scripts/verify-abandoned-fixture-retraction.ts
//
// Exits 1 on any failure. Scratch season, torn down in a `finally`.
//
// ⚠ BOTH SCRATCH POOLS ARE CREATED ARCHIVED. Every notice producer skips an
// archived pool (league_snapshot_matchweek_ranks, league_queue_matchweek_notices,
// sendLeagueNotice), and the scorer does not look at the flag. So nothing in
// this script can put a notice in front of the real member the pools borrow.
// The only outbox rows it makes are `fixture_scored`, which is cache-only.
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

const S = 'dd187000-0000-4000-8000-'
const hex = (n: number) => n.toString(16).padStart(12, '0')
const SEASON = `${S}${hex(1)}`
const POOL_P = `${S}${hex(2)}`   // pick'em, Scores depth
const POOL_D = `${S}${hex(3)}`   // showdown, Results depth
const MEM = (n: number) => `${S}${hex(10 + n)}`
const MW = (n: number) => `${S}${hex(20 + n)}`
const CLUB = (n: number) => `${S}${hex(100 + n)}`
const FX_A = `${S}${hex(201)}`   // the match that gets called off
const FX_B = `${S}${hex(202)}`   // the match that is played
const FX_C = `${S}${hex(211)}`   // next week, never touched
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

type Totals = {
  match_points: number; total_points: number; exact_count: number; correct_count: number
  final_rank: number | null; bonus_points: number; point_adjustment: number; duel_points: number
}
async function totals(entry: number): Promise<Totals> {
  const r = await must('totals', admin.from('league_entry_totals')
    .select('match_points, total_points, exact_count, correct_count, final_rank, bonus_points, point_adjustment, duel_points')
    .eq('entry_id', E(entry)))
  return (r as Totals[])[0]
}

/** entry number -> [score_type, total_points] for one fixture. */
async function rows(fixture: string) {
  const r = await must('rows', admin.from('league_match_scores')
    .select('entry_id, score_type, total_points').eq('fixture_id', fixture))
  const out = new Map<number, [string, number]>()
  for (const x of r as Array<{ entry_id: string; score_type: string; total_points: number }>) {
    out.set(parseInt(x.entry_id.slice(-12), 16) - 300, [x.score_type, x.total_points])
  }
  return out
}

async function witness(fixture: string) {
  const r = await must('witness', admin.from('league_fixture_state')
    .select('status, home_goals, away_goals, is_completed').eq('fixture_id', fixture))
  return (r as Array<{ status: string; home_goals: number; away_goals: number; is_completed: boolean }>)[0] ?? null
}

async function setFixture(fixture: string, patch: Record<string, unknown>) {
  const r = await must('fixture', admin.from('league_fixtures')
    .update(patch).eq('fixture_id', fixture).select('fixture_id'))
  if ((r as unknown[]).length !== 1) throw new Error(`fixture ${fixture}: update matched nothing`)
}

async function setup() {
  head('Setup — one matchweek of two fixtures, a pick\'em pool and a Showdown pool')

  const users = await must('u', admin.from('users').select('user_id').eq('username', 'IZZETmagic').limit(1))
  const adminUser = ((users ?? [])[0] as { user_id: string }).user_id
  const tp = await must('t', admin.from('pools').select('tournament_id').not('league_season_id', 'is', null).limit(1))
  const tournamentId = ((tp ?? [])[0] as { tournament_id: string }).tournament_id

  await must('season', admin.from('league_seasons').insert({
    season_id: SEASON, competition_slug: 'scratch-187', competition_name: 'Scratch Abandoned',
    season_label: '2026/2027', season_start_year: 2026, country_code: 'GB',
    club_count: 4, matchweek_count: 2, external_provider: 'scratch',
    external_league_id: -187, external_season: -2026, regular_season_phase: 'regular',
  }).select('season_id'))
  await must('clubs', admin.from('league_clubs').insert([1, 2, 3, 4].map((n) => ({
    club_id: CLUB(n), season_id: SEASON, name: `C${n}`, short_name: `C${n}`,
    abbreviation: `C${n}`, external_club_id: -(1870 + n),
  }))).select('club_id'))

  // MW1 locks in an hour, MW2 in a week, so MW1 is the open matchweek and takes
  // picks (enforce_league_prediction_before_lock DROPS a pick on any other week,
  // silently). MW2 never locks during the run, so MW1 can never settle and no
  // snapshot can fire.
  for (const n of [1, 2]) {
    await must(`mw${n}`, admin.from('league_matchweeks').insert({
      matchweek_id: MW(n), season_id: SEASON, matchweek_number: n, label: `MW${n}`,
      provider_round: `r${n}`, fixture_count: n === 1 ? 2 : 1, completed_fixture_count: 0,
      first_kickoff_at: hours(n === 1 ? 1 : 168), lock_at: hours(n === 1 ? 1 : 168),
    }).select('matchweek_id'))
  }
  for (const [fx, mw, num, home, away] of [
    [FX_A, 1, 1, 1, 2], [FX_B, 1, 2, 3, 4], [FX_C, 2, 3, 1, 3],
  ] as Array<[string, number, number, number, number]>) {
    await must(`fx${num}`, admin.from('league_fixtures').insert({
      fixture_id: fx, season_id: SEASON, matchweek_id: MW(mw), fixture_number: num,
      home_club_id: CLUB(home), away_club_id: CLUB(away),
      kickoff_at: hours(mw === 1 ? 1 : 168), status: 'scheduled', is_completed: false,
      external_fixture_id: `scratch-187-${num}`,
    }).select('fixture_id'))
  }

  for (const [pid, mode, depth, memN, entries] of [
    [POOL_P, 'pickem', null, 1, [1, 2]],
    [POOL_D, 'showdown', 'results', 2, [3, 4]],
  ] as Array<[string, string, string | null, number, number[]]>) {
    await must(`pool ${mode}`, admin.from('pools').insert({
      pool_id: pid, tournament_id: tournamentId, admin_user_id: adminUser,
      pool_name: `__scratch 187 ${mode} (auto-deleted)`, prediction_deadline: hours(200),
      status: 'open', prediction_mode: 'league_pickem', league_season_id: SEASON,
      league_mode: mode, league_depth: depth, max_entries_per_user: 10,
      archived_at: new Date().toISOString(),
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
  await must('sched', admin.rpc('league_generate_duel_schedule', { p_pool_id: POOL_D }))

  // E1 picks 0–0 on the match that gets called off; E2 picks the other one
  // exactly. Before the call-off E1 leads; after it, E2 must.
  const picks = await must('picks', admin.from('league_predictions').insert([
    { entry_id: E(1), fixture_id: FX_A, predicted_home_score: 0, predicted_away_score: 0 },
    { entry_id: E(1), fixture_id: FX_B, predicted_home_score: 1, predicted_away_score: 0 },
    { entry_id: E(2), fixture_id: FX_A, predicted_home_score: 1, predicted_away_score: 0 },
    { entry_id: E(2), fixture_id: FX_B, predicted_home_score: 2, predicted_away_score: 1 },
    { entry_id: E(3), fixture_id: FX_A, predicted_outcome: 'draw' },
    { entry_id: E(4), fixture_id: FX_A, predicted_outcome: 'home' },
  ]).select('prediction_id'))
  if ((picks as unknown[]).length !== 6) {
    throw new Error(`only ${(picks as unknown[]).length} of 6 picks landed — MW1 is not the open matchweek`)
  }

  // An admin adjustment and a bonus on E1, so step 3 can prove they survive.
  await must('adj', admin.from('league_entry_totals').insert({
    entry_id: E(1), pool_id: POOL_P, bonus_points: 5, point_adjustment: 7, total_points: 12,
  }).select('entry_id'))

  ok('built', 'E1 picked 0–0 on the match that gets called off; both pools are archived')
}

async function checks() {
  head('1. Both matches kick off. A stands at 0–0, B at 2–1.')
  await setFixture(FX_A, { status: 'live', home_goals: 0, away_goals: 0 })
  await setFixture(FX_B, { status: 'live', home_goals: 2, away_goals: 1 })

  const a1 = await rows(FX_A)
  eq('E1\'s 0–0 is exact, provisionally', a1.get(1)?.[0], 'exact')
  eq('…worth 100', a1.get(1)?.[1], 100)
  eq('the Showdown draw tap is right', a1.get(3)?.[1], 100)
  const e1 = await totals(1), e2 = await totals(2)
  eq('E1 = 100 (A) + 75 (B) + 5 bonus + 7 adjustment', e1.total_points, 187)
  eq('E2 = 0 (A) + 100 (B)', e2.total_points, 100)
  eq('E1 leads', e1.final_rank, 1)
  eq('A\'s witness says live', (await witness(FX_A))?.status, 'live')
  const bBefore = JSON.stringify([...(await rows(FX_B)).entries()].sort())

  head('2. The Showdown week settles on the provisional score')
  await must('duels', admin.rpc('league_score_duels', { p_pool_id: POOL_D, p_matchweek_number: 1 }))
  const d1 = await must('d', admin.from('league_duels')
    .select('duel_id, points_a, points_b, settled_at').eq('pool_id', POOL_D).eq('matchweek_number', 1))
  const duel = (d1 as Array<{ duel_id: string; points_a: number; points_b: number | null; settled_at: string | null }>)[0]
  if (!duel) bad('a matchweek-1 duel exists', 'league_generate_duel_schedule made none')
  else eq('the duel is settled', duel.settled_at !== null, true)
  const e3duel = (await totals(3)).duel_points
  eq('E3 won it', e3duel, 500)
  note('deliberately settled BEFORE the call-off, to prove 187 does not reopen it')

  // Mark what scoring already queued, so the retraction has to queue its own.
  await must('drain', admin.from('league_score_events')
    .update({ processed_at: new Date().toISOString() })
    .in('pool_id', [POOL_P, POOL_D]).is('processed_at', null).select('event_id'))
  const t0 = new Date().toISOString()

  head('3. A is called off at 0–0 — goals KEPT, status cancelled')
  await setFixture(FX_A, { status: 'cancelled', status_detail: 'abandoned' })

  eq('A has no score rows in either pool', (await rows(FX_A)).size, 0)
  const e1b = await totals(1), e2b = await totals(2)
  eq('E1 falls to 75 (B) + 5 + 7', e1b.total_points, 87)
  eq('…match points 75', e1b.match_points, 75)
  eq('…exact count back to 0', e1b.exact_count, 0)
  eq('…correct count 1', e1b.correct_count, 1)
  eq('the bonus survives', e1b.bonus_points, 5)
  eq('the admin adjustment survives', e1b.point_adjustment, 7)
  eq('E2 is untouched at 100', e2b.total_points, 100)
  eq('E2 now leads — the ranks were recomputed', e2b.final_rank, 1)
  eq('E1 is second', e1b.final_rank, 2)
  eq('A\'s witness is cleared', await witness(FX_A), null)
  eq('B\'s witness is not', (await witness(FX_B))?.status, 'live')

  const ev = await must('ev', admin.from('league_score_events')
    .select('pool_id, kind').eq('fixture_id', FX_A).gte('created_at', t0))
  const evPools = new Set((ev as Array<{ pool_id: string; kind: string }>)
    .filter((x) => x.kind === 'fixture_scored').map((x) => x.pool_id))
  eq('the cache is told, in the pick\'em pool', evPools.has(POOL_P), true)
  eq('…and in the Showdown pool', evPools.has(POOL_D), true)

  head('4. The settled duel is NOT reopened')
  const d2 = await must('d', admin.from('league_duels')
    .select('points_a, points_b, settled_at').eq('duel_id', duel?.duel_id ?? ''))
  const after = (d2 as Array<{ points_a: number; points_b: number | null; settled_at: string | null }>)[0]
  eq('its points are unchanged', `${after?.points_a}/${after?.points_b}`, `${duel?.points_a}/${duel?.points_b}`)
  eq('…and it was not re-settled', after?.settled_at, duel?.settled_at)
  eq('E3 keeps the duel win', (await totals(3)).duel_points, e3duel)
  eq('…but loses the accuracy points', (await totals(3)).match_points, 0)
  note('as 094: a duel is a result; the total moves, the duel does not')

  head('   Idempotent: asking again changes nothing')
  const again = await must('again', admin.rpc('league_score_fixture', { p_fixture_id: FX_A })) as
    { ok: boolean; retracted: number }
  eq('a second retraction removes nothing', again.retracted, 0)
  eq('…and E1 is still 87', (await totals(1)).total_points, 87)

  head('5. A is resumed — it scores again')
  await setFixture(FX_A, { status: 'live', status_detail: null })
  eq('E1\'s exact pick is back', (await rows(FX_A)).get(1)?.[1], 100)
  eq('E1 back to 187', (await totals(1)).total_points, 187)
  eq('E1 leads again', (await totals(1)).final_rank, 1)
  eq('the witness is back', (await witness(FX_A))?.status, 'live')

  head('6. A is called off again — this time with its goals BLANKED')
  await setFixture(FX_A, { status: 'postponed', home_goals: null, away_goals: null })
  eq('A has no score rows', (await rows(FX_A)).size, 0)
  eq('E1 falls to 87 again', (await totals(1)).total_points, 87)
  eq('the witness is cleared', await witness(FX_A), null)
  note('before 187 the trigger dropped this row — the engine was never asked')

  head('7. B\'s goals blip to NULL mid-match — nothing is taken back')
  await setFixture(FX_B, { home_goals: null, away_goals: null })
  eq('B keeps both score rows', (await rows(FX_B)).size, 2)
  eq('E2 keeps 100', (await totals(2)).total_points, 100)
  eq('B\'s witness still says 2–1', `${(await witness(FX_B))?.home_goals}-${(await witness(FX_B))?.away_goals}`, '2-1')
  await setFixture(FX_B, { home_goals: 2, away_goals: 1 })
  note('a provider hiccup must not make the leaderboard flicker')

  head('8. A is finally played to full time, 1–1')
  await setFixture(FX_A, { status: 'live', home_goals: 1, away_goals: 1 })
  await setFixture(FX_A, { status: 'completed', is_completed: true })
  const aEnd = await rows(FX_A)
  eq('E1\'s 0–0 earns the draw-and-margin rung', aEnd.get(1)?.[0], 'winner_gd')
  eq('E2\'s 1–0 misses', aEnd.get(2)?.[0], 'miss')
  eq('E1 = 75 + 75 + 12', (await totals(1)).total_points, 162)
  eq('the witness says completed', (await witness(FX_A))?.is_completed, true)

  head('   Every other fixture was untouched throughout')
  eq('B\'s rows are exactly as they were after kickoff',
    JSON.stringify([...(await rows(FX_B)).entries()].sort()), bBefore)
  eq('C (next week) has no rows', (await rows(FX_C)).size, 0)
}

async function teardown() {
  head('Teardown')
  for (const pid of [POOL_P, POOL_D]) {
    await admin.from('pool_entries').delete().eq('pool_id', pid)
    await admin.from('pools').delete().eq('pool_id', pid)
  }
  await admin.from('league_seasons').delete().eq('season_id', SEASON)
  const { count } = await admin.from('league_seasons')
    .select('*', { count: 'exact', head: true }).eq('season_id', SEASON)
  const { count: pools } = await admin.from('pools')
    .select('*', { count: 'exact', head: true }).in('pool_id', [POOL_P, POOL_D])
  if ((count ?? 0) + (pools ?? 0) > 0) bad('scratch removed', `${count} season, ${pools} pools left`)
  else ok('scratch data fully removed', 'production is exactly as it was found')
}

;(async () => {
  console.log('\n  A CALLED-OFF MATCH GIVES ITS POINTS BACK — migration 187')
  console.log('  ' + '='.repeat(68))
  try {
    await setup()
    await checks()
  } catch (err) {
    bad('threw', err instanceof Error ? err.message : String(err))
  } finally {
    await teardown()
  }
  console.log('\n  ' + '='.repeat(68))
  console.log(failures === 0 ? '  ALL CHECKS PASSED\n' : `  ${failures} CHECK(S) FAILED\n`)
  process.exit(failures === 0 ? 0 : 1)
})()
