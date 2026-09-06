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

// -------------------------------------------------------------
// The cases the two real fixtures happen not to contain. Hand-built from the
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
  it('credits an own goal to the OTHER side', () => {
    // The feed attributes it to the team the scorer plays for. Drawn in that
    // column it would read as them having scored it.
    const rows = eventsToTimeline([ev({ type: 'Goal', detail: 'Own Goal' })], {
      fixtureId: 'fx',
      homeExternalTeamId: 36,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('own_goal')
    expect(rows[0].side).toBe('away')
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
