// =============================================================
// Re-homing, tested against three seasons that actually happened
// =============================================================
// `fixtures/premier-league-rounds.json` is every Premier League fixture of
// 2022/23, 2023/24 and 2024/25 reduced to the three fields the rule reads —
// id, kickoff, round label — pulled from api-football. 1,140 games, 114 rounds.
//
// It is here because the floor was CHOSEN from this data rather than guessed,
// and a rule chosen from data should be re-checked against it. The synthetic
// cases below cover the branches; the season replay covers whether the rule is
// any good.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  planRehome,
  MIN_ROUND_FIXTURES,
  type RehomeMatchweek,
  type RehomeFixture,
} from '../rehome'

const HOUR = 3600_000
const DAY = 86400_000

function mw(n: number, firstKickoff: string, lockAt?: string | null): RehomeMatchweek {
  return {
    matchweekId: `mw-${n}`,
    matchweekNumber: n,
    lockAt: lockAt === undefined ? new Date(Date.parse(firstKickoff) - HOUR).toISOString() : lockAt,
    firstKickoffAt: firstKickoff,
  }
}

function fx(id: string, matchweekId: string, kickoffAt: string, over: Partial<RehomeFixture> = {}): RehomeFixture {
  return { fixtureId: id, matchweekId, kickoffAt, isCompleted: false, manualOverride: false, ...over }
}

// Three weekends, a fortnight apart, nothing locked.
const WEEKS = [mw(1, '2026-09-05T14:00:00Z'), mw(2, '2026-09-19T14:00:00Z'), mw(3, '2026-10-03T14:00:00Z')]
const BEFORE = '2026-09-01T00:00:00Z'

/** Five per round, so the floor never fires unless a test means it to. */
function filled(): RehomeFixture[] {
  const out: RehomeFixture[] = []
  for (const m of WEEKS) {
    for (let i = 0; i < MIN_ROUND_FIXTURES; i++) {
      out.push(fx(`${m.matchweekId}-${i}`, m.matchweekId, m.firstKickoffAt!))
    }
  }
  return out
}

describe('a fixture is picked in the round it is played in', () => {
  it('a postponed game moves to the round whose window most recently precedes it', () => {
    const fixtures = filled()
    // Round 1 game, actually played the Wednesday after round 2's weekend.
    fixtures[0].kickoffAt = '2026-09-23T19:00:00Z'
    const { moves } = planRehome(WEEKS, fixtures, BEFORE)
    expect(moves).toHaveLength(1)
    expect(moves[0]).toMatchObject({ fixtureId: 'mw-1-0', toMatchweekId: 'mw-2', reason: 'date' })
  })

  it('⚠ the round BEFORE, never the round after', () => {
    // A Wednesday between rounds 2 and 3 attaches to 2: predicted Friday, played
    // the next Wednesday. Attaching it to 3 would drag round 3's lock back onto
    // the Tuesday and leave a one-day picking window.
    const fixtures = filled()
    fixtures[0].kickoffAt = '2026-09-30T19:00:00Z'
    const { moves } = planRehome(WEEKS, fixtures, BEFORE)
    expect(moves[0].toMatchweekId).toBe('mw-2')
  })

  it('leaves a fixture alone when it is already in the right round', () => {
    expect(planRehome(WEEKS, filled(), BEFORE).moves).toEqual([])
  })

  it('a game moved only by hours does not change round', () => {
    const fixtures = filled()
    fixtures[0].kickoffAt = '2026-09-05T19:30:00Z'
    expect(planRehome(WEEKS, fixtures, BEFORE).moves).toEqual([])
  })
})

describe('a fixture pulled ahead of the rest of its own round', () => {
  // La Liga 2026/27 matchweek 6 exactly: *Real Sociedad v Celta Vigo* on Thu 3
  // September, the other nine on Wed 16 September, with matchweek 3 already
  // locked behind it so there is nowhere backwards to go.
  const LIGA = [
    mw(3, '2026-08-28T17:00:00Z'),
    mw(4, '2026-09-04T19:00:00Z'),
    mw(5, '2026-09-13T15:00:00Z'),
    mw(6, '2026-09-03T19:00:00Z'), // ⚠ window set by the ONE early fixture
  ]
  const NOW = '2026-08-30T02:00:00Z'

  function liga(): RehomeFixture[] {
    const out: RehomeFixture[] = []
    for (let i = 0; i < 10; i++) out.push(fx(`mw-3-${i}`, 'mw-3', '2026-08-28T17:00:00Z'))
    for (let i = 0; i < 10; i++) out.push(fx(`mw-4-${i}`, 'mw-4', '2026-09-04T19:00:00Z'))
    for (let i = 0; i < 10; i++) out.push(fx(`mw-5-${i}`, 'mw-5', '2026-09-13T15:00:00Z'))
    out.push(fx('sociedad-celta', 'mw-6', '2026-09-03T19:00:00Z'))
    for (let i = 1; i < 10; i++) out.push(fx(`mw-6-${i}`, 'mw-6', '2026-09-16T15:00:00Z'))
    return out
  }

  it('joins the round it is played alongside, not the one it is labelled', () => {
    const { moves } = planRehome(LIGA, liga(), NOW)
    const mv = moves.find((m) => m.fixtureId === 'sociedad-celta')
    expect(mv?.toMatchweekId).toBe('mw-4')
    expect(mv?.reason).toBe('early')
  })

  it('⚠ and the other nine stay in their own round', () => {
    // The failure this guards is not hypothetical — it is what the planner did
    // to this exact season before pass 1a existed: the outlier dragged round 6's
    // window to 3 September, so the nine 16-September fixtures searched backwards
    // past rounds 4 and 5, landed on round 5, and emptied round 6.
    const fixtures = liga()
    const { moves, emptied } = planRehome(LIGA, fixtures, NOW)
    expect(moves.filter((m) => m.fromMatchweekId === 'mw-6')).toHaveLength(1)
    expect(fixtures.filter((f) => f.matchweekId === 'mw-6')).toHaveLength(9)
    expect(emptied).toHaveLength(0)
  })

  it('leaves it alone when the round ahead is further off than its own', () => {
    // La Liga matchweeks 1 and 2 have the same shape and must NOT move: their
    // early fixture is two days in front of its own round, and the round ahead is
    // a week and a fortnight away. Moving would make both rounds worse.
    const weeks = [mw(1, '2026-09-03T19:00:00Z'), mw(2, '2026-09-19T14:00:00Z')]
    const fixtures: RehomeFixture[] = [fx('early', 'mw-1', '2026-09-03T19:00:00Z')]
    for (let i = 1; i < 10; i++) fixtures.push(fx(`mw-1-${i}`, 'mw-1', '2026-09-05T14:00:00Z'))
    for (let i = 0; i < 10; i++) fixtures.push(fx(`mw-2-${i}`, 'mw-2', '2026-09-19T14:00:00Z'))
    expect(planRehome(weeks, fixtures, '2026-09-01T00:00:00Z').moves).toHaveLength(0)
  })

  it('leaves a round alone when several fixtures share the early slot', () => {
    // 2023 round 29: four games on 16–17 March against six on 30 March. Moving
    // one changes nothing, because the other three still set the deadline — and
    // moving all four would drag round 30 back a fortnight, which is the harm
    // this rule exists to avoid rather than relocate.
    const weeks = [mw(29, '2026-03-16T15:00:00Z'), mw(30, '2026-04-06T12:30:00Z')]
    const fixtures: RehomeFixture[] = []
    for (let i = 0; i < 4; i++) fixtures.push(fx(`early-${i}`, 'mw-29', '2026-03-16T15:00:00Z'))
    for (let i = 0; i < 6; i++) fixtures.push(fx(`late-${i}`, 'mw-29', '2026-03-30T12:30:00Z'))
    for (let i = 0; i < 10; i++) fixtures.push(fx(`mw-30-${i}`, 'mw-30', '2026-04-06T12:30:00Z'))
    expect(planRehome(weeks, fixtures, '2026-03-01T00:00:00Z').moves).toHaveLength(0)
  })

  it('⚠ refuses to drag a deadline into the past', () => {
    // Same shape as the La Liga case, but `now` is thirty minutes before the
    // early kickoff. The move would set round 4's deadline an hour before a
    // kickoff that is half an hour away — already passed — and the round would
    // lock the instant it landed.
    const fixtures = liga()
    const { moves } = planRehome(LIGA, fixtures, '2026-09-03T18:30:00Z')
    expect(moves.find((m) => m.fixtureId === 'sociedad-celta')).toBeUndefined()
  })
})

describe('what re-homing refuses to touch', () => {
  it('a fixture whose own round has locked stays put', () => {
    // "Once they've locked, the predictions are what they are." It scores
    // wherever it sits, whenever it is finally played.
    const fixtures = filled()
    fixtures[0].kickoffAt = '2026-09-23T19:00:00Z'
    const after = '2026-09-05T13:30:00Z' // round 1 locked half an hour ago
    expect(planRehome(WEEKS, fixtures, after).moves).toEqual([])
  })

  it('⚠ and never lands in a round that has already locked', () => {
    // The other half, and NOT the same check. A game pulled AHEAD of the bulk
    // would otherwise be added to a week people have finished picking — a
    // fixture they never saw, scored against them.
    const weeks = [mw(1, '2026-09-05T14:00:00Z'), mw(2, '2026-09-19T14:00:00Z')]
    const fixtures = [
      ...Array.from({ length: 5 }, (_, i) => fx(`a${i}`, 'mw-1', '2026-09-05T14:00:00Z')),
      ...Array.from({ length: 5 }, (_, i) => fx(`b${i}`, 'mw-2', '2026-09-19T14:00:00Z')),
    ]
    // A round-2 game brought forward into round 1's window, decided after round
    // 1 locked.
    fixtures[5].kickoffAt = '2026-09-08T19:00:00Z'
    const now = '2026-09-06T00:00:00Z'
    expect(planRehome(weeks, fixtures, now).moves).toEqual([])
  })

  it('a completed fixture is history', () => {
    const fixtures = filled()
    fixtures[0].kickoffAt = '2026-09-23T19:00:00Z'
    fixtures[0].isCompleted = true
    expect(planRehome(WEEKS, fixtures, BEFORE).moves).toEqual([])
  })

  it('an admin who pinned a fixture outranks the feed', () => {
    const fixtures = filled()
    fixtures[0].kickoffAt = '2026-09-23T19:00:00Z'
    fixtures[0].manualOverride = true
    expect(planRehome(WEEKS, fixtures, BEFORE).moves).toEqual([])
  })
})

describe('the floor: a round of one is not a round', () => {
  it(`absorbs anything under ${MIN_ROUND_FIXTURES} into the round before it`, () => {
    const fixtures = filled()
    // Strip round 2 down to two games by moving three of them out to round 3.
    for (const i of [5, 6, 7]) fixtures[i].kickoffAt = '2026-10-03T14:00:00Z'
    const { moves } = planRehome(WEEKS, fixtures, BEFORE)
    expect(moves.filter((m) => m.reason === 'date')).toHaveLength(3)
    const floored = moves.filter((m) => m.reason === 'floor')
    expect(floored).toHaveLength(2)
    expect(floored.every((m) => m.toMatchweekId === 'mw-1')).toBe(true)
  })

  it('⚠ backwards, so no deadline moves', () => {
    // Everything absorbed is played later than the round it joins, so that
    // round's first kickoff — and therefore its lock — is untouched. Absorbing
    // forwards would pull the next lock back onto these fixtures.
    const fixtures = filled()
    for (const i of [5, 6, 7]) fixtures[i].kickoffAt = '2026-10-03T14:00:00Z'
    const { moves } = planRehome(WEEKS, fixtures, BEFORE)
    for (const m of moves.filter((x) => x.reason === 'floor')) {
      expect(m.toMatchweekId).toBe('mw-1')
    }
  })

  it('reports the round it emptied, because an empty round is not inert', () => {
    // A matchweek holding nothing never snapshots its ranks (094), and Showdown
    // and LMS both settle off that snapshot. The caller has to know.
    const fixtures = filled()
    for (const i of [5, 6, 7, 8]) fixtures[i].kickoffAt = '2026-10-03T14:00:00Z'
    const plan = planRehome(WEEKS, fixtures, BEFORE)
    expect(plan.emptied).toEqual(['mw-2'])
  })

  it('leaves a thin round alone when there is nowhere unlocked to put it', () => {
    const fixtures = filled()
    for (const i of [5, 6, 7]) fixtures[i].kickoffAt = '2026-10-03T14:00:00Z'
    // Round 1 has locked, so it cannot take them.
    const now = '2026-09-05T13:30:00Z'
    const floored = planRehome(WEEKS, fixtures, now).moves.filter((m) => m.reason === 'floor')
    expect(floored).toEqual([])
  })
})

// =============================================================
// The replay
// =============================================================

type Row = { id: number; date: string; round: string }
const SEASONS = JSON.parse(
  readFileSync(resolve(process.cwd(), 'lib/league/__tests__/fixtures/premier-league-rounds.json'), 'utf8'),
) as Record<string, Row[]>

/** Import a season the way importLeagueSeason does: one matchweek per round label. */
function importSeason(rows: Row[]) {
  const groups = new Map<number, Row[]>()
  for (const r of rows) {
    const n = Number(r.round.replace(/\D+/g, ''))
    if (!groups.has(n)) groups.set(n, [])
    groups.get(n)!.push(r)
  }
  const matchweeks: RehomeMatchweek[] = []
  const fixtures: RehomeFixture[] = []
  for (const [n, rs] of [...groups].sort((a, b) => a[0] - b[0])) {
    const first = Math.min(...rs.map((r) => Date.parse(r.date)))
    matchweeks.push(mw(n, new Date(first).toISOString()))
    for (const r of rs) fixtures.push(fx(String(r.id), `mw-${n}`, r.date))
  }
  const start = Math.min(...matchweeks.map((m) => Date.parse(m.firstKickoffAt!)))
  return { matchweeks, fixtures, now: new Date(start - 7 * DAY).toISOString() }
}

function sizes(matchweeks: RehomeMatchweek[], fixtures: RehomeFixture[]) {
  const c = new Map(matchweeks.map((m) => [m.matchweekId, 0]))
  for (const f of fixtures) c.set(f.matchweekId, c.get(f.matchweekId)! + 1)
  return [...c.values()]
}

describe('three real Premier League seasons', () => {
  it('every season imports as 38 rounds of exactly 10', () => {
    for (const year of ['2022', '2023', '2024']) {
      const { matchweeks, fixtures } = importSeason(SEASONS[year])
      expect(matchweeks, year).toHaveLength(38)
      expect(new Set(sizes(matchweeks, fixtures)), year).toEqual(new Set([10]))
    }
  })

  it('moves 33 of 1,140 fixtures on date alone — 2.9% of a season', () => {
    // Small enough that most weeks are untouched, large enough that not doing it
    // means roughly one wrong week a month.
    //
    // ⚠ WAS 43 until 2026-08-29, and the ten that went are the point of the
    // change rather than a regression — see the round-29 test below. Eight of
    // them were one real round being dissolved into the round before it because
    // a single outlier had dragged its window to the front of the season; two
    // are the same fixtures now arriving at the same destination by the floor
    // rule instead of the date rule.
    let byDate = 0
    for (const year of ['2022', '2023', '2024']) {
      const { matchweeks, fixtures, now } = importSeason(SEASONS[year])
      byDate += planRehome(matchweeks, fixtures, now).moves.filter((m) => m.reason === 'date').length
    }
    expect(byDate).toBe(33)
  })

  it('⚠ round 29 of 2024 survives as a round — it used to be dissolved', () => {
    // THE BUG THE PULL-AHEAD RULE ACTUALLY FIXED, and it was never about the one
    // fixture. Round 29 has its earliest game on Wed 19 Feb and the other nine on
    // 15–16 March. `first_kickoff_at` is the earliest kickoff, so that one game
    // dragged the whole round's WINDOW to 19 February — and every other fixture
    // in it then looked like it belonged to whichever round the search reached
    // by walking back from mid-March. All nine were re-homed into round 28 and
    // round 29 ceased to exist.
    //
    // Reproduced on live data before it was fixed: the same shape in La Liga
    // 2026/27 planned nine of matchweek 6's ten fixtures into matchweek 5.
    //
    // Taking the outlier out FIRST puts the window back on the football, and the
    // other nine stay where they are.
    const { matchweeks, fixtures, now } = importSeason(SEASONS['2024'])
    const before = fixtures.filter((f) => f.matchweekId === 'mw-29').length
    expect(before, 'the 2024 data no longer has a ten-fixture round 29').toBe(10)

    // Round 29 is 1 + 8 + 1: one game on 19 Feb, eight on 15–16 Mar, one on
    // 16 Apr. Both outliers leave and in opposite directions — the early one
    // forward to round 26, the straggler backward to round 32 — and the eight
    // that ARE the round stay put. Before this, all nine of the March-and-later
    // fixtures were re-homed into round 28 and the round ceased to exist.
    const { moves } = planRehome(matchweeks, fixtures, now)
    const left = moves.filter((m) => m.fromMatchweekId === 'mw-29')
    expect(left.map((m) => m.reason).sort()).toEqual(['date', 'early'])
    expect(fixtures.filter((f) => f.matchweekId === 'mw-29')).toHaveLength(8)
  })

  it('⚠ leaves no round under the floor, in any of the three', () => {
    // THE REASON THE FLOOR EXISTS. Without it these same seasons produce rounds
    // of ONE fixture — a single game deciding a duel and a Last Man Standing
    // round, which is a coin toss, not a week of football.
    for (const year of ['2022', '2023', '2024']) {
      const { matchweeks, fixtures, now } = importSeason(SEASONS[year])
      planRehome(matchweeks, fixtures, now)
      const played = sizes(matchweeks, fixtures).filter((s) => s > 0)
      expect(Math.min(...played), year).toBeGreaterThanOrEqual(MIN_ROUND_FIXTURES)
    }
  })

  it('costs about one picking round a season, and no more', () => {
    // The price Ryan accepted. If a change ever makes this expensive, it should
    // fail here rather than in a season.
    for (const year of ['2022', '2023', '2024']) {
      const { matchweeks, fixtures, now } = importSeason(SEASONS[year])
      expect(planRehome(matchweeks, fixtures, now).emptied.length, year).toBeLessThanOrEqual(1)
    }
  })

  it('⚠ only an early move may drag a round\'s deadline back, and only forwards', () => {
    // The property the whole thing rested on used to be absolute: a target's own
    // first kickoff can never be dragged earlier by something arriving. That is
    // now true of every move EXCEPT 'early', which exists precisely to pay a
    // small drag on the round ahead to avoid a large one on the fixture's own —
    // so the invariant is narrowed rather than dropped, and the exception is
    // named. A 'date' or 'floor' move dragging a deadline is still a bug.
    for (const year of ['2022', '2023', '2024']) {
      const { matchweeks, fixtures, now } = importSeason(SEASONS[year])
      const before = new Map(matchweeks.map((m) => [m.matchweekId, m.firstKickoffAt!]))
      const { moves } = planRehome(matchweeks, fixtures, now)
      for (const mv of moves) {
        if (mv.reason === 'early') continue
        expect(Date.parse(before.get(mv.toMatchweekId)!), `${year} ${mv.fixtureId}`)
          .toBeLessThanOrEqual(Date.parse(fixtures.find((f) => f.fixtureId === mv.fixtureId)!.kickoffAt))
      }
    }
  })

  it('⚠ and an early move never asks for a deadline in the past', () => {
    // The half of that invariant that must NOT be narrowed. An early move sets
    // the round ahead's deadline to an hour before this kickoff; if that instant
    // has passed, the round locks the moment the move lands and nobody in it can
    // pick at all — worse than the problem being solved.
    for (const year of ['2022', '2023', '2024']) {
      const { matchweeks, fixtures, now } = importSeason(SEASONS[year])
      const kickoffs = new Map(fixtures.map((f) => [f.fixtureId, f.kickoffAt]))
      const { moves } = planRehome(matchweeks, fixtures, now)
      for (const mv of moves.filter((m) => m.reason === 'early')) {
        expect(Date.parse(kickoffs.get(mv.fixtureId)!) - HOUR, `${year} ${mv.fixtureId}`)
          .toBeGreaterThan(Date.parse(now))
      }
    }
  })

  it('finds Arsenal v Manchester City — round 12, played 120 days late', () => {
    // The fixture that proves api-football never re-homes: labelled round 12,
    // bulk played 18 Oct 2022, actually played 15 Feb 2023.
    const { matchweeks, fixtures, now } = importSeason(SEASONS['2022'])
    const late = fixtures.find((f) => f.matchweekId === 'mw-12' && f.kickoffAt.startsWith('2023-02'))
    expect(late, 'the 2022 data no longer contains the February round-12 game').toBeDefined()
    const { moves } = planRehome(matchweeks, fixtures, now)
    const moved = moves.find((m) => m.fixtureId === late!.fixtureId)
    expect(moved?.fromMatchweekId).toBe('mw-12')
    expect(moved?.toMatchweekId).not.toBe('mw-12')
  })
})
