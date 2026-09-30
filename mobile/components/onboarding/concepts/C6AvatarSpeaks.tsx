// CONCEPT 6 — AVATAR SPEAKS
// ============================================================================
// Character-led. You build a face, and then THAT FACE asks for the notification permission, in
// the first person, from a speech bubble: "I'll tap you on the shoulder when picks lock."
//
// ⭐ WHY IT MIGHT WORK: the two asks stop being two asks. The avatar is no longer a cosmetic step
// before the real request; it is the thing doing the requesting, so building it is motivated by
// what happens next. It is also the only concept here with a VOICE, which is the cheapest way to
// make a pick'em app feel like it was made by people.
//
// ⚠⚠ THE RISK, STATED PLAINLY: an avatar with a personality is a mascot, and a mascot asking for
// permissions is a hair's breadth from Clippy. It reads as charming at nine seconds old and as
// twee on the fiftieth launch — so it must NEVER appear again after onboarding. If a reviewer
// finds this voice anywhere else in the app, the concept has been misapplied.
//
// ⚠ IT ALSO CANNOT CARRY THE REFUSAL. "Aw, okay 😢" from a face you just made is guilt, and guilt
// is the dark pattern this product's gate exists to catch. The decline path below is deliberately
// warm and completely unbothered.
//
// Disclosure-gate sentence: "your avatar asks for the notification, in its own voice." Passes —
// it is a tone choice, and nothing about the mechanism changes.

import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

import { Button, Text } from '@/components/ui';
import type { StoredAvatarBuild } from '@/lib/avatar/storedConfig';
import { useAvatarAssets } from '@/lib/useAvatarAssets';
import { useTheme } from '@/theme';

import {
  AvatarQuickBuild,
  Confetti,
  randomBuild,
  randomGround,
  SEED_BUILD,
  ShuffleButton,
  SimulatedPushAlert,
  SkipLink,
  themedShadow,
  useHeadSvg,
  useSimulatedPush,
} from './shared';

export function C6AvatarSpeaks({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const { assets } = useAvatarAssets();
  const [ground] = useState(randomGround);
  const [build, setBuild] = useState<StoredAvatarBuild>(SEED_BUILD);
  const [stage, setStage] = useState<'build' | 'speak' | 'done'>('build');
  const push = useSimulatedPush();
  const head = useHeadSvg(build, ground);

  if (stage === 'build') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
        <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingVertical: theme.spacing.xl, gap: theme.spacing.xl }}>
            <View style={{ paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm }}>
              <Text variant="pageTitle" color="ink" align="center">
                Make someone.
              </Text>
              <Text variant="body" color="slate" align="center">
                They’ll be standing next to your name all season.
              </Text>
            </View>
            <AvatarQuickBuild build={build} ground={ground} onChange={setBuild} />
            <ShuffleButton onShuffle={() => assets && setBuild(randomBuild(assets))} label="Someone else" />
          </ScrollView>
          <SafeAreaView edges={['bottom']}>
            <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>
              <Button title="This is them" size="lg" fullWidth onPress={() => setStage('speak')} />
              <SkipLink label="Skip — use my initials" onPress={() => setStage('speak')} />
            </View>
          </SafeAreaView>
        </SafeAreaView>
      </View>
    );
  }

  const answered = push.status !== 'undetermined';

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.xl }}>
          <Animated.View entering={ZoomIn.springify().damping(14)} style={{ alignItems: 'center' }}>
            <View
              style={{
                width: 180,
                height: 180,
                borderRadius: 90,
                overflow: 'hidden',
                backgroundColor: ground,
              }}
            >
              {head ? <SvgXml xml={head} width={180} height={180} /> : null}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(260).springify().damping(15)}>
            <SpeechBubble>
              {answered ? (
                push.status === 'granted' ? (
                  <Text variant="cardTitle" color="ink">
                    Grand. I’ll keep it to the deadlines and the goals — and you can tell me to
                    shut up in Settings any time.
                  </Text>
                ) : (
                  <Text variant="cardTitle" color="ink">
                    Fair enough. I’ll be here on the leaderboard either way — flip me on in
                    Settings if you change your mind.
                  </Text>
                )
              ) : (
                <Text variant="cardTitle" color="ink">
                  Right — I’ll tap you on the shoulder two hours before your picks lock, and shout
                  when a match you’ve got a pick on scores. That alright?
                </Text>
              )}
            </SpeechBubble>
          </Animated.View>
        </View>

        <SafeAreaView edges={['bottom']}>
          <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>
            {answered ? (
              <Animated.View entering={FadeIn} exiting={FadeOut}>
                <Button title="Let’s go" size="lg" fullWidth onPress={onDone} />
              </Animated.View>
            ) : (
              <>
                <Button title="Go on then" size="lg" fullWidth onPress={push.ask} />
                <SkipLink label="Keep quiet" onPress={() => push.answer(false)} />
              </>
            )}
          </View>
        </SafeAreaView>
      </SafeAreaView>

      <Confetti fire={push.status === 'granted'} />
      <SimulatedPushAlert visible={push.asking} onAnswer={push.answer} />
    </View>
  );
}

function SpeechBubble({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center' }}>
      {/* the tail */}
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: 10,
          borderRightWidth: 10,
          borderBottomWidth: 12,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: theme.colors.surface,
        }}
      />
      <View
        style={[
          {
            padding: theme.spacing.lg,
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.surface,
          },
          themedShadow(theme),
        ]}
      >
        {children}
      </View>
    </View>
  );
}
