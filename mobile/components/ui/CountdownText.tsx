import { StyleSheet, TextInput, View, type TextStyle } from 'react-native';
import Animated, { useAnimatedProps } from 'react-native-reanimated';

import { Text } from './Text';
import { type CountdownClock, formatDhms, formatHms } from '@/lib/useCountdown';

// =============================================================
// A CLOCK THAT NEVER RE-RENDERS
// =============================================================
// ⚠⚠ THE WHOLE REASON THIS IS A `TextInput` AND NOT A `Text`.
//
// On iOS, every React commit pauses Reanimated until it has mounted, and the
// animated values for those frames are never applied — see the long note in
// `lib/useCountdown.ts`. A clock in `Text` has to commit to change its digits,
// so a clock sitting inside the Showdown band stalled the band's collapse once a
// second, the whole time you dragged.
//
// `TextInput` is the one RN primitive whose text can be set as an ANIMATED PROP,
// which means the digits change on the UI thread with no commit at all. It is a
// well-worn trick; it is here for a measured reason, not for style.
//
// ⚠ DO NOT "SIMPLIFY" THIS BACK TO A `Text` WITH A TICKING `useState`. That is
// what it replaced.
// =============================================================

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * ⭐ THE SIZER, AND IT IS WHAT MAKES THE BOX HOLD STILL.
 *
 * An animated `text` prop is applied straight to the native view, so the shadow
 * tree never learns the string changed — which means the input's MEASURED width
 * is frozen at whatever it mounted with. Left alone that is a bug the moment the
 * string changes length: `formatDhms` drops its `19d ` prefix after the first
 * day, and the shorter time would sit left-aligned in a box still sized for the
 * longer one.
 *
 * So the width is established by an invisible `Text` behind the input, and the
 * input is centred over it.
 *
 * ⚠ THE STRING TO SIZE BY IS THE ONE ON SCREEN RIGHT NOW, because a countdown
 * only ever gets SHORTER. No widest-case constant to keep in sync, and no
 * re-measure to schedule — the invariant does the work.
 *
 * ⚠ THE PROPERTY TO PRESERVE IS `sizer >= displayed`, NOT A RENDER COUNT. The
 * sizer is read at a moment no later than the digits it is sizing, and the digits
 * only shrink — so it holds however often this re-renders, and equally if it never
 * does. (In practice the React Compiler caches it on `clock.target`, so it is
 * computed once per target; verified in the Metro bundle. Do not depend on that
 * either way — depend on the invariant.)
 */
export function CountdownText({
  clock,
  format,
  style,
  accessibilityLabel,
}: {
  clock: CountdownClock;
  /** `HH:MM:SS` for a wait measured in hours, `2d 04:11:09` for one measured in days. */
  format: 'hms' | 'dhms';
  /**
   * The same style the `Text` it replaced carried. Font, size, line height and
   * colour all come from here — nothing is baked in but the props that neutralise
   * `TextInput`'s own chrome.
   */
  style?: TextStyle;
  accessibilityLabel?: string;
}) {
  const fmt = format === 'dhms' ? formatDhms : formatHms;

  /**
   * ⚠ `Date.now()` IN RENDER, DELIBERATELY. It is how the sizer is seeded without
   * reading the shared value during render, and the invariant above is what makes
   * it safe to re-read on every render rather than only on the first.
   *
   * ⚠ NaN-safe: a caller should only mount this while `clock.running`, but a
   * missing target must render zeros rather than `NaN:NaN:NaN`.
   */
  const sizerText = fmt(Number.isNaN(clock.target) ? 0 : Math.max(0, clock.target - Date.now()));

  const animatedProps = useAnimatedProps(() => {
    'worklet';
    // `text` is not in `TextInputProps` — it is the native prop the animated
    // path writes. The cast is the standard shape for this trick.
    return { text: fmt(clock.remaining.value) } as unknown as Record<string, unknown>;
  });

  return (
    <View>
      <Text
        style={[style, { opacity: 0 }]}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {sizerText}
      </Text>
      <AnimatedTextInput
        // ⚠ Read-only in every sense: no focus, no caret, no selection, no
        // keyboard. It is a label that happens to be a text field.
        editable={false}
        selectTextOnFocus={false}
        underlineColorAndroid="transparent"
        defaultValue={sizerText}
        animatedProps={animatedProps}
        accessibilityLabel={accessibilityLabel}
        style={[
          style,
          StyleSheet.absoluteFill,
          {
            // ⚠ `TextInput` brings its own padding and, on Android, its own font
            // padding and vertical alignment. Without these three the digits sit
            // a couple of points off where the `Text` had them.
            padding: 0,
            textAlign: 'center',
            textAlignVertical: 'center',
            includeFontPadding: false,
          },
        ]}
      />
    </View>
  );
}
