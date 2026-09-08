// =============================================================
// The band and The Room read one answer, from opposite ends
// =============================================================
// `showdownPhase` hands `duelPhase` its inputs on the web. What is worth testing
// is not the ordering — `mobile/lib/__tests__/duelPhase.test.ts` owns that and
// the mirror guard carries it across — but the two things this layer decides:
//
//   · which side of a duel the viewer is on, and which duel is "current"
//   · `unwatchedMatchweek`, the week The Room must not offer yet
//
// The second one is the bug the phone shipped for a day: 116 reveals a duel to
// the DATABASE and the walkout reveals it to the MEMBER, and the Room only knew
// the first — so it listed a name one tab away from a header reading "Sealed ·
// Opponent hidden".

import { describe, it, expect } from 'vitest'

import {
  orientDuels, currentDuel, lastSettledAt, showdownPhase, unwatchedMatchweek,
} from '../showdownPhase'
import type { DuelRow } from '../duels'

const duel = (over: Partial<DuelRow> & { duel_id: string; matchweek_number: number }): DuelRow => ({
  entry_a: 'me', entry_b: 'them',
  points_a: null, points_b: null,
  accuracy_a: null, accuracy_b: null,
  settled_at: null,
  ...over,
} as DuelRow)

describe('orientDuels', () => {
  it('puts the viewer first whichever side of the row they are on', () => {
    const rows = orientDuels(
      [duel({ duel_id: 'd1', matchweek_number: 1, entry_a: 'rival', entry_b: 'me' })],
      ['me'],
    )
    expect(rows[0].you.entry).toBe('me')
    expect(rows[0].them?.entry).toBe('rival')
  })

  it('leaves a bye with nobody on the other side', () => {
    // ⚠ STRUCTURAL. A bye pays DUEL_BYE, which IS DUEL_TIE, so nothing may
    // detect one by reading the points.
    const rows = orientDuels(
      [duel({ duel_id: 'd1', matchweek_number: 1, entry_b: null, points_a: 250 })],
      ['me'],
    )
    expect(rows[0].them).toBeNull()
  })

  it('skips duels the viewer is not in — The Room shows those, the band does not', () => {
    const rows = orientDuels(
      [duel({ duel_id: 'd1', matchweek_number: 1, entry_a: 'x', entry_b: 'y' })],
      ['me'],
    )
    expect(rows).toEqual([])
  })
})

describe('currentDuel', () => {
  it('is the first UNSETTLED bout', () => {
    const mine = orientDuels([
      duel({ duel_id: 'd1', matchweek_number: 1, settled_at: '2026-08-20T00:00:00Z' }),
      duel({ duel_id: 'd2', matchweek_number: 2 }),
    ], ['me'])
    expect(currentDuel(mine)?.duel.duel_id).toBe('d2')
  })

  it('falls back to the LATEST RESULT by settled_at, never by matchweek number', () => {
    // ⚠ Rounds are played out of numerical order — 101 measured a minimum gap of
    // minus 121 days across three real seasons. A high-water mark on the number
    // would recap a week that finished months ago.
    const mine = orientDuels([
      duel({ duel_id: 'd9', matchweek_number: 9, settled_at: '2026-08-01T00:00:00Z' }),
      duel({ duel_id: 'd3', matchweek_number: 3, settled_at: '2026-09-01T00:00:00Z' }),
    ], ['me'])
    expect(currentDuel(mine)?.duel.duel_id).toBe('d3')
    expect(lastSettledAt(mine)).toBe('2026-09-01T00:00:00Z')
  })
})

describe('unwatchedMatchweek — what The Room must hold back', () => {
  const base = {
    ownEntryIds: ['me'],
    sealedMatchweek: 5,
    inPlayMatchweek: null,
    revealColumnMissing: false,
    recapSeenAt: '2026-09-01T00:00:00Z',
  }

  it('names the open week while its walkout is unwatched', () => {
    const phase = showdownPhase({
      ...base,
      duels: [duel({ duel_id: 'd4', matchweek_number: 4 })],
      revealSeen: new Map([['me', null]]),
    })
    expect(phase.phase).toBe('revealable')
    // The whole point: the band offers matchweek 4, the Room withholds it.
    expect(unwatchedMatchweek(phase)).toBe(4)
    expect(phase.opponentVisible).toBe(false)
  })

  it('releases the week the moment that walkout has been watched', () => {
    const phase = showdownPhase({
      ...base,
      duels: [duel({ duel_id: 'd4', matchweek_number: 4 })],
      revealSeen: new Map([['me', 'd4']]),
    })
    expect(phase.phase).toBe('scouting')
    expect(unwatchedMatchweek(phase)).toBeNull()
  })

  it('holds nothing back once the football is on', () => {
    // ⚠ `live` outranks the walkout, so there is no week to withhold — and a
    // Room that hid the week being PLAYED would be hiding the one thing
    // everybody is looking at.
    const phase = showdownPhase({
      ...base,
      inPlayMatchweek: 4,
      duels: [duel({ duel_id: 'd4', matchweek_number: 4 })],
      revealSeen: new Map([['me', null]]),
    })
    expect(phase.phase).toBe('live')
    expect(unwatchedMatchweek(phase)).toBeNull()
  })

  it('holds nothing back when migration 136 is not deployed', () => {
    // ⚠ AN ABSENT COLUMN SUPPRESSES THE CEREMONY, so there is no unwatched week
    // — and the Room must not hide a week behind a walkout that can never be
    // recorded as watched. That would be a matchweek nobody could ever reach.
    const phase = showdownPhase({
      ...base,
      revealColumnMissing: true,
      duels: [duel({ duel_id: 'd4', matchweek_number: 4 })],
      revealSeen: new Map(),
    })
    expect(phase.phase).toBe('scouting')
    expect(unwatchedMatchweek(phase)).toBeNull()
  })

  it('reaches the walkout even though a later week is sealed', () => {
    // The production failure of 2026-09-01, asserted through this layer: mid
    // season there is ALWAYS a next sealed week.
    const phase = showdownPhase({
      ...base,
      sealedMatchweek: 5,
      duels: [duel({ duel_id: 'd4', matchweek_number: 4 })],
      revealSeen: new Map(),
    })
    expect(phase.phase).toBe('revealable')
    expect(phase.matchweek).toBe(4)
  })
})
