// =============================================================
// seed-league-ux-pools — six league pools, one per mode, for the UI/UX pass
// =============================================================
// All four league modes are built (migrations 077-093). Polishing their screens
// needs pools that are actually POPULATED: a leaderboard with one row, a duel
// list with no opponent and a Last Man Standing board with one survivor tell
// you nothing about the layout you are trying to fix.
//
// So this builds six pools on the real Premier League 2026/27 season, covering
// every mode-and-depth combination the create wizard can produce:
//
//   1. pickem            · results   Matchweek Pick'em          10 members
//   2. pickem            · scores    Pick'em: Exact Scores       4 members
//   3. showdown          · results   Showdown Duels             10 members  (even -> no byes)
//   4. showdown          · scores    Showdown: Exact Scores      7 members  (odd  -> byes)
//   5. last_man_standing · —         Last Man Standing          10 members
//   6. table             · —         Predict the Table           6 members
//
// The sizes are deliberately uneven. A pool that is always ten members hides
// every layout bug that only shows up at four, and Showdown's bye row only
// exists when the entry count is odd.
//
// ------------------------------------------------------------------
// ⚠ WHAT THIS CANNOT DO, AND WHY
// ------------------------------------------------------------------
// It cannot hand you a scored leaderboard. `enforce_league_prediction_before_lock`
// is a BEFORE trigger that RETURN NULLs any pick for a completed fixture, and
// Matchweek 1 finished on 24 Aug 2026. Backfilling MW1 would mean disabling a
// trigger on production, which needs SQL this script does not have (PostgREST
// and the service role only — no psql, no CLI).
//
// So the state it builds is the honest one for 25 Aug 2026: MW1 played by the
// clubs but by nobody in these pools, MW2 open and being picked. Scores appear
// on their own when MW2 plays (28-31 Aug) — the engine needs no help.
//
// ------------------------------------------------------------------
// HOW IT MAKES THE POOLS
// ------------------------------------------------------------------
// By replaying what /api/pools/create and /api/pools/join do, rather than by
// inserting rows that look similar. That matters: the create route resolves the
// placeholder tournament server-side, sets the deadline to the season's last
// kickoff, writes the scoring defaults, generates a Showdown fixture list and
// opens the first Last Man Standing round. A pool assembled by hand would be
// missing whichever of those somebody forgot, and the UI bug you then chase
// would be in the seed, not the screen.
//
// ⚠ If those routes change, change this too. The duplication is deliberate
// (the routes need a session; this does not) but it is still duplication.
//
// ------------------------------------------------------------------
//   npx tsx scripts/seed-league-ux-pools.ts              # dry run, writes nothing
//   npx tsx scripts/seed-league-ux-pools.ts --apply
//   npx tsx scripts/seed-league-ux-pools.ts --teardown --apply
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
import { saveLeaguePredictions, type LeaguePick } from '../lib/league/write'
import { saveTablePrediction } from '../lib/league/table'
import { regenerateDuelSchedule } from '../lib/league/duels'

const admin = createAdminClient()

const APPLY = process.argv.includes('--apply')
const TEARDOWN = process.argv.includes('--teardown')

// The admin. Ryan's gmail account, the one he signs in with.
const ADMIN_EMAIL = 'ryansousa93@gmail.com'

// Throwaway accounts, on Ryan's own domain so nothing leaves the building. The
// `ux-` prefix is what teardown matches on, so do not change it casually.
const TEST_EMAIL_PREFIX = 'ux-'
const TEST_EMAIL_DOMAIN = 'sportpool.app'
const TEST_PASSWORD = process.env.UX_TEST_PASSWORD || 'SportPoolUX!2026'

const TESTERS = [
  { handle: 'sarahc',  username: 'Sarah C',      full: 'Sarah Chen' },
  { handle: 'marcusb', username: 'Marcus',       full: 'Marcus Bell' },
  { handle: 'priyan',  username: 'Priya',        full: 'Priya Nair' },
  { handle: 'tomo',    username: 'Tommy O',      full: 'Tom Okafor' },
  { handle: 'elenar',  username: 'Elena Rossi',  full: 'Elena Rossi' },
  { handle: 'devp',    username: 'Dev',          full: 'Dev Patel' },
  { handle: 'aishak',  username: 'Aisha K',      full: 'Aisha Khan' },
  { handle: 'jonasw',  username: 'Jonas',        full: 'Jonas Weber' },
  { handle: 'miat',    username: 'Mia T',        full: 'Mia Torres' },
] as const

type Handle = (typeof TESTERS)[number]['handle']

// Fixed ids so a re-run is a no-op rather than a seventh pool, and so teardown
// needs no manifest file to find what it made.
type PoolSpec = {
  poolId: string
  name: string
  description: string
  mode: 'pickem' | 'showdown' | 'last_man_standing' | 'table'
  depth: 'results' | 'scores' | null
  /** Test accounts that join. Ryan is always the admin and always a member. */
  members: Handle[]
  /** Has Ryan himself picked? Both states are wanted across the six. */
  adminPicks: boolean
  /** Testers who deliberately have not picked, so the empty state is visible. */
  notPicked: Handle[]
  /** Testers who picked only some fixtures, so the partial state is visible. */
  partial: Handle[]
}

const POOLS: PoolSpec[] = [
  {
    poolId: '5eed0001-0000-4000-8000-000000000001',
    name: 'Matchweek Pick’em',
    description: 'Call every result, every matchweek. UI/UX test pool.',
    mode: 'pickem', depth: 'results',
    members: ['sarahc', 'marcusb', 'priyan', 'tomo', 'elenar', 'devp', 'aishak', 'jonasw', 'miat'],
    adminPicks: true,
    notPicked: ['jonasw', 'miat'],
    partial: ['aishak'],
  },
  {
    poolId: '5eed0002-0000-4000-8000-000000000002',
    name: 'Pick’em: Exact Scores',
    description: 'Scorelines, not results — a small pool. UI/UX test pool.',
    mode: 'pickem', depth: 'scores',
    members: ['sarahc', 'marcusb', 'priyan'],
    adminPicks: false,
    notPicked: ['priyan'],
    partial: ['marcusb'],
  },
  {
    poolId: '5eed0003-0000-4000-8000-000000000003',
    name: 'Showdown Duels',
    description: 'Head to head every matchweek, ten entries so nobody sits out. UI/UX test pool.',
    mode: 'showdown', depth: 'results',
    members: ['sarahc', 'marcusb', 'priyan', 'tomo', 'elenar', 'devp', 'aishak', 'jonasw', 'miat'],
    adminPicks: true,
    notPicked: ['miat'],
    partial: [],
  },
  {
    poolId: '5eed0004-0000-4000-8000-000000000004',
    name: 'Showdown: Exact Scores',
    description: 'Seven entries — an odd number, so somebody draws a bye. UI/UX test pool.',
    mode: 'showdown', depth: 'scores',
    members: ['sarahc', 'marcusb', 'priyan', 'tomo', 'elenar', 'devp'],
    adminPicks: false,
    notPicked: ['devp'],
    partial: ['elenar'],
  },
  {
    poolId: '5eed0005-0000-4000-8000-000000000005',
    name: 'Last Man Standing',
    description: 'One club a week to win, and you cannot use it twice. UI/UX test pool.',
    mode: 'last_man_standing', depth: null,
    members: ['sarahc', 'marcusb', 'priyan', 'tomo', 'elenar', 'devp', 'aishak', 'jonasw', 'miat'],
    adminPicks: true,
    notPicked: ['jonasw', 'miat'],
    partial: [],
  },
  {
    poolId: '5eed0006-0000-4000-8000-000000000006',
    name: 'Predict the Table',
    description: 'Order all twenty clubs once, and live with it until May. UI/UX test pool.',
    mode: 'table', depth: null,
    members: ['sarahc', 'marcusb', 'priyan', 'tomo', 'elenar'],
    adminPicks: false,
    notPicked: ['elenar'],
    partial: [],
  },
]

// ------------------------------------------------------------------ plumbing

let failures = 0
const note = (s: string) => console.log(`    ${s}`)
const ok = (s: string) => console.log(`    ✓ ${s}`)
const bad = (s: string) => { failures++; console.log(`    ✗ ${s}`) }
const head = (s: string) => console.log(`\n${'─'.repeat(72)}\n  ${s}\n${'─'.repeat(72)}`)

/** Deterministic pseudo-random, so a re-run produces the same picks. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const emailFor = (h: string) => `${TEST_EMAIL_PREFIX}${h}@${TEST_EMAIL_DOMAIN}`

// ------------------------------------------------------------------ teardown

async function teardown() {
  head('Teardown — removing the six pools and the nine test accounts')

  for (const p of POOLS) {
    const { data: pool } = await admin.from('pools').select('pool_id, pool_name').eq('pool_id', p.poolId).maybeSingle()
    if (!pool) { note(`· ${p.name} — not there`); continue }
    if (!APPLY) { note(`would delete pool ${p.name} (${p.poolId})`); continue }

    // Children first for the tables that have no cascade, then the pool. The
    // league tables hang off entries and rounds rather than off the pool, so
    // they are cleared by entry id rather than trusting ON DELETE.
    const { data: members } = await admin.from('pool_members').select('member_id').eq('pool_id', p.poolId)
    const memberIds = (members ?? []).map((m) => (m as { member_id: string }).member_id)
    let entryIds: string[] = []
    if (memberIds.length) {
      const { data: entries } = await admin.from('pool_entries').select('entry_id').in('member_id', memberIds)
      entryIds = (entries ?? []).map((e) => (e as { entry_id: string }).entry_id)
    }
    if (entryIds.length) {
      for (const t of ['league_predictions', 'league_table_predictions', 'league_lms_picks', 'league_lms_survivors', 'league_entry_totals', 'league_fixture_scores']) {
        const { error } = await admin.from(t).delete().in('entry_id', entryIds)
        if (error && !/does not exist/i.test(error.message)) note(`  (${t}: ${error.message})`)
      }
    }
    for (const t of ['league_duels', 'league_lms_rounds', 'league_pool_settings', 'pool_settings']) {
      const { error } = await admin.from(t).delete().eq('pool_id', p.poolId)
      if (error && !/does not exist/i.test(error.message)) note(`  (${t}: ${error.message})`)
    }
    if (entryIds.length) await admin.from('pool_entries').delete().in('entry_id', entryIds)
    await admin.from('pool_members').delete().eq('pool_id', p.poolId)
    const { error: pErr } = await admin.from('pools').delete().eq('pool_id', p.poolId)
    if (pErr) bad(`delete pool ${p.name}: ${pErr.message}`)
    else ok(`deleted ${p.name}`)
  }

  for (const t of TESTERS) {
    const email = emailFor(t.handle)
    const { data: u } = await admin.from('users').select('user_id, auth_user_id').eq('email', email).maybeSingle()
    if (!u) { note(`· ${email} — not there`); continue }
    if (!APPLY) { note(`would delete account ${email}`); continue }
    const row = u as { user_id: string; auth_user_id: string | null }
    if (row.auth_user_id) {
      const { error } = await admin.auth.admin.deleteUser(row.auth_user_id)
      if (error) note(`  (auth delete ${email}: ${error.message})`)
    }
    await admin.from('users').delete().eq('user_id', row.user_id)
    ok(`deleted ${email}`)
  }
}

// ------------------------------------------------------------------ accounts

async function ensureTesters(): Promise<Map<Handle, string>> {
  head('1. Nine test accounts')
  const ids = new Map<Handle, string>()

  for (const t of TESTERS) {
    const email = emailFor(t.handle)

    const { data: existing } = await admin
      .from('users').select('user_id').eq('email', email).maybeSingle()
    if (existing) {
      ids.set(t.handle, (existing as { user_id: string }).user_id)
      note(`· ${t.username.padEnd(13)} already exists`)
      continue
    }
    if (!APPLY) { note(`would create ${email} (${t.username})`); continue }

    // `email_confirm: true` so nothing is ever sent to this address. A
    // confirmation mail to a made-up mailbox on the live domain would bounce
    // against the sending reputation the real product depends on.
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { username: t.username, full_name: t.full },
    })
    if (error || !created?.user) { bad(`create ${email}: ${error?.message}`); continue }

    // A trigger on auth.users mirrors the account into public.users. Read it
    // back rather than assuming: if the trigger is ever removed this inserts
    // the row itself, and if it is not, a blind insert would collide.
    const { data: mirrored } = await admin
      .from('users').select('user_id').eq('auth_user_id', created.user.id).maybeSingle()

    if (mirrored) {
      const uid = (mirrored as { user_id: string }).user_id
      await admin.from('users').update({ username: t.username, full_name: t.full }).eq('user_id', uid)
      ids.set(t.handle, uid)
      ok(`${t.username.padEnd(13)} ${email}`)
    } else {
      const { data: inserted, error: iErr } = await admin.from('users').insert({
        auth_user_id: created.user.id, email, username: t.username, full_name: t.full, is_active: true,
      }).select('user_id').single()
      if (iErr || !inserted) { bad(`mirror ${email}: ${iErr?.message}`); continue }
      ids.set(t.handle, (inserted as { user_id: string }).user_id)
      ok(`${t.username.padEnd(13)} ${email}  (mirrored by hand)`)
    }
  }
  return ids
}

// ------------------------------------------------------------------ the pools

type Season = { seasonId: string; tournamentId: string; deadline: string; openMw: number; tableLockAt: string }

async function resolveSeason(): Promise<Season> {
  head('2. The competition')

  const { data: season, error: sErr } = await admin
    .from('league_seasons')
    .select('season_id, competition_name, season_label, external_provider, external_league_id, external_season')
    .eq('competition_slug', 'premier-league')
    .maybeSingle()
  if (sErr || !season) throw new Error(`no premier-league season: ${sErr?.message}`)
  const s = season as { season_id: string; competition_name: string; season_label: string; external_provider: string | null; external_league_id: number; external_season: number }

  // Same lookup the create route does, on the same (provider, league, season)
  // triple, so the pools carry the tournament_id a real one would.
  const { data: placeholder } = await admin
    .from('tournaments').select('tournament_id')
    .eq('external_provider', s.external_provider ?? 'api_football')
    .eq('external_league_id', s.external_league_id)
    .eq('external_season', s.external_season)
    .maybeSingle()
  if (!placeholder) throw new Error('no placeholder tournament for this season')

  const { data: lastKickoff } = await admin
    .from('league_matchweeks').select('last_kickoff_at')
    .eq('season_id', s.season_id).not('last_kickoff_at', 'is', null)
    .order('last_kickoff_at', { ascending: false }).limit(1).maybeSingle()
  if (!lastKickoff) throw new Error('season has no scheduled fixtures')

  const nowIso = new Date().toISOString()
  const { data: nextMw } = await admin
    .from('league_matchweeks').select('matchweek_number, first_kickoff_at, lock_at')
    .eq('season_id', s.season_id).not('first_kickoff_at', 'is', null)
    .gt('lock_at', nowIso).order('matchweek_number', { ascending: true }).limit(1).maybeSingle()
  if (!nextMw) throw new Error('no matchweeks left to predict')
  const mw = nextMw as { matchweek_number: number; first_kickoff_at: string }

  ok(`${s.competition_name} ${s.season_label}`)
  note(`season ${s.season_id}`)
  note(`open matchweek: ${mw.matchweek_number}, locks ${mw.first_kickoff_at}`)

  return {
    seasonId: s.season_id,
    tournamentId: (placeholder as { tournament_id: string }).tournament_id,
    deadline: (lastKickoff as { last_kickoff_at: string }).last_kickoff_at,
    openMw: mw.matchweek_number,
    tableLockAt: mw.first_kickoff_at,
  }
}

const SCORING_DEFAULTS = {
  group_exact_score: 100, group_correct_difference: 75, group_correct_result: 50,
  knockout_exact_score: 200, knockout_correct_difference: 150, knockout_correct_result: 100,
  round_16_multiplier: 2, quarter_final_multiplier: 3, semi_final_multiplier: 4,
  third_place_multiplier: 4, final_multiplier: 8,
  pso_enabled: true, pso_exact_score: 100, pso_correct_difference: 75, pso_correct_result: 50,
  bonus_group_winner_and_runnerup: 150, bonus_group_winner_only: 100, bonus_group_runnerup_only: 50,
  bonus_both_qualify_swapped: 75, bonus_one_qualifies_wrong_position: 25,
  bonus_all_16_qualified: 75, bonus_12_15_qualified: 50, bonus_8_11_qualified: 25,
  bonus_correct_bracket_pairing: 50, bonus_match_winner_correct: 50,
  bonus_champion_correct: 1000, bonus_second_place_correct: 25, bonus_third_place_correct: 25,
  bonus_best_player_correct: 100, bonus_top_scorer_correct: 100,
}

/** Replays /api/pools/create for one spec. Returns the entry id per handle. */
async function ensurePool(
  spec: PoolSpec, season: Season, adminUserId: string, testerIds: Map<Handle, string>,
): Promise<Map<Handle | '__admin', string>> {
  const entries = new Map<Handle | '__admin', string>()

  const { data: already } = await admin.from('pools')
    .select('pool_id, pool_code, pool_name').eq('pool_id', spec.poolId).maybeSingle()

  if (!already) {
    if (!APPLY) { note(`would create "${spec.name}" (${spec.mode}${spec.depth ? ' · ' + spec.depth : ''})`); return entries }

    const { error } = await admin.from('pools').insert({
      pool_id: spec.poolId,
      pool_name: spec.name,
      description: spec.description,
      tournament_id: season.tournamentId,
      league_season_id: season.seasonId,
      league_mode: spec.mode,
      league_depth: spec.depth,
      league_table_profile: spec.mode === 'table' ? 'full_table' : null,
      league_table_lock_at: spec.mode === 'table' ? season.tableLockAt : null,
      admin_user_id: adminUserId,
      prediction_deadline: season.deadline,
      prediction_mode: 'league_pickem',
      status: 'open',
      is_private: true,
      max_participants: null,
      max_entries_per_user: 1,
    })
    if (error) { bad(`create "${spec.name}": ${error.message}`); return entries }

    await admin.from('pool_settings').update(SCORING_DEFAULTS).eq('pool_id', spec.poolId)
  }

  // Membership + one entry, for the admin and every tester. Idempotent, so a
  // re-run tops a pool up rather than duplicating it.
  const roster: Array<{ key: Handle | '__admin'; userId: string; name: string; role: 'admin' | 'player' }> = [
    { key: '__admin', userId: adminUserId, name: 'IZZETmagic', role: 'admin' },
    ...spec.members.map((h) => {
      const t = TESTERS.find((x) => x.handle === h)!
      return { key: h as Handle, userId: testerIds.get(h) ?? '', name: t.username, role: 'player' as const }
    }),
  ]

  for (const r of roster) {
    if (!r.userId) { if (APPLY) bad(`${spec.name}: no account for ${r.key}`); continue }

    let memberId: string | null = null
    const { data: m } = await admin.from('pool_members')
      .select('member_id').eq('pool_id', spec.poolId).eq('user_id', r.userId).maybeSingle()
    if (m) memberId = (m as { member_id: string }).member_id
    else {
      if (!APPLY) continue
      const { data: created, error } = await admin.from('pool_members')
        .insert({ pool_id: spec.poolId, user_id: r.userId, role: r.role })
        .select('member_id').single()
      if (error || !created) { bad(`${spec.name}: join ${r.name}: ${error?.message}`); continue }
      memberId = (created as { member_id: string }).member_id
    }
    if (!memberId) continue

    const { data: e } = await admin.from('pool_entries')
      .select('entry_id').eq('member_id', memberId).is('retired_at', null)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (e) { entries.set(r.key, (e as { entry_id: string }).entry_id); continue }
    if (!APPLY) continue
    const { data: ce, error: eErr } = await admin.from('pool_entries')
      .insert({ member_id: memberId, entry_name: r.name, entry_number: 1 })
      .select('entry_id').single()
    if (eErr || !ce) { bad(`${spec.name}: entry for ${r.name}: ${eErr?.message}`); continue }
    entries.set(r.key, (ce as { entry_id: string }).entry_id)
  }

  if (!APPLY) return entries

  // Showdown's fixture list is regenerated after the roster settles, exactly as
  // the join route does — generating at creation with one entry writes nothing.
  if (spec.mode === 'showdown') {
    const sched = await regenerateDuelSchedule(admin, spec.poolId)
    if (sched.error) bad(`${spec.name}: duel schedule: ${sched.error}`)
    else note(`duel schedule: ${JSON.stringify(sched)}`)
  }

  // Last Man Standing opens its first round at the open matchweek. The RPC
  // refuses politely if a round is already open, so a re-run is a no-op.
  if (spec.mode === 'last_man_standing') {
    const { data: r, error } = await admin.rpc('league_lms_open_round', {
      p_pool_id: spec.poolId, p_matchweek: season.openMw,
    })
    if (error) bad(`${spec.name}: lms round: ${error.message}`)
    else note(`lms round: ${JSON.stringify(r)}`)
  }

  const { data: after } = await admin.from('pools').select('pool_code').eq('pool_id', spec.poolId).maybeSingle()
  ok(`${spec.name.padEnd(24)} ${spec.mode}${spec.depth ? '·' + spec.depth : ''}  ${entries.size} entries  code ${(after as { pool_code: string } | null)?.pool_code ?? '?'}`)
  return entries
}

// ------------------------------------------------------------------ the picks

type Fixture = { fixture_id: string; home_club_id: string; away_club_id: string; fixture_number: number }

async function openFixtures(season: Season): Promise<Fixture[]> {
  const { data: mw } = await admin.from('league_matchweeks')
    .select('matchweek_id').eq('season_id', season.seasonId)
    .eq('matchweek_number', season.openMw).maybeSingle()
  if (!mw) return []
  const { data } = await admin.from('league_fixtures')
    .select('fixture_id, home_club_id, away_club_id, fixture_number')
    .eq('matchweek_id', (mw as { matchweek_id: string }).matchweek_id)
    .order('fixture_number')
  return (data ?? []) as Fixture[]
}

/**
 * One person's picks for the open matchweek.
 *
 * Seeded off the entry id so a re-run reproduces them exactly, and so two
 * people in the same pool disagree — a leaderboard where everyone picked the
 * same ten results has nothing to show.
 */
function pickSet(fixtures: Fixture[], depth: 'results' | 'scores', seed: number, howMany: number): LeaguePick[] {
  const r = rng(seed)
  return fixtures.slice(0, howMany).map((f) => {
    if (depth === 'results') {
      const roll = r()
      // Home advantage is real, and a set of picks that is a third each looks
      // machine-made on screen. 45 / 27 / 28 reads like people.
      const outcome = roll < 0.45 ? 'home' : roll < 0.72 ? 'draw' : 'away'
      return { matchId: f.fixture_id, outcome } as LeaguePick
    }
    const home = Math.floor(r() * 3.4)
    const away = Math.floor(r() * 2.9)
    return { matchId: f.fixture_id, homeScore: home, awayScore: away } as LeaguePick
  })
}

/** Turns an entry id into a stable integer, so the same entry always picks the same way. */
const seedOf = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

async function seedFixturePicks(spec: PoolSpec, season: Season, entries: Map<Handle | '__admin', string>) {
  if (spec.depth === null) return
  const fixtures = await openFixtures(season)
  if (fixtures.length === 0) { bad(`${spec.name}: the open matchweek has no fixtures`); return }

  let full = 0, part = 0, none = 0
  for (const [key, entryId] of entries) {
    const skip = key === '__admin' ? !spec.adminPicks : spec.notPicked.includes(key as Handle)
    if (skip) { none++; continue }
    const partial = key !== '__admin' && spec.partial.includes(key as Handle)
    const howMany = partial ? Math.max(1, Math.floor(fixtures.length * 0.6)) : fixtures.length

    const res = await saveLeaguePredictions(admin, {
      entryId, seasonId: season.seasonId,
      picks: pickSet(fixtures, spec.depth, seedOf(entryId), howMany),
    })
    if (res.error) { bad(`${spec.name}: picks for ${key}: ${res.error}`); continue }
    // `rejected` is how the write path reports a silently-dropped row. Non-empty
    // here means the matchweek locked mid-run, and the seed is now a lie.
    if (res.rejected.length) { bad(`${spec.name}: ${res.rejected.length} pick(s) refused for ${key} — did the matchweek lock?`); continue }
    if (partial) part++; else full++
  }
  ok(`${spec.name}: ${full} complete · ${part} partial · ${none} not started  (matchweek ${season.openMw})`)
}

async function seedLmsPicks(spec: PoolSpec, season: Season, entries: Map<Handle | '__admin', string>) {
  const { data: round } = await admin.from('league_lms_rounds')
    .select('round_id').eq('pool_id', spec.poolId).is('last_matchweek', null).maybeSingle()
  if (!round) { bad(`${spec.name}: no open Last Man Standing round`); return }
  const roundId = (round as { round_id: string }).round_id

  // Home sides in the open matchweek: the clubs somebody would actually back to
  // win. Cycling through them also spreads the picks, so the board is not
  // nine people on the same club.
  const fixtures = await openFixtures(season)
  const clubs = fixtures.map((f) => f.home_club_id)
  if (clubs.length === 0) { bad(`${spec.name}: no fixtures to pick from`); return }

  let picked = 0, none = 0, i = 0
  for (const [key, entryId] of entries) {
    const skip = key === '__admin' ? !spec.adminPicks : spec.notPicked.includes(key as Handle)
    if (skip) { none++; continue }
    const clubId = clubs[i++ % clubs.length]
    const { error } = await admin.from('league_lms_picks').upsert(
      { round_id: roundId, entry_id: entryId, matchweek_number: season.openMw, club_id: clubId },
      { onConflict: 'round_id,entry_id,matchweek_number' },
    )
    if (error) { bad(`${spec.name}: lms pick for ${key}: ${error.message}`); continue }
    const { data: back } = await admin.from('league_lms_picks')
      .select('club_id').eq('round_id', roundId).eq('entry_id', entryId)
      .eq('matchweek_number', season.openMw).maybeSingle()
    if ((back as { club_id: string } | null)?.club_id !== clubId) { bad(`${spec.name}: lms pick for ${key} was refused`); continue }
    picked++
  }
  ok(`${spec.name}: ${picked} clubs chosen · ${none} not started  (matchweek ${season.openMw})`)
}

async function seedTablePredictions(spec: PoolSpec, season: Season, entries: Map<Handle | '__admin', string>) {
  const { data: clubs } = await admin.from('league_clubs')
    .select('club_id, name').eq('season_id', season.seasonId).order('name')
  const clubIds = (clubs ?? []).map((c) => (c as { club_id: string }).club_id)
  if (clubIds.length === 0) { bad(`${spec.name}: no clubs`); return }

  let done = 0, none = 0
  for (const [key, entryId] of entries) {
    const skip = key === '__admin' ? !spec.adminPicks : spec.notPicked.includes(key as Handle)
    if (skip) { none++; continue }

    // A shuffle, seeded off the entry. Everyone submitting the same twenty in
    // the same order would make the whole comparison screen look broken.
    const r = rng(seedOf(entryId))
    const order = [...clubIds]
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    const res = await saveTablePrediction(admin, entryId, order)
    if (res.error) { bad(`${spec.name}: table for ${key}: ${res.error}`); continue }
    if (res.locked) { bad(`${spec.name}: table for ${key} was refused — has the deadline passed?`); continue }
    done++
  }
  ok(`${spec.name}: ${done} tables submitted · ${none} not started`)
}

// ------------------------------------------------------------------ main

async function main() {
  console.log(`\n${'='.repeat(72)}`)
  console.log('  Six league pools for the UI/UX pass')
  console.log(`  ${APPLY ? 'APPLY — this writes to production' : 'DRY RUN — nothing is written. Add --apply.'}`)
  console.log('='.repeat(72))

  if (TEARDOWN) {
    await teardown()
    console.log(`\n${failures === 0 ? '✓ done' : `✗ ${failures} problem(s)`}\n`)
    process.exit(failures === 0 ? 0 : 1)
  }

  const { data: adminRow } = await admin.from('users')
    .select('user_id, username').eq('email', ADMIN_EMAIL).maybeSingle()
  if (!adminRow) throw new Error(`no account for ${ADMIN_EMAIL}`)
  const adminUserId = (adminRow as { user_id: string }).user_id

  const testerIds = await ensureTesters()
  const season = await resolveSeason()

  head('3. The six pools')
  const built: Array<[PoolSpec, Map<Handle | '__admin', string>]> = []
  for (const spec of POOLS) built.push([spec, await ensurePool(spec, season, adminUserId, testerIds)])

  if (APPLY) {
    head('4. Picks for the open matchweek')
    for (const [spec, entries] of built) {
      if (spec.mode === 'last_man_standing') await seedLmsPicks(spec, season, entries)
      else if (spec.mode === 'table') await seedTablePredictions(spec, season, entries)
      else await seedFixturePicks(spec, season, entries)
    }

    head('5. What you have')
    const { data: rows } = await admin.from('pools')
      .select('pool_id, pool_code, pool_name, league_mode, league_depth')
      .in('pool_id', POOLS.map((p) => p.poolId))
      .order('pool_name')
    for (const r of (rows ?? []) as Array<{ pool_id: string; pool_code: string; pool_name: string; league_mode: string; league_depth: string | null }>) {
      console.log(`    ${r.pool_name.padEnd(24)} ${(r.league_mode + (r.league_depth ? '·' + r.league_depth : '')).padEnd(26)} /pools/${r.pool_id}`)
    }
    console.log('')
    console.log(`    Test accounts: ${TESTERS.map((t) => emailFor(t.handle)).join(', ')}`)
    console.log(`    Password:      ${TEST_PASSWORD}`)
    console.log('')
    console.log('    Scores stay at zero until Matchweek 2 plays (28-31 Aug) — the engine')
    console.log('    scores it on its own. Matchweek 1 cannot be back-filled: its fixtures')
    console.log('    are complete and the lock trigger drops any pick for them.')
  }

  console.log(`\n${failures === 0 ? '✓ done' : `✗ ${failures} problem(s)`}\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
