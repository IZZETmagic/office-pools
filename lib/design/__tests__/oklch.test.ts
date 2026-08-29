// =============================================================
// The colour maths behind the stripe
// =============================================================
// Worth pinning because every failure mode here is silent. A transposed matrix
// coefficient does not throw — it returns a colour, just the wrong one, and the
// only symptom is that a card looks slightly off to nobody in particular.
// =============================================================

import { describe, it, expect } from 'vitest'
import { toOklab, fromOklab, lightness, adjustLightness, parseHex, toHex } from '@/lib/design/oklch'

/** Every competition colour, plus the extremes and the unthemed fallback. */
const COLORS = ['#3D195B', '#EE2737', '#D20515', '#0067B1', '#091C3E', '#0B1E64', '#C9A227', '#4A5568']

describe('round trip', () => {
  it('returns the colour it was given', () => {
    for (const hex of COLORS) expect(fromOklab(toOklab(hex))).toBe(hex)
  })

  it('handles black, white and mid grey', () => {
    for (const hex of ['#000000', '#FFFFFF', '#808080']) {
      expect(fromOklab(toOklab(hex))).toBe(hex)
    }
  })

  it('reads shorthand hex and normalises case', () => {
    expect(fromOklab(toOklab('#FFF'))).toBe('#FFFFFF')
    expect(toHex(parseHex('#3d195b'))).toBe('#3D195B')
  })
})

describe('lightness', () => {
  it('puts white at 1 and black at 0', () => {
    expect(lightness('#FFFFFF')).toBeCloseTo(1, 2)
    expect(lightness('#000000')).toBeCloseTo(0, 2)
  })

  it('orders the competition colours the way the eye does', () => {
    // Ligue 1's navy is the darkest brand in the set and the World Cup's gold
    // the lightest. If this inverts, the matrices are wrong.
    expect(lightness('#091C3E')).toBeLessThan(lightness('#3D195B'))
    expect(lightness('#3D195B')).toBeLessThan(lightness('#EE2737'))
    expect(lightness('#EE2737')).toBeLessThan(lightness('#C9A227'))
  })
})

describe('adjustLightness', () => {
  it('lightens by the amount asked for', () => {
    for (const hex of COLORS) {
      expect(lightness(adjustLightness(hex, 0.14))).toBeCloseTo(lightness(hex) + 0.14, 2)
    }
  })

  it('⚠ holds hue and chroma, which lightening in sRGB does not', () => {
    // The reason this module exists. Scaling channels toward white walks the
    // shortest path through the RGB cube, which runs near grey — Premier League
    // purple comes out a dusty lilac. Moving OKLab lightness keeps a and b, so
    // the top of the stripe is still recognisably the same purple.
    const purple = '#3D195B'
    const lifted = adjustLightness(purple, 0.14)
    const naive = toHex(parseHex(purple).map((c) => c + 0.28 * (255 - c)) as [number, number, number])

    const chroma = (h: string) => { const c = toOklab(h); return Math.hypot(c.a, c.b) }
    expect(chroma(lifted)).toBeGreaterThan(chroma(naive))
  })

  it('gives the same perceived step to a dark navy and a light gold', () => {
    // A percentage-of-channel lift would move the gold far more than the navy.
    const navy = lightness(adjustLightness('#091C3E', 0.14)) - lightness('#091C3E')
    const gold = lightness(adjustLightness('#C9A227', 0.14)) - lightness('#C9A227')
    expect(Math.abs(navy - gold)).toBeLessThan(0.02)
  })

  it('clamps rather than running off either end of the scale', () => {
    expect(lightness(adjustLightness('#FFFFFF', 0.5))).toBeLessThanOrEqual(1)
    expect(lightness(adjustLightness('#000000', -0.5))).toBeGreaterThanOrEqual(0)
    for (const hex of ['#FFFFFF', '#000000']) {
      expect(adjustLightness(hex, 0.5)).toMatch(/^#[0-9A-F]{6}$/)
      expect(adjustLightness(hex, -0.5)).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('never returns a malformed colour for any brand colour', () => {
    for (const hex of COLORS) {
      for (const d of [-0.3, -0.14, 0, 0.14, 0.3]) {
        expect(adjustLightness(hex, d)).toMatch(/^#[0-9A-F]{6}$/)
      }
    }
  })
})
