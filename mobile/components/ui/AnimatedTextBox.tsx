import { StyleSheet, TextInput, type TextStyle } from 'react-native';
import Animated, { type useAnimatedProps } from 'react-native-reanimated';

import { Text } from './Text';

// =============================================================
// Text that changes without a React commit
// =============================================================
// ⚠⚠ THE WHOLE REASON THIS IS A `TextInput` AND NOT A `Text`.
//
// On iOS every React commit pauses Reanimated until it has mounted, and the
// animated values for those frames are never applied — the mechanism is written
// out in `lib/useCountdown.ts`. Text in a `Text` has to commit to change, so any
// ticking label stalls every animation on the screen for as long as its commit
// takes. A clock did exactly that to the Showdown band, once a second, the whole
// time you dragged.
//
// `TextInput` is the one RN primitive whose text can be set as an ANIMATED PROP,
// so the characters change on the UI thread with no commit at all.
//
// ## ⚠ THE CALLER OWNS THE WORKLET, AND THAT IS DELIBERATE
//
// This takes `animatedProps` already built rather than a formatter function. A
// formatter passed as a prop would have to be a worklet, and a plain arrow in a
// component body does NOT become one just because it carries the directive —
// that was checked in the Metro bundle and it was absent, which throws on the UI
// thread the moment the value changes. Handing over finished `animatedProps`
// removes the footgun entirely.
//
// ⚠ DO NOT "SIMPLIFY" ANY OF THIS BACK TO A `Text` WITH A TICKING `useState`.
// That is what it replaced.
// =============================================================

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * ⭐ THE SIZER, AND IT IS WHAT MAKES THE BOX HOLD STILL.
 *
 * An animated `text` prop is applied straight to the native view, so the shadow
 * tree never learns the string changed — which means the input's MEASURED width
 * is frozen at whatever it mounted with. Left alone that is a bug the moment the
 * string changes length, and the shorter text sits left-aligned in a box still
 * sized for the longer one.
 *
 * So the width is established by an invisible `Text` behind the input, and the
 * input is centred over it.
 *
 * ⚠ `sizerText` MUST BE THE WIDEST STRING THE CALLER CAN PRODUCE between React
 * renders. For a countdown that is simply the current value, because a countdown
 * only ever gets shorter. For a clock whose seconds tick 00→59 inside a fixed
 * `MM:` prefix it is any value, because the width does not move at all. Whenever
 * the surrounding text DOES change, that change came through props — so a render
 * happens and the sizer is re-measured with it.
 */
export function AnimatedTextBox({
  animatedProps,
  sizerText,
  style,
  accessibilityLabel,
}: {
  /**
   * Built by the caller with `useAnimatedProps`, returning `{ text }`.
   *
   * ⚠ Typed as what the hook HANDS BACK rather than as `{ text: string }`.
   * Reanimated brands its animated props, and `text` is not in `TextInputProps`
   * at all — it is the native prop the animated path writes. The same shape
   * `ShowdownDuelHeader` uses for its animated styles.
   */
  animatedProps: ReturnType<typeof useAnimatedProps>;
  /** The widest string this box can show before the next React render. */
  sizerText: string;
  /**
   * The same style the `Text` it replaced carried. Font, size, line height and
   * colour all come from here — nothing is baked in but the props that neutralise
   * `TextInput`'s own chrome.
   */
  style?: TextStyle;
  accessibilityLabel?: string;
}) {
  return (
    <Animated.View>
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
            // padding and vertical alignment. Without these three the characters
            // sit a couple of points off where the `Text` had them.
            padding: 0,
            textAlign: 'center',
            textAlignVertical: 'center',
            includeFontPadding: false,
          },
        ]}
      />
    </Animated.View>
  );
}
