import { useMemo } from 'react';
import { Text as RNText, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { clubInk } from '@/lib/design/clubColors';
import { fontFamilies } from '@/theme';

// =============================================================
// The shirt a player wears on the line-ups pitch
// =============================================================
// ⚠ IT REPLACED A PHOTOGRAPH (2026-09-19). Every face on this pitch was a
// squad photo served by the fixtures provider, and three separate rights stack
// on one of those: the photographer's copyright, the player's own personality
// or passing-off rights, and data protection. The provider holds none of them.
// See drafts/2026-09-13_ip_exposure_audit.md §3 — it is the highest-risk item
// in that document, and the shirt is what the app draws instead.
//
// ⚠ THE SHAPE IS GENERATED, NOT DRAWN BY HAND. Two hand-built attempts read as
// bubbles and then as ears; this is Recraft's native-vector output with the
// white ground and its baked-in number stripped, and a 6.5% waist bowed into it
// (Ryan's call). Source of truth: assets/jersey-explore/jersey-outfield.svg.
//
// ⚠⚠ INLINED, AND A GUARD TEST PINS IT. Metro has no SVG transformer
// configured — the same reason the old World Cup rail mark was inlined — so
// this is a COPY of that file and `lib/design/__tests__/jerseyAsset.guard.test.ts`
// fails if the two drift.
// =============================================================

/** The jersey body, `currentColor` and all, copied from the asset. */
const JERSEY_INNER = `<g transform="translate(26.98 39.91) scale(0.9726)"> <path transform="translate(0,0)" fill="currentColor" d="M 805.72 268.331 C 815.61 267.505 828.24 269.476 837.14 274.155 C 867.84 290.292 860.36 318.501 870.08 344.886 C 886.51 389.488 913.95 420.038 956.55 440.097 C 995.81 458.459 1040.74 460.564 1081.54 445.954 C 1128.72 428.831 1167.74 389.56 1182.33 341.057 C 1186.56 326.989 1186.97 308.782 1193.25 296.176 C 1199.43 284.018 1210.29 274.89 1223.32 270.88 C 1234.28 267.643 1245.90 267.42 1256.98 270.233 C 1267.42 272.799 1281.83 279.015 1292.02 283.148 L 1346.80 305.292 L 1463.06 352.173 C 1488.08 362.172 1516.61 372.159 1540.11 384.616 C 1614.73 424.173 1674.18 500.8 1689.02 584.485 C 1692.04 601.521 1695.35 618.527 1698.56 635.524 L 1722.29 756.714 L 1744.90 869.851 C 1748.26 886.592 1755.14 916.408 1753.36 932.301 C 1751.79 947.518 1745.88 962.693 1736.38 976.01 C 1720.07 998.671 1698.24 1008.47 1673.50 1014.53 C 1651.29 1019.98 1629.09 1025.49 1606.99 1031 C 1558.90 1043.03 1511.14 1055.57 1463.74 1068.62 L 1453.38 1515.55 L 1463.11 1652.5 C 1465.42 1678.73 1467.85 1705.65 1469.61 1731.88 C 1470.15 1739.88 1468.86 1749.66 1466.60 1757.03 C 1459.80 1778.93 1446.00 1792.05 1425.67 1801.26 C 1416.09 1804.2 1406.94 1805.81 1396.62 1805.75 C 1365.22 1805.57 1333.79 1805.2 1302.42 1805.32 L 885.28 1805.36 L 722.18 1805.97 C 713.07 1806.02 703.90 1806.19 694.80 1806.12 C 656.59 1805.78 623.59 1812.13 596.55 1782.55 C 586.15 1770.9 580.10 1755.86 579.23 1739.59 C 578.66 1727.49 583.31 1687.87 584.61 1673.81 L 594.85 1540.68 L 585.89 1068.75 C 534.60 1053.76 482.05 1041.56 429.84 1027.73 C 406.01 1021.06 379.73 1017.11 356.14 1008.84 C 323.26 997.374 295.11 959.995 296.35 926.532 C 299.17 904.305 303.84 882.858 308.57 860.997 L 333.08 745.113 L 355.46 639.459 C 370.80 565.706 377.74 517.729 426.48 456.986 C 447.72 430.474 473.62 408.059 502.91 390.84 C 527.70 376.241 561.47 364.251 588.63 353.381 L 701.30 307.888 C 719.68 300.56 790.28 270.043 805.72 268.331 z"/> <path transform="translate(0,0)" fill="currentColor" d="M 1142.87 768.33 C 1160.47 766.198 1177.04 769.93 1191.62 779.855 C 1227.26 804.104 1222.13 840.678 1222.15 877.721 L 1218.98 984.356 L 1214.39 1094.83 C 1213.73 1112.85 1213.75 1133.22 1211.78 1151.1 C 1208.43 1182.5 1183.00 1206.31 1154.12 1211.16 C 1113.59 1216.02 1078.22 1185.24 1078.55 1141.66 C 1078.63 1131.28 1078.71 1120.89 1078.83 1110.51 L 1079.62 1039.93 L 1081.21 903.459 C 1081.19 879.207 1080.36 854.534 1082.02 830.378 C 1084.31 797.099 1111.08 773.322 1142.87 768.33 z"/> </g>`;

/**
 * ⚠ THE FILL IS SUBSTITUTED, NOT INHERITED. `react-native-svg` resolves
 * `currentColor` from a `color` prop, but doing it by string means the markup
 * that reaches the renderer is already concrete — no prop threading, and the
 * same string is memoised per colour rather than rebuilt for all twenty-two
 * players on every render.
 */
function jerseyXml(colour: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048">${JERSEY_INNER.split(
    'currentColor',
  ).join(colour)}</svg>`;
}

/**
 * How big the number is, in points, whatever the shirt is.
 *
 * ⚠⚠ A FIXED SIZE, NOT A FRACTION OF `size` — and that is the whole point
 * (Ryan, 2026-09-19). It was `size * 0.34`, so growing the shirt from 48 to 56
 * grew the number with it and the two-digit problem came back unchanged, just
 * larger. Pinning the type is what converts extra shirt into extra ROOM: 16.3
 * is exactly what a 48pt shirt used to carry, so `44` reads as it always did
 * and now has 8pt more chest around it.
 *
 * ⚠ SO THE SHIRT MAY GROW AGAIN AND THIS MUST NOT FOLLOW IT. If a number ever
 * needs to be bigger, that is a separate decision taken here, on its own.
 */
const NUMBER_PT = 16.3;

export function Jersey({
  colour,
  number,
  position,
  size,
  label: labelOverride,
  labelPt,
}: {
  colour: string;
  /** The shirt number. Null falls back to the position letter. */
  number: number | null | undefined;
  position: string | null | undefined;
  size: number;
  /**
   * Something other than a shirt number on the chest.
   *
   * ⚠ ADDED FOR THE LAST MAN STANDING WALL (Ryan, 2026-09-20), which prints a
   * CLUB on the shirt rather than a player — "ARS", not "10". The shape is the
   * same object doing the same job; only the thing being identified changes.
   */
  label?: string | null;
  /**
   * ⚠ AND THE TYPE HAS TO MOVE WITH IT. `NUMBER_PT` is fixed at 16.3 on purpose
   * — see below — but that number was chosen for TWO DIGITS on a 56pt pitch
   * shirt. Three letters in a 30pt wall cell is a different problem, and
   * forcing it through the pitch's constant would either overflow the chest or
   * force the wall to grow. The default is unchanged, so the pitch is untouched.
   */
  labelPt?: number;
}) {
  const xml = useMemo(() => jerseyXml(colour), [colour]);
  const label = labelOverride ?? (number != null ? String(number) : (position ?? '\u00b7'));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <SvgXml xml={xml} width={size} height={size} />
      {/* ⚠ THE NUMBER IS RN TEXT ON TOP, not SVG <Text>. The app's Nunito is
          loaded through expo-font and react-native-svg does not see it, so an
          SVG label would silently fall back to the system face — beside eleven
          RN-rendered surnames that would read as a bug.

          ⚠ AND ITS COLOUR FOLLOWS THE SHIRT. A Leeds or Dortmund jersey is
          yellow; white on it is unreadable. See `clubInk`. */}
      <RNText
        style={{
          position: 'absolute',
          // ⚠⚠ A CLUB CODE RIDES HIGHER THAN A SHIRT NUMBER, and it has to.
          // Measured off the artwork's own path: below the armpit — which is at
          // 52% of the box — the shirt is only its TORSO, 41.5% of the width.
          // At 30pt that is 12.4pt of colour against "WHU" at 21.5pt, so the
          // outer letters landed on the white cell behind and simply
          // disappeared: "CHE" read as "CHF" on Ryan's screen. Across the chest,
          // where the sleeves are still in the shape, there is 69.2% to play
          // with — 26.3pt at 38 — and three letters fit on colour.
          //
          // ⚠ A NUMBER KEEPS THE LOWER POSITION. It is one or two characters on
          // a 56pt pitch shirt, it has never needed the sleeves, and it looks
          // right where it is. So the offset follows what is being drawn rather
          // than taking a fourth prop: a club mark sits where a crest sits, a
          // number sits where a number sits.
          marginTop: labelOverride != null ? -size * 0.06 : size * 0.08,
          fontFamily: fontFamilies.black,
          // ⚠ THE PLACEMENT SCALES BUT THE TYPE DOES NOT. `marginTop` is a
          // fraction because the chest it sits on moves with the shirt; the
          // size is a constant because the number is the thing being read.
          fontSize: labelPt ?? NUMBER_PT,
          color: clubInk(colour),
        }}
      >
        {label}
      </RNText>
    </View>
  );
}
