import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, Text as RNText, View } from 'react-native';

import { hapticSelection, hapticWarning } from '@/lib/haptics';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Props = {
  value: number | null;
  onChange: (next: number) => void;
  disabled?: boolean;
  /**
   * Narrower than the World Cup's 48 where the row has more to carry.
   *
   * ⚠ Optional with the original default, so no World Cup screen moves. The
   * league's Scores card puts a club name AND a crest either side of these two
   * fields, and "Bournemouth" — the longest club name that cannot wrap, at 11
   * characters — needs the six points this gives back.
   */
  width?: number;
};

export function TapScoreField({ value, onChange, disabled, width = 48 }: Props) {
  const theme = useTheme();
  const filled = value !== null;
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (filled || disabled) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.9,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [filled, disabled, pulse]);

  function tap() {
    if (disabled) return;
    // Light tick on every tap — the score field should feel like a physical
    // stepper. Fires before onChange so the tactile response lines up with the
    // visual update (state batching defers the re-render by a frame anyway).
    //
    // ⚠⚠ WAS `impactAsync(Light)`, AND ANDROID WAS THE PROBLEM. That call writes
    // a 50ms raw waveform, and this field cycles 0→15 — reaching 9 is nine taps,
    // so nine overlapping waveforms, which on a rotating-mass motor is a rattle
    // rather than nine ticks. `hapticSelection` is the OEM's own scrub tick.
    hapticSelection();
    const next = ((value ?? -1) + 1) % 16;
    onChange(next);
  }

  function longPressReset() {
    if (disabled) return;
    // ⭐ STAYS A PATTERN, deliberately. The two-tap rhythm is what says "you did
    // the bigger action" without looking, and it has to stay distinguishable
    // from the single tick above — so this is the one call in this file that
    // still wants the waveform on both platforms. See `hapticWarning`.
    hapticWarning();
    onChange(0);
  }

  return (
    <Pressable
      onPress={tap}
      onLongPress={longPressReset}
      disabled={disabled}
      delayLongPress={400}
      style={({ pressed }) => ({
        width,
        height: 44,
        borderRadius: 10,
        backgroundColor: filled
          ? withOpacity(theme.colors.primary, 0.18)
          : theme.colors.mist,
        borderWidth: filled ? 1 : 0,
        borderColor: filled ? withOpacity(theme.colors.primary, 0.35) : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : disabled ? 0.55 : 1,
      })}
    >
      {filled ? (
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 18,
            fontWeight: '800',
            color: theme.colors.ink,
          }}
        >
          {value}
        </RNText>
      ) : (
        <Animated.View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: theme.colors.slate,
            opacity: pulse,
          }}
        />
      )}
    </Pressable>
  );
}
