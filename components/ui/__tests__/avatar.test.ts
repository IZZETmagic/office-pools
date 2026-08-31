// =============================================================
// The avatar stack — who the card says you are playing
// =============================================================
// Rendering is out of scope here (see vitest.config.ts), so this pins the
// arithmetic: how many faces are drawn, what "+N" counts, and the one label the
// group carries. The colour itself is pinned next door in
// lib/design/__tests__/avatarGradient.test.ts.
// =============================================================

import { describe, it, expect } from 'vitest'
import { avatarStackParts, personName, type AvatarPerson } from '../Avatar'

const people = (n: number): AvatarPerson[] =>
  Array.from({ length: n }, (_, i) => ({ user_id: `u${i}`, full_name: `Player ${i}`, username: `p${i}` }))

describe('avatarStackParts', () => {
  it('draws at most `max` faces and counts the rest', () => {
    // The shape the pool card ships: the server sends three rows and the exact
    // member count, so "+N" is the only thing that knows about the other 189.
    const parts = avatarStackParts(people(3), 192, 3)
    expect(parts.visible).toHaveLength(3)
    expect(parts.overflow).toBe(189)
  })

  it('shows no overflow when the pool is smaller than the stack', () => {
    const parts = avatarStackParts(people(2), 2, 3)
    expect(parts.visible).toHaveLength(2)
    expect(parts.overflow).toBe(0)
    expect(parts.label).toBe('Player 0, Player 1')
  })

  it('never counts backwards when the count and the rows disagree', () => {
    // ⚠ They come from one query but two reads — an exact count of the whole
    // table, and a three-row slice. Someone leaving in between must not paint
    // "+-1" on the card.
    expect(avatarStackParts(people(3), 1, 3).overflow).toBe(0)
  })

  it('falls back to the rows it was given when there is no count', () => {
    expect(avatarStackParts(people(5), undefined, 3).overflow).toBe(2)
  })

  it('names the extras in the label rather than leaving them silent', () => {
    expect(avatarStackParts(people(3), 10, 3).label).toBe('Player 0, Player 1, Player 2 and 7 more')
  })

  it('has nothing to draw for a pool with no rows', () => {
    expect(avatarStackParts([], 0, 3).visible).toHaveLength(0)
  })
})

describe('personName', () => {
  it('prefers the full name, then the username, then says so', () => {
    expect(personName({ user_id: 'u', full_name: 'Ryan Sousa', username: 'ryan' })).toBe('Ryan Sousa')
    expect(personName({ user_id: 'u', full_name: null, username: 'ryan' })).toBe('ryan')
    expect(personName({ user_id: 'u', full_name: null, username: null })).toBe('Unknown')
  })
})
