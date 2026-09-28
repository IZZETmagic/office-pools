// Launch screen. The two-tone wordmark on the brand's dark ground, and
// nothing else.
//
// ⚠ IT IS THE SAME SCREEN AS THE NATIVE SPLASH, WHICH IS THE WHOLE POINT. The
// OS paints `#0B0F1A` from `app.json` before a line of JS runs; this paints the
// same colour and adds the wordmark. Because the ground never changes, the two
// layers read as ONE screen that gains a wordmark and then dissolves — rather
// than as two screens handing over, which is what a trophy on one and a trophy
// plus a wordmark plus three dots on the other actually looked like.
//
// ⚠ NO LOADING DOTS. There were three of them, bouncing, and they were the
// honest part of a slower app — they said "we are fetching" while the fetch was
// happening. The fetch now resolves from disk on a warm start, so dots would be
// the app PERFORMING a wait it no longer has. A progress indicator for progress
// that isn't being made is just decoration that makes things feel slower.
//
// ⚠ THE DARK GROUND IS LOAD-BEARING, not a leftover. The wordmark is two-tone:
// "Sport" in white, "Pool" in the brand blue. On a blue ground the second half
// of the name disappears. Any change of ground has to answer for the wordmark
// first.

const SPLASH_BG = '#0B0F1A';

import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Wordmark } from '@/components/ui/Wordmark';

type Props = {
  /**
   * Whether the app's typefaces have loaded.
   *
   * ⚠ The tree mounts BEFORE they do, so that the session restore and the data
   * prefetch can start instead of queueing behind seven font loads. This screen
   * is a wordmark and nothing else, so until the fonts land there is literally
   * nothing for it to draw — it holds the native splash in front instead.
   */
  fontsReady: boolean;
  preloadComplete: boolean;
  onDismissed: () => void;
};

/**
 * Hand-off from the native splash to this one.
 *
 * ⚠ NOT ON MOUNT — on fonts. The native layer is a solid colour and needs no
 * typeface, so it can sit in front until the wordmark is drawable. Handing over
 * earlier would show the name in the system face and then swap it: a flash of
 * the wrong brand, bought for nothing.
 */
function hideNativeSplash() {
  SplashScreen.hideAsync().catch(() => {
    /* may already be hidden */
  });
}

export function Splash({ fontsReady, preloadComplete, onDismissed }: Props) {
  const rootOpacity = useSharedValue(1);

  useEffect(() => {
    if (!fontsReady) return;
    hideNativeSplash();
  }, [fontsReady]);

  // The only movement on this screen: a short crossfade into the app. That is
  // not decoration — without it the splash CUTS to the first frame, which reads
  // as a glitch rather than as an arrival.
  useEffect(() => {
    if (!preloadComplete) return;
    rootOpacity.value = withTiming(
      0,
      { duration: 250, easing: Easing.out(Easing.ease) },
      (finished) => {
        if (finished) runOnJS(onDismissed)();
      },
    );
  }, [preloadComplete, rootOpacity, onDismissed]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: rootOpacity.value }));

  return (
    <Animated.View
      pointerEvents={preloadComplete ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, { backgroundColor: SPLASH_BG }, rootStyle]}
    >
      <StatusBar style="light" />
      <View style={styles.center}>
        {/* ⚠ The shared `Wordmark`, not a copy of it. This file used to spell
            the two-tone name out itself, which meant the launch screen could
            drift from every other place the name appears. */}
        {fontsReady ? <Wordmark size={44} onDark /> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
