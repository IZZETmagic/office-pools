// =============================================================
// The timeline mapper, against two real Premier League fixtures
// =============================================================
// The fixture files are `/fixtures/events` responses pulled from api-football
// on 2026-09-06, trimmed to the `response` array and otherwise untouched. Both
// were chosen for what they contain rather than at random:
//
//   1557391  Fulham 2–3 Crystal Palace — five goals and a VAR-disallowed one,
//            which is the case an upsert-based writer gets wrong.
//   1557388  Brentford 1–1 Sunderland — a penalty, five yellow cards and a
//            second VAR reversal, so card handling is covered by real data
//            rather than only by the synthetic cases at the bottom.
//
// ⚠ THE CENTRAL ASSERTION IS THAT THE TIMELINE ADDS UP TO THE SCORELINE. Every
// other check here is a detail; that one catches the whole class of mistakes
// that matter — a disallowed goal left in, a missed penalty counted, an own
// goal drawn in the wrong column — because all of them change the total.
// =============================================================

import { readFileSync } from 'fs'
import { resolve } from 'path'

import { describe, expect, it } from 'vitest'

import { eventsToTimeline } from '../mappers'
import type { ApiFootballEvent } from '../types'

function load(name: string): ApiFootballEvent[] {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `lib/integrations/apiFootball/__tests__/fixtures/${name}`), 'utf8'),
  ) as ApiFootballEvent[]
}

/** Goals as the scoreboard counts them, by the column they are drawn in. */
function scoreFrom(rows: ReturnType<typeof eventsToTimeline>) {
  const scoring = new Set(['goal', 'penalty', 'own_goal'])
  return {
    home: rows.filter((r) => r.side === 'home' && scoring.has(r.kind)).length,
    away: rows.filter((r) => r.side === 'away' && scoring.has(r.kind)).length,
  }
}

describe('eventsToTimeline — Fulham 2–3 Crystal Palace (1557391)', () => {
  const rows = eventsToTimeline(load('pl-1557391-events.json'), {
    fixtureId: 'fx-1',
    homeExternalTeamId: 36, // Fulham
  })

  it('reproduces the final score from the timeline alone', () => {
    expect(scoreFrom(rows)).toEqual({ home: 2, away: 3 })
  })

  it('keeps the VAR-disallowed goal as its own row, not as a goal', () => {
    const var_ = rows.filter((r) => r.kind === 'var_goal_cancelled')
    expect(var_).toHaveLength(1)
    expect(var_[0].minute).toBe(14)
    expect(var_[0].side).toBe('away') // Palace had it chalked off
    // And it must not have been counted above.
    expect(scoreFrom(rows).away).toBe(3)
  })

  it('puts the scorers on the right side, in order', () => {
    const goals = rows
      .filter((r) => r.kind === 'goal')
      .map((r) => [r.minute, r.side, r.player_name])
    expect(goals).toEqual([
      [11, 'home', 'Josh King'],
      [35, 'away', 'Tyrick Mitchell'],
      [42, 'home', 'Cesar Palacios Perez'],
      [54, 'away', 'Tyrick Mitchell'],
      [77, 'away', 'Ben Chilwell'],
    ])
  })

  it('records an assist where the feed gives one', () => {
    const opener = rows.find((r) => r.minute === 35 && r.kind === 'goal')
    expect(opener?.related_name).toBe('Eddie Nketiah')
  })

  it('reads a substitution as player OFF, related ON', () => {
    // ⚠ Verified by player id across three fixtures — see the mapper's header.
    // Nketiah started; Strand Larsen was on the bench.
    const sub = rows.find((r) => r.kind === 'subst' && r.minute === 45)
    expect(sub?.player_name).toBe('Eddie Nketiah')
    expect(sub?.related_name).toBe('Jörgen Strand Larsen')
  })

  it('keeps feed order recoverable within a shared minute', () => {
    // Four events land on the 79th minute in this fixture.
    const minute79 = rows.filter((r) => r.minute === 79)
    expect(minute79.length).toBeGreaterThan(1)
    const idx = minute79.map((r) => r.sort_index)
    expect([...idx].sort((a, b) => a - b)).toEqual(idx)
  })
})

describe('eventsToTimeline — Brentford 1–1 Sunderland (1557388)', () => {
  const rows = eventsToTimeline(load('pl-1557388-events.json'), {
    fixtureId: 'fx-2',
    homeExternalTeamId: 55, // Brentford
  })

  it('reproduces the final score, with one of the goals a penalty', () => {
    expect(scoreFrom(rows)).toEqual({ home: 1, away: 1 })
    expect(rows.filter((r) => r.kind === 'penalty')).toHaveLength(1)
  })

  it('carries all five yellow cards, none of them as reds', () => {
    expect(rows.filter((r) => r.kind === 'yellow')).toHaveLength(5)
    expect(rows.filter((r) => r.kind === 'red' || r.kind === 'second_yellow')).toHaveLength(0)
  })
})


describe('eventsToTimeline — Crystal Palace 1–4 Manchester City (1557381)', () => {
  // ⚠ THE OWN-GOAL FIXTURE, AND IT IS IN THE SUITE FOR A REASON. The mapper
  // used to flip an own goal to the opposite side on the assumption that the
  // provider attributes it to the scorer's own team. It does not: the 56th
  // minute Own Goal here is attributed to CRYSTAL PALACE — the side it counted
  // FOR — with `player` = G. Donnarumma, a Manchester City player.
  //
  // That flip cost 14 of 137 backfilled fixtures their scoreline and was
  // invisible to the synthetic test above, which asserted the same wrong
  // answer. Palace's ONLY goal in this match is the own goal, so if the flip
  // ever comes back this reads 0–5 and fails immediately.
  const rows = eventsToTimeline(load('pl-1557381-events.json'), {
    fixtureId: 'fx-3',
    homeExternalTeamId: 52, // Crystal Palace
  })

  it('reproduces 1–4, where the home goal IS the own goal', () => {
    expect(scoreFrom(rows)).toEqual({ home: 1, away: 4 })
  })

  it('credits the own goal to the beneficiary, naming the player who scored it', () => {
    const og = rows.filter((r) => r.kind === 'own_goal')
    expect(og).toHaveLength(1)
    expect(og[0].side).toBe('home')          // Palace benefited
    expect(og[0].player_name).toBe('G. Donnarumma') // a Manchester City player
    expect(og[0].minute).toBe(56)
  })
})


describe('eventsToTimeline — Aston Villa 0–1 Arsenal (1557377)', () => {
  // ⚠ THE FEED LEFT A CANCELLED GOAL IN THE LIST. At 55' it reports both a
  // `Var / Penalty cancelled` (player: Bukayo Saka) and a `Goal / Normal Goal`
  // with NO player — the residue of the same incident. Read literally that is a
  // 0-2 timeline over a 0-1 scoreline, and it was the last of 137 backfilled
  // fixtures whose timeline did not add up.
  //
  // Note this is the OPPOSITE convention to 1557391, where a disallowed goal is
  // simply absent from the payload. Both fixtures are pinned here because the
  // mapper has to survive either.
  const rows = eventsToTimeline(load('pl-1557377-events.json'), {
    fixtureId: 'fx-4',
    homeExternalTeamId: 66, // Aston Villa
  })

  it('reproduces 0–1, not the 0–2 the payload literally contains', () => {
    expect(scoreFrom(rows)).toEqual({ home: 0, away: 1 })
  })

  it('keeps the goal that stood, with its scorer', () => {
    const goals = rows.filter((r) => r.kind === 'goal')
    expect(goals).toHaveLength(1)
    expect(goals[0].player_name).toBe('B. Saka')
    expect(goals[0].minute).toBe(59)
  })

  it('still records the cancellation itself', () => {
    expect(rows.filter((r) => r.kind === 'var_goal_cancelled')).toHaveLength(1)
  })

  it('does not drop an unattributed goal that has no cancellation beside it', () => {
    // The narrow half of the rule: a null player alone is not enough.
    const rows2 = eventsToTimeline(
      [ev({ type: 'Goal', detail: 'Normal Goal', player: { id: null, name: null } })],
      { fixtureId: 'fx', homeExternalTeamId: 36 },
    )
    expect(rows2).toHaveLength(1)
  })
})

// -------------------------------------------------------------
// The cases the real fixtures happen not to contain. Hand-built from the
// provider's own vocabulary rather than left untested — an own goal on the
// wrong side and a counted missed penalty are both silent scoreline bugs.
// -------------------------------------------------------------

function ev(partial: Partial<ApiFootballEvent> & { type: ApiFootballEvent['type']; detail: string }): ApiFootballEvent {
  return {
    time: { elapsed: 50, extra: null },
    team: { id: 36, name: 'Fulham' },
    player: { id: 1, name: 'A Player' },
    assist: { id: null, name: null },
    comments: null,
    ...partial,
  } as ApiFootballEvent
}

describe('eventsToTimeline — the edges', () => {
  it('leaves an own goal on the side the feed gave it', () => {
    // ⚠ THIS TEST USED TO ASSERT THE OPPOSITE, and was wrong in the same way
    // the mapper was — a synthetic case can only ever confirm the author's
    // assumption. The real fixture below is the actual evidence; this one just
    // guards the unit behaviour.
    const rows = eventsToTimeline([ev({ type: 'Goal', detail: 'Own Goal' })], {
      fixtureId: 'fx',
      homeExternalTeamId: 36,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('own_goal')
    expect(rows[0].side).toBe('home')
  })

  it('drops a missed penalty, which the feed types as a Goal', () => {
    const rows = eventsToTimeline([ev({ type: 'Goal', detail: 'Missed Penalty' })], {
      fixtureId: 'fx',
      homeExternalTeamId: 36,
    })
    expect(rows).toHaveLength(0)
  })

  it('distinguishes a second yellow from a straight red', () => {
    const rows = eventsToTimeline(
      [
        ev({ type: 'Card', detail: 'Second Yellow card' }),
        ev({ type: 'Card', detail: 'Red Card' }),
        ev({ type: 'Card', detail: 'Yellow Card' }),
      ],
      { fixtureId: 'fx', homeExternalTeamId: 36 },
    )
    expect(rows.map((r) => r.kind)).toEqual(['second_yellow', 'red', 'yellow'])
  })

  it('ignores VAR decisions that are not reversals', () => {
    const rows = eventsToTimeline([ev({ type: 'Var', detail: 'Penalty confirmed' })], {
      fixtureId: 'fx',
      homeExternalTeamId: 36,
    })
    expect(rows).toHaveLength(0)
  })

  it('clamps a negative minute to zero rather than losing the event', () => {
    // ⚠ REAL DATA, NOT HYPOTHETICAL. Fixture 1550091 reports two yellow cards
    // at `elapsed: -5`, and the 0..130 CHECK refused the whole fixture until
    // this clamp existed — one of 137 lost to a 23514 during the backfill.
    const rows = eventsToTimeline(
      [ev({ type: 'Card', detail: 'Yellow Card', time: { elapsed: -5, extra: null } })],
      { fixtureId: 'fx', homeExternalTeamId: 36 },
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('yellow')
    expect(rows[0].minute).toBe(0)
  })

  it('keeps stoppage time rather than flattening it into the minute', () => {
    const rows = eventsToTimeline(
      [ev({ type: 'Goal', detail: 'Normal Goal', time: { elapsed: 90, extra: 4 } })],
      { fixtureId: 'fx', homeExternalTeamId: 36 },
    )
    expect(rows[0].minute).toBe(90)
    expect(rows[0].extra_minute).toBe(4)
  })

  it('survives a payload with null player and unknown detail', () => {
    const rows = eventsToTimeline(
      [
        ev({ type: 'Card', detail: 'Some New Card Type' }),
        ev({ type: 'Goal', detail: 'Normal Goal', player: { id: null, name: null } }),
      ],
      { fixtureId: 'fx', homeExternalTeamId: 36 },
    )
    // Unknown card dropped rather than guessed; the goal survives, unnamed.
    expect(rows).toHaveLength(1)
    expect(rows[0].player_name).toBeNull()
  })
})
