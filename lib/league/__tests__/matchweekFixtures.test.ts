// =============================================================
// One matchweek's fixtures, mapped once
// =============================================================
// This mapping was inline in `page.tsx` for the one week being played. The Room
// walks the season, so it had to come out — and the two things worth pinning are
// the two that have already cost time on the phone:
//
//   · `country_code` is the club's ABBREVIATION, not a shortened name. Both
//     field names sound like the answer and only one is.
//   · it is `char(3)`, so it arrives blank-padded.

import { describe, it, expect } from 'vitest'

import { matchweekFixtures, type SeasonMatch } from '../matchweekFixtures'

const match = (over: Partial<SeasonMatch> & { match_id: string; match_number: number }): SeasonMatch => ({
  round_number: 3,
  match_date: '2026-09-13T14:00:00Z',
  home_team: { country_name: 'Arsenal', country_code: 'ARS', flag_url: 'a.png' },
  away_team: { country_name: 'Chelsea', country_code: 'CHE', flag_url: 'c.png' },
  home_score_ft: null, away_score_ft: null,
  is_completed: false, status: 'scheduled',
  live_minute: null, live_period: null, live_added: null,
  ...over,
})

describe('matchweekFixtures', () => {
  it('takes only the asked-for matchweek, in fixture_number order', () => {
    const rows = matchweekFixtures([
      match({ match_id: 'b', match_number: 2 }),
      match({ match_id: 'a', match_number: 1 }),
      match({ match_id: 'other', match_number: 1, round_number: 4 }),
    ], 3)
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('reads the three-letter CODE, trimmed', () => {
    // ⚠ `char(3)` is blank-padded, and `short_name` beside it is a shortened
    // NAME — "Nott'm Forest". A sheet asking for codes and rendering names looks
    // simply unfixed rather than wrong.
    const [row] = matchweekFixtures([
      match({
        match_id: 'a', match_number: 1,
        home_team: { country_name: 'Nottingham Forest', country_code: 'NFO', flag_url: null },
      }),
    ], 3)
    expect(row.homeAbbr).toBe('NFO')
    expect(row.homeName).not.toBe('NFO')
  })

  it('never invents a club', () => {
    // A fixture whose clubs have not been linked yet renders as Home/Away with
    // no crest, rather than throwing on a page that is mostly about other weeks.
    const [row] = matchweekFixtures([
      match({ match_id: 'a', match_number: 1, home_team: null, away_team: null }),
    ], 3)
    expect(row.homeName).toBe('Home')
    expect(row.homeAbbr).toBe('')
    expect(row.homeCrest).toBeNull()
  })

  it('carries the live half through, so a running clock survives the mapping', () => {
    const [row] = matchweekFixtures([
      match({
        match_id: 'a', match_number: 1,
        status: 'live', live_minute: 67, live_period: '2H',
        home_score_ft: 1, away_score_ft: 0,
      }),
    ], 3)
    expect(row.status).toBe('live')
    expect(row.liveMinute).toBe(67)
    expect(row.homeScore).toBe(1)
  })
})
