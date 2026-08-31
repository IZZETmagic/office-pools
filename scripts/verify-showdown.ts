// =============================================================
// verify-showdown — the fixture list is real, and the duels are fair
// =============================================================
// L-J. Showdown is a LAYER over the weekly accuracy number, and its pairing is a
// PUBLISHED ROUND-ROBIN rather than the concept note's random draw — because
// gate 5 says every element of uncertainty must be inherited from the sport, and
// who you happen to draw is our dice, not the football's.
//
// That substitution is only honest if the round-robin is actually a round-robin.
// A circle method that looks right and quietly repeats a pair while starving
// another is WORSE than the random draw it replaced: it claims fairness it does
// not deliver. So the first thing asserted here is the mathematical property
// itself, over a full cycle:
//
//   · every pair meets exactly once per cycle
//   · nobody is scheduled twice in one matchweek
//   · over multiple cycles no opponent count differs by more than one
//   · in an odd pool everybody gets the same number of byes
//
// Then the scoring: 3 / 1 / 0, the leading rank key, and — the one that would
// silently break another mode — that a Pick'em pool's cascade is UNCHANGED by
// the new key.
//
//   npx tsx scripts/verify-showdown.ts
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

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../lib/supabase/server'

const admin = createAdminClient()

// A scratch member, used ONLY by the seal check. Everything else in this file
// runs as service_role, which is exactly why the seal needs its own identity —
// see `theSeal()`.
const SEAL_EMAIL = 'scratch-116-seal@example.invalid'
const SEAL_PASSWORD = 'scratch-116-seal-pw-not-a-real-account'

const S = 'dd100000-0000-4000-8000-'
const SEASON = `${S}000000000001`
const POOL_EVEN = `${S}000000000002` // 6 entries
const POOL_ODD  = `${S}000000000003` // 5 entries -> byes
const POOL_PICK = `${S}000000000004` // control: pickem, cascade must not move
const POOL_LATE = `${S}000000000005` // created after matchweeks 1-4 have locked
const MEM = (n: number) => `${S}00000000001${n}`
const MW = (n: number) => `${S}0000000000${(20 + n).toString().padStart(2, '0')}`
const CLUB = (n: number) => `${S}00000000004${n}`
const FIX = (n: number) => `${S}0000000000${(50 + n).toString().padStart(2, '0')}`
const E = (n: number) => `${S}0000000000${(70 + n).toString().padStart(2, '0')}`

const WEEKS = 12
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

type Duel = {
  duel_id: string; matchweek_number: number
  entry_a: string; entry_b: string | null
  points_a: number | null; points_b: number | null
  accuracy_a: number | null; accuracy_b: number | null
  settled_at: string | null
}
const duelsOf = (poolId: string) =>
  must('duels', admin.from('league_duels')
    .select('duel_id, matchweek_number, entry_a, entry_b, points_a, points_b, accuracy_a, accuracy_b, settled_at')
    .eq('pool_id', poolId).order('matchweek_number')) as Promise<Duel[]>

async function generate(poolId: string) {
  const { data, error } = await admin.rpc('league_generate_duel_schedule', { p_pool_id: poolId })
  if (error) throw new Error(`generate: ${error.message}`)
  return data as { written?: number; rounds_per_cycle?: number; from_matchweek?: number; skipped?: string }
}

async function setup() {
  head('Setup — one season, three pools: six entries, five entries, and a control')

  const users = await must('admin user',
    admin.from('users').select('user_id').eq('username', 'IZZETmagic').limit(1))
  const adminUser = ((users ?? [])[0] as { user_id: string }).user_id
  const tp = await must('league tournament',
    admin.from('pools').select('tournament_id').not('league_season_id', 'is', null).limit(1))
  const tournamentId = ((tp ?? [])[0] as { tournament_id: string }).tournament_id
  const future = (h: number) => new Date(Date.now() + h * 3600e3).toISOString()

  await must('season', admin.from('league_seasons').insert({
    season_id: SEASON, competition_slug: 'scratch-100', competition_name: 'Scratch 100',
    season_label: '2026/2027', season_start_year: 2026, country_code: 'GB',
    club_count: 4, matchweek_count: WEEKS, external_provider: 'scratch',
    external_league_id: -100, external_season: -2026, regular_season_phase: 'regular',
  }).select('season_id'))

  await must('clubs', admin.from('league_clubs').insert(
    [1, 2, 3, 4].map((n) => ({
      club_id: CLUB(n), season_id: SEASON, name: `Scratch FC ${n}`,
      short_name: `SFC${n}`, abbreviation: `S${n}`, external_club_id: -1000 - n,
    })),
  ).select('club_id'))

  for (let n = 1; n <= WEEKS; n++) {
    await must(`mw${n}`, admin.from('league_matchweeks').insert({
      matchweek_id: MW(n), season_id: SEASON, matchweek_number: n, label: `MW${n}`,
      provider_round: `r${n}`, fixture_count: 1, completed_fixture_count: 0,
      first_kickoff_at: future(24 * n), lock_at: future(24 * n),
    }).select('matchweek_id'))
    await must(`fx${n}`, admin.from('league_fixtures').insert({
      fixture_id: FIX(n), season_id: SEASON, matchweek_id: MW(n), fixture_number: n,
      home_club_id: CLUB(1), away_club_id: CLUB(2), kickoff_at: future(24 * n),
      status: 'scheduled', is_completed: false, external_fixture_id: `scratch-100-${n}`,
    }).select('fixture_id'))
  }

  const pools: Array<[string, string, number, number[]]> = [
    [POOL_EVEN, 'showdown', 1, [1, 2, 3, 4, 5, 6]],
    [POOL_ODD, 'showdown', 2, [7, 8, 9, 10, 11]],
    [POOL_PICK, 'pickem', 3, [12, 13]],
  ]
  for (const [pid, mode, memN, entries] of pools) {
    await must(`pool ${mode}`, admin.from('pools').insert({
      pool_id: pid, tournament_id: tournamentId, admin_user_id: adminUser,
      pool_name: `__scratch 100 ${mode} ${memN} (auto-deleted)`,
      prediction_deadline: future(24 * WEEKS), status: 'open',
      prediction_mode: 'league_pickem', league_season_id: SEASON,
      league_mode: mode, league_depth: 'results', max_entries_per_user: 20,
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
  ok('scratch season built', `${WEEKS} matchweeks, 6 + 5 + 2 entries`)
}

// ---------------------------------------------------------------- the maths

async function roundRobin() {
  head('1. The fixture list is a genuine round-robin')

  const gen = await generate(POOL_EVEN)
  eq('a cycle is n-1 rounds for six entries', gen.rounds_per_cycle, 5)
  eq('three duels every matchweek, twelve matchweeks', gen.written, 36)

  const duels = await duelsOf(POOL_EVEN)

  // Nobody plays twice in a week — the partial unique indexes should make this
  // impossible, so a failure here means the generator is emitting a pair the
  // database then silently dropped via ON CONFLICT DO NOTHING.
  let doubleBooked = 0
  for (let mw = 1; mw <= WEEKS; mw++) {
    const inWeek = duels.filter((d) => d.matchweek_number === mw)
    const seen = new Set<string>()
    for (const d of inWeek) {
      for (const e of [d.entry_a, d.entry_b].filter(Boolean) as string[]) {
        if (seen.has(e)) doubleBooked++
        seen.add(e)
      }
    }
    if (inWeek.length !== 3) bad(`matchweek ${mw} has three duels`, String(inWeek.length))
  }
  eq('nobody is scheduled twice in a matchweek', doubleBooked, 0)

  // THE property: one full cycle covers all 15 pairs exactly once.
  const key = (a: string, b: string) => [a, b].sort().join('|')
  const cycle = duels.filter((d) => d.matchweek_number <= 5)
  const pairCounts = new Map<string, number>()
  for (const d of cycle) if (d.entry_b) pairCounts.set(key(d.entry_a, d.entry_b), (pairCounts.get(key(d.entry_a, d.entry_b)) ?? 0) + 1)
  eq('one cycle covers all fifteen pairs', pairCounts.size, 15)
  eq('…each exactly once', [...pairCounts.values()].every((v) => v === 1), true)
  note('6 entries → 15 distinct pairs → 5 matchweeks × 3 duels. Nothing left over')

  // Across 12 matchweeks (2.4 cycles) opponent counts must stay within one.
  const opponents = new Map<string, Map<string, number>>()
  for (const d of duels) {
    if (!d.entry_b) continue
    for (const [x, y] of [[d.entry_a, d.entry_b], [d.entry_b, d.entry_a]] as const) {
      if (!opponents.has(x)) opponents.set(x, new Map())
      opponents.get(x)!.set(y, (opponents.get(x)!.get(y) ?? 0) + 1)
    }
  }
  let spread = 0
  for (const m of opponents.values()) {
    const counts = [...m.values()]
    spread = Math.max(spread, Math.max(...counts) - Math.min(...counts))
  }
  eq('across 12 matchweeks no opponent count differs by more than one', spread <= 1, true)
  note('this is the gate-5 substitution doing its job — a random draw cannot promise it')
}

async function byes() {
  head('2. An odd pool: byes, and they rotate')

  const gen = await generate(POOL_ODD)
  eq('five entries still gives a five-round cycle', gen.rounds_per_cycle, 5)

  const duels = await duelsOf(POOL_ODD)
  const cycle = duels.filter((d) => d.matchweek_number <= 5)
  const byeCount = new Map<string, number>()
  for (const d of cycle) if (!d.entry_b) byeCount.set(d.entry_a, (byeCount.get(d.entry_a) ?? 0) + 1)

  eq('five byes in a five-matchweek cycle', [...byeCount.values()].reduce((a, b) => a + b, 0), 5)
  eq('…one each, so nobody sits out twice while another never does', byeCount.size, 5)
  eq('…and every entry appears exactly once per matchweek', cycle.length, 15)
  note('padding entry rides the rotation, so the bye lands on a different person each week')
}

// ---------------------------------------------------------------- the duel

async function scoring() {
  head('3. Three for a win, one for a draw, none for a loss')

  const mw1 = (await duelsOf(POOL_EVEN)).filter((d) => d.matchweek_number === 1)
  eq('three duels to settle', mw1.length, 3)

  // Scores chosen AFTER reading the pairings, so the test never assumes who was
  // drawn against whom. Duel 1 narrow win, duel 2 landslide, duel 3 a draw.
  const plan: Array<[string, number]> = [
    [mw1[0].entry_a, 10], [mw1[0].entry_b!, 9],
    [mw1[1].entry_a, 200], [mw1[1].entry_b!, 100],
    [mw1[2].entry_a, 5], [mw1[2].entry_b!, 5],
  ]
  for (const [entry, pts] of plan) {
    await must(`score ${entry}`, admin.from('league_match_scores').insert({
      entry_id: entry, fixture_id: FIX(1), pool_id: POOL_EVEN,
      matchweek_number: 1, fixture_number: 1, kicked_off_at: new Date().toISOString(),
      actual_home_score: 1, actual_away_score: 0, predicted_outcome: 'home',
      score_type: 'winner', base_points: pts, total_points: pts,
    }).select('entry_id'))
  }

  const res = await must('settle', admin.rpc('league_score_duels', {
    p_pool_id: POOL_EVEN, p_matchweek_number: 1,
  }))
  eq('all three settled', (res as { settled?: number }).settled, 3)

  const after = (await duelsOf(POOL_EVEN)).filter((d) => d.matchweek_number === 1)
  const byId = new Map(after.map((d) => [d.duel_id, d]))
  const d1 = byId.get(mw1[0].duel_id)!, d2 = byId.get(mw1[1].duel_id)!, d3 = byId.get(mw1[2].duel_id)!

  eq('a one-point win is still three points', d1.points_a, 3)
  eq('…and the loser gets nothing', d1.points_b, 0)
  eq('a hundred-point win is also three', d2.points_a, 3)
  note('the margin does not carry — that is what makes it a league table and not a totals race')
  eq('equal accuracy is a draw', d3.points_a, 1)
  eq('…for both', d3.points_b, 1)
  eq('the accuracy that decided it is recorded', d1.accuracy_a, 10)

  head('4. Duel points lead the table, pick points do not')

  const totals = await must('totals', admin.from('league_entry_totals')
    .select('entry_id, duel_points, total_points, final_rank').eq('pool_id', POOL_EVEN))
  const t = new Map(((totals ?? []) as Array<{ entry_id: string; duel_points: number; final_rank: number | null }>)
    .map((r) => [r.entry_id, r]))

  eq('a row for every entry, including any who never picked', (totals ?? []).length, 6)
  eq('narrow winner has three', t.get(d1.entry_a)?.duel_points, 3)
  eq('landslide loser has none', t.get(d2.entry_b!)?.duel_points, 0)
  eq('both drawers have one', t.get(d3.entry_a)?.duel_points, 1)

  // The point of the mode: 3 duel points on ten pick points beats 0 duel points
  // on a hundred.
  const winnerRank = t.get(d1.entry_a)?.final_rank ?? 999
  const loserRank = t.get(d2.entry_b!)?.final_rank ?? 999
  eq('winning a small duel outranks losing a big one', winnerRank < loserRank, true)
  note(`rank ${winnerRank} (3 duel pts / 10 pick pts) above rank ${loserRank} (0 duel pts / 100 pick pts)`)
}

async function controlPool() {
  head('5. The control — a Pick’em pool must be untouched by all of this')

  for (const [entry, pts] of [[E(12), 50], [E(13), 90]] as const) {
    await must(`control score ${entry}`, admin.from('league_match_scores').insert({
      entry_id: entry, fixture_id: FIX(1), pool_id: POOL_PICK,
      matchweek_number: 1, fixture_number: 1, kicked_off_at: new Date().toISOString(),
      actual_home_score: 1, actual_away_score: 0, predicted_outcome: 'home',
      score_type: 'winner', base_points: pts, total_points: pts,
    }).select('entry_id'))
    await must(`control total ${entry}`, admin.from('league_entry_totals').upsert({
      entry_id: entry, pool_id: POOL_PICK, total_points: pts, match_points: pts,
    }, { onConflict: 'entry_id' }).select('entry_id'))
  }
  await must('rank control', admin.rpc('league_finalize_ranks', { p_pool_id: POOL_PICK }))

  const rows = await must('control totals', admin.from('league_entry_totals')
    .select('entry_id, duel_points, total_points, final_rank').eq('pool_id', POOL_PICK))
  const m = new Map(((rows ?? []) as Array<{ entry_id: string; duel_points: number; final_rank: number | null }>)
    .map((r) => [r.entry_id, r]))

  eq('duel points are zero for a Pick’em pool', [...m.values()].every((r) => r.duel_points === 0), true)
  eq('the higher pick score still ranks first', m.get(E(13))?.final_rank, 1)
  eq('…and the lower second', m.get(E(12))?.final_rank, 2)
  note('the new leading key is constant here, so the settled cascade is unchanged')

  const noDuels = await must('control duels', admin.from('league_duels')
    .select('duel_id').eq('pool_id', POOL_PICK))
  eq('a Pick’em pool has no fixture list at all', (noDuels ?? []).length, 0)
}

async function regeneration() {
  head('6. Regenerating never rewrites a played duel')

  const before = (await duelsOf(POOL_EVEN)).filter((d) => d.matchweek_number === 1)
  const beforeKey = before.map((d) => `${d.entry_a}|${d.entry_b}|${d.points_a}`).sort().join(',')

  // A seventh entry joins mid-season — the fixture list has to change from here
  // forward without touching what has already been played.
  await must('late entry', admin.from('pool_entries').insert({
    entry_id: E(14), member_id: MEM(1), entry_name: 'E14 late', entry_number: 14,
  }).select('entry_id'))

  const gen = await generate(POOL_EVEN)
  eq('regeneration starts after the last settled matchweek', gen.from_matchweek ?? 0, 2)

  const after = (await duelsOf(POOL_EVEN)).filter((d) => d.matchweek_number === 1)
  const afterKey = after.map((d) => `${d.entry_a}|${d.entry_b}|${d.points_a}`).sort().join(',')
  eq('matchweek 1 is byte-for-byte what it was', afterKey === beforeKey, true)
  note('a settled duel is a result, not a plan')

  const mw2 = (await duelsOf(POOL_EVEN)).filter((d) => d.matchweek_number === 2)
  eq('the new entry is in the forward schedule',
    mw2.some((d) => d.entry_a === E(14) || d.entry_b === E(14)), true)
  eq('seven entries means a bye somewhere in the week', mw2.some((d) => d.entry_b === null), true)
}

async function neverInThePast() {
  head('7. A pool created mid-season gets no duels for weeks it missed')

  // Found on live data 2026-08-24: the seed pools carried five duels in
  // matchweek 1, a week played four days before those pools existed. Nobody
  // could have picked in them, so every one would have settled 0-0 — a draw —
  // and paid every member a point for a week they were not in.
  await must('lock mw1-4', admin.from('league_matchweeks')
    .update({ lock_at: new Date(Date.now() - 3600e3).toISOString() })
    .in('matchweek_id', [MW(1), MW(2), MW(3), MW(4)]).select('matchweek_id'))

  const gen = await generate(POOL_ODD)
  eq('the schedule starts at the first matchweek still open', gen.from_matchweek ?? 0, 5)

  // Duels ALREADY written for matchweeks 1-4 stay: they were created while
  // those weeks were open, and repairing a locked week's fixture list would
  // change who somebody was playing after they had picked. What must not happen
  // is a pool created NOW receiving duels for weeks that are already over.
  const kept = (await duelsOf(POOL_ODD)).filter((d) => d.matchweek_number < 5)
  eq('duels made while those weeks were open are left alone', kept.length > 0, true)
  note('a locked week keeps its fixture list — its picks are already in')

  const late = await must('late pool', admin.from('pools').insert({
    pool_id: POOL_LATE, tournament_id: (await must('t', admin.from('pools')
      .select('tournament_id').eq('pool_id', POOL_EVEN)) as Array<{ tournament_id: string }>)[0].tournament_id,
    admin_user_id: (await must('u', admin.from('pool_members')
      .select('user_id').eq('member_id', MEM(1))) as Array<{ user_id: string }>)[0].user_id,
    pool_name: '__scratch 100 late joiner (auto-deleted)',
    prediction_deadline: new Date(Date.now() + 90 * 864e5).toISOString(),
    status: 'open', prediction_mode: 'league_pickem', league_season_id: SEASON,
    league_mode: 'showdown', league_depth: 'results', max_entries_per_user: 20,
  }).select('pool_id, admin_user_id'))
  await must('late mem', admin.from('pool_members').insert({
    member_id: MEM(4), pool_id: POOL_LATE,
    user_id: (late as Array<{ admin_user_id: string }>)[0].admin_user_id, role: 'admin',
  }).select('member_id'))
  for (const n of [20, 21]) {
    await must(`late entry ${n}`, admin.from('pool_entries').insert({
      entry_id: E(n), member_id: MEM(4), entry_name: `L${n}`, entry_number: n,
    }).select('entry_id'))
  }
  const lateGen = await generate(POOL_LATE)
  eq('a pool created now starts at matchweek 5', lateGen.from_matchweek ?? 0, 5)
  const lateDuels = await duelsOf(POOL_LATE)
  eq('…and holds NOTHING in the weeks it missed',
     lateDuels.filter((d) => d.matchweek_number < 5).length, 0)
  note('LMS and Table both got this right; only the duel generator counted from one')

  // And a season with nothing open left schedules nothing rather than falling
  // back to matchweek 1.
  await must('lock all', admin.from('league_matchweeks')
    .update({ lock_at: new Date(Date.now() - 3600e3).toISOString() })
    .eq('season_id', SEASON).select('matchweek_id'))
  const none = await generate(POOL_ODD)
  eq('a finished season schedules nothing', none.skipped, 'no open matchweek left')
}

async function theSeal() {
  head('8. The draw is SEALED until its matchweek opens (migration 116)')

  // ⚠ WHY THIS SECTION EXISTS AT ALL.
  //
  // Every other check in this file runs as `admin` — the service-role client,
  // which carries `bypassrls`. Migration 116's policy is invisible to it. A
  // service-role-only test of a row-level policy PASSES WITH THE SEAL WIDE
  // OPEN, which is worse than no test: it reports a guarantee nobody is
  // providing. So this one check needs a real member's JWT.
  //
  // State when this runs: every matchweek locks in the future (`setup`), so
  // matchweek 1 is the open one and matchweeks 2..WEEKS are sealed. Run it
  // BEFORE `neverInThePast`, which pushes locks into the past.

  const created = await admin.auth.admin.createUser({
    email: SEAL_EMAIL, password: SEAL_PASSWORD, email_confirm: true,
  })
  if (created.error || !created.data.user) {
    bad('scratch auth user', created.error?.message ?? 'no user returned')
    return
  }
  const authUserId = created.data.user.id

  const appUser = await must('scratch app user', admin.from('users').insert({
    auth_user_id: authUserId, username: 'scratch116seal', email: SEAL_EMAIL,
  }).select('user_id'))
  const userId = (appUser as Array<{ user_id: string }>)[0].user_id

  await must('scratch membership', admin.from('pool_members').insert({
    member_id: MEM(9), pool_id: POOL_EVEN, user_id: userId, role: 'member',
  }).select('member_id'))

  const member = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const signedIn = await member.auth.signInWithPassword({
    email: SEAL_EMAIL, password: SEAL_PASSWORD,
  })
  if (signedIn.error) {
    bad('sign in as the scratch member', signedIn.error.message)
    return
  }

  const asAdmin = await must('duels as service_role',
    admin.from('league_duels').select('matchweek_number').eq('pool_id', POOL_EVEN))
  const adminWeeks = new Set((asAdmin as Array<{ matchweek_number: number }>)
    .map((d) => d.matchweek_number))

  const { data: asMemberRows, error: memberErr } = await member
    .from('league_duels').select('matchweek_number').eq('pool_id', POOL_EVEN)
  if (memberErr) {
    // An RLS refusal is empty rows, never an error. An error here means the
    // policy raised — most likely `league_open_matchweek` being revoked from
    // the caller, which is the hazard `league_duel_is_revealed` is SECURITY
    // DEFINER to avoid.
    bad('the member read returns rows, not an error', memberErr.message)
    return
  }
  const memberWeeks = new Set((asMemberRows ?? []).map((d) => d.matchweek_number as number))

  eq('service_role still sees the whole season', adminWeeks.size, WEEKS)
  eq('the member sees ONLY the open matchweek', [...memberWeeks].join(','), '1')
  eq('…and every later matchweek is withheld',
     [...adminWeeks].filter((w) => w > 1).every((w) => !memberWeeks.has(w)), true)
  note('a service-role-only test of this policy would pass with the seal wide open')

  // The predicate itself, both sides of the line.
  const openRevealed = await must('predicate mw1', admin.rpc('league_duel_is_revealed', {
    p_pool_id: POOL_EVEN, p_matchweek_number: 1,
  }))
  const nextRevealed = await must('predicate mw2', admin.rpc('league_duel_is_revealed', {
    p_pool_id: POOL_EVEN, p_matchweek_number: 2,
  }))
  eq('league_duel_is_revealed says yes for the open matchweek', openRevealed as unknown, true)
  eq('…and no for the one after it', nextRevealed as unknown, false)

  // A non-member sees nothing at all — the membership half of the policy is
  // still doing its job, not just the reveal half.
  await must('drop scratch membership',
    admin.from('pool_members').delete().eq('member_id', MEM(9)).select('member_id'))
  const { data: asStranger } = await member
    .from('league_duels').select('matchweek_number').eq('pool_id', POOL_EVEN)
  eq('a non-member sees no duels at all', (asStranger ?? []).length, 0)

  await member.auth.signOut()
}

async function theShuffle() {
  head('9. The round order is permuted per cycle, and it is deterministic')

  // Migration 118. The seal has a half-life: with n entries a member has met
  // everyone by round n-1, so the tail of each cycle is deducible. Sequential
  // round order made that far worse — cycle 1 repeated cycle 0 exactly, so once
  // you had seen one cycle you knew the rest of the season outright.
  //
  // What must NOT change is the pair multiset. Section 1 already asserts that
  // property directly against whatever the generator produced, so if the
  // permutation broke the round-robin this script would have failed before
  // reaching here. This section checks the two things section 1 cannot see.

  const shape = (rows: Array<{ matchweek_number: number; entry_a: string; entry_b: string | null }>) =>
    rows
      .map((d) => `${d.matchweek_number}:${[d.entry_a, d.entry_b ?? '-'].sort().join('|')}`)
      .sort()
      .join(',')

  // 1. DETERMINISM. Regenerating with an unchanged roster must produce a
  //    byte-identical future — under a sealed draw nobody could see it churn.
  const before = shape(await duelsOf(POOL_ODD))
  await generate(POOL_ODD)
  const after = shape(await duelsOf(POOL_ODD))
  eq('regenerating an unchanged pool changes nothing', after === before, true)
  note('random() here would redraw the season on every join, invisibly')

  // 2. THE PERMUTATION IS LIVE. Two cycles of the same pool must not use the
  //    same round order — that is the whole point. Compared by the SET of
  //    opponents each matchweek pairs, since the round index is not stored.
  const odd = await duelsOf(POOL_ODD)
  const rounds = 5 // n-1 for five entries padded to six
  const weekShape = (mw: number) =>
    odd.filter((d) => d.matchweek_number === mw)
       .map((d) => [d.entry_a, d.entry_b ?? '-'].sort().join('|'))
       .sort().join(',')
  const cycle0 = Array.from({ length: rounds }, (_, i) => weekShape(i + 1))
  const cycle1 = Array.from({ length: rounds }, (_, i) => weekShape(i + 1 + rounds))
  eq('cycle 1 does not simply repeat cycle 0', cycle0.join('#') !== cycle1.join('#'), true)

  // …but it IS the same set of rounds, reordered. Every matchweek of cycle 0
  // must reappear somewhere in cycle 1.
  const asSet = new Set(cycle0)
  eq('…it is the same rounds in a different order',
     cycle1.every((w) => asSet.has(w)) && new Set(cycle1).size === asSet.size, true)
  note('same pairs, same byes, same counts — only which week they land in moved')
}

async function teardown() {
  head('Teardown')

  // The seal check's scratch identity. Removed first, because the app `users`
  // row references the auth user.
  await admin.from('pool_members').delete().eq('member_id', MEM(9))
  const { data: sealUser } = await admin.from('users')
    .select('user_id, auth_user_id').eq('email', SEAL_EMAIL).maybeSingle()
  if (sealUser) {
    await admin.from('users').delete().eq('user_id', (sealUser as { user_id: string }).user_id)
    const authId = (sealUser as { auth_user_id: string | null }).auth_user_id
    if (authId) await admin.auth.admin.deleteUser(authId)
  }

  for (const pid of [POOL_EVEN, POOL_ODD, POOL_PICK, POOL_LATE]) {
    await admin.from('pool_entries').delete().eq('pool_id', pid)
    await admin.from('pools').delete().eq('pool_id', pid)
  }
  await admin.from('league_seasons').delete().eq('season_id', SEASON)

  const left: string[] = []
  for (const [t, col, val] of [
    ['pools', 'pool_id', POOL_EVEN], ['pools', 'pool_id', POOL_ODD],
    ['pools', 'pool_id', POOL_PICK], ['pools', 'pool_id', POOL_LATE],
    ['league_seasons', 'season_id', SEASON], ['league_duels', 'pool_id', POOL_EVEN],
    ['league_fixtures', 'season_id', SEASON], ['users', 'email', SEAL_EMAIL],
  ] as const) {
    const { count } = await admin.from(t).select('*', { count: 'exact', head: true }).eq(col, val)
    if ((count ?? 0) > 0) left.push(`${t}=${count}`)
  }
  if (left.length) bad('scratch data fully removed', left.join(', '))
  else ok('scratch data fully removed', 'production is exactly as it was found')
}

;(async () => {
  console.log('\n  SHOWDOWN — migrations 083-085, 116-118')
  console.log('  ' + '='.repeat(68))
  try {
    await setup()
    await roundRobin()
    await byes()
    await scoring()
    await controlPool()
    await regeneration()
    await theSeal()
    await theShuffle()
    await neverInThePast()
  } catch (err) {
    bad('threw', err instanceof Error ? err.message : String(err))
  } finally {
    await teardown()
  }
  console.log('\n  ' + '='.repeat(68))
  console.log(failures === 0 ? '  ALL CHECKS PASSED\n' : `  ${failures} CHECK(S) FAILED\n`)
  process.exit(failures === 0 ? 0 : 1)
})()
