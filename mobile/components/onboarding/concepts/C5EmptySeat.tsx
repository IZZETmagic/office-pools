// CONCEPT 5 — THE EMPTY SEAT
// ============================================================================
// Opens on a real-looking pool leaderboard with one row unfilled: a dashed ring, a "?", and the
// words "Your seat". Building the avatar fills that seat LIVE, in the row, while you pick — the
// leaderboard never leaves the screen. Then, with the seat filled and the gap to 3rd visible, the
// push ask is: "want to know when you move up this list?"
//
// ⭐ THE MOST PRODUCT-NATIVE OF THE EIGHT. Both asks are motivated by a thing already on screen
// rather than by a promise about later. Nobody has to imagine what the avatar is for, because
// they are looking at where it goes; nobody has to imagine what the notification is about,
// because the thing it would be about is four rows tall in front of them.
//
// ⚠ THE LEADERBOARD IS FAKE AND MUST SAY SO. A mocked-up crew that looks real is fine as a
// diagram and dishonest as a claim, so the card is labelled "example". If this ships, the right
// version uses the member's ACTUAL first pool when they have one and this example only when they
// do not — which is also the answer to "what if they have no pool yet".
//
// Disclosure-gate sentence: "this is where your face goes, and this is the list we'd tell you
// about." Passes.

import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import type { StoredAvatarBuild } from '@/lib/avatar/storedConfig';
import { useAvatarAssets } from '@/lib/useAvatarAssets';
import { useTheme, withOpacity } from '@/theme';

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

type Stage = 'seat' | 'building' | 'push' | 'done';

export function C5EmptySeat({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const { assets } = useAvatarAssets();
  const [ground] = useState(randomGround);
  const [build, setBuild] = useState<StoredAvatarBuild>(SEED_BUILD);
  const [stage, setStage] = useState<Stage>('seat');
  const push = useSimulatedPush();
  const head = useHeadSvg(build, ground);

  const seatFilled = stage !== 'seat';

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        {/* ---- the leaderboard, never leaves the screen ---------------------------- */}
        <View style={{ padding: theme.spacing.xl, paddingBottom: theme.spacing.lg, gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="caption" color="primary">
              Office Legends · matchweek 6
            </Text>
            <View
              style={{
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: 2,
                borderRadius: theme.radii.pill,
                backgroundColor: withOpacity(theme.colors.slate, 0.15),
              }}
            >
              <Text variant="detail" color="slate">
                example
              </Text>
            </View>
          </View>
          <Animated.View layout={LinearTransition.springify().damping(18)}>
            <MockLeaderboard
              headSvg={head}
              ground={ground}
              youName="Ryan"
              faceless={!seatFilled}
              highlight={seatFilled}
            />
          </Animated.View>
        </View>

        {/* ---- what we're asking about that leaderboard ---------------------------- */}
        {stage === 'seat' ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={{ flex: 1, justifyContent: 'center' }}>
            <View style={{ paddingHorizontal: theme.spacing.xl, gap: theme.spacing.md }}>
              <Text variant="pageTitle" color="ink">
                That empty seat is yours.
              </Text>
              <Text variant="body" color="slate">
                Everyone else in your crew has a face. Take thirty seconds and fill it — you’ll
                watch it land in the row.
              </Text>
            </View>
            <SafeAreaView edges={['bottom']}>
              <View style={{ paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>
                <Button title="Fill my seat" size="lg" fullWidth onPress={() => setStage('building')} />
                <SkipLink label="Leave it for now" onPress={() => setStage('push')} />
              </View>
            </SafeAreaView>
          </Animated.View>
        ) : null}

        {stage === 'building' ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing.lg, gap: theme.spacing.md }}>
              {/* ⭐ NO BIG PREVIEW HERE — the row above IS the preview, which is the whole idea.
                  A second copy of the face would split the attention the concept depends on. */}
              <AvatarQuickBuild build={build} ground={ground} onChange={setBuild} size={92} compact />
              <ShuffleButton onShuffle={() => assets && setBuild(randomBuild(assets))} />
            </ScrollView>
            <SafeAreaView edges={['bottom']}>
              <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>
                <Button title="Take my seat" size="lg" fullWidth onPress={() => setStage('push')} />
              </View>
            </SafeAreaView>
          </Animated.View>
        ) : null}

        {stage === 'push' || stage === 'done' ? (
          <Animated.View entering={FadeIn} style={{ flex: 1, justifyContent: 'center' }}>
            <View style={{ paddingHorizontal: theme.spacing.xl, gap: theme.spacing.lg }}>
              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="pageTitle" color="ink">
                  Want to know when you move up it?
                </Text>
                <Text variant="body" color="slate">
                  You’re 4th, 14 points off third. We’ll tell you when that changes — and two hours
                  before your picks lock, so it can.
                </Text>
              </View>
              <PhoneBanner
                content={{
                  title: 'Office Legends',
                  body: 'You’ve moved up to 3rd. Marcus is 6 points behind.',
                  avatarSvg: head,
                  ground,
                }}
              />
              {stage === 'done' ? (
                <Text variant="cardTitle" color={push.status === 'granted' ? 'green' : 'slate'}>
                  {push.status === 'granted'
                    ? '✓ On. Pick exactly which alerts in Settings.'
                    : 'Off for now — Settings has them when you want them.'}
                </Text>
              ) : null}
            </View>
            <SafeAreaView edges={['bottom']}>
              <View style={{ paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>
                {stage === 'done' ? (
                  <Button title="Take me in" size="lg" fullWidth onPress={onDone} />
                ) : (
                  <>
                    <Button title="Yes — tell me" size="lg" fullWidth onPress={push.ask} />
                    <SkipLink onPress={() => setStage('done')} />
                  </>
                )}
              </View>
            </SafeAreaView>
          </Animated.View>
        ) : null}
      </SafeAreaView>

      <Confetti fire={stage === 'done' && push.status === 'granted'} />
      <SimulatedPushAlert
        visible={push.asking}
        onAnswer={(granted) => {
          push.answer(granted);
          setStage('done');
        }}
      />
    </View>
  );
}
