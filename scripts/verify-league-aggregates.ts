// =============================================================
// verify-league-aggregates — do the league_matchweeks aggregates still tell
// the truth about league_fixtures?
// =============================================================
// `league_matchweeks` caches five things that are really derived from its
// fixtures: fixture_count, completed_fixture_count, first_kickoff_at,
// last_kickoff_at and lock_at. A trigger keeps them in step. This asserts the
// trigger actually did.
//
// WHY THIS EXISTS. On 2026-08-22, probing the L1 trigger against production
// found it does NOT fire when a fixture MOVES between matchweeks —
// `trg_refresh_league_matchweek_window_upd` is declared
// `AFTER UPDATE OF kickoff_at, is_completed`, and `matchweek_id` is not in that
// list. A postponement moved to another round therefore leaves BOTH matchweeks
// wrong, and nothing raises: each row stays internally consistent with the
// CHECK, so only the relationship to reality is broken. A moved fixture is a
// routine league event.
//
// The destination matchweek is the dangerous half. It ends up holding a real
// fixture while `lock_at` stays NULL, and `enforce_league_prediction_before_lock`
// reads NULL as OPEN FOR WRITES — so members can still edit predictions for a
// matchweek whose fixture has already kicked off.
//
// Run it after any sync change, and on a schedule once the league is live:
//
//   npx tsx scripts/verify-league-aggregates.ts
//   npx tsx scripts/verify-league-aggregates.ts --season <uuid>
//
// Exits 1 on any drift so it can gate a deploy.
// =============================================================

import { readFileSync } from 'fs'
import { resolve } from 'path'

// Same .env.local reader the other scripts use — the repo has no dotenv dependency.
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

const seasonArg = process.argv.indexOf('--season')
const seasonFilter = seasonArg > -1 ? process.argv[seasonArg + 1] : null

type MatchweekRow = {
  matchweek_id: string
  season_id: string
  matchweek_number: number
  fixture_count: number
  completed_fixture_count: number
  first_kickoff_at: string | null
  last_kickoff_at: string | null
  lock_at: string | null
}

type FixtureRow = {
  matchweek_id: string
  kickoff_at: string
  is_completed: boolean
}

/**
 * Page every row. An unbounded PostgREST select silently truncates at 1,000 —
 * service-role included — and a truncated read here would report "no drift"
 * for every matchweek it never saw, which is the exact failure this script is
 * meant to catch.
 */
async function readAll<T>(table: string, columns: string, filter?: (q: never) => never): Promise<T[]> {
  const out: T[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns).range(from, from + PAGE - 1)
    if (seasonFilter) q = q.eq('season_id', seasonFilter)
    if (filter) q = (filter as unknown as (x: typeof q) => typeof q)(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    const rows = (data ?? []) as unknown as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

function iso(v: string | null): string | null {
  return v == null ? null : new Date(v).toISOString()
}

async function main() {
  const matchweeks = await readAll<MatchweekRow>(
    'league_matchweeks',
    'matchweek_id, season_id, matchweek_number, fixture_count, completed_fixture_count, first_kickoff_at, last_kickoff_at, lock_at',
  )
  const fixtures = await readAll<FixtureRow>('league_fixtures', 'matchweek_id, kickoff_at, is_completed')

  console.log(`Checked ${matchweeks.length} matchweeks against ${fixtures.length} fixtures.`)
  if (matchweeks.length === 0) {
    console.error('FAIL: no matchweeks read. A check that examined nothing is not a pass.')
    process.exit(1)
  }

  const byMatchweek = new Map<string, FixtureRow[]>()
  for (const f of fixtures) {
    const list = byMatchweek.get(f.matchweek_id)
    if (list) list.push(f)
    else byMatchweek.set(f.matchweek_id, [f])
  }

  // A fixture pointing at a matchweek we did not read is drift in its own right.
  const knownIds = new Set(matchweeks.map((m) => m.matchweek_id))
  const orphans = [...byMatchweek.keys()].filter((id) => !knownIds.has(id))

  const problems: string[] = []

  for (const mw of matchweeks) {
    const mine = byMatchweek.get(mw.matchweek_id) ?? []
    const kickoffs = mine.map((f) => new Date(f.kickoff_at).getTime())
    const realFirst = kickoffs.length ? iso(new Date(Math.min(...kickoffs)).toISOString()) : null
    const realLast = kickoffs.length ? iso(new Date(Math.max(...kickoffs)).toISOString()) : null
    const realDone = mine.filter((f) => f.is_completed).length
    const where = `MW${mw.matchweek_number} (${mw.matchweek_id})`

    if (mw.fixture_count !== mine.length)
      problems.push(`${where}: fixture_count=${mw.fixture_count} but ${mine.length} fixtures exist`)
    if (mw.completed_fixture_count !== realDone)
      problems.push(`${where}: completed_fixture_count=${mw.completed_fixture_count} but ${realDone} are completed`)
    if (iso(mw.first_kickoff_at) !== realFirst)
      problems.push(`${where}: first_kickoff_at=${iso(mw.first_kickoff_at)} but min(kickoff)=${realFirst}`)
    if (iso(mw.last_kickoff_at) !== realLast)
      problems.push(`${where}: last_kickoff_at=${iso(mw.last_kickoff_at)} but max(kickoff)=${realLast}`)

    // The CHECK the database itself enforces — restated so a violation that
    // slipped in via a path that skipped the constraint still surfaces.
    if ((mw.fixture_count === 0) !== (mw.lock_at === null))
      problems.push(`${where}: empty-has-no-lock violated — fixture_count=${mw.fixture_count}, lock_at=${mw.lock_at}`)

    // The freeze invariant: a lock, once set, is the matchweek's first kickoff
    // frozen at the moment it passed. Before the lock passes it must track the
    // earliest kickoff; after, it may legitimately lag a rescheduled fixture.
    const locked = mw.lock_at != null && new Date(mw.lock_at).getTime() <= Date.now()
    if (!locked && iso(mw.lock_at) !== realFirst)
      problems.push(`${where}: still open, so lock_at should equal first kickoff — lock_at=${iso(mw.lock_at)}, first=${realFirst}`)

    // The dangerous half of the moved-fixture bug: fixtures present, no lock.
    if (mine.length > 0 && mw.lock_at === null)
      problems.push(`${where}: holds ${mine.length} fixture(s) but lock_at IS NULL — predictions are OPEN for it`)
  }

  for (const id of orphans)
    problems.push(`orphan: ${byMatchweek.get(id)!.length} fixture(s) reference unknown matchweek ${id}`)

  if (problems.length === 0) {
    console.log('OK — every aggregate matches its fixtures, and every invariant holds.')
    return
  }

  console.error(`\nFAIL — ${problems.length} problem(s):`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
