// =============================================================
// The dashboard's matches panel, for a league
// =============================================================
// The panel reads `matches` filtered by the tournaments a member has pools in,
// and a league tournament has ZERO rows there. So a member whose only pool was
// a Premier League one saw "No upcoming matches scheduled" on a Saturday with
// ten games to come — silently, because an empty result is a valid one.
//
// What is pinned here is the SHAPING, which is where the silent failures live:
// the panel reads club fields positionally (`country_name` for the name,
// `flag_url` for the crest), so a mis-mapped key renders a card with no crest
// and the word "TBD" rather than throwing.
// =============================================================

import { describe, it, expect } from 'vitest'
import { readLeagueDashboardFixtures } from '@/lib/league/read'

const SEASON_ENG = 'season-eng'
const SEASON_ESP = 'season-esp'

const CLUBS = [
  { club_id: 'c-liv', name: 'Liverpool', abbreviation: 'LIV', crest_url: 'https://x/liv.png' },
  { club_id: 'c-nfo', name: "Nott'm Forest", abbreviation: 'NFO', crest_url: 'https://x/nfo.png' },
  { club_id: 'c-lev', name: 'Levante', abbreviation: 'LEV', crest_url: null },
  { club_id: 'c-bet', name: 'Real Betis', abbreviation: 'BET', crest_url: 'https://x/bet.png' },
]

const SEASONS = [
  { season_id: SEASON_ENG, competition_name: 'Premier League' },
  { season_id: SEASON_ESP, competition_name: 'La Liga' },
]

const fixture = (o: Partial<Record<string, unknown>>) => ({
  fixture_id: 'f1', fixture_number: 1, season_id: SEASON_ENG,
  kickoff_at: '2026-08-29T11:30:00+00:00', venue: 'Anfield', status: 'scheduled',
  home_goals: null, away_goals: null, home_club_id: 'c-liv', away_club_id: 'c-nfo', ...o,
})

/**
 * A supabase stub. `league_fixtures` is asked for twice — live then upcoming —
 * so it answers from a queue rather than a single value.
 */
function stub(opts: { live?: unknown[]; upcoming?: unknown[]; error?: string } = {}) {
  const fixtureQueue = [opts.live ?? [], opts.upcoming ?? []]
  const tables: Record<string, unknown[]> = { league_clubs: CLUBS, league_seasons: SEASONS }
  return {
    from(table: string) {
      const rows = table === 'league_fixtures' ? (fixtureQueue.shift() ?? []) : (tables[table] ?? [])
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'in', 'eq', 'gte', 'order', 'limit']) chain[m] = () => chain
      ;(chain as { then: unknown }).then = (res: (v: unknown) => unknown) =>
        res(opts.error ? { data: null, error: { message: opts.error } } : { data: rows, error: null })
      return chain
    },
  } as never
}

describe('shaping a fixture for the panel', () => {
  it('maps the club onto the fields the panel reads positionally', async () => {
    const { upcoming } = await readLeagueDashboardFixtures(stub({ upcoming: [fixture({})] }), [SEASON_ENG], 5)
    expect(upcoming).toHaveLength(1)
    // ⚠ The names are World-Cup-shaped and the panel reads them by position.
    // `name` -> country_name, `abbreviation` -> country_code, `crest_url` -> flag_url.
    expect(upcoming[0].home_team).toEqual({
      country_name: 'Liverpool', country_code: 'LIV', flag_url: 'https://x/liv.png',
    })
    expect(upcoming[0].away_team?.country_name).toBe("Nott'm Forest")
  })

  it('names the competition', async () => {
    const { upcoming } = await readLeagueDashboardFixtures(stub({ upcoming: [fixture({})] }), [SEASON_ENG], 5)
    expect(upcoming[0].competition).toBe('Premier League')
  })

  it('carries kickoff and venue through', async () => {
    const { upcoming } = await readLeagueDashboardFixtures(stub({ upcoming: [fixture({})] }), [SEASON_ENG], 5)
    expect(upcoming[0].match_date).toBe('2026-08-29T11:30:00+00:00')
    expect(upcoming[0].venue).toBe('Anfield')
  })

  it('never produces a placeholder, so a fixture never lands in "awaiting results"', async () => {
    // A league fixture has real clubs from the day the season is published, so
    // the panel's TBD branch — which is what reads `stage` — is unreachable.
    const { upcoming } = await readLeagueDashboardFixtures(stub({ upcoming: [fixture({})] }), [SEASON_ENG], 5)
    expect(upcoming[0].home_team_placeholder).toBeNull()
    expect(upcoming[0].away_team_placeholder).toBeNull()
    expect(upcoming[0].home_team).not.toBeNull()
    expect(upcoming[0].away_team).not.toBeNull()
  })

  it('tolerates a club with no crest', async () => {
    const f = fixture({ season_id: SEASON_ESP, home_club_id: 'c-lev', away_club_id: 'c-bet' })
    const { upcoming } = await readLeagueDashboardFixtures(stub({ upcoming: [f] }), [SEASON_ESP], 5)
    expect(upcoming[0].home_team?.flag_url).toBeNull()
    expect(upcoming[0].home_team?.country_name).toBe('Levante')
  })

  it('carries the score on a live fixture', async () => {
    const f = fixture({ status: 'live', home_goals: 2, away_goals: 1 })
    const { live } = await readLeagueDashboardFixtures(stub({ live: [f] }), [SEASON_ENG], 5)
    expect(live[0].home_score_ft).toBe(2)
    expect(live[0].away_score_ft).toBe(1)
    expect(live[0].status).toBe('live')
  })
})

describe('degrading rather than throwing', () => {
  it('returns empty for a member with no league pools, without querying', async () => {
    const exploding = { from() { throw new Error('must not query for an empty season list') } } as never
    const res = await readLeagueDashboardFixtures(exploding, [], 5)
    expect(res).toEqual({ live: [], upcoming: [], error: null })
  })

  it('reports an error instead of taking the dashboard down', async () => {
    const res = await readLeagueDashboardFixtures(stub({ error: 'boom' }), [SEASON_ENG], 5)
    expect(res.live).toEqual([])
    expect(res.upcoming).toEqual([])
    expect(res.error).toBe('boom')
  })

  it('drops a club it cannot resolve to null rather than inventing one', async () => {
    // A fixture referencing a club outside the requested seasons. The panel
    // filters on `home_team && away_team`, so null is the honest answer — a
    // fabricated name would render as a real fixture.
    const f = fixture({ home_club_id: 'c-unknown' })
    const { upcoming } = await readLeagueDashboardFixtures(stub({ upcoming: [f] }), [SEASON_ENG], 5)
    expect(upcoming[0].home_team).toBeNull()
    expect(upcoming[0].away_team).not.toBeNull()
  })
})
