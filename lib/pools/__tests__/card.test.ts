// =============================================================
// What a pool card says
// =============================================================
// The card was three hand-kept copies of the same markup and had drifted in
// five places. It is one component now, and the sentences on it are decided in
// lib/pools/card.ts so they can be pinned here rather than in a DOM.
//
// Two things these are really guarding:
//
//   · the pill describes the STATE OF THE PICKS, never a submit. Picks save as
//     they are made and the deadline is the only switch, so "Submitted" was
//     describing an act that no longer happens.
//   · the deadline chip's tone and fallback are functions of a DURATION, and
//     only `format` reads local calendar fields. That split is the timezone
//     fix — get it wrong and every card outside UTC prints the server's hour.

import { describe, it, expect } from 'vitest'
import {
  poolCardAction,
  deadlineChip,
  byAttention,
  kpiTiles,
  duelDotClass,
  type PoolCardPool,
} from '@/lib/pools/card'
import type { DuelOutcome } from '@/lib/league/poolCards'

const NOW = Date.parse('2026-08-29T12:00:00Z')
const inHours = (h: number) => new Date(NOW + h * 3600_000).toISOString()

function pool(over: Partial<PoolCardPool> = {}): PoolCardPool {
  return {
    pool_id: 'p1',
    pool_name: 'The Office',
    pool_code: 'ABC123',
    status: 'open',
    prediction_deadline: inHours(48),
    prediction_mode: 'league_pickem',
    league_mode: 'pickem',
    role: 'member',
    total_points: 0,
    current_rank: null,
    highest_level: null,
    has_submitted_predictions: false,
    memberCount: 8,
    members: [
      { user_id: 'u1', full_name: 'Ryan Sousa', username: 'ryan' },
      { user_id: 'u2', full_name: null, username: 'odiebug' },
      { user_id: 'u3', full_name: 'Ali Jones', username: 'ali' },
    ],
    totalEntries: 8,
    hasScoringStarted: false,
    totalMatches: 10,
    predictedMatches: 0,
    form: [],
    ...over,
  }
}

describe('poolCardAction — what is left to do', () => {
  it('does NOT name a matchweek — the tile owns the only number on the card', () => {
    // ⚠ Regression guard, from a real La Liga card. The pill said "Pick
    // Matchweek 6" beside a tile reading "Matchweek 3 · in play" and read as a
    // bug. Both were right: MW6 holds one fixture on 3 Sep and nine on 16 Sep,
    // so it locks early and genuinely is the open matchweek — SQL's
    // `league_open_matchweek` returns it and migration 058 rejects picks aimed
    // anywhere else. The pill therefore cannot be "corrected" to 3; it drops
    // the number. See openingLabel and lib/league/earlyKickoff.ts.
    const a = poolCardAction(pool({ openMatchweekNumber: 6, inPlayMatchweekNumber: 3 }), NOW)
    expect(a.label).toBe('Make your picks')
    expect(a.label).not.toMatch(/\d/)
    expect(a.isButton).toBe(true)
  })

  it('shows progress part-way through — the state the old pill could not', () => {
    // Three of ten used to read exactly like nought of ten: both said "Predict".
    expect(poolCardAction(pool({ predictedMatches: 3 }), NOW).label).toBe('3 of 10 picked')
  })

  it('says all picked, never submitted', () => {
    const a = poolCardAction(pool({ predictedMatches: 10 }), NOW)
    expect(a.label).toBe('All picked')
    expect(a.icon).toBe('check')
    expect(a.isButton).toBe(false)
  })

  it('names a progressive pool\'s round in preference to a matchweek', () => {
    const a = poolCardAction(
      pool({ prediction_mode: 'progressive', league_mode: null, currentRoundLabel: 'Round of 16' }),
      NOW,
    )
    expect(a.label).toBe('Pick Round of 16')
  })

  describe('the one-decision modes', () => {
    // Table and LMS have totalMatches === 1, so "All 1 picked" and "0 of 1"
    // would both be nonsense. See SINGLE_DECISION_MODES.
    it('asks Table mode for a table, and settles as "Table set"', () => {
      const p = pool({ league_mode: 'table', totalMatches: 1 })
      expect(poolCardAction(p, NOW).label).toBe('Predict the table')
      expect(poolCardAction({ ...p, predictedMatches: 1 }, NOW).label).toBe('Table set')
    })

    it('asks Last Man Standing for a club', () => {
      const p = pool({ league_mode: 'last_man_standing', totalMatches: 1 })
      expect(poolCardAction(p, NOW).label).toBe('Pick your club')
      expect(poolCardAction({ ...p, predictedMatches: 1 }, NOW).label).toBe('Club picked')
    })

    it('never offers a partial state on a single decision', () => {
      // Guards the branch order: `single` is checked before the "N of M" one.
      const a = poolCardAction(pool({ league_mode: 'table', totalMatches: 1, predictedMatches: 0 }), NOW)
      expect(a.label).not.toMatch(/of/)
    })
  })

  describe('branch order', () => {
    it('a completed pool shows results whatever the picks say', () => {
      expect(poolCardAction(pool({ status: 'completed', predictedMatches: 0 }), NOW).label).toBe('Results')
    })

    it('offers no button once the deadline has passed', () => {
      // An amber "Pick Matchweek 3" here would be a button that cannot do what
      // it says — the chip beside it already reads "Closed".
      const a = poolCardAction(pool({ prediction_deadline: inHours(-1), predictedMatches: 4 }), NOW)
      expect(a.label).toBe('Not picked')
      expect(a.isButton).toBe(false)
    })

    it('still settles a locked pool that was fully picked', () => {
      const a = poolCardAction(pool({ prediction_deadline: inHours(-1), predictedMatches: 10 }), NOW)
      expect(a.label).toBe('All picked')
    })
  })
})

describe('deadlineChip — the clock', () => {
  it('is duration-only in the fallback, so the server and client agree', () => {
    // ⚠ The whole timezone fix. `fallback` must not contain a wall-clock hour:
    // the server formats in UTC and would hand React text to reconcile.
    const c = deadlineChip(inHours(48), NOW)
    expect(c.fallback).toBe('2d left')
    expect(c.fallback).not.toMatch(/AM|PM/)
  })

  it('keeps the hour in the local-time format', () => {
    // The dashboard's old formatter printed dates only — "Aug 30, 2026 (1 day)"
    // for a lock at 19:00 that evening.
    const c = deadlineChip(inHours(48), NOW)
    expect(c.format(new Date('2026-08-31T19:00:00'))).toMatch(/7:00 PM/)
  })

  it('names the weekday inside a week and a date beyond one', () => {
    expect(deadlineChip(inHours(72), NOW).format(new Date('2026-09-01T19:00:00'))).toMatch(/^Locks \w{3} 7:00 PM$/)
    expect(deadlineChip(inHours(24 * 30), NOW).format(new Date('2026-09-28T19:00:00'))).toBe('Sep 28, 7:00 PM')
  })

  it('counts down inside the last hour', () => {
    expect(deadlineChip(new Date(NOW + 42 * 60_000).toISOString(), NOW).fallback).toBe('Locks in 42 min')
  })

  it('closes on the deadline, not after a grace period', () => {
    expect(deadlineChip(inHours(-0.001), NOW).fallback).toBe('Closed')
    expect(deadlineChip(new Date(NOW).toISOString(), NOW).fallback).toBe('Closed')
  })

  it('hides itself when there is no deadline', () => {
    expect(deadlineChip(null, NOW).show).toBe(false)
  })

  it('reddens inside a day and greys beyond a week', () => {
    expect(deadlineChip(inHours(12), NOW).className).toContain('danger')
    expect(deadlineChip(inHours(72), NOW).className).toContain('warning')
    expect(deadlineChip(inHours(24 * 30), NOW).className).toContain('muted')
  })
})

describe('byAttention — the dashboard order', () => {
  const unread = new Map<string, number>()

  it('puts a half-finished pool above an untouched one', () => {
    // The half-done pool is the one you lose by forgetting.
    const started = pool({ pool_id: 'started', predictedMatches: 3 })
    const untouched = pool({ pool_id: 'untouched', predictedMatches: 0 })
    expect([untouched, started].sort(byAttention(unread))[0].pool_id).toBe('started')
  })

  it('sinks a finished pool below both', () => {
    const done = pool({ pool_id: 'done', predictedMatches: 10 })
    const untouched = pool({ pool_id: 'untouched', predictedMatches: 0 })
    expect([done, untouched].sort(byAttention(unread))[0].pool_id).toBe('untouched')
  })

  it('floats unread banter over pick progress', () => {
    const chatty = pool({ pool_id: 'chatty', predictedMatches: 10 })
    const quiet = pool({ pool_id: 'quiet', predictedMatches: 0 })
    const counts = new Map([['chatty', 3]])
    expect([quiet, chatty].sort(byAttention(counts))[0].pool_id).toBe('chatty')
  })

  it('puts a branded pool first regardless — it is somebody\'s front door', () => {
    const branded = pool({
      pool_id: 'branded',
      predictedMatches: 10,
      brand_name: 'Acme',
      brand_emoji: '🏆',
      brand_color: '#123456',
    })
    const urgent = pool({ pool_id: 'urgent', predictedMatches: 1 })
    expect([urgent, branded].sort(byAttention(unread))[0].pool_id).toBe('branded')
  })

  it('breaks a tie on whichever locks soonest', () => {
    const soon = pool({ pool_id: 'soon', prediction_deadline: inHours(2) })
    const later = pool({ pool_id: 'later', prediction_deadline: inHours(200) })
    expect([later, soon].sort(byAttention(unread))[0].pool_id).toBe('soon')
  })
})

describe('kpiTiles — the mode-dependent slot', () => {
  const showdown = {
    duelPoints: 13, won: 4, tied: 1, lost: 2, byes: 0,
    opponentName: 'Marcus', isBye: false, duelMatchweek: 3,
    recentDuels: ['won', 'tied', 'lost', 'won', 'won'] as DuelOutcome[],
  }
  const sdPool = (over = {}) =>
    pool({ league_mode: 'showdown', hasScoringStarted: true, current_rank: 3, totalEntries: 10,
           total_points: 300, showdown: { ...showdown, ...over } })

  it('leads on duel points, not accuracy points', () => {
    // ⚠ The pool has 300 accuracy points and 13 duel points. Showing 300 would
    // put a number in tile 1 that has nothing to do with the rank in tile 2 —
    // `league_finalize_ranks` leads its cascade on duel_points for this mode.
    const [first] = kpiTiles(sdPool())
    expect(first).toMatchObject({ label: 'Duel pts', value: '13' })
    expect(kpiTiles(sdPool()).map((t) => t.label)).toEqual(['Duel pts', 'Rank', 'This week', 'Form'])
  })

  it('carries the record as the sub, so no tile is spent on 3W+T', () => {
    expect(kpiTiles(sdPool())[0]).toMatchObject({ sub: '4W 1T 2L' })
  })

  it('names the opponent and the matchweek that duel belongs to', () => {
    expect(kpiTiles(sdPool())[2]).toMatchObject({ value: 'Marcus', sub: 'MW 3', tone: 'ink' })
  })

  it('says Bye rather than showing a dash', () => {
    // With an odd number of members somebody sits out every matchweek. It is
    // not an error and must not read as one — migration 083.
    const tiles = kpiTiles(sdPool({ isBye: true, opponentName: null }))
    expect(tiles[2]).toMatchObject({ value: 'Bye', sub: 'sits out', tone: 'muted' })
  })

  it('paints duel dots on their own palette, not the accuracy tiers', () => {
    // A duel is won/tied/lost. Reusing gold-green-blue would claim the two
    // strips mean the same thing.
    const dots = kpiTiles(sdPool()).find((t) => t.kind === 'dots')
    expect(dots).toMatchObject({ palette: 'duel', dots: ['won', 'tied', 'lost', 'won', 'won'] })
    expect(duelDotClass('won')).toContain('success')
    expect(duelDotClass('lost')).toContain('danger')
    expect(duelDotClass('bye')).toContain('opacity')
  })

  it('falls back to the World Cup shape for the modes still owed a branch', () => {
    expect(kpiTiles(pool({ league_mode: 'pickem', openMatchweekNumber: 3 })).map((t) => t.label))
      .toEqual(['Points', 'Rank', 'Matchweek', 'Form'])
    expect(kpiTiles(pool({ prediction_mode: 'full_tournament', league_mode: null })).map((t) => t.label))
      .toEqual(['Points', 'Rank', 'Level', 'Form'])
  })

  it('degrades to the default shape when the showdown facts failed to read', () => {
    // Every read in readLeagueCardFacts degrades rather than throws, so a
    // showdown pool can legitimately arrive with null facts.
    expect(kpiTiles(pool({ league_mode: 'showdown', showdown: null }))[0].label).toBe('Points')
  })
})

describe('kpiTiles — Last Man Standing', () => {
  const lms = {
    roundsWon: 2, roundNumber: 3, isEliminated: false, eliminatedMatchweek: null,
    survivorsLeft: 4, roundEntrants: 10,
    inPlayClubName: 'Arsenal', inPlayMatchweek: 2,
    openClubName: 'Hull City', openMatchweek: 3,
  }
  const lmsPool = (over = {}) =>
    pool({ league_mode: 'last_man_standing', totalMatches: 1, hasScoringStarted: true,
           current_rank: 3, totalEntries: 10, total_points: 900, lms: { ...lms, ...over } })

  it('leads on rounds won, not accuracy points', () => {
    // ⚠ 900 accuracy points, 2 rounds won. `league_finalize_ranks` sorts on
    // rounds_won ahead of everything — showing 900 would put a number in tile 1
    // unrelated to the rank in tile 2.
    expect(kpiTiles(lmsPool()).map((t) => t.label)).toEqual(['Rounds won', 'Rank', 'This week', 'Still in'])
    expect(kpiTiles(lmsPool())[0]).toMatchObject({ value: '2', sub: 'Round 3' })
  })

  it('names the club being PLAYED, not the one lined up for next week', () => {
    // ⚠ THE BUG THIS REPLACES. Reproduced against production 30 Aug 2026: MW2 in
    // play with Arsenal picked, MW3 open with Hull City picked, and the tile —
    // labelled "This week" — read "Hull City", a club whose game had not kicked
    // off. The two weeks are the same from Monday night to Friday evening and
    // different for the three days the football is on, which are the days
    // somebody looks at the card.
    expect(kpiTiles(lmsPool())[2]).toMatchObject({ value: 'Arsenal', sub: 'MW 2 in play', tone: 'ink' })
  })

  it('falls back to the open week between rounds', () => {
    // Tuesday to Friday there is no football. The next decision is the honest
    // answer to "this week", and the matchweek is named so it cannot be
    // mistaken for one in progress.
    expect(kpiTiles(lmsPool({ inPlayClubName: null, inPlayMatchweek: null }))[2])
      .toMatchObject({ value: 'Hull City', sub: 'MW 3', tone: 'ink' })
  })

  it('falls back rather than accusing you when the round began after the week in play', () => {
    // A round can open on the matchweek AFTER the one still being played, so a
    // missing in-play pick is not always a missed pick. The tile shows what they
    // HAVE decided instead of an alarm they did not earn.
    expect(kpiTiles(lmsPool({ inPlayClubName: null }))[2])
      .toMatchObject({ value: 'Hull City', sub: 'MW 3', tone: 'ink' })
  })

  it('asks for a club when neither week is picked', () => {
    expect(kpiTiles(lmsPool({ inPlayClubName: null, openClubName: null }))[2])
      .toMatchObject({ value: 'Pick a club', tone: 'muted' })
  })

  it('says Out, and names the matchweek whose RESULT knocked you out', () => {
    // Not the one they failed to pick in — see the eliminated_matchweek comment.
    // And it must not read as an error: being knocked out is the mode working.
    const tiles = kpiTiles(lmsPool({ isEliminated: true, eliminatedMatchweek: 6, inPlayClubName: null, openClubName: null }))
    expect(tiles[2]).toMatchObject({ value: 'Out', sub: 'went MW 6', tone: 'muted' })
  })

  it('keeps showing the survivor count once you are out, but dims it', () => {
    // Still true, still worth watching, no longer about you.
    expect(kpiTiles(lmsPool())[3]).toMatchObject({ value: '4', sub: 'of 10', tone: 'ink' })
    expect(kpiTiles(lmsPool({ isEliminated: true }))[3]).toMatchObject({ value: '4', tone: 'muted' })
  })

  it('has no dot strip — the fourth tile is a number', () => {
    // The strip card branches on this, so it is worth pinning.
    expect(kpiTiles(lmsPool()).some((t) => t.kind === 'dots')).toBe(false)
  })

  it('degrades to the default shape when the facts failed to read', () => {
    expect(kpiTiles(pool({ league_mode: 'last_man_standing', lms: null }))[0].label).toBe('Points')
  })
})

describe('kpiTiles — Predict the Table', () => {
  const table = { spotOn: 3, clubCount: 20, averageOff: 2.4, hasTable: true, isFinal: false }
  const tablePool = (over = {}) =>
    pool({ league_mode: 'table', totalMatches: 1, hasScoringStarted: true,
           current_rank: 2, totalEntries: 10, total_points: 3460, table: { ...table, ...over } })

  it('has no weekly tile — the mode has one decision, all season', () => {
    expect(kpiTiles(tablePool()).map((t) => t.label)).toEqual(['Table pts', 'Rank', 'Spot on', 'Avg off'])
    expect(kpiTiles(tablePool()).some((t) => t.kind === 'dots')).toBe(false)
  })

  it('says the score is provisional until the season-end snapshot exists', () => {
    // ⚠ league_standings is upserted CURRENT STATE — a June feed correction
    // could restate an award. league_standings_final is what gets paid from,
    // and this sub is that distinction said out loud. Migration 080.
    expect(kpiTiles(tablePool())[0]).toMatchObject({ value: '3,460', sub: 'provisional' })
    expect(kpiTiles(tablePool({ isFinal: true }))[0]).toMatchObject({ sub: 'final' })
  })

  it('counts clubs in exactly the right place', () => {
    expect(kpiTiles(tablePool())[2]).toMatchObject({ value: '3', sub: 'of 20', tone: 'ink' })
    expect(kpiTiles(tablePool())[3]).toMatchObject({ value: '2.4', sub: 'places' })
  })

  it('does not call an unplayed season a table full of misses', () => {
    // ⚠ Every club's actual position is NULL before a ball is kicked. Zero here
    // in August would judge a table nobody has had a chance to be right about.
    const tiles = kpiTiles(tablePool({ spotOn: 0, averageOff: null }))
    expect(tiles[2]).toMatchObject({ value: '—', sub: 'not started', tone: 'muted' })
    expect(tiles[3]).toMatchObject({ value: '—', tone: 'muted' })
  })

  it('distinguishes "not started" from "you never set a table"', () => {
    expect(kpiTiles(tablePool({ hasTable: false, averageOff: null }))[2])
      .toMatchObject({ value: '—', sub: 'no table yet' })
  })

  it('degrades to the default shape when the facts failed to read', () => {
    expect(kpiTiles(pool({ league_mode: 'table', table: null }))[0].label).toBe('Points')
  })
})

describe('kpiTiles — every mode now has a branch', () => {
  it('leaves only Pick’em and the World Cup modes on the default shape', () => {
    // The blank-tracking assertion. Pick'em genuinely wants Points/Rank/
    // Matchweek/Form — it is not a gap.
    expect(kpiTiles(pool({ league_mode: 'pickem', openMatchweekNumber: 3 })).map((t) => t.label))
      .toEqual(['Points', 'Rank', 'Matchweek', 'Form'])
    for (const mode of ['full_tournament', 'progressive', 'bracket_picker'] as const) {
      expect(kpiTiles(pool({ prediction_mode: mode, league_mode: null })).map((t) => t.label))
        .toEqual(['Points', 'Rank', 'Level', 'Form'])
    }
  })

  it('always returns exactly four tiles, whatever the mode', () => {
    // The strip card slices three stats plus a fourth; a mode returning five
    // would silently drop one.
    const modes: Array<Partial<PoolCardPool>> = [
      { league_mode: 'pickem' },
      { league_mode: 'showdown', showdown: { duelPoints: 0, won: 0, tied: 0, lost: 0, byes: 0, opponentName: null, isBye: false, duelMatchweek: null, recentDuels: [] } },
      { league_mode: 'last_man_standing', lms: { roundsWon: 0, roundNumber: 1, isEliminated: false, eliminatedMatchweek: null, survivorsLeft: 5, roundEntrants: 5, inPlayClubName: null, inPlayMatchweek: null, openClubName: null, openMatchweek: 1 } },
      { league_mode: 'table', table: { spotOn: 0, clubCount: 20, averageOff: null, hasTable: true, isFinal: false } },
      { prediction_mode: 'full_tournament', league_mode: null },
    ]
    for (const over of modes) expect(kpiTiles(pool(over))).toHaveLength(4)
  })
})

describe('kpiTiles — tile order is a contract, because the dashboard drops the last one', () => {
  // ⚠ The dashboard card is 357px and shows only THREE of these (SHAPE in
  // components/pools/PoolCard.tsx). It takes the first three, so the ORDER here
  // is what decides which fact a member loses on that surface. Tile 1 must be
  // the mode's own score and tile 2 the rank — those are the two that have to
  // survive on every surface — which makes tile 4 the droppable one by
  // construction.
  const cases: Array<[string, Partial<PoolCardPool>, string]> = [
    ['pickem', { league_mode: 'pickem', openMatchweekNumber: 3 }, 'Points'],
    ['showdown', { league_mode: 'showdown', showdown: { duelPoints: 4, won: 1, tied: 1, lost: 0, byes: 0, opponentName: 'Ana', isBye: false, duelMatchweek: 3, recentDuels: [] } }, 'Duel pts'],
    ['last_man_standing', { league_mode: 'last_man_standing', lms: { roundsWon: 1, roundNumber: 2, isEliminated: false, eliminatedMatchweek: null, survivorsLeft: 3, roundEntrants: 8, inPlayClubName: 'Arsenal', inPlayMatchweek: 4, openClubName: null, openMatchweek: 5 } }, 'Rounds won'],
    ['table', { league_mode: 'table', table: { spotOn: 4, clubCount: 20, averageOff: 1.2, hasTable: true, isFinal: false } }, 'Table pts'],
    ['full_tournament', { prediction_mode: 'full_tournament', league_mode: null }, 'Points'],
  ]

  for (const [name, over, expectedFirst] of cases) {
    it(`${name}: score first, rank second — so the dropped tile is never either`, () => {
      const tiles = kpiTiles(pool(over))
      expect(tiles[0].label).toBe(expectedFirst)
      expect(tiles[1].label).toBe('Rank')
      // What the dashboard actually renders.
      expect(tiles.slice(0, 3).map((t) => t.label)).toHaveLength(3)
      expect(tiles.slice(0, 3).map((t) => t.label)).toContain('Rank')
    })
  }
})
