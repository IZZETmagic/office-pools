// The one-time link in an email invite (migration 155).
//
// 32 random bytes, base64url — 43 characters, unguessable. Only its SHA-256 is stored, so reading
// the database back never yields a working link. The raw token exists in exactly one place: the
// email we send.
//
// ⚠ An opaque token is the ONLY thing in the link. Never the address, never the invite id: a link
// that names who it was for leaks that to whoever it's forwarded to, and an invite id is not a
// secret.

import { createHash, randomBytes } from 'crypto'

export function newInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashInviteToken(token) }
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Shape check before touching the database — anything else is simply not a link we sent. */
export function looksLikeInviteToken(s: unknown): s is string {
  return typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s)
}
