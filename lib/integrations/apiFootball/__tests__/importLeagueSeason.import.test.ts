// =============================================================
// League import — the integrated path, against the league's OWN tables.
// =============================================================
// Retargeted with the importer (L2). It previously asserted rows landing in the
// World Cup's `teams` and `matches`; a league now has its own structure.
//
// The phase heuristic is covered in isolation by importLeagueSeason.phase.test.ts.
// This covers what the importer DOES with it: which rows reach which table,
// what is skipped and why, and that a collision refuses to write anything.
// =============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

const getTeamsForLeague = vi.fn()
const getFixtures = vi.fn()

vi.mock('@/lib/integrations/apiFootball/client', () => ({
  ApiFootballClient: {
    getTeamsForLeague: (...a: unknown[]) => getTeamsForLeague(...a),
    getFixtures: (...a: unknown[]) => getFixtures(...a),
  },
  getLastQuota: () => ({ requestsRemaining: null, rateLimitRemaining: null }),
}))

const { importLeagueSeason } = await import('@/lib/integrations/apiFootball/importLeagueSeason')

type Row = Record<string, unknown>

/** Records every insert per table; every SELECT resolves empty (fresh season). */
function fakeSupabase() {
  const inserted: Record<string, Row[]> = {}
  let seq = 0
  const client = {
    from(table: string) {
      const api: Record<string, unknown> = {}
      const chain = () => api
      api.select = chain
      api.eq = chain
      api.maybeSingle = async () => ({ data: null, error: null })
      api.single = async () => ({ data: null, error: null })
      api.then = (res: (v: { data: never[]; error: null }) => unknown) => res({ data: [], error: null })
      api.insert = (rows: Row | Row[]) => {
        const list = Array.isArray(rows) ? rows : [rows]
        inserted[table] = [...(inserted[table] ?? []), ...list]
        const returned = list.map((r) => ({
          ...r,
          season_id: `season-1`,
          club_id: `club-${r.external_club_id ?? ++seq}`,
          matchweek_id: `mw-${r.matchweek_number ?? ++seq}`,
        }))
        return {
          select: () => ({
            single: async () => ({ data: returned[0], error: null }),
            then: (res: (v: { data: Row[]; error: null }) => unknown) => res({ data: returned, error: null }),
          }),
          then: (res: (v: { error: null }) => unknown) => res({ error: null }),
        }
      }
      return api
    },
  }
  return { client: client as never, inserted }
}

const team = (id: number, name: string, code: string) => ({ team: { id, name, code, logo: `${code}.png` } })
const fixture = (id: number, round: string, date: string, home: number, away: number) => ({
  fixture: { id, date, venue: { name: 'Ground', city: 'Town' }, status: { short: 'NS' } },
  league: { round },
  teams: { home: { id: home, name: `T${home}` }, away: { id: away, name: `T${away}` } },
})

const ARGS = {
  competition_slug: 'premier-league', competition_name: 'Premier League',
  season_label: '2026/27', season_start_year: 2026, country_code: 'ENG',
  league: 39, season: 2026, commit: true,
}

beforeEach(() => { getTeamsForLeague.mockReset(); getFixtures.mockReset() })

describe('importLeagueSeason — writes the league structure', () => {
  it('creates season, clubs, matchweeks and fixtures in the league tables', async () => {
    getTeamsForLeague.mockResolvedValue([team(1, 'Alpha', 'ALP'), team(2, 'Beta', 'BET')])
    getFixtures.mockResolvedValue([
      fixture(100, 'Regular Season - 1', '2026-08-15T12:00:00Z', 1, 2),
      fixture(101, 'Regular Season - 2', '2026-08-22T12:00:00Z', 2, 1),
    ])

    const { client, inserted } = fakeSupabase()
    const res = await importLeagueSeason(client, ARGS)

    expect(res.phase.imported).toBe('Regular Season')
    expect(inserted.league_seasons).toHaveLength(1)
    expect(inserted.league_clubs).toHaveLength(2)
    expect(inserted.league_matchweeks).toHaveLength(2)
    expect(inserted.league_fixtures).toHaveLength(2)

    // Nothing goes near the World Cup's tables any more.
    expect(inserted.teams).toBeUndefined()
    expect(inserted.matches).toBeUndefined()
    expect(inserted.tournaments).toBeUndefined()
  })

  it('gives a club a real name, not a country with a flag', async () => {
    getTeamsForLeague.mockResolvedValue([team(33, 'Manchester United', 'MUN'), team(42, 'Arsenal', 'ARS')])
    getFixtures.mockResolvedValue([fixture(1, 'Regular Season - 1', '2026-08-15T12:00:00Z', 33, 42)])

    const { client, inserted } = fakeSupabase()
    await importLeagueSeason(client, ARGS)

    const united = inserted.league_clubs.find((c) => c.external_club_id === 33)!
    expect(united.name).toBe('Manchester United')
    expect(united.abbreviation).toBe('MUN')
    expect(united.crest_url).toBe('MUN.png')
    // The columns that made a club a nation are simply not here.
    expect(united.country_name).toBeUndefined()
    expect(united.group_letter).toBeUndefined()
  })

  it('carries the provider round verbatim onto the matchweek', async () => {
    getTeamsForLeague.mockResolvedValue([team(1, 'Alpha', 'ALP'), team(2, 'Beta', 'BET')])
    getFixtures.mockResolvedValue([fixture(1, 'Regular Season - 7', '2026-10-03T12:00:00Z', 1, 2)])

    const { client, inserted } = fakeSupabase()
    await importLeagueSeason(client, ARGS)

    const mw = inserted.league_matchweeks[0]
    expect(mw.matchweek_number).toBe(7)
    expect(mw.provider_round).toBe('Regular Season - 7')
    expect(mw.label).toBe('Matchweek 7')
    // fixture_count and lock_at are left to the window trigger — inserting them
    // here would violate the empty-has-no-lock CHECK.
    expect(mw.fixture_count).toBeUndefined()
    expect(mw.lock_at).toBeUndefined()
  })

  it('skips the play-off tail with a reason', async () => {
    getTeamsForLeague.mockResolvedValue([team(1, 'Alpha', 'ALP'), team(2, 'Beta', 'BET')])
    getFixtures.mockResolvedValue([
      fixture(100, 'Regular Season - 1', '2026-08-15T12:00:00Z', 1, 2),
      fixture(101, 'Regular Season - 2', '2026-08-22T12:00:00Z', 2, 1),
      fixture(102, 'Final', '2027-05-30T12:00:00Z', 1, 2),   // Bundesliga / Ligue 1 / POR
    ])

    const { client, inserted } = fakeSupabase()
    const res = await importLeagueSeason(client, ARGS)

    expect(res.fixtures.to_insert).toBe(2)
    expect(res.phase.skippedByPhase).toEqual({ Final: 1 })
    expect(res.fixtures.plan.find((f) => f.status === 'skipped')!.reason).toMatch(/not the regular season/)
    expect(inserted.league_fixtures).toHaveLength(2)
  })

  it("picks Scotland's '1st Phase' by size, not by name", async () => {
    getTeamsForLeague.mockResolvedValue([team(1, 'Alpha', 'ALP'), team(2, 'Beta', 'BET')])
    getFixtures.mockResolvedValue([
      fixture(1, '1st Phase - 1', '2026-08-01T12:00:00Z', 1, 2),
      fixture(2, '1st Phase - 2', '2026-08-08T12:00:00Z', 2, 1),
      fixture(3, '1st Phase - 3', '2026-08-15T12:00:00Z', 1, 2),
      fixture(4, 'Championship Group - 34', '2027-04-01T12:00:00Z', 1, 2),
    ])

    const { client } = fakeSupabase()
    const res = await importLeagueSeason(client, ARGS)
    expect(res.phase.imported).toBe('1st Phase')
    expect(res.fixtures.to_insert).toBe(3)
  })
})

describe('importLeagueSeason — refuses rather than corrupting', () => {
  it('throws on an ordinal collision, having written nothing', async () => {
    getTeamsForLeague.mockResolvedValue([team(1, 'Alpha', 'ALP'), team(2, 'Beta', 'BET')])
    getFixtures.mockResolvedValue([
      fixture(1, 'Regular Season - 1', '2026-08-01T12:00:00Z', 1, 2),
      fixture(2, 'Regular Season - 2', '2026-08-08T12:00:00Z', 2, 1),
      fixture(3, 'Regular Season- 2', '2026-08-09T12:00:00Z', 1, 2),  // same phase, same ordinal
    ])

    const { client, inserted } = fakeSupabase()
    await expect(importLeagueSeason(client, ARGS)).rejects.toThrow(/ordinal collision/)
    // The guard runs before ANY insert — including the season row.
    expect(inserted.league_seasons).toBeUndefined()
    expect(inserted.league_fixtures).toBeUndefined()
  })

  it('throws when no phase has numbered rounds', async () => {
    getTeamsForLeague.mockResolvedValue([team(1, 'Alpha', 'ALP'), team(2, 'Beta', 'BET')])
    getFixtures.mockResolvedValue([
      fixture(1, 'Semi-finals', '2027-05-01T12:00:00Z', 1, 2),
      fixture(2, 'Final', '2027-05-10T12:00:00Z', 1, 2),
    ])
    const { client } = fakeSupabase()
    await expect(importLeagueSeason(client, ARGS)).rejects.toThrow(/no numbered round phase/)
  })
})
