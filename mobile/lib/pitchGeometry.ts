// =============================================================
// The pitch's coordinate system
// =============================================================
// ⚠ IT LIVES HERE RATHER THAN IN `PitchMarkings.tsx` SO IT CAN BE TESTED — the
// same move `lineupLayout.ts` made, for the same reason. The vitest rule for
// `mobile/**` is pure modules only, and a component importing `react-native-svg`
// can never be one, so the arithmetic that decides where a line lands had no way
// to be checked. Every number here is metres of grass; nothing knows about
// pixels. `PitchMarkings.tsx` re-exports the lot, so callers are unaffected.
// =============================================================

/** The pitch's real width in metres. Every marking is sized in metres too. */
export const PITCH_W = 68;

/**
 * The length we actually draw.
 *
 * ⚠ FICTIONAL, AND THE ONLY FICTIONAL NUMBER HERE. It buys vertical room for
 * the two elevens without distorting a single marking: the extra length all
 * lands in midfield, between two penalty areas that stay 16.5 deep and either
 * side of a centre circle that stays round. A real pitch is 105.
 *
 * ⚠ 170 RATHER THAN 126, TO SPACE THE ROWS OUT. This is the ONLY lever for
 * that: `BAND` is a percentage of the length, and it cannot grow — at 46% the
 * front row already reaches 45.4% of the half, and 50% would stand it on the
 * halfway line among the eleven coming the other way. Lengthening the pitch
 * moves the rows apart in points while leaving that percentage alone.
 *
 * ⚠⚠ AND 170 RATHER THAN 145 BECAUSE THE TWO FRONT ROWS COLLIDED. Pulling
 * `OUTFIELD_TO` back from 46 to 44 opens the gap between the facing strikers,
 * but it also squeezes the four outfield rows into less pitch — the spacing
 * that the last two changes were spent buying. Lengthening at the same time
 * pays for both. Measured on a 393pt phone:
 *
 *              row gap   facing strikers   name to halfway
 *   126/46      65.7pt        —                  —
 *   145/46      86pt        64pt  (need 100)   32pt (need 42)
 *   170/44      94pt       113pt               56pt
 *
 * ⚠ THE COST IS THE SHAPE. A real pitch is about 1:1.55 long to wide. At 126
 * the drawing was 1:1.85, at 145 1:2.08, and at 170 it is 1:2.44 — a long
 * pitch, and about as far as this can go before it reads as a corridor rather
 * than a football field.
 */
export const PITCH_L = 170;

/**
 * Metres of grass drawn OUTSIDE the touchline, so an edge line has room.
 *
 * ⚠ Every line on the perimeter is centred on the boundary, so without this
 * exactly half of each is outside the viewBox and invisible. 1.5m is a little
 * over four stroke widths — enough that the rounded clip never reaches a line.
 */
export const BLEED = 1.5;

/** The box actually rendered, bleed included. The container must match this. */
export const VIEW_W = PITCH_W + BLEED * 2;
export const VIEW_L = PITCH_L + BLEED * 2;

/**
 * A percentage across the PITCH, as a percentage across the rendered box.
 *
 * ⚠ THE TWO ARE NOT THE SAME ONCE THERE IS A BLEED, and players are positioned
 * against the box. The left-hand touchline is 0% of the pitch but 2.1% of the
 * box; a goalkeeper placed at a raw pitch percentage would stand fractionally
 * outside his own goal line. Small, but it is the kind of drift that never gets
 * noticed and never gets fixed.
 */
export function pitchXToView(pct: number): number {
  return ((BLEED + (pct / 100) * PITCH_W) / VIEW_W) * 100;
}

export function pitchYToView(pct: number): number {
  return ((BLEED + (pct / 100) * PITCH_L) / VIEW_L) * 100;
}

/** The real corner arc: a metre. */
export const CORNER_R = 1;

/** Which way the corner lies from each rounding centre, in radians, y down. */
export const FACING = {
  topLeft: (5 * Math.PI) / 4,
  topRight: (7 * Math.PI) / 4,
  bottomLeft: (3 * Math.PI) / 4,
  bottomRight: Math.PI / 4,
} as const;

const f = (n: number) => n.toFixed(3);

/**
 * The corner arc, drawn ON the touchline rather than at a corner that no longer
 * exists.
 *
 * ⚠⚠ A CORNER ARC IS A CIRCLE ABOUT THE CORNER POINT, AND THERE ISN'T ONE ANY
 * MORE. Rounding the touchline to sit concentric with the card moved its corner
 * half a metre inside where the square one was, so the fixed `M 0 1 A 1 1 0 0 0
 * 1 0` ended up wholly OUTSIDE the pitch, curving the opposite way to the line
 * it was supposed to sit on and sliced in half by the card's own clip. Ryan
 * spotted it as "a small opposite little curved line".
 *
 * ⚠ SO THE ARC IS ANCHORED TO THE TOUCHLINE INSTEAD OF TO A POINT. Its centre
 * is the spot on the rounded corner nearest the corner, and its two ends are
 * where a 1m circle about that spot crosses the touchline. It therefore MEETS
 * the line at both ends and bulges into the pitch at every card width — which
 * the fixed quarter-circle did only while the corner was square.
 *
 * @param ox,oy  centre of the touchline's rounding for this corner
 * @param facing direction from that centre out towards the corner, radians
 */
export function cornerArcPath(
  ox: number,
  oy: number,
  facing: number,
  touchlineR: number,
  arcR: number = CORNER_R,
): string {
  // ⚠ CLAMPED SO THE TWO CIRCLES ALWAYS CROSS. An arc wider than the corner it
  // stands on has no intersection to draw between, and `acos` of anything past
  // ±1 is NaN — which SVG renders as nothing at all, silently.
  const r = Math.min(arcR, touchlineR);

  // Half the angle the arc's chord subtends at the rounding's centre. Straight
  // from the two-circle intersection: cos = (d² + R² − r²) / 2dR, with d = R.
  const half = Math.acos(1 - (r * r) / (2 * touchlineR * touchlineR));

  const x1 = ox + touchlineR * Math.cos(facing - half);
  const y1 = oy + touchlineR * Math.sin(facing - half);
  const x2 = ox + touchlineR * Math.cos(facing + half);
  const y2 = oy + touchlineR * Math.sin(facing + half);

  // Sweep flag 0: from the first end to the second the angle about the ARC's
  // own centre decreases, and in SVG's y-down space flag 1 is the increasing
  // direction. Large-arc 0: a chord across a convex corner never spans more
  // than a half turn — it approaches one only as the touchline goes flat.
  return `M ${f(x1)} ${f(y1)} A ${f(r)} ${f(r)} 0 0 0 ${f(x2)} ${f(y2)}`;
}
