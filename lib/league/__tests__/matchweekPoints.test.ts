// =============================================================
// Shaping what migration 130 returns
// =============================================================
// `readMatchweekPoints` stopped selecting raw score rows and started calling
// `league_matchweek_points` (migration 130), which aggregates in SQL and hands
// back one jsonb object. What is left in TypeScript is shaping, and shaping is
// where the one real trap lives:
//
//   ⚠ JSON OBJECT KEYS ARE TEXT. `fixture_number` comes back as `"3"`, never
//     `3`. A `Map` keyed by `"3"` renders identically to one keyed by `3` in a
//     debugger and misses every numeric lookup — so the team sheet would draw
//     every fixture blank, with nothing in a log and no error anywhere.
//
// The SQL half of 130 cannot be tested here — it needs a Postgres. Its own
// header carries the rollback-in-a-transaction check to run instead.
// =============================================================

import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readMatchweekPoints } from '../duels'

/** A client that answers exactly one RPC, and records how it was called. */
function fakeAdmin(
  payload: unknown,
  error: { message: string } | null = null,
): { client: SupabaseClient; calls: Array<{ fn: string; args: unknown }> } {
  const calls: Array<{ fn: string; args: unknown }> = []
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args })
      return { data: payload, error }
    },
    from() {
      throw new Error('readMatchweekPoints must not read a table directly — 130 moved this to SQL')
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'

describe('readMatchweekPoints', () => {
  it('calls the aggregate rather than selecting score rows', async () => {
    const { client, calls } = fakeAdmin({ totals: {}, per_fixture: {} })
    await readMatchweekPoints(client, 'pool-1', 2)
    expect(calls).toHaveLength(1)
    expect(calls[0].fn).toBe('league_matchweek_points')
    expect(calls[0].args).toEqual({ p_pool_id: 'pool-1', p_matchweek_number: 2 })
    // `from()` throws, so reaching the table at all would have failed above.
  })

  it('converts the text fixture keys to numbers', async () => {
    const { client } = fakeAdmin({
      totals: { [A]: 400, [B]: 250 },
      per_fixture: { [A]: { '3': 100, '7': 300 }, [B]: { '3': 250 } },
    })
    const { points, perFixture, error } = await readMatchweekPoints(client, 'pool-1', 2)
    expect(error).toBeNull()
    expect(points.get(A)).toBe(400)
    expect(points.get(B)).toBe(250)

    const a = perFixture.get(A)!
    // The assertion that matters: a NUMBER finds it.
    expect(a.get(3)).toBe(100)
    expect(a.get(7)).toBe(300)
    // And the string does not, which is what the bug would have looked like.
    expect(a.get('3' as unknown as number)).toBeUndefined()
    expect([...a.keys()].every((k) => typeof k === 'number')).toBe(true)
  })

  it('an unscored matchweek is empty maps, not a crash', async () => {
    // The normal state of every matchweek until the first goal — and the case
    // where 130's COALESCE is load-bearing, because jsonb_object_agg over zero
    // rows is NULL rather than {}.
    for (const payload of [{ totals: {}, per_fixture: {} }, {}, { totals: null, per_fixture: null }]) {
      const { client } = fakeAdmin(payload)
      const { points, perFixture, error } = await readMatchweekPoints(client, 'pool-1', 2)
      expect(error).toBeNull()
      expect(points.size).toBe(0)
      expect(perFixture.size).toBe(0)
    }
  })

  it('a zero is kept, not dropped', async () => {
    // A fixture the member got wrong scores 0, and the team sheet has to draw
    // it as 0 rather than as "no pick". Falsy-checking would lose it.
    const { client } = fakeAdmin({ totals: { [A]: 0 }, per_fixture: { [A]: { '4': 0 } } })
    const { points, perFixture } = await readMatchweekPoints(client, 'pool-1', 2)
    expect(points.get(A)).toBe(0)
    expect(perFixture.get(A)!.get(4)).toBe(0)
    expect(perFixture.get(A)!.has(4)).toBe(true)
  })

  it('surfaces an RPC error instead of returning a confident zero', async () => {
    // The whole reason 130 is service_role-only: a user-scoped call now fails
    // loudly. That is only an improvement if the caller passes the failure on
    // rather than handing back an empty map that reads as "nobody scored".
    const { client } = fakeAdmin(null, { message: 'permission denied for function league_matchweek_points' })
    const { points, perFixture, error } = await readMatchweekPoints(client, 'pool-1', 2)
    expect(error).toMatch(/permission denied/)
    expect(points.size).toBe(0)
    expect(perFixture.size).toBe(0)
  })
})
