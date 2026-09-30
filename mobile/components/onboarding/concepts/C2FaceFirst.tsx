// CONCEPT 2 — FACE FIRST
// ============================================================================
// Give before you ask. The builder is the FIRST thing, with no preamble; the face lands in a
// leaderboard row in front of you; and only then does the push ask arrive — carrying the face you
// just made, inside a notification that is about YOU being overtaken.
//
// ⭐ WHY THIS ORDER: a permission ask converts on whether the person has had a value moment yet.
// "Can we send you notifications?" at second zero is a stranger asking for your number. The same
// question after you have made something, and been shown where it lives, is a different question.
//
// ⭐ WHY THE BANNER CARRIES THEIR OWN FACE: it turns an abstraction ("alerts") into a specific,
// checkable claim ("this is what one looks like, and that is me in it"). Nothing is exaggerated —
// the copy is a notification we actually send.
//
// Disclosure-gate sentence: "make your face, see where it lives, then decide about alerts."
// Passes — the ordering is stated, not hidden, and skipping the avatar still reaches the ask.

import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, SlideInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import type { StoredAvatarBuild } from '@/lib/avatar/storedConfig';
import { useAvatarAssets } from '@/lib/useAvatarAssets';
import { useTheme } from '@/theme';

import {
  AvatarQuickBuild,
  Confetti,
  MockLeaderboard,
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

type Phase = 'build' | 'placed' | 'push' | 'done';

export function C2FaceFirst({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const { assets } = useAvatarAssets();
  const [ground] = useState(randomGround);
  const [build, setBuild] = useState<StoredAvatarBuild>(SEED_BUILD);
  const [phase, setPhase] = useState<Phase>('build');
  const push = useSimulatedPush();
  const head = useHeadSvg(build, ground);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        {phase === 'build' ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ paddingVertical: theme.spacing.xl, gap: theme.spacing.xl }}>
              <View style={{ paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm }}>
                <Text variant="pageTitle" color="ink" align="center">
                  This is you.
                </Text>
                <Text variant="body" color="slate" align="center">
                  Close enough? Change anything you like.
                </Text>
              </View>
              <AvatarQuickBuild build={build} ground={ground} onChange={setBuild} />
              <ShuffleButton onShuffle={() => assets && setBuild(randomBuild(assets))} label="Try another" />
            </ScrollView>
            <SafeAreaView edges={['bottom']}>
              <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>
                <Button title="That’s me" size="lg" fullWidth onPress={() => setPhase('placed')} />
                <SkipLink label="Skip for now" onPress={() => setPhase('push')} />
              </View>
            </SafeAreaView>
          </Animated.View>
        ) : null}

        {phase === 'placed' ? (
          <Animated.View entering={FadeIn.duration(320)} style={{ flex: 1 }}>
            <View style={{ flex: 1, padding: theme.spacing.xl, gap: theme.spacing.xl, justifyContent: 'center' }}>
              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="caption" color="primary" align="center">
                  Office Legends · Premier League
                </Text>
                <Text variant="pageTitle" color="ink" align="center">
                  There you are.
                </Text>
              </View>
              <Animated.View entering={FadeInDown.delay(180).springify().damping(16)}>
                <MockLeaderboard headSvg={head} ground={ground} youName="Ryan" highlight />
              </Animated.View>
              <Text variant="body" color="slate" align="center">
                Fourth, for now. Sarah is 51 points ahead of you.
              </Text>
            </View>
            <SafeAreaView edges={['bottom']}>
              <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>
                <Button title="Next" size="lg" fullWidth onPress={() => setPhase('push')} />
              </View>
            </SafeAreaView>
          </Animated.View>
        ) : null}

        {phase === 'push' || phase === 'done' ? (
          <Animated.View entering={FadeIn.duration(320)} style={{ flex: 1 }}>
            <View style={{ flex: 1, padding: theme.spacing.xl, gap: theme.spacing.xl, justifyContent: 'center' }}>
              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="pageTitle" color="ink" align="center">
                  Want to know when that changes?
                </Text>
                <Text variant="body" color="slate" align="center">
                  This is the whole of what we’d send. Nothing else, unless you ask for it.
                </Text>
              </View>

              <View style={{ gap: theme.spacing.md }}>
                <Animated.View entering={SlideInUp.delay(120).springify().damping(15)}>
                  <PhoneBanner
                    content={{
                      title: 'SportPool',
                      body: 'Sarah just passed you. You’re 4th in Office Legends.',
                      avatarSvg: head,
                      ground,
                    }}
                  />
                </Animated.View>
                <Animated.View entering={SlideInUp.delay(260).springify().damping(15)}>
                  <PhoneBanner
                    content={{
                      title: 'SportPool',
                      body: 'Picks lock in 2 hours — matchweek 6.',
                      avatarSvg: head,
                      ground,
                    }}
                  />
                </Animated.View>
              </View>

              {phase === 'done' ? (
                <Animated.View entering={FadeIn}>
                  <Text
                    variant="cardTitle"
                    color={push.status === 'granted' ? 'green' : 'slate'}
                    align="center"
                  >
                    {push.status === 'granted'
                      ? '✓ You’ll get those two. Change them any time in Settings.'
                      : 'No problem — you can turn these on in Settings later.'}
                  </Text>
                </Animated.View>
              ) : null}
            </View>

            <SafeAreaView edges={['bottom']}>
              <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>
                {phase === 'done' ? (
                  <Button title="Take me in" size="lg" fullWidth onPress={onDone} />
                ) : (
                  <>
                    <Button title="Send me those" size="lg" fullWidth onPress={push.ask} />
                    <SkipLink onPress={() => setPhase('done')} />
                  </>
                )}
              </View>
            </SafeAreaView>
          </Animated.View>
        ) : null}
      </SafeAreaView>

      <Confetti fire={phase === 'done' && push.status === 'granted'} />
      <SimulatedPushAlert
        visible={push.asking}
        onAnswer={(granted) => {
          push.answer(granted);
          setPhase('done');
        }}
      />
    </View>
  );
}
