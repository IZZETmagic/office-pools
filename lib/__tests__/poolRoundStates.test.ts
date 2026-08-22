// =============================================================
// Seeding pool_round_states — bracket unchanged, league refused until L7.
// =============================================================
// This file used to cover league seeding in detail. It could, because leagues
// were built on World Cup furniture: matchweeks were `matches` rows with
// stage='regular_season', told apart by `matches.round_number`.
//
// Migration 049 dropped that column and 050 moved leagues into
// `league_matchweeks`, so the branch those tests exercised cannot run at all —
// it would issue a select PostgREST answers with 42703. `seedPoolRoundStates`
// now refuses a league pool outright, and that refusal is what is tested here.
//
// ⚠ THE SPECIFICATION IS NOT ABANDONED, ONLY UNIMPLEMENTED. The behaviour the
// deleted tests pinned down is what L7's `league_matchweeks`-backed seeder must
// reproduce, and it is written out at the bottom of this file as a skipped
// suite so it is restored rather than reinvented. The load-bearing one is
// mid-season creation: Decision 2 settled that a league pool stays joinable
// after first lock — "week 3 of 38 is viable; a bracket is not". If every
// matchweek were seeded `locked`, a pool created in September would have
// nothing open and nothing capable of opening it, because the auto-open sweep
// only advances a round when the PREVIOUS one completes. The pool would look
// fine and quietly accept no predictions for the rest of the season.
// =============================================================

import { describe, it, expect } from 'vitest'
import { seedPoolRoundStates } from '@/lib/poolRoundStates'

type Row = Record<string, unknown>

/** Captures what would be inserted. Nothing reads `matches` any more. */
function fakeSupabase() {
  const inserted: Row[] = []
  const client = {
    from() {
      return {
        insert: async (rows: Row[]) => {
          inserted.push(...rows)
          return { error: null }
        },
      }
    },
  }
  return { client: client as never, inserted }
}

const AUGUST = new Date('2026-08-01T00:00:00Z')

describe('league seeding — refused until the L7 seeder exists', () => {
  it('returns an error rather than a zero seed', async () => {
    const { client, inserted } = fakeSupabase()
    const res = await seedPoolRoundStates(client, {
      poolId: 'p1', tournamentId: 't1', predictionMode: 'league_pickem',
      predictionDeadline: null, now: AUGUST,
    })

    // `{ seeded: 0, error: null }` would read as success at the call site, and
    // a league pool with no round states can neither accept a prediction nor
    // open one. The refusal has to be loud.
    expect(res.error).toBeTruthy()
    expect(res.error).toMatch(/league_matchweeks/)
    expect(res.seeded).toBe(0)
    expect(res.openRoundKey).toBeNull()
    expect(inserted).toHaveLength(0)
  })

  it('does not touch pool_round_states at all', async () => {
    const { client, inserted } = fakeSupabase()
    await seedPoolRoundStates(client, {
      poolId: 'p1', tournamentId: 't1', predictionMode: 'league_pickem',
      predictionDeadline: '2026-08-21T19:00:00Z', now: AUGUST,
    })
    // A half-seeded league pool is worse than an unseeded one.
    expect(inserted).toHaveLength(0)
  })
})

describe('bracket seeding — unchanged', () => {
  it('still seeds the seven World Cup rounds with group open', async () => {
    const { client, inserted } = fakeSupabase()
    const res = await seedPoolRoundStates(client, {
      poolId: 'p1', tournamentId: 't1', predictionMode: 'progressive',
      predictionDeadline: '2026-06-11T00:00:00Z', now: AUGUST,
    })

    expect(res.error).toBeNull()
    expect(res.seeded).toBe(7)
    expect(res.openRoundKey).toBe('group')
    expect(inserted.map((r) => r.round_key)).toEqual([
      'group', 'round_32', 'round_16', 'quarter_final', 'semi_final', 'third_place', 'final',
    ])
    expect(inserted[0].state).toBe('open')
    expect(inserted[0].deadline).toBe('2026-06-11T00:00:00Z')
    // Later rounds keep no deadline — a bracket does not know its dates yet.
    expect(inserted.slice(1).every((r) => r.state === 'locked' && r.deadline === null)).toBe(true)
  })
})

// =============================================================
// L7 — the specification the deleted tests encoded.
// =============================================================
// Unskip these against the `league_matchweeks`-backed seeder. They are written
// against matchweek rows rather than `matches` rows, which is the only thing
// that changes; every assertion is the one that passed before migration 049.
// =============================================================
describe.skip('L7 — league seeding from league_matchweeks', () => {
  it('pre-season: opens matchweek 1, locks the rest, every deadline known up front', () => {
    // A league publishes its whole calendar before a ball is kicked, so each
    // matchweek's deadline — its first kickoff — is stored at creation rather
    // than filled in when the round opens. That is what lets the UI say
    // "Matchweek 7 locks Sat 12:30" in August.
    //
    // Expect: state[0]='open' with deadline = mw1.lock_at; states[1..] ='locked'
    // with a deadline each (NOT null, unlike a bracket).
  })

  it('pre-season: derives the round count from the season, not a constant', () => {
    // 20 clubs -> 38 matchweeks, 18 -> 34, the Championship's 24 -> 46.
    // Expect: seeded === season.matchweek_count for each.
  })

  it('mid-season: completes the matchweeks already played and opens the next', () => {
    // Joining 25 Aug with matchweeks kicking off 15, 22, 29 Aug and 12 Sep:
    // expect openRoundKey='mw_3' and states ['completed','completed','open','locked'],
    // with completed_at set on the first and opened_at set on the third.
  })

  it('mid-season: leaves nothing open once the season is over', () => {
    // Expect openRoundKey=null and every state 'completed'.
  })

  it('mid-season: treats an undated matchweek as upcoming rather than played', () => {
    // A matchweek with no fixture date cannot be judged past.
    // Expect openRoundKey='mw_2' when mw1 has kicked off and mw2 has no date.
    //
    // Under the league schema "undated" means lock_at IS NULL, which since
    // migration 051 also means fixture_count = 0 — an empty matchweek. The L7
    // seeder must map that to a terminal state, never 'open'.
  })

  it('refuses when the season has no matchweeks', () => {
    // Expect a loud error and zero inserts — never { seeded: 0, error: null }.
  })
})
