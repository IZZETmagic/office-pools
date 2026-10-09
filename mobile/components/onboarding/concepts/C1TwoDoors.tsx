// CONCEPT 1 — TWO DOORS
// ============================================================================
// One screen, two tiles, no order imposed. Each tile completes IN PLACE and stamps a tick; the
// footer button is live from the first frame so the screen is never a gate.
//
// ⭐ WHY NON-LINEAR: a two-item list is short enough that choosing the order costs nothing and
// buys a real thing — the member sees the whole of what is being asked before agreeing to any of
// it. A wizard hides item two behind item one, so every step is a door into an unknown corridor.
//
// ⭐ POSITIVE REINFORCEMENT: the tick is on COMPLETION and the confetti is on BOTH. Nothing is
// withheld to manufacture the second tap — skipping straight past is one tap and is never made to
// look like a mistake.
//
// Disclosure-gate sentence: "here are the two things, do either, both or neither." Passes.

import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

import { Button, Text, Pressable } from '@/components/ui';
import type { StoredAvatarBuild } from '@/lib/avatar/storedConfig';
import { useTheme, withOpacity } from '@/theme';

import {
  AvatarQuickBuild,
  Confetti,
  DoneTick,
  Pulse,
  randomGround,
  SEED_BUILD,
  ShuffleButton,
  SimulatedPushAlert,
  useHeadSvg,
  useSimulatedPush,
  randomBuild,
} from './shared';
import { useAvatarAssets } from '@/lib/useAvatarAssets';

export function C1TwoDoors({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const { assets } = useAvatarAssets();
  const [ground] = useState(randomGround);
  const [build, setBuild] = useState<StoredAvatarBuild>(SEED_BUILD);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarDone, setAvatarDone] = useState(false);
  const push = useSimulatedPush();
  const head = useHeadSvg(build, ground);
  const pushDone = push.status !== 'undetermined';
  const both = avatarDone && pushDone;
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (avatarDone && push.status === 'granted') setCelebrate(true);
  }, [avatarDone, push.status]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            padding: theme.spacing.xl,
            paddingBottom: theme.spacing.xxl,
            gap: theme.spacing.xl,
          }}
        >
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="caption" color="primary">
              You’re in
            </Text>
            <Text variant="pageTitle" color="ink">
              Welcome, Ryan.
            </Text>
            <Text variant="body" color="slate">
              Two quick things — do either, both, or neither.
            </Text>
          </View>

          {/* ---- door one: the avatar ------------------------------------------------ */}
          <Animated.View layout={LinearTransition.springify().damping(18)}>
            <Tile
              done={avatarDone}
              accent={theme.colors.primary}
              title={avatarDone ? 'Looking good' : 'Put a face to your name'}
              body={
                avatarDone
                  ? 'You can change it any time from your profile.'
                  : 'Your crew sees this on every leaderboard, every duel, every banter message.'
              }
              art={
                head ? (
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      overflow: 'hidden',
                      backgroundColor: ground,
                    }}
                  >
                    <SvgXml xml={head} width={56} height={56} />
                  </View>
                ) : null
              }
              onPress={() => setAvatarOpen((o) => !o)}
              expanded={avatarOpen}
            />

            {avatarOpen ? (
              <Animated.View
                entering={FadeIn.duration(220)}
                exiting={FadeOut.duration(140)}
                style={{
                  marginTop: -theme.spacing.md,
                  paddingTop: theme.spacing.xl,
                  paddingBottom: theme.spacing.lg,
                  borderBottomLeftRadius: theme.radii.md,
                  borderBottomRightRadius: theme.radii.md,
                  backgroundColor: theme.colors.surface,
                  gap: theme.spacing.lg,
                }}
              >
                <AvatarQuickBuild
                  build={build}
                  ground={ground}
                  onChange={setBuild}
                  size={160}
                  compact
                />
                <View style={{ paddingHorizontal: theme.spacing.xl, gap: theme.spacing.md }}>
                  <ShuffleButton onShuffle={() => assets && setBuild(randomBuild(assets))} />
                  <Button
                    title="That’s me"
                    fullWidth
                    onPress={() => {
                      setAvatarDone(true);
                      setAvatarOpen(false);
                    }}
                  />
                </View>
              </Animated.View>
            ) : null}
          </Animated.View>

          {/* ---- door two: notifications --------------------------------------------- */}
          <Animated.View layout={LinearTransition.springify().damping(18)}>
            <Tile
              done={pushDone}
              accent={theme.colors.accent}
              title={
                push.status === 'granted'
                  ? 'You’ll hear from us'
                  : push.status === 'denied'
                    ? 'No notifications'
                    : 'Never miss a deadline'
              }
              body={
                push.status === 'granted'
                  ? 'Deadlines, goals and banter. Change which ones in Settings.'
                  : push.status === 'denied'
                    ? 'You can turn these on later in Settings.'
                    : 'A nudge two hours before your picks lock, and nothing else unless you ask.'
              }
              art={<Bell colour={theme.colors.accent} pulse={!pushDone} />}
              onPress={pushDone ? () => {} : push.ask}
            />
          </Animated.View>
        </ScrollView>

        <SafeAreaView edges={['bottom']}>
          <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg, gap: theme.spacing.sm }}>
            <Button
              title={both ? 'All set — take me in' : 'Take me in'}
              size="lg"
              fullWidth
              variant={both ? 'primary' : 'secondary'}
              onPress={onDone}
            />
            <Text variant="detail" color="slate" align="center">
              {both ? 'Both done. Nice.' : 'Nothing here is required.'}
            </Text>
          </View>
        </SafeAreaView>
      </SafeAreaView>

      <Confetti fire={celebrate} />
      <SimulatedPushAlert visible={push.asking} onAnswer={push.answer} />
    </View>
  );
}

function Tile({
  done,
  accent,
  title,
  body,
  art,
  onPress,
  expanded,
}: {
  done: boolean;
  accent: string;
  title: string;
  body: string;
  art: React.ReactNode;
  onPress: () => void;
  expanded?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.lg,
        padding: theme.spacing.lg,
        borderRadius: theme.radii.md,
        borderBottomLeftRadius: expanded ? 0 : theme.radii.md,
        borderBottomRightRadius: expanded ? 0 : theme.radii.md,
        backgroundColor: done ? withOpacity(theme.colors.green, 0.1) : theme.colors.surface,
        borderWidth: 1,
        borderColor: done ? withOpacity(theme.colors.green, 0.35) : 'transparent',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>{art}</View>
      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <Text variant="cardTitle" color="ink">
          {title}
        </Text>
        <Text variant="body" color="slate">
          {body}
        </Text>
      </View>
      {done ? <DoneTick size={26} /> : <Chevron colour={accent} />}
    </Pressable>
  );
}

function Chevron({ colour }: { colour: string }) {
  return (
    <View
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: withOpacity(colour, 0.14),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="cardTitle" style={{ color: colour }}>
        ›
      </Text>
    </View>
  );
}

function Bell({ colour, pulse }: { colour: string; pulse: boolean }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {pulse ? <Pulse colour={colour} size={56} /> : null}
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: withOpacity(colour, 0.16),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="pageTitle" style={{ color: colour, fontSize: 26, lineHeight: 30 }}>
          🔔
        </Text>
      </View>
    </View>
  );
}
