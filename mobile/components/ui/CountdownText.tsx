import { type TextStyle } from 'react-native';
import { useAnimatedProps } from 'react-native-reanimated';

import { AnimatedTextBox } from './AnimatedTextBox';
import { formatCountdown } from '@/lib/countdownFormat';
import { type CountdownClock } from '@/lib/useCountdown';

// =============================================================
// A countdown that never re-renders
// =============================================================
// The digits change on the UI thread with no React commit, because a commit
// stalls every Reanimated animation on the screen until it has mounted — see
// `lib/useCountdown.ts` for the mechanism and `AnimatedTextBox` for the trick.
//
// This file is now only the COUNTDOWN half: the face, and what to size by.
//
// ⚠ ONE FACE, NOT A `format` PROP. Ryan, 2026-10-04: `2d 04h 11m`, then
// `4h 11m 09s`, then `11m 09s 83`, switching on its own as the time runs down —
// see `lib/countdownFormat.ts`. It replaced a choice between `HH:MM:SS` and
// `2d HH:MM:SS` that each caller had to get right.
// =============================================================

export function CountdownText({
  clock,
  style,
  accessibilityLabel,
}: {
  clock: CountdownClock;
  style?: TextStyle;
  accessibilityLabel?: string;
}) {
  /**
   * ⚠ `Date.now()` IN RENDER, DELIBERATELY. It is how the sizer is seeded without
   * reading the shared value during render.
   *
   * ⚠ The property to preserve is `sizer >= displayed`, not a render count: this
   * is read at a moment no later than the digits it is sizing, and inside one
   * band a countdown only ever gets shorter, so it holds however often this
   * re-renders. ACROSS a band it does not — `1d 00h 00m` is narrower than the
   * `23h 59m 59s` after it — which is why `useCountdownClock` commits once at
   * each crossing, and this line runs again with the new face.
   *
   * ⚠ NaN-safe: a caller should only mount this while `clock.running`, but a
   * missing target must render zeros rather than `NaNm NaNs NaN`.
   */
  const sizerText = formatCountdown(Number.isNaN(clock.target) ? 0 : Math.max(0, clock.target - Date.now()));

  const animatedProps = useAnimatedProps(() => {
    'worklet';
    return { text: formatCountdown(clock.remaining.value) } as unknown as Record<string, unknown>;
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
