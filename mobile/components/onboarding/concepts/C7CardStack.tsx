// CONCEPT 7 — CARD STACK
// ============================================================================
// Two cards in a physical stack. Act on the top one and it flies off; flick it away and it also
// flies off. Either way the next card is revealed underneath, and the last one clears to a
// finish state.
//
// ⭐ WHY TACTILE: the flick makes declining PHYSICAL and costless, which is the opposite of the
// usual pattern where the skip is a 12pt grey word hiding in a corner. A person who can throw the
// notification card away with their thumb in half a second is a person who was genuinely asked.
//
// ⭐ POSITIVE REINFORCEMENT is the stack itself — you can see how much is left, and it is visibly
// almost nothing. Two cards is a promise the screen can keep.
//
// ⚠ THE GESTURE MUST NOT BE THE ONLY WAY OUT. Every card carries a visible "Not now" as well;
// a discoverability-dependent exit is a trap for anyone who does not think to swipe.
//
// Disclosure-gate sentence: "two cards, do or flick each one." Passes.

import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import type { StoredAvatarBuild } from '@/lib/avatar/storedConfig';
import { useAvatarAssets } from '@/lib/useAvatarAssets';
import { useTheme } from '@/theme';

import {
  AvatarQuickBuild,
  Confetti,
  DoneTick,
  PhoneBanner,
  randomBuild,
  randomGround,
  SEED_BUILD,
  ShuffleButton,
  SimulatedPushAlert,
  themedShadow,
  useHeadSvg,
  useSimulatedPush,
} from './shared';

export function C7CardStack({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const { assets } = useAvatarAssets();
  const { width } = useWindowDimensions();
  const [ground] = useState(randomGround);
  const [build, setBuild] = useState<StoredAvatarBuild>(SEED_BUILD);
  const [index, setIndex] = useState(0);
  const push = useSimulatedPush();
  const head = useHeadSvg(build, ground);

  const next = () => setIndex((i) => i + 1);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.lg, gap: theme.spacing.xs }}>
          <Text variant="caption" color="slate" align="center">
            {index < 2 ? `${index + 1} of 2` : 'Done'}
          </Text>
          <Text variant="body" color="slate" align="center">
            Flick a card away to skip it.
          </Text>
        </View>

        <View style={{ flex: 1, justifyContent: 'center', padding: theme.spacing.xl }}>
          {index >= 2 ? (
            <Animated.View entering={FadeIn} style={{ alignItems: 'center', gap: theme.spacing.lg }}>
              <DoneTick size={72} />
              <Text variant="pageTitle" color="ink" align="center">
                That’s the lot.
              </Text>
              <Text variant="body" color="slate" align="center">
                Everything here lives in Settings if you want to change it later.
              </Text>
              <Button title="Take me in" size="lg" fullWidth onPress={onDone} />
            </Animated.View>
          ) : (
            <View style={{ height: 420 }}>
              {/* the card underneath, peeking */}
              {index === 0 ? (
                <View
                  style={[
                    {
                      position: 'absolute',
                      top: 14,
                      left: 10,
                      right: 10,
                      bottom: -14,
                      borderRadius: theme.radii.lg,
                      backgroundColor: theme.colors.surface,
                      opacity: 0.6,
                    },
                    themedShadow(theme),
                  ]}
                />
              ) : null}

              {index === 0 ? (
                <SwipeCard key="avatar" width={width} onFlick={next}>
                  <Text variant="sectionHeader" color="ink" align="center">
                    Put a face to your name
                  </Text>
                  <AvatarQuickBuild build={build} ground={ground} onChange={setBuild} size={120} compact />
                  <ShuffleButton onShuffle={() => assets && setBuild(randomBuild(assets))} />
                  <View style={{ paddingHorizontal: theme.spacing.lg, gap: theme.spacing.xs }}>
                    <Button title="Save it" fullWidth onPress={next} />
                  </View>
                </SwipeCard>
              ) : (
                <SwipeCard key="push" width={width} onFlick={next}>
                  <Text variant="sectionHeader" color="ink" align="center">
                    Never miss a deadline
                  </Text>
                  <View style={{ paddingHorizontal: theme.spacing.lg }}>
                    <PhoneBanner
                      content={{
                        title: 'SportPool',
                        body: 'Picks lock in 2 hours — matchweek 6. You have 4 left.',
                        avatarSvg: head,
                        ground,
                      }}
                    />
                  </View>
                  <Text variant="body" color="slate" align="center" style={{ paddingHorizontal: theme.spacing.xl }}>
                    One nudge before picks lock. Goals and banter are optional and off unless you
                    turn them on.
                  </Text>
                  <View style={{ paddingHorizontal: theme.spacing.lg }}>
                    <Button title="Turn on" fullWidth onPress={push.ask} />
                  </View>
                </SwipeCard>
              )}
            </View>
          )}
        </View>
      </SafeAreaView>

      <Confetti fire={index >= 2 && push.status === 'granted'} />
      <SimulatedPushAlert
        visible={push.asking}
        onAnswer={(granted) => {
          push.answer(granted);
          next();
        }}
      />
    </View>
  );
}

/**
 * ⚠ THE THRESHOLD IS A DISTANCE *OR* A VELOCITY. Distance alone punishes a quick confident flick
 * — the finger leaves the glass at 60pt travelling fast, the card springs back, and the gesture
 * reads as broken rather than as declined.
 */
const DISMISS_X = 110;
const DISMISS_V = 800;

function SwipeCard({
  width,
  onFlick,
  children,
}: {
  width: number;
  onFlick: () => void;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const x = useSharedValue(0);
  const gone = useSharedValue(0);

  const pan = Gesture.Pan()
    .onChange((e) => {
      x.value += e.changeX;
    })
    .onEnd((e) => {
      const go = Math.abs(x.value) > DISMISS_X || Math.abs(e.velocityX) > DISMISS_V;
      if (go) {
        gone.value = 1;
        x.value = withTiming(Math.sign(x.value || e.velocityX) * width * 1.4, { duration: 240 });
        runOnJS(onFlick)();
      } else {
        x.value = withSpring(0, { damping: 18 });
      }
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: `${(x.value / width) * 14}deg` }],
    opacity: gone.value ? 0.4 : 1,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: theme.radii.lg,
            backgroundColor: theme.colors.surface,
            paddingVertical: theme.spacing.xl,
            justifyContent: 'center',
            gap: theme.spacing.lg,
          },
          themedShadow(theme),
          style,
        ]}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
