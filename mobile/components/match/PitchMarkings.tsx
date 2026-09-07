import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

// =============================================================
// A football pitch, to scale
// =============================================================
// ⚠ THE VIEWBOX IS IN METRES, AND EVERY MARKING IS ITS REAL SIZE: a penalty
// area is 40.32 × 16.5, a six-yard box 18.32 × 5.5, the spot 11 out and every
// arc 9.15. Drawing them any other way means guessing at proportions a viewer
// has seen ten thousand times and will notice being wrong.
//
// ⚠ THE LENGTH, HOWEVER, IS DELIBERATELY LONGER THAN A REAL PITCH — 126m drawn
// against 105m real. Ryan asked for more height, and there are two ways to get
// it. Stretching the whole drawing is the obvious one and is wrong: it turns
// the centre circle into an ellipse and deepens the penalty areas, so every
// shape a viewer knows becomes subtly incorrect. Adding GRASS instead leaves
// each marking exactly right and simply puts more midfield between the boxes,
// which is also the space the formation needed. `PITCH_L` is the only
// fictional number in this file; a real pitch is 105.
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
// =============================================================

/** The pitch's real width in metres. Every marking below is sized in metres too. */
export const PITCH_W = 68;

/**
 * The length we actually draw.
 *
 * ⚠ FICTIONAL, AND THE ONLY FICTIONAL NUMBER IN THIS FILE. It buys vertical
 * room for the two elevens without distorting a single marking: the extra 21m
 * all lands in midfield, between two penalty areas that stay 16.5 deep and
 * either side of a centre circle that stays round.
 */
export const PITCH_L = 126;

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

export function PitchMarkings({ stroke = 'rgba(255,255,255,0.30)' }: { stroke?: string }) {
  const common = { stroke, strokeWidth: 0.35, fill: 'none' } as const;

  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${PITCH_W} ${PITCH_L}`}
      // ⚠ The container is laid out at exactly this viewBox's ratio, so nothing
      // is stretched — which is the whole reason the extra length is drawn as
      // grass rather than taken by scaling. Stretching would turn the centre
      // circle into an ellipse, the one marking everybody knows the shape of.
      preserveAspectRatio="xMidYMid meet"
      pointerEvents="none"
    >
      {/* Touchlines. Inset by half a stroke so the line is not clipped. */}
      <Rect x={0.2} y={0.2} width={PITCH_W - 0.4} height={PITCH_L - 0.4} rx={0.6} {...common} />

      {/* Halfway line, centre circle, centre spot. */}
      <Line x1={0} y1={PITCH_L / 2} x2={PITCH_W} y2={PITCH_L / 2} {...common} />
      <Circle cx={MID_X} cy={PITCH_L / 2} r={ARC_R} {...common} />
      <Circle cx={MID_X} cy={PITCH_L / 2} r={0.5} fill={stroke} stroke="none" />

      {/* ---- Top goal (the away side defends this one) ---- */}
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

      {/* ---- Bottom goal (the home side defends this one) ---- */}
      <Rect x={PEN_X} y={PITCH_L - PEN_D} width={PEN_W} height={PEN_D} {...common} />
      <Rect x={SIX_X} y={PITCH_L - SIX_D} width={SIX_W} height={SIX_D} {...common} />
      <Circle cx={MID_X} cy={PITCH_L - SPOT} r={0.5} fill={stroke} stroke="none" />
      {/* Mirrored, so the angle increases instead — hence sweep flag 1. */}
      <Path
        d={`M ${MID_X - D_HALF} ${PITCH_L - PEN_D} A ${ARC_R} ${ARC_R} 0 0 1 ${MID_X + D_HALF} ${PITCH_L - PEN_D}`}
        {...common}
      />

      {/* Corner arcs — 1m, and the detail that makes it read as a pitch. */}
      <Path d={`M 0 1 A 1 1 0 0 0 1 0`} {...common} />
      <Path d={`M ${PITCH_W - 1} 0 A 1 1 0 0 0 ${PITCH_W} 1`} {...common} />
      <Path d={`M 0 ${PITCH_L - 1} A 1 1 0 0 1 1 ${PITCH_L}`} {...common} />
      <Path d={`M ${PITCH_W - 1} ${PITCH_L} A 1 1 0 0 1 ${PITCH_W} ${PITCH_L - 1}`} {...common} />
    </Svg>
  );
}
