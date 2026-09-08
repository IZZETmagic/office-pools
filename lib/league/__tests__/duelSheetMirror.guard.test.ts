// =============================================================
// Both apps agree about who took a fixture
// =============================================================
// `lib/league/duelSheet.ts` is canonical, `mobile/lib/duelSheet.ts` is a hand
// copy — `mobile/` is a separate npm project whose `@/*` resolves to `mobile/*`
// and cannot import the web app's `lib/`.
//
// ## ⚠ WHY THIS PARTICULAR RULE HAS TO BE ONE RULE
//
// The outcome of a fixture inside a duel has shipped THREE bugs, each of which
// rendered a perfectly plausible card:
//
//   · an opponent's chip flipping `neither` into a tick — a 0-0 nobody
//     predicted read as the opponent taking the fixture
//   · a dashed "not started" chip sitting beside a running clock
//   · a live 0-0 fading both clubs out as though it were a settled draw
//
// None of them threw, none of them logged, and the fourth — a verdict pricing a
// fixture from a constant instead of from what the sheet had actually paid —
// only shows up at one scoring depth.
//
// Three surfaces read this now: the Duel tab's team sheet, The Room's expanded
// duel, and the phone. A copy that drifts is two apps disagreeing about who is
// winning, with both looking right.
//
// ## The banners differ. Nothing below them may.
//
// The import line is the one permitted difference — `@/lib/matchStatus` on the
// web, `./matchStatus` on the phone — and it sits above the compare point.
//
// If this fails: copy the canonical file over the mobile one, restore the
// mobile banner and its import. Never the other way round unless moving canon.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import { buildSheet, sheetSummary, pickMissed, type SheetFixture } from '../duelSheet'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

/** Everything below the banner — the types, the functions and their reasoning. */
function body(src: string, path: string): string {
  const i = src.indexOf('export type FixtureOutcome')
  expect(i, `${path}: no \`export type FixtureOutcome\` — the file was restructured`)
    .toBeGreaterThan(-1)
  return src.slice(i)
}

describe('the mobile copy of duelSheet mirrors the web', () => {
  it('is byte-identical below the banner', () => {
    const web = body(read('lib/league/duelSheet.ts'), 'lib/league/duelSheet.ts')
    const rn = body(read('mobile/lib/duelSheet.ts'), 'mobile/lib/duelSheet.ts')

    expect(
      rn === web,
      'mobile/lib/duelSheet.ts has drifted from lib/league/duelSheet.ts. The two apps ' +
        'would disagree about who took a fixture, and both cards would look correct. ' +
        'Copy the canonical file over it and re-apply the mobile banner and import.',
    ).toBe(true)
  })

  it('still names itself as the copy, so nobody edits the wrong one', () => {
    expect(read('mobile/lib/duelSheet.ts')).toContain('THIS IS THE COPY')
    expect(read('lib/league/duelSheet.ts')).toContain('THIS FILE IS CANONICAL')
  })
})

/**
 * The web copy, exercised.
 *
 * ⚠ `mobile/lib/__tests__/duelSheet.test.ts` is the full 21-test suite and it
 * imports the MOBILE file; the byte guard above carries its verdict across. What
 * these prove is that the web copy is reachable from the web app's own module
 * graph and actually runs — a file that is merely present on disk mirrors
 * nothing.
 *
 * The two cases picked are the two shipped bugs that a Room-shaped copy would
 * most obviously have re-earned.
 */
describe('the web copy runs', () => {
  const fx = (n: number): SheetFixture => ({
    number: n, id: `f${n}`,
    homeName: 'Arsenal', awayName: 'Chelsea',
    homeAbbr: 'ARS', awayAbbr: 'CHE',
    homeCrest: null, awayCrest: null,
    kickoffAt: null,
    homeScoreFt: null, awayScoreFt: null, isCompletedFt: false,
  })

  it('calls an unscored fixture with a running clock `neither`, not `pending`', () => {
    const [row] = buildSheet({
      fixtures: [fx(1)],
      live: new Map([[1, {
        homeScore: 0, awayScore: 0, status: 'live', isCompleted: false,
        liveMinute: 23, livePeriod: '1H', liveAdded: null,
      }]]),
      mine: new Map(), theirs: new Map(),
      label: () => 'HOME',
      youEntry: 'a', themEntry: 'b',
    })
    // A dashed "not started" chip beside a ticking clock — one of the three.
    expect(row.outcome).toBe('neither')
    expect(row.clock).not.toBeNull()
    // And a live 0-0 is not a settled draw, so neither club is faded.
    expect(row.result).toBeNull()
  })

  it('does not call a pick wrong before the engine has scored it', () => {
    const [row] = buildSheet({
      fixtures: [fx(1)],
      live: new Map(),
      mine: new Map(), theirs: new Map(),
      label: () => 'HOME',
      youEntry: 'a', themEntry: 'b',
    })
    expect(pickMissed(row, 'you')).toBe(false)
    // Identical picks cannot separate anybody, and the summary says so.
    expect(sheetSummary([row])).toMatch(/Identical sheets/)
  })
})
