import { describe, it, expect } from 'vitest'
import type { LeagueCardFacts } from '@/lib/league/poolCards'
import { buildNeedsYou, type NeedsYouPool } from '../needsYou'

const NOW = Date.parse('2026-09-28T09:00:00Z')
const LATER = '2026-10-03T10:30:00Z'
const SOONER = '2026-10-02T18:00:00Z'

const facts = (over: Partial<LeagueCardFacts> = {}): LeagueCardFacts => ({
  openMatchweekNumber: 7,
  inPlayMatchweekNumber: null,
  matchweekCount: 38,
  deadlineAt: LATER,
  totalPicks: 10,
  completedPicks: 0,
  madePicks: 3,
  hasSubmitted: false,
  showdown: null,
  lms: null,
  table: null,
  ...over,
})

const pool = (poolId: string, mode: string): NeedsYouPool => ({
  poolId,
  poolName: `Pool ${poolId}`,
  mode,
  entryId: `e-${poolId}`,
})

describe('buildNeedsYou', () => {
  it("asks for an unfinished Pick'em week, with progress", () => {
    const [n] = buildNeedsYou([pool('a', 'pickem')], new Map([['a', facts()]]), NOW)
    expect(n.title).toBe('Pick Matchweek 7')
    expect([n.made, n.total]).toEqual([3, 10])
    expect(n.cta).toBe('Finish')
    expect(n.link).toEqual({
      pathname: '/pool/[id]/pickem/[entryId]',
      params: { id: 'a', entryId: 'e-a', mw: '7' },
    })
  })

  it('says "Pick now" when nothing is picked yet', () => {
    const [n] = buildNeedsYou([pool('a', 'showdown')], new Map([['a', facts({ madePicks: 0 })]]), NOW)
    expect(n.cta).toBe('Pick now')
    expect(n.subtitle).toBe('Pool a · Showdown')
  })

  it('drops a card the moment the week is done', () => {
    expect(buildNeedsYou([pool('a', 'pickem')], new Map([['a', facts({ hasSubmitted: true })]]), NOW)).toEqual([])
  })

  it('never shows a deadline that has passed', () => {
    const out = buildNeedsYou([pool('a', 'pickem')], new Map([['a', facts({ deadlineAt: '2026-09-27T10:00:00Z' })]]), NOW)
    expect(out).toEqual([])
  })

  it('asks an LMS member still standing for a club', () => {
    const lms = {
      roundsWon: 0,
      roundNumber: 2,
      isEliminated: false,
      eliminatedMatchweek: null,
      survivorsLeft: 9,
      roundEntrants: 14,
      clubsUsed: 5,
      clubPool: 20,
      inPlayClubName: null,
      inPlayMatchweek: null,
      inPlayClubCrest: null,
      openClubName: null,
      openMatchweek: 7,
      openClubCrest: null,
    }
    const [n] = buildNeedsYou(
      [pool('a', 'last_man_standing')],
      new Map([['a', facts({ totalPicks: 1, madePicks: 0, lms })]]),
      NOW,
    )
    expect(n.kind).toBe('lms')
    expect(n.title).toBe('Choose your Matchweek 7 team')
    expect(n.subtitle).toBe('Pool a · 9 still in')
  })

  it('asks for a table order before the lock', () => {
    const [n] = buildNeedsYou(
      [pool('a', 'table')],
      new Map([['a', facts({ openMatchweekNumber: null, totalPicks: 1, madePicks: 0 })]]),
      NOW,
    )
    expect(n.kind).toBe('table')
    expect(n.link.pathname).toBe('/pool/[id]/table/[entryId]')
  })

  it('orders by the soonest deadline', () => {
    const out = buildNeedsYou(
      [pool('a', 'pickem'), pool('b', 'pickem')],
      new Map([
        ['a', facts({ deadlineAt: LATER })],
        ['b', facts({ deadlineAt: SOONER })],
      ]),
      NOW,
    )
    expect(out.map((n) => n.pool_id)).toEqual(['b', 'a'])
  })

  it('skips a pool with no entry or no facts', () => {
    const out = buildNeedsYou(
      [{ ...pool('a', 'pickem'), entryId: null }, pool('b', 'pickem')],
      new Map([['a', facts()]]),
      NOW,
    )
    expect(out).toEqual([])
  })
})
