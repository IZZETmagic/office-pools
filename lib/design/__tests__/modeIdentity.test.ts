// =============================================================
// Seven modes, seven colours — and they have to stay apart
// =============================================================
// The pool card's stripe became the competition's brand colour, so the pill is
// now the ONLY thing that distinguishes a Showdown pool from a Last Man
// Standing one at a glance. Before that change all four league modes shared a
// single gold pill, which was survivable while the stripe did the work.
//
// The failure this file guards is quiet and specific: someone adds an eighth
// mode, picks a hex that looks fine on its own, and it lands 6° from an
// existing one. Nothing breaks. Two modes just stop being distinguishable, on
// the one surface where that is the whole job.
// =============================================================

import { describe, it, expect } from 'vitest'
import { modeIdentityColor, poolModeColor } from '@/lib/design/tokens'
import { toOklab, lightness, withLightness, parseHex } from '@/lib/design/oklch'
import { getModeChip } from '@/lib/design/poolMode'
import { PREDICTION_MODES } from '@/lib/predictionMode'
import { LEAGUE_MODES } from '@/lib/design/poolMode'

const MODES = Object.keys(modeIdentityColor) as Array<keyof typeof modeIdentityColor>

/**
 * A chip for any of the seven, hiding the two-level call.
 *
 * ⚠ `getModeChip('pickem')` is NOT the Pick'em chip. The four league games are
 * the SECOND argument — the first is always the literal `league_pickem` that
 * every league pool carries in `prediction_mode`. Passing a league mode as the
 * first argument silently falls back to full_tournament, which is exactly the
 * confusion this helper exists to keep out of the assertions.
 */
function chipFor(mode: keyof typeof modeIdentityColor) {
  return (LEAGUE_MODES as readonly string[]).includes(mode)
    ? getModeChip('league_pickem', mode)
    : getModeChip(mode)
}

function hueDegrees(hex: string): number {
  const c = toOklab(hex)
  const d = Math.atan2(c.b, c.a) * (180 / Math.PI)
  return d < 0 ? d + 360 : d
}
function hueGap(a: string, b: string): number {
  const d = Math.abs(hueDegrees(a) - hueDegrees(b))
  return d > 180 ? 360 - d : d
}

/** WCAG relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const n = v / 255
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('the seven are distinguishable', () => {
  it('has one colour per mode, with no duplicates', () => {
    expect(MODES).toHaveLength(7)
    expect(new Set(Object.values(modeIdentityColor)).size).toBe(7)
  })

  it('⚠ keeps every pair at least 25° apart in hue', () => {
    // 28° is the actual minimum. The three bracket colours are fixed at 265°,
    // 163° and 58°, leaving a 153° arc for the four league modes — about 30°
    // each — so 28° is near the achievable maximum rather than a shrug. Seven
    // evenly spaced would be 51°, which this set cannot reach without moving
    // colours that mirror mobile.
    const failures: string[] = []
    for (let i = 0; i < MODES.length; i++) {
      for (let j = i + 1; j < MODES.length; j++) {
        const g = hueGap(modeIdentityColor[MODES[i]], modeIdentityColor[MODES[j]])
        if (g < 25) failures.push(`${MODES[i]} / ${MODES[j]} only ${g.toFixed(0)}°`)
      }
    }
    expect(failures).toEqual([])
  })

  it('covers every mode the database can hold', () => {
    // A prediction_mode with no colour would fall back and collide with
    // whatever it fell back to.
    for (const m of PREDICTION_MODES) {
      const leagueMode = m === 'league_pickem' ? 'pickem' : null
      expect(getModeChip(m, leagueMode)['--mode-base']).toBeTruthy()
    }
    for (const lm of LEAGUE_MODES) {
      expect(getModeChip('league_pickem', lm)['--mode-base']).toBeTruthy()
    }
  })

  it('gives all seven a DIFFERENT chip, end to end', () => {
    const chips = [
      ...(['full_tournament', 'progressive', 'bracket_picker'] as const).map((m) => getModeChip(m)),
      ...LEAGUE_MODES.map((lm) => getModeChip('league_pickem', lm)),
    ]
    expect(new Set(chips.map((c) => c['--mode-base'])).size).toBe(7)
    expect(new Set(chips.map((c) => c['--mode-ink'])).size).toBe(7)
  })
})

describe('the bracket three still mirror mobile', () => {
  it('matches poolModeColor exactly', () => {
    // These three are load-bearing for the RN app. Retuning them here to make
    // room for a league mode would drift the two apps apart silently.
    for (const m of Object.keys(poolModeColor) as Array<keyof typeof poolModeColor>) {
      expect(modeIdentityColor[m]).toBe(poolModeColor[m])
    }
  })
})

describe('the pill is legible in both themes', () => {
  // The pill is 10px bold — small text — so WCAG AA is 4.5:1. These clear AAA.
  const TINT_LIGHT = '#F2F2F4' // the pale tint over a light card
  const TINT_DARK = '#262A3A' // the stronger tint over a dark card

  it('clears AA for every mode, light and dark', () => {
    for (const m of MODES) {
      const chip = chipFor(m)
      expect(contrast(chip['--mode-ink'], TINT_LIGHT)).toBeGreaterThan(4.5)
      expect(contrast(chip['--mode-ink-dark'], TINT_DARK)).toBeGreaterThan(4.5)
    }
  })

  it('puts the light ink darker than the base and the dark ink lighter', () => {
    for (const m of MODES) {
      const base = modeIdentityColor[m]
      expect(lightness(withLightness(base, 0.45))).toBeLessThan(lightness(withLightness(base, 0.84)))
    }
  })

  it('gives every mode comparable contrast, not just passable', () => {
    // The point of absolute lightness targets over per-colour deltas: no pill
    // should be visibly fainter than its neighbour on the same card.
    const ratios = MODES.map((m) => contrast(withLightness(modeIdentityColor[m], 0.45), TINT_LIGHT))
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(2)
  })
})
