import { type TextStyle } from 'react-native';
import { useAnimatedProps } from 'react-native-reanimated';

import { AnimatedTextBox } from './AnimatedTextBox';
import { type CountdownClock, formatDhms, formatHms } from '@/lib/useCountdown';

// =============================================================
// A countdown that never re-renders
// =============================================================
// The digits change on the UI thread with no React commit, because a commit
// stalls every Reanimated animation on the screen until it has mounted — see
// `lib/useCountdown.ts` for the mechanism and `AnimatedTextBox` for the trick.
//
// This file is now only the COUNTDOWN half: which formatter, and what to size by.
// =============================================================

export function CountdownText({
  clock,
  format,
  style,
  accessibilityLabel,
}: {
  clock: CountdownClock;
  /** `HH:MM:SS` for a wait measured in hours, `2d 04:11:09` for one measured in days. */
  format: 'hms' | 'dhms';
  style?: TextStyle;
  accessibilityLabel?: string;
}) {
  const fmt = format === 'dhms' ? formatDhms : formatHms;

  /**
   * ⚠ `Date.now()` IN RENDER, DELIBERATELY. It is how the sizer is seeded without
   * reading the shared value during render.
   *
   * ⚠ The property to preserve is `sizer >= displayed`, not a render count: this
   * is read at a moment no later than the digits it is sizing, and a countdown
   * only ever gets shorter, so it holds however often this re-renders.
   *
   * ⚠ NaN-safe: a caller should only mount this while `clock.running`, but a
   * missing target must render zeros rather than `NaN:NaN:NaN`.
   */
  const sizerText = fmt(Number.isNaN(clock.target) ? 0 : Math.max(0, clock.target - Date.now()));

  const animatedProps = useAnimatedProps(() => {
    'worklet';
    return { text: fmt(clock.remaining.value) } as unknown as Record<string, unknown>;
  });

  return (
    <AnimatedTextBox
      animatedProps={animatedProps}
      sizerText={sizerText}
      style={style}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
