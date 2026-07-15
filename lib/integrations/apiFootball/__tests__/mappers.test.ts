import { describe, it, expect } from 'vitest'

import { fixtureToMatchUpdate, mapStatusDetail, type OurMatchRow } from '../mappers'
import type { ApiFootballFixture, ApiFootballStatusShort } from '../types'

const NOW = '2026-07-05T12:00:00.000Z'

function makeFixture(
  short: ApiFootballStatusShort,
  opts: {
    goalsHome?: number | null
    goalsAway?: number | null
    psoHome?: number | null
    psoAway?: number | null
    elapsed?: number | null
    extra?: number | null
  } = {}
): ApiFootballFixture {
  return {
    fixture: {
      id: 1001,
      referee: null,
      date: '2026-06-20T18:00:00+00:00',
      venue: { id: null, name: null, city: null },
      status: { long: short, short, elapsed: opts.elapsed ?? null, extra: opts.extra ?? null },
    },
    league: { id: 1, season: 2026, round: 'Group Stage - 1' },
    teams: {
      home: { id: 10, name: 'Home', winner: null },
      away: { id: 20, name: 'Away', winner: null },
    },
    goals: { home: opts.goalsHome ?? null, away: opts.goalsAway ?? null },
    score: {
      halftime: { home: null, away: null },
      fulltime: { home: opts.goalsHome ?? null, away: opts.goalsAway ?? null },
      extratime: { home: null, away: null },
      penalty: { home: opts.psoHome ?? null, away: opts.psoAway ?? null },
    },
  }
}

function makeCurrent(overrides: Partial<OurMatchRow> = {}): OurMatchRow {
  return {
    match_id: 'm1',
    home_team_id: null,
    away_team_id: null,
    status: 'scheduled',
    status_detail: null,
    is_completed: false,
    home_score_ft: null,
    away_score_ft: null,
    home_score_pso: null,
    away_score_pso: null,
    live_minute: null,
    live_period: null,
    live_added: null,
    winner_team_id: null,
    data_source: 'api',
    ...overrides,
  }
}

const opts = { now: NOW, teamIdByExternal: new Map<number, string>() }

describe('mapStatusDetail', () => {
  const cases: Array<[ApiFootballStatusShort, ReturnType<typeof mapStatusDetail>]> = [
    ['NS', null],
    ['TBD', 'tbd'],
    ['1H', null],
    ['HT', null],
    ['2H', null],
    ['ET', null],
    ['BT', null],
    ['P', null],
    ['INT', 'interrupted'],
    ['LIVE', null],
    ['FT', null],
    ['AET', null],
    ['PEN', null],
    ['PST', 'postponed'],
    ['CANC', 'cancelled'],
    ['ABD', 'abandoned'],
    ['AWD', 'awarded'],
    ['WO', 'walkover'],
    ['SUSP', 'suspended'],
  ]
  it.each(cases)('maps %s -> %s', (short, expected) => {
    expect(mapStatusDetail(short)).toBe(expected)
  })

  it('never returns "delayed" (that is derived from original_match_date, not a status)', () => {
    for (const [short] of cases) expect(mapStatusDetail(short)).not.toBe('delayed')
  })
})

describe('fixtureToMatchUpdate — status_detail', () => {
  it('PST tags postponed while coarse status stays scheduled', () => {
    const out = fixtureToMatchUpdate(makeFixture('PST'), makeCurrent(), opts)
    expect(out).not.toBeNull()
    expect(out!.status).toBeUndefined() // scheduled -> scheduled, no coarse change
    expect(out!.status_detail).toBe('postponed')
  })

  it('SUSP keeps a live match live and tags suspended (regression: used to flip to scheduled)', () => {
    const out = fixtureToMatchUpdate(
      makeFixture('SUSP', { elapsed: 30 }),
      makeCurrent({ status: 'live', live_minute: 30, live_period: '1H' }),
      opts
    )
    expect(out).not.toBeNull()
    expect(out!.status).toBeUndefined() // stays 'live'
    expect(out!.is_completed).toBeUndefined() // NOT completed
    expect(out!.status_detail).toBe('suspended')
  })

  it('clears the detail (to null) when a suspended match resumes', () => {
    const out = fixtureToMatchUpdate(
      makeFixture('2H', { elapsed: 50 }),
      makeCurrent({ status: 'live', status_detail: 'suspended', live_period: '2H', live_minute: 50 }),
      opts
    )
    expect(out).not.toBeNull()
    expect(Object.prototype.hasOwnProperty.call(out!, 'status_detail')).toBe(true)
    expect(out!.status_detail).toBeNull()
  })

  it('CANC maps coarse cancelled + detail cancelled', () => {
    const out = fixtureToMatchUpdate(makeFixture('CANC'), makeCurrent(), opts)
    expect(out!.status).toBe('cancelled')
    expect(out!.status_detail).toBe('cancelled')
  })

  it('a normal completion sets no detail', () => {
    const out = fixtureToMatchUpdate(
      makeFixture('FT', { goalsHome: 2, goalsAway: 1 }),
      makeCurrent(),
      opts
    )
    expect(out!.status).toBe('completed')
    expect(out!.is_completed).toBe(true)
    expect(out!.completed_at).toBe(NOW)
    expect(out!.status_detail).toBeUndefined() // null -> null, not written
  })

  it('is a no-op (null) for an unchanged not-started fixture', () => {
    const out = fixtureToMatchUpdate(makeFixture('NS'), makeCurrent(), opts)
    expect(out).toBeNull()
  })
})

describe('fixtureToMatchUpdate — live_added (stoppage time)', () => {
  it('captures end-of-first-half stoppage (elapsed holds at 45, extra counts up)', () => {
    const out = fixtureToMatchUpdate(
      makeFixture('1H', { elapsed: 45, extra: 2 }),
      makeCurrent({ status: 'live', live_period: '1H', live_minute: 45, live_added: null }),
      opts
    )
    expect(out).not.toBeNull()
    expect(out!.live_added).toBe(2)
  })

  it('clears live_added back to null once the stoppage window ends', () => {
    const out = fixtureToMatchUpdate(
      makeFixture('2H', { elapsed: 46, extra: null }),
      makeCurrent({ status: 'live', live_period: '2H', live_minute: 46, live_added: 3 }),
      opts
    )
    expect(out).not.toBeNull()
    expect(Object.prototype.hasOwnProperty.call(out!, 'live_added')).toBe(true)
    expect(out!.live_added).toBeNull()
  })

  it('does not write live_added when the added time is unchanged', () => {
    const out = fixtureToMatchUpdate(
      makeFixture('2H', { elapsed: 90, extra: 4 }),
      makeCurrent({ status: 'live', live_period: '2H', live_minute: 90, live_added: 4 }),
      opts
    )
    // Every synced field matches current → whole update is a no-op.
    expect(out).toBeNull()
  })
})
