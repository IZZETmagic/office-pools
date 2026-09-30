// CONCEPT 4 — ENDOWED PROGRESS
// ============================================================================
// Three steps, and step one — "Account created" — is ALREADY TICKED when the screen opens. The
// member starts at 33%, not at zero.
//
// ⭐ THE EFFECT, AND WHY IT IS NOT A TRICK: people finish a task they are already part-way
// through far more often than an identical task they are starting. The usual implementation is a
// loyalty card stamped twice "for free", which is a fiction. Here the tick is TRUE — they did
// create an account, it is the most effortful thing in the flow, and counting it is accurate
// rather than generous. Nothing is invented and no step is padded to make the bar look fuller.
//
// ⚠ THE ONE THING THAT WOULD MAKE THIS A DARK PATTERN is adding a fourth step nobody needs so the
// bar has further to run, or refusing to let someone leave at 2/3. Neither is here: the footer
// exits from every state.
//
// Disclosure-gate sentence: "your account counts as step one, so you start a third of the way."
// Passes — and it is printed on the screen, not just defensible in a design review.

import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import type { StoredAvatarBuild } from '@/lib/avatar/storedConfig';
import { useAvatarAssets } from '@/lib/useAvatarAssets';
import { useTheme, withOpacity } from '@/theme';

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
  SkipLink,
  useHeadSvg,
  useSimulatedPush,
} from './shared';

const STEPS = ['Account', 'Your face', 'Alerts'] as const;

export function C4EndowedProgress({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const { assets } = useAvatarAssets();
  const [ground] = useState(randomGround);
  const [build, setBuild] = useState<StoredAvatarBuild>(SEED_BUILD);
  // ⭐ Starts at 1, not 0 — the account is genuinely made.
  const [complete, setComplete] = useState(1);
  const push = useSimulatedPush();
  const head = useHeadSvg(build, ground);

  const stage = complete === 1 ? 'avatar' : complete === 2 ? 'push' : 'done';

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <View style={{ padding: theme.spacing.xl, paddingBottom: theme.spacing.lg, gap: theme.spacing.md }}>
          <ProgressRibbon complete={complete} />
          <Text variant="detail" color="slate" align="center">
            {complete} of 3 · your account already counts as step one
          </Text>
        </View>

        {stage === 'avatar' ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing.xl, gap: theme.spacing.lg }}>
              <View style={{ paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm }}>
                <Text variant="sectionHeader" color="ink" align="center">
                  Step 2 — your face
                </Text>
                <Text variant="body" color="slate" align="center">
                  Thirty seconds. It shows up everywhere your name does.
                </Text>
              </View>
              <AvatarQuickBuild build={build} ground={ground} onChange={setBuild} size={180} />
              <ShuffleButton onShuffle={() => assets && setBuild(randomBuild(assets))} />
            </ScrollView>
            <SafeAreaView edges={['bottom']}>
              <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>
                <Button title="Save it — 2 of 3" size="lg" fullWidth onPress={() => setComplete(2)} />
                <SkipLink label="Skip this step" onPress={() => setComplete(2)} />
              </View>
            </SafeAreaView>
          </Animated.View>
        ) : null}

        {stage === 'push' ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={{ flex: 1 }}>
            <View style={{ flex: 1, paddingHorizontal: theme.spacing.xl, gap: theme.spacing.xl, justifyContent: 'center' }}>
              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="sectionHeader" color="ink" align="center">
                  Step 3 — the last one
                </Text>
                <Text variant="body" color="slate" align="center">
                  One nudge before your picks lock. That is the alert that matters; the rest are
                  optional and live in Settings.
                </Text>
              </View>
              <PhoneBanner
                content={{
                  title: 'SportPool',
                  body: 'Picks lock in 2 hours — matchweek 6. You have 4 left.',
                  avatarSvg: head,
                  ground,
                }}
              />
            </View>
            <SafeAreaView edges={['bottom']}>
              <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>
                <Button title="Turn it on — finish" size="lg" fullWidth onPress={push.ask} />
                <SkipLink onPress={() => setComplete(3)} />
              </View>
            </SafeAreaView>
          </Animated.View>
        ) : null}

        {stage === 'done' ? (
          <Animated.View entering={FadeIn} style={{ flex: 1 }}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg, padding: theme.spacing.xl }}>
              <DoneTick size={72} />
              <Text variant="pageTitle" color="ink" align="center">
                3 of 3. You’re set.
              </Text>
              <Text variant="body" color="slate" align="center">
                {push.status === 'granted'
                  ? 'Face saved, alerts on. Both are changeable in Settings whenever you like.'
                  : 'Face saved. Alerts are off — flip them on in Settings any time.'}
              </Text>
            </View>
            <SafeAreaView edges={['bottom']}>
              <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>
                <Button title="Take me in" size="lg" fullWidth onPress={onDone} />
              </View>
            </SafeAreaView>
          </Animated.View>
        ) : null}
      </SafeAreaView>

      <Confetti fire={stage === 'done'} />
      <SimulatedPushAlert
        visible={push.asking}
        onAnswer={(granted) => {
          push.answer(granted);
          setComplete(3);
        }}
      />
    </View>
  );
}

function ProgressRibbon({ complete }: { complete: number }) {
  const theme = useTheme();
  const w = useSharedValue(complete / STEPS.length);

  useEffect(() => {
    w.value = withSpring(complete / STEPS.length, { damping: 16, stiffness: 120 });
  }, [complete, w]);

  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View
        style={{
          height: 8,
          borderRadius: 4,
          backgroundColor: theme.colors.mist,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[{ height: 8, borderRadius: 4, backgroundColor: theme.colors.primary }, fill]}
        />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {STEPS.map((s, i) => {
          const done = i < complete;
          return (
            <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: done
                    ? theme.colors.green
                    : withOpacity(theme.colors.slate, 0.25),
                }}
              >
                {done ? (
                  <Text variant="detail" style={{ color: '#FFF', fontSize: 9 }}>
                    ✓
                  </Text>
                ) : null}
              </View>
              <Text variant="detail" color={done ? 'ink' : 'slate'}>
                {s}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
