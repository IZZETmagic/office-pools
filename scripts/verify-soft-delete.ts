// =============================================================
// verify-soft-delete — the migration 056 round trip, end to end
// =============================================================
// Migration 056 makes an entry survive its membership: leaving a pool detaches
// the entry (member_id -> NULL) instead of cascading twelve child tables into
// oblivion. The three static checks in 056's own VERIFY block prove the schema
// changed. They do NOT prove the guarantee Ryan actually asked for:
//
//   "we want their predictions to stay ... if they're added back in, they're
//    linked back up to their predictions."
//
// This script proves that behaviourally, by driving the REAL functions in
// lib/entries/retire.ts and the REAL leaderboard read in lib/scoring/readSource.
//
// ## It also proves migration 134 — the two engines that decide who WON
//
// 057 stopped a retired entry being SCORED. It said nothing about the engines
// that award something, and both of them run on the modes Premier League ships
// with. Phases 6 and 7 drive `league_score_duels` and `league_lms_settle` for
// real and assert the two outcomes 134 changes:
//
//   a duel against a member who left is a BYE (250), not a win (500)
//   a member who left cannot be crowned Last Man Standing
//
// ⚠ THOSE TWO PHASES FAIL UNTIL 134 IS APPLIED. That is the point of them —
// they are the proof, so they are written to fail loudly and say why. The
// script detects whether 134 is live and labels the failure accordingly.
//
// ⚠ RETIREMENT MUST HAPPEN MID-ROUND to reproduce the LMS bug.
// `league_lms_open_round` ALREADY filters `retired_at` when it enrols
// survivors, so retiring before a round opens is handled correctly today. The
// hole is the member who leaves after the round is underway.
//
// ## It is isolated, and it cleans up after itself
//
// It builds its OWN scratch league season (clubs, matchweeks, fixtures) and its
// OWN scratch pool. No production league row is read for anything but schema
// shape, and none is written. Everything it creates hangs off two ids, both
// deleted in a `finally` — so a crash mid-run still tears down.
//
// The scratch season exists because `enforce_league_prediction_before_lock` is
// a SILENT-SKIP trigger (RETURN NULL): a prediction on a completed fixture is
// dropped with no error. Predictions must therefore be written while fixtures
// are still open, which means owning the fixtures. Disabling the production
// trigger to work around that was the alternative, and was rejected.
//
//   npx tsx scripts/verify-soft-delete.ts
//
// Exits 1 on any failure.
// =============================================================

import { existsSync, readFileSync } from 'fs'
import { execSync } from 'child_process'
import { dirname, resolve } from 'path'

/**
 * `.env.local` is gitignored, so a git WORKTREE does not get one — and this
 * script is exactly the kind of thing you run from a worktree while working on
 * the migration it verifies. Reading it from cwd alone threw ENOENT on line one
 * with a stack trace that says nothing about worktrees.
 *
 * Falls back to the main checkout, found via `--git-common-dir`: in a worktree
 * that resolves to <main>/.git, whose parent is the checkout holding the real
 * file. In a normal clone it resolves to the same directory as cwd, so this
 * costs nothing there.
 */
function envPath(): string {
  const local = resolve(process.cwd(), '.env.local')
  if (existsSync(local)) return local
  try {
    const commonDir = execSync('git rev-parse --git-common-dir', { encoding: 'utf8' }).trim()
    const shared = resolve(dirname(resolve(commonDir)), '.env.local')
    if (existsSync(shared)) return shared
  } catch {
    // not a git checkout — fall through to the original error, which is clearer
  }
  return local
}

;(() => {
  const path = envPath()
  if (!existsSync(path)) {
    console.error(`\n  This script needs .env.local (service-role credentials).`)
    console.error(`  Looked in ${process.cwd()} and the main checkout, found neither.\n`)
    process.exit(1)
  }
  if (path !== resolve(process.cwd(), '.env.local')) {
    console.log(`  · using .env.local from the main checkout — ${path}`)
  }
  const envContent = readFileSync(path, 'utf8')
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
import { retireEntries, restoreEntriesForMember, rescoreRestoredEntries } from '../lib/entries/retire'
import { readEntryScoring } from '../lib/scoring/readSource'

const admin = createAdminClient()

// --- scratch namespace: every id starts dd056 so strays are greppable -------
const S = 'dd056000-0000-4000-8000-'
const SEASON = `${S}000000000001`
const TOURNAMENT = `${S}000000000008`
const POOL = `${S}000000000002`
const MEMBER1 = `${S}000000000003`
const MEMBER2 = `${S}000000000004`
const ENTRY = `${S}000000000005`
const MW1 = `${S}000000000010`
const MW2 = `${S}000000000011`
// MW3 exists because phases 6 and 7 need a matchweek that is still OPEN when
// they run — MW1 is completed during setup (that is what opens MW2) and MW2 is
// played in phase 3. Its results are set explicitly rather than by RESULT(n),
// because these phases need particular clubs to win and lose.
const MW3 = `${S}000000000012`

// Showdown and LMS are pool-level modes, so each needs its own pool. Both hang
// off the SAME scratch season, so teardown is unchanged.
const POOL_SD = `${S}000000000006`   // showdown
// ⚠ ONE MEMBER, TWO ENTRIES. `pool_members` is UNIQUE on (pool_id, user_id) and
// this script has exactly one real user to work with, so two members in one
// pool is impossible. It does not matter: both engines pair and enrol ENTRIES,
// not members, and a member holding several entries is a normal pool anyway.
const SD_MEM = `${S}000000000060`
// ⚠ FOUR entries, not two. Retiring from a two-entry pool leaves one, and
// `league_generate_duel_schedule` then DELETES every unsettled duel outright
// ("fewer than two entries") — so there is no duel left to settle and the bug
// is unreachable. With four, the regeneration that `retireEntries` triggers
// keeps pairing people AND spares the open matchweek's existing duels
// (migration 118), which is precisely how a duel naming a retired entry
// survives to be settled.
const SD_ENTRY = (n: number) => `${S}00000000006${n}`

const POOL_LMS = `${S}000000000007`  // last man standing
const LMS_MEM = `${S}000000000070`
const LMS_ENTRY = (n: number) => `${S}00000000008${n}`
const CLUB = (n: number) => `${S}0000000002${n}0`
// ⚠ PADDED, because MW3 uses fixture 10. The last group of a UUID is exactly
// 12 hex characters and the old `...0003${n}0` produced 13 for any two-digit n,
// which Postgres rejects outright ("invalid input syntax for type uuid").
// Offset well clear of MW1-3 (`...000010/11/12`) and CLUB(n) (`...0002n0`).
const FIX = (n: number) => `${S}0000000${String(n).padStart(2, '0')}000`

const EXACT = 100 // pool_settings absent -> league_score_fixture COALESCE default
const DUEL_WIN = 500
const DUEL_BYE = 250  // "no opponent, so no defeat" — and 134 says a retired
                      // opponent is no opponent
const PER_MW = 4
const MW1_PTS = PER_MW * EXACT
const FULL_PTS = 2 * PER_MW * EXACT

let failures = 0
let ADMIN_USER = ''

const ok = (m: string, extra = '') => console.log(`    ✓ ${m}${extra ? `  — ${extra}` : ''}`)
const bad = (m: string, extra = '') => { failures++; console.log(`    ✗ ${m}${extra ? `  — ${extra}` : ''}`) }
const note = (m: string) => console.log(`    · ${m}`)
const head = (m: string) => console.log(`\n  ${m}\n  ${'-'.repeat(66)}`)
const eq = (m: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(m, String(actual)) : bad(m, `expected ${String(expected)}, got ${String(actual)}`)

async function must<T>(label: string, p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

// The exact read the pool page uses (lib/poolData.ts): entries are reached
// THROUGH pool_members, which is why a detached entry vanishes with no read
// change. Returns the entry ids a member would see on the leaderboard.
async function visibleEntryIds(): Promise<string[]> {
  const rows = await must(
    'visible entries',
    admin.from('pool_members').select('member_id, pool_entries(entry_id)').eq('pool_id', POOL)
      // MIRRORS lib/poolData.ts. Both reads there carry this same filter as of
      // migration 057; if you change it there, change it here.
      .is('pool_entries.retired_at', null),
  )
  return ((rows ?? []) as Array<{ pool_entries: Array<{ entry_id: string }> }>)
    .flatMap((m) => (m.pool_entries ?? []).map((e) => e.entry_id))
}

async function points(): Promise<number> {
  const m = await readEntryScoring(admin, [ENTRY], 'league')
  return m.get(ENTRY)?.scored_total_points ?? 0
}

async function predictionCount(): Promise<number> {
  const { count, error } = await admin
    .from('league_predictions').select('*', { count: 'exact', head: true }).eq('entry_id', ENTRY)
  if (error) throw new Error(`prediction count: ${error.message}`)
  return count ?? 0
}

async function entryRow() {
  const rows = await must('entry row',
    admin.from('pool_entries')
      .select('entry_id, member_id, pool_id, user_id, retired_at, retired_reason')
      .eq('entry_id', ENTRY))
  return (rows ?? [])[0] as {
    member_id: string | null; pool_id: string | null; user_id: string | null
    retired_at: string | null; retired_reason: string | null
  } | undefined
}

// Results are decided up front so predictions can be written exact BEFORE the
// fixtures complete — the silent-skip trigger forbids it afterwards.
const RESULT = (n: number) => ({ h: (n % 3) + 1, a: n % 2 })

async function completeMatchweek(mw: string, nums: number[]) {
  for (const n of nums) {
    const r = RESULT(n)
    const { error } = await admin.from('league_fixtures').update({
      home_goals: r.h, away_goals: r.a, is_completed: true,
      status: 'completed', completed_at: new Date().toISOString(),
    }).eq('fixture_id', FIX(n))
    if (error) throw new Error(`complete fixture ${n}: ${error.message}`)
  }
  const { error } = await admin.from('league_matchweeks')
    .update({ completed_fixture_count: nums.length }).eq('matchweek_id', mw)
  if (error) throw new Error(`matchweek rollup: ${error.message}`)
}

// Re-write one fixture's result, so a re-score has something to move. This is
// how phase 5 tells "excluded from scoring" apart from "scored to the same
// number": if the entry is still live, changing the result changes its points.
async function setResult(n: number, h: number, a: number) {
  const { error } = await admin.from('league_fixtures')
    .update({ home_goals: h, away_goals: a }).eq('fixture_id', FIX(n))
  if (error) throw new Error(`setResult ${n}: ${error.message}`)
}

// MW3's results, applied after picks are filed. CLUB1 and CLUB4 win; CLUB2 and
// CLUB3 lose. Kept separate from `completeMatchweek` because that helper derives
// scores from RESULT(n), and these two have to be chosen.
async function playMatchweek3() {
  await setResult(9, 2, 0)   // CLUB1 beats CLUB2
  await setResult(10, 1, 0)  // CLUB4 beats CLUB3
  for (const n of [9, 10]) {
    const { error } = await admin.from('league_fixtures').update({
      is_completed: true, status: 'completed', completed_at: new Date().toISOString(),
    }).eq('fixture_id', FIX(n))
    if (error) throw new Error(`complete fixture ${n}: ${error.message}`)
  }
  const { error } = await admin.from('league_matchweeks')
    .update({ completed_fixture_count: 2 }).eq('matchweek_id', MW3)
  if (error) throw new Error(`MW3 rollup: ${error.message}`)
}

async function scoreFixtures(nums: number[]) {
  for (const n of nums) {
    const { error } = await admin.rpc('league_score_fixture', { p_fixture_id: FIX(n) })
    if (error) throw new Error(`score fixture ${n}: ${error.message}`)
  }
}

/**
 * The one-line explanation phases 6 and 7 print when they fail.
 *
 * Their failure mode is a plain number mismatch — "expected 250, got 500" — and
 * out of context that reads like a broken test rather than an unapplied
 * migration. `expectedBy134` says which it is.
 */
const BY_134 = '134 not applied?'
const expectedBy134 = (m: string, actual: unknown, expected: unknown) =>
  actual === expected
    ? ok(m, String(actual))
    : bad(m, `expected ${String(expected)}, got ${String(actual)} — ${BY_134}`)

async function setup() {
  head('Setup — an isolated scratch season and pool')

  const users = await must('admin user',
    admin.from('users').select('user_id').eq('username', 'IZZETmagic').limit(1))
  ADMIN_USER = ((users ?? [])[0] as { user_id: string }).user_id

  // ⚠ ITS OWN TOURNAMENT, not a borrowed one. This used to grab an arbitrary
  // real league pool's tournament_id, and migration 111 (`a pool names one
  // competition`) has since made that a hard error: the trigger compares
  // (external_provider, external_league_id, external_season) on the pool's
  // tournament against its league season and refuses a pool that names two
  // different competitions. Borrowing Bundesliga's tournament for a season
  // declared (scratch, -56, -2026) is exactly what it exists to stop.
  //
  // The script last passed on 2026-08-24, before 111 — so it has been broken
  // since, silently, because nothing runs it automatically.
  const future = new Date(Date.now() + 90 * 864e5).toISOString()

  const tournamentId = TOURNAMENT
  await must('scratch tournament', admin.from('tournaments').insert({
    tournament_id: TOURNAMENT, name: '__scratch 056 (auto-deleted)',
    tournament_type: 'league', year: 2026,
    // ⚠ `format` DEFAULTS TO 'groups_knockout' — a World Cup shape. 111's
    // trigger checks it as well as the competition triple and refuses a league
    // season paired with a knockout tournament, because neither side syncs.
    format: 'league',
    num_teams: 4, num_groups: 1, teams_per_group: 4,
    start_date: '2026-08-01', end_date: '2027-05-30', prediction_deadline: future,
    // Must match the season below, or 111's trigger rejects the pool.
    external_provider: 'scratch', external_league_id: -56, external_season: -2026,
  }).select('tournament_id'))

  await must('season', admin.from('league_seasons').insert({
    season_id: SEASON, competition_slug: 'scratch-056', competition_name: 'Scratch 056',
    season_label: '2026/2027', season_start_year: 2026, country_code: 'GB',
    club_count: 4, matchweek_count: 3, external_provider: 'scratch',
    external_league_id: -56, external_season: -2026, regular_season_phase: 'regular',
  }).select('season_id'))

  await must('clubs', admin.from('league_clubs').insert(
    [1, 2, 3, 4].map((n) => ({
      club_id: CLUB(n), season_id: SEASON, name: `Scratch FC ${n}`,
      short_name: `SFC${n}`, abbreviation: `S${n}`, external_club_id: -560 - n,
    })),
  ).select('club_id'))

  await must('matchweeks', admin.from('league_matchweeks').insert([
    { matchweek_id: MW1, season_id: SEASON, matchweek_number: 1, label: 'MW1', provider_round: 'r1', fixture_count: PER_MW, completed_fixture_count: 0, lock_at: future },
    { matchweek_id: MW2, season_id: SEASON, matchweek_number: 2, label: 'MW2', provider_round: 'r2', fixture_count: PER_MW, completed_fixture_count: 0, lock_at: future },
    // Two fixtures, not four: phases 6 and 7 only need one club to win and one
    // to lose, and a shorter matchweek is faster to complete.
    { matchweek_id: MW3, season_id: SEASON, matchweek_number: 3, label: 'MW3', provider_round: 'r3', fixture_count: 2, completed_fixture_count: 0, lock_at: future },
  ]).select('matchweek_id'))

  // 1-4 in MW1, 5-8 in MW2. Pairings just have to differ home vs away.
  const fixtures = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    fixture_id: FIX(n), season_id: SEASON,
    matchweek_id: n <= PER_MW ? MW1 : MW2, fixture_number: n,
    home_club_id: CLUB(((n - 1) % 4) + 1), away_club_id: CLUB(((n + 1) % 4) + 1),
    kickoff_at: future, status: 'scheduled', is_completed: false,
    external_fixture_id: `scratch-056-${n}`,
  }))
  // MW3 is paired by hand rather than by the modular formula above, because
  // phases 6 and 7 need to know exactly who wins. Under the formula a club can
  // both win and lose inside one matchweek (it plays twice), and LMS asks only
  // "did this club win a completed fixture this matchweek" — so a double-booked
  // club survives on its win and the test proves nothing.
  //
  //   fix 9 : CLUB1 beats CLUB2      fix 10 : CLUB4 beats CLUB3
  //
  // Results are applied in `playMatchweek3`, after picks are filed — the
  // silent-skip trigger forbids picking a fixture that has already finished.
  fixtures.push(
    { fixture_id: FIX(9), season_id: SEASON, matchweek_id: MW3, fixture_number: 9,
      home_club_id: CLUB(1), away_club_id: CLUB(2),
      kickoff_at: future, status: 'scheduled', is_completed: false,
      external_fixture_id: 'scratch-056-9' },
    { fixture_id: FIX(10), season_id: SEASON, matchweek_id: MW3, fixture_number: 10,
      home_club_id: CLUB(4), away_club_id: CLUB(3),
      kickoff_at: future, status: 'scheduled', is_completed: false,
      external_fixture_id: 'scratch-056-10' },
  )
  await must('fixtures', admin.from('league_fixtures').insert(fixtures).select('fixture_id'))

  await must('pool', admin.from('pools').insert({
    pool_id: POOL, tournament_id: tournamentId, admin_user_id: ADMIN_USER,
    pool_name: '__scratch 056 verify (auto-deleted)', prediction_deadline: future,
    status: 'open', prediction_mode: 'league_pickem', league_season_id: SEASON,
  }).select('pool_id'))

  await must('membership', admin.from('pool_members').insert({
    member_id: MEMBER1, pool_id: POOL, user_id: ADMIN_USER, role: 'admin',
  }).select('member_id'))

  // member_id ONLY — pool_id/user_id must be filled by 056's trigger.
  await must('entry', admin.from('pool_entries').insert({
    entry_id: ENTRY, member_id: MEMBER1, entry_name: 'Scratch Entry', entry_number: 1,
  }).select('entry_id'))

  // Picks are written MATCHWEEK BY MATCHWEEK, not all at once, and the order
  // matters. Migration 058 accepts a pick only for the OPEN matchweek — the
  // earliest neither finished nor locked — so writing MW2's picks while MW1 is
  // still open silently drops them (the trigger RETURNs NULL and reports
  // success). That is the rule working; this is just what a real member does
  // anyway: pick this week, play it, pick the next.
  const pick = (n: number) => ({
    entry_id: ENTRY, fixture_id: FIX(n),
    predicted_home_score: RESULT(n).h, predicted_away_score: RESULT(n).a,
  })

  // MW1 is open (nothing finished, nothing locked), so its four land.
  await must('MW1 predictions', admin.from('league_predictions')
    .insert([1, 2, 3, 4].map(pick)).select('prediction_id'))
  eq('MW1 picks landed while MW1 was open', await predictionCount(), PER_MW)

  // Playing MW1 is what opens MW2 — no cron, no button.
  await completeMatchweek(MW1, [1, 2, 3, 4])

  await must('MW2 predictions', admin.from('league_predictions')
    .insert([5, 6, 7, 8].map(pick)).select('prediction_id'))
  eq('MW2 picks landed once MW1 finished and MW2 opened', await predictionCount(), 2 * PER_MW)

  // ---- the two extra pools phases 6 and 7 drive -----------------------------
  // Same season, own pools: league_mode is a property of the pool, and the
  // CHECK pairs it with league_depth (results/scores for pickem+showdown, NULL
  // for table+LMS).
  await must('showdown pool', admin.from('pools').insert({
    pool_id: POOL_SD, tournament_id: tournamentId, admin_user_id: ADMIN_USER,
    pool_name: '__scratch 056 showdown (auto-deleted)', prediction_deadline: future,
    status: 'open', prediction_mode: 'league_pickem', league_season_id: SEASON,
    league_mode: 'showdown', league_depth: 'scores',
  }).select('pool_id'))
  await must('showdown member', admin.from('pool_members').insert({
    member_id: SD_MEM, pool_id: POOL_SD, user_id: ADMIN_USER, role: 'admin',
  }).select('member_id'))
  await must('showdown entries', admin.from('pool_entries').insert(
    [1, 2, 3, 4].map((n) => ({
      entry_id: SD_ENTRY(n), member_id: SD_MEM,
      entry_name: `Duellist ${n}`, entry_number: n,
    })),
  ).select('entry_id'))

  // Generated NOW, while every matchweek is still ahead. Regeneration
  // deliberately spares the open matchweek (migration 118), so a schedule built
  // later would not produce the MW3 duel phase 6 needs.
  await must('duel schedule', admin.rpc('league_generate_duel_schedule', { p_pool_id: POOL_SD }) as never)

  await must('lms pool', admin.from('pools').insert({
    pool_id: POOL_LMS, tournament_id: tournamentId, admin_user_id: ADMIN_USER,
    pool_name: '__scratch 056 lms (auto-deleted)', prediction_deadline: future,
    status: 'open', prediction_mode: 'league_pickem', league_season_id: SEASON,
    league_mode: 'last_man_standing', league_depth: null,
  }).select('pool_id'))
  await must('lms member', admin.from('pool_members').insert({
    member_id: LMS_MEM, pool_id: POOL_LMS, user_id: ADMIN_USER, role: 'admin',
  }).select('member_id'))
  await must('lms entries', admin.from('pool_entries').insert(
    [1, 2, 3].map((n) => ({
      entry_id: LMS_ENTRY(n), member_id: LMS_MEM,
      entry_name: `Survivor ${n}`, entry_number: n,
    })),
  ).select('entry_id'))

  const e = await entryRow()
  if (e?.pool_id === POOL) ok('trigger filled pool_id on INSERT')
  else bad('trigger filled pool_id on INSERT', String(e?.pool_id))
  if (e?.user_id === ADMIN_USER) ok('trigger filled user_id on INSERT')
  else bad('trigger filled user_id on INSERT', String(e?.user_id))
}

async function run() {
  // ---------------------------------------------------------------- phase 1
  head('1. Competing normally — matchweek 1 played and scored')
  // MW1 was completed during setup (it is what opened MW2), so this only scores.
  await scoreFixtures([1, 2, 3, 4])
  eq('entry has points from MW1', await points(), MW1_PTS)
  eq('entry is on the leaderboard', (await visibleEntryIds()).includes(ENTRY), true)

  // ---------------------------------------------------------------- phase 2
  head('2. The member leaves — retire, then delete the membership')
  const r = await retireEntries(admin, { entryIds: [ENTRY] }, 'left', ADMIN_USER)
  if (r.error) bad('retireEntries', r.error); else eq('retireEntries retired 1', r.retired, 1)

  const { error: delErr } = await admin.from('pool_members').delete().eq('member_id', MEMBER1)
  if (delErr) bad('delete membership', delErr.message); else ok('membership deleted (access revoked)')

  const afterLeave = await entryRow()
  if (afterLeave) ok('THE ENTRY SURVIVED the membership delete')
  else bad('THE ENTRY SURVIVED the membership delete', 'row is gone — FK still cascades')
  eq('member_id is NULL (detached, not destroyed)', afterLeave?.member_id, null)
  eq('retired_reason recorded', afterLeave?.retired_reason, 'left')
  eq('pool_id survived (entry is still findable)', afterLeave?.pool_id, POOL)
  eq('user_id survived (entry is still findable)', afterLeave?.user_id, ADMIN_USER)
  eq('ALL 8 PREDICTIONS SURVIVED', await predictionCount(), 8)
  eq('entry has LEFT the leaderboard', (await visibleEntryIds()).includes(ENTRY), false)

  // ---------------------------------------------------------------- phase 3
  head('3. The away period — matchweek 2 is played while they are gone')
  await completeMatchweek(MW2, [5, 6, 7, 8])
  await scoreFixtures([5, 6, 7, 8])
  eq('a detached entry is not scored', await points(), MW1_PTS)
  eq('and is still off the leaderboard', (await visibleEntryIds()).includes(ENTRY), false)

  // ---------------------------------------------------------------- phase 4
  head('4. They rejoin — restore and re-score')
  await must('rejoin', admin.from('pool_members').insert({
    member_id: MEMBER2, pool_id: POOL, user_id: ADMIN_USER, role: 'player',
  }).select('member_id'))

  const res = await restoreEntriesForMember(admin, { poolId: POOL, userId: ADMIN_USER, memberId: MEMBER2 })
  if (res.error) bad('restoreEntriesForMember', res.error)
  else eq('restoreEntriesForMember found and restored 1', res.restored, 1)

  const afterRestore = await entryRow()
  eq('member_id re-pointed at the new membership', afterRestore?.member_id, MEMBER2)
  eq('retired_at cleared', afterRestore?.retired_at, null)
  eq('entry is BACK on the leaderboard', (await visibleEntryIds()).includes(ENTRY), true)

  const rescore = await rescoreRestoredEntries(admin, { poolId: POOL, leagueSeasonId: SEASON })
  if (rescore.error) bad('rescoreRestoredEntries', rescore.error)
  else ok('rescoreRestoredEntries replayed completed fixtures', `${rescore.scored} fixtures`)

  const finalPts = await points()
  eq('POINTS RESTORED IN FULL, including the away matchweek', finalPts, FULL_PTS)
  if (finalPts === FULL_PTS) note(`MW1 ${MW1_PTS} + MW2 (away) ${FULL_PTS - MW1_PTS} = ${FULL_PTS}`)

  // ---------------------------------------------------------------- phase 5
  head('5. The OTHER door — stop participating (membership kept)')

  // CONTROL FIRST. If the engine could not move this entry's points anyway,
  // step 3 below would pass for the wrong reason and prove nothing.
  // Fixture 1 finished 2-1 and was predicted 2-1 (exact, 100). Flipping it to an
  // away win makes that prediction a miss, so the entry must drop exactly 100.
  const r1 = RESULT(1)
  const MISS_H = 0, MISS_A = 3
  await setResult(1, MISS_H, MISS_A)
  await scoreFixtures([1])
  eq('control: while ACTIVE, flipping a result costs the exact', await points(), FULL_PTS - EXACT)

  // put it back and confirm we are square again
  await setResult(1, r1.h, r1.a)
  await scoreFixtures([1])
  eq('control: restoring the result restores the points', await points(), FULL_PTS)

  // NOW retire, keeping the membership — this is the stop-participating door.
  const r2 = await retireEntries(admin, { entryIds: [ENTRY] }, 'stopped', ADMIN_USER)
  if (r2.error) bad('retireEntries(stopped)', r2.error)
  else eq('entry marked retired_at / stopped', r2.retired, 1)

  const stillMember = await entryRow()
  eq('membership is DELIBERATELY kept (member_id still set)', stillMember?.member_id, MEMBER2)

  // The fix: the same result move must now do nothing.
  await setResult(1, MISS_H, MISS_A)
  await scoreFixtures([1])
  eq('A RETIRED ENTRY IS NOT SCORED (points frozen)', await points(), FULL_PTS)
  eq('a retired entry has LEFT the leaderboard', (await visibleEntryIds()).includes(ENTRY), false)
  await setResult(1, r1.h, r1.a)

  // Retiring is not deleting: everything must still be there to restore.
  eq('its predictions are still all there', await predictionCount(), 8)
  const totalsRow = await must('totals row',
    admin.from('league_entry_totals').select('total_points').eq('entry_id', ENTRY))
  eq('its points are RETAINED, not zeroed', ((totalsRow ?? [])[0] as { total_points: number } | undefined)?.total_points, FULL_PTS)

  // idempotency, cheap to prove while we are here
  const before = (await entryRow())?.retired_at
  await retireEntries(admin, { entryIds: [ENTRY] }, 'removed', ADMIN_USER)
  eq('re-retiring never rewrites the original retired_at', (await entryRow())?.retired_at, before)

  // and it comes back
  head('6. Un-retiring puts them straight back')
  const back = await restoreEntriesForMember(admin, { poolId: POOL, userId: ADMIN_USER, memberId: MEMBER2 })
  if (back.error) bad('restore after stopping', back.error)
  else eq('restored', back.restored, 1)
  await scoreFixtures([1])
  eq('scored again, and back to full points', await points(), FULL_PTS)
  eq('back on the leaderboard', (await visibleEntryIds()).includes(ENTRY), true)

  // ---------------------------------------------------------------- phase 6
  head('6. Showdown — a duel against a member who left is a bye (migration 134)')

  // Which pair the round-robin actually drew for MW3 is the generator's
  // business, not ours — so read it rather than assume it. One of them will
  // file picks and stay; the other files nothing and leaves.
  const drawn = await must('MW3 duels', admin.from('league_duels')
    .select('duel_id, entry_a, entry_b').eq('pool_id', POOL_SD).eq('matchweek_number', 3))
  const pair = ((drawn ?? []) as Array<{ duel_id: string; entry_a: string; entry_b: string | null }>)
    .find((d) => d.entry_b !== null)
  if (!pair) throw new Error('no two-sided duel was drawn for MW3')
  const STAYS = pair.entry_a
  const LEAVES = pair.entry_b as string
  note(`MW3 drew ${STAYS.slice(-4)} v ${LEAVES.slice(-4)} — the second one leaves`)

  // The one who stays picks both fixtures exactly; the one who leaves files
  // nothing. That asymmetry is the discriminator: without 134 the stayer simply
  // out-scores an absent opponent and takes the win rate.
  await must('picks MW3', admin.from('league_predictions').insert([
    { entry_id: STAYS, fixture_id: FIX(9), predicted_home_score: 2, predicted_away_score: 0 },
    { entry_id: STAYS, fixture_id: FIX(10), predicted_home_score: 1, predicted_away_score: 0 },
  ]).select('prediction_id'))

  // ⚠ THE LMS ROUND IS OPENED AND PICKED **HERE**, BEFORE THE FOOTBALL — even
  // though phase 7 is what asserts on it. `trg_enforce_lms_pick_before_lock` is
  // another SILENT-SKIP trigger (RETURN NULL) and it accepts a pick only for
  // the matchweek `league_open_matchweek` currently returns. Filing after MW3
  // completes drops all three picks with no error, every entry then reads as
  // "no pick", and `pk.club_id IS NULL` eliminates them — so phase 7's headline
  // assertion would PASS for entirely the wrong reason and prove nothing.
  await must('open LMS round', admin.rpc('league_lms_open_round', {
    p_pool_id: POOL_LMS, p_matchweek: 3,
  }) as never)

  const roundRows = await must('lms round', admin.from('league_lms_rounds')
    .select('round_id').eq('pool_id', POOL_LMS))
  const roundId = ((roundRows ?? []) as Array<{ round_id: string }>)[0]?.round_id
  if (!roundId) throw new Error('LMS round was not opened')

  const enrolled = await must('survivors', admin.from('league_lms_survivors')
    .select('entry_id').eq('round_id', roundId))
  eq('all three LMS entries enrolled', (enrolled ?? []).length, 3)

  // Survivor 1 backs a winner; 2 and 3 back losers. CLUB1 and CLUB4 win MW3.
  await must('lms picks', admin.from('league_lms_picks').insert([
    { round_id: roundId, entry_id: LMS_ENTRY(1), matchweek_number: 3, club_id: CLUB(1) },
    { round_id: roundId, entry_id: LMS_ENTRY(2), matchweek_number: 3, club_id: CLUB(2) },
    { round_id: roundId, entry_id: LMS_ENTRY(3), matchweek_number: 3, club_id: CLUB(3) },
  ]).select('entry_id'))

  // The trigger reports success either way, so count the rows that actually
  // landed. Without this the whole of phase 7 is theatre.
  const { count: lmsPickCount } = await admin.from('league_lms_picks')
    .select('*', { count: 'exact', head: true }).eq('round_id', roundId)
  eq('all three LMS picks LANDED (silent-skip trigger check)', lmsPickCount ?? 0, 3)

  // ⚠ BOTH RETIREMENTS HAPPEN HERE — AFTER the draw and the picks, BEFORE the
  // football. Settlement is TRIGGER-DRIVEN, not driven by the RPC calls below:
  //
  //   league_lms_on_fixture_complete   on league_fixtures   -> league_lms_settle
  //   league_settle_duels_on_snapshot  on league_matchweeks -> league_score_duels
  //
  // So completing MW3 settles both engines the moment it happens. Retiring
  // afterwards settles everything while the retirees are still active and the
  // explicit RPCs below then find `settled_at IS NOT NULL` / a closed round and
  // do nothing — the phases would reproduce the symptom by accident and STILL
  // FAIL after 134, for a reason that has nothing to do with the fix.
  //
  // This order is the real one anyway: someone leaves during the week, and then
  // the games are played.
  const rb = await retireEntries(admin, { entryIds: [LEAVES] }, 'stopped', ADMIN_USER)
  if (rb.error) bad('retire the duellist', rb.error)
  else ok('one duellist stopped participating', 'before kickoff — membership kept')

  // ⚠ retireEntries REGENERATES THE DUEL SCHEDULE. With fewer than two entries
  // left it deletes every unsettled duel; above that it re-pairs, but spares
  // the open matchweek's existing duels (migration 118). That sparing is what
  // leaves a drawn duel still naming someone who has gone — the whole reason
  // this phase can exist. If it ever stops sparing, this check says so rather
  // than the phase quietly passing on a duel that no longer exists.
  const stillDrawn = await must('duel survived the regen', admin.from('league_duels')
    .select('duel_id').eq('pool_id', POOL_SD).eq('duel_id', pair.duel_id))
  eq('the drawn duel survived retirement', (stillDrawn ?? []).length, 1)

  const retireWinner = await retireEntries(admin, { entryIds: [LMS_ENTRY(1)] }, 'stopped', ADMIN_USER)
  if (retireWinner.error) bad('retire survivor 1', retireWinner.error)
  else ok('survivor 1 stopped participating', 'their club is about to win — pre-134 this crowns them')

  // ⚠ MEASURE THE DELTA, AND CAPTURE IT BEFORE THE FOOTBALL.
  // `league_entry_totals.duel_points` is a SEASON sum recomputed from every
  // settled duel, so the raw total also carries MW1 and MW2 — which settled as
  // 0-0 ties back in phases 1-3. And because settlement is trigger-driven,
  // reading "before" any later than this reads a value MW3 has already changed,
  // which is how this assertion first came back as a flat 0.
  const duelPointsFor = async (entry: string) => {
    const rows = await must('duel points', admin.from('league_entry_totals')
      .select('duel_points').eq('entry_id', entry))
    return ((rows ?? []) as Array<{ duel_points: number | null }>)[0]?.duel_points ?? 0
  }
  const aBefore = await duelPointsFor(STAYS)

  // Fixtures first (fires the LMS trigger), then accuracy, then the matchweek
  // rollup (fires the duel trigger) — the production order, so duels settle
  // against scores that exist rather than against zeroes.
  await playMatchweek3()
  await scoreFixtures([9, 10])

  await must('settle duels', admin.rpc('league_score_duels', {
    p_pool_id: POOL_SD, p_matchweek_number: 3,
  }) as never)

  const duels = await must('duel row', admin.from('league_duels')
    .select('entry_a, entry_b, points_a, points_b, accuracy_a, accuracy_b')
    .eq('duel_id', pair.duel_id))
  const duel = ((duels ?? []) as Array<{
    entry_a: string; entry_b: string | null
    points_a: number | null; points_b: number | null
    accuracy_a: number | null; accuracy_b: number | null
  }>)[0]

  if (!duel) {
    bad('a duel was drawn for MW3', 'no row — check league_generate_duel_schedule')
  } else {
    const aIsA = duel.entry_a === STAYS
    const stayedPts = aIsA ? duel.points_a : duel.points_b
    const leftPts = aIsA ? duel.points_b : duel.points_a
    const stayedAcc = aIsA ? duel.accuracy_a : duel.accuracy_b

    note(`the stayer scored ${stayedAcc ?? 0} on picks; the leaver filed none`)
    expectedBy134('the member who stayed gets the BYE rate, not the win rate', stayedPts, DUEL_BYE)
    if (stayedPts === DUEL_WIN) {
      note('beating a ghost paid 500 — an advantage decided by an admin action, not by football')
    }
    expectedBy134('the member who left scores nothing from the duel', leftPts, 0)
  }

  // What MW3 actually added to the season total. A retiree KEEPS an existing
  // totals row — the INSERT filters them out of future writes rather than
  // deleting what is there — so "does B have a row" proves nothing either way.
  const aAfter = await duelPointsFor(STAYS)
  expectedBy134('and the matchweek adds a bye to the season total, not a win',
    aAfter - aBefore, DUEL_BYE)

  // ---------------------------------------------------------------- phase 7
  head('7. Last Man Standing — a member who left cannot be crowned (migration 134)')

  // The round was opened and picked in phase 6, BEFORE the football — see the
  // silent-skip note there. It is retired mid-round here, which is the only
  // order that reproduces the bug: `league_lms_open_round` already filters
  // retired_at when it enrols, so a member who leaves before the round starts
  // is handled correctly today.
  //
  // The one whose club WON is the one who left. Without 134 they are the last
  // one standing and the round is theirs.
  //
  // The settle below is belt and braces: the fixture-complete trigger has
  // almost certainly run it already. Harmless either way — a closed round is
  // never re-entered (`last_matchweek IS NOT NULL`).
  await must('settle LMS', admin.rpc('league_lms_settle', {
    p_pool_id: POOL_LMS, p_matchweek: 3,
  }) as never)

  const settled = await must('survivors after settle', admin.from('league_lms_survivors')
    .select('entry_id, eliminated_matchweek, is_winner').eq('round_id', roundId))
  const byEntry = new Map(
    ((settled ?? []) as Array<{ entry_id: string; eliminated_matchweek: number | null; is_winner: boolean }>)
      .map((r) => [r.entry_id, r]),
  )
  const gone = byEntry.get(LMS_ENTRY(1))

  expectedBy134('THE MEMBER WHO LEFT IS NOT CROWNED', gone?.is_winner, false)

  // The other half of 134, and the reason the fix is a read-time filter rather
  // than a write: leaving and being knocked out are different facts, and
  // Decision 15 restores a season IN FULL. Marking the survivor row eliminated
  // would erase which one happened and a restore could not tell them apart.
  eq('and is NOT marked eliminated — they left, football did not beat them',
    gone?.eliminated_matchweek, null)

  // ⚠ COUNT ONLY THE ENTRIES STILL COMPETING. A bare `is_winner` count is
  // satisfied by the retiree themselves, so it passes today for the exact
  // reason this phase exists to catch. Post-134 the retiree drops out of
  // `standing`, both remaining entries go out together on the same matchweek,
  // and the all-out branch gives them the round to share.
  const crownedStillIn = [LMS_ENTRY(2), LMS_ENTRY(3)]
    .filter((id) => byEntry.get(id)?.is_winner).length
  if (crownedStillIn > 0) ok('the round resolved among those still competing', `${crownedStillIn} winner(s)`)
  else bad('the round resolved among those still competing', `nobody still in the round was crowned — ${BY_134}`)

  // The sharpest symptom of the original bug: the rounds_won INSERT ALREADY
  // filtered retired, so crowning a retiree closed the round and credited the
  // win to nobody at all.
  const lmsTotals = await must('lms totals', admin.from('league_entry_totals')
    .select('entry_id, rounds_won').in('entry_id', [LMS_ENTRY(2), LMS_ENTRY(3)]))
  const wonSum = ((lmsTotals ?? []) as Array<{ rounds_won: number | null }>)
    .reduce((n, r) => n + (r.rounds_won ?? 0), 0)
  if (wonSum > 0) ok('and rounds_won reached an entry that can hold it', `total ${wonSum}`)
  else bad('and rounds_won reached an entry that can hold it',
           `total 0 — the round closed and the credit went nowhere. ${BY_134}`)
}

async function teardown() {
  head('Teardown')
  // pool_entries.pool_id -> pools ON DELETE CASCADE, so the pool takes the
  // entry, its predictions and its totals with it even while detached.
  //
  // All three pools, and the detached-entry delete FIRST for each: a detached
  // entry has member_id NULL, so deleting the membership would not reach it and
  // only the pool_id FK can.
  for (const pid of [POOL, POOL_SD, POOL_LMS]) {
    await admin.from('pool_entries').delete().eq('pool_id', pid)
    await admin.from('pools').delete().eq('pool_id', pid)
  }
  await admin.from('league_seasons').delete().eq('season_id', SEASON)
  await admin.from('tournaments').delete().eq('tournament_id', TOURNAMENT)

  // ⚠ EVERY new table a phase writes to belongs here. A teardown that deletes
  // the pool but never checks the child table reports success while leaving
  // rows behind — the leak check is the only thing that would catch that, and
  // it can only catch what it is told to look at.
  const left: string[] = []
  for (const [t, col, val] of [
    ['pools', 'pool_id', POOL], ['pool_members', 'pool_id', POOL],
    ['pool_entries', 'pool_id', POOL], ['league_predictions', 'entry_id', ENTRY],
    ['league_entry_totals', 'entry_id', ENTRY], ['league_match_scores', 'entry_id', ENTRY],
    ['league_seasons', 'season_id', SEASON], ['league_clubs', 'season_id', SEASON],
    ['league_matchweeks', 'season_id', SEASON], ['league_fixtures', 'season_id', SEASON],
    ['tournaments', 'tournament_id', TOURNAMENT],
    // phase 6 — showdown
    ['pools', 'pool_id', POOL_SD], ['pool_members', 'pool_id', POOL_SD],
    ['pool_entries', 'pool_id', POOL_SD], ['league_duels', 'pool_id', POOL_SD],
    ['league_entry_totals', 'entry_id', SD_ENTRY(1)],
    ['league_entry_totals', 'entry_id', SD_ENTRY(2)],
    ['league_entry_totals', 'entry_id', SD_ENTRY(3)],
    ['league_entry_totals', 'entry_id', SD_ENTRY(4)],
    // phase 7 — last man standing
    ['pools', 'pool_id', POOL_LMS], ['pool_members', 'pool_id', POOL_LMS],
    ['pool_entries', 'pool_id', POOL_LMS], ['league_lms_rounds', 'pool_id', POOL_LMS],
    ['league_entry_totals', 'entry_id', LMS_ENTRY(1)],
    ['league_entry_totals', 'entry_id', LMS_ENTRY(2)],
    ['league_entry_totals', 'entry_id', LMS_ENTRY(3)],
  ] as const) {
    const { count } = await admin.from(t).select('*', { count: 'exact', head: true }).eq(col, val)
    if ((count ?? 0) > 0) left.push(`${t}=${count}`)
  }
  if (left.length) bad('scratch data fully removed', left.join(', '))
  else ok('scratch data fully removed', 'production is exactly as it was found')
}

;(async () => {
  console.log('\n' + '='.repeat(70))
  console.log('  056 — does an entry survive being removed?')
  console.log('  134 — and can a member who left still win something?')
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
