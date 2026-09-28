import { afterEach, describe, expect, it } from 'vitest'

import { DEV_HARNESS_PREFIX, isBlockedHarnessPath, isPublicProduction } from '../devHarnessGate'

// =============================================================
// The harness gate closes on production and nowhere else
// =============================================================
// ⚠⚠ THE INTERESTING FAILURE IS THE GATE FIRING TOO WIDELY, not too narrowly. If
// it closed on preview it would take the harnesses away from `dev.sportpool.io`,
// which is the only place Ryan reviews them — and that would look like the
// harnesses being broken rather than like a gate misfiring. So 'preview' and the
// unset case are asserted as loudly as 'production' is.
//
// ⭐ Read through the real module rather than a re-implementation of the rule. A
// test that restates `=== 'production'` proves nothing about the shipped
// predicate; these mutate the actual environment the predicate reads.
// =============================================================

const ORIGINAL = process.env.VERCEL_ENV

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = ORIGINAL
})

/** ⚠ `delete` rather than `= undefined` — the latter leaves the string "undefined". */
function setEnv(value: string | undefined): void {
  if (value === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = value
}

describe('isPublicProduction', () => {
  it('is true on the public production deployment', () => {
    setEnv('production')
    expect(isPublicProduction()).toBe(true)
  })

  it('is false on a preview deployment — dev.sportpool.io must keep the harnesses', () => {
    setEnv('preview')
    expect(isPublicProduction()).toBe(false)
  })

  it('is false when unset, which is a developer running `next dev`', () => {
    setEnv(undefined)
    expect(isPublicProduction()).toBe(false)
  })

  it('is false for the literal string "undefined"', () => {
    // ⚠ A real hazard: `process.env.X = undefined` stringifies, and a gate that
    // treated any truthy value as production would close on a developer machine.
    setEnv('undefined')
    expect(isPublicProduction()).toBe(false)
  })
})

describe('isBlockedHarnessPath', () => {
  it('refuses the harness tree on production', () => {
    setEnv('production')
    for (const p of [
      DEV_HARNESS_PREFIX,
      '/dev-harness/identity',
      '/dev-harness/avatar-motion',
      '/dev-harness/match-centre',
      '/dev-harness/a/deeply/nested/one',
    ]) {
      expect(isBlockedHarnessPath(p), `${p} should be refused on production`).toBe(true)
    }
  })

  it('leaves every other production route alone', () => {
    setEnv('production')
    // ⚠⚠ THE BLAST-RADIUS CHECK. The gate sits in the proxy that every
    // authenticated request passes through, so a prefix that over-matched would
    // 404 the live site. `/pools` is the one that matters most.
    for (const p of [
      '/',
      '/pools',
      '/pools/abc-123',
      '/profile',
      '/api/avatar/me',
      '/avatar-assets.json',
      '/admin/super',
    ]) {
      expect(isBlockedHarnessPath(p), `${p} must NOT be refused`).toBe(false)
    }
  })

  it('serves the harnesses on preview and locally', () => {
    for (const env of ['preview', 'development', undefined]) {
      setEnv(env)
      expect(
        isBlockedHarnessPath('/dev-harness/identity'),
        `harnesses must stay reachable when VERCEL_ENV is ${String(env)}`,
      ).toBe(false)
    }
  })

  it('does not block a route that merely starts with the same letters', () => {
    // ⚠ `startsWith` is deliberate and this pins its one sharp edge: a sibling
    // route named `/dev-harnesses` or `/dev-harness-notes` WOULD be caught. None
    // exists today; if one is added, this test is where the decision surfaces.
    setEnv('production')
    expect(isBlockedHarnessPath('/developer')).toBe(false)
    expect(isBlockedHarnessPath('/dev')).toBe(false)
  })
})
