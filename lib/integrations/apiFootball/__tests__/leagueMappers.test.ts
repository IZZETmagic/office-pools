// =============================================================
// The LEAGUE fixture mapper (L3).
// =============================================================
// `fixtureToLeagueUpdate` exists because `league_fixtures` carries CHECK
// constraints that STRADDLE columns `fixtureToMatchUpdate` diffs independently.
// Reusing the World Cup mapper would raise 23514 in production rather than
// merely produce odd data, so the divergences are pinned here.
// =============================================================

import { describe, it, expect } from 'vitest'
import {
  fixtureToLeagueUpdate,
  mapLeagueStatus,
  type LeagueFixtureRow,
} from '@/lib/integrations/apiFootball/mappers'
import { hasEnvelopeErrors } from '@/lib/integrations/apiFootball/client'
import type { ApiFootballFixture, ApiFootballStatusShort } from '@/lib/integrations/apiFootball/types'

function fx(over: {
  short: ApiFootballStatusShort
  home?: number | null
  away?: number | null
  elapsed?: number | null
  extra?: number | null
  date?: string
  round?: string
}): ApiFootballFixture {
  return {
    fixture: {
      id: 1557368,
      referee: null,
      date: over.date ?? '2026-08-21T19:00:00+00:00',
      venue: { id: null, name: 'Emirates Stadium', city: 'London' },
      status: {
        long: over.short,
        short: over.short,
        elapsed: over.elapsed ?? null,
        extra: over.extra ?? null,
      },
    },
    league: { id: 39, season: 2026, round: over.round ?? 'Regular Season - 1' },
    teams: {
      home: { id: 42, name: 'Arsenal', winner: null },
      away: { id: 1346, name: 'Coventry', winner: null },
    },
    goals: { home: over.home ?? null, away: over.away ?? null },
    score: {
      halftime: { home: null, away: null },
      fulltime: { home: null, away: null },
      extratime: { home: null, away: null },
      penalty: { home: null, away: null },
    },
  }
}

function row(over: Partial<LeagueFixtureRow> = {}): LeagueFixtureRow {
  return {
    fixture_id: 'f-1',
    matchweek_id: 'mw-1',
    external_fixture_id: '1557368',
    kickoff_at: '2026-08-21T19:00:00+00:00',
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

describe('fixtureToLeagueUpdate — goals move as a pair (result_pair_ck)', () => {
  it('V2.1 sends BOTH goal keys when only one side is known', () => {
    const { payload } = fixtureToLeagueUpdate(fx({ short: '2H', home: 1, away: null }), row())
    expect(payload?.set_goals).toBe(true)
    expect(payload).toHaveProperty('home_goals', 1)
    // The constraint is CHECK ((home IS NULL) = (away IS NULL)); sending one
    // side alone is a 23514, which is why the pair is not diffed independently.
    expect(payload).toHaveProperty('away_goals', null)
  })
})

describe('fixtureToLeagueUpdate — completion requires goals (completed_ck)', () => {
  it('V2.2 refuses to complete an FT with NULL goals, and flags it', () => {
    const { payload, flags } = fixtureToLeagueUpdate(fx({ short: 'FT' }), row())
    expect(payload?.is_completed ?? false).toBe(false)
    expect(flags.finalWithoutGoals).toBe(true)
  })

  it('V2.3 completes an FT that has goals', () => {
    const { payload, flags } = fixtureToLeagueUpdate(
      fx({ short: 'FT', home: 2, away: 1 }),
      row({ is_completed: false }),
    )
    expect(payload?.set_completed).toBe(true)
    expect(payload?.is_completed).toBe(true)
    expect(payload?.set_goals).toBe(true)
    expect(payload?.home_goals).toBe(2)
    expect(payload?.away_goals).toBe(1)
    expect(flags.finalWithoutGoals).toBe(false)
  })
})

describe('fixtureToLeagueUpdate — status vocabulary', () => {
  it('V2.4 maps PST to postponed, a status `matches` never uses', () => {
    expect(mapLeagueStatus('PST')).toBe('postponed')
    const { payload } = fixtureToLeagueUpdate(fx({ short: 'PST' }), row())
    expect(payload?.status).toBe('postponed')
    expect(payload?.status_detail).toBe('postponed')
  })

  it('V2.5 carries live minute and period', () => {
    const { payload } = fixtureToLeagueUpdate(fx({ short: '2H', elapsed: 57 }), row())
    expect(payload?.status).toBe('live')
    expect(payload?.set_live).toBe(true)
    expect(payload?.live_period).toBe('2H')
    expect(payload?.live_minute).toBe(57)
  })

  it('V2.9 flags AWD and documents that the shared mapper files it as scheduled', () => {
    const { payload, flags } = fixtureToLeagueUpdate(fx({ short: 'AWD', home: 3, away: 0 }), row())
    expect(flags.awarded).toBe(true)
    // Inherited hole, asserted so it is visible rather than silently carried:
    // AWD is in no status bucket, so an awarded match reads as "not started".
    expect(payload?.status ?? 'scheduled').toBe('scheduled')
  })
})

describe('fixtureToLeagueUpdate — no phantom diffs', () => {
  it('V2.6 returns null when nothing moved', () => {
    const live = row({
      status: 'completed',
      status_detail: null,
      home_goals: 3,
      away_goals: 0,
      is_completed: true,
      live_minute: 90,
      live_period: null,
      live_added: null,
    })
    const { payload } = fixtureToLeagueUpdate(
      fx({ short: 'FT', home: 3, away: 0, elapsed: 90 }),
      live,
    )
    expect(payload).toBeNull()
  })
})

describe('fixtureToLeagueUpdate — reschedule detection compares instants', () => {
  it('V2.7 never emits a kickoff key, and TBD is not a move', () => {
    const { payload, flags } = fixtureToLeagueUpdate(
      fx({ short: 'TBD', date: '2030-01-01T00:00:00+00:00' }),
      row(),
    )
    expect(flags.rescheduled).toBe(false)
    // L3 never writes kickoff_at; the payload type has no such key.
    expect(payload == null || !('kickoff_at' in payload)).toBe(true)
    expect(payload == null || !('original_kickoff_at' in payload)).toBe(true)
  })

  it('V2.8 treats a different offset for the same instant as unchanged', () => {
    const { flags } = fixtureToLeagueUpdate(
      fx({ short: 'NS', date: '2026-08-21T20:00:00+01:00' }),
      row({ kickoff_at: '2026-08-21T19:00:00+00:00' }),
    )
    // A string compare here would report a reschedule on every fixture, every tick.
    expect(flags.rescheduled).toBe(false)
  })

  it('detects a genuine move', () => {
    const { flags } = fixtureToLeagueUpdate(
      fx({ short: 'NS', date: '2026-08-23T14:00:00+00:00' }),
      row({ kickoff_at: '2026-08-21T19:00:00+00:00' }),
    )
    expect(flags.rescheduled).toBe(true)
  })
})

describe('hasEnvelopeErrors — an HTTP 200 refusal is not an empty result', () => {
  it('V2.10 distinguishes a clean envelope from a populated errors object', () => {
    expect(hasEnvelopeErrors([])).toBe(false)
    expect(hasEnvelopeErrors(null)).toBe(false)
    expect(hasEnvelopeErrors('')).toBe(false)
    // api-football reports a rejected parameter, a plan restriction and an
    // exhausted allowance this way — HTTP 200, populated `errors`, empty
    // `response`. `strict` cannot see it, so the league arm checks it here.
    expect(hasEnvelopeErrors({ from: 'The From field must contain a valid date: Y-m-d.' })).toBe(true)
    expect(hasEnvelopeErrors(['rate limit'])).toBe(true)
  })
})

// =============================================================
// getFixturesAllPages — the HTTP 200 refusal must RAISE
// =============================================================
// This is the half `opts.strict` cannot cover. api-football answers a rejected
// parameter, a plan restriction and an exhausted daily allowance with HTTP 200,
// a populated `errors` field and `response: []` — and the rate-limit headers
// are still present, so quota looks healthy. Driven through a real fetch rather
// than a hand-thrown Error, because the point is that the 200 path raises.
// =============================================================

import { getFixturesAllPages } from '@/lib/integrations/apiFootball/client'
import { vi, afterEach } from 'vitest'

// The client refuses to build a request without a key; these tests never reach
// the network because `fetch` is stubbed via vi.stubGlobal — a plain
// `globalThis.fetch = …` is NOT reliably seen by the module under test.
process.env.API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || 'test-key'
afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

describe('getFixturesAllPages', () => {
  it('throws on a 200 carrying an errors object', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({
        errors: { from: 'The From field must contain a valid date: Y-m-d.' },
        response: [],
        paging: { current: 1, total: 1 },
      }),
    ))

    await expect(
      getFixturesAllPages({ league: 39, season: 2026, from: 'bad', to: 'bad' }, { strict: true }),
    ).rejects.toThrow(/refused/)
  })

  it('returns the fixtures and the call count on a clean envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ errors: [], response: [{ fixture: { id: 1 } }], paging: { current: 1, total: 1 } }),
    ))

    const { fixtures, calls } = await getFixturesAllPages({ league: 39, season: 2026 }, { strict: true })
    expect(fixtures).toHaveLength(1)
    expect(calls).toBe(1)
  })

  it('throws rather than truncating when the provider starts paginating past the cap', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ errors: [], response: [{ fixture: { id: 1 } }], paging: { current: 1, total: 9 } }),
    ))

    // Silent truncation here is a fixture that never syncs for the rest of the season.
    await expect(
      getFixturesAllPages({ league: 39, season: 2026 }, { strict: true }),
    ).rejects.toThrow(/paging cap/)
  })
})
