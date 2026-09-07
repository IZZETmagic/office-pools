// =============================================================
// Line-ups and statistics, against payloads the provider actually sent
// =============================================================
// The fixture files here are real `/fixtures/lineups` and `/fixtures/statistics`
// responses pulled from api-football on 2026-09-06, trimmed to the `response`
// array — the same convention `eventsToTimeline.test.ts` uses, and for the same
// reason: the shapes that break these mappers are the ones nobody would think
// to invent.
//
// `eventsToTimeline.test.ts` recounts the scoreline from the mapped rows,
// because every mistake that matters changes the total. The equivalent
// invariants here are:
//
//   · possession home + away = 100
//   · shots on + off + blocked = total shots
//   · a line-up is 11 starters and a bench, and every starter has a `grid`
//
// Each of those is violated by exactly the bug that would otherwise ship
// silently — a side swap, a bad parse, or inferring `starter` from `grid`.
// =============================================================

import { readFileSync } from 'fs'
import { resolve } from 'path'

import { describe, it, expect } from 'vitest'

import { lineupsToRows, statisticsToRows } from '../mappers'
import type { ApiFootballLineup, ApiFootballTeamStatistics } from '../types'

function load<T>(name: string): T {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `lib/integrations/apiFootball/__tests__/fixtures/${name}`), 'utf8'),
  ) as T
}

// Fulham 2-3 Crystal Palace. Fulham (36) at home, 4-2-3-1; Palace (52) 3-4-2-1.
const FULHAM = 36
const PALACE = 52
// Crystal Palace 1-4 Manchester City. Palace (52) at home this time — the same
// club on the other side, which is what catches a hard-coded team id.
const CITY = 50

const FX = 'fx-1'

describe('lineupsToRows — Fulham v Crystal Palace (1557391)', () => {
  const payload = load<ApiFootballLineup[]>('pl-1557391-lineups.json')
  const rows = lineupsToRows(payload, { fixtureId: FX, homeExternalTeamId: FULHAM })

  it('produces one row per side, with the fixture id on both', () => {
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.fixture_id === FX)).toBe(true)
    expect(rows.map((r) => r.side).sort()).toEqual(['away', 'home'])
  })

  it('reads the formation and the coach', () => {
    const home = rows.find((r) => r.side === 'home')!
    const away = rows.find((r) => r.side === 'away')!
    expect(home.formation).toBe('4-2-3-1')
    expect(away.formation).toBe('3-4-2-1')
    expect(home.coach_name).toBeTruthy()
    expect(away.coach_name).toBeTruthy()
  })

  it('is 11 starters and a bench, on each side', () => {
    for (const row of rows) {
      expect(row.players.filter((p) => p.starter)).toHaveLength(11)
      expect(row.players.filter((p) => !p.starter).length).toBeGreaterThan(0)
    }
  })

  it('puts the starters first, so the array can be rendered in order', () => {
    for (const row of rows) {
      const firstBench = row.players.findIndex((p) => !p.starter)
      expect(row.players.slice(0, firstBench).every((p) => p.starter)).toBe(true)
      expect(row.players.slice(firstBench).every((p) => !p.starter)).toBe(true)
    }
  })

  it('⚠ every starter has a grid and every substitute has none', () => {
    // This is the feed's answer, not a gap — and it is why `starter` is carried
    // explicitly rather than inferred from `grid != null`.
    for (const row of rows) {
      expect(row.players.filter((p) => p.starter).every((p) => p.grid !== null)).toBe(true)
      expect(row.players.filter((p) => !p.starter).every((p) => p.grid === null)).toBe(true)
    }
  })

  it('starts each side with its goalkeeper at grid 1:1', () => {
    for (const row of rows) {
      const keeper = row.players.find((p) => p.starter)!
      expect(keeper.grid).toBe('1:1')
      expect(keeper.pos).toBe('G')
    }
  })

  it('keeps the provider player id — names here are abbreviated', () => {
    const p = rows[0].players[0]
    expect(typeof p.player_id).toBe('number')
    expect(p.name).toBeTruthy()
    expect(typeof p.number).toBe('number')
  })

  it('⚠ resolves the side from the team id, not from array order', () => {
    // Same payload, but told the AWAY club is home. Every row must flip. An
    // implementation keyed on array order passes the tests above and fails this.
    const flipped = lineupsToRows(payload, { fixtureId: FX, homeExternalTeamId: PALACE })
    const before = rows.find((r) => r.side === 'home')!.formation
    const after = flipped.find((r) => r.side === 'away')!.formation
    expect(after).toBe(before)
    expect(flipped.find((r) => r.side === 'home')!.formation).toBe('3-4-2-1')
  })
})

describe('lineupsToRows — Palace v Man City (1557381), the same club on the other side', () => {
  const payload = load<ApiFootballLineup[]>('pl-1557381-lineups.json')

  it('puts Palace at home here, having put them away in the other fixture', () => {
    const rows = lineupsToRows(payload, { fixtureId: FX, homeExternalTeamId: PALACE })
    expect(rows.find((r) => r.side === 'home')!.formation).toBe('3-4-2-1')
    expect(rows.find((r) => r.side === 'away')!.formation).toBe('4-2-3-1')
  })

  it('resolves City as away', () => {
    const rows = lineupsToRows(payload, { fixtureId: FX, homeExternalTeamId: PALACE })
    const away = rows.find((r) => r.side === 'away')!
    expect(away.players.filter((p) => p.starter)).toHaveLength(11)
    // And the other way round, for completeness.
    const swapped = lineupsToRows(payload, { fixtureId: FX, homeExternalTeamId: CITY })
    expect(swapped.find((r) => r.side === 'home')!.formation).toBe('4-2-3-1')
  })
})

describe('lineupsToRows — the edges', () => {
  it('an empty payload is an empty result, not a throw — the pre-match case', () => {
    expect(lineupsToRows([], { fixtureId: FX, homeExternalTeamId: FULHAM })).toEqual([])
  })

  it('survives a line-up with no formation, no coach and no players', () => {
    const rows = lineupsToRows(
      [{ team: { id: FULHAM, name: 'Fulham' }, coach: null, formation: null, startXI: null, substitutes: null }],
      { fixtureId: FX, homeExternalTeamId: FULHAM },
    )
    expect(rows).toEqual([
      { fixture_id: FX, side: 'home', formation: null, coach_name: null, players: [] },
    ])
  })

  it('skips an entry with no team id rather than guessing a side', () => {
    const rows = lineupsToRows(
      [{ team: { id: null as unknown as number, name: '?' }, coach: null, formation: '4-4-2', startXI: null, substitutes: null }],
      { fixtureId: FX, homeExternalTeamId: FULHAM },
    )
    expect(rows).toEqual([])
  })

  it('tolerates a player with every field missing', () => {
    const rows = lineupsToRows(
      [{
        team: { id: FULHAM, name: 'Fulham' },
        coach: { id: null, name: null },
        formation: '4-4-2',
        startXI: [{ player: { id: null, name: null, number: null, pos: null, grid: null } }],
        substitutes: null,
      }],
      { fixtureId: FX, homeExternalTeamId: FULHAM },
    )
    expect(rows[0].players).toEqual([
      { player_id: null, name: null, number: null, pos: null, grid: null, starter: true },
    ])
  })
})

describe('statisticsToRows — Fulham v Crystal Palace (1557391)', () => {
  const payload = load<ApiFootballTeamStatistics[]>('pl-1557391-statistics.json')
  const rows = statisticsToRows(payload, { fixtureId: FX, homeExternalTeamId: FULHAM })
  const home = () => rows.find((r) => r.side === 'home')!
  const away = () => rows.find((r) => r.side === 'away')!

  it('produces one row per side', () => {
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.side).sort()).toEqual(['away', 'home'])
  })

  it("⚠ parses '65%' to 65, and the two sides' possession sums to 100", () => {
    // The invariant that catches a bad parse. A `parseInt` that kept the '%'
    // yields NaN; one that dropped the digits yields 0. Neither sums to 100.
    expect(home().possession_pct).toBe(65)
    expect(away().possession_pct).toBe(35)
    expect(home().possession_pct! + away().possession_pct!).toBe(100)
  })

  it('⚠ shots on + off + blocked equals total shots, on both sides', () => {
    // The invariant that catches a column swap: `shots_on` written into
    // `shots_off` still parses, still renders, and breaks this.
    for (const r of rows) {
      expect(r.shots_on! + r.shots_off! + r.shots_blocked!).toBe(r.shots_total!)
    }
  })

  it('maps the counts to the right columns', () => {
    expect(home()).toMatchObject({
      shots_total: 25, shots_on: 6, shots_off: 10, shots_blocked: 9,
      shots_inside_box: 22, shots_outside_box: 3,
      corners: 7, fouls: 6, offsides: 1, saves: 2,
      passes_total: 678, passes_accurate: 602,
      yellow_cards: 0, red_cards: 0,
    })
  })

  it('⚠ leaves a statistic this fixture did not send as NULL, not zero', () => {
    // 1557391 carries no `expected_goals` at all. Zero would say Fulham
    // generated nothing from 25 shots; null says we were not told.
    expect(home().expected_goals).toBeNull()
    expect(home().goals_prevented).toBeNull()
    expect(home().passes_pct).toBeNull()
  })

  it('picks up `Free Kicks`, which the other sampled fixture never sends', () => {
    expect(home().free_kicks).toBe(7)
    expect(away().free_kicks).toBe(6)
  })

  it('⚠ resolves the side from the team id, not from array order', () => {
    const flipped = statisticsToRows(payload, { fixtureId: FX, homeExternalTeamId: PALACE })
    expect(flipped.find((r) => r.side === 'home')!.possession_pct).toBe(35)
    expect(flipped.find((r) => r.side === 'away')!.possession_pct).toBe(65)
  })
})

describe('statisticsToRows — the edges', () => {
  const one = (statistics: { type: string; value: number | string | null }[]) =>
    statisticsToRows([{ team: { id: FULHAM, name: 'F' }, statistics }], {
      fixtureId: FX,
      homeExternalTeamId: FULHAM,
    })[0]

  it("parses a decimal, and keeps a NEGATIVE one — goals_prevented is signed", () => {
    const r = one([
      { type: 'expected_goals', value: '1.81' },
      { type: 'goals_prevented', value: '-0.17' },
    ])
    expect(r.expected_goals).toBe(1.81)
    expect(r.goals_prevented).toBe(-0.17)
  })

  it('rounds a fractional percentage rather than truncating it', () => {
    expect(one([{ type: 'Ball Possession', value: '66.7%' }]).possession_pct).toBe(67)
  })

  it('⚠ keeps null and 0 apart — the feed sends both for "no red cards"', () => {
    expect(one([{ type: 'Red Cards', value: null }]).red_cards).toBeNull()
    expect(one([{ type: 'Red Cards', value: 0 }]).red_cards).toBe(0)
  })

  it('⚠ IGNORES an unknown type rather than failing the fixture', () => {
    // The type set grows. A new one must not take the sync down for every
    // competition — that is the whole reason this map is closed over an open set.
    const r = one([
      { type: 'Something The Feed Invented In 2027', value: 42 },
      { type: 'Corner Kicks', value: 5 },
    ])
    expect(r.corners).toBe(5)
    expect(Object.values(r).filter((v) => v === 42)).toHaveLength(0)
  })

  it('treats unparseable and empty values as null', () => {
    expect(one([{ type: 'Corner Kicks', value: '' }]).corners).toBeNull()
    expect(one([{ type: 'Corner Kicks', value: 'n/a' }]).corners).toBeNull()
    expect(one([{ type: 'Ball Possession', value: '%' }]).possession_pct).toBeNull()
  })

  it('still produces a row for a side with no statistics yet', () => {
    const r = one([])
    expect(r.side).toBe('home')
    expect(r.fixture_id).toBe(FX)
    expect(r.possession_pct).toBeNull()
  })

  it('an empty payload is an empty result', () => {
    expect(statisticsToRows([], { fixtureId: FX, homeExternalTeamId: FULHAM })).toEqual([])
  })

  it('accepts a numeric possession, should the feed ever drop the percent sign', () => {
    expect(one([{ type: 'Ball Possession', value: 65 }]).possession_pct).toBe(65)
  })
})
