// =============================================================
// A refusal must not look like an empty match
// =============================================================
// The callers of these three functions DELETE before they insert. So the value
// under test is not "did we get the data" — it is whether "the provider refused
// us" can ever arrive wearing the same clothes as "nothing happened in this
// match". It could, until 2026-09-09, and the cost of the confusion was the
// stored timeline.
//
// Every shape below was taken from the live API, not invented:
//   /fixtures/events?fixture=abc        -> 200 {"errors":{"fixture":"..."}}
//   /fixtures/events?fixture=999999999  -> 200 {"errors":[],"response":[]}
// The first must throw. The second must not — an unknown fixture really does
// hold nothing, and a caller is entitled to act on that.
// =============================================================

import { afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import {
  getFixtureEvents,
  getFixtureLineups,
  getFixtureStatistics,
} from '../client'

// The client reads the key at call time and throws without one, so it has to
// be present for EVERY test rather than set once at import.
const OLD_KEY = process.env.API_FOOTBALL_KEY
beforeEach(() => {
  process.env.API_FOOTBALL_KEY = 'test-key'
})
afterEach(() => {
  vi.unstubAllGlobals()
})
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

const GETTERS = [
  ['events', getFixtureEvents, '/fixtures/events'],
  ['lineups', getFixtureLineups, '/fixtures/lineups'],
  ['statistics', getFixtureStatistics, '/fixtures/statistics'],
] as const

describe('the per-fixture reads refuse to return an ambiguous empty', () => {
  it.each(GETTERS)('⚠⚠ %s throws on a 200 carrying an errors object', async (_n, fn, path) => {
    // The live shape of a rejected parameter — and, critically, the same shape
    // the provider uses when the DAILY ALLOWANCE IS GONE. `res.ok` is true.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        reply({
          errors: { fixture: 'The Fixture field must contain an integer.' },
          results: 0,
          response: [],
        }),
      ),
    )
    await expect(fn(1379342)).rejects.toThrow(new RegExp(`${path} refused`))
  })

  it.each(GETTERS)('⚠ %s still returns a REAL empty untouched', async (_n, fn) => {
    // An unknown fixture, and — for line-ups — every tick before the feed
    // publishes. Turning this into a throw would break 7b5's retry entirely.
    vi.stubGlobal('fetch', vi.fn(async () => reply({ errors: [], results: 0, response: [] })))
    await expect(fn(999999999)).resolves.toEqual([])
  })

  it.each(GETTERS)('%s passes a clean payload straight through', async (_n, fn) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply({ errors: [], results: 1, response: [{ real: true }] })),
    )
    await expect(fn(1379342)).resolves.toEqual([{ real: true }])
  })

  it.each(GETTERS)('⚠ %s throws rather than emptying on a refused HTTP status', async (_n, fn) => {
    // 429 is the one that matters: it is what the per-minute limit answers, and
    // before the guard it fell through to an empty envelope — indistinguishable
    // from a quiet match, and then deleted.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply({ message: 'Too Many Requests' }, { ok: false, status: 429 })),
    )
    await expect(fn(1379342)).rejects.toThrow(/429/)
  })

  it('⚠⚠ a 429 costs ONE call, not three', async () => {
    // REGRESSION, and the reason this file exists in the shape it does. The
    // strict throw is raised inside the retry loop's own try, so until
    // 2026-09-09 its catch swallowed it and went round again — three requests
    // and 3.5s of backoff to be refused three times. Against a 300/minute
    // limit, the response to being rate-limited was to triple the load.
    const fetchSpy = vi.fn(async () =>
      reply({ message: 'Too Many Requests' }, { ok: false, status: 429 }),
    )
    vi.stubGlobal('fetch', fetchSpy)
    await expect(getFixtureEvents(1379342)).rejects.toThrow(/429/)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('a 5xx IS still retried — that one can change on its own', async () => {
    let n = 0
    const fetchSpy = vi.fn(async () => {
      n++
      return n < 3
        ? reply({}, { ok: false, status: 503 })
        : reply({ errors: [], results: 1, response: [{ recovered: true }] })
    })
    vi.stubGlobal('fetch', fetchSpy)
    await expect(getFixtureEvents(1379342)).resolves.toEqual([{ recovered: true }])
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('⚠ an empty errors ARRAY is not an error, an empty OBJECT is not either', async () => {
    // hasEnvelopeErrors has to treat `[]` and `{}` as clean, because the
    // provider uses both for "no complaint". Getting this backwards would make
    // every successful call throw.
    for (const errs of [[], {}, null, '']) {
      vi.stubGlobal('fetch', vi.fn(async () => reply({ errors: errs, results: 0, response: [] })))
      await expect(getFixtureEvents(1)).resolves.toEqual([])
    }
  })

  it('⚠ the thrown message carries the provider’s own words', async () => {
    // The run note is where this surfaces. "refused" alone would send the next
    // person to the wrong place; the quota message has to survive to the log.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        reply({ errors: { requests: 'You have reached the request limit for the day' }, response: [] }),
      ),
    )
    await expect(getFixtureEvents(1)).rejects.toThrow(/request limit for the day/)
  })
})
