// =============================================================
// Where the lines land
// =============================================================
// Two things this file protects, both of which have already gone wrong once and
// both of which are invisible in a code review:
//
//   · the bleed — players are placed as a percentage of the BOX, and the box
//     stopped being the pitch the moment there was grass outside it;
//   · the corner arc — it was a circle about a corner point that the rounding
//     removed, so it drifted outside the pitch and drew backwards.
//
// Native builds cannot run on this machine, so arithmetic is the only proof
// available. It is worth more than it looks: every assertion below failed
// against the code as it stood this morning.
// =============================================================

import { describe, expect, it } from 'vitest';

import {
  BLEED,
  CORNER_R,
  cornerArcPath,
  FACING,
  PITCH_L,
  PITCH_W,
  pitchXToView,
  pitchYToView,
  VIEW_L,
  VIEW_W,
} from '../pitchGeometry';

describe('the bleed', () => {
  it('leaves room for a whole stroke on every edge', () => {
    // A 0.35 stroke centred on the boundary needs 0.175 outside it.
    expect(BLEED).toBeGreaterThan(0.175 * 2);
  });

  it('⚠ a touchline is not the edge of the box', () => {
    expect(pitchXToView(0)).toBeCloseTo((BLEED / VIEW_W) * 100, 6);
    expect(pitchYToView(0)).toBeCloseTo((BLEED / VIEW_L) * 100, 6);
    expect(pitchXToView(0)).toBeGreaterThan(0);
    expect(pitchYToView(0)).toBeGreaterThan(0);
  });

  it('the far touchline is inside the box by the same margin', () => {
    expect(pitchXToView(100)).toBeCloseTo(100 - (BLEED / VIEW_W) * 100, 6);
    expect(pitchYToView(100)).toBeCloseTo(100 - (BLEED / VIEW_L) * 100, 6);
  });

  it('the halfway line is still the middle', () => {
    // The bleed is symmetric, so the one position it must not move is centre.
    expect(pitchXToView(50)).toBeCloseTo(50, 10);
    expect(pitchYToView(50)).toBeCloseTo(50, 10);
  });

  it('the box is the pitch plus two bleeds', () => {
    expect(VIEW_W).toBe(PITCH_W + BLEED * 2);
    expect(VIEW_L).toBe(PITCH_L + BLEED * 2);
  });
});

/**
 * How closely a parsed endpoint can be trusted.
 *
 * ⚠ THE PATH IS ROUNDED TO A MILLIMETRE ON THE WAY OUT, so nothing read back
 * out of the string is exact. 5mm of tolerance is four rounding steps and is
 * still a hundredth of the stroke's own width — far finer than the ~0.006px a
 * millimetre of grass occupies on a phone.
 */
const MM = 2; // decimal places → |diff| < 0.005m

/** `M x y A r r 0 0 0 x y` → the numbers, in order. */
function nums(d: string): number[] {
  return (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

function parseArc(d: string) {
  // M x1 y1 A rx ry rotation large-arc sweep x2 y2 — the three flags in the
  // middle are numbers too, and reading past them is how this helper was wrong
  // the first time.
  const n = nums(d);
  expect(n).toHaveLength(9);
  return { x1: n[0], y1: n[1], r: n[2], x2: n[7], y2: n[8] };
}

describe('the corner arc', () => {
  /** The real card, at a 393pt phone: 24pt of radius, less the bleed. */
  const R = (24 * VIEW_W) / 393 - BLEED;

  it('⚠ both ends sit ON the touchline, not beside it', () => {
    // This is the whole bug. The old arc ran (0,1) → (1,0), which at this
    // radius is half a metre OUTSIDE the rounded corner — a stray curve
    // bending the opposite way to the line it belonged to.
    const { x1, y1, x2, y2 } = parseArc(cornerArcPath(R, R, FACING.topLeft, R));
    expect(Math.hypot(x1 - R, y1 - R)).toBeCloseTo(R, MM);
    expect(Math.hypot(x2 - R, y2 - R)).toBeCloseTo(R, MM);

    const old = Math.hypot(0 - R, 1 - R);
    expect(old).toBeGreaterThan(R + 0.4); // what it used to do
  });

  it('is a metre across, and drawn as one', () => {
    const { x1, y1, r, x2, y2 } = parseArc(cornerArcPath(R, R, FACING.topLeft, R));
    expect(r).toBeCloseTo(CORNER_R, MM);
    // Chord of a 1m arc: at most 2m, and here a good part of it.
    expect(Math.hypot(x2 - x1, y2 - y1)).toBeLessThanOrEqual(2 * CORNER_R + 1e-9);
    expect(Math.hypot(x2 - x1, y2 - y1)).toBeGreaterThan(1);
  });

  it('⚠ bulges into the pitch, never out towards the corner', () => {
    // Its centre is the touchline point nearest the corner, so the far side of
    // the arc is exactly 1m further in. Nothing may reach past the touchline.
    for (const [name, cx, cy, facing] of [
      ['topLeft', R, R, FACING.topLeft],
      ['topRight', PITCH_W - R, R, FACING.topRight],
      ['bottomLeft', R, PITCH_L - R, FACING.bottomLeft],
      ['bottomRight', PITCH_W - R, PITCH_L - R, FACING.bottomRight],
    ] as const) {
      const { x1, y1, x2, y2 } = parseArc(cornerArcPath(cx, cy, facing, R));
      expect(Math.hypot(x1 - cx, y1 - cy), name).toBeCloseTo(R, MM);
      expect(Math.hypot(x2 - cx, y2 - cy), name).toBeCloseTo(R, MM);
      // Both ends inside the pitch, both axes.
      for (const [x, y] of [[x1, y1], [x2, y2]]) {
        expect(x, name).toBeGreaterThanOrEqual(0);
        expect(x, name).toBeLessThanOrEqual(PITCH_W);
        expect(y, name).toBeGreaterThanOrEqual(0);
        expect(y, name).toBeLessThanOrEqual(PITCH_L);
      }
    }
  });

  it('⚠⚠ the drawn arc stays inside the touchline — the flags decide this', () => {
    // Endpoints on the line prove nothing about the curve BETWEEN them: the two
    // sweep flags pick between an arc that bulges into the pitch and one that
    // bulges out through the touchline towards the corner, and both start and
    // end in exactly the same places. So walk the arc SVG will actually draw.
    for (const [name, cx, cy, facing] of [
      ['topLeft', R, R, FACING.topLeft],
      ['topRight', PITCH_W - R, R, FACING.topRight],
      ['bottomLeft', R, PITCH_L - R, FACING.bottomLeft],
      ['bottomRight', PITCH_W - R, PITCH_L - R, FACING.bottomRight],
    ] as const) {
      const n = nums(cornerArcPath(cx, cy, facing, R));
      const [x1, y1, r, , , largeArc, sweep, x2, y2] = n;

      // Reconstruct the arc's own centre: the touchline point facing the corner.
      const px = cx + R * Math.cos(facing);
      const py = cy + R * Math.sin(facing);
      const a1 = Math.atan2(y1 - py, x1 - px);
      const a2 = Math.atan2(y2 - py, x2 - px);

      expect(sweep, `${name} sweep`).toBe(0);
      expect(largeArc, `${name} large-arc`).toBe(0);

      // Sweep 0 is the decreasing direction in SVG's y-down space.
      let span = a2 - a1;
      while (span > 0) span -= 2 * Math.PI;
      expect(Math.abs(span), `${name} span`).toBeLessThan(Math.PI); // matches large-arc 0

      for (let t = 0; t <= 1; t += 0.02) {
        const a = a1 + span * t;
        const x = px + r * Math.cos(a);
        const y = py + r * Math.sin(a);
        // Never further from the rounding's centre than the touchline itself.
        expect(Math.hypot(x - cx, y - cy), `${name} at t=${t.toFixed(2)}`).toBeLessThanOrEqual(
          R + 0.005,
        );
      }
    }
  });

  it('⚠ holds at every plausible card width, not just this phone', () => {
    // A tablet, a small phone and the floor the component clamps to.
    for (let touchline = 0.6; touchline <= 12; touchline += 0.2) {
      const d = cornerArcPath(touchline, touchline, FACING.topLeft, touchline);
      const { x1, y1, r, x2, y2 } = parseArc(d);
      expect(Number.isFinite(r)).toBe(true);
      expect(d).not.toContain('NaN');
      expect(Math.hypot(x1 - touchline, y1 - touchline)).toBeCloseTo(touchline, MM);
      expect(Math.hypot(x2 - touchline, y2 - touchline)).toBeCloseTo(touchline, MM);
    }
  });

  it('⚠ an arc wider than its corner is clamped, not NaN', () => {
    // `acos` past ±1 returns NaN, and SVG renders a NaN path as nothing at all
    // — a marking that silently disappears on one device and not another.
    const d = cornerArcPath(0.6, 0.6, FACING.topLeft, 0.6, CORNER_R);
    expect(d).not.toContain('NaN');
    expect(parseArc(d).r).toBeCloseTo(0.6, MM);
  });

  it('the four corners are the same figure, turned', () => {
    // Distance from the corner is the one thing that must not vary by corner.
    const reach = ([cx, cy, facing]: readonly [number, number, number]) => {
      const { x1, y1 } = parseArc(cornerArcPath(cx, cy, facing, R));
      return Math.hypot(x1 - cx, y1 - cy);
    };
    const corners = [
      [R, R, FACING.topLeft],
      [PITCH_W - R, R, FACING.topRight],
      [R, PITCH_L - R, FACING.bottomLeft],
      [PITCH_W - R, PITCH_L - R, FACING.bottomRight],
    ] as const;
    const all = corners.map(reach);
    for (const v of all) expect(v).toBeCloseTo(all[0], MM);
  });
});
