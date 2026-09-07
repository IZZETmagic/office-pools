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

// `getStandings` is stubbed to an empty table rather than left real. The sync
// now refreshes standings whenever a fixture completes (plan §0.3), and the real
// function makes an HTTP call — which in a unit test has no API key, fails, and
// pushes a `league_standings` error into every result that happens to contain a
// completion. Returning [] is the "season has no table yet" path, which the sync
// treats as a clean no-op.
const getStandings = vi.fn(async () => [])
// Same reasoning as `getStandings` directly above: step 7b3 calls
// /fixtures/events once per CHANGED fixture, and the real function in a unit
// test has no API key, throws, and would push a `league_timeline` error into
// every result that contains a completion. [] is the honest quiet path — a
// fixture whose events the provider has not published yet.
const getFixtureEvents = vi.fn(async () => [])
// And the same again for 7b4/7b5 (migration 139). Both default to the quiet
// path: no statistics published, no line-up published. An unstubbed one would
// make a real HTTP call with no API key on every test that completes a fixture.
const getFixtureStatistics = vi.fn(async () => [])
const getFixtureLineups = vi.fn(async () => [])

vi.mock('@/lib/integrations/apiFootball/client', async (orig) => {
  const actual = await orig<typeof import('@/lib/integrations/apiFootball/client')>()
  return {
    ...actual,
    getFixturesAllPages: (...a: unknown[]) => getFixturesAllPages(...a),
    getStandings: (...a: unknown[]) => getStandings(...(a as [])),
    getFixtureEvents: (...a: unknown[]) => getFixtureEvents(...(a as [])),
    getFixtureStatistics: (...a: unknown[]) => getFixtureStatistics(...(a as [])),
    getFixtureLineups: (...a: unknown[]) => getFixtureLineups(...(a as [])),
  }
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
  /** What 7b5's "which of these do we already hold a line-up for" read returns. */
  match_lineups?: Res[]
  rpc?: { data: unknown; error: { message: string } | null }
  /** Value returned for a sync_settings lookup, and whether the read errors. */
  sync_settings?: { value: string | null; error?: { message: string } | null }
}) {
  const queues: Record<string, Res[]> = {
    league_fixtures: [...(opts.league_fixtures ?? [])],
    league_matchweeks: [...(opts.league_matchweeks ?? [])],
    match_lineups: [...(opts.match_lineups ?? [])],
  }
  const calls: Array<{ table: string; filters: string[] }> = []
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const upserts: Array<{ table: string; row: Record<string, unknown> }> = []
  const inserts: Array<{ table: string; rows: unknown[] }> = []
  const deletes: Array<{ table: string; filters: string[] }> = []
  const updates: Array<{ table: string; row: Record<string, unknown> }> = []

  const client = {
    from(table: string) {
      const res: Res = queues[table]?.shift() ?? { data: [], error: null }
      const filters: string[] = []
      calls.push({ table, filters })
      const api: Record<string, unknown> = {}
      // ⚠ `in` was added for 7b5, which asks `match_lineups` which of the
      // window's fixtures it already holds. Without it every test that reaches
      // the line-up arm dies on `.in is not a function`, which is a harness
      // gap and not a defect in the arm.
      for (const m of ['select', 'order', 'range', 'not', 'eq', 'gte', 'lte', 'lt', 'gt', 'or', 'limit', 'in']) {
        api[m] = (...args: unknown[]) => {
          filters.push(`${m}(${args.map((a) => String(a)).join(',')})`)
          return api
        }
      }
      // ⚠ SCOPED TO `league_fixtures`, WHICH IS WHAT THE MESSAGE ALWAYS MEANT.
      // The guard is that the sync must never invent a FIXTURE; it was written
      // when this table was the only one the arm wrote. Step 7b3 legitimately
      // inserts `match_events`, so a blanket throw here would fail the timeline
      // rather than the thing being guarded against.
      api.insert = (rows: unknown) => {
        if (table === 'league_fixtures') {
          throw new Error('the league sync arm must never INSERT a fixture')
        }
        inserts.push({ table, rows: Array.isArray(rows) ? rows : [rows] })
        return { then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }) }
      }
      api.delete = () => {
        deletes.push({ table, filters })
        return api
      }
      api.update = (row: Record<string, unknown>) => {
        updates.push({ table, row })
        return api
      }
      api.upsert = (row: Record<string, unknown>) => {
        upserts.push({ table, row })
        return { then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }) }
      }
      api.maybeSingle = async () => {
        if (table === 'sync_settings') {
          const cfg = opts.sync_settings
          if (cfg?.error) return { data: null, error: cfg.error }
          return { data: cfg?.value == null ? null : { setting_value: cfg.value }, error: null }
        }
        return { data: null, error: null }
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
  return { client: client as never, calls, rpcCalls, upserts, inserts, deletes, updates }
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

function feedFixture(id: number, over: { short?: ApiFootballStatusShort; round?: string; home?: number | null; away?: number | null; referee?: string | null; ht?: [number | null, number | null] } = {}): ApiFootballFixture {
  return {
    fixture: {
      id,
      referee: over.referee ?? null,
      date: '2026-08-22T12:00:00+00:00',
      venue: { id: null, name: null, city: null },
      status: { long: '', short: over.short ?? 'FT', elapsed: 90, extra: null },
    },
    league: { id: 39, season: 2026, round: over.round ?? 'Regular Season - 1' },
    teams: { home: { id: 1, name: 'H', winner: null }, away: { id: 2, name: 'A', winner: null } },
    goals: { home: over.home ?? 2, away: over.away ?? 1 },
    score: {
      halftime: { home: over.ht?.[0] ?? null, away: over.ht?.[1] ?? null },
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

// =============================================================
// The feed-error rate limit
// =============================================================
// `finishRun` computes ok from errors.length and the status panel renders that
// count, so an unrate-limited provider outage during a matchday window produces
// hundreds of red runs in a day — inside which a real World Cup error is
// invisible. These pin the boundary between "quieten the alarm" and "lose the
// error", which is the only thing that makes a limiter acceptable.
// =============================================================

describe('syncLeagueFixtures — feed-error rate limit', () => {
  const failingFeed = () => {
    // Malformed rather than thrown — see V3.3 for why.
    getFixturesAllPages.mockResolvedValue(undefined)
    return fakeDb({
      league_fixtures: [{ data: [dbRow()], error: null }, { data: [], error: null }],
      sync_settings: { value: null },
    })
  }

  it('reports the first failure and stamps a per-season key', async () => {
    const { client, upserts } = failingFeed()
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(r.feedError).toBeTruthy()
    expect(r.feedErrorReported).toBe(true)
    expect(r.errors.map((e) => e.stage)).toEqual(['league_fetch_feed'])

    const stamp = upserts.find((u) => u.table === 'sync_settings')
    expect(stamp).toBeTruthy()
    // PER SEASON. Stamping the global knockout_link_last_attempt key would
    // silently disable World Cup auto-linking for 15 minutes at a time, forever.
    expect(stamp!.row.setting_key).toBe(`league_feed_last_error:${TARGET.seasonId}`)
    expect(stamp!.row.setting_key).not.toBe('knockout_link_last_attempt')
  })

  it('suppresses a repeat inside the window but keeps it visible', async () => {
    getFixturesAllPages.mockResolvedValue(undefined)
    const { client, upserts } = fakeDb({
      league_fixtures: [{ data: [dbRow()], error: null }, { data: [], error: null }],
      // Stamped 2 minutes ago.
      sync_settings: { value: new Date(NOW - 2 * 60 * 1000).toISOString() },
    })
    const r = await syncLeagueFixtures(client, TARGET, OPTS)

    expect(r.feedError).toBeTruthy()          // still recorded
    expect(r.feedErrorReported).toBe(false)   // but not in errors[]
    expect(r.errors).toHaveLength(0)
    // The note must still say so — otherwise the limiter hides the outage itself.
    expect(formatLeagueNoteParts(r)).toContain('feed_error')
    // And it must not re-stamp, or the window would never expire.
    expect(upserts.filter((u) => u.table === 'sync_settings')).toHaveLength(0)
  })

  it('reports again once the window has passed', async () => {
    getFixturesAllPages.mockResolvedValue(undefined)
    const { client } = fakeDb({
      league_fixtures: [{ data: [dbRow()], error: null }, { data: [], error: null }],
      sync_settings: { value: new Date(NOW - 16 * 60 * 1000).toISOString() },
    })
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(r.feedErrorReported).toBe(true)
    expect(r.errors.map((e) => e.stage)).toEqual(['league_fetch_feed'])
  })

  it('FAILS OPEN when sync_settings cannot be read', async () => {
    getFixturesAllPages.mockResolvedValue(undefined)
    const { client } = fakeDb({
      league_fixtures: [{ data: [dbRow()], error: null }, { data: [], error: null }],
      sync_settings: { value: null, error: { message: 'permission denied' } },
    })
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    // An unreadable rate-limiter must not become a way to lose errors.
    expect(r.feedErrorReported).toBe(true)
    expect(r.errors.map((e) => e.stage)).toEqual(['league_fetch_feed'])
  })

  it('does not rate-limit anything other than the feed', async () => {
    const { client } = fakeDb({
      league_fixtures: [{ data: null, error: { message: 'boom' } }],
      sync_settings: { value: new Date(NOW - 1000).toISOString() },
    })
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    // A window-select failure is a different pipe and is always reported.
    expect(r.errors.map((e) => e.stage)).toEqual(['league_fetch_fixtures'])
    expect(r.feedError).toBeNull()
  })
})

// =============================================================
// Scoring hand-off (S3)
// =============================================================
// A fixture that completes is scored in the same tick that observed it. The
// rules that matter: only completed fixtures, and a scoring failure must never
// cost us the sync — the fixture data is already correct and
// league_score_fixture is idempotent, so the next tick retries.
// =============================================================

describe('syncLeagueFixtures — scores a fixture that just completed', () => {
  const oneChanged = (
    isCompleted: boolean,
    goals: [number | null, number | null] = [2, 0],
    status = 'completed',
  ) => ({
    seen: 1,
    changed: [{ fixture_id: 'fx-1', external_fixture_id: '1557368', status, home_goals: goals[0], away_goals: goals[1], is_completed: isCompleted }],
  })

  function dbWithRpc(rpcImpl: (fn: string, args: Record<string, unknown>) => unknown) {
    const base = fakeDb({
      league_fixtures: [{ data: [dbRow()], error: null }, { data: [], error: null }, { data: [{ external_fixture_id: '1557368' }], error: null }],
      league_matchweeks: [{ data: MW, error: null }],
    })
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
    const client = {
      from: (base.client as unknown as { from: (t: string) => unknown }).from,
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args })
        return { then: (res: (v: unknown) => unknown) => res(rpcImpl(fn, args)) }
      },
    }
    return { client: client as never, calls, inserts: base.inserts, deletes: base.deletes, updates: base.updates }
  }

  it('calls league_score_fixture for a completed fixture', async () => {
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture(1557368)], calls: 1 })
    const { client, calls } = dbWithRpc((fn) =>
      fn === 'league_apply_fixture_sync'
        ? { data: oneChanged(true), error: null }
        : { data: { ok: true, scored: 4, entries: 4 }, error: null },
    )
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(calls.map((c) => c.fn)).toContain('league_score_fixture')
    expect(calls.find((c) => c.fn === 'league_score_fixture')!.args.p_fixture_id).toBe('fx-1')
    expect(r.scored).toBe(1)
    expect(r.scoredEntries).toBe(4)
    expect(formatLeagueNoteParts(r)).toContain('scored=1')
  })

  // ⚠ INVERTED BY MIGRATION 063. This used to assert that a fixture which had
  // not completed was NOT scored. That was the old rule, and it was the whole
  // thing standing between the product and "the leaderboard moves while the
  // match is on". A live fixture carrying a score is now scored.
  it('DOES score a live fixture whose score moved', async () => {
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture(1557368)], calls: 1 })
    const { client, calls } = dbWithRpc((fn) =>
      fn === 'league_apply_fixture_sync'
        ? { data: oneChanged(false, [1, 0], 'live'), error: null }
        : { data: { ok: true, scored: 4, entries: 4 }, error: null },
    )
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(calls.map((c) => c.fn)).toContain('league_score_fixture')
    expect(r.scored).toBe(1)
  })

  it('does NOT score a fixture that has no score yet', async () => {
    // A kickoff time moving is a change too. Without goals there is nothing to
    // judge a prediction against, so the sync does not even make the call —
    // the engine would refuse it, and this saves the round trip.
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture(1557368)], calls: 1 })
    const { client, calls } = dbWithRpc(() => ({
      data: oneChanged(false, [null, null], 'scheduled'), error: null,
    }))
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(calls.map((c) => c.fn)).not.toContain('league_score_fixture')
    expect(r.scored).toBe(0)
  })

  it('a scoring failure is reported but does not lose the sync', async () => {
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture(1557368)], calls: 1 })
    const { client } = dbWithRpc((fn) =>
      fn === 'league_apply_fixture_sync'
        ? { data: oneChanged(true), error: null }
        : { data: null, error: { message: 'deadlock detected' } },
    )
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(r.errors.map((e) => e.stage)).toContain('league_score')
    // The fixture write still counted — losing that would be the worse trade.
    expect(r.written).toBe(1)
    expect(r.scored).toBe(0)
  })

  it('tolerates ok:false — a completion whose goals have not landed yet', async () => {
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture(1557368)], calls: 1 })
    const { client } = dbWithRpc((fn) =>
      fn === 'league_apply_fixture_sync'
        ? { data: oneChanged(true), error: null }
        : { data: { ok: false, reason: 'fixture not completed' }, error: null },
    )
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    // Not an error: completed_ck keeps it out of the scored set until both
    // goals are present, and the next tick picks it up.
    expect(r.errors).toHaveLength(0)
    expect(r.scored).toBe(0)
  })
})

// =============================================================
// The timeline hand-off (7b3)
// =============================================================
// `/fixtures/events` is a call PER FIXTURE, and this arm made none at all until
// migration 136. What these pin is the cost shape, not just the behaviour: the
// fetch is gated on a fixture having CHANGED, which is roughly one call per
// goal, rather than on the window, which would be one per in-window minute per
// live fixture — 1,500-2,500 on a full matchday against a 7,500/day plan.
// =============================================================

describe('syncLeagueFixtures — writes the timeline', () => {
  const changedRows = (over: Partial<{ is_completed: boolean; status: string }> = {}) => ({
    seen: 1,
    changed: [
      {
        fixture_id: 'fx-1',
        external_fixture_id: '1557368',
        status: over.status ?? 'live',
        home_goals: 2,
        away_goals: 1,
        is_completed: over.is_completed ?? false,
      },
    ],
  })

  function db(
    rpcImpl: (fn: string) => unknown,
    fixtures = [feedFixture(1557368)],
  ) {
    getFixturesAllPages.mockResolvedValue({ fixtures, calls: 1 })
    const base = fakeDb({
      league_fixtures: [
        { data: [dbRow()], error: null },
        { data: [], error: null },
        { data: [{ external_fixture_id: '1557368' }], error: null },
      ],
      league_matchweeks: [{ data: MW, error: null }],
    })
    const client = {
      from: (base.client as unknown as { from: (t: string) => unknown }).from,
      rpc: (fn: string) => ({ then: (res: (v: unknown) => unknown) => res(rpcImpl(fn)) }),
    }
    // ⚠ `client` LAST. Spreading `base` after it puts the unwrapped client
    // back and the rpc stub is silently ignored — every changed-fixture test
    // then passes through a tick with nothing changed.
    return { ...base, client: client as never }
  }

  it('⚠ makes NO events call when nothing changed — the whole cost argument', async () => {
    getFixtureEvents.mockClear()
    const { client } = db(() => ({ data: { seen: 1, changed: [] }, error: null }))
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(getFixtureEvents).not.toHaveBeenCalled()
    expect(r.timelineCalls).toBe(0)
    // And a counter nobody needs stays out of the run note entirely.
    expect(formatLeagueNoteParts(r).join(' ')).not.toContain('timeline=')
  })

  it('fetches events once per changed fixture and writes the rows', async () => {
    getFixtureEvents.mockClear()
    getFixtureEvents.mockResolvedValueOnce([
      {
        time: { elapsed: 11, extra: null },
        team: { id: 1, name: 'H' },
        player: { id: 9, name: 'Josh King' },
        assist: { id: null, name: null },
        type: 'Goal',
        detail: 'Normal Goal',
        comments: null,
      },
    ] as never)
    const { client, inserts } = db((fn) =>
      fn === 'league_apply_fixture_sync'
        ? { data: changedRows(), error: null }
        : { data: { ok: true, scored: 1, entries: 1 }, error: null },
    )
    const r = await syncLeagueFixtures(client, TARGET, OPTS)

    expect(getFixtureEvents).toHaveBeenCalledTimes(1)
    expect(r.timelineCalls).toBe(1)
    expect(r.timelineRows).toBe(1)

    const written = inserts.find((i) => i.table === 'match_events')
    expect(written).toBeDefined()
    expect(written!.rows[0]).toMatchObject({
      fixture_id: 'fx-1',
      side: 'home',
      kind: 'goal',
      player_name: 'Josh King',
      minute: 11,
    })
    expect(formatLeagueNoteParts(r)).toContain('timeline=1/1')
  })

  it('deletes the fixture’s rows before inserting — replace-all, not upsert', async () => {
    // ⚠ The reason is a VAR reversal: it REMOVES an event from the payload
    // rather than marking it, so an upsert would leave a disallowed goal on
    // the screen for good.
    getFixtureEvents.mockClear()
    getFixtureEvents.mockResolvedValueOnce([] as never)
    const { client, deletes } = db((fn) =>
      fn === 'league_apply_fixture_sync'
        ? { data: changedRows(), error: null }
        : { data: { ok: true }, error: null },
    )
    await syncLeagueFixtures(client, TARGET, OPTS)
    const del = deletes.find((d) => d.table === 'match_events')
    expect(del).toBeDefined()
    expect(del!.filters.join(' ')).toContain('eq(fixture_id,fx-1)')
  })

  it('writes referee and the half-time pair together', async () => {
    getFixtureEvents.mockClear()
    getFixtureEvents.mockResolvedValueOnce([] as never)
    const { client, updates } = db(
      (fn) =>
        fn === 'league_apply_fixture_sync'
          ? { data: changedRows({ is_completed: true, status: 'completed' }), error: null }
          : { data: { ok: true }, error: null },
      [feedFixture(1557368, { referee: 'S. Barrott', ht: [2, 1] })],
    )
    await syncLeagueFixtures(client, TARGET, OPTS)
    const upd = updates.find((u) => u.table === 'league_fixtures')
    expect(upd?.row).toEqual({ referee: 'S. Barrott', home_goals_ht: 2, away_goals_ht: 1 })
  })

  it('never writes half of a half-time pair', async () => {
    // ⚠ `league_fixtures_ht_pair_ck` refuses {1, null}. mappers.ts records that
    // diffing each side alone is exactly what raises 23514 in production the
    // first time the provider reports a half-written score.
    getFixtureEvents.mockClear()
    getFixtureEvents.mockResolvedValueOnce([] as never)
    const { client, updates } = db(
      (fn) =>
        fn === 'league_apply_fixture_sync'
          ? { data: changedRows(), error: null }
          : { data: { ok: true }, error: null },
      [feedFixture(1557368, { referee: 'M. Oliver', ht: [1, null] })],
    )
    await syncLeagueFixtures(client, TARGET, OPTS)
    const upd = updates.find((u) => u.table === 'league_fixtures')
    expect(upd?.row).toEqual({ referee: 'M. Oliver' })
    expect(upd?.row).not.toHaveProperty('home_goals_ht')
  })

  it('an events failure is reported but never loses the sync', async () => {
    getFixtureEvents.mockClear()
    getFixtureEvents.mockRejectedValueOnce(new Error('api-football 503') as never)
    const { client } = db((fn) =>
      fn === 'league_apply_fixture_sync'
        ? { data: changedRows(), error: null }
        : { data: { ok: true, scored: 1, entries: 1 }, error: null },
    )
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(r.errors.map((e) => e.stage)).toContain('league_timeline')
    // The fixture write and the scoring both still counted — a blank timeline
    // is a missing card, not a wrong scoreboard.
    expect(r.written).toBe(1)
    expect(r.scored).toBe(1)
  })
})

// =============================================================
// 7b4 / 7b5 — statistics and line-ups (migration 139)
// =============================================================
// Two arms, two DIFFERENT gates, and the gates are the whole design. Statistics
// ride 7b3's `changed` gate. Line-ups cannot — a line-up is published before a
// ball is kicked, when nothing has changed — so they are gated on the window
// and on not already holding one.
//
// The tests below are about the GATE far more than the write. A gate that fires
// too often is a quota bill nobody notices until the month ends; a gate that
// never fires is a permanently empty tab.
// =============================================================

describe('syncLeagueFixtures — statistics and line-ups', () => {
  const changed = (over: Partial<{ is_completed: boolean }> = {}) => ({
    seen: 1,
    changed: [
      {
        // ⚠ `f-1`, matching `dbRow()`. 7b4 keys off `changed` and 7b5 off the
        // window row; in production they are the same fixture, and a harness
        // that gives them different ids lets a test pass for the wrong reason.
        fixture_id: 'f-1',
        external_fixture_id: '1557368',
        status: 'live',
        home_goals: 2,
        away_goals: 1,
        is_completed: over.is_completed ?? false,
      },
    ],
  })

  /**
   * As the timeline block's `db`, plus a queue for `match_lineups` — 7b5 reads
   * it to learn which window fixtures it already holds.
   */
  function db(
    rpcImpl: (fn: string) => unknown,
    opts: { held?: { fixture_id: string }[] } = {},
  ) {
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture(1557368)], calls: 1 })
    const base = fakeDb({
      league_fixtures: [
        { data: [dbRow()], error: null },
        { data: [], error: null },
        { data: [{ external_fixture_id: '1557368' }], error: null },
      ],
      league_matchweeks: [{ data: MW, error: null }],
      match_lineups: [{ data: opts.held ?? [], error: null }],
    })
    const client = {
      from: (base.client as unknown as { from: (t: string) => unknown }).from,
      rpc: (fn: string) => ({ then: (res: (v: unknown) => unknown) => res(rpcImpl(fn)) }),
    }
    // ⚠ `client` LAST — see the timeline block for what happens otherwise.
    return { ...base, client: client as never }
  }

  const STATS_PAYLOAD = [
    {
      team: { id: 1, name: 'Home' },
      statistics: [
        { type: 'Ball Possession', value: '65%' },
        { type: 'Total Shots', value: 12 },
        { type: 'Red Cards', value: null },
      ],
    },
    {
      team: { id: 2, name: 'Away' },
      statistics: [
        { type: 'Ball Possession', value: '35%' },
        { type: 'Total Shots', value: 4 },
      ],
    },
  ]

  const LINEUP_PAYLOAD = [
    {
      team: { id: 1, name: 'Home' },
      coach: { id: 1, name: 'A Manager' },
      formation: '4-3-3',
      startXI: [{ player: { id: 9, name: 'A Player', number: 9, pos: 'F', grid: '4:1' } }],
      substitutes: [{ player: { id: 12, name: 'A Sub', number: 12, pos: 'M', grid: null } }],
    },
    {
      team: { id: 2, name: 'Away' },
      coach: { id: 2, name: 'B Manager' },
      formation: '4-4-2',
      startXI: [{ player: { id: 10, name: 'B Player', number: 10, pos: 'M', grid: '3:2' } }],
      substitutes: [],
    },
  ]

  beforeEach(() => {
    getFixtureStatistics.mockClear()
    getFixtureLineups.mockClear()
    getFixtureStatistics.mockResolvedValue([] as never)
    getFixtureLineups.mockResolvedValue([] as never)
  })

  // ------------------------------------------------------------- statistics

  it('⚠ makes NO statistics call when nothing changed — the cost gate', async () => {
    const { client } = db(() => ({ data: { seen: 1, changed: [] }, error: null }))
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(getFixtureStatistics).not.toHaveBeenCalled()
    expect(r.statsCalls).toBe(0)
    expect(formatLeagueNoteParts(r).join(' ')).not.toContain('stats=')
  })

  it('fetches statistics once per changed fixture and writes both sides', async () => {
    getFixtureStatistics.mockResolvedValueOnce(STATS_PAYLOAD as never)
    const { client, inserts } = db(() => ({ data: changed(), error: null }))
    const r = await syncLeagueFixtures(client, TARGET, OPTS)

    expect(getFixtureStatistics).toHaveBeenCalledTimes(1)
    const written = inserts.find((i) => i.table === 'match_team_stats')
    expect(written).toBeTruthy()
    const rows = written!.rows as Record<string, unknown>[]
    expect(rows).toHaveLength(2)
    expect(rows.find((x) => x.side === 'home')).toMatchObject({
      fixture_id: 'f-1',
      possession_pct: 65,
      shots_total: 12,
      // Null, not zero — the feed sends both for "no red cards".
      red_cards: null,
    })
    expect(rows.find((x) => x.side === 'away')).toMatchObject({ possession_pct: 35 })
    expect(r.statsRows).toBe(2)
    expect(formatLeagueNoteParts(r).join(' ')).toContain('stats=2/1')
  })

  it('deletes the fixture rows before inserting — replace-all, not upsert', async () => {
    getFixtureStatistics.mockResolvedValueOnce(STATS_PAYLOAD as never)
    const { client, deletes } = db(() => ({ data: changed(), error: null }))
    await syncLeagueFixtures(client, TARGET, OPTS)
    const del = deletes.find((d) => d.table === 'match_team_stats')
    expect(del).toBeTruthy()
    expect(del!.filters.join(' ')).toContain('eq(fixture_id,f-1)')
  })

  it('a statistics failure is reported but never loses the sync or the timeline', async () => {
    getFixtureStatistics.mockRejectedValueOnce(new Error('api-football 503') as never)
    const { client } = db((fn) =>
      fn === 'league_apply_fixture_sync'
        ? { data: changed({ is_completed: true }), error: null }
        : { data: { ok: true, scored: 1, entries: 1 }, error: null },
    )
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(r.errors.map((e) => e.stage)).toContain('league_stats')
    // The fixture itself still synced and still scored.
    expect(r.written).toBe(1)
    expect(r.scored).toBe(1)
  })

  // ---------------------------------------------------------------- line-ups

  it('⚠ asks for a line-up even though NOTHING changed — the gate that differs', async () => {
    // The failure this pins: a line-up is published before kickoff, when the
    // fixture is still `scheduled` with null goals and `changed` is empty. Gate
    // it on `changed` and the tab is blank for the ninety minutes before a game
    // — precisely when it is opened.
    const { client } = db(() => ({ data: { seen: 1, changed: [] }, error: null }))
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(getFixtureLineups).toHaveBeenCalledTimes(1)
    expect(r.lineupCalls).toBe(1)
  })

  it('writes both line-ups, starters before the bench, with the sub ungridded', async () => {
    getFixtureLineups.mockResolvedValueOnce(LINEUP_PAYLOAD as never)
    const { client, inserts } = db(() => ({ data: { seen: 1, changed: [] }, error: null }))
    const r = await syncLeagueFixtures(client, TARGET, OPTS)

    const written = inserts.find((i) => i.table === 'match_lineups')
    expect(written).toBeTruthy()
    const rows = written!.rows as Record<string, unknown>[]
    expect(rows).toHaveLength(2)
    const home = rows.find((x) => x.side === 'home')!
    expect(home).toMatchObject({ fixture_id: 'f-1', formation: '4-3-3', coach_name: 'A Manager' })
    expect(home.players).toEqual([
      { player_id: 9, name: 'A Player', number: 9, pos: 'F', grid: '4:1', starter: true },
      { player_id: 12, name: 'A Sub', number: 12, pos: 'M', grid: null, starter: false },
    ])
    expect(r.lineupRows).toBe(2)
    expect(formatLeagueNoteParts(r).join(' ')).toContain('lineups=2/1')
  })

  it('⚠ an empty payload writes NOTHING, so the next tick asks again', async () => {
    // Writing an empty line-up would satisfy the "do we hold one" check and end
    // the retries — leaving the tab permanently blank for that fixture.
    const { client, inserts, deletes } = db(() => ({ data: { seen: 1, changed: [] }, error: null }))
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(getFixtureLineups).toHaveBeenCalledTimes(1)
    expect(inserts.find((i) => i.table === 'match_lineups')).toBeUndefined()
    expect(deletes.find((d) => d.table === 'match_lineups')).toBeUndefined()
    expect(r.lineupRows).toBe(0)
    // Visible as a call that wrote nothing, rather than vanishing.
    expect(formatLeagueNoteParts(r).join(' ')).toContain('lineups=0/1')
  })

  it('⚠ does NOT re-ask for a line-up it already holds', async () => {
    // The published XI does not change every minute, and the window is open for
    // thirty of them.
    const { client } = db(() => ({ data: { seen: 1, changed: [] }, error: null }), {
      held: [{ fixture_id: 'f-1' }],
    })
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(getFixtureLineups).not.toHaveBeenCalled()
    expect(r.lineupCalls).toBe(0)
  })

  it('⚠ DOES re-ask once when the fixture completes, to catch a revision', async () => {
    getFixtureLineups.mockResolvedValueOnce(LINEUP_PAYLOAD as never)
    const { client } = db(() => ({ data: changed({ is_completed: true }), error: null }), {
      held: [{ fixture_id: 'f-1' }],
    })
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(getFixtureLineups).toHaveBeenCalledTimes(1)
    expect(r.lineupCalls).toBe(1)
  })

  it('a line-up failure is reported but never loses the sync', async () => {
    getFixtureLineups.mockRejectedValueOnce(new Error('api-football 503') as never)
    const { client } = db(() => ({ data: changed(), error: null }))
    const r = await syncLeagueFixtures(client, TARGET, OPTS)
    expect(r.errors.map((e) => e.stage)).toContain('league_lineups')
    expect(r.written).toBe(1)
  })

  it('⚠ a failed "what do we hold" read stops it asking, rather than asking for everything', async () => {
    // Without the read the arm cannot tell "not published" from "already
    // stored". Asking for all of them every tick would be the runaway this
    // whole gate exists to avoid, so the safe direction is to ask for none.
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture(1557368)], calls: 1 })
    const base = fakeDb({
      league_fixtures: [
        { data: [dbRow()], error: null },
        { data: [], error: null },
        { data: [{ external_fixture_id: '1557368' }], error: null },
      ],
      league_matchweeks: [{ data: MW, error: null }],
      match_lineups: [{ data: null, error: { message: 'boom' } }],
    })
    const client = {
      from: (base.client as unknown as { from: (t: string) => unknown }).from,
      rpc: () => ({ then: (res: (v: unknown) => unknown) => res({ data: { seen: 1, changed: [] }, error: null }) }),
    }
    const r = await syncLeagueFixtures({ ...base, client: client as never }.client, TARGET, OPTS)
    expect(getFixtureLineups).not.toHaveBeenCalled()
    expect(r.errors.map((e) => e.stage)).toContain('league_lineups')
  })
})
