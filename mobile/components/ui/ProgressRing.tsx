import { Text as RNText, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { Icon } from './Icon';
import { useTheme } from '@/theme';

/**
 * How far through the current decision this member is.
 *
 * ⚠ IT IS AN ARC, NOT A BORDER. What this replaced drew a full circle in one
 * of three colours with the count inside — so three fixtures into ten and nine
 * into ten looked identical, and the only thing carrying progress was a number
 * at 8px. The arc says it before the number is read.
 *
 * ⚠ ONE COPY, TWO CARDS. This shipped on the home card on 2026-09-02 and was
 * left as a private function there; the pools tab kept the old flat circle for
 * three more days because there was nothing to import. It lives here now so
 * the two cards cannot say different things about the same number.
 *
 * ## What the two numbers mean depends on the competition
 *
 * A World Cup ring counts the whole tournament; a league ring counts the OPEN
 * MATCHWEEK, because "12 of 380" is true and useless. Both arrive here already
 * decided — see `predictionsTotal` in useHomeData.
 *
 * ⚠ `singleDecision` IS NOT `total === 1`. Table mode and Last Man Standing are
 * one decision for the season, and inferring that from the denominator would
 * also catch a real one-fixture matchweek — which the floor of 5 makes possible
 * after a re-home. The server says which it is.
 */
export function ProgressRing({
  completed,
  total,
  singleDecision,
  accent,
  size = 24,
  stroke = 2.5,
}: {
  completed: number;
  total: number;
  singleDecision: boolean;
  accent: string;
  size?: number;
  stroke?: number;
}) {
  const theme = useTheme();

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const isComplete = total > 0 && completed >= total;
  const pct = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;

  // A count is only worth printing while it is genuinely part-way. Complete
  // shows the tick; nothing started shows an empty ring, which says it without
  // a "0"; and a single decision has no count worth showing at either end.
  const label = !isComplete && !singleDecision && completed > 0 ? String(completed) : null;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.mist}
          strokeWidth={stroke}
          fill="none"
        />
        {pct > 0 ? (
          // ⚠ A <G> WITH `rotation`/`origin`, NOT an SVG `transform` string.
          // `transform="rotate(-90 12 12)"` is valid SVG and react-native-svg
          // silently ignored it — the arc started at three o'clock, which is
          // the un-rotated default, so it looked like a design choice rather
          // than a dropped prop. These are the library's own props and they
          // take effect. Verified on device, 2026-09-02.
          <G rotation={-90} originX={size / 2} originY={size / 2}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={accent}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              // Counts DOWN from a full circle, so 0 progress draws nothing.
              strokeDashoffset={circumference * (1 - pct)}
            />
          </G>
        ) : null}
      </Svg>

      {isComplete ? (
        // `tint`, not `color` — the latter takes a theme token name and the
        // accent here is a competition's raw hex.
        <Icon name="checkmark" size={Math.round(size * 0.5)} tint={accent} />
      ) : label ? (
        <RNText
          style={{
            fontFamily: 'Nunito_700Bold',
            fontSize: Math.max(8, Math.round(size * 0.34)),
            color: theme.colors.ink,
          }}
        >
          {label}
        </RNText>
      ) : null}
    </View>
  );
}
