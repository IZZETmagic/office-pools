// The one-time link's token (lib/crews/inviteToken.ts, migration 155).

import { describe, expect, it } from 'vitest'

import { hashInviteToken, looksLikeInviteToken, newInviteToken } from '../inviteToken'

describe('the one-time invite token', () => {
  it('is 43 url-safe characters — 32 random bytes — and different every time', () => {
    const a = newInviteToken()
    const b = newInviteToken()
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a.token).not.toBe(b.token)
  })
  it('only its hash is kept, and the hash is not the token', () => {
    const { token, hash } = newInviteToken()
    expect(hash).toBe(hashInviteToken(token))
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(token)
  })
  it('anything that isn’t shaped like one is refused before the database is asked', () => {
    expect(looksLikeInviteToken(newInviteToken().token)).toBe(true)
    for (const bad of ['', 'abc', 'A'.repeat(42), 'A'.repeat(44), `${'A'.repeat(42)}=`, `${'A'.repeat(42)}/`, null, undefined, 7]) {
      expect(looksLikeInviteToken(bad)).toBe(false)
    }
  })
})
