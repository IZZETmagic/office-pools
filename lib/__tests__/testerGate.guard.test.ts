// =============================================================
// The tester gate must never close on production
// =============================================================
// dev.sportpool.io and sportpool.io read the SAME Supabase project, and the
// gate is configured by an environment variable. Vercel's env UI scopes a
// variable by checkbox, and the checkbox next to "Preview" sits beside the
// one next to "Production". A mis-click there is the whole risk: an
// allowlist of a dozen testers applied to production would lock every real
// member out of every live pool, at HTTP 200, looking deliberate.
//
// So `isTesterGateEnabled` refuses production structurally rather than
// trusting configuration. These tests pin that refusal, and pin the two
// exemptions without which a blocked account would be stranded — the wall
// page itself, and the route it signs out through.
// =============================================================

import { describe, it, expect } from 'vitest'
import {
  isAllowedTester,
  isTesterGateEnabled,
  isTesterGateExempt,
  parseAllowlist,
} from '@/lib/testerGate'

const TESTERS = 'Ryan@Example.com, sam@example.com,@sportpool.io'

describe('arming the gate', () => {
  it('⚠ refuses to arm on production even with an allowlist set', () => {
    // The line this whole file exists for.
    expect(isTesterGateEnabled('production', TESTERS)).toBe(false)
  })

  it('arms on a preview build with an allowlist', () => {
    expect(isTesterGateEnabled('preview', TESTERS)).toBe(true)
  })

  it('stays open on a preview build with no allowlist configured', () => {
    // An unset variable must not lock out the preview — otherwise deleting
    // the variable to disable the gate would do the opposite.
    expect(isTesterGateEnabled('preview', undefined)).toBe(false)
    expect(isTesterGateEnabled('preview', '')).toBe(false)
    expect(isTesterGateEnabled('preview', '  ,  ')).toBe(false)
  })

  it('stays open locally, where VERCEL_ENV is undefined and nothing is set', () => {
    expect(isTesterGateEnabled(undefined, undefined)).toBe(false)
  })
})

describe('who is on the list', () => {
  it('matches an invited email regardless of case or padding', () => {
    expect(isAllowedTester('ryan@example.com', TESTERS)).toBe(true)
    expect(isAllowedTester('  SAM@Example.com ', TESTERS)).toBe(true)
  })

  it('matches a whole domain written with a leading @', () => {
    expect(isAllowedTester('anyone@sportpool.io', TESTERS)).toBe(true)
  })

  it('turns away an address that is not listed', () => {
    expect(isAllowedTester('stranger@example.com', TESTERS)).toBe(false)
  })

  it('turns away an account with no email rather than defaulting open', () => {
    expect(isAllowedTester(undefined, TESTERS)).toBe(false)
    expect(isAllowedTester(null, TESTERS)).toBe(false)
    expect(isAllowedTester('', TESTERS)).toBe(false)
  })

  it('⚠ does not let a lookalike domain in on a suffix match', () => {
    // `endsWith('@sportpool.io')` is the guard: without the leading @ in the
    // entry, "notsportpool.io" would also end with "sportpool.io".
    expect(isAllowedTester('someone@notsportpool.io', TESTERS)).toBe(false)
  })
})

describe('the paths a blocked account can still reach', () => {
  it('lets through the wall page and the way out of it', () => {
    expect(isTesterGateExempt('/not-a-tester')).toBe(true)
    expect(isTesterGateExempt('/auth/signout')).toBe(true)
    expect(isTesterGateExempt('/auth/callback')).toBe(true)
    expect(isTesterGateExempt('/login')).toBe(true)
  })

  it('blocks the pages the gate exists to protect', () => {
    expect(isTesterGateExempt('/dashboard')).toBe(false)
    expect(isTesterGateExempt('/pools/abc')).toBe(false)
    expect(isTesterGateExempt('/join/xyz')).toBe(false)
    expect(isTesterGateExempt('/')).toBe(false)
  })

  it('⚠ does not exempt a path that merely starts with an exempt string', () => {
    // `/logind` is not `/login`; the check is segment-aware for this reason.
    expect(isTesterGateExempt('/logind')).toBe(false)
    expect(isTesterGateExempt('/authentic')).toBe(false)
  })
})

describe('parsing the variable', () => {
  it('trims, lowercases and drops blanks', () => {
    expect(parseAllowlist(' A@b.com , ,C@d.com ')).toEqual(['a@b.com', 'c@d.com'])
  })
})
