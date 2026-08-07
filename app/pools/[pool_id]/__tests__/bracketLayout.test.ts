import { describe, it, expect } from 'vitest'

import { makeLayout, BASE_W } from '../BracketResultsTab'

/**
 * The knockout bracket is absolutely positioned from numbers, not from CSS, so
 * nothing in the browser will catch it if these come out wrong — the cells just
 * land somewhere odd. These lock the two properties the layout has to hold:
 * it fills the width it is given, and it never gets smaller than it used to be.
 */
describe('makeLayout', () => {
  it('is four cells and three gaps wide, whatever the size', () => {
    for (const w of [320, 712, 900, 1104, 1400]) {
      const L = makeLayout(w)
      expect(L.width).toBe(4 * L.cellW + 3 * L.colGap)
      expect(L.roundW).toBe(L.cellW + L.colGap)
    }
  })

  it('fills the available width once there is room to grow', () => {
    for (const w of [800, 900, 1000, 1104, 1280]) {
      const L = makeLayout(w)
      // Flooring cellW and colGap independently can leave a couple of pixels on
      // the table; anything more than that is a layout that does not reach.
      expect(w - L.width).toBeGreaterThanOrEqual(0)
      expect(w - L.width).toBeLessThanOrEqual(3)
    }
  })

  it('never shrinks below the size the bracket has always been', () => {
    // The narrow end is the regression that would actually hurt: a phone must
    // keep the readable 712px layout and scroll it, not squash it to fit.
    for (const w of [0, 320, 375, 500, 712]) {
      const L = makeLayout(w)
      expect(L.width).toBeGreaterThanOrEqual(BASE_W)
      expect(L.cellW).toBeGreaterThanOrEqual(160)
      expect(L.cellH).toBeGreaterThanOrEqual(56)
      expect(L.colGap).toBeGreaterThanOrEqual(24)
    }
  })

  it('keeps the original width and column rhythm at the baseline', () => {
    const L = makeLayout(BASE_W)
    expect(L).toMatchObject({ cellW: 160, pairGap: 8, colGap: 24, width: 712 })
  })

  it('keeps a cell proportional as the bracket stretches', () => {
    const base = makeLayout(BASE_W)
    const wide = makeLayout(1104)
    const widthRatio = wide.cellW / base.cellW
    const heightRatio = wide.cellH / base.cellH
    expect(widthRatio).toBeGreaterThan(1)
    // Height tracks width rather than lagging it, so a wide cell does not end up
    // a letterbox. Rounding to an even number costs at most a pixel either way.
    expect(Math.abs(heightRatio - widthRatio)).toBeLessThan(0.02)
  })

  it('splits every cell into two whole-pixel team rows', () => {
    // The divider between the two teams is drawn at cellH / 2 - 0.5. An odd
    // height puts it on a half pixel and the border renders soft.
    for (const w of [375, 712, 800, 900, 1104, 1152, 1400]) {
      expect(makeLayout(w).cellH % 2).toBe(0)
    }
  })

  it('grows monotonically — a wider page never yields a smaller bracket', () => {
    let prev = makeLayout(300)
    for (let w = 320; w <= 1600; w += 20) {
      const L = makeLayout(w)
      expect(L.width).toBeGreaterThanOrEqual(prev.width)
      expect(L.cellW).toBeGreaterThanOrEqual(prev.cellW)
      expect(L.cellH).toBeGreaterThanOrEqual(prev.cellH)
      prev = L
    }
  })
})
