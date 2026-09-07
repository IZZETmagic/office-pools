// =============================================================
// The scout report
// =============================================================
// The whole module answers one question — "what usually happens when these two
// play" — and it can be wrong in a way that reads perfectly: every figure is
// from THIS fixture's home club's point of view, while the two clubs swap ends
// between meetings. Reading the payload's home/away columns straight through
// produces a complete, plausible, and entirely different team's record.
//
// Most of what follows is that one mistake, approached from several directions.
// =============================================================

import { describe, expect, it } from 'vitest'

import { isCompetitive, MIN_MEETINGS, summariseH2H, type H2HFixture } from '../h2h'

const ARSENAL = 42
const CHELSEA = 49

function meeting(over: Partial<H2HFixture> = {}): H2HFixture {
  return {
    fixtureId: 1,
    date: '2026-09-06T15:30:00+00:00',
    competitionId: 39,
    competition: 'Premier League',
    venueName: 'Emirates Stadium',
    homeExternalId: ARSENAL,
    awayExternalId: CHELSEA,
    homeGoals: 1,
    awayGoals: 0,
    htHome: 0,
    htAway: 0,
    ...over,
  }
}

describe('isCompetitive', () => {
  it('keeps league and cup football', () => {
    expect(isCompetitive({ competitionId: 39, competition: 'Premier League' })).toBe(true)
    expect(isCompetitive({ competitionId: 45, competition: 'FA Cup' })).toBe(true)
    expect(isCompetitive({ competitionId: 3, competition: 'UEFA Europa League' })).toBe(true)
    expect(isCompetitive({ competitionId: 528, competition: 'Community Shield' })).toBe(true)
  })

  it('drops friendlies, by id and by name', () => {
    expect(isCompetitive({ competitionId: 667, competition: 'Friendlies Clubs' })).toBe(false)
    expect(isCompetitive({ competitionId: 26, competition: 'International Champions Cup' })).toBe(false)
    expect(isCompetitive({ competitionId: 9999, competition: 'Club Friendly' })).toBe(false)
  })

  it('⚠ FAILS OPEN on a competition it has never seen', () => {
    // Letting a stray friendly through is a small inaccuracy; dropping a real
    // European tie is a lie about the fixture. An include list would do the
    // second silently.
    expect(isCompetitive({ competitionId: 12345, competition: 'Some New Cup' })).toBe(true)
  })
})

describe('summariseH2H — whose record is it', () => {
  it('⚠ counts from THIS fixture\'s home club, wherever the meeting was played', () => {
    // Arsenal won both: once at home 2-0, once away 0-1. Read the payload's
    // home column straight through and you get one win and one defeat.
    const s = summariseH2H(
      [
        meeting({ fixtureId: 1, homeExternalId: ARSENAL, awayExternalId: CHELSEA, homeGoals: 2, awayGoals: 0 }),
        meeting({ fixtureId: 2, homeExternalId: CHELSEA, awayExternalId: ARSENAL, homeGoals: 0, awayGoals: 1 }),
      ],
      { homeExternalId: ARSENAL },
    )
    expect(s).toMatchObject({ meetings: 2, wins: 2, draws: 0, losses: 0 })
    expect(s.goalsFor).toBe(3)
    expect(s.goalsAgainst).toBe(0)
  })

  it('gives the mirror answer for the other club', () => {
    const fixtures = [
      meeting({ homeExternalId: ARSENAL, awayExternalId: CHELSEA, homeGoals: 2, awayGoals: 0 }),
      meeting({ fixtureId: 2, homeExternalId: CHELSEA, awayExternalId: ARSENAL, homeGoals: 0, awayGoals: 1 }),
    ]
    const a = summariseH2H(fixtures, { homeExternalId: ARSENAL })
    const c = summariseH2H(fixtures, { homeExternalId: CHELSEA })
    expect(c.wins).toBe(a.losses)
    expect(c.losses).toBe(a.wins)
    expect(c.goalsFor).toBe(a.goalsAgainst)
    expect(c.draws).toBe(a.draws)
  })

  it('⚠ writes the common scoreline from the same point of view', () => {
    // Two 2-0 wins, one at home and one away. As a home/away read they are
    // "2-0" and "0-2" and neither is common; from Arsenal's view both are 2-0.
    const s = summariseH2H(
      [
        meeting({ homeExternalId: ARSENAL, homeGoals: 2, awayGoals: 0 }),
        meeting({ fixtureId: 2, homeExternalId: CHELSEA, awayExternalId: ARSENAL, homeGoals: 0, awayGoals: 2 }),
      ],
      { homeExternalId: ARSENAL },
    )
    expect(s.commonScore).toEqual({ score: '2-0', count: 2 })
  })
})

describe('summariseH2H — the counting', () => {
  const many: H2HFixture[] = [
    meeting({ fixtureId: 1, date: '2026-09-06T15:30:00Z', homeGoals: 2, awayGoals: 1, htHome: 1, htAway: 1 }),
    meeting({ fixtureId: 2, date: '2026-03-01T15:30:00Z', homeExternalId: CHELSEA, awayExternalId: ARSENAL, homeGoals: 1, awayGoals: 1, htHome: 0, htAway: 1, venueName: 'Stamford Bridge' }),
    meeting({ fixtureId: 3, date: '2025-11-02T15:30:00Z', homeGoals: 0, awayGoals: 0, htHome: 0, htAway: 0 }),
    meeting({ fixtureId: 4, date: '2025-04-20T15:30:00Z', competitionId: 45, competition: 'FA Cup', homeGoals: 3, awayGoals: 1, htHome: null, htAway: null }),
    meeting({ fixtureId: 5, date: '2024-08-01T15:30:00Z', competitionId: 667, competition: 'Friendlies Clubs', homeGoals: 5, awayGoals: 0 }),
  ]
  const s = summariseH2H(many, { homeExternalId: ARSENAL, venueName: 'Emirates Stadium' })

  it('⚠ excludes the friendly, and says how many it dropped', () => {
    expect(s.meetings).toBe(4)
    expect(s.excluded).toBe(1)
    // The 5-0 friendly would have swung every one of these.
    expect(s.goalsFor).toBe(6)
  })

  it('averages goals across both sides', () => {
    // (2+1) + (1+1) + 0 + (3+1) = 9 over 4 meetings.
    expect(s.avgGoals).toBe(2.3)
  })

  it('counts meetings where both scored', () => {
    expect(s.bothScored).toBe(3)
  })

  it('orders recent newest-first and caps at five', () => {
    expect(s.recent.map((f) => f.fixtureId)).toEqual([1, 2, 3, 4])
    expect(s.recent.length).toBeLessThanOrEqual(5)
  })

  it('spans oldest to newest, over the competitive ones only', () => {
    expect(s.span?.from.slice(0, 4)).toBe('2025')
    expect(s.span?.to.slice(0, 4)).toBe('2026')
  })

  it('breaks down the competitions, commonest first', () => {
    expect(s.competitions).toEqual([
      { id: 39, name: 'Premier League', count: 3 },
      { id: 45, name: 'FA Cup', count: 1 },
    ])
  })

  it('keeps a venue record separate from the overall one', () => {
    // Three at the Emirates: won 2-1, drew 0-0, won 3-1 — and the fourth
    // meeting was at Stamford Bridge, so it is in the overall record and not
    // in this one.
    expect(s.atVenue).toEqual({ played: 3, wins: 2, draws: 1, losses: 0 })
    expect(s.meetings).toBe(4)
  })

  it('⚠ carries its own denominator for the half-time figure', () => {
    // The FA Cup tie has no half-time score, so it is not in either number —
    // and the screen can say "1 of 3" rather than implying it saw all four.
    expect(s.decidedAfterHtOf).toBe(3)
    expect(s.decidedAfterHt).toBe(1) // the 1-1 at half time that finished 2-1
  })
})

describe('summariseH2H — the thin cases', () => {
  it('survives no meetings at all', () => {
    const s = summariseH2H([], { homeExternalId: ARSENAL })
    expect(s).toMatchObject({ meetings: 0, wins: 0, avgGoals: 0, commonScore: null, span: null })
    expect(s.atVenue).toBeNull()
    expect(s.recent).toEqual([])
  })

  it('survives every meeting being a friendly', () => {
    const s = summariseH2H(
      [meeting({ competitionId: 667, competition: 'Friendlies Clubs' })],
      { homeExternalId: ARSENAL },
    )
    expect(s.meetings).toBe(0)
    expect(s.excluded).toBe(1)
  })

  it('has no venue record when the ground never comes up', () => {
    const s = summariseH2H([meeting({ venueName: 'Stamford Bridge' })], {
      homeExternalId: ARSENAL,
      venueName: 'Emirates Stadium',
    })
    expect(s.atVenue).toBeNull()
  })

  it('⚠ the gate is above the thinnest real pairings in the league', () => {
    // The provider holds 3 meetings for Sunderland v Brighton and 3 for
    // Coventry v Arsenal, one of them competitive. Those must not get a tab.
    expect(MIN_MEETINGS).toBeGreaterThan(3)
  })
})
