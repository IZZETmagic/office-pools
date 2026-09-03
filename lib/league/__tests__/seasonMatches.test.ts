// =============================================================
// The season's fixtures, in the shape a phone renders
// =============================================================
// This is the read behind `/api/users/:id/fixtures`, and what is pinned here is
// the SHAPING — because that is where this fails silently rather than loudly.
//
// A league fixture is drawn by components written for national teams. The
// club's name travels in `country_name`, its abbreviation in `country_code` and
// its crest in `flag_url`, and every one of those is read POSITIONALLY. Swap two
// and nothing throws: a card renders with no crest and the word "TBD", which
// looks like missing data rather than like a bug. The same trade, and the same
// hazard, as `dashboardFixtures.test.ts`.
//
// The matchweek is the other half. The adapter stamps `stage = 'regular_season'`
// — a value `matches_stage_check` does not even admit — and carries the real
// grouping in `round_number`. A consumer that reads `stage` for a section label
// prints a database enum at a member, which it did on the web.
// =============================================================

import { describe, it, expect } from 'vitest'
import { readLeagueSeasonMatches } from '../read'
import type { LeagueSeasonView } from '../read'

const CLUBS = [
  { club_id: 'c-ars', name: 'Arsenal', short_name: 'Arsenal', abbreviation: 'ARS', crest_url: 'https://x/ars.png' },
  { club_id: 'c-whu', name: 'West Ham United', short_name: 'West Ham', abbreviation: 'WHU', crest_url: null },
  // ⚠ `short_name` HERE IS THE FEED'S, and it is deliberately set to the full
  // name — which is what api-football actually ships for every Premier League
  // club, as `clubName.ts` documents. It is the discriminating case: reading
  // `c.short_name` gives "Manchester City" and only `shortClubName(c.name)`
  // gives "Man City", so the test below can tell the two wirings apart.
  { club_id: 'c-mci', name: 'Manchester City', short_name: 'Manchester City', abbreviation: 'MCI', crest_url: 'https://x/mci.png' },
]

const MATCHWEEKS = [
  { matchweek_id: 'mw-1', matchweek_number: 1, fixture_count: 1, completed_fixture_count: 1, lock_at: null, first_kickoff_at: null, ranks_snapshot_at: null },
  { matchweek_id: 'mw-12', matchweek_number: 12, fixture_count: 1, completed_fixture_count: 0, lock_at: null, first_kickoff_at: null, ranks_snapshot_at: null },
]

const fixture = (o: Record<string, unknown> = {}) => ({
  fixture_id: 'f1',
  matchweek_id: 'mw-12',
  fixture_number: 118,
  home_club_id: 'c-ars',
  away_club_id: 'c-whu',
  kickoff_at: '2026-11-28T15:00:00+00:00',
  venue: 'Emirates Stadium',
  status: 'scheduled',
  status_detail: null,
  original_kickoff_at: null,
  home_goals: null,
  away_goals: null,
  is_completed: false,
  live_minute: null,
  live_period: null,
  live_added: null,
  ...o,
})

const season = (fixtures: unknown[], matchweeks = MATCHWEEKS): LeagueSeasonView =>
  ({ clubs: CLUBS, matchweeks, fixtures } as unknown as LeagueSeasonView)

describe('readLeagueSeasonMatches', () => {
  it('puts the club name, abbreviation and crest in the fields the UI reads positionally', () => {
    const { matches } = readLeagueSeasonMatches(season([fixture()]), 't1')
    expect(matches[0].home_team).toEqual({
      country_name: 'Arsenal',
      country_code: 'ARS',
      flag_url: 'https://x/ars.png',
      // Unchanged by the shortener — no rule matches "Arsenal", which is the
      // right answer for it. Present rather than omitted so this assertion
      // keeps pinning the WHOLE embedded shape: the embed picks its fields by
      // hand, and a field dropped there reaches the phone as `undefined` with
      // nothing raised on either side.
      short_name: 'Arsenal',
    })
  })

  it('sends the COMPUTED short name, not the feed column of the same name', () => {
    const { matches } = readLeagueSeasonMatches(
      season([fixture({ home_club_id: 'c-mci' })]),
      't1',
    )
    // The feed says "Manchester City". `shortClubName` says "Man City", and the
    // phone's Results row fits about fourteen characters — which is the whole
    // reason this field exists.
    expect(matches[0].home_team?.short_name).toBe('Man City')
    // ⚠ And the full name still travels, because a surface with room should use
    // it. This is carried ALONGSIDE `country_name`, never substituted for it.
    expect(matches[0].home_team?.country_name).toBe('Manchester City')
  })

  it('leaves a missing crest null rather than inventing one', () => {
    const { matches } = readLeagueSeasonMatches(season([fixture()]), 't1')
    expect(matches[0].away_team?.flag_url).toBeNull()
    // Still named and abbreviated — a crestless club is not an unknown one.
    expect(matches[0].away_team?.country_name).toBe('West Ham United')
  })

  it('carries the MATCHWEEK in round_number, not in stage', () => {
    const { matches } = readLeagueSeasonMatches(season([fixture()]), 't1')
    expect(matches[0].round_number).toBe(12)
    expect(matches[0].stage).toBe('regular_season')
    // A club has no group. Printing "Group null" is the failure this prevents.
    expect(matches[0].group_letter).toBeNull()
  })

  it('carries status_detail and the original kickoff, so a postponed game is not shown as on', () => {
    const { matches } = readLeagueSeasonMatches(
      season([fixture({ status: 'postponed', status_detail: 'postponed', original_kickoff_at: '2026-11-28T15:00:00+00:00', kickoff_at: '2026-12-17T19:30:00+00:00' })]),
      't1',
    )
    // Both were hard-coded null until 2026-09-02, which is why a postponed
    // fixture rendered a kickoff time as though the game were still on.
    expect(matches[0].status_detail).toBe('postponed')
    expect(matches[0].original_match_date).toBe('2026-11-28T15:00:00+00:00')
    expect(matches[0].match_date).toBe('2026-12-17T19:30:00+00:00')
  })

  it('carries the live clock through unchanged', () => {
    const { matches } = readLeagueSeasonMatches(
      season([fixture({ status: 'live', live_minute: 90, live_period: '2H', live_added: 8, home_goals: 1, away_goals: 1 })]),
      't1',
    )
    expect(matches[0]).toMatchObject({
      status: 'live', live_minute: 90, live_period: '2H', live_added: 8,
      home_score_ft: 1, away_score_ft: 1,
    })
  })

  it('has no PSO scores — a regular-season fixture cannot go to penalties', () => {
    const { matches } = readLeagueSeasonMatches(season([fixture()]), 't1')
    expect(matches[0].home_score_pso).toBeNull()
    expect(matches[0].away_score_pso).toBeNull()
  })

  it('reports an orphaned fixture rather than dropping it', () => {
    // ⚠ Silently skipping it would render a SHORT matchweek with nothing to
    // explain the gap — an empty result that reads as a real one.
    const { matches, error } = readLeagueSeasonMatches(
      season([fixture({ matchweek_id: 'mw-not-read' })]),
      't1',
    )
    expect(error).toMatch(/1 fixture\(s\) reference a matchweek not in this season/)
    expect(matches).toEqual([])
  })

  it('returns every fixture of the season, in fixture order', () => {
    const { matches, error } = readLeagueSeasonMatches(
      season([fixture({ fixture_id: 'f1', matchweek_id: 'mw-1', fixture_number: 1 }), fixture({ fixture_id: 'f2' })]),
      't1',
    )
    expect(error).toBeNull()
    expect(matches.map((m) => m.match_id)).toEqual(['f1', 'f2'])
    expect(matches.map((m) => m.round_number)).toEqual([1, 12])
  })
})
