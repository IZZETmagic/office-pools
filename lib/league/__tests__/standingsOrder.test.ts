// =============================================================
// orderStandings — alphabetical, but only where the feed is silent
// =============================================================
// The tests that matter are the ones proving what it REFUSES to move. This
// function sits on top of an ingested table whose whole justification is that a
// derived one cannot see points deductions, so a bug here that reorders clubs
// which are not actually level is the same class of failure the ingestion was
// built to prevent.
// =============================================================

import { describe, it, expect } from 'vitest'
import { orderStandings, type OrderableStanding } from '@/lib/league/standingsOrder'

function row(
  club_name: string,
  rank: number,
  points: number,
  goals_for: number,
  goals_against: number,
  played = 1,
): OrderableStanding {
  return { club_name, rank, points, goals_for, goals_against, played, goals_diff: goals_for - goals_against }
}

/** The same row, plus the feed's band text for the place it holds. */
function banded(r: OrderableStanding, description: string | null): OrderableStanding {
  return { ...r, description }
}

describe('orderStandings', () => {
  it('sorts clubs that are level on every ingested figure', () => {
    // The case that started this: identical on points, GD, scored, conceded.
    const out = orderStandings([
      row('Manchester City', 7, 3, 2, 1),
      row('Ipswich', 8, 3, 2, 1),
    ])
    expect(out.map((r) => r.club_name)).toEqual(['Ipswich', 'Manchester City'])
  })

  it('keeps the positions where they were', () => {
    // The clubs swap; 7 and 8 do not become 1 and 2, and do not renumber.
    const out = orderStandings([
      row('Manchester City', 7, 3, 2, 1),
      row('Ipswich', 8, 3, 2, 1),
    ])
    expect(out.map((r) => r.rank)).toEqual([7, 8])
    expect(out.find((r) => r.club_name === 'Ipswich')!.rank).toBe(7)
  })

  it('will not move a club the feed separated on goals scored', () => {
    // Same points and goal difference, different goals scored — the feed has a
    // stated reason and it outranks alphabetical.
    const out = orderStandings([
      row('Chelsea', 6, 3, 3, 2),
      row('Arsenal', 7, 3, 2, 1),
    ])
    expect(out.map((r) => r.club_name)).toEqual(['Chelsea', 'Arsenal'])
  })

  it('⚠ will not move a club whose points differ — the deduction guard', () => {
    // A deducted club has different points BY DEFINITION, so it can never land
    // in a tie group. This is the property that makes the whole function safe
    // to run on top of an ingested table.
    const out = orderStandings([
      row('Aston Villa', 4, 10, 8, 4),
      row('Everton', 5, 2, 8, 4), // same GD, scored and conceded; 8 points docked
    ])
    expect(out.map((r) => r.club_name)).toEqual(['Aston Villa', 'Everton'])
    expect(out.map((r) => r.rank)).toEqual([4, 5])
  })

  it('handles a group of more than two', () => {
    const out = orderStandings([
      row('Wolves', 10, 5, 4, 4),
      row('Arsenal', 11, 5, 4, 4),
      row('Chelsea', 12, 5, 4, 4),
    ])
    expect(out.map((r) => r.club_name)).toEqual(['Arsenal', 'Chelsea', 'Wolves'])
    expect(out.map((r) => r.rank)).toEqual([10, 11, 12])
  })

  it('only groups clubs the feed placed ADJACENTLY', () => {
    // Two clubs level with each other but separated by a third that is not.
    // Reordering across that boundary would be inventing a table.
    const out = orderStandings([
      row('Wolves', 10, 5, 4, 4),
      row('Brentford', 11, 5, 9, 9), // same points, different scored/conceded
      row('Arsenal', 12, 5, 4, 4),
    ])
    expect(out.map((r) => r.club_name)).toEqual(['Wolves', 'Brentford', 'Arsenal'])
  })

  it('leaves a fully separated table untouched', () => {
    const input = [
      row('Brighton', 1, 3, 4, 0),
      row('Arsenal', 2, 3, 3, 0),
      row('Everton', 3, 3, 2, 0),
    ]
    expect(orderStandings(input).map((r) => r.club_name)).toEqual(['Brighton', 'Arsenal', 'Everton'])
  })

  it('does not mutate the array it was given', () => {
    const input = [row('Manchester City', 7, 3, 2, 1), row('Ipswich', 8, 3, 2, 1)]
    const before = input.map((r) => `${r.club_name}:${r.rank}`)
    orderStandings(input)
    expect(input.map((r) => `${r.club_name}:${r.rank}`)).toEqual(before)
  })

  it('is stable when applied twice', () => {
    const input = [row('Manchester City', 7, 3, 2, 1), row('Ipswich', 8, 3, 2, 1)]
    const once = orderStandings(input)
    expect(orderStandings(once)).toEqual(once)
  })

  it('survives an empty table', () => {
    expect(orderStandings([])).toEqual([])
  })

  // ===========================================================
  // The band belongs to the PLACE
  // ===========================================================
  // Found on screen 2026-08-28: the relegation bar was on 17, 19 and 20, and
  // 18 was clean. The ordering was right — the shading had followed the club.

  it('⚠ leaves the band on the position when the clubs inside it swap', () => {
    // Verbatim from the feed: Tottenham 17th unbanded, Coventry 18th relegated,
    // level on every ingested figure. Coventry sorts first and takes 17 — but
    // 18 is the relegation place, so 18 is what must carry the band.
    const out = orderStandings([
      banded(row('Tottenham', 17, 0, 0, 3), null),
      banded(row('Coventry', 18, 0, 0, 3), 'Relegation - Championship'),
    ])
    expect(out.map((r) => [r.rank, r.club_name, r.description])).toEqual([
      [17, 'Coventry', null],
      [18, 'Tottenham', 'Relegation - Championship'],
    ])
  })

  it('keeps each band on its own place across a group of three', () => {
    // A tie group straddling the relegation line in both directions.
    const out = orderStandings([
      banded(row('Wolves', 17, 5, 4, 4), null),
      banded(row('Arsenal', 18, 5, 4, 4), 'Relegation'),
      banded(row('Chelsea', 19, 5, 4, 4), 'Relegation'),
    ])
    expect(out.map((r) => [r.rank, r.club_name, r.description])).toEqual([
      [17, 'Arsenal', null],
      [18, 'Chelsea', 'Relegation'],
      [19, 'Wolves', 'Relegation'],
    ])
  })

  it('does not invent a description on rows that never carried one', () => {
    // Callers that do not select the column must come back with the same keys
    // they went in with — an added `description: undefined` is a new field.
    const out = orderStandings([
      row('Manchester City', 7, 3, 2, 1),
      row('Ipswich', 8, 3, 2, 1),
    ])
    expect(out.every((r) => !('description' in r))).toBe(true)
  })

  it('is stable when applied twice, bands included', () => {
    const input = [
      banded(row('Tottenham', 17, 0, 0, 3), null),
      banded(row('Coventry', 18, 0, 0, 3), 'Relegation - Championship'),
    ]
    const once = orderStandings(input)
    expect(orderStandings(once)).toEqual(once)
  })
})
