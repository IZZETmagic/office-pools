// =============================================================
// Retrying a replace-all write
// =============================================================
// Two things must hold, and they pull in opposite directions:
//
//   · a transport fault must be retried, because it is the one that cost four
//     consecutive backfill runs a fixture on 2026-09-09;
//   · a constraint violation must NOT be, because Postgres has already decided
//     and three round trips only delay the report.
//
// The discriminator was measured against production, not guessed:
//   constraint  { code: '23514', ... }      unreachable  { code: '', ... }
// =============================================================

import { describe, expect, it, vi } from 'vitest'

import {
  createRetryBudget,
  isTransportError,
  REPLACE_ATTEMPTS,
  replaceRows,
} from '../replaceRows'

/** An admin client whose rpc returns the queued results in order. */
function client(results: Array<{ error: unknown }>) {
  const rpc = vi.fn(async () => results.shift() ?? { error: null })
  return { client: { rpc } as never, rpc }
}
const noSleep = async () => undefined

const PG = { message: 'new row violates check constraint', code: '23514' }
const NET = { message: 'TypeError: fetch failed', code: '' }

describe('isTransportError — the code is the signal', () => {
  it('⚠ a Postgres error always carries a SQLSTATE', () => {
    expect(isTransportError(PG)).toBe(false)
    expect(isTransportError({ message: 'duplicate key', code: '23505' })).toBe(false)
  })

  it('⚠ a transport failure has an empty code', () => {
    expect(isTransportError(NET)).toBe(true)
    expect(isTransportError({ message: 'socket hang up', code: '' })).toBe(true)
    expect(isTransportError({ message: 'whatever' })).toBe(true)
    expect(isTransportError({ message: 'x', code: null })).toBe(true)
  })

  it('⚠ it does NOT match on the message text', () => {
    // Matching 'fetch failed' would miss a DNS failure, a TLS reset and a
    // pooler timeout — all equally worth retrying, none of which say that.
    expect(isTransportError({ message: 'getaddrinfo ENOTFOUND', code: '' })).toBe(true)
    // …and would wrongly retry a constraint error that happens to mention it.
    expect(isTransportError({ message: 'fetch failed', code: '23514' })).toBe(false)
  })

  it('no error is not an error', () => {
    expect(isTransportError(null)).toBe(false)
  })
})

describe('replaceRows', () => {
  it('a clean write is one call', async () => {
    const { client: c, rpc } = client([{ error: null }])
    const r = await replaceRows(c, 'replace_match_events', 'fx-1', [{ a: 1 }], undefined, noSleep)
    expect(r.error).toBeNull()
    expect(r.attempts).toBe(1)
    expect(rpc).toHaveBeenCalledWith('replace_match_events', {
      p_fixture_id: 'fx-1',
      p_rows: [{ a: 1 }],
    })
  })

  it('⚠⚠ a transport fault is retried and can succeed', async () => {
    // The exact 2026-09-09 sequence: one blip, then it works.
    const { client: c, rpc } = client([{ error: NET }, { error: null }])
    const r = await replaceRows(c, 'replace_match_player_stats', 'fx-1', [], undefined, noSleep)
    expect(r.error).toBeNull()
    expect(r.attempts).toBe(2)
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('gives up after the attempt budget and reports the last error', async () => {
    const { client: c, rpc } = client([{ error: NET }, { error: NET }, { error: NET }])
    const r = await replaceRows(c, 'replace_match_events', 'fx-1', [], undefined, noSleep)
    expect(rpc).toHaveBeenCalledTimes(REPLACE_ATTEMPTS)
    expect(r.error).toEqual(NET)
    expect(r.attempts).toBe(REPLACE_ATTEMPTS)
  })

  it('⚠⚠ a constraint violation is NOT retried', async () => {
    // Postgres has already decided. Three round trips would only delay the
    // report and bury the real fault behind a pause.
    const { client: c, rpc } = client([{ error: PG }, { error: null }])
    const r = await replaceRows(c, 'replace_match_player_stats', 'fx-1', [], undefined, noSleep)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(r.error).toEqual(PG)
  })

  it('backs off between attempts, and not before the first', async () => {
    const slept: number[] = []
    const { client: c } = client([{ error: NET }, { error: NET }, { error: NET }])
    await replaceRows(c, 'replace_match_events', 'fx-1', [], undefined, async (ms) => {
      slept.push(ms)
    })
    expect(slept).toEqual([250, 500])
  })
})

describe('the retry budget — "Supabase is down" must not become "the tick times out"', () => {
  it('⚠ stops retrying once the run has seen enough transport failures', async () => {
    const budget = createRetryBudget(2)
    // Three fixtures, all failing on the wire.
    const calls: number[] = []
    for (let i = 0; i < 3; i++) {
      const { client: c, rpc } = client([{ error: NET }, { error: NET }, { error: NET }])
      await replaceRows(c, 'replace_match_events', `fx-${i}`, [], budget, noSleep)
      calls.push(rpc.mock.calls.length)
    }
    // The first fixture burns the budget; later ones stop trying so hard.
    expect(calls[0]).toBeGreaterThan(1)
    expect(calls[2]).toBe(1)
  })

  it('a budget is not consumed by database errors', async () => {
    // Only the wire is rationed. A run full of constraint violations is a bug
    // to report, not a reason to stop retrying the next network blip.
    const budget = createRetryBudget(2)
    const { client: c } = client([{ error: PG }])
    await replaceRows(c, 'replace_match_events', 'fx-1', [], budget, noSleep)
    expect(budget.transportFailures).toBe(0)
  })

  it('a clean run leaves the budget untouched', async () => {
    const budget = createRetryBudget()
    const { client: c } = client([{ error: null }])
    await replaceRows(c, 'replace_match_events', 'fx-1', [], budget, noSleep)
    expect(budget.transportFailures).toBe(0)
  })
})
