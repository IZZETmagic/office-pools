// Where the one-time link goes, and the way back to it (lib/crews/inviteLink.ts).
//
// ⚠ The first build put `/crew-invite#<token>` into `?redirectTo=` for Sign up / Log in — so the
// token reached the server, and the address of a page running Google Tag Manager, for exactly the
// people the page is for (Gill, 2026-10-02). These pin that it can't happen again.

import { describe, expect, it } from 'vitest'

import { INVITE_PAGE, LOG_IN_HREF, SIGN_UP_HREF, inviteLinkFor } from '../inviteLink'
import { newInviteToken } from '../inviteToken'

describe('the way back after signing up or logging in', () => {
  it('returns to the bare page — no fragment, no token, nothing but the path', () => {
    for (const href of [SIGN_UP_HREF, LOG_IN_HREF]) {
      const url = new URL(href, 'https://sportpool.io')
      expect(url.searchParams.get('redirectTo')).toBe(INVITE_PAGE)
      expect(href).not.toContain('#')
      expect(href).not.toContain('%23')
    }
  })
})

describe('the link in the email', () => {
  it('carries the token after the # only — never in the path or the query', () => {
    const { token } = newInviteToken()
    const url = new URL(inviteLinkFor('https://sportpool.io', token))
    expect(url.pathname).toBe(INVITE_PAGE)
    expect(url.search).toBe('')
    expect(url.hash).toBe(`#${token}`)
  })
})

describe('the page never builds a URL out of the token', () => {
  it('no redirectTo, href or push in app/crew-invite is made from it', async () => {
    const { readFileSync } = await import('fs')
    const src = readFileSync('app/crew-invite/CrewInvite.tsx', 'utf8')
    expect(src).not.toMatch(/redirectTo=\$\{/)
    expect(src).not.toMatch(/#\$\{token\}/)
    expect(src).not.toMatch(/encodeURIComponent\(token\)/)
  })
})
