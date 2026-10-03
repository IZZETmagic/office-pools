// =============================================================
// ZoomablePhoto — the full-screen Banter photo, pinch and pan
// =============================================================
// Pinch zooms around the fingers (1×–4×), a drag pans while zoomed and
// is clamped so the photo never leaves the screen, a double tap toggles
// 2.5× at the tapped point, and at 1× a downward swipe closes it.
//
// Gesture handler + Reanimated are both already in the binary, so this
// ships by OTA. ⚠ It renders inside an RN <Modal>, which mounts OUTSIDE
// the app's root GestureHandlerRootView — so it brings its own, or no
// gesture fires on Android.
// =============================================================

import { Image as ExpoImage } from 'expo-image';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const MIN = 1;
const MAX = 4;
const DOUBLE_TAP = 2.5;
const DISMISS_DISTANCE = 120;
const SPRING = { damping: 20, stiffness: 220 };

export function ZoomablePhoto({ uri, onClose }: { uri: string; onClose: () => void }) {
  const { width, height } = useWindowDimensions();

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  // Downward drag at 1× (dismiss), kept apart from the zoomed pan.
  const dismissY = useSharedValue(0);

  // How far the photo may travel at a given scale before an edge comes inside the screen.
  const clampX = (v: number, s: number) => {
    'worklet';
    const max = ((s - 1) * width) / 2;
    return Math.min(max, Math.max(-max, v));
  };
  const clampY = (v: number, s: number) => {
    'worklet';
    const max = ((s - 1) * height) / 2;
    return Math.min(max, Math.max(-max, v));
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
      savedX.value = x.value;
      savedY.value = y.value;
    })
    .onUpdate((e) => {
      const next = Math.min(MAX, Math.max(MIN * 0.8, savedScale.value * e.scale));
      // Keep the point under the fingers still: shift by how far the focal
      // point sits from centre, times the change in scale.
      const fx = e.focalX - width / 2;
      const fy = e.focalY - height / 2;
      const ratio = next / savedScale.value;
      x.value = fx - (fx - savedX.value) * ratio;
      y.value = fy - (fy - savedY.value) * ratio;
      scale.value = next;
    })
    .onEnd(() => {
      const s = Math.min(MAX, Math.max(MIN, scale.value));
      scale.value = withSpring(s, SPRING);
      x.value = withSpring(s === 1 ? 0 : clampX(x.value, s), SPRING);
      y.value = withSpring(s === 1 ? 0 : clampY(y.value, s), SPRING);
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      savedX.value = x.value;
      savedY.value = y.value;
    })
    .onUpdate((e) => {
      if (scale.value > 1.01) {
        x.value = clampX(savedX.value + e.translationX, scale.value);
        y.value = clampY(savedY.value + e.translationY, scale.value);
      } else if (e.translationY > 0) {
        dismissY.value = e.translationY;
      }
    })
    .onEnd(() => {
      if (scale.value <= 1.01 && dismissY.value > DISMISS_DISTANCE) {
        runOnJS(onClose)();
        return;
      }
      dismissY.value = withTiming(0, { duration: 180 });
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1.01) {
        scale.value = withSpring(1, SPRING);
        x.value = withSpring(0, SPRING);
        y.value = withSpring(0, SPRING);
      } else {
        const fx = e.x - width / 2;
        const fy = e.y - height / 2;
        scale.value = withSpring(DOUBLE_TAP, SPRING);
        x.value = withSpring(clampX(-fx * (DOUBLE_TAP - 1), DOUBLE_TAP), SPRING);
        y.value = withSpring(clampY(-fy * (DOUBLE_TAP - 1), DOUBLE_TAP), SPRING);
      }
    });

  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const photoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value + dismissY.value },
      { scale: scale.value },
    ],
  }));
  // The black backdrop fades as the photo is pulled down, so the swipe reads as "closing".
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(0.6, dismissY.value / (DISMISS_DISTANCE * 3)),
  }));

  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }, backdropStyle]} />
      <GestureDetector gesture={gesture}>
        <Animated.View style={[StyleSheet.absoluteFill, photoStyle]}>
          <ExpoImage
            source={{ uri }}
            contentFit="contain"
            style={{ width, height }}
            accessibilityLabel="Photo. Pinch to zoom, swipe down to close."
          />
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}
