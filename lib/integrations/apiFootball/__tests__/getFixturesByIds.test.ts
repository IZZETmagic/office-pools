// =============================================================
// Twenty fixtures, one call
// =============================================================
// The chunking is the whole function, and it has exactly one hard number in it:
// the provider refuses 21 ids outright rather than truncating to 20, which it
// told us itself —
//   {"ids":"...Maximum of 20 ids allowed."}
// — so a boundary that is off by one does not degrade, it returns nothing for
// the entire chunk. Hence the tests either side of it.
//
// The other half is failure containment. One bad chunk must cost only its own
// twenty fixtures, because the caller treats an absent fixture as "not
// fetched" and a present-but-empty one as "has nothing" — and those two must
// never swap places. That is the same distinction the refusal guard protects.
// =============================================================

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getFixturesByIds, IDS_PER_CALL } from '../client'

const OLD_KEY = process.env.API_FOOTBALL_KEY
beforeEach(() => {
  process.env.API_FOOTBALL_KEY = 'test-key'
})
afterEach(() => vi.unstubAllGlobals())
afterAll(() => {
  if (OLD_KEY === undefined) delete process.env.API_FOOTBALL_KEY
  else process.env.API_FOOTBALL_KEY = OLD_KEY
})

function reply(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

/** Records the `ids` parameter of every request made. */
function spyOn(response: (ids: string[]) => unknown) {
  const seen: string[][] = []
  const fn = vi.fn(async (url: URL | string) => {
    const ids = (new URL(String(url)).searchParams.get('ids') ?? '').split('-').filter(Boolean)
    seen.push(ids)
    return reply(response(ids))
  })
  vi.stubGlobal('fetch', fn)
  return { seen, fn }
}

const ok = (ids: string[]) => ({
  errors: [],
  results: ids.length,
  response: ids.map((id) => ({ fixture: { id: Number(id) }, events: [], lineups: [], statistics: [] })),
})

describe('getFixturesByIds — chunking', () => {
  it('the provider ceiling is 20 and we honour it exactly', () => {
    expect(IDS_PER_CALL).toBe(20)
  })

  it('20 ids is ONE call', async () => {
    const { seen } = spyOn(ok)
    const r = await getFixturesByIds(Array.from({ length: 20 }, (_, i) => i + 1))
    expect(seen).toHaveLength(1)
    expect(seen[0]).toHaveLength(20)
    expect(r.calls).toBe(1)
    expect(r.fixtures).toHaveLength(20)
  })

  it('⚠ 21 ids is TWO calls, never one refused one', async () => {
    // Off by one here does not degrade — the provider rejects the whole chunk.
    const { seen } = spyOn(ok)
    const r = await getFixturesByIds(Array.from({ length: 21 }, (_, i) => i + 1))
    expect(seen.map((c) => c.length)).toEqual([20, 1])
    expect(r.calls).toBe(2)
    expect(r.fixtures).toHaveLength(21)
  })

  it('45 ids is three calls: 20, 20, 5', async () => {
    const { seen } = spyOn(ok)
    await getFixturesByIds(Array.from({ length: 45 }, (_, i) => i + 1))
    expect(seen.map((c) => c.length)).toEqual([20, 20, 5])
  })

  it('sends them dash-joined, the way the provider parses them', async () => {
    const { fn } = spyOn(ok)
    await getFixturesByIds([1379342, 1557391])
    expect(String(fn.mock.calls[0][0])).toContain('ids=1379342-1557391')
  })

  it('⚠ duplicates and junk are dropped before the chunk is measured', async () => {
    // A duplicate id would otherwise eat a slot out of the twenty and silently
    // push a real fixture into a second call.
    const { seen } = spyOn(ok)
    await getFixturesByIds([5, 5, 5, 0, -1, NaN, 7])
    expect(seen).toHaveLength(1)
    expect(seen[0]).toEqual(['5', '7'])
  })

  it('no ids means no call at all', async () => {
    const { seen } = spyOn(ok)
    const r = await getFixturesByIds([])
    expect(seen).toHaveLength(0)
    expect(r.calls).toBe(0)
  })
})

describe('getFixturesByIds — failure containment', () => {
  it('⚠⚠ one refused chunk does not lose the others', async () => {
    let n = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL | string) => {
        const ids = (new URL(String(url)).searchParams.get('ids') ?? '').split('-').filter(Boolean)
        n++
        // The daily-allowance shape: HTTP 200, empty response, populated errors.
        if (n === 1) return reply({ errors: { requests: 'limit reached' }, response: [] })
        return reply(ok(ids))
      }),
    )
    const r = await getFixturesByIds(Array.from({ length: 40 }, (_, i) => i + 1))
    expect(r.failures).toHaveLength(1)
    expect(r.failures[0]).toMatch(/refused/)
    expect(r.failures[0]).toMatch(/limit reached/)
    // The second chunk's twenty still arrived, and are usable.
    expect(r.fixtures).toHaveLength(20)
    expect(r.calls).toBe(2)
  })

  it('⚠ a refused chunk is COUNTED — the cost is real even when the data is not', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ errors: { requests: 'gone' }, response: [] })))
    const r = await getFixturesByIds([1, 2, 3])
    expect(r.calls).toBe(1)
    expect(r.fixtures).toHaveLength(0)
    expect(r.failures).toHaveLength(1)
  })

  it('⚠ a refusal yields NO fixtures rather than empty ones', async () => {
    // The distinction the whole guard rests on. If a refused chunk returned
    // twenty fixtures carrying `events: []`, every one of them would have its
    // timeline deleted by the caller.
    vi.stubGlobal('fetch', vi.fn(async () => reply({ errors: { x: 'no' }, response: [] })))
    const r = await getFixturesByIds([1, 2])
    expect(r.fixtures).toEqual([])
  })

  it('a 4xx chunk fails without retrying', async () => {
    const fn = vi.fn(async () => reply({ message: 'nope' }, { ok: false, status: 429 }))
    vi.stubGlobal('fetch', fn)
    const r = await getFixturesByIds([1])
    expect(fn).toHaveBeenCalledTimes(1)
    expect(r.failures[0]).toMatch(/429/)
  })
})

describe('getFixturesByIds — what comes back', () => {
  it('carries the bundled sub-objects through untouched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        reply({
          errors: [],
          results: 1,
          response: [
            {
              fixture: { id: 1379342 },
              teams: { home: { id: 36 }, away: { id: 34 } },
              events: [{ type: 'Goal', player: { name: 'X' } }],
              lineups: [{ formation: '4-2-3-1' }, { formation: '4-3-3' }],
              statistics: [{ type: 'Ball Possession' }, { type: 'Ball Possession' }],
            },
          ],
        }),
      ),
    )
    const { fixtures } = await getFixturesByIds([1379342])
    expect(fixtures[0].events).toHaveLength(1)
    expect(fixtures[0].lineups).toHaveLength(2)
    expect(fixtures[0].statistics).toHaveLength(2)
  })
})
