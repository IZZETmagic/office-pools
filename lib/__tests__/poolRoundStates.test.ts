// =============================================================
// Seeding pool_round_states — bracket unchanged, league derived.
// =============================================================
// The branch worth testing is mid-season creation. Decision 2 settled that a
// league pool stays joinable after first lock — "week 3 of 38 is viable; a
// bracket is not". If every matchweek were seeded `locked`, a pool created in
// September would have nothing open and nothing capable of opening it: the
// auto-open sweep only advances a round when the PREVIOUS one completes, and
// none ever would. The pool would look fine and quietly accept no predictions
// for the rest of the season.
// =============================================================

import { describe, it, expect } from 'vitest'
import { seedPoolRoundStates } from '@/lib/poolRoundStates'

type Row = Record<string, unknown>

/** Captures what would be inserted, and serves a canned fixture list. */
function fakeSupabase(fixtures: Array<{ round_number: number | null; match_date: string | null }>) {
  const inserted: Row[] = []
  const client = {
    from(table: string) {
      if (table === 'matches') {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({
                data: fixtures.map((f) => ({ stage: 'regular_season', ...f })),
                error: null,
              }),
            }),
          }),
        }
      }
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

/** Matchweek n, kicking off on the given ISO date (null = date not published). */
function mw(n: number, date: string | null) {
  return { round_number: n, match_date: date }
}

const AUGUST = new Date('2026-08-01T00:00:00Z')

describe('league seeding — pre-season', () => {
  it('opens matchweek 1 and locks the rest, with every deadline known up front', async () => {
    const { client, inserted } = fakeSupabase([
      mw(1, '2026-08-15T11:30:00Z'),
      mw(1, '2026-08-15T14:00:00Z'),
      mw(2, '2026-08-22T11:30:00Z'),
      mw(3, '2026-08-29T11:30:00Z'),
    ])

    const res = await seedPoolRoundStates(client, {
      poolId: 'p1', tournamentId: 't1', predictionMode: 'league_pickem',
      predictionDeadline: null, now: AUGUST,
    })

    expect(res.error).toBeNull()
    expect(res.seeded).toBe(3)
    expect(res.openRoundKey).toBe('mw_1')
    expect(inserted.map((r) => r.state)).toEqual(['open', 'locked', 'locked'])

    // Deadline = the matchweek's FIRST kickoff (11:30, not the 14:00 fixture).
    // Must equal what trg_enforce_prediction_before_kickoff enforces, or the UI
    // and the database disagree about when picks close.
    expect(inserted[0].deadline).toBe('2026-08-15T11:30:00Z')

    // Every deadline is stored immediately — a league calendar is published up
    // front, unlike a bracket where the next round's date is unknown.
    expect(inserted.every((r) => r.deadline !== null)).toBe(true)
  })

  it('derives the round count from the fixtures, not a constant', async () => {
    for (const count of [34, 38, 46]) {
      const fixtures = Array.from({ length: count }, (_, i) =>
        mw(i + 1, `2026-08-${String((i % 28) + 1).padStart(2, '0')}T12:00:00Z`))
      const { client, inserted } = fakeSupabase(fixtures)
      const res = await seedPoolRoundStates(client, {
        poolId: 'p', tournamentId: 't', predictionMode: 'league_pickem',
        predictionDeadline: null, now: new Date('2026-07-01T00:00:00Z'),
      })
      expect(res.seeded, `${count}-matchweek league`).toBe(count)
      expect(inserted).toHaveLength(count)
    }
  })
})

describe('league seeding — mid-season (Decision 2)', () => {
  it('completes the matchweeks already played and opens the next one', async () => {
    const { client, inserted } = fakeSupabase([
      mw(1, '2026-08-15T11:30:00Z'),
      mw(2, '2026-08-22T11:30:00Z'),
      mw(3, '2026-08-29T11:30:00Z'),
      mw(4, '2026-09-12T11:30:00Z'),
    ])

    // Joining on 25 Aug: matchweeks 1 and 2 have kicked off, 3 has not.
    const res = await seedPoolRoundStates(client, {
      poolId: 'p1', tournamentId: 't1', predictionMode: 'league_pickem',
      predictionDeadline: null, now: new Date('2026-08-25T09:00:00Z'),
    })

    expect(res.openRoundKey).toBe('mw_3')
    expect(inserted.map((r) => r.state)).toEqual(['completed', 'completed', 'open', 'locked'])
    expect(inserted[0].completed_at).not.toBeNull()
    expect(inserted[2].opened_at).not.toBeNull()
  })

  it('leaves nothing open once the season is over', async () => {
    const { client, inserted } = fakeSupabase([mw(1, '2026-08-15T11:30:00Z'), mw(2, '2026-08-22T11:30:00Z')])
    const res = await seedPoolRoundStates(client, {
      poolId: 'p1', tournamentId: 't1', predictionMode: 'league_pickem',
      predictionDeadline: null, now: new Date('2027-06-01T00:00:00Z'),
    })
    expect(res.openRoundKey).toBeNull()
    expect(inserted.every((r) => r.state === 'completed')).toBe(true)
  })

  it('treats an undated matchweek as upcoming rather than played', async () => {
    const { client } = fakeSupabase([mw(1, '2026-08-15T11:30:00Z'), mw(2, null)])
    const res = await seedPoolRoundStates(client, {
      poolId: 'p1', tournamentId: 't1', predictionMode: 'league_pickem',
      predictionDeadline: null, now: new Date('2026-08-20T00:00:00Z'),
    })
    expect(res.openRoundKey).toBe('mw_2')
  })
})

describe('league seeding — refuses to create an unusable pool', () => {
  it('errors when the season has not been imported', async () => {
    const { client, inserted } = fakeSupabase([])
    const res = await seedPoolRoundStates(client, {
      poolId: 'p1', tournamentId: 't1', predictionMode: 'league_pickem',
      predictionDeadline: null, now: AUGUST,
    })
    // A league pool with no round states can never accept a prediction and has
    // nothing to open. Better a loud error at creation than a dead pool.
    expect(res.error).toMatch(/no regular_season fixtures/)
    expect(inserted).toHaveLength(0)
  })
})

describe('bracket seeding — unchanged', () => {
  it('still seeds the seven World Cup rounds with group open', async () => {
    const { client, inserted } = fakeSupabase([])
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
