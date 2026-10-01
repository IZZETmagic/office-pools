import { describe, it, expect } from 'vitest'
import {
  buildMatchweekStories,
  ordinal,
  rankPhrase,
  type StoryInput,
  type StoryPool,
} from '../matchweekStories'

const pool = (over: Partial<StoryPool> = {}): StoryPool => ({
  poolId: 'p1',
  poolName: 'Office League',
  seasonId: 's1',
  mode: 'pickem',
  entries: [{ entryId: 'e1', entryName: 'Ryan' }],
  entrantCount: 18,
  ...over,
})

const base = (over: Partial<StoryInput> = {}): StoryInput => ({
  pools: [pool()],
  weeks: [{ seasonId: 's1', matchweekNumber: 6, settledAt: '2026-09-28T09:00:00Z' }],
  scores: [],
  fixtures: [],
  duels: [],
  lmsPicks: [],
  lmsSurvivors: [],
  ranks: [],
  nameByEntry: new Map(),
  ...over,
})

const score = (fixture: string, type: string, points: number, mw = 6, entry = 'e1') => ({
  entry_id: entry,
  pool_id: 'p1',
  matchweek_number: mw,
  fixture_id: fixture,
  score_type: type,
  total_points: points,
})

describe('ordinal / rankPhrase', () => {
  it('handles the teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st',
    ])
  })
  it('says which way the rank moved', () => {
    expect(rankPhrase(4, 7)).toBe('up 3 to 4th')
    expect(rankPhrase(7, 6)).toBe('down 1 to 7th')
    expect(rankPhrase(4, 4)).toBe('still 4th')
    expect(rankPhrase(4, null)).toBe('4th')
    expect(rankPhrase(null, 3)).toBeNull()
  })
})

describe("Pick'em stories", () => {
  it('sums points, counts tiers and states the rank move', () => {
    const [s] = buildMatchweekStories(
      base({
        scores: [score('f1', 'exact', 5), score('f2', 'winner_gd', 3), score('f3', 'miss', 0), score('f4', 'winner', 2)],
        ranks: [
          { entry_id: 'e1', matchweek_number: 4, rank: 7 },
          { entry_id: 'e1', matchweek_number: 6, rank: 4 },
        ],
        fixtures: [{ fixture_id: 'f1', home: 'Arsenal', away: 'Newcastle United', home_goals: 2, away_goals: 1 }],
      }),
    )
    expect(s.title).toBe('10 pts, up 3 to 4th')
    expect(s.meta.tiers).toEqual({ exact: 1, winner_gd: 1, winner: 1, miss: 1 })
    // Rank before = the latest RECORDED week before (4), not "matchweek minus one".
    expect(s.meta.rank_before).toBe(7)
    expect(s.meta.lines[0].points).toBe(5)
    expect(s.meta.lines).toHaveLength(3)
    expect(s.meta.more_count).toBe(1)
    expect(s.createdAt).toBe('2026-09-28T09:00:00Z')
    expect(s.colorKey).toBe('accent')
  })

  it('never invents a rank when history has none', () => {
    const [s] = buildMatchweekStories(base({ scores: [score('f1', 'winner', 2)] }))
    expect(s.title).toBe('2 pts')
    expect(s.meta.rank).toBeNull()
  })

  it('skips a week the member did not play', () => {
    expect(buildMatchweekStories(base())).toEqual([])
  })

  it('builds a card for every week it is handed — paging is not its job', () => {
    const weeks = Array.from({ length: 9 }, (_, i) => ({
      seasonId: 's1',
      matchweekNumber: i + 1,
      settledAt: `2026-08-${String(i + 10).padStart(2, '0')}T09:00:00Z`,
    }))
    const scores = weeks.map((w) => score(`f${w.matchweekNumber}`, 'winner', 2, w.matchweekNumber))
    expect(buildMatchweekStories(base({ weeks, scores }))).toHaveLength(9)
  })

  it('names the entry when the member has two', () => {
    const out = buildMatchweekStories(
      base({
        pools: [pool({ entries: [{ entryId: 'e1', entryName: 'Ryan' }, { entryId: 'e2', entryName: 'Ryan 2' }] })],
        scores: [score('f1', 'winner', 2), score('f1', 'miss', 0, 6, 'e2')],
      }),
    )
    expect(out).toHaveLength(2)
    expect(out.every((s) => s.meta.multi_entry)).toBe(true)
    expect(out.map((s) => s.body?.split(' · ')[0]).sort()).toEqual(['Ryan', 'Ryan 2'])
    expect(new Set(out.map((s) => s.id)).size).toBe(2)
  })
})

describe('Showdown stories', () => {
  const duel = (over = {}) => ({
    pool_id: 'p1',
    matchweek_number: 6,
    entry_a: 'e1',
    entry_b: 'e9',
    accuracy_a: 14,
    accuracy_b: 9,
    points_a: 500,
    points_b: 0,
    settled_at: '2026-09-28T09:00:00Z',
    ...over,
  })

  it('leads on the duel', () => {
    const [s] = buildMatchweekStories(
      base({
        pools: [pool({ mode: 'showdown' })],
        scores: [score('f1', 'winner', 14)],
        duels: [duel()],
        nameByEntry: new Map([['e9', 'Priya']]),
      }),
    )
    expect(s.title).toBe('Beat Priya: +500')
    expect(s.meta.duel?.outcome).toBe('won')
    expect(s.body).toBe('14 accuracy pts vs 9')
  })

  it('reads the member from either side of the duel', () => {
    const [s] = buildMatchweekStories(
      base({
        pools: [pool({ mode: 'showdown' })],
        duels: [duel({ entry_a: 'e9', entry_b: 'e1', points_a: 500, points_b: 0, accuracy_a: 14, accuracy_b: 9 })],
        nameByEntry: new Map([['e9', 'Priya']]),
      }),
    )
    expect(s.meta.duel?.outcome).toBe('lost')
    expect(s.title).toBe('Priya took the duel')
    expect(s.meta.duel?.my_accuracy).toBe(9)
  })

  it('a bye has no opponent', () => {
    const [s] = buildMatchweekStories(
      base({
        pools: [pool({ mode: 'showdown' })],
        duels: [duel({ entry_b: null, points_a: 250, accuracy_b: null })],
      }),
    )
    expect(s.meta.duel?.outcome).toBe('bye')
    expect(s.title).toBe('Bye week: +250')
  })

  it('ignores an unsettled duel', () => {
    const out = buildMatchweekStories(
      base({ pools: [pool({ mode: 'showdown' })], duels: [duel({ settled_at: null })] }),
    )
    expect(out).toEqual([])
  })
})

describe('Last Man Standing stories', () => {
  const lmsPool = pool({ mode: 'last_man_standing', poolName: 'Last One Standing' })
  const pick = (result: 'survived' | 'eliminated', mw = 6) => ({
    pool_id: 'p1',
    round_id: 'r1',
    round_number: 2,
    entry_id: 'e1',
    matchweek_number: mw,
    club_name: 'Liverpool',
    result,
  })
  const survivors = [
    { round_id: 'r1', entry_id: 'e1', eliminated_matchweek: null, is_winner: false },
    { round_id: 'r1', entry_id: 'e2', eliminated_matchweek: 5, is_winner: false },
    { round_id: 'r1', entry_id: 'e3', eliminated_matchweek: 6, is_winner: false },
    { round_id: 'r1', entry_id: 'e4', eliminated_matchweek: 7, is_winner: false },
  ]

  it('counts who was still standing AFTER that week', () => {
    const [s] = buildMatchweekStories(base({ pools: [lmsPool], lmsPicks: [pick('survived')], lmsSurvivors: survivors }))
    // e1 (never out) and e4 (out in 7) were standing after 6.
    expect(s.meta.lms?.survivors_left).toBe(2)
    expect(s.title).toBe('Survived with Liverpool')
    expect(s.body).toBe('2 of 4 still in round 2')
  })

  it('an elimination is stated without blame', () => {
    const [s] = buildMatchweekStories(base({ pools: [lmsPool], lmsPicks: [pick('eliminated')], lmsSurvivors: survivors }))
    expect(s.title).toBe('Round 2 ended with Liverpool')
  })

  it('skips an unsettled pick', () => {
    const out = buildMatchweekStories(
      base({ pools: [lmsPool], lmsPicks: [{ ...pick('survived'), result: null }], lmsSurvivors: survivors }),
    )
    expect(out).toEqual([])
  })
})

describe('Predict the Table stories', () => {
  it('only appears when the rank moved', () => {
    const tablePool = pool({ mode: 'table' })
    const moved = buildMatchweekStories(
      base({
        pools: [tablePool],
        ranks: [
          { entry_id: 'e1', matchweek_number: 5, rank: 3 },
          { entry_id: 'e1', matchweek_number: 6, rank: 2 },
        ],
      }),
    )
    expect(moved[0].title).toBe('Up 1 to 2nd')
    const still = buildMatchweekStories(
      base({
        pools: [tablePool],
        ranks: [
          { entry_id: 'e1', matchweek_number: 5, rank: 2 },
          { entry_id: 'e1', matchweek_number: 6, rank: 2 },
        ],
      }),
    )
    expect(still).toEqual([])
  })
})
