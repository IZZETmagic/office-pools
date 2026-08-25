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
import { retireEntries, restoreEntriesForMember, rescoreRestoredEntries } from '../lib/entries/retire'
import { readEntryScoring } from '../lib/scoring/readSource'

const admin = createAdminClient()

// --- scratch namespace: every id starts dd056 so strays are greppable -------
const S = 'dd056000-0000-4000-8000-'
const SEASON = `${S}000000000001`
const POOL = `${S}000000000002`
const MEMBER1 = `${S}000000000003`
const MEMBER2 = `${S}000000000004`
const ENTRY = `${S}000000000005`
const MW1 = `${S}000000000010`
const MW2 = `${S}000000000011`
const CLUB = (n: number) => `${S}0000000002${n}0`
const FIX = (n: number) => `${S}0000000003${n}0`

const EXACT = 100 // pool_settings absent -> league_score_fixture COALESCE default
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

async function scoreFixtures(nums: number[]) {
  for (const n of nums) {
    const { error } = await admin.rpc('league_score_fixture', { p_fixture_id: FIX(n) })
    if (error) throw new Error(`score fixture ${n}: ${error.message}`)
  }
}

async function setup() {
  head('Setup — an isolated scratch season and pool')

  const users = await must('admin user',
    admin.from('users').select('user_id').eq('username', 'IZZETmagic').limit(1))
  ADMIN_USER = ((users ?? [])[0] as { user_id: string }).user_id

  const tp = await must('league tournament',
    admin.from('pools').select('tournament_id').not('league_season_id', 'is', null).limit(1))
  const tournamentId = ((tp ?? [])[0] as { tournament_id: string }).tournament_id

  const future = new Date(Date.now() + 90 * 864e5).toISOString()

  await must('season', admin.from('league_seasons').insert({
    season_id: SEASON, competition_slug: 'scratch-056', competition_name: 'Scratch 056',
    season_label: '2026/2027', season_start_year: 2026, country_code: 'GB',
    club_count: 4, matchweek_count: 2, external_provider: 'scratch',
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
  ]).select('matchweek_id'))

  // 1-4 in MW1, 5-8 in MW2. Pairings just have to differ home vs away.
  const fixtures = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    fixture_id: FIX(n), season_id: SEASON,
    matchweek_id: n <= PER_MW ? MW1 : MW2, fixture_number: n,
    home_club_id: CLUB(((n - 1) % 4) + 1), away_club_id: CLUB(((n + 1) % 4) + 1),
    kickoff_at: future, status: 'scheduled', is_completed: false,
    external_fixture_id: `scratch-056-${n}`,
  }))
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
}

async function teardown() {
  head('Teardown')
  // pool_entries.pool_id -> pools ON DELETE CASCADE, so the pool takes the
  // entry, its predictions and its totals with it even while detached.
  await admin.from('pool_entries').delete().eq('pool_id', POOL)
  await admin.from('pools').delete().eq('pool_id', POOL)
  await admin.from('league_seasons').delete().eq('season_id', SEASON)

  const left: string[] = []
  for (const [t, col, val] of [
    ['pools', 'pool_id', POOL], ['pool_members', 'pool_id', POOL],
    ['pool_entries', 'pool_id', POOL], ['league_predictions', 'entry_id', ENTRY],
    ['league_entry_totals', 'entry_id', ENTRY], ['league_match_scores', 'entry_id', ENTRY],
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
  console.log('  Migration 056 — does an entry really survive being removed?')
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
