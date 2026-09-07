// =============================================================
// The two apps must agree about which phase of the duel you are in
// =============================================================
// `lib/league/duelPhase.ts` is canonical and `mobile/lib/duelPhase.ts` is a
// hand copy, because `mobile/` is a separate npm project whose `@/*` resolves
// to `mobile/*` and cannot import the web app's `lib/`. Same forced duplication
// as `duelPoints.ts`, `predictionMode.ts` and `design/oklch.ts`.
//
// ## ⚠ WHY A DRIFT HERE IS WORSE THAN A DRIFT ANYWHERE ELSE IN THE PAIR
//
// A stale colour looks slightly wrong. A stale BRANCH ORDER looks entirely
// right: every branch in that chain returns a valid phase and renders a working
// screen. The production failure this module was built to end — matchweek 3's
// walkout being unreachable on 2026-09-01 — survived review precisely because
// the state it fell through to was correct in itself.
//
// Two copies one branch apart would put a member's phone and their browser in
// different halves of the same cycle, each looking fine on its own. So this is
// a BYTE comparison below the banner rather than a spot check on the values:
// there is no part of that function whose wording is decoration. The comments
// inside it ARE the contract — "the order of these branches is the entire
// contract of this file" — so they are compared too.
//
// ## The banners are allowed to differ, and only the banners
//
// Each names itself as the canonical or the copy. Everything from
// `export type DuelPhase` down is compared exactly, whitespace included.
//
// If this fails: copy the canonical file over the mobile one, then re-apply the
// mobile banner. Never the other way round unless you are moving canon.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import { duelPhase, type DuelPhaseInput } from '../duelPhase'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

/** Everything below the banner — the types, the function and its reasoning. */
function body(src: string, path: string): string {
  const i = src.indexOf('export type DuelPhase')
  expect(i, `${path}: no \`export type DuelPhase\` — the file was restructured`).toBeGreaterThan(-1)
  return src.slice(i)
}

describe('the mobile copy of duelPhase mirrors the web', () => {
  it('is byte-identical below the banner', () => {
    const web = body(read('lib/league/duelPhase.ts'), 'lib/league/duelPhase.ts')
    const rn = body(read('mobile/lib/duelPhase.ts'), 'mobile/lib/duelPhase.ts')

    expect(
      rn === web,
      'mobile/lib/duelPhase.ts has drifted from lib/league/duelPhase.ts. The two apps ' +
        'would disagree about which phase of the duel a member is in, and each would look ' +
        'correct on its own. Copy the canonical file over it and re-apply the mobile banner.',
    ).toBe(true)
  })

  it('still names itself as the copy, so nobody edits the wrong one', () => {
    expect(read('mobile/lib/duelPhase.ts')).toContain('THIS IS THE COPY')
    expect(read('lib/league/duelPhase.ts')).toContain('THIS FILE IS THE CANONICAL ONE')
  })
})

/**
 * The web copy, exercised.
 *
 * ⚠ `mobile/lib/__tests__/duelPhase.test.ts` is the full behavioural suite and
 * it imports the MOBILE file. The byte guard above is what carries its verdict
 * across to this one — but only if this file is real, imported and runnable, so
 * these two assertions exist to prove the web copy is actually reachable from
 * the web app's own module graph rather than merely present on disk.
 *
 * Both are the failure that mattered on 2026-09-01: a reachable walkout, and a
 * sealed week that cannot swallow it.
 */
describe('the web copy runs', () => {
  const base: DuelPhaseInput = {
    hasDraw: true,
    current: { duelId: 'd1', matchweek: 3, settledAt: null },
    sealedMatchweek: 4,
    isInPlay: false,
    lastSettledAt: null,
    revealSeenDuel: null,
    recapSeenAt: null,
  }

  it('offers the walkout even though a later week is sealed', () => {
    const r = duelPhase(base)
    expect(r.phase).toBe('revealable')
    expect(r.matchweek).toBe(3)
    expect(r.opponentVisible).toBe(false)
  })

  it('names the opponent once the walkout has been watched', () => {
    const r = duelPhase({ ...base, revealSeenDuel: 'd1' })
    expect(r.phase).toBe('scouting')
    expect(r.opponentVisible).toBe(true)
  })
})
