// =============================================================
// verify-league-leaderboard — ranks, movement arrows, and the outbox
// =============================================================
// Migrations 059 + 060. Before them a league leaderboard had totals and nothing
// else: ZERO rows in the whole database carried a `final_rank`, so there was no
// position, no movement arrow, and nothing broadcast. Members had to refresh.
//
// This drives the real engine (`league_score_fixture`) against a scratch season
// and asserts what a member would actually see.
//
// ## What it can and cannot prove
//
// It CAN prove: ranks are written in Decision 9's cascade order, the tiebreaker
// resolves, retired and detached entries are excluded and cleared, the weekly
// arrow snapshots exactly once, and the outbox gets one row per unit of work.
//
// It CANNOT prove a browser received a realtime message. It proves the trigger
// fires without error and the write path completes; the other half needs two
// tabs and a person.
//
//   npx tsx scripts/verify-league-leaderboard.ts
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
import { retireEntries } from '../lib/entries/retire'

const admin = createAdminClient()

const S = 'dd059000-0000-4000-8000-'
const SEASON = `${S}000000000001`
const POOL = `${S}000000000002`
const MEMBER = `${S}000000000003`
const MW = (n: number) => `${S}00000000001${n}`
const CLUB = (n: number) => `${S}00000000002${n}`
const FIX = (n: number) => `${S}00000000003${n}`
const ENTRY = (n: number) => `${S}00000000004${n}`

// Four entries under ONE membership, so ranking is real without inventing users.
// max_entries_per_user is raised on the scratch pool to allow it.
const ENTRIES = [1, 2, 3, 4]
let ADMIN_USER = ''

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

type Row = { entry_id: string; total_points: number; final_rank: number | null; previous_final_rank: number | null }

async function board(): Promise<Row[]> {
  const rows = await must('totals', admin.from('league_entry_totals')
    .select('entry_id, total_points, final_rank, previous_final_rank').eq('pool_id', POOL))
  return (rows ?? []) as Row[]
}
const byEntry = (rows: Row[], n: number) => rows.find((r) => r.entry_id === ENTRY(n))

async function score(nums: number[]) {
  for (const n of nums) {
    const { error } = await admin.rpc('league_score_fixture', { p_fixture_id: FIX(n) })
    if (error) throw new Error(`score ${n}: ${error.message}`)
  }
}

async function completeMw(mw: string, nums: number[], h: number, a: number) {
  for (const n of nums) {
    const { error } = await admin.from('league_fixtures').update({
      home_goals: h, away_goals: a, is_completed: true,
      status: 'completed', completed_at: new Date().toISOString(),
    }).eq('fixture_id', FIX(n))
    if (error) throw new Error(`complete ${n}: ${error.message}`)
  }
  const { error } = await admin.from('league_matchweeks')
    .update({ completed_fixture_count: nums.length }).eq('matchweek_id', mw)
  if (error) throw new Error(`rollup: ${error.message}`)
}

async function outboxCount(kind?: string): Promise<number> {
  let q = admin.from('league_score_events').select('*', { count: 'exact', head: true }).eq('pool_id', POOL)
  if (kind) q = q.eq('kind', kind)
  const { count, error } = await q
  if (error) throw new Error(`outbox: ${error.message}`)
  return count ?? 0
}

async function setup() {
  head('Setup — four entries, deliberately unequal')

  const users = await must('admin user',
    admin.from('users').select('user_id').eq('username', 'IZZETmagic').limit(1))
  ADMIN_USER = ((users ?? [])[0] as { user_id: string }).user_id

  const tp = await must('league tournament',
    admin.from('pools').select('tournament_id').not('league_season_id', 'is', null).limit(1))
  const tournamentId = ((tp ?? [])[0] as { tournament_id: string }).tournament_id

  const future = new Date(Date.now() + 90 * 864e5).toISOString()

  await must('season', admin.from('league_seasons').insert({
    season_id: SEASON, competition_slug: 'scratch-059', competition_name: 'Scratch 059',
    season_label: '2026/2027', season_start_year: 2026, country_code: 'GB',
    club_count: 4, matchweek_count: 2, external_provider: 'scratch',
    external_league_id: -59, external_season: -2026, regular_season_phase: 'regular',
  }).select('season_id'))

  await must('clubs', admin.from('league_clubs').insert(
    [1, 2, 3, 4].map((n) => ({
      club_id: CLUB(n), season_id: SEASON, name: `Scratch FC ${n}`,
      short_name: `SFC${n}`, abbreviation: `S${n}`, external_club_id: -590 - n,
    })),
  ).select('club_id'))

  await must('matchweeks', admin.from('league_matchweeks').insert(
    [1, 2].map((n) => ({
      matchweek_id: MW(n), season_id: SEASON, matchweek_number: n, label: `MW${n}`,
      provider_round: `r${n}`, fixture_count: 2, completed_fixture_count: 0, lock_at: future,
    })),
  ).select('matchweek_id'))

  await must('fixtures', admin.from('league_fixtures').insert(
    [1, 2, 3, 4].map((n) => ({
      fixture_id: FIX(n), season_id: SEASON, matchweek_id: MW(n <= 2 ? 1 : 2),
      fixture_number: n, home_club_id: CLUB(1), away_club_id: CLUB(2),
      kickoff_at: future, status: 'scheduled', is_completed: false,
      external_fixture_id: `scratch-059-${n}`,
    })),
  ).select('fixture_id'))

  await must('pool', admin.from('pools').insert({
    pool_id: POOL, tournament_id: tournamentId, admin_user_id: ADMIN_USER,
    pool_name: '__scratch 059 leaderboard (auto-deleted)', prediction_deadline: future,
    status: 'open', prediction_mode: 'league_pickem', league_season_id: SEASON,
    max_entries_per_user: 10,
  }).select('pool_id'))

  await must('membership', admin.from('pool_members').insert({
    member_id: MEMBER, pool_id: POOL, user_id: ADMIN_USER, role: 'admin',
  }).select('member_id'))

  // Entries are inserted ONE AT A TIME, oldest first. Entry 3 and entry 4 are
  // built to tie on every scoring rung, so rung 5 — first pick — is the only
  // thing that can separate them.
  for (const n of ENTRIES) {
    await must(`entry ${n}`, admin.from('pool_entries').insert({
      entry_id: ENTRY(n), member_id: MEMBER, entry_name: `Entry ${n}`, entry_number: n,
    }).select('entry_id'))
  }

  // MW1 finishes 2-0 twice. Picks are chosen to produce a clean 4-way order:
  //   e1  2-0 exact      -> 100 + 100 = 200
  //   e2  3-1 winner_gd  ->  75 +  75 = 150
  //   e3  1-0 winner     ->  50 +  50 = 100
  //   e4  1-0 winner     ->  50 +  50 = 100   (ties e3 on every rung)
  const PICKS: Record<number, [number, number]> = { 1: [2, 0], 2: [3, 1], 3: [1, 0], 4: [1, 0] }
  for (const n of ENTRIES) {
    const [h, a] = PICKS[n]
    await must(`picks ${n}`, admin.from('league_predictions').insert(
      [1, 2].map((f) => ({
        entry_id: ENTRY(n), fixture_id: FIX(f),
        predicted_home_score: h, predicted_away_score: a,
      })),
    ).select('prediction_id'))
  }
  ok('four entries with MW1 picks', 'e1 exact · e2 gd · e3 and e4 identical')
}

async function run() {
  // ---------------------------------------------------------------- ranks
  head('1. Ranks — Decision 9’s cascade')
  await completeMw(MW(1), [1, 2], 2, 0)
  await score([1, 2])

  const b1 = await board()
  eq('e1 — most points — is 1st', byEntry(b1, 1)?.final_rank, 1)
  eq('e2 is 2nd', byEntry(b1, 2)?.final_rank, 2)
  note(`points: ${ENTRIES.map((n) => `e${n}=${byEntry(b1, n)?.total_points}`).join(' · ')}`)

  // e3 and e4 tie on points, exacts, corrects and bonuses. Only rung 5 —
  // MIN(league_predictions.created_at) — can separate them, and e3 picked first.
  eq('the tie is broken by who picked first — e3 ahead of e4', byEntry(b1, 3)?.final_rank, 3)
  eq('...and e4 takes 4th', byEntry(b1, 4)?.final_rank, 4)

  const ranks = b1.map((r) => r.final_rank).filter((r) => r !== null).sort()
  eq('ranks are 1..4 with no gaps and no duplicates', ranks.join(','), '1,2,3,4')

  // ---------------------------------------------------------------- outbox
  head('2. The outbox has a producer')
  eq('one event per fixture scored', await outboxCount('fixture_scored'), 2)
  await score([1, 2])
  eq('a re-score does NOT queue the same work twice', await outboxCount('fixture_scored'), 2)
  note('the partial unique index makes the producer idempotent')

  // Migration 069. MW1 finished and was fully scored in section 1, which is the
  // one moment a matchweek is genuinely done — and the snapshot function that
  // already fires exactly once there now queues the "results are in" event.
  eq('finishing a matchweek queues ONE results-are-in event', await outboxCount('matchweek_completed'), 1)
  await score([1])
  eq('...and re-scoring it does not queue another', await outboxCount('matchweek_completed'), 1)
  note('matchweek events carry matchweek_id, not fixture_id — migration 067')

  // ------------------------------------------------------- retired entries
  head('3. A retired entry leaves the order — no gap where it was')
  const r = await retireEntries(admin, { entryIds: [ENTRY(2)] }, 'stopped', ADMIN_USER)
  if (r.error) bad('retireEntries', r.error)
  await score([1])

  const b2 = await board()
  eq('the retired entry has NO rank', byEntry(b2, 2)?.final_rank, null)
  eq('its previous_final_rank is cleared too', byEntry(b2, 2)?.previous_final_rank, null)
  eq('e1 still 1st', byEntry(b2, 1)?.final_rank, 1)
  eq('e3 MOVES UP into the vacated place', byEntry(b2, 3)?.final_rank, 2)
  eq('e4 follows', byEntry(b2, 4)?.final_rank, 3)
  const live = b2.map((r2) => r2.final_rank).filter((x) => x !== null).sort()
  eq('the visible order is 1..3 — no hole', live.join(','), '1,2,3')
  eq('its points are RETAINED, not zeroed', byEntry(b2, 2)?.total_points, 150)

  // put it back so the arrow test has a full field
  await must('unretire', admin.from('pool_entries')
    .update({ retired_at: null, retired_reason: null, retired_by: null })
    .eq('entry_id', ENTRY(2)).select('entry_id'))
  await score([1])

  // ---------------------------------------------------------- the arrow
  head('4. The weekly movement arrow')

  // MW1 was completed AND fully scored back in section 1, so it has already
  // frozen its arrows. previous_final_rank now holds the end-of-MW1 standing,
  // which is what MW2's arrows will be measured against.
  const mw1 = await must('mw1 row', admin.from('league_matchweeks')
    .select('ranks_snapshot_at').eq('matchweek_id', MW(1)))
  const snap1 = ((mw1 ?? [])[0] as { ranks_snapshot_at: string | null })?.ranks_snapshot_at
  if (snap1) ok('MW1 froze its arrows once it was fully scored')
  else bad('MW1 froze its arrows once it was fully scored', 'ranks_snapshot_at is null')

  await must('MW2 picks', admin.from('league_predictions').insert(
    ENTRIES.map((n) => ({
      entry_id: ENTRY(n), fixture_id: FIX(3),
      predicted_home_score: n === 1 ? 0 : 1, predicted_away_score: n === 1 ? 3 : 0,
    })),
  ).select('prediction_id'))

  // THE MIGRATION 061 CASE. Mark BOTH of MW2's fixtures complete — which is what
  // really happens when several 3pm kickoffs finish together — but score only
  // one. The matchweek now LOOKS complete while half its points are still
  // uncounted, and the arrow must not freeze against a standing nobody saw.
  await completeMw(MW(2), [3, 4], 0, 3)
  await score([3])

  const mid = await must('mw2 mid', admin.from('league_matchweeks')
    .select('ranks_snapshot_at').eq('matchweek_id', MW(2)))
  const snapMid = ((mid ?? [])[0] as { ranks_snapshot_at: string | null })?.ranks_snapshot_at
  eq('a half-scored matchweek does NOT freeze the arrows', snapMid, null)
  note('complete ≠ scored — league_fixture_state is the witness (migration 061)')

  // Now finish scoring it.
  await score([4])
  const done = await must('mw2 done', admin.from('league_matchweeks')
    .select('ranks_snapshot_at').eq('matchweek_id', MW(2)))
  const snap2 = ((done ?? [])[0] as { ranks_snapshot_at: string | null })?.ranks_snapshot_at
  if (snap2) ok('once every fixture is scored, the arrows freeze')
  else bad('once every fixture is scored, the arrows freeze', 'still null')

  const b3 = await board()
  const withPrev = b3.filter((x) => x.previous_final_rank !== null).length
  eq('every competing entry carries a previous rank', withPrev, 4)

  // idempotency — the snapshot must never run twice for the same matchweek
  await score([3])
  const again = await must('mw2 again', admin.from('league_matchweeks')
    .select('ranks_snapshot_at').eq('matchweek_id', MW(2)))
  eq('re-scoring does not re-snapshot', ((again ?? [])[0] as { ranks_snapshot_at: string }).ranks_snapshot_at, snap2)

  // --------------------------------------------------------------- drain
  head('5. The outbox drains')

  const pendingBefore = await outboxCount()
  if (pendingBefore > 0) ok('there is work on the queue', `${pendingBefore} events`)
  else bad('there is work on the queue', 'nothing to drain — the producer did not fire')

  // Claim. This is the half PostgREST cannot express: FOR UPDATE SKIP LOCKED.
  const claimed = await must('claim', admin.rpc('league_claim_score_events', { p_limit: 100 }))
  const rows = (claimed ?? []) as Array<{ event_id: number; pool_id: string; attempts: number }>
  const mine = rows.filter((r) => r.pool_id === POOL)
  eq('claiming returns the pending events', mine.length, pendingBefore)
  eq('every claim increments attempts', mine.every((r) => r.attempts >= 1), true)

  // THE LOAD-BEARING ONE. A second run must not get the same rows, or two
  // overlapping crons do the same work twice — at kickoff, for every pool.
  const secondClaim = await must('second claim', admin.rpc('league_claim_score_events', { p_limit: 100 }))
  const mineAgain = ((secondClaim ?? []) as Array<{ pool_id: string }>).filter((r) => r.pool_id === POOL)
  eq('a second run claims NOTHING already in flight', mineAgain.length, 0)

  // Mark them done, the way the route does.
  await must('mark', admin.from('league_score_events')
    .update({ processed_at: new Date().toISOString(), last_error: null })
    .in('event_id', mine.map((r) => r.event_id)).select('event_id'))

  const stillPending = await must('pending', admin.from('league_score_events')
    .select('event_id').eq('pool_id', POOL).is('processed_at', null))
  eq('the queue is empty once processed', (stillPending ?? []).length, 0)

  // The unique index is PARTIAL (WHERE processed_at IS NULL), so a corrected
  // result can queue fresh work for the same fixture — which is what should
  // happen when a scoreline is amended after full time.
  await score([1])
  const requeued = await must('requeued', admin.from('league_score_events')
    .select('event_id').eq('pool_id', POOL).eq('fixture_id', FIX(1)).is('processed_at', null))
  eq('a later re-score CAN queue fresh work for the same fixture', (requeued ?? []).length, 1)
  note('the partial index dedupes only what is still PENDING — a correction must re-notify')

  // ------------------------------------------------------------- realtime
  head('6. The realtime broadcast fires')
  // Every score above wrote `league_entry_totals`, and the statement-level
  // trigger runs inside that write — so if `realtime.send` raised, the score
  // itself would have failed and we would never have reached here. That is a
  // real assertion, just a narrow one.
  ok('scoring completed with the broadcast trigger attached', 'no error raised inside the write')
  note('What this does NOT prove: that a browser received the message.')
  note('That needs two tabs and a person — it stays on the human checklist.')
}

async function teardown() {
  head('Teardown')
  await admin.from('pool_entries').delete().eq('pool_id', POOL)
  await admin.from('pools').delete().eq('pool_id', POOL)
  await admin.from('league_seasons').delete().eq('season_id', SEASON)

  const left: string[] = []
  for (const [t, col, val] of [
    ['pools', 'pool_id', POOL], ['pool_members', 'pool_id', POOL],
    ['pool_entries', 'pool_id', POOL], ['league_entry_totals', 'pool_id', POOL],
    ['league_score_events', 'pool_id', POOL],
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
  console.log('  Does the league leaderboard have a position, an arrow and a queue?')
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
