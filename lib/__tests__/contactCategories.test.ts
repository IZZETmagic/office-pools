// =============================================================
// Contact form categories — unit tests
// =============================================================
// The category dropdown on /contact and the pool code it can make mandatory.
//
// The properties under test:
//   1. There is always a way to send a message — a catch-all that asks for
//      nothing. A taxonomy you can't fit your problem into loses the report.
//   2. `requiresPoolCode` is resolved from the id server-side, so an unknown or
//      hostile id can never be treated as "no code needed".
//   3. Ids stay safe to use as Resend tag values.
//   4. Pool codes people paste out of chat still normalise to a real code.
// Pure functions only — no DB, no network.

import { describe, it, expect } from 'vitest'
import {
  CONTACT_CATEGORIES,
  findContactCategory,
  isValidPoolCode,
  normalizePoolCode,
  POOL_CODE_MAX,
  POOL_CODE_MIN,
} from '../contact/categories'

describe('CONTACT_CATEGORIES — the shape support depends on', () => {
  it('has a catch-all that needs no pool code', () => {
    const other = findContactCategory('other')
    expect(other).toBeDefined()
    expect(other?.requiresPoolCode).toBe(false)
  })

  it('keeps every id unique', () => {
    const ids = CONTACT_CATEGORIES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // Resend rejects a tag value outside this set, and the route sends the id as
  // one. A label with a space would fail the send, not just the tagging.
  it('keeps every id usable as a Resend tag value', () => {
    for (const c of CONTACT_CATEGORIES) {
      expect(c.id).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('still asks for a code on at least one category, and still exempts at least one', () => {
    expect(CONTACT_CATEGORIES.some((c) => c.requiresPoolCode)).toBe(true)
    expect(CONTACT_CATEGORIES.some((c) => !c.requiresPoolCode)).toBe(true)
  })
})

describe('findContactCategory — the server-side gate', () => {
  it('resolves a known id', () => {
    expect(findContactCategory('scoring')?.requiresPoolCode).toBe(true)
  })

  // The failure that matters: if an unknown id resolved to something, a caller
  // could skip the pool code by sending a category that does not exist.
  it('refuses anything not in the list', () => {
    for (const bad of ['', 'nope', 'SCORING', '__proto__', 'constructor']) {
      expect(findContactCategory(bad)).toBeUndefined()
    }
  })

  it('refuses non-strings', () => {
    for (const bad of [null, undefined, 42, {}, ['scoring'], true]) {
      expect(findContactCategory(bad)).toBeUndefined()
    }
  })
})

describe('normalizePoolCode — what people actually paste', () => {
  it('uppercases and strips the punctuation chat adds', () => {
    expect(normalizePoolCode('bda26x')).toBe('BDA26X')
    expect(normalizePoolCode(' bda-26x ')).toBe('BDA26X')
    expect(normalizePoolCode('BDA 26 X')).toBe('BDA26X')
  })

  it('reduces a code that was only punctuation to nothing', () => {
    expect(normalizePoolCode('---')).toBe('')
    expect(normalizePoolCode('   ')).toBe('')
  })
})

describe('isValidPoolCode — a typo check, not a lookup', () => {
  it('accepts the 6–8 character codes production actually issues', () => {
    expect(isValidPoolCode('BDA26X')).toBe(true)
    expect(isValidPoolCode('ABCD1234')).toBe(true)
  })

  it('rejects codes outside the bounds', () => {
    expect(isValidPoolCode('A'.repeat(POOL_CODE_MIN - 1))).toBe(false)
    expect(isValidPoolCode('A'.repeat(POOL_CODE_MAX + 1))).toBe(false)
    expect(isValidPoolCode('')).toBe(false)
  })

  // Deliberately wider than 6–8: we are not verifying the pool exists, and
  // rejecting a valid future format would block a real report.
  it('stays wider than the format in the table', () => {
    expect(POOL_CODE_MIN).toBeLessThan(6)
    expect(POOL_CODE_MAX).toBeGreaterThan(8)
  })
})
