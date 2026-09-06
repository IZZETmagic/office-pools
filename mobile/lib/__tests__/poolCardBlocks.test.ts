import { describe, it, expect } from 'vitest'

import { poolCardBlocks, type BlockInput } from '../poolCardBlocks'

const base: BlockInput = {
  predictionMode: 'league_pickem',
  leagueMode: null,
  currentRank: 3,
  totalEntries: 10,
  totalPoints: 1200,
  hasScoringStarted: true,
  level: null,
  formResults: ['exact', 'winner', 'miss'],
  league: null,
}

const league = (over: Partial<NonNullable<BlockInput['league']>>) =>
  ({
    leagueMode: null,
    openMatchweek: 3,
    matchweekCount: 38,
    showdown: null,
    lms: null,
    table: null,
    ...over,
  }) as NonNullable<BlockInput['league']>

const labels = (p: BlockInput) =>
  poolCardBlocks(p).map((b) => (b.kind === 'rank' ? 'Rank' : b.label))

describe('poolCardBlocks — each mode shows what its engine writes', () => {
  it('World Cup keeps the five it always had', () => {
    // ⚠ Reached whenever the server sent no league facts, which includes an API
    // older than the field. Falling back to the shape that has always worked
    // beats blanking a card.
    expect(labels({ ...base, league: null, level: { number: 3, name: 'Rookie' } }))
      .toEqual(['Rank', 'Points', 'Rookie', 'Form', 'Picks'])
  })

  it('a World Cup pool with no level drops that block rather than showing Lv.1', () => {
    expect(labels({ ...base, league: null, level: null }))
      .toEqual(['Rank', 'Points', 'Form', 'Picks'])
  })

  it("league Pick'em swaps Level for the matchweek", () => {
    // Level is the one World Cup block that goes: `entry_xp_state` is never
    // written for a league, so it would be a permanent "Lv.1".
    expect(labels({ ...base, leagueMode: 'pickem', league: league({ leagueMode: 'pickem' }) }))
      .toEqual(['Rank', 'Points', 'Matchweek', 'Form', 'Picks'])
  })

  it('the matchweek denominator is READ, never assumed to be 38', () => {
    // Twenty clubs play 38 rounds; the Bundesliga and Ligue 1 are eighteen and 34.
    const b = poolCardBlocks({
      ...base, leagueMode: 'pickem',
      league: league({ leagueMode: 'pickem', openMatchweek: 5, matchweekCount: 34 }),
    })[2]
    expect(b).toMatchObject({ value: '5', sub: 'of 34' })
  })

  it('Showdown leads on DUEL points, not accuracy', () => {
    // ⚠ The mode is a layer over the weekly accuracy number, so accuracy is not
    // what decides anything. `duel_points` leads `league_finalize_ranks`, so
    // the headline block and the Rank beside it agree by construction.
    const p: BlockInput = {
      ...base, leagueMode: 'showdown',
      league: league({
        leagueMode: 'showdown',
        showdown: { duelPoints: 1500, won: 3, tied: 1, lost: 2, recentDuels: ['won', 'lost', 'tied'] },
      }),
    }
    expect(labels(p)).toEqual(['Rank', 'Duel pts', 'Record', 'Form', 'Picks'])
    expect(poolCardBlocks(p)[1]).toMatchObject({ value: '1,500' })
    expect(poolCardBlocks(p)[2]).toMatchObject({ value: '3-1-2', sub: 'W-T-L' })
    // ⚠ THE DUEL PALETTE, not the accuracy one. Gold is the top accuracy tier
    // and would otherwise land on a draw.
    expect(poolCardBlocks(p)[3]).toMatchObject({ kind: 'dots', palette: 'duel' })
  })

  it('Table drops Form, because the mode has no weekly decision', () => {
    // Five dots were grey from August to May.
    const p: BlockInput = {
      ...base, leagueMode: 'table',
      league: league({
        leagueMode: 'table',
        table: { spotOn: 4, clubCount: 20, averageOff: 2.4, hasTable: true, isFinal: false },
      }),
    }
    expect(labels(p)).toEqual(['Rank', 'Points', 'Spot on', 'Avg off', 'Picks'])
    expect(poolCardBlocks(p).some((b) => b.kind === 'dots')).toBe(false)
    // Live all season, but `league_standings` is upserted current state, so a
    // June correction could restate an award. Said out loud.
    expect(poolCardBlocks(p)[1]).toMatchObject({ sub: 'provisional' })
    expect(poolCardBlocks({ ...p, league: league({ leagueMode: 'table',
      table: { spotOn: 4, clubCount: 20, averageOff: 2.4, hasTable: true, isFinal: true } }) })[1])
      .toMatchObject({ sub: 'final' })
  })

  it('an unplayed table is not a table full of misses', () => {
    // Every club's actual position is NULL until it has a standings row, so a
    // zero in August would judge a table nobody could yet be right about.
    const p: BlockInput = {
      ...base, leagueMode: 'table',
      league: league({ leagueMode: 'table',
        table: { spotOn: 0, clubCount: 20, averageOff: null, hasTable: true, isFinal: false } }),
    }
    expect(poolCardBlocks(p)[2]).toMatchObject({ value: '—', sub: 'not started', muted: true })
    expect(poolCardBlocks(p)[3]).toMatchObject({ value: '—', muted: true })
  })

  it('⚠ Last Man Standing shows NO rank and NO points', () => {
    // The stored rank is entry_id order — every rung of the cascade is zero in
    // this mode and the "picked first" rung is infinity, because LMS picks live
    // in league_lms_picks. Survival is binary too, so there is no rank to show
    // even if the number were right.
    const p: BlockInput = {
      ...base, leagueMode: 'last_man_standing', currentRank: 4, totalPoints: 0,
      league: league({
        leagueMode: 'last_man_standing',
        lms: { roundsWon: 2, roundNumber: 3, clubsUsed: 7, clubPool: 20,
               survivorsLeft: 4, roundEntrants: 10, isEliminated: false },
      }),
    }
    expect(labels(p)).toEqual(['Rounds', 'Clubs', 'Still in', 'Picks'])
    // `currentRank: 4` is on the fixture ON PURPOSE — the block is gone because
    // the mode says so, not because the data happened to be absent.
    expect(poolCardBlocks(p).some((b) => b.kind === 'rank')).toBe(false)
    expect(poolCardBlocks(p)[0]).toMatchObject({ value: '2', sub: 'in 3' })
    expect(poolCardBlocks(p)[1]).toMatchObject({ value: '7', sub: 'of 20' })
    expect(poolCardBlocks(p)[2]).toMatchObject({ value: '4', sub: 'of 10' })
  })

  it('an eliminated member still sees the count, dimmed', () => {
    // Still true, still worth watching, but it has stopped being about them.
    const p: BlockInput = {
      ...base, leagueMode: 'last_man_standing',
      league: league({ leagueMode: 'last_man_standing',
        lms: { roundsWon: 0, roundNumber: 1, clubsUsed: 3, clubPool: 20,
               survivorsLeft: 2, roundEntrants: 10, isEliminated: true } }),
    }
    expect(poolCardBlocks(p)[2]).toMatchObject({ value: '2', muted: true })
  })

  it('a missing club_count drops the fraction rather than printing "of 0"', () => {
    const p: BlockInput = {
      ...base, leagueMode: 'last_man_standing',
      league: league({ leagueMode: 'last_man_standing',
        lms: { roundsWon: 0, roundNumber: 1, clubsUsed: 5, clubPool: 0,
               survivorsLeft: 9, roundEntrants: 10, isEliminated: false } }),
    }
    expect(poolCardBlocks(p)[1]).toMatchObject({ value: '5', sub: 'used' })
  })

  it('every mode ends on the Picks ring, and only LMS omits the rank', () => {
    // Stated positively so a future mode cannot quietly join the exception.
    const modes: Array<[string, BlockInput]> = [
      ['worldcup', { ...base, league: null }],
      ['pickem', { ...base, league: league({ leagueMode: 'pickem' }) }],
      ['showdown', { ...base, league: league({ leagueMode: 'showdown',
        showdown: { duelPoints: 0, won: 0, tied: 0, lost: 0, recentDuels: [] } }) }],
      ['table', { ...base, league: league({ leagueMode: 'table',
        table: { spotOn: 0, clubCount: 20, averageOff: null, hasTable: false, isFinal: false } }) }],
      ['lms', { ...base, league: league({ leagueMode: 'last_man_standing',
        lms: { roundsWon: 0, roundNumber: 1, clubsUsed: 0, clubPool: 20,
               survivorsLeft: 10, roundEntrants: 10, isEliminated: false } }) }],
    ]
    for (const [name, p] of modes) {
      const bs = poolCardBlocks(p)
      expect(bs[bs.length - 1], name).toMatchObject({ kind: 'ring' })
      expect(bs.length, name).toBeLessThanOrEqual(5)
    }
    const withoutRank = modes
      .filter(([, p]) => !poolCardBlocks(p).some((b) => b.kind === 'rank'))
      .map(([n]) => n)
    expect(withoutRank).toEqual(['lms'])
  })

  it('the rank block hides itself before anyone has scored', () => {
    const p = { ...base, hasScoringStarted: false, league: null, level: null }
    expect(poolCardBlocks(p)[0]).toMatchObject({ kind: 'rank', show: false })
  })
})
