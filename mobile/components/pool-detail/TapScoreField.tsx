import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, Text as RNText, View } from 'react-native';

import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Props = {
  value: number | null;
  onChange: (next: number) => void;
  disabled?: boolean;
};

export function TapScoreField({ value, onChange, disabled }: Props) {
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
    // Light haptic on every tap — gives the score field the same "snappy"
    // feel as a physical stepper. Fires before onChange so the tactile
    // response lines up with the visual update (state batching defers the
    // re-render by a frame anyway).
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
      /* haptics unavailable on simulator / older devices */
    });
    const next = ((value ?? -1) + 1) % 16;
    onChange(next);
  }

  function longPressReset() {
    if (disabled) return;
    // Heavier double-pulse haptic on long-press reset. iOS Warning
    // notification pattern is a built-in two-tap rhythm that feels
    // distinctly different from the single Light impact used on tap —
    // signals "you just did the bigger action" without needing to read
    // the screen. On Android the same call maps to a pattern vibration.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {
      /* haptics unavailable */
    });
    onChange(0);
  }

  return (
    <Pressable
      onPress={tap}
      onLongPress={longPressReset}
      disabled={disabled}
      delayLongPress={400}
      style={({ pressed }) => ({
        width: 48,
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
