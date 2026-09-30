// CONCEPT 3 — LIVE PREVIEW
// ============================================================================
// Push first, but SHOWN rather than described. Real-looking banners slide down from the top of a
// dark screen, one after another, cycling forever until the member decides. The ask is literally
// "do you want these?" with "these" visible on screen.
//
// ⭐ WHY PUSH FIRST HERE: it is the honest test of the other direction. Every other concept in
// this set earns the ask first; this one argues that a sufficiently CONCRETE ask does not need to
// be earned, because the member can evaluate it directly instead of trusting us. If this converts
// as well as Face First, the simpler flow wins.
//
// ⭐ THE COPY IS REAL. Each banner is a notification the app actually sends today. A preview that
// shows a better product than the one that arrives is a bait-and-switch with extra steps.
//
// Disclosure-gate sentence: "here are the three kinds of alert, watch them, then choose." Passes.

import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInUp,
  SlideOutUp,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import type { StoredAvatarBuild } from '@/lib/avatar/storedConfig';
import { useAvatarAssets } from '@/lib/useAvatarAssets';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

import {
  AvatarQuickBuild,
  Confetti,
  PhoneBanner,
  randomBuild,
  randomGround,
  SEED_BUILD,
  ShuffleButton,
  SimulatedPushAlert,
  SkipLink,
  useSimulatedPush,
} from './shared';

const REEL = [
  { title: 'SportPool', body: 'Picks lock in 2 hours — matchweek 6. You have 4 left.' },
  { title: 'Office Legends', body: 'GOAL — Haaland 67’. City 2–1 Arsenal. You called it.' },
  { title: 'Sarah M.', body: 'replied to your banter: “bold of you to pick Spurs”' },
];

export function C3LivePreview({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const { assets } = useAvatarAssets();
  const [ground] = useState(randomGround);
  const [build, setBuild] = useState<StoredAvatarBuild>(SEED_BUILD);
  const [i, setI] = useState(0);
  const [stage, setStage] = useState<'push' | 'avatar'>('push');
  const push = useSimulatedPush();

  // The reel only runs while the ask is on screen — it is the evidence for the question being
  // asked, so it stops the moment the question is answered.
  useEffect(() => {
    if (stage !== 'push' || push.status !== 'undetermined' || push.asking) return;
    const t = setInterval(() => setI((n) => (n + 1) % REEL.length), 2600);
    return () => clearInterval(t);
  }, [stage, push.status, push.asking]);

  if (stage === 'avatar') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
        <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingVertical: theme.spacing.xl, gap: theme.spacing.xl }}>
            <View style={{ paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm }}>
              <Text variant="caption" color="primary" align="center">
                Last thing
              </Text>
              <Text variant="pageTitle" color="ink" align="center">
                Give them something to aim at.
              </Text>
              <Text variant="body" color="slate" align="center">
                Your face sits beside your name on every leaderboard in every pool.
              </Text>
            </View>
            <AvatarQuickBuild build={build} ground={ground} onChange={setBuild} />
            <ShuffleButton onShuffle={() => assets && setBuild(randomBuild(assets))} />
          </ScrollView>
          <SafeAreaView edges={['bottom']}>
            <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>
              <Button title="Done — take me in" size="lg" fullWidth onPress={onDone} />
              <SkipLink label="Use my initials instead" onPress={onDone} />
            </View>
          </SafeAreaView>
        </SafeAreaView>
        <Confetti fire={push.status === 'granted'} />
      </View>
    );
  }

  return (
    // ⚠ Hardcoded midnight, not `theme.colors.snow`: the banner is the subject of this screen and
    // it reads as a real iOS banner only against a dark ground. `midnight` is the same value in
    // both modes, which is exactly why it is safe to sit non-theme chrome on.
    <View style={{ flex: 1, backgroundColor: theme.colors.midnight }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <View style={{ height: 150, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm }}>
          {push.status === 'undetermined' ? (
            <Animated.View
              key={i}
              entering={SlideInUp.springify().damping(17)}
              exiting={SlideOutUp.duration(260)}
            >
              <PhoneBanner content={{ ...REEL[i], ground: theme.colors.primary }} />
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn} style={{ alignItems: 'center', paddingTop: theme.spacing.xl }}>
              <Text
                variant="cardTitle"
                style={{ color: push.status === 'granted' ? theme.colors.green : '#FFFFFF99' }}
              >
                {push.status === 'granted' ? '✓ Turned on' : 'Not turned on'}
              </Text>
            </Animated.View>
          )}
        </View>

        <View style={{ flex: 1, justifyContent: 'flex-end', padding: theme.spacing.xl, gap: theme.spacing.lg }}>
          <Animated.Text
            entering={FadeIn.delay(200)}
            style={{
              fontFamily: fontFamilies.black,
              fontSize: 30,
              lineHeight: 36,
              color: '#FFFFFF',
            }}
          >
            That’s all we’d send.
          </Animated.Text>
          <Text variant="body" style={{ color: '#FFFFFFB0' }}>
            Three kinds of alert — a deadline, a goal in a match you have a pick on, and a reply to
            you. No digests, no “we miss you”, nothing on a timer. Pick exactly which in Settings.
          </Text>

          <View
            style={{
              height: 1,
              backgroundColor: withOpacity('#FFFFFF', 0.12),
              marginVertical: theme.spacing.sm,
            }}
          />

          {push.status === 'undetermined' ? (
            <>
              <Button title="Send me these" size="lg" fullWidth onPress={push.ask} />
              <SkipLink label="Not now" onPress={() => setStage('avatar')} />
            </>
          ) : (
            <Animated.View entering={FadeIn} exiting={FadeOut}>
              <Button title="Next" size="lg" fullWidth onPress={() => setStage('avatar')} />
            </Animated.View>
          )}
        </View>
      </SafeAreaView>

      <SimulatedPushAlert visible={push.asking} onAnswer={push.answer} />
    </View>
  );
}
