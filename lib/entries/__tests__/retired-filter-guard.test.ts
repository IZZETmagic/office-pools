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
