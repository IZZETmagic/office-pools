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
import { earlyKickoff } from '../lib/league/earlyKickoff'

const admin = createAdminClient()

/**
 * How far before its first kickoff a matchweek locks.
 *
 * From `refresh_league_matchweek_window` itself — `agg.first_k - interval '1
 * hour'` — not from observing the data, so that a change to the rule shows up
 * here as a failure rather than being silently absorbed.
 */
const LOCK_LEAD_MS = 60 * 60 * 1000

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

    // The freeze invariant: a lock, once set, is frozen at the moment it passed.
    // Before it passes it must track the earliest kickoff; after, it may
    // legitimately lag a rescheduled fixture.
    //
    // ⚠ CORRECTED 2026-08-28. This asserted `lock_at === first_kickoff`, which
    // has not been the rule since migration 101. Verified against the live
    // function body rather than inferred from the data:
    //
    //   lock_at = CASE WHEN mw.lock_at IS NULL OR mw.lock_at > now()
    //                  THEN agg.first_k - interval '1 hour' ELSE mw.lock_at END
    //
    // A matchweek locks ONE HOUR before its first kickoff. The stale assertion
    // made this script report `FAIL — 36 problem(s)` against a perfectly healthy
    // Premier League season, which is worse than not checking at all: a
    // verification script that always fails is a verification script nobody runs.
    const locked = mw.lock_at != null && new Date(mw.lock_at).getTime() <= Date.now()
    const expectedLock = realFirst === null
      ? null
      : new Date(new Date(realFirst).getTime() - LOCK_LEAD_MS).toISOString()
    if (!locked && iso(mw.lock_at) !== expectedLock)
      problems.push(`${where}: still open, so lock_at should be one hour before the first kickoff — lock_at=${iso(mw.lock_at)}, expected=${expectedLock} (first=${realFirst})`)

    // The dangerous half of the moved-fixture bug: fixtures present, no lock.
    if (mine.length > 0 && mw.lock_at === null)
      problems.push(`${where}: holds ${mine.length} fixture(s) but lock_at IS NULL — predictions are OPEN for it`)
  }

  for (const id of orphans)
    problems.push(`orphan: ${byMatchweek.get(id)!.length} fixture(s) reference unknown matchweek ${id}`)

  // ------------------------------------------------------------------------
  // The season's DRAG PROFILE — reported, never a failure
  // ------------------------------------------------------------------------
  // A matchweek locks at its earliest kickoff, so a fixture brought forward
  // drags the whole round's deadline with it. Nothing is wrong when that
  // happens — `planRehome` deliberately leaves such a fixture where it is
  // rather than adding it to a week people have finished picking — but it is
  // the difference between "pick by Saturday, played Saturday" and La Liga
  // matchweek 6: picks close 3 September, nine of the ten games played 16th.
  //
  // Printed because it was DISCOVERED rather than known. It cost an afternoon
  // to find by hand on the day a second league landed, and the only reason to
  // find it by hand twice would be forgetting to print it once.
  //
  // Measured 2026-08-28: Premier League 0 of 38, La Liga 3 of 38 (rounds 1, 2
  // and 6), worst lead 13 days. `lib/league/rehome.ts` measured three real
  // Premier League seasons at a median 6 days, so the cost PER OCCURRENCE is
  // the same in both countries — it is the frequency that differs.
  //
  // ⚠ Any count here is a FLOOR. The provider publishes reschedules
  // progressively, so a round in March has not been moved yet.
  const dragged = matchweeks
    .map((mw) => {
      const kickoffs = (byMatchweek.get(mw.matchweek_id) ?? []).map((f) => f.kickoff_at)
      return { mw, drag: earlyKickoff(kickoffs) }
    })
    .filter((d): d is { mw: typeof matchweeks[number]; drag: NonNullable<ReturnType<typeof earlyKickoff>> } => d.drag !== null)

  if (dragged.length === 0) {
    console.log(`Drag profile: 0 of ${matchweeks.length} rounds lock early. Every round is played together.`)
  } else {
    const worst = Math.max(...dragged.map((d) => d.drag.leadDays))
    const avg = Math.round(dragged.reduce((s, d) => s + d.drag.leadDays, 0) / dragged.length)
    console.log(
      `Drag profile: ${dragged.length} of ${matchweeks.length} rounds lock early ` +
      `— worst ${worst} days, average ${avg}. A FLOOR: later reschedules are not published yet.`,
    )
    for (const d of dragged) {
      const ahead = d.mw.lock_at != null && new Date(d.mw.lock_at) > new Date()
      console.log(
        `  - MW${d.mw.matchweek_number}: locks ${iso(d.mw.lock_at)?.slice(0, 10)}, ` +
        `bulk played ${d.drag.bulkAt.slice(0, 10)} (${d.drag.leadDays}d), ` +
        `${d.drag.count} early${ahead ? '   <-- STILL AHEAD' : ''}`,
      )
    }
  }

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
