// =============================================================
// verify-competition-consistency — migration 111's trigger, exercised
// =============================================================
// A pool carries BOTH `tournament_id` and `league_season_id` (migration 054b),
// and until 111 nothing enforced that they name the same competition. With one
// league that was unexpressible; with La Liga beside the Premier League it is a
// pool scored against Spain and scoped against England, silently, because
// `.eq('tournament_id', <wrong id>)` returns zero rows at HTTP 200.
//
// "The trigger exists" is not the assertion worth making. These are:
//
//   1. a matched pair INSERTS
//   2. a MISMATCHED pair is REFUSED  <- the whole point
//   3. a matched pair can be UPDATED to a mismatch and is REFUSED
//   4. a World Cup pool (no league season) is untouched
//   5. a same-triple tournament with the wrong `format` is REFUSED
//   6. a NULL tournament_id PASSES — deliberate, see 111's choice 2
//   7. every one of the REAL league pools still passes
//
//   npx tsx scripts/verify-competition-consistency.ts
//
// Exits 1 on any failure. Scratch rows, torn down in a `finally`.
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

let failures = 0
const ok = (m: string, x = '') => console.log(`    ✓ ${m}${x ? `  — ${x}` : ''}`)
const bad = (m: string, x = '') => { failures++; console.log(`    ✗ ${m}${x ? `  — ${x}` : ''}`) }
const note = (m: string) => console.log(`    · ${m}`)
const head = (m: string) => console.log(`\n  ${m}\n  ${'-'.repeat(70)}`)

// Scratch ids, in their own uuid block so a stray row is identifiable on sight.
const P = 'cc111000-0000-4000-8000-'
const hex = (n: number) => n.toString(16).padStart(12, '0')
const SEASON_A = `${P}${hex(1)}`   // "Spain"
const SEASON_B = `${P}${hex(2)}`   // "England"
const TOURN_A  = `${P}${hex(11)}`  // matches SEASON_A
const TOURN_B  = `${P}${hex(12)}`  // matches SEASON_B
const TOURN_X  = `${P}${hex(13)}`  // SEASON_A's triple, but format 'groups_knockout'
const POOL     = (n: number) => `${P}${hex(100 + n)}`

const ALL_POOLS = [1, 2, 3, 4, 5, 6].map(POOL)

/** The message 111 raises when the two ids name different competitions. */
const MISMATCH = /names two different competitions/i
const WRONG_FORMAT = /format is/i

async function must<T>(l: string, p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p
  if (error) throw new Error(`${l}: ${error.message}`)
  return data
}

/** Asserts the write is REFUSED, and that it is refused for the RIGHT reason. */
async function refused(label: string, pattern: RegExp, p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p
  if (!error) { bad(label, 'the write SUCCEEDED — the trigger did not fire'); return }
  if (!pattern.test(error.message)) {
    bad(label, `refused, but for the wrong reason: ${error.message}`); return
  }
  ok(label)
}

async function accepted(label: string, p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p
  if (error) bad(label, `REFUSED, and should not have been: ${error.message}`)
  else ok(label)
}

function seasonRow(id: string, name: string, league: number) {
  return {
    season_id: id, competition_slug: `scratch-cc111-${league}`, competition_name: name,
    season_label: '2026/27', season_start_year: 2026, country_code: 'ZZZ',
    club_count: 20, matchweek_count: 38, external_provider: 'scratch',
    external_league_id: league, external_season: -2026, regular_season_phase: 'Regular Season',
  }
}

function tournamentRow(id: string, name: string, league: number, format: string) {
  return {
    tournament_id: id, name, short_name: name, tournament_type: 'league',
    year: 2026, start_date: '2026-08-01', end_date: '2027-05-30',
    // NOT NULL on `tournaments`, all three. Found by this script failing on its
    // first run — and the same three P2's placeholder upsert has to set.
    num_teams: 20, num_groups: 0, teams_per_group: 0,
    prediction_deadline: '2026-08-01T00:00:00Z', status: 'upcoming', format,
    external_provider: 'scratch', external_league_id: league, external_season: -2026,
  }
}

function poolRow(id: string, adminUser: string, tournament: string | null, season: string | null) {
  return {
    pool_id: id, pool_name: `cc111 ${id.slice(-4)}`, pool_code: `CC${id.slice(-6).toUpperCase()}`,
    admin_user_id: adminUser, tournament_id: tournament, league_season_id: season,
    prediction_mode: season ? 'league_pickem' : 'full_tournament',
    prediction_deadline: '2027-05-30T00:00:00Z', status: 'open',
    is_private: true, max_participants: 100, max_entries_per_user: 1,
    entry_fee_currency: 'USD', accepting_members: false, settings: {},
  }
}

;(async () => {
  console.log('\n  COMPETITION CONSISTENCY — migration 111')
  console.log('  ' + '='.repeat(70))

  try {
    // A real user id: `pools.admin_user_id` is an FK and inventing one fails
    // for a reason that has nothing to do with what is being tested.
    const users = await must('a user', admin.from('users').select('user_id').limit(1))
    const adminUser = (users as Array<{ user_id: string }>)[0]?.user_id
    if (!adminUser) throw new Error('no users to own a scratch pool')

    head('Fixtures: two competitions that differ ONLY in their triple')
    await must('seasons', admin.from('league_seasons').insert([
      seasonRow(SEASON_A, 'Scratch Primera', -1140),
      seasonRow(SEASON_B, 'Scratch Premier', -1039),
    ]).select('season_id'))
    await must('tournaments', admin.from('tournaments').insert([
      tournamentRow(TOURN_A, 'Scratch Primera 2026/27', -1140, 'league'),
      tournamentRow(TOURN_B, 'Scratch Premier 2026/27', -1039, 'league'),
      tournamentRow(TOURN_X, 'Scratch Primera Cup',     -1140, 'groups_knockout'),
    ]).select('tournament_id'))
    note('season A ↔ tournament A (league -1140), season B ↔ tournament B (league -1039)')

    head('1–2. INSERT: the matched pair is allowed, the crossed pair is not')
    await accepted('matched pair inserts',
      admin.from('pools').insert(poolRow(POOL(1), adminUser, TOURN_A, SEASON_A)))
    await refused('CROSSED pair refused  (season A + tournament B)', MISMATCH,
      admin.from('pools').insert(poolRow(POOL(2), adminUser, TOURN_B, SEASON_A)))

    head('3. UPDATE: a good pool cannot be walked into a bad one')
    await refused('re-pointing tournament_id at the other competition refused', MISMATCH,
      admin.from('pools').update({ tournament_id: TOURN_B }).eq('pool_id', POOL(1)))
    await refused('re-pointing league_season_id at the other competition refused', MISMATCH,
      admin.from('pools').update({ league_season_id: SEASON_B }).eq('pool_id', POOL(1)))
    await accepted('an unrelated column still updates freely',
      admin.from('pools').update({ pool_name: 'cc111 renamed' }).eq('pool_id', POOL(1)))

    head('4. A bracket pool is untouched — 623 of 635 pools take this branch')
    await accepted('World Cup pool (no league season) inserts',
      admin.from('pools').insert(poolRow(POOL(3), adminUser, TOURN_B, null)))

    head('5. Same triple, wrong format — refused, and for its own reason')
    await refused('tournament with format groups_knockout refused', WRONG_FORMAT,
      admin.from('pools').insert(poolRow(POOL(4), adminUser, TOURN_X, SEASON_A)))

    head('6. A NULL tournament_id passes — deliberate (111, choice 2)')
    const { error: nullErr } = await admin.from('pools')
      .insert(poolRow(POOL(5), adminUser, null, SEASON_A))
    if (!nullErr) {
      ok('league pool with no tournament_id accepted — the XOR stays unblocked')
    } else if (/null value in column "tournament_id"/i.test(nullErr.message)) {
      ok('still NOT NULL, so unreachable today', 'the trigger branch is there for the XOR')
    } else {
      bad('NULL tournament_id', `refused by 111 rather than by NOT NULL: ${nullErr.message}`)
    }

    head('7. Every REAL pool still passes')
    // A no-op self-update that names both guarded columns, so the trigger fires
    // on every row. Refuses in a transaction we cannot roll back from here, so
    // the values are written back identically — this changes nothing.
    const real = await must('real pools', admin.from('pools')
      .select('pool_id, tournament_id, league_season_id')
      .not('league_season_id', 'is', null)) as Array<{
        pool_id: string; tournament_id: string | null; league_season_id: string | null
      }>
    const live = real.filter((p) => !ALL_POOLS.includes(p.pool_id))
    let refusedCount = 0
    for (const p of live) {
      const { error } = await admin.from('pools')
        .update({ tournament_id: p.tournament_id, league_season_id: p.league_season_id })
        .eq('pool_id', p.pool_id)
      if (error) { refusedCount++; bad(`live pool ${p.pool_id} REFUSED`, error.message) }
    }
    if (refusedCount === 0) ok(`all ${live.length} live league pools pass`, 'identity re-write, nothing changed')

  } catch (err) {
    bad('threw', err instanceof Error ? err.message : String(err))
  } finally {
    head('Teardown')
    await admin.from('pools').delete().in('pool_id', ALL_POOLS)
    await admin.from('tournaments').delete().in('tournament_id', [TOURN_A, TOURN_B, TOURN_X])
    await admin.from('league_seasons').delete().in('season_id', [SEASON_A, SEASON_B])
    const { count } = await admin.from('league_seasons')
      .select('*', { count: 'exact', head: true }).like('competition_slug', 'scratch-cc111-%')
    const { count: tc } = await admin.from('tournaments')
      .select('*', { count: 'exact', head: true }).eq('external_provider', 'scratch')
    if ((count ?? 0) > 0 || (tc ?? 0) > 0) bad('scratch removed', `${count} seasons, ${tc} tournaments left`)
    else ok('scratch data fully removed')
  }

  console.log('\n  ' + '='.repeat(70))
  console.log(failures === 0 ? '  ALL CHECKS PASSED\n' : `  ${failures} CHECK(S) FAILED\n`)
  process.exit(failures === 0 ? 0 : 1)
})()
