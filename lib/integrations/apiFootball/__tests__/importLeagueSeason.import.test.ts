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

/**
 * Records every insert per table; every SELECT resolves empty (fresh season).
 *
 * `existing` seeds what `.maybeSingle()` returns for a given table, which is how
 * the "a placeholder is adopted, never rewritten" case is expressed — the
 * importer decides between insert and adopt on exactly that read.
 */
function fakeSupabase(existing: Record<string, Row> = {}) {
  const inserted: Record<string, Row[]> = {}
  let seq = 0
  const client = {
    from(table: string) {
      const api: Record<string, unknown> = {}
      const chain = () => api
      api.select = chain
      api.eq = chain
      api.maybeSingle = async () => ({ data: existing[table] ?? null, error: null })
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
          tournament_id: `tournament-${++seq}`,
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
/**
 * ⚠ The `league` block carries Spain's country and crest while `ARGS` below says
 * league 39 / 'ENG'. That mismatch is DELIBERATE: the placeholder's
 * `host_countries` and `logo_url` must come off the feed response, and asserting
 * a value the args could also have produced would prove nothing.
 */
const fixture = (id: number, round: string, date: string, home: number, away: number) => ({
  fixture: { id, date, venue: { name: 'Ground', city: 'Town' }, status: { short: 'NS' } },
  // The real feed ALWAYS sends this block, nulls and all. Omitting it here is
  // what let the importer read `f.goals` for a year without anybody noticing it
  // never had to handle a played match.
  goals: { home: null as number | null, away: null as number | null },
  league: {
    round,
    name: 'La Liga',
    country: 'Spain',
    logo: 'https://media.api-sports.io/football/leagues/140.png',
  },
  teams: { home: { id: home, name: `T${home}` }, away: { id: away, name: `T${away}` } },
})

/** The same fixture, already played. `FT` plus a scoreline, as the feed sends it. */
const played = (
  id: number, round: string, date: string, home: number, away: number, hg: number, ag: number,
) => ({
  ...fixture(id, round, date, home, away),
  fixture: { id, date, venue: { name: 'Ground', city: 'Town' }, status: { short: 'FT' } },
  goals: { home: hg as number | null, away: ag as number | null },
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

    // Nothing goes near the World Cup's FIXTURE and TEAM tables. This is the
    // containment guarantee and it is unchanged.
    expect(inserted.teams).toBeUndefined()
    expect(inserted.matches).toBeUndefined()

    // `tournaments` IS written now, and this assertion used to say it was not.
    // The importer creates the competition's placeholder, because without one
    // `pools/create` refuses with a 409 and the wizard cannot see the league at
    // all. So the claim worth defending is no longer "zero rows" — it is
    // "exactly one row, and unmistakably a league".
    expect(inserted.tournaments).toHaveLength(1)
    expect(inserted.tournaments[0]).toMatchObject({
      format: 'league',
      tournament_type: 'league',
      external_provider: 'api_football',
      external_league_id: 39,
      external_season: 2026,
      num_groups: 0,
      teams_per_group: 0,
    })
    expect(res.placeholder.status).toBe('new')
  })

  it('derives the placeholder from the feed and the counts, not from a catalogue', async () => {
    getTeamsForLeague.mockResolvedValue([team(1, 'Alpha', 'ALP'), team(2, 'Beta', 'BET')])
    getFixtures.mockResolvedValue([
      fixture(100, 'Regular Season - 1', '2026-08-15T12:00:00Z', 1, 2),
      fixture(101, 'Regular Season - 2', '2027-05-30T14:00:00Z', 2, 1),
    ])

    const { client, inserted } = fakeSupabase()
    await importLeagueSeason(client, ARGS)

    const ph = inserted.tournaments[0]
    // The window spans the whole season, not just the first fixture.
    expect(ph.start_date).toBe('2026-08-15')
    expect(ph.end_date).toBe('2027-05-30')
    expect(ph.prediction_deadline).toBe('2026-08-15T12:00:00Z')
    // Counts, not constants — this is what makes it right for an 18-club league.
    expect(ph.num_teams).toBe(2)
    expect(ph.description).toBe('2 clubs, 2 matchweeks, 2 fixtures. Flat round-robin: no groups, no knockout.')
    // Country and crest come off the fixtures response already in hand.
    expect(ph.host_countries).toBe('Spain')
    expect(ph.logo_url).toBe('https://media.api-sports.io/football/leagues/140.png')
  })

  it('adopts an existing placeholder and never rewrites it', async () => {
    getTeamsForLeague.mockResolvedValue([team(1, 'Alpha', 'ALP'), team(2, 'Beta', 'BET')])
    getFixtures.mockResolvedValue([
      fixture(100, 'Regular Season - 1', '2026-08-15T12:00:00Z', 1, 2),
    ])

    // The Premier League's placeholder was made by hand and may have been tuned
    // since. A re-run that silently reset its dates would be an outage, not a fix.
    const { client, inserted } = fakeSupabase({ tournaments: { tournament_id: 'hand-made' } })
    const res = await importLeagueSeason(client, ARGS)

    expect(inserted.tournaments).toBeUndefined()
    expect(res.placeholder).toMatchObject({ tournament_id: 'hand-made', status: 'existing' })
  })

  it('imports a match that has ALREADY been played with its real result', async () => {
    // The mid-season import. This used to write `scheduled / not completed` for
    // every fixture in the season, which is only true if you import before it
    // starts — how the Premier League was imported, and why nobody saw it.
    getTeamsForLeague.mockResolvedValue([team(1, 'Alpha', 'ALP'), team(2, 'Beta', 'BET')])
    getFixtures.mockResolvedValue([
      played(100, 'Regular Season - 1', '2026-08-15T12:00:00Z', 1, 2, 3, 0),
      fixture(101, 'Regular Season - 2', '2026-08-22T12:00:00Z', 2, 1),
    ])

    const { client, inserted } = fakeSupabase()
    await importLeagueSeason(client, ARGS)

    const [first, second] = inserted.league_fixtures
    expect(first).toMatchObject({
      status: 'completed', is_completed: true, home_goals: 3, away_goals: 0,
    })
    // Stamped with the KICKOFF, not `now()` — we did not witness the whistle,
    // and now() would claim a whole season finished the instant a script ran.
    expect(first.completed_at).toBe('2026-08-15T12:00:00Z')

    expect(second).toMatchObject({
      status: 'scheduled', is_completed: false, home_goals: null, away_goals: null,
      completed_at: null,
    })
  })

  it('refuses to mark a final fixture completed when the feed has no score', async () => {
    // `league_fixtures_completed_ck` is CHECK (NOT is_completed OR home_goals IS
    // NOT NULL), so writing FT-without-goals as completed raises 23514 and takes
    // the whole batch down. Same rule fixtureToLeagueUpdate follows.
    getTeamsForLeague.mockResolvedValue([team(1, 'Alpha', 'ALP'), team(2, 'Beta', 'BET')])
    getFixtures.mockResolvedValue([
      { ...played(100, 'Regular Season - 1', '2026-08-15T12:00:00Z', 1, 2, 0, 0),
        goals: { home: null, away: null } },
    ])

    const { client, inserted } = fakeSupabase()
    await importLeagueSeason(client, ARGS)

    expect(inserted.league_fixtures[0]).toMatchObject({
      status: 'completed', is_completed: false, home_goals: null, away_goals: null,
      completed_at: null,
    })
  })

  it('never writes half a scoreline', async () => {
    // `league_fixtures_result_pair_ck` — goals are NULL together or set together.
    getTeamsForLeague.mockResolvedValue([team(1, 'Alpha', 'ALP'), team(2, 'Beta', 'BET')])
    getFixtures.mockResolvedValue([
      { ...played(100, 'Regular Season - 1', '2026-08-15T12:00:00Z', 1, 2, 0, 0),
        goals: { home: 2, away: null } },
    ])

    const { client, inserted } = fakeSupabase()
    await importLeagueSeason(client, ARGS)

    const row = inserted.league_fixtures[0]
    expect(row.home_goals).toBeNull()
    expect(row.away_goals).toBeNull()
    expect(row.is_completed).toBe(false)
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
