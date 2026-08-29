// =============================================================
// No two competitions may draw the same stripe
// =============================================================
// The pool card never names its competition — not on the dashboard, not on the
// pools list — so the 5px bar is the whole answer to "which league is this?".
// Two competitions sharing a colour is therefore lost information, not a
// polish issue, and it had already happened twice:
//
//   La Liga  #EE2737 ↔ Bundesliga       #D20515   ΔE 0.069
//   Ligue 1  #091C3E ↔ Champions League #0B1E64   ΔE 0.069
//
// Nothing caught either one, because the only check that existed asserted the
// HEX STRINGS differed — which they did. `new Set(bases).size === ids.length`
// is true of two identical-looking reds.
//
// ⚠ THE COMPARISON IS BETWEEN STRIPES, NOT COLOURS. getPoolStripe lifts the top
// stop, so each competition occupies a band of lightness and two bands can
// overlap even when the authored colours are far apart. Comparing bases only is
// what makes a coral look like a valid answer for La Liga when the Bundesliga's
// own top stop is already #FF574D.
// =============================================================

import { describe, it, expect } from 'vitest'
import { toOklab, adjustLightness } from '@/lib/design/oklch'
import { STRIPE_TOP_LIFT } from '@/lib/design/tokens'
import { getPoolStripe } from '@/lib/design/poolMode'
import {
  COMPETITION_COLOR,
  LEAGUE_ID,
  MIN_STRIPE_SEPARATION,
  THEMED_COMPETITION_IDS,
  UNTHEMED_COMPETITION,
} from '@/lib/design/competitionColor'

/** Straight OKLab distance — perceptually uniform, so one threshold fits all hues. */
function delta(a: string, b: string): number {
  const x = toOklab(a)
  const y = toOklab(b)
  return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b)
}

/**
 * How far apart two STRIPES are: the closest any stop of one gets to any stop
 * of the other. Four pairings, not one — see the header.
 */
function separation(a: string, b: string): number {
  const stops = (c: string) => [adjustLightness(c, STRIPE_TOP_LIFT), c]
  return Math.min(...stops(a).flatMap((x) => stops(b).map((y) => delta(x, y))))
}

/** Every stripe a card can draw, the unthemed fallback included. */
const ALL: [string, string][] = [
  ...THEMED_COMPETITION_IDS.map((id) => [String(id), COMPETITION_COLOR[id]] as [string, string]),
  ['unthemed', UNTHEMED_COMPETITION],
]

describe('every competition is visibly its own colour', () => {
  it(`keeps all ${ALL.length} stripes at least ${MIN_STRIPE_SEPARATION} apart`, () => {
    // Iterates COMPETITION_COLOR itself, so a competition added to the table is
    // checked without anyone remembering to add it here.
    const tooClose: string[] = []
    for (let i = 0; i < ALL.length; i++) {
      for (let j = i + 1; j < ALL.length; j++) {
        const d = separation(ALL[i][1], ALL[j][1])
        if (d < MIN_STRIPE_SEPARATION) {
          tooClose.push(`${ALL[i][0]} (${ALL[i][1]}) ↔ ${ALL[j][0]} (${ALL[j][1]}) = ${d.toFixed(3)}`)
        }
      }
    }
    // ⚠ If this fails on a competition you just added, the palette is full —
    // do not lower MIN_STRIPE_SEPARATION. See competitionColor.ts's header.
    expect(tooClose).toEqual([])
  })

  it('⚠ compares the rendered stripes, not just the authored colours', () => {
    // The check that would have passed the coral: bases well clear, bars
    // overlapping anyway, because a bright red's own lifted top IS a coral.
    // Anything comparing only COMPETITION_COLOR values is not measuring what a
    // member sees — and a coral was the first thing tried for the yielding
    // league before this metric ruled it out.
    const CORAL = '#FF674E'
    const brightRed = COMPETITION_COLOR[LEAGUE_ID.laLiga]
    expect(delta(CORAL, brightRed)).toBeGreaterThan(MIN_STRIPE_SEPARATION)
    expect(separation(CORAL, brightRed)).toBeLessThan(MIN_STRIPE_SEPARATION)
  })

  it('measures the stripes the app actually renders', () => {
    // Ties the metric to getPoolStripe rather than re-deriving the stops, so a
    // change to STRIPE_TOP_LIFT re-runs this rule instead of silently escaping it.
    for (const id of THEMED_COMPETITION_IDS) {
      const [top, base] = getPoolStripe({ externalLeagueId: id })
      expect(separation(COMPETITION_COLOR[id], COMPETITION_COLOR[id])).toBe(0)
      expect([top, base]).toEqual([adjustLightness(COMPETITION_COLOR[id], STRIPE_TOP_LIFT), COMPETITION_COLOR[id]])
    }
  })
})

describe('the two collisions that prompted this', () => {
  it('separates La Liga from the Bundesliga', () => {
    const d = separation(COMPETITION_COLOR[LEAGUE_ID.laLiga], COMPETITION_COLOR[LEAGUE_ID.bundesliga])
    expect(d).toBeGreaterThan(MIN_STRIPE_SEPARATION)
    // Was 0.069 — the two reddest competitions, indistinguishable at 5px.
    expect(d).toBeGreaterThan(0.12)
  })

  it('separates Ligue 1 from the Champions League', () => {
    const d = separation(COMPETITION_COLOR[LEAGUE_ID.ligue1], COMPETITION_COLOR[LEAGUE_ID.championsLeague])
    expect(d).toBeGreaterThan(MIN_STRIPE_SEPARATION)
    expect(d).toBeGreaterThan(0.12)
  })

  it('keeps La Liga on the bright red Ryan asked for', () => {
    expect(COMPETITION_COLOR[LEAGUE_ID.laLiga]).toBe('#EE2737')
  })

  it('keeps the Bundesliga in the red family rather than moving it out', () => {
    // The yielding league moves DOWN, it does not change hue. A Bundesliga that
    // is not red is a worse answer than a Bundesliga that is a darker red.
    const { a, b } = toOklab(COMPETITION_COLOR[LEAGUE_ID.bundesliga])
    const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
    expect(hue).toBeGreaterThan(10)
    expect(hue).toBeLessThan(45)
    expect(Math.hypot(a, b)).toBeGreaterThan(0.1) // still a saturated red, not a brown
  })

  it('keeps the Premier League purple Ryan chose', () => {
    expect(COMPETITION_COLOR[LEAGUE_ID.premierLeague]).toBe('#3D195B')
  })
})
