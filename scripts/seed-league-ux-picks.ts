// =============================================================
// seed-league-ux-picks — top the six UI/UX pools up for the OPEN matchweek
// =============================================================
// `seed-league-ux-pools.ts` builds the pools once. This runs every matchweek,
// and it is deliberately a separate script rather than a flag on that one,
// because the two jobs disagree about the most important thing in the file:
//
//   the seed OWNS every pick it writes; this one OWNS ALMOST NONE OF THEM.
//
// By Matchweek 3 Ryan is picking in these pools himself — his own picks are in
// four of the six. The seed would overwrite them, because `adminPicks: true`
// means "generate picks for the admin" and its generator has no idea a person
// got there first. So this script never writes a pick for any account that is
// not a `ux-` throwaway, and the filter is on the email, not on a role: a role
// check would still fire if Ryan handed a pool to somebody.
//
// ------------------------------------------------------------------
// WHAT IT WRITES
// ------------------------------------------------------------------
//   pickem / showdown   picks for every fixture in the open matchweek
//   last_man_standing   one club, for the entries still alive
//   table               nothing — a table is one decision for the whole season
//
// The per-pool spread is copied from the seed on purpose. Two members in each
// pool have not picked and one has picked six of ten, so the empty and partial
// states stay on screen. Filling everybody in would make a tidier leaderboard
// and delete the two layouts these pools exist to exercise.
//
// ------------------------------------------------------------------
// ⚠ WHAT CAN SILENTLY NOT HAPPEN
// ------------------------------------------------------------------
// `enforce_league_prediction_before_lock` is a BEFORE trigger that RETURN NULLs
// a pick once the matchweek locks. The statement still succeeds. So every write
// here is read back and counted, and a refusal is a failure rather than a line
// of output nobody reads. Run this BEFORE the lock, not after.
//
// ------------------------------------------------------------------
//   npx tsx scripts/seed-league-ux-picks.ts            # dry run, writes nothing
//   npx tsx scripts/seed-league-ux-picks.ts --apply
// =============================================================

import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'

;(() => {
  // Walk up for `.env.local`. The seed reads it from `process.cwd()`, which is
  // right until you run from a git worktree — those have no env file of their
  // own and the real one is a few directories up.
  let dir = process.cwd()
  for (;;) {
    try {
      const envContent = readFileSync(resolve(dir, '.env.local'), 'utf8')
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
      return
    } catch {
      const up = dirname(dir)
      if (up === dir) throw new Error('no .env.local in this directory or any above it')
      dir = up
    }
  }
})()

import { createAdminClient } from '../lib/supabase/server'
import { openMatchweekId, type MatchweekRow } from '../lib/league/read'
import { saveLeaguePredictions, type LeaguePick } from '../lib/league/write'
import { saveLmsPick } from '../lib/league/lms'

const admin = createAdminClient()
const APPLY = process.argv.includes('--apply')

/**
 * The only accounts this script may write for.
 *
 * ⚠ Load-bearing. Every entry that does not match is skipped, whoever they are
 * — Ryan, a tester, a real member who joined by code. Generated picks filed
 * under a real person's name are worse than no picks at all: they show up on
 * that person's own screen as things they said.
 */
const TEST_EMAIL_PREFIX = 'ux-'
const TEST_EMAIL_DOMAIN = 'sportpool.app'

const isSeedAccount = (email: string | null) =>
  !!email && email.startsWith(TEST_EMAIL_PREFIX) && email.endsWith(`@${TEST_EMAIL_DOMAIN}`)

/**
 * The six pools by id, so this can never wander into a real one. There are four
 * other Premier League pools in production with real members in them, and the
 * only thing standing between them and a generated pick is this list.
 */
type PoolSpec = {
  poolId: string
  name: string
  /** Handles that deliberately do not pick, so the empty state stays visible. */
  notPicked: string[]
  /** Handles that pick ~60% of the fixtures, so the partial state stays visible. */
  partial: string[]
}

const POOLS: PoolSpec[] = [
  { poolId: '5eed0001-0000-4000-8000-000000000001', name: 'Matchweek Pick’em',      notPicked: ['jonasw', 'miat'], partial: ['aishak'] },
  { poolId: '5eed0002-0000-4000-8000-000000000002', name: 'Pick’em: Exact Scores',  notPicked: ['priyan'],         partial: ['marcusb'] },
  { poolId: '5eed0003-0000-4000-8000-000000000003', name: 'Showdown Duels',         notPicked: ['miat'],           partial: [] },
  { poolId: '5eed0004-0000-4000-8000-000000000004', name: 'Showdown: Exact Scores', notPicked: ['devp'],           partial: ['elenar'] },
  { poolId: '5eed0005-0000-4000-8000-000000000005', name: 'Last Man Standing',      notPicked: ['jonasw', 'miat'], partial: [] },
  { poolId: '5eed0006-0000-4000-8000-000000000006', name: 'Predict the Table',      notPicked: ['elenar'],         partial: [] },
]

// ------------------------------------------------------------------ plumbing

let failures = 0
const note = (s: string) => console.log(`    ${s}`)
const ok = (s: string) => console.log(`    ✓ ${s}`)
const bad = (s: string) => { failures++; console.log(`    ✗ ${s}`) }
const head = (s: string) => console.log(`\n${'─'.repeat(74)}\n  ${s}\n${'─'.repeat(74)}`)

/** Deterministic pseudo-random, so a re-run reproduces the same picks. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/**
 * Seeded off the entry AND the matchweek.
 *
 * The seed script keys only off the entry, which is right when it runs once.
 * Run weekly, that would hand every member the same run of home/draw/away every
 * matchweek — the same person backing the home side in fixture 1 for ten weeks
 * running. Folding the matchweek in makes each week its own set of opinions.
 */
const seedOf = (entryId: string, matchweek: number) => hash(`${entryId}:mw${matchweek}`)

/** `ux-sarahc@sportpool.app` → `sarahc`, the handle the spreads above name. */
const handleOf = (email: string) =>
  email.slice(TEST_EMAIL_PREFIX.length, email.length - TEST_EMAIL_DOMAIN.length - 1)

// ------------------------------------------------------------------ the season

type Season = { seasonId: string; matchweekId: string; matchweekNumber: number; lockAt: string | null }

async function resolveOpenMatchweek(): Promise<Season> {
  head('1. The open matchweek')

  const { data: season, error: sErr } = await admin
    .from('league_seasons')
    .select('season_id, competition_name, season_label')
    .eq('competition_slug', 'premier-league')
    .maybeSingle()
  if (sErr || !season) throw new Error(`no premier-league season: ${sErr?.message}`)
  const s = season as { season_id: string; competition_name: string; season_label: string }

  const { data: rows, error: mErr } = await admin
    .from('league_matchweeks')
    .select('matchweek_id, matchweek_number, fixture_count, completed_fixture_count, lock_at, first_kickoff_at')
    .eq('season_id', s.season_id)
  if (mErr || !rows) throw new Error(`matchweeks: ${mErr?.message}`)

  // The same function the app uses, rather than a second `lock_at > now()`
  // query that would drift from it. Migration 101's rule is ordered by lock
  // time, not by number, because a whole round can be moved.
  const openId = openMatchweekId(rows as MatchweekRow[], Date.now())
  if (!openId) throw new Error('no matchweek is open — is the season over?')
  const mw = (rows as MatchweekRow[]).find((r) => r.matchweek_id === openId)!

  note(`${s.competition_name} ${s.season_label}`)
  note(`matchweek ${mw.matchweek_number} — ${mw.fixture_count} fixtures, locks ${mw.lock_at}`)
  if (mw.lock_at && Date.parse(mw.lock_at) - Date.now() < 60 * 60 * 1000) {
    note('⚠ under an hour to the lock. Picks written after it are dropped silently.')
  }
  return { seasonId: s.season_id, matchweekId: openId, matchweekNumber: mw.matchweek_number, lockAt: mw.lock_at }
}

type Fixture = { fixture_id: string; home_club_id: string; away_club_id: string; fixture_number: number }

async function openFixtures(season: Season): Promise<Fixture[]> {
  const { data } = await admin
    .from('league_fixtures')
    .select('fixture_id, home_club_id, away_club_id, fixture_number')
    .eq('matchweek_id', season.matchweekId)
    .order('fixture_number')
  return (data ?? []) as Fixture[]
}

// ------------------------------------------------------------------ the entries

type Entry = { entryId: string; email: string; handle: string }

/** The `ux-` entries in one pool, in a stable order. Everyone else is dropped here. */
async function seedEntriesIn(poolId: string): Promise<Entry[]> {
  const { data: members } = await admin
    .from('pool_members')
    .select('member_id, user_id, users!inner(email)')
    .eq('pool_id', poolId)
  const rows = (members ?? []) as Array<{ member_id: string; users: { email: string | null } | { email: string | null }[] }>
  if (rows.length === 0) return []

  const emailOf = new Map<string, string>()
  for (const r of rows) {
    // PostgREST returns an embedded row as an object or a one-element array
    // depending on how it reads the relationship; normalise rather than guess.
    const u = Array.isArray(r.users) ? r.users[0] : r.users
    if (isSeedAccount(u?.email ?? null)) emailOf.set(r.member_id, u!.email!)
  }
  if (emailOf.size === 0) return []

  const { data: entries } = await admin
    .from('pool_entries')
    .select('entry_id, member_id, retired_at')
    .in('member_id', [...emailOf.keys()])
  const out: Entry[] = []
  for (const e of (entries ?? []) as Array<{ entry_id: string; member_id: string; retired_at: string | null }>) {
    // A detached entry is not in the pool any more; picking for it would put a
    // row on a leaderboard nobody is on. See migrations 056/057.
    if (e.retired_at) continue
    const email = emailOf.get(e.member_id)!
    out.push({ entryId: e.entry_id, email, handle: handleOf(email) })
  }
  return out.sort((a, b) => a.handle.localeCompare(b.handle))
}

// ------------------------------------------------------------------ pickem / showdown

function pickSet(fixtures: Fixture[], depth: 'results' | 'scores', seed: number, howMany: number): LeaguePick[] {
  const r = rng(seed)
  return fixtures.slice(0, howMany).map((f) => {
    if (depth === 'results') {
      // 45 / 27 / 28. Home advantage is real, and a third each looks machine-made.
      const roll = r()
      const outcome = roll < 0.45 ? 'home' : roll < 0.72 ? 'draw' : 'away'
      return { matchId: f.fixture_id, outcome } as LeaguePick
    }
    return { matchId: f.fixture_id, homeScore: Math.floor(r() * 3.4), awayScore: Math.floor(r() * 2.9) } as LeaguePick
  })
}

async function seedFixturePicks(spec: PoolSpec, depth: 'results' | 'scores', season: Season, entries: Entry[]) {
  const fixtures = await openFixtures(season)
  if (fixtures.length === 0) { bad(`${spec.name}: matchweek ${season.matchweekNumber} has no fixtures`); return }

  let full = 0, part = 0, none = 0, already = 0
  for (const e of entries) {
    if (spec.notPicked.includes(e.handle)) { none++; continue }

    // Somebody may have picked through the UI since the last run. Their picks
    // win: this is a top-up, not a rewrite.
    const { data: existing } = await admin
      .from('league_predictions')
      .select('fixture_id')
      .eq('entry_id', e.entryId)
      .in('fixture_id', fixtures.map((f) => f.fixture_id))
    if ((existing ?? []).length > 0) { already++; continue }

    const partial = spec.partial.includes(e.handle)
    const howMany = partial ? Math.max(1, Math.floor(fixtures.length * 0.6)) : fixtures.length
    const picks = pickSet(fixtures, depth, seedOf(e.entryId, season.matchweekNumber), howMany)

    if (!APPLY) {
      note(`would write ${picks.length} pick(s) for ${e.handle}`)
      if (partial) part++; else full++
      continue
    }

    const res = await saveLeaguePredictions(admin, { entryId: e.entryId, seasonId: season.seasonId, picks })
    if (res.error) { bad(`${spec.name}: ${e.handle}: ${res.error}`); continue }
    // A refusal is the lock trigger. Not a warning — the run is now a lie.
    if (res.rejected.length) { bad(`${spec.name}: ${res.rejected.length} pick(s) refused for ${e.handle} — has the matchweek locked?`); continue }
    if (partial) part++; else full++
  }
  ok(`${spec.name}: ${full} complete · ${part} partial · ${none} sitting out · ${already} already picked`)
}

// ------------------------------------------------------------------ last man standing

async function seedLmsPicks(spec: PoolSpec, season: Season, entries: Entry[]) {
  const { data: round } = await admin
    .from('league_lms_rounds')
    .select('round_id')
    .eq('pool_id', spec.poolId)
    .is('last_matchweek', null)
    .maybeSingle()
  if (!round) { bad(`${spec.name}: no open round`); return }
  const roundId = (round as { round_id: string }).round_id

  // Only the living pick. By Decision 13 a draw is elimination, so a mid-season
  // Last Man Standing pool is mostly a graveyard — writing a pick for somebody
  // knocked out in Matchweek 2 would put a club on a board that says "out".
  const { data: survivors } = await admin
    .from('league_lms_survivors')
    .select('entry_id, eliminated_matchweek')
    .eq('round_id', roundId)
  const alive = new Set(
    ((survivors ?? []) as Array<{ entry_id: string; eliminated_matchweek: number | null }>)
      .filter((s) => s.eliminated_matchweek === null)
      .map((s) => s.entry_id),
  )

  // A club can be backed once per round, and only if it actually plays this
  // week (migration 103 — backing a club with no fixture used to be a free pass
  // through the round).
  //
  // Home sides FIRST, because that is what somebody actually playing would do,
  // then the away sides. The fallback is the part that matters: by matchweek 20
  // a survivor has spent most of the division, and a list of home sides alone
  // would eventually leave them with nothing to pick and no way to say so.
  const fixtures = await openFixtures(season)
  if (fixtures.length === 0) { bad(`${spec.name}: no fixtures to pick from`); return }
  const playing: string[] = [...fixtures.map((f) => f.home_club_id), ...fixtures.map((f) => f.away_club_id)]

  const { data: clubRows } = await admin
    .from('league_clubs').select('club_id, name').eq('season_id', season.seasonId)
  const clubName = new Map(((clubRows ?? []) as Array<{ club_id: string; name: string }>).map((c) => [c.club_id, c.name]))

  let picked = 0, out = 0, none = 0, already = 0
  for (const e of entries) {
    // Elimination is checked BEFORE the sit-out list, because it outranks it.
    // The two members who never pick were themselves knocked out for not
    // picking, and reporting them as "sitting out" would describe a choice
    // where the board shows a result.
    if (!alive.has(e.entryId)) { out++; note(`· ${e.handle.padEnd(9)} is out — no pick`); continue }
    if (spec.notPicked.includes(e.handle)) { none++; continue }

    const { data: mine } = await admin
      .from('league_lms_picks')
      .select('matchweek_number, club_id')
      .eq('round_id', roundId).eq('entry_id', e.entryId)
    const rows = (mine ?? []) as Array<{ matchweek_number: number; club_id: string }>
    if (rows.some((r) => r.matchweek_number === season.matchweekNumber)) { already++; continue }

    const used = new Set(rows.map((r) => r.club_id))
    // Rotated by the entry, so the board is not everyone on the same club. The
    // rotation is applied within each half, which keeps the home sides ahead of
    // the away sides for every member rather than only for the first one.
    const half = fixtures.length
    const start = hash(e.entryId) % half
    const order = playing.map((_, i) => playing[(i < half ? 0 : half) + ((start + i) % half)])
    const clubId = order.find((c) => !used.has(c))
    if (!clubId) { bad(`${spec.name}: ${e.handle} has used every club playing this week`); continue }

    if (!APPLY) { note(`would back ${clubName.get(clubId)} for ${e.handle}`); picked++; continue }

    const res = await saveLmsPick(admin, {
      roundId, entryId: e.entryId, matchweekNumber: season.matchweekNumber, clubId,
    })
    if (res.error) { bad(`${spec.name}: ${e.handle}: ${res.error}`); continue }
    if (res.refused) { bad(`${spec.name}: ${e.handle}'s pick was refused — has the matchweek locked?`); continue }
    note(`· ${e.handle.padEnd(9)} backs ${clubName.get(clubId)}`)
    picked++
  }
  ok(`${spec.name}: ${picked} clubs chosen · ${already} already chosen · ${out} eliminated · ${none} sitting out`)
}

// ------------------------------------------------------------------ main

async function main() {
  console.log(`\n${'='.repeat(74)}`)
  console.log('  Topping the six UI/UX pools up for the open matchweek')
  console.log(`  ${APPLY ? 'APPLY — this writes to production' : 'DRY RUN — nothing is written. Add --apply.'}`)
  console.log('='.repeat(74))

  const season = await resolveOpenMatchweek()

  head(`2. Picks for matchweek ${season.matchweekNumber}`)
  for (const spec of POOLS) {
    const { data: pool } = await admin
      .from('pools')
      .select('pool_id, league_mode, league_depth')
      .eq('pool_id', spec.poolId)
      .maybeSingle()
    if (!pool) { bad(`${spec.name}: pool is gone`); continue }
    const p = pool as { league_mode: string; league_depth: 'results' | 'scores' | null }

    const entries = await seedEntriesIn(spec.poolId)
    if (entries.length === 0) { bad(`${spec.name}: no ux- entries`); continue }

    if (p.league_mode === 'table') {
      // A table is submitted once and lived with until May — there is no
      // per-matchweek pick to write. Named rather than silently skipped, so a
      // reader is not left wondering whether it failed.
      ok(`${spec.name}: nothing to do — a table is one decision for the season`)
      continue
    }
    if (p.league_mode === 'last_man_standing') { await seedLmsPicks(spec, season, entries); continue }
    if (!p.league_depth) { bad(`${spec.name}: ${p.league_mode} has no depth`); continue }
    await seedFixturePicks(spec, p.league_depth, season, entries)
  }

  console.log(`\n${failures === 0 ? '✓ done' : `✗ ${failures} problem(s)`}\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
