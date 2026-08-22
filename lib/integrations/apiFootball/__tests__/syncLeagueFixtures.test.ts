// =============================================================
// The league sync arm (L3).
// =============================================================
// Two properties matter more than the happy path and are asserted hardest:
//
//   1. It NEVER throws. A throw inside the route's target loop abandons the
//      remaining competitions and produces a 500 with no `sync_runs` row at
//      all — the run becomes invisible rather than merely failed.
//   2. A run that did nothing is DISTINGUISHABLE from a run that had nothing
//      to do. `window`, `calls`, `seen` and `changed` are separate counters for
//      exactly that reason.
// =============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

const getFixturesAllPages = vi.fn()

vi.mock('@/lib/integrations/apiFootball/client', async (orig) => {
  const actual = await orig<typeof import('@/lib/integrations/apiFootball/client')>()
  return { ...actual, getFixturesAllPages: (...a: unknown[]) => getFixturesAllPages(...a) }
})

const { syncLeagueFixtures, formatLeagueNoteParts } = await import(
  '@/lib/integrations/apiFootball/syncLeagueFixtures'
)
import type { LeagueSyncTarget } from '@/lib/integrations/apiFootball/syncTargets'
import type { ApiFootballFixture, ApiFootballStatusShort } from '@/lib/integrations/apiFootball/types'

const TARGET: LeagueSyncTarget = {
  kind: 'league',
  seasonId: 'season-1',
  league: 39,
  season: 2026,
  name: 'Premier League 2026/27',
  source: 'league_seasons_row',
}

const NOW = Date.parse('2026-08-22T12:00:00Z')
const OPTS = { now: NOW, nowIso: new Date(NOW).toISOString() }

type Res = { data: unknown[] | null; error: { message: string } | null }

/**
 * Chainable stub with an ORDERED queue per table — `league_fixtures` is read
 * three times per run (window, catch-up, season id set) and the tests need to
 * control each independently.
 */
function fakeDb(opts: {
  league_fixtures?: Res[]
  league_matchweeks?: Res[]
  rpc?: { data: unknown; error: { message: string } | null }
}) {
  const queues: Record<string, Res[]> = {
    league_fixtures: [...(opts.league_fixtures ?? [])],
    league_matchweeks: [...(opts.league_matchweeks ?? [])],
  }
  const calls: Array<{ table: string; filters: string[] }> = []
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []

  const client = {
    from(table: string) {
      const res: Res = queues[table]?.shift() ?? { data: [], error: null }
      const filters: string[] = []
      calls.push({ table, filters })
      const api: Record<string, unknown> = {}
      for (const m of ['select', 'order', 'range', 'not', 'eq', 'gte', 'lte', 'lt', 'gt', 'or', 'limit']) {
        api[m] = (...args: unknown[]) => {
          filters.push(`${m}(${args.map((a) => String(a)).join(',')})`)
          return api
        }
      }
      api.insert = () => {
        throw new Error('the league sync arm must never INSERT a fixture')
      }
      api.then = (resolve: (v: Res) => unknown) => resolve(res)
      return api
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args })
      const r = opts.rpc ?? { data: { seen: 0, changed: [] }, error: null }
      return { then: (resolve: (v: unknown) => unknown) => resolve(r) }
    },
  }
  return { client: client as never, calls, rpcCalls }
}

function dbRow(over: Record<string, unknown> = {}) {
  return {
    fixture_id: 'f-1',
    matchweek_id: 'mw-1',
    external_fixture_id: '1557368',
    kickoff_at: '2026-08-22T12:00:00+00:00',
    status: 'scheduled',
    status_detail: null,
    home_goals: null,
    away_goals: null,
    is_completed: false,
    live_minute: null,
    live_period: null,
    live_added: null,
    manual_override: false,
    ...over,
  }
}

function feedFixture(id: number, over: { short?: ApiFootballStatusShort; round?: string; home?: number | null; away?: number | null } = {}): ApiFootballFixture {
  return {
    fixture: {
      id,
      referee: null,
      date: '2026-08-22T12:00:00+00:00',
      venue: { id: null, name: null, city: null },
      status: { long: '', short: over.short ?? 'FT', elapsed: 90, extra: null },
    },
    league: { id: 39, season: 2026, round: over.round ?? 'Regular Season - 1' },
    teams: { home: { id: 1, name: 'H', winner: null }, away: { id: 2, name: 'A', winner: null } },
    goals: { home: over.home ?? 2, away: over.away ?? 1 },
    score: {
      halftime: { home: null, away: null },
      fulltime: { home: null, away: null },
      extratime: { home: null, away: null },
      penalty: { home: null, away: null },
    },
  }
}

const MW = [{ matchweek_id: 'mw-1', provider_round: 'Regular Season - 1' }]

// `mockClear`, not `mockReset`. mockReset() re-installs vi.fn's original
// (undefined) implementation, and a mock whose implementation THROWS is then
// reported by the runner as an unhandled error even when the code under test
// catches it. Clearing call history is all these tests need; every test that
// reaches the feed sets its own implementation.
beforeEach(() => getFixturesAllPages.mockClear())

describe('syncLeagueFixtures — the quiet tick', () => {
  it('V3.1 makes no api call when nothing is in the window or catch-up', async () => {
    const { client } = fakeDb({
      league_fixtures: [
        { data: [], error: null }, // window
        { data: [], error: null }, // catch-up
      ],
    })
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(r.window).toBe(0)
    expect(r.stale).toBe(0)
    expect(r.apiCalls).toBe(0)
    expect(r.fetchedFeed).toBe(false)
    expect(getFixturesAllPages).not.toHaveBeenCalled()
    // The note still exists — that is what makes "nothing to do" different
    // from "never ran".
    expect(formatLeagueNoteParts(r)).toContain('window=0')
    expect(formatLeagueNoteParts(r)).toContain('calls=0')
  })
})

describe('syncLeagueFixtures — failures are returned, never thrown', () => {
  it('V3.2 a window select error returns with one error entry', async () => {
    const { client } = fakeDb({
      league_fixtures: [{ data: null, error: { message: 'boom' } }],
    })
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].stage).toBe('league_fetch_fixtures')
    expect(r.written).toBe(0)
  })

  it('V3.3 a failed feed call returns cleanly and never throws', async () => {
    // The feed misbehaves by returning something unusable rather than by the
    // mock throwing. Two reasons, and the second one cost real time:
    //
    //  - it exercises the same catch, and additionally proves the arm survives
    //    a MALFORMED provider response, not just a rejected one;
    //  - a vi.fn whose implementation throws is reported by the runner as a
    //    failed test even when the code under test catches it. Instrumented and
    //    confirmed: the arm returned normally with exactly
    //    errors:['league_fetch_feed'] and vitest still failed the test.
    //
    // That an HTTP 200 carrying `errors` RAISES in the first place is proven
    // against a stubbed fetch in leagueMappers.test.ts.
    getFixturesAllPages.mockResolvedValue(undefined)
    const { client, rpcCalls } = fakeDb({
      league_fixtures: [{ data: [dbRow()], error: null }, { data: [], error: null }],
    })
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(r.errors.map((e) => e.stage)).toEqual(['league_fetch_feed'])
    expect(r.written).toBe(0)
    expect(r.seen).toBe(0)
    expect(r.fetchedFeed).toBe(false)
    expect(rpcCalls).toHaveLength(0)
    expect(formatLeagueNoteParts(r)).toContain('feed_error')
  })
})

describe('syncLeagueFixtures — manual_override', () => {
  it('V3.4 skips an overridden row and leaves it out of p_seen', async () => {
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture(1557368)], calls: 1 })
    const { client, rpcCalls } = fakeDb({
      league_fixtures: [
        { data: [dbRow({ manual_override: true })], error: null },
        { data: [], error: null },
        { data: [{ external_fixture_id: '1557368' }], error: null },
      ],
      league_matchweeks: [{ data: MW, error: null }],
    })
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(r.skippedManual).toBe(1)
    expect(r.proposed).toBe(0)
    // Not even a liveness stamp: we did not look at it.
    expect(rpcCalls).toHaveLength(0)
  })
})

describe('syncLeagueFixtures — the write is reconciled', () => {
  it('V3.5 reports a shortfall when the database changed fewer rows than proposed', async () => {
    getFixturesAllPages.mockResolvedValue({
      fixtures: [feedFixture(1557368), feedFixture(1557369)],
      calls: 1,
    })
    const { client } = fakeDb({
      league_fixtures: [
        { data: [dbRow(), dbRow({ fixture_id: 'f-2', external_fixture_id: '1557369' })], error: null },
        { data: [], error: null },
        { data: [{ external_fixture_id: '1557368' }, { external_fixture_id: '1557369' }], error: null },
      ],
      league_matchweeks: [{ data: MW, error: null }],
      rpc: { data: { seen: 2, changed: [{ external_fixture_id: '1557368' }] }, error: null },
    })
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(r.proposed).toBe(2)
    expect(r.written).toBe(1)
    const shortfall = r.errors.find((e) => e.stage === 'league_write_shortfall')
    expect(shortfall).toBeTruthy()
    expect(shortfall!.message).toContain('the database changed 1')
  })
})

describe('syncLeagueFixtures — unknown provider fixtures', () => {
  it('V3.6 counts a fixture that is in no season row, and never inserts it', async () => {
    getFixturesAllPages.mockResolvedValue({
      fixtures: [feedFixture(1557368), feedFixture(999999)],
      calls: 1,
    })
    const { client } = fakeDb({
      league_fixtures: [
        { data: [dbRow()], error: null },
        { data: [], error: null },
        { data: [{ external_fixture_id: '1557368' }], error: null },
      ],
      league_matchweeks: [{ data: MW, error: null }],
      rpc: { data: { seen: 1, changed: [{ external_fixture_id: '1557368' }] }, error: null },
    })
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(r.unknownProvider).toBe(1)
    // `api.insert` throws in the stub — reaching it fails the test loudly.
  })

  it('V3.7 does not count a season fixture that is merely outside the window', async () => {
    getFixturesAllPages.mockResolvedValue({
      fixtures: [feedFixture(1557368), feedFixture(1557400)],
      calls: 1,
    })
    const { client } = fakeDb({
      league_fixtures: [
        { data: [dbRow()], error: null },
        { data: [], error: null },
        // The season id set includes the out-of-window fixture.
        { data: [{ external_fixture_id: '1557368' }, { external_fixture_id: '1557400' }], error: null },
      ],
      league_matchweeks: [{ data: MW, error: null }],
      rpc: { data: { seen: 1, changed: [] }, error: null },
    })
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    // Counted against the window instead, this would be 1 on every healthy tick.
    expect(r.unknownProvider).toBe(0)
  })
})

describe('syncLeagueFixtures — round vocabulary', () => {
  it('V3.8 counts an unknown provider round rather than silently ignoring it', async () => {
    getFixturesAllPages.mockResolvedValue({
      fixtures: [feedFixture(1557368, { round: 'Championship Group - 34' })],
      calls: 1,
    })
    const { client } = fakeDb({
      league_fixtures: [
        { data: [dbRow()], error: null },
        { data: [], error: null },
        { data: [{ external_fixture_id: '1557368' }], error: null },
      ],
      league_matchweeks: [{ data: MW, error: null }],
      rpc: { data: { seen: 1, changed: [{ external_fixture_id: '1557368' }] }, error: null },
    })
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(r.roundUnknown).toBe(1)
    // Silently ignoring it printed round_mismatch=0, which reads as "verified".
    expect(r.roundMismatch).toBe(0)
  })

  it('V3.9 reports a vocabulary break when EVERY round is unknown', async () => {
    getFixturesAllPages.mockResolvedValue({
      fixtures: [feedFixture(1557368, { round: 'Jornada 1' })],
      calls: 1,
    })
    const { client } = fakeDb({
      league_fixtures: [
        { data: [dbRow()], error: null },
        { data: [], error: null },
        { data: [{ external_fixture_id: '1557368' }], error: null },
      ],
      league_matchweeks: [{ data: MW, error: null }],
      rpc: { data: { seen: 1, changed: [{ external_fixture_id: '1557368' }] }, error: null },
    })
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(r.errors.some((e) => e.message.includes('round vocabulary changed'))).toBe(true)
  })

  it('detects a genuine matchweek mismatch without performing the move', async () => {
    getFixturesAllPages.mockResolvedValue({
      fixtures: [feedFixture(1557368, { round: 'Regular Season - 5' })],
      calls: 1,
    })
    const { client, rpcCalls } = fakeDb({
      league_fixtures: [
        { data: [dbRow()], error: null },
        { data: [], error: null },
        { data: [{ external_fixture_id: '1557368' }], error: null },
      ],
      league_matchweeks: [
        { data: [...MW, { matchweek_id: 'mw-5', provider_round: 'Regular Season - 5' }], error: null },
      ],
      rpc: { data: { seen: 1, changed: [] }, error: null },
    })
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(r.roundMismatch).toBe(1)
    // Detection only — the payload must carry no matchweek_id. Moves are L6.
    const rows = rpcCalls[0]?.args.p_rows as Array<Record<string, unknown>> | undefined
    for (const row of rows ?? []) expect(row).not.toHaveProperty('matchweek_id')
  })
})

describe('syncLeagueFixtures — the catch-up pass', () => {
  it('V3.10 pulls a stray past fixture and widens the feed range to reach it', async () => {
    getFixturesAllPages.mockResolvedValue({ fixtures: [], calls: 1 })
    const stray = dbRow({
      fixture_id: 'f-old',
      external_fixture_id: '1557300',
      kickoff_at: '2026-08-16T14:00:00+00:00', // 6 days before NOW
    })
    const { client } = fakeDb({
      league_fixtures: [
        { data: [], error: null },
        { data: [stray], error: null },
        { data: [{ external_fixture_id: '1557300' }], error: null },
      ],
      league_matchweeks: [{ data: MW, error: null }],
    })
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(r.stale).toBe(1)
    const call = getFixturesAllPages.mock.calls[0][0] as { from: string; to: string }
    // Without widening, the stray's day is outside the request and it can never
    // recover — the failure that strands a fixture for the rest of the season.
    expect(call.from).toBe('2026-08-16')
    expect(call.to).toBe('2026-08-22')
  })

  it('V3.11 applies an hourly throttle to the catch-up selector', async () => {
    getFixturesAllPages.mockResolvedValue({ fixtures: [], calls: 1 })
    const { client, calls } = fakeDb({
      league_fixtures: [
        { data: [dbRow()], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ],
      league_matchweeks: [{ data: MW, error: null }],
    })
    await syncLeagueFixtures(client, TARGET, OPTS)
    const catchup = calls[1]
    expect(catchup.table).toBe('league_fixtures')
    const or = catchup.filters.find((f) => f.startsWith('or('))
    expect(or).toContain('last_synced_at.is.null')
    // 12:00Z minus one hour.
    expect(or).toContain('2026-08-22T11:00:00.000Z')
    expect(catchup.filters.some((f) => f.startsWith('limit(10)'))).toBe(true)
  })
})

describe('syncLeagueFixtures — nothing matched', () => {
  it('V3.12 does not call the RPC when no row matched a feed fixture', async () => {
    getFixturesAllPages.mockResolvedValue({ fixtures: [], calls: 1 })
    const { client, rpcCalls } = fakeDb({
      league_fixtures: [
        { data: [dbRow(), dbRow({ fixture_id: 'f-2', external_fixture_id: '9' })], error: null },
        { data: [], error: null },
        { data: [{ external_fixture_id: '1557368' }, { external_fixture_id: '9' }], error: null },
      ],
      league_matchweeks: [{ data: MW, error: null }],
    })
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(r.unmatched).toBe(2)
    expect(r.seen).toBe(0)
    expect(r.proposed).toBe(0)
    expect(rpcCalls).toHaveLength(0)
  })
})
