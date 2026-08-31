// =============================================================
// Initials — the two-letter rule
// =============================================================
// Moved out of app/pools/[pool_id]/community/helpers.tsx when the pool card
// started drawing avatars too, so it is now painted by two features and is
// worth pinning. The RN copy it mirrors lives in BanterSheet.tsx.
// =============================================================

import { describe, it, expect } from 'vitest'
import { getInitials } from '@/lib/design/initials'

describe('getInitials', () => {
  it('takes TWO letters from a one-word name', () => {
    // ⚠ The regression this exists for: the first web copy took one letter, so
    // "OdieBug" was a lone "O" in a 36px circle where the app shows "OD".
    expect(getInitials('OdieBug', undefined)).toBe('OD')
    expect(getInitials(null, 'ryan')).toBe('RY')
  })

  it('takes first and last for a multi-word name, ignoring the middle', () => {
    expect(getInitials('Ryan Sousa', undefined)).toBe('RS')
    expect(getInitials('Ada Belle Lovelace', undefined)).toBe('AL')
  })

  it('prefers the full name and falls back to the username', () => {
    expect(getInitials('Ryan Sousa', 'zzz')).toBe('RS')
    expect(getInitials('   ', 'zed')).toBe('ZE')
    expect(getInitials(null, null)).toBe('??')
  })

  it('survives the whitespace a real display name arrives with', () => {
    expect(getInitials('  Ryan   Sousa  ', undefined)).toBe('RS')
  })
})
