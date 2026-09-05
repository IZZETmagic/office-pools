// =============================================================
// The retired_at filter must not quietly disappear
// =============================================================
// Migration 056 made an entry survive its membership. Three of the four doors
// worked with no read change at all, because they delete the pool_members row
// and every read reaches an entry THROUGH it — a detached entry fails the inner
// join everywhere at once.
//
// `stop participating` keeps the membership on purpose, so that structural
// protection does not apply and TWO explicit filters carry the behaviour:
//
//   migration 057   `AND pe.retired_at IS NULL`  -> retired entries stop scoring
//   lib/poolData.ts `.is('pool_entries.retired_at', null)` -> and leave the board
//
// Delete either one and nothing breaks loudly. No test fails, no error is
// logged, no page 500s — a member who stopped participating simply starts
// scoring again and reappears on the leaderboard, which is the exact bug 057
// was written to fix and the exact shape of the 2026-08-22 dropped-column
// outage: wrong, silently, at HTTP 200.
//
// `scripts/verify-soft-delete.ts` proves the behaviour properly, end to end
// against a real database — but it needs production credentials, so it cannot
// run in `npm test`. This file is the cheap always-on half: it does not prove
// the filters WORK, only that nobody removed them. The two are complementary
// and both are wanted.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('the leaderboard read filters retired entries', () => {
  const poolData = read('lib/poolData.ts')

  it('filters every pool_members -> pool_entries read', () => {
    // Both reads gather entries pool-wide: getPoolDataUncached feeds every
    // leaderboard surface, getPoolBulkData feeds match scores and predictions.
    const gathers = poolData.match(/\.from\('pool_members'\)/g) ?? []
    const filters = poolData.match(/\.is\('pool_entries\.retired_at', null\)/g) ?? []

    expect(gathers.length).toBeGreaterThan(0)
    expect(filters).toHaveLength(gathers.length)
  })

  it('filters the EMBEDDED resource, never with !inner', () => {
    // A `!inner` embed would drop the MEMBER as well as the entry, so somebody
    // who stopped participating would vanish from the member list entirely
    // rather than just stopping competing. Verified against production: a
    // non-inner embedded filter returns 3 members / 0 entries, not 0 members.
    expect(poolData).not.toMatch(/pool_entries!inner/)
  })
})

describe('the league scoring engine filters retired entries', () => {
  const migration = read('lib/migrations/057_retired_entries_stop_scoring.sql')

  it('carries the predicate exactly once, in the entry selector', () => {
    // Executable lines only — the header prose quotes the predicate too, and a
    // comment is not a filter.
    const sql = migration
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
    const hits = sql.match(/AND pe\.retired_at IS NULL/g) ?? []
    expect(hits).toHaveLength(1)
  })

  it('still reaches entries through pool_members', () => {
    // The predicate is an ADDITION to the structural protection, not a
    // replacement for it. If this join were ever loosened to a LEFT JOIN, a
    // DETACHED entry would come back into scope and the other three doors would
    // silently regress.
    expect(migration).toMatch(/JOIN pool_members pm\s+ON pm\.member_id = pe\.member_id/)
  })

  it('does not delete a retired entry\'s score rows', () => {
    // Decision 15 restores a season IN FULL, including the matchweeks that
    // completed while the member was away. That is only possible if the points
    // survive retirement, so this engine must never delete them.
    expect(migration).not.toMatch(/DELETE\s+FROM\s+league_match_scores/i)
    expect(migration).not.toMatch(/DELETE\s+FROM\s+league_entry_totals/i)
  })
})

// =============================================================
// Scored, ranked, counted, billed — the four places the filter belongs
// =============================================================
// The rule, and it is narrower than "filter everywhere":
//
//   Filter `retired_at` wherever an entry is SCORED, RANKED, COUNTED as a
//   competitor, or BILLED. Never on a per-entry detail view.
//
// That boundary is deliberate. Migration 056 rejected filtering all 101
// `pool_entries` reads as per-site fragility, and a detail view showing a
// retired entry is CORRECT — you should still be able to open the entry you
// stopped competing with. What is NOT correct is that entry drawing a rank,
// collecting a trophy, owing a fee, or being swept back into scoring.
//
// Three of the four retirement doors delete the membership, so the entry
// detaches and falls out of every read at once. The "stopped" door keeps the
// membership on purpose — so for that one, every site below is load-bearing on
// its own, and removing any of them breaks nothing loudly.

describe('a retired entry is not scored, ranked, counted or billed', () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

  const sites: Array<[string, string]> = [
    // RANKED + awarded. This is the phone's leaderboard; poolData.ts covers the
    // web page only. MVP is `leaderboard[0]`, so the filter also decides the
    // trophy — a member who led when they retired was winning the pool's MVP.
    ['app/api/pools/[pool_id]/leaderboard/route.ts', 'the mobile leaderboard and its trophies'],
    // SCORED + RANKED. Migration 057 gave the league engine this predicate;
    // this is the World Cup half, which wrote current_rank to retirees and left
    // a permanent 1, 2, 4, 5 gap on a board that hides them.
    ['lib/scoring/recalculate.ts', 'the World Cup scoring engine'],
    // SCORED — and worse, it SETS has_submitted_predictions, one of the only two
    // doors into the WC scoring selectors, re-entering a retired entry into the
    // population 057 removed it from.
    ['lib/auto-submit.ts', 'the deadline auto-submit sweep'],
    // BILLED. Both tabs; a retired entry owes nothing and is owed nothing.
    ['app/pools/[pool_id]/admin/FeesTab.tsx', 'the web fees tab'],
    ['mobile/components/pool-detail/FeesTab.tsx', 'the mobile fees tab'],
    // COUNTED. The guard that stops a member reaching zero entries counted
    // retired rows, so it passed and let them retire their last competing one.
    ['app/api/pools/[pool_id]/entries/route.ts', 'the last-entry guard'],
    // COUNTED — the denominator of the admin Submitted/Pending badge.
    ['app/api/pools/[pool_id]/rounds/route.ts', 'the round submission denominator'],
    // RANKED, every 30s per viewer.
    ['app/api/pools/[pool_id]/live/route.ts', 'the live delta poll'],
  ]

  it.each(sites)('%s still filters retired entries (%s)', (path) => {
    expect(read(path)).toMatch(/retired_at/)
  })

  it('auto-submit filters every entry READ, and its write inherits that', () => {
    // Two reads: the full-tournament sweep and the progressive per-round path.
    // Both feed the same `has_submitted_predictions` write, so one filter is
    // not enough.
    //
    // The THIRD `.from('pool_entries')` is that write — an `.update()` keyed on
    // ids taken from the filtered read above it, so it needs no predicate of
    // its own and must not be counted as if it did. Asserting a flat ratio here
    // failed for exactly that reason.
    const src = read('lib/auto-submit.ts')
    const segments = src.split(/\.from\('pool_entries'\)/).slice(1)
    expect(segments.length).toBeGreaterThan(0)

    const reads = segments.filter((seg) => /^\s*\.select\(/.test(seg))
    const writes = segments.filter((seg) => /^\s*\.update\(/.test(seg))
    expect(reads.length + writes.length, 'a pool_entries call is neither a select nor an update')
      .toBe(segments.length)
    expect(reads.length).toBeGreaterThanOrEqual(2)

    for (const seg of reads) {
      // Within this call's own chain — up to the next statement, so a filter on
      // a later query cannot satisfy an earlier one.
      const chain = seg.split(/\n\s*\n/)[0]
      expect(chain).toMatch(/\.is\('retired_at', null\)/)
    }
  })

  it('the fees tabs filter the EMBEDDED resource, never with !inner', () => {
    // Same reasoning as poolData.ts: an inner embed would drop the MEMBER too,
    // so someone who stopped participating would vanish from the fee list
    // entirely rather than just stopping owing.
    for (const p of [
      'app/pools/[pool_id]/admin/FeesTab.tsx',
      'mobile/components/pool-detail/FeesTab.tsx',
    ]) {
      const src = read(p)
      expect(src).toMatch(/\.is\('pool_entries\.retired_at', null\)/)
      expect(src).not.toMatch(/pool_entries!inner/)
    }
  })
})
