// =============================================================
// verify-league-notices — the three notifications get queued once, and once only
// =============================================================
// Migrations 067/068/069. The outbox now carries MATCHWEEK-level events, and
// three producers write them:
//
//   matchweek_opened     a new matchweek is open for picks
//   lock_reminder        it locks soon and you have not picked
//   matchweek_completed  it is played, scored, and here is where you finished
//
// ## The thing this is really testing
//
// "Once, and only once." A notification that fires twice is the difference
// between a product telling you something and a product nagging you — and the
// disclosure gate in CLAUDE.md only lets the lock reminder exist BECAUSE it is
// once, and only to people who have not picked. `open_notified_at` and
// `lock_reminder_sent_at` have sat unused on `league_matchweeks` since migration
// 050 for exactly this; they are the guard, and this proves they hold.
//
// Archived pools are checked too: a pool nobody can open should not be emailing
// anybody.
//
//   npx tsx scripts/verify-league-notices.ts
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

const S = 'dd069000-0000-4000-8000-'
const SEASON = `${S}000000000001`
const POOL = `${S}000000000002`   // live
const ARCH = `${S}000000000003`   // archived — must receive nothing
const MEM = `${S}000000000004`
const ENTRY = `${S}000000000005`
const MW = (n: number) => `${S}00000000001${n}`
const CLUB = (n: number) => `${S}00000000002${n}`
const FIX = (n: number) => `${S}00000000003${n}`

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

async function events(kind: string, poolId = POOL): Promise<number> {
  const { count, error } = await admin.from('league_score_events')
    .select('*', { count: 'exact', head: true }).eq('pool_id', poolId).eq('kind', kind)
  if (error) throw new Error(`events: ${error.message}`)
  return count ?? 0
}

/**
 * SCOPED TO THE SCRATCH SEASON, and that is not a convenience.
 *
 * Migration 069's first version could only run globally. The first run of this
 * script therefore queued real `matchweek_opened` events for both production
 * pools and stamped the real season's matchweek. Nothing was sent and it was
 * reversed — but a producer whose whole job is emailing people must be
 * exercisable without touching them, so migration 070 added the season scope.
 */
async function queue(): Promise<{ opened: number; reminded: number }> {
  const { data, error } = await admin.rpc('league_queue_matchweek_notices', {
    p_season_id: SEASON,
  })
  if (error) throw new Error(`queue: ${error.message}`)
  return data as { opened: number; reminded: number }
}

async function mwRow(n: number) {
  const rows = await must('mw', admin.from('league_matchweeks')
    .select('open_notified_at, lock_reminder_sent_at, ranks_snapshot_at').eq('matchweek_id', MW(n)))
  return (rows ?? [])[0] as {
    open_notified_at: string | null
    lock_reminder_sent_at: string | null
    ranks_snapshot_at: string | null
  }
}

async function setup() {
  head('Setup — a live pool and an archived one on the same season')

  const users = await must('admin user',
    admin.from('users').select('user_id').eq('username', 'IZZETmagic').limit(1))
  const adminUser = ((users ?? [])[0] as { user_id: string }).user_id
  const tp = await must('league tournament',
    admin.from('pools').select('tournament_id').not('league_season_id', 'is', null).limit(1))
  const tournamentId = ((tp ?? [])[0] as { tournament_id: string }).tournament_id
  const far = new Date(Date.now() + 90 * 864e5).toISOString()

  await must('season', admin.from('league_seasons').insert({
    season_id: SEASON, competition_slug: 'scratch-069', competition_name: 'Scratch 069',
    season_label: '2026/2027', season_start_year: 2026, country_code: 'GB',
    club_count: 4, matchweek_count: 2, external_provider: 'scratch',
    external_league_id: -69, external_season: -2026, regular_season_phase: 'regular',
  }).select('season_id'))

  await must('clubs', admin.from('league_clubs').insert(
    [1, 2, 3, 4].map((n) => ({
      club_id: CLUB(n), season_id: SEASON, name: `Scratch FC ${n}`,
      short_name: `SFC${n}`, abbreviation: `S${n}`, external_club_id: -690 - n,
    })),
  ).select('club_id'))

  await must('matchweeks', admin.from('league_matchweeks').insert(
    [1, 2].map((n) => ({
      matchweek_id: MW(n), season_id: SEASON, matchweek_number: n, label: `MW${n}`,
      provider_round: `r${n}`, fixture_count: 1, completed_fixture_count: 0, lock_at: far,
    })),
  ).select('matchweek_id'))

  await must('fixtures', admin.from('league_fixtures').insert(
    [1, 2].map((n) => ({
      fixture_id: FIX(n), season_id: SEASON, matchweek_id: MW(n), fixture_number: n,
      home_club_id: CLUB(1), away_club_id: CLUB(2), kickoff_at: far,
      status: 'scheduled', is_completed: false, external_fixture_id: `scratch-069-${n}`,
    })),
  ).select('fixture_id'))

  for (const [pid, archived] of [[POOL, null], [ARCH, new Date().toISOString()]] as const) {
    await must('pool', admin.from('pools').insert({
      pool_id: pid, tournament_id: tournamentId, admin_user_id: adminUser,
      pool_name: `__scratch 069 ${archived ? 'archived' : 'live'} (auto-deleted)`,
      prediction_deadline: far, status: 'open', prediction_mode: 'league_pickem',
      league_season_id: SEASON, league_depth: 'scores', archived_at: archived,
    }).select('pool_id'))
  }

  await must('membership', admin.from('pool_members').insert({
    member_id: MEM, pool_id: POOL, user_id: adminUser, role: 'admin',
  }).select('member_id'))
  await must('entry', admin.from('pool_entries').insert({
    entry_id: ENTRY, member_id: MEM, entry_name: 'Notice Entry', entry_number: 1,
  }).select('entry_id'))
  ok('one live pool, one archived, both on the same season')
}

async function run() {
  head('1. "Matchweek 1 is open"')
  const first = await queue()
  eq('one pool announced', first.opened, 1)
  eq('the live pool has the event', await events('matchweek_opened'), 1)
  const m1 = await mwRow(1)
  if (m1.open_notified_at) ok('open_notified_at is stamped', 'the once-only guard')
  else bad('open_notified_at is stamped', 'still null — it would announce again next run')

  eq('the ARCHIVED pool gets nothing', await events('matchweek_opened', ARCH), 0)
  note('a pool nobody can open should not be emailing anybody')

  head('2. Running again announces nothing')
  const second = await queue()
  eq('no second announcement', second.opened, 0)
  eq('still exactly one event', await events('matchweek_opened'), 1)
  note('this is the whole test — a notification that fires twice is nagging')

  head('3. "It locks soon and you have not picked"')
  eq('nothing due while the lock is 90 days out', await events('lock_reminder'), 0)

  // Bring the lock inside the window.
  await must('move lock', admin.from('league_matchweeks')
    .update({ lock_at: new Date(Date.now() + 6 * 3600e3).toISOString() })
    .eq('matchweek_id', MW(1)).select('matchweek_id'))

  const third = await queue()
  eq('the reminder is queued', third.reminded, 1)
  eq('the live pool has it', await events('lock_reminder'), 1)
  const m1b = await mwRow(1)
  if (m1b.lock_reminder_sent_at) ok('lock_reminder_sent_at is stamped')
  else bad('lock_reminder_sent_at is stamped', 'still null')
  eq('the archived pool still gets nothing', await events('lock_reminder', ARCH), 0)

  const fourth = await queue()
  eq('and it never repeats', fourth.reminded, 0)
  eq('still exactly one reminder', await events('lock_reminder'), 1)
  note('"only once" is enforced here; "only to those who have not picked" is')
  note('the consumer\'s job, because that is a per-member fact')

  head('4. "Results are in"')
  eq('nothing yet — the matchweek has not been played', await events('matchweek_completed'), 0)

  await must('play it', admin.from('league_fixtures').update({
    home_goals: 2, away_goals: 0, is_completed: true, status: 'completed',
    completed_at: new Date().toISOString(),
  }).eq('fixture_id', FIX(1)).select('fixture_id'))
  await must('rollup', admin.from('league_matchweeks')
    .update({ completed_fixture_count: 1 }).eq('matchweek_id', MW(1)).select('matchweek_id'))

  const scored = await admin.rpc('league_score_fixture', { p_fixture_id: FIX(1) })
  if (scored.error) throw new Error(`score: ${scored.error.message}`)

  eq('finishing the matchweek queues it', await events('matchweek_completed'), 1)
  eq('the archived pool gets nothing', await events('matchweek_completed', ARCH), 0)

  await admin.rpc('league_score_fixture', { p_fixture_id: FIX(1) })
  eq('re-scoring does not queue a second', await events('matchweek_completed'), 1)
  note('it rides on the snapshot function, which already fires exactly once')

  head('5. One definition of "open", not three')
  // Migration 069 extracted the rule; the trigger and this producer now call it.
  const openNow = await must('open mw', admin.rpc('league_open_matchweek', { p_season_id: SEASON }))
  eq('MW1 is finished, so MW2 is now the open one', openNow, MW(2))
  const fifth = await queue()
  eq('and MW2 gets announced on the next run', fifth.opened, 1)
  eq('two announcements across the season so far', await events('matchweek_opened'), 2)
  note('the rhythm moved on its own — no cron opened anything, the clock did')
}

async function teardown() {
  head('Teardown')
  for (const pid of [POOL, ARCH]) {
    await admin.from('pool_entries').delete().eq('pool_id', pid)
    await admin.from('pools').delete().eq('pool_id', pid)
  }
  await admin.from('league_seasons').delete().eq('season_id', SEASON)

  const left: string[] = []
  for (const [t, col, val] of [
    ['pools', 'pool_id', POOL], ['pools', 'pool_id', ARCH],
    ['league_score_events', 'pool_id', POOL], ['league_score_events', 'pool_id', ARCH],
    ['league_seasons', 'season_id', SEASON], ['league_matchweeks', 'season_id', SEASON],
  ] as const) {
    const { count } = await admin.from(t).select('*', { count: 'exact', head: true }).eq(col, val)
    if ((count ?? 0) > 0) left.push(`${t}=${count}`)
  }
  if (left.length) bad('scratch data fully removed', left.join(', '))
  else ok('scratch data fully removed', 'production is exactly as it was found')
}

;(async () => {
  console.log('\n' + '='.repeat(70))
  console.log('  Do the three notifications fire once, and only once?')
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
      console.log(`      by hand: delete from pools where pool_id in ('${POOL}','${ARCH}');`)
      console.log(`               delete from league_seasons where season_id='${SEASON}';`)
    }
  }
  console.log('\n' + '='.repeat(70))
  console.log(failures === 0 ? '  All checks passed.' : `  ${failures} CHECK(S) FAILED.`)
  console.log('='.repeat(70) + '\n')
  process.exit(failures === 0 ? 0 : 1)
})()
