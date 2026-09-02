// =============================================================
// The facts a league pool card needs, and the four ways it gets them wrong
// =============================================================
// Not the pick counting — that is a join across three tables and is verified
// against a real database by scripts/verify-league-pool-cards.ts, because
// reimplementing the join in a stub would only test the stub. What is pinned
// here is the shape of the answer, which is where the judgement calls are:
//
//   1. the clock is the matchweek lock, NOT `pools.prediction_deadline`
//   2. except in Table mode, where it is the table lock
//   3. Table and Last Man Standing are ONE decision, not N
//   4. the matchweek count comes from the season, not from 38
//
// =============================================================

import { describe, it, expect } from 'vitest'
import { readLeagueCardFacts } from '@/lib/league/poolCards'

const SEASON = 'season-eng'
const HOUR = 3600_000
const NOW = Date.now()

/** 38 matchweeks: 1 and 2 played out, 3 open, the rest locked behind it. */
function matchweeks(count = 38) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1
    return {
      matchweek_id: `mw-${n}`,
      matchweek_number: n,
      fixture_count: 10,
      completed_fixture_count: n <= 2 ? 10 : 0,
      lock_at: new Date(NOW + (n - 2) * 24 * HOUR).toISOString(),
      first_kickoff_at: null,
      season_id: SEASON,
    }
  })
}

/**
 * A supabase stub that answers each table from a fixture map. Any table the
 * code asks for that is not listed returns empty, which is what production
 * would do too — the point of the module is that empty must not be silent.
 */
function stub(tables: Record<string, unknown[]>) {
  const q = (rows: unknown[]) => {
    const chain = {
      select: () => chain,
      in: () => chain,
      is: () => chain,
      eq: () => chain,
      then: (res: (v: { data: unknown[]; error: null }) => unknown) => res({ data: rows, error: null }),
    }
    return chain
  }
  return {
    from: (t: string) => q(tables[t] ?? []),
    /**
     * The reveal gate, which the module ASKS rather than mirrors (see the
     * `openRevealed` note in poolCards.ts).
     *
     * ⚠ ANSWERS `true`, so these tests keep exercising the path where the open
     * week's duel IS revealed — which is what every assertion here was written
     * against back when a TypeScript mirror decided it. A stub returning false
     * would silently empty `opponentName` and the mode/decision assertions
     * below would still pass, which is the wrong kind of green.
     */
    rpc: (fn: string) =>
      Promise.resolve(
        fn === 'league_duel_is_revealed'
          ? { data: true, error: null }
          : { data: null, error: null },
      ),
  } as never
}

const pickemPool = {
  poolId: 'p1',
  seasonId: SEASON,
  leagueMode: 'pickem',
  tableLockAt: null,
  entryId: 'e1',
}

describe('the clock', () => {
  it('is the open matchweek’s lock, not the season end', async () => {
    const facts = await readLeagueCardFacts(
      stub({ league_matchweeks: matchweeks() }),
      [pickemPool],
    )
    const f = facts.get('p1')!
    expect(f.openMatchweekNumber).toBe(3)
    expect(f.deadlineAt).toBe(matchweeks()[2].lock_at)
  })

  it('is the TABLE lock in Table mode, which has no matchweek', async () => {
    // "One decision, all season" is the whole mode — its deadline is a pool
    // column with no matchweek and no fixture behind it (migration 099).
    const tableLock = new Date(NOW + 5 * HOUR).toISOString()
    const facts = await readLeagueCardFacts(
      stub({ league_matchweeks: matchweeks(), league_table_predictions: [] }),
      [{ ...pickemPool, leagueMode: 'table', tableLockAt: tableLock }],
    )
    expect(facts.get('p1')!.deadlineAt).toBe(tableLock)
  })

  it('is null once the season is over', async () => {
    // Every matchweek played: nothing is open, so there is nothing due.
    const done = matchweeks().map((m) => ({ ...m, completed_fixture_count: 10 }))
    const facts = await readLeagueCardFacts(stub({ league_matchweeks: done }), [pickemPool])
    const f = facts.get('p1')!
    expect(f.openMatchweekNumber).toBeNull()
    expect(f.deadlineAt).toBeNull()
  })
})

describe('how many decisions a mode asks for', () => {
  it('is one per fixture for Pick’em and Showdown', async () => {
    for (const leagueMode of ['pickem', 'showdown']) {
      const facts = await readLeagueCardFacts(
        stub({ league_matchweeks: matchweeks(), league_fixtures: [], league_predictions: [] }),
        [{ ...pickemPool, leagueMode }],
      )
      expect(facts.get('p1')!.totalPicks).toBe(10)
    }
  })

  it('is ONE for Table and Last Man Standing', async () => {
    // A table order is written as a single reorder of every club and an LMS
    // week is one club, so neither can be half-done. Modelling Table as 20 of
    // 20 would put a member who has filed in the dashboard's
    // started-but-not-finished bucket until the twentieth club landed.
    for (const leagueMode of ['table', 'last_man_standing']) {
      const facts = await readLeagueCardFacts(
        stub({ league_matchweeks: matchweeks() }),
        [{ ...pickemPool, leagueMode }],
      )
      expect(facts.get('p1')!.totalPicks).toBe(1)
    }
  })

  it('counts a filed table as done', async () => {
    const facts = await readLeagueCardFacts(
      stub({
        league_matchweeks: matchweeks(),
        league_table_predictions: [{ entry_id: 'e1' }],
      }),
      [{ ...pickemPool, leagueMode: 'table', tableLockAt: new Date(NOW + HOUR).toISOString() }],
    )
    const f = facts.get('p1')!
    expect(f.madePicks).toBe(1)
    expect(f.hasSubmitted).toBe(true)
  })

  it('counts an unfiled table as outstanding', async () => {
    const facts = await readLeagueCardFacts(
      stub({ league_matchweeks: matchweeks(), league_table_predictions: [] }),
      [{ ...pickemPool, leagueMode: 'table', tableLockAt: new Date(NOW + HOUR).toISOString() }],
    )
    expect(facts.get('p1')!.hasSubmitted).toBe(false)
  })
})

describe('the matchweek count', () => {
  it('⚠ comes from the season, never from 38', async () => {
    // Twenty clubs play 38 rounds; Bundesliga and Ligue 1 are eighteen and 34.
    // Hard-coding 38 would caption a German card "MW 3 of 38" all season.
    const facts = await readLeagueCardFacts(
      stub({ league_matchweeks: matchweeks(34) }),
      [pickemPool],
    )
    expect(facts.get('p1')!.matchweekCount).toBe(34)
  })
})

describe('degrading rather than throwing', () => {
  it('returns a row for every pool even with no season', async () => {
    // A card is decoration around a link; a league table that cannot be read
    // must not take the pools list down with it.
    const facts = await readLeagueCardFacts(stub({}), [{ ...pickemPool, seasonId: null }])
    const f = facts.get('p1')!
    expect(f.openMatchweekNumber).toBeNull()
    expect(f.hasSubmitted).toBe(false)
    expect(f.totalPicks).toBe(0)
  })

  it('never claims submitted when there is nothing to submit to', async () => {
    // `hasSubmitted` gates the action pill. Defaulting it true on missing data
    // would tell a member they had picked when they had not.
    const facts = await readLeagueCardFacts(stub({}), [{ ...pickemPool, seasonId: null }])
    expect(facts.get('p1')!.hasSubmitted).toBe(false)
  })
})
