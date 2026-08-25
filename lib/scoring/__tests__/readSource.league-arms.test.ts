// =============================================================
// readSource — the two league arms that are NOT stubs.
// =============================================================
// Five readers in readSource.ts had no league arm and announced it through
// `leagueNotImplemented()`, which logs a console.error and returns []. Two of
// those five were wrong to be in that list, for opposite reasons:
//
//   readBonusScores  — [] is the COMPLETE answer, not a placeholder. Migration
//                      050 deliberately never built `league_bonus_scores`
//                      ("a league writes zero bonus rows in v1"). The log was
//                      reporting a designed state as a defect on every league
//                      pool page load.
//   readRecentForm   — the data was there all along in `league_match_scores`,
//                      written by every league engine. The form dots were blank
//                      on the pools list and the dashboard for no reason.
//
// What these tests guard is the failure mode the whole file exists to prevent:
// a league source falling through a `source === 'shadow' ? … : …` ternary into
// the World Cup's tables, finding nothing, and returning empty at HTTP 200. The
// compiler cannot see it, because a ternary is not an exhaustive switch — so
// the assertion is on WHICH TABLE was read, not just on the value returned.
// =============================================================

import { describe, it, expect, vi } from 'vitest'
import { readBonusScores, readRecentForm } from '@/lib/scoring/readSource'

/** Fails the test if the database is touched at all. */
function adminThatMustNotBeQueried() {
  return {
    from: vi.fn((table: string) => {
      throw new Error(`readSource queried "${table}" for a league pool — it must not`)
    }),
  } as never
}

/**
 * Records the table name, and answers the exact chain readRecentForm builds:
 * .select().eq().order().limit() -> { data, error }.
 */
function adminRecordingTable(rows: Array<{ score_type: string; fixture_number: number }>) {
  const seen: string[] = []
  const columns: string[] = []
  const admin = {
    from: (table: string) => {
      seen.push(table)
      return {
        select: (cols: string) => {
          columns.push(cols)
          return {
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: rows, error: null }),
              }),
            }),
          }
        },
      }
    },
  }
  return { admin: admin as never, seen, columns }
}

describe('readBonusScores — a league has no bonuses', () => {
  it('returns empty without reading anything', async () => {
    const rows = await readBonusScores(adminThatMustNotBeQueried(), ['entry-1'], 'league')
    expect(rows).toEqual([])
  })

  it('does not log — an expected state is not an error', async () => {
    // The regression this exists for. As a leagueNotImplemented() stub this
    // wrote a console.error on EVERY league pool render, which surfaced in the
    // Next dev overlay as a Console Error and in the production logs as noise.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await readBonusScores(adminThatMustNotBeQueried(), ['entry-1'], 'league')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('readRecentForm — a league reads its own scores', () => {
  it('reads league_match_scores, never the World Cup tables', async () => {
    const { admin, seen } = adminRecordingTable([])
    await readRecentForm(admin, 'entry-1', 'league', 5)
    expect(seen).toEqual(['league_match_scores'])
    expect(seen).not.toContain('match_scores')
    expect(seen).not.toContain('shadow_match_scores')
  })

  it('orders by fixture_number, which is season-wide and not per-matchweek', async () => {
    // Load-bearing: `league_fixtures.fixture_number` runs 1..380 across the
    // whole season (MW1 is 1-10, MW2 is 11-20), so "the last five" really is
    // the last five. Were it to restart each matchweek, this ordering would
    // return five arbitrary fixtures and the dots would be nonsense.
    const { admin, columns } = adminRecordingTable([])
    await readRecentForm(admin, 'entry-1', 'league', 5)
    expect(columns[0]).toContain('fixture_number')
    expect(columns[0]).not.toContain('match_number')
  })

  it('returns the score types oldest-first, matching the World Cup arm', async () => {
    // The query is newest-first (limit N off the top); the dots render
    // left-to-right in time order, so the reader reverses. Same contract as the
    // prod/shadow branch — a league card must not read backwards.
    const { admin } = adminRecordingTable([
      { score_type: 'exact', fixture_number: 20 },
      { score_type: 'miss', fixture_number: 19 },
      { score_type: 'winner', fixture_number: 18 },
    ])
    const form = await readRecentForm(admin, 'entry-1', 'league', 5)
    expect(form).toEqual(['winner', 'miss', 'exact'])
  })

  it('does not log — the arm is real, so there is nothing to announce', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { admin } = adminRecordingTable([])
    await readRecentForm(admin, 'entry-1', 'league', 5)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
