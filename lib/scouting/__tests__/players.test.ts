// =============================================================
// The people half of a scout report
// =============================================================
// Migration 141 documents three traps in the payload and the tests below are
// mostly those three, plus the one that is 136's rather than 141's:
//
//   · `is_starter` is known-wrong — the provider sends `substitute: false` for
//     whole squads, so filtering on it is filtering on a lie
//   · a null rating is an unused substitute, not a zero
//   · goals disagree between the two tables and only the timeline is right
//   · an own goal is credited to the side that BENEFITS, and the man named on
//     it plays for the other one
// =============================================================

import { describe, expect, it } from 'vitest'

import {
  MIN_MINUTES,
  scoutSide,
  type GoalEventRow,
  type PlayerStatRow,
} from '../players'

const ARS = 'ars'
const CHE = 'che'

function line(over: Partial<PlayerStatRow> = {}): PlayerStatRow {
  return {
    externalPlayerId: 1,
    playerName: 'B. Saka',
    clubId: ARS,
    position: 'F',
    minutes: 90,
    rating: 7.0,
    assists: 0,
    keyPasses: 0,
    shotsOn: 0,
    duelsWon: 0,
    duelsTotal: 0,
    saves: 0,
    yellowCards: 0,
    redCards: 0,
    ...over,
  }
}

function goal(over: Partial<GoalEventRow> = {}): GoalEventRow {
  return { playerName: 'B. Saka', clubId: ARS, kind: 'goal', assistName: null, ...over }
}

/** Enough 90-minute appearances to clear the minutes floor. */
function season(n: number, over: Partial<PlayerStatRow> = {}): PlayerStatRow[] {
  return Array.from({ length: n }, () => line(over))
}

describe('who counts as having played', () => {
  it('excludes an unused substitute even when the feed says they started', () => {
    // ⚠⚠ THE 141 BUG. `is_starter` is true for this row because the provider
    // sends `substitute: false` for whole squads. Zero minutes is the truth.
    const rows = [
      ...season(3, { minutes: 90 }),
      line({ externalPlayerId: 2, playerName: 'Bench Player', minutes: 0, rating: null }),
    ]
    const s = scoutSide(rows, [], ARS)
    expect(s.consideredPlayers).toBe(1)
    expect(s.inForm.map((p) => p.name)).not.toContain('Bench Player')
  })

  it('counts a substitute who actually came on', () => {
    const rows = [line({ externalPlayerId: 2, playerName: 'Sub', minutes: 11, rating: 6.5 })]
    expect(scoutSide(rows, [], ARS).consideredPlayers).toBe(1)
  })
})

describe('the rating mean', () => {
  it('excludes a null rating from BOTH sides of the average', () => {
    // ⚠ Two rated appearances at 8.0, plus one unrated. Counting the null as a
    // zero gives 5.33 and would rank a good player below a mediocre one.
    const rows = [
      line({ minutes: 90, rating: 8.0 }),
      line({ minutes: 90, rating: 8.0 }),
      line({ minutes: 45, rating: null }),
    ]
    expect(scoutSide(rows, [], ARS).inForm[0].rating).toBe(8)
  })

  it('still counts the unrated appearance towards minutes and appearances', () => {
    const rows = [
      line({ minutes: 90, rating: 8.0 }),
      line({ minutes: 90, rating: 8.0 }),
      line({ minutes: 45, rating: null }),
    ]
    const p = scoutSide(rows, [], ARS).inForm[0]
    expect(p.appearances).toBe(3)
    expect(p.minutes).toBe(225)
  })

  it('keeps a cameo out of the in-form list', () => {
    // ⚠ A substitute with one 9.0 over eleven minutes tops any raw rating sort.
    const rows = [
      ...season(3, { minutes: 90, rating: 7.0 }),
      line({ externalPlayerId: 2, playerName: 'Cameo', minutes: 11, rating: 9.0 }),
    ]
    const s = scoutSide(rows, [], ARS)
    expect(s.inForm[0].name).toBe('B. Saka')
    expect(s.inForm.map((p) => p.name)).not.toContain('Cameo')
    expect(s.qualified).toBe(1)
  })

  it('needs roughly two full games before it will rank anybody', () => {
    const rows = season(1, { minutes: MIN_MINUTES - 1, rating: 9.9 })
    expect(scoutSide(rows, [], ARS).qualified).toBe(0)
    expect(scoutSide(rows, [], ARS).inForm).toEqual([])
  })
})

describe('goals come from the timeline', () => {
  it('counts a goal from the event rows, not from the stat line', () => {
    // ⚠ The stat table has no goals column read here at all; 141 measured the
    // two disagreeing 428 to 430 across 146 fixtures.
    const s = scoutSide(season(3), [goal(), goal()], ARS)
    expect(s.inForm[0].goals).toBe(2)
  })

  it('counts a penalty as a goal', () => {
    const s = scoutSide(season(3), [goal({ kind: 'penalty' })], ARS)
    expect(s.inForm[0].goals).toBe(1)
  })

  it('NEVER credits an own goal to the man who scored it', () => {
    // ⚠⚠ The feed credits an own goal to the side that BENEFITS, so this event
    // sits on Arsenal's side with a Chelsea defender's name on it. Counting it
    // would hand that defender a goal for the team he plays against.
    const rows = season(3, { playerName: 'Own Goaler', externalPlayerId: 9 })
    const s = scoutSide(rows, [goal({ playerName: 'Own Goaler', kind: 'own_goal' })], ARS)
    expect(s.inForm[0].goals).toBe(0)
  })

  it('ignores a goal belonging to the other club', () => {
    const s = scoutSide(season(3), [goal({ clubId: CHE })], ARS)
    expect(s.inForm[0].goals).toBe(0)
  })

  it('survives a goal with no player name', () => {
    // A cancelled goal can arrive without a scorer; it must not become a tally
    // under the empty string.
    const s = scoutSide(season(3), [goal({ playerName: null })], ARS)
    expect(s.inForm[0].goals).toBe(0)
  })
})

describe('the danger men', () => {
  it('ranks on goals plus assists combined', () => {
    // One: 3 assists, no goals. Two: 1 assist and 3 goals — four involvements.
    const rows = [
      ...season(3, { externalPlayerId: 1, playerName: 'One', assists: 1 }),
      ...season(3, { externalPlayerId: 2, playerName: 'Two', assists: 0 }),
      line({ externalPlayerId: 2, playerName: 'Two', assists: 1 }),
    ]
    const s = scoutSide(rows, Array.from({ length: 3 }, () => goal({ playerName: 'Two' })), ARS)
    expect(s.dangerMen[0].name).toBe('Two')
    expect(s.dangerMen[0].goals + s.dangerMen[0].assists).toBe(4)
  })

  it('breaks a tie on involvements towards the one who scored them', () => {
    // ⚠ THE DOCUMENTED TIEBREAK. Three assists and three goals are both three
    // involvements; the scorer is the one a card about danger should name first.
    const rows = [
      ...season(3, { externalPlayerId: 1, playerName: 'Creator', assists: 1 }),
      ...season(3, { externalPlayerId: 2, playerName: 'Scorer', assists: 0 }),
    ]
    const s = scoutSide(rows, Array.from({ length: 3 }, () => goal({ playerName: 'Scorer' })), ARS)
    expect(s.dangerMen[0].name).toBe('Scorer')
  })

  it('is NOT minutes-qualified — a total cannot be inflated by a cameo', () => {
    // ⚠ Four goals in three starts is exactly who a card about danger should
    // name. The minutes floor exists to stop a cameo winning an AVERAGE.
    const rows = season(3, { externalPlayerId: 7, playerName: 'New Striker', minutes: 30 })
    const s = scoutSide(rows, Array.from({ length: 4 }, () => goal({ playerName: 'New Striker' })), ARS)
    expect(s.qualified).toBe(0)
    expect(s.dangerMen[0].name).toBe('New Striker')
    expect(s.dangerMen[0].goals).toBe(4)
  })

  it('leaves out anybody who has neither', () => {
    expect(scoutSide(season(3), [], ARS).dangerMen).toEqual([])
  })
})

describe('sides are kept apart', () => {
  it('never mixes the two clubs', () => {
    const rows = [
      ...season(3, { clubId: ARS, playerName: 'Gunner', externalPlayerId: 1 }),
      ...season(3, { clubId: CHE, playerName: 'Blue', externalPlayerId: 2 }),
    ]
    expect(scoutSide(rows, [], ARS).consideredPlayers).toBe(1)
    expect(scoutSide(rows, [], CHE).inForm[0].name).toBe('Blue')
  })
})
