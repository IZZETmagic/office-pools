// Branded landing screen shown while the app prefetches Home + Pools +
// Activity + Tournament Matches data on cold launch. Solid #0B0F1A
// background matches the native splash's `backgroundColor` in app.json
// so the native→JS hand-off has no color jump. Trophy is the Hugeicons
// ChampionIcon (vector, naturally backgroundless) rendered in the gold
// accent. Two-tone "SportPool" wordmark in Nunito. Timing: 0.5s entrance,
// 1.5s bob, 0.4s dot cycle, 0.4s exit fade.

const SPLASH_BG = '#0B0F1A';

import { ChampionIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { fontFamilies, useTheme } from '@/theme';

type Props = {
  preloadComplete: boolean;
  onDismissed: () => void;
};

// Hand-off from the native splash to this custom one. Called once on mount
// so there's no flash of empty screen between the two.
function hideNativeSplash() {
  SplashScreen.hideAsync().catch(() => {
    /* may already be hidden */
  });
}

export function Splash({ preloadComplete, onDismissed }: Props) {
  const theme = useTheme();
  const fadeIn = useSharedValue(0);
  const scale = useSharedValue(0.8);
  const bobY = useSharedValue(0);
  const rootOpacity = useSharedValue(1);

  const [dotPhase, setDotPhase] = useState(0);

  // Native-splash hand-off + entrance + bob.
  useEffect(() => {
    hideNativeSplash();

    fadeIn.value = withTiming(1, {
      duration: 500,
      easing: Easing.out(Easing.ease),
    });
    scale.value = withTiming(1, {
      duration: 500,
      easing: Easing.out(Easing.ease),
    });
    bobY.value = withDelay(
      500,
      withRepeat(
        withTiming(-8, {
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true,
      ),
    );
  }, [fadeIn, scale, bobY]);

  // Dot cycle: phase bounces 0 → 1 → 2 → 1 → 0, matching the Swift timer.
  useEffect(() => {
    let direction = 1;
    const id = setInterval(() => {
      setDotPhase((prev) => {
        if (prev === 2) direction = -1;
        else if (prev === 0) direction = 1;
        return prev + direction;
      });
    }, 400);
    return () => clearInterval(id);
  }, []);

  // Fade-out + dismiss callback once preload completes.
  useEffect(() => {
    if (!preloadComplete) return;
    rootOpacity.value = withTiming(
      0,
      { duration: 400, easing: Easing.inOut(Easing.ease) },
      (finished) => {
        if (finished) runOnJS(onDismissed)();
      },
    );
  }, [preloadComplete, rootOpacity, onDismissed]);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value,
    transform: [{ scale: scale.value }, { translateY: bobY.value }],
  }));

  const fadeInStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value,
  }));

  const rootStyle = useAnimatedStyle(() => ({
    opacity: rootOpacity.value,
  }));

  return (
    <Animated.View
      pointerEvents={preloadComplete ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, { backgroundColor: SPLASH_BG }, rootStyle]}
    >
      <StatusBar style="light" />
      <View style={styles.center}>
        <Animated.View style={iconStyle}>
          <HugeiconsIcon
            icon={ChampionIcon}
            size={128}
            color={theme.colors.accent}
            strokeWidth={1.25}
          />
        </Animated.View>
        <Animated.View style={[styles.wordmark, fadeInStyle]}>
          <Text style={[styles.word, { color: '#FFFFFF' }]}>Sport</Text>
          <Text style={[styles.word, { color: theme.colors.primary }]}>Pool</Text>
        </Animated.View>
      </View>
      <Animated.View style={[styles.dots, fadeInStyle]}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: theme.colors.primary,
                opacity: dotPhase === i ? 1 : 0.3,
                transform: [{ scale: dotPhase === i ? 1.2 : 1 }],
              },
            ]}
          />
        ))}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  word: {
    fontFamily: fontFamilies.black,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -0.5,
  },
  dots: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
