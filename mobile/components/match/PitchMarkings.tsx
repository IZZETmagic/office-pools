import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import {
  BLEED,
  cornerArcPath,
  FACING,
  PITCH_L,
  PITCH_W,
  VIEW_L,
  VIEW_W,
} from '@/lib/pitchGeometry';

// =============================================================
// A football pitch, to scale
// =============================================================
// ⚠ THE VIEWBOX IS IN METRES, AND EVERY MARKING IS ITS REAL SIZE: a penalty
// area is 40.32 × 16.5, a six-yard box 18.32 × 5.5, the spot 11 out and every
// arc 9.15. Drawing them any other way means guessing at proportions a viewer
// has seen ten thousand times and will notice being wrong. `PITCH_L` is the one
// exception and `lib/pitchGeometry.ts` says why.
//
// ⚠ SVG RATHER THAN BORDERED VIEWS, AND THE 'D' IS WHY. Four of these shapes
// are arcs — the centre circle and the three arcs off the penalty spots — and a
// `View` can only draw a full ellipse via `borderRadius`. The D is a PARTIAL
// arc, the piece of the 9.15 circle that falls outside the penalty area, and
// there is no way to express that with a border.
//
// ⚠ NO `transform` ATTRIBUTES ANYWHERE. `react-native-svg` ignores SVG
// transform STRINGS, which the app has been bitten by before — so every point
// here is an absolute coordinate, and the two D arcs are written out separately
// rather than one being a rotation of the other.
//
// ⚠⚠ THE VIEWBOX CARRIES A BLEED, AND WITHOUT IT HALF THE PITCH IS SHAVED OFF.
// A goal line IS the edge of the pitch, so the penalty area, the six-yard box
// and the touchline all sit at y=0 or y=PITCH_L — and a stroke is centred on
// its path, so half of every one of those lines fell outside the viewBox and
// was never drawn. Ryan caught it on a screenshot: the top of the penalty area
// simply was not there. `BLEED` gives every edge line room for its own width.
//
// ⚠⚠ AND THE TOUCHLINE'S CORNERS ARE CONCENTRIC WITH THE CARD'S. The pitch sits
// in a `borderRadius` box with `overflow: hidden`, so anything outside that
// rounding is clipped — and the touchline's own 0.6m corners were far tighter
// than the card's 24pt, so its corners were cut clean off. The caller measures
// the card and passes its radius in PITCH UNITS; subtracting the bleed makes
// the two arcs concentric, so the touchline runs parallel to the card's edge
// the whole way round instead of crossing it. ⚠ THE CORNER ARCS HAD TO FOLLOW
// IT: they are circles about a corner point that the rounding removed, so they
// are computed from the touchline now — see `cornerArcPath`.
// =============================================================

export {
  BLEED,
  PITCH_L,
  PITCH_W,
  pitchXToView,
  pitchYToView,
  VIEW_L,
  VIEW_W,
} from '@/lib/pitchGeometry';

// Every measurement below is the real one, in metres.
const PEN_W = 40.32;
const PEN_D = 16.5;
const SIX_W = 18.32;
const SIX_D = 5.5;
const SPOT = 11;
const ARC_R = 9.15;

const PEN_X = (PITCH_W - PEN_W) / 2; // 13.84
const SIX_X = (PITCH_W - SIX_W) / 2; // 24.84
const MID_X = PITCH_W / 2; // 34

/**
 * Half-width of the D where it crosses the penalty-area line.
 *
 * The arc is centred on the spot (11 out) with radius 9.15; the area line is at
 * 16.5, so 5.5 beyond the spot. Pythagoras gives the rest — about 7.31 either
 * side of centre.
 */
const D_HALF = Math.sqrt(ARC_R * ARC_R - (PEN_D - SPOT) * (PEN_D - SPOT));

export function PitchMarkings({
  stroke = 'rgba(255,255,255,0.30)',
  /**
   * The card's own corner radius, expressed in PITCH UNITS.
   *
   * ⚠ IT HAS TO BE MEASURED, because the card's radius is in points and this
   * drawing is in metres — the conversion depends on how wide the card ended up.
   * The caller does that; the fallback is only for the first frame before
   * layout has run.
   */
  cardRadius = 5,
}: {
  stroke?: string;
  cardRadius?: number;
}) {
  const common = { stroke, strokeWidth: 0.35, fill: 'none' } as const;

  // Concentric with the card's rounding: the touchline sits exactly `BLEED`
  // inside it the whole way round. Floored so a small card cannot invert it.
  const r = Math.max(0.6, cardRadius - BLEED);

  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`${-BLEED} ${-BLEED} ${VIEW_W} ${VIEW_L}`}
      // ⚠ The container is laid out at exactly this viewBox's ratio, so nothing
      // is stretched — which is the whole reason the extra length is drawn as
      // grass rather than taken by scaling. Stretching would turn the centre
      // circle into an ellipse, the one marking everybody knows the shape of.
      preserveAspectRatio="xMidYMid meet"
      pointerEvents="none"
    >
      {/* The touchline, on the boundary itself — the bleed is what keeps its
          stroke inside the viewBox, and `r` what keeps its corners inside the
          card's. */}
      <Rect x={0} y={0} width={PITCH_W} height={PITCH_L} rx={r} {...common} />

      {/* Halfway line, centre circle, centre spot. */}
      <Line x1={0} y1={PITCH_L / 2} x2={PITCH_W} y2={PITCH_L / 2} {...common} />
      <Circle cx={MID_X} cy={PITCH_L / 2} r={ARC_R} {...common} />
      <Circle cx={MID_X} cy={PITCH_L / 2} r={0.5} fill={stroke} stroke="none" />

      {/* ---- Top goal (the HOME side defends this one) ---- */}
      <Rect x={PEN_X} y={0} width={PEN_W} height={PEN_D} {...common} />
      <Rect x={SIX_X} y={0} width={SIX_W} height={SIX_D} {...common} />
      <Circle cx={MID_X} cy={SPOT} r={0.5} fill={stroke} stroke="none" />
      {/*
        The D. Sweep flag 0: from the left crossing to the right one the angle
        DECREASES (143° → 90° → 37° about the spot), and in SVG's y-down space
        flag 1 is the increasing direction.
      */}
      <Path
        d={`M ${MID_X - D_HALF} ${PEN_D} A ${ARC_R} ${ARC_R} 0 0 0 ${MID_X + D_HALF} ${PEN_D}`}
        {...common}
      />

      {/* ---- Bottom goal (the away side defends this one) ---- */}
      <Rect x={PEN_X} y={PITCH_L - PEN_D} width={PEN_W} height={PEN_D} {...common} />
      <Rect x={SIX_X} y={PITCH_L - SIX_D} width={SIX_W} height={SIX_D} {...common} />
      <Circle cx={MID_X} cy={PITCH_L - SPOT} r={0.5} fill={stroke} stroke="none" />
      {/* Mirrored, so the angle increases instead — hence sweep flag 1. */}
      <Path
        d={`M ${MID_X - D_HALF} ${PITCH_L - PEN_D} A ${ARC_R} ${ARC_R} 0 0 1 ${MID_X + D_HALF} ${PITCH_L - PEN_D}`}
        {...common}
      />

      {/* Corner arcs — a metre, and the detail that makes it read as a pitch.
          Each is struck from the touchline's own rounding, so it meets the line
          at both ends however wide the card turns out to be. */}
      <Path d={cornerArcPath(r, r, FACING.topLeft, r)} {...common} />
      <Path d={cornerArcPath(PITCH_W - r, r, FACING.topRight, r)} {...common} />
      <Path d={cornerArcPath(r, PITCH_L - r, FACING.bottomLeft, r)} {...common} />
      <Path d={cornerArcPath(PITCH_W - r, PITCH_L - r, FACING.bottomRight, r)} {...common} />
    </Svg>
  );
}
