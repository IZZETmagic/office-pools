import { describe, expect, it } from 'vitest'

import { CONFIRM_FAILED_PATH, confirmDestination } from '../authConfirm'

// =============================================================
// /auth/confirm accepts a reset link and nothing else
// =============================================================
// ⚠ The failure worth guarding is the map growing a type, or a lookup reaching
// the prototype, without anyone deciding where that type should land.
// =============================================================

describe('confirmDestination', () => {
  it('sends a reset link to the new-password page', () => {
    expect(confirmDestination('recovery')).toEqual({ type: 'recovery', path: '/reset-password' })
  })

  it('refuses every other email link type', () => {
    for (const type of ['signup', 'invite', 'magiclink', 'email_change', 'email']) {
      expect(confirmDestination(type)).toBeNull()
    }
  })

  it('refuses a missing type and prototype keys', () => {
    expect(confirmDestination(null)).toBeNull()
    expect(confirmDestination('')).toBeNull()
    expect(confirmDestination('constructor')).toBeNull()
    expect(confirmDestination('__proto__')).toBeNull()
  })

  it('only ever lands on a path on our own origin', () => {
    expect(confirmDestination('recovery')?.path.startsWith('/')).toBe(true)
    expect(confirmDestination('recovery')?.path.startsWith('//')).toBe(false)
    expect(CONFIRM_FAILED_PATH.startsWith('/')).toBe(true)
    expect(CONFIRM_FAILED_PATH.startsWith('//')).toBe(false)
  })
})
