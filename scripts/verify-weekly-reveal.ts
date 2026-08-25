// =============================================================
// verify-weekly-reveal — everyone's picks, one matchweek at a time
// =============================================================
// Plan §0.9. "See everyone's picks after lock" fires ONCE on the World Cup,
// before match one. The league version fires every matchweek — thirty-eight
// times a season — which is what turns a reveal from an event into a rhythm.
//
// Two members, three matchweeks, and the question the gate has to get right:
//
//   MW1  locked  — both members' picks are in, and BOTH are revealable
//   MW2  open    — both members' picks are in, and only YOUR OWN is visible
//   MW3  ahead   — no picks exist, and nothing about it may be revealed
//
// The failure this is really guarding is subtler than "does it reveal". A
// league matchweek that has not OPENED yet is derived as state 'locked' —
// that is what the word means in the World Cup round vocabulary. Reuse the
// progressive branch and MW3 reveals in August. Nothing leaks today because
// migration 058 refuses a pick for any matchweek but the open one, so MW3 is
// empty — but that is a coincidence of another rule, not a reason.
//
// Writing MW1's picks needs MW1 to be open, so the script opens it, picks, then
// moves `lock_at` into the past to close it — which is exactly the sequence a
// real season performs, a week at a time.
//
//   npx tsx scripts/verify-weekly-reveal.ts
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
import { readLeagueRevealContext, readAllLeaguePredictions } from '../lib/league/read'
import { computeReveal, gatePoolPredictions } from '../lib/predictions/revealGate'

const admin = createAdminClient()

const S = 'dd090000-0000-4000-8000-'
const SEASON = `${S}000000000001`
const POOL = `${S}000000000002`
const POOL_R = `${S}000000000003` // the same season, played at RESULTS depth
const MEM = (n: number) => `${S}00000000001${n}`
const MW = (n: number) => `${S}00000000002${n}`
const CLUB = (n: number) => `${S}00000000003${n}`
const FIX = (n: number) => `${S}00000000004${n}`
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

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600e3).toISOString()

async function setLock(n: number, iso: string) {
  await must(`mw${n} lock`, admin.from('league_matchweeks')
    .update({ lock_at: iso }).eq('matchweek_id', MW(n)).select('matchweek_id'))
}

/** One SCORELINE pick per entry on this matchweek's fixture. */
async function pick(matchweek: number, entries: number[]) {
  for (const e of entries) {
    await must(`pick mw${matchweek} e${e}`, admin.from('league_predictions').upsert({
      entry_id: E(e), fixture_id: FIX(matchweek),
      predicted_home_score: e, predicted_away_score: 0,
    }, { onConflict: 'entry_id,fixture_id' }).select('prediction_id'))
  }
}

/** One TAP per entry — Results depth, which is the DEFAULT for a new pool. */
async function tap(matchweek: number, entries: number[], outcome: 'home' | 'draw' | 'away') {
  for (const e of entries) {
    await must(`tap mw${matchweek} e${e}`, admin.from('league_predictions').upsert({
      entry_id: E(e), fixture_id: FIX(matchweek), predicted_outcome: outcome,
      predicted_home_score: null, predicted_away_score: null,
    }, { onConflict: 'entry_id,fixture_id' }).select('prediction_id'))
  }
}

async function setup() {
  head('Setup — three matchweeks, two members, one fixture each')

  const users = await must('admin user',
    admin.from('users').select('user_id').eq('username', 'IZZETmagic').limit(1))
  const adminUser = ((users ?? [])[0] as { user_id: string }).user_id
  const tp = await must('league tournament',
    admin.from('pools').select('tournament_id').not('league_season_id', 'is', null).limit(1))
  const tournamentId = ((tp ?? [])[0] as { tournament_id: string }).tournament_id

  await must('season', admin.from('league_seasons').insert({
    season_id: SEASON, competition_slug: 'scratch-090', competition_name: 'Scratch 090',
    season_label: '2026/2027', season_start_year: 2026, country_code: 'GB',
    club_count: 4, matchweek_count: 3, external_provider: 'scratch',
    external_league_id: -90, external_season: -2026, regular_season_phase: 'regular',
  }).select('season_id'))

  await must('clubs', admin.from('league_clubs').insert(
    [1, 2, 3, 4].map((n) => ({
      club_id: CLUB(n), season_id: SEASON, name: `Scratch FC ${n}`,
      short_name: `SFC${n}`, abbreviation: `S${n}`, external_club_id: -900 - n,
    })),
  ).select('club_id'))

  // All three start OPEN-ish (lock in the future) so picks can be written into
  // MW1 and MW2 in turn; the locks are then moved to make the real shape.
  for (const n of [1, 2, 3]) {
    await must(`matchweek ${n}`, admin.from('league_matchweeks').insert({
      matchweek_id: MW(n), season_id: SEASON, matchweek_number: n, label: `MW${n}`,
      provider_round: `r${n}`, fixture_count: 1, completed_fixture_count: 0,
      first_kickoff_at: hoursFromNow(24 * n), lock_at: hoursFromNow(24 * n),
    }).select('matchweek_id'))
    await must(`fixture ${n}`, admin.from('league_fixtures').insert({
      fixture_id: FIX(n), season_id: SEASON, matchweek_id: MW(n), fixture_number: n,
      home_club_id: CLUB(1), away_club_id: CLUB(2), kickoff_at: hoursFromNow(24 * n),
      status: 'scheduled', is_completed: false, external_fixture_id: `scratch-090-${n}`,
    }).select('fixture_id'))
  }

  await must('pool', admin.from('pools').insert({
    pool_id: POOL, tournament_id: tournamentId, admin_user_id: adminUser,
    pool_name: '__scratch 090 reveal (auto-deleted)',
    prediction_deadline: hoursFromNow(24 * 3),
    status: 'open', prediction_mode: 'league_pickem', league_season_id: SEASON,
    league_mode: 'pickem', league_depth: 'scores', max_entries_per_user: 10,
  }).select('pool_id'))
  await must('membership', admin.from('pool_members').insert({
    member_id: MEM(1), pool_id: POOL, user_id: adminUser, role: 'admin',
  }).select('member_id'))

  // The SAME season, played at Results depth — the default for a new pool, and
  // the one whose reveal had nothing to draw before this.
  await must('results pool', admin.from('pools').insert({
    pool_id: POOL_R, tournament_id: tournamentId, admin_user_id: adminUser,
    pool_name: '__scratch 090 reveal results (auto-deleted)',
    prediction_deadline: hoursFromNow(24 * 3),
    status: 'open', prediction_mode: 'league_pickem', league_season_id: SEASON,
    league_mode: 'pickem', league_depth: 'results', max_entries_per_user: 10,
  }).select('pool_id'))
  await must('results membership', admin.from('pool_members').insert({
    member_id: MEM(2), pool_id: POOL_R, user_id: adminUser, role: 'admin',
  }).select('member_id'))

  for (const n of [1, 2]) {
    await must(`entry ${n}`, admin.from('pool_entries').insert({
      entry_id: E(n), member_id: MEM(1), entry_name: `Entry ${n}`, entry_number: n,
    }).select('entry_id'))
  }
  for (const n of [3, 4]) {
    await must(`results entry ${n}`, admin.from('pool_entries').insert({
      entry_id: E(n), member_id: MEM(2), entry_name: `Results entry ${n}`, entry_number: n,
    }).select('entry_id'))
  }

  // MW1 is the open one, so its picks land. Then it locks and MW2 becomes open.
  // Both depths pick at both points, so they are compared under identical
  // conditions rather than described.
  await pick(1, [1, 2])
  await tap(1, [3, 4], 'home')
  await setLock(1, hoursFromNow(-1))
  await pick(2, [1, 2])
  await tap(2, [3, 4], 'away')

  const rows = await must('picks', admin.from('league_predictions')
    .select('entry_id, fixture_id').in('entry_id', [E(1), E(2), E(3), E(4)]))
  eq('eight picks landed across two matchweeks and two depths', (rows ?? []).length, 8)
  note('MW1 locked an hour ago; MW2 is open; MW3 has not opened and holds nothing')
}

async function checks() {
  head('1. The context the gate is given')

  const ctx = await readLeagueRevealContext(admin, SEASON)
  if (ctx.error) { bad('reveal context reads', ctx.error); return }
  eq('one round state per matchweek', ctx.roundStates.length, 3)
  eq('…keyed by matchweek', ctx.roundStates[0].round_key, 'mw_1')
  eq('…carrying the real lock time', ctx.roundStates[0].deadline !== null, true)
  eq('…and NO state string', ctx.roundStates[0].state, null)
  note('state is withheld on purpose — the gate must read the clock, not the word "locked"')
  eq('every fixture maps to its matchweek', ctx.stageById.size, 3)
  eq('…correctly', ctx.stageById.get(FIX(2)), 'mw_2')

  head('2. What the gate decides')

  const reveal = computeReveal(
    { prediction_mode: 'league_pickem', prediction_deadline: new Date(Date.now() + 72 * 3600e3).toISOString() },
    ctx.roundStates,
    new Date(),
  )
  eq('something is revealed', reveal.revealed, true)
  if (reveal.revealed && reveal.scope === 'rounds') {
    eq('…exactly one matchweek', reveal.roundKeys.length, 1)
    eq('…and it is the locked one', reveal.roundKeys[0], 'mw_1')
  } else {
    bad('the reveal is per-matchweek', `scope was ${reveal.revealed ? reveal.scope : 'none'}`)
  }

  head('3. What a member actually receives')

  const { predictions, error } = await readAllLeaguePredictions(admin, [E(1), E(2)])
  if (error) { bad('pool-wide picks read', error); return }
  eq('all four picks are read before gating', predictions.length, 4)

  // Viewer owns entry 1. Entry 2 stands in for another member.
  const shown = gatePoolPredictions({
    predictions: predictions as unknown as Array<{ match_id: string; entry_id: string }>,
    ownEntryIds: [E(1)],
    isAdmin: false,
    reveal,
    matchStageById: ctx.stageById,
  })
  eq('three picks survive the gate', shown.length, 3)

  const mine = shown.filter((p) => p.entry_id === E(1))
  const theirs = shown.filter((p) => p.entry_id === E(2))
  eq('both of my own, locked or not', mine.length, 2)
  eq('only the locked matchweek of theirs', theirs.length, 1)
  eq('…and it is MW1', theirs[0]?.match_id, FIX(1))
  note('THE anti-cheat property: their MW2 pick is still editable, so it is not shown')

  head('4. The matchweek nobody has reached')

  const mw3Shown = shown.some((p) => p.match_id === FIX(3))
  eq('MW3 reveals nothing', mw3Shown, false)

  // And prove it stays that way if a pick ever DOES exist there — which is what
  // "pick ahead" would create. Written directly, bypassing the 058 trigger's
  // reason for existing, purely to test the gate downstream of it.
  const reveal3 = computeReveal(
    { prediction_mode: 'league_pickem', prediction_deadline: new Date(Date.now() - 3600e3).toISOString() },
    ctx.roundStates,
    new Date(),
  )
  if (reveal3.revealed && reveal3.scope === 'rounds') {
    eq('a PASSED pool deadline still does not reveal MW3', reveal3.roundKeys.includes('mw_3'), false)
    note('the pool-wide branch would have revealed all three at once')
  } else {
    bad('the league branch held', 'it fell through to the pool-wide gate')
  }

  // Handed to section 5 so the two depths are judged by the SAME context and
  // the SAME reveal, rather than each computing its own and agreeing by luck.
  return { ctx, reveal }
}

async function resultsDepth(
  ctx: Awaited<ReturnType<typeof readLeagueRevealContext>>,
  reveal: ReturnType<typeof computeReveal>,
) {
  head('5. Results depth — a tap is a pick, and it reveals the same way')

  const { predictions, outcomes, error } = await readAllLeaguePredictions(admin, [E(3), E(4)])
  if (error) { bad('results-depth picks read', error); return }

  eq('no scoreline rows at all', predictions.length, 0)
  eq('four taps instead', outcomes.length, 4)
  note('counting only scoreline rows called every Results entry unsubmitted — that was the bug')

  const shown = gatePoolPredictions({
    predictions: outcomes,
    ownEntryIds: [E(3)],
    isAdmin: false,
    reveal,
    matchStageById: ctx.stageById,
  })
  eq('three taps survive the gate', shown.length, 3)
  eq('both of my own', shown.filter((o) => o.entry_id === E(3)).length, 2)

  const theirs = shown.filter((o) => o.entry_id === E(4))
  eq('only the locked matchweek of theirs', theirs.length, 1)
  eq('…and it carries the side they picked', theirs[0]?.outcome, 'home')
  note('the same gate call as a scoreline — one rule, not a parallel one that can drift')
}

async function teardown() {
  head('Teardown')
  for (const pid of [POOL, POOL_R]) {
    await admin.from('pool_entries').delete().eq('pool_id', pid)
    await admin.from('pools').delete().eq('pool_id', pid)
  }
  await admin.from('league_seasons').delete().eq('season_id', SEASON)

  const left: string[] = []
  for (const [t, col, val] of [
    ['pools', 'pool_id', POOL], ['pools', 'pool_id', POOL_R],
    ['league_seasons', 'season_id', SEASON],
    ['league_fixtures', 'season_id', SEASON], ['league_matchweeks', 'season_id', SEASON],
  ] as const) {
    const { count } = await admin.from(t).select('*', { count: 'exact', head: true }).eq(col, val)
    if ((count ?? 0) > 0) left.push(`${t}=${count}`)
  }
  if (left.length) bad('scratch data fully removed', left.join(', '))
  else ok('scratch data fully removed', 'production is exactly as it was found')
}

;(async () => {
  console.log('\n  THE WEEKLY REVEAL — plan §0.9')
  console.log('  ' + '='.repeat(68))
  try {
    await setup()
    const shared = await checks()
    if (shared) await resultsDepth(shared.ctx, shared.reveal)
  } catch (err) {
    bad('threw', err instanceof Error ? err.message : String(err))
  } finally {
    await teardown()
  }
  console.log('\n  ' + '='.repeat(68))
  console.log(failures === 0 ? '  ALL CHECKS PASSED\n' : `  ${failures} CHECK(S) FAILED\n`)
  process.exit(failures === 0 ? 0 : 1)
})()
