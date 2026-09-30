// THROWAWAY — the onboarding redesign concept harness.
// ============================================================================
// Eight takes on the same two-item onboarding: (1) turn on push, (2) build an avatar. Flip
// through them on the device, pick a direction, and then DELETE this file along with
// `components/onboarding/concepts/`.
//
// 🔴 TWO THINGS THIS HARNESS WILL NOT DO, both load-bearing:
//
//   · IT NEVER FIRES THE REAL OS PUSH PROMPT. iOS grants an app exactly one
//     `requestPermissionsAsync()` that actually shows a dialog. Spending it on a mock-up is
//     UNRECOVERABLE without reinstalling, and it would take the real onboarding's one shot with
//     it. `<SimulatedPushAlert>` is a drawn copy — same words, same button order.
//   · IT NEVER WRITES. No SecureStore onboarding flags, no `users.avatar_build`. Every face built
//     here dies with the component, so reviewing the eight cannot replace a real avatar or mark
//     onboarding complete and lock you out of the thing you are reviewing.
//
// ⚠ ROUTING: this lives at the ROOT, not inside `(onboarding)`. The gate in `_layout.tsx` bounces
// anything in the `(auth)` or `(onboarding)` groups straight to `(tabs)` once you are onboarded,
// so a harness placed in that group would be unreachable on exactly the device you want it on.
//
// Reach it with a deep link — `npx uri-scheme open sportpool://onboarding-harness --ios` — or by
// temporarily dropping a button into the Profile tab.

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { C1TwoDoors } from '@/components/onboarding/concepts/C1TwoDoors';
import { C2FaceFirst } from '@/components/onboarding/concepts/C2FaceFirst';
import { C3LivePreview } from '@/components/onboarding/concepts/C3LivePreview';
import { C4EndowedProgress } from '@/components/onboarding/concepts/C4EndowedProgress';
import { C5EmptySeat } from '@/components/onboarding/concepts/C5EmptySeat';
import { C6AvatarSpeaks } from '@/components/onboarding/concepts/C6AvatarSpeaks';
import { C7CardStack } from '@/components/onboarding/concepts/C7CardStack';
import { C8QuietTwoLiner } from '@/components/onboarding/concepts/C8QuietTwoLiner';
import { useTheme, withOpacity } from '@/theme';

type Concept = {
  n: number;
  name: string;
  hook: string;
  order: 'Avatar → push' | 'Push → avatar' | 'Your choice';
  Component: (p: { onDone: () => void }) => React.ReactElement;
};

const CONCEPTS: Concept[] = [
  {
    n: 1,
    name: 'Two Doors',
    hook: 'One screen, two tiles. Each completes in place and stamps a tick. No order imposed.',
    order: 'Your choice',
    Component: C1TwoDoors,
  },
  {
    n: 2,
    name: 'Face First',
    hook: 'Build the face, watch it land in a leaderboard row, then get asked about alerts — with your own face in the banner.',
    order: 'Avatar → push',
    Component: C2FaceFirst,
  },
  {
    n: 3,
    name: 'Live Preview',
    hook: 'Push first, but shown not told: real banners slide down and cycle until you decide.',
    order: 'Push → avatar',
    Component: C3LivePreview,
  },
  {
    n: 4,
    name: 'Endowed Progress',
    hook: 'A 3-step bar where step one — “Account created” — is already ticked. You start at 33%.',
    order: 'Avatar → push',
    Component: C4EndowedProgress,
  },
  {
    n: 5,
    name: 'The Empty Seat',
    hook: 'A leaderboard with your row unfilled. Building the avatar fills it live, in the row.',
    order: 'Avatar → push',
    Component: C5EmptySeat,
  },
  {
    n: 6,
    name: 'Avatar Speaks',
    hook: 'The face you just made asks for the notification itself, in the first person.',
    order: 'Avatar → push',
    Component: C6AvatarSpeaks,
  },
  {
    n: 7,
    name: 'Card Stack',
    hook: 'Two physical cards. Act on one or flick it away; the next is underneath.',
    order: 'Your choice',
    Component: C7CardStack,
  },
  {
    n: 8,
    name: 'Quiet Two-Liner',
    hook: 'The control. Two plain settings rows, no illustration, skip weighted the same as accept.',
    order: 'Your choice',
    Component: C8QuietTwoLiner,
  },
];

export default function OnboardingHarness() {
  const theme = useTheme();
  const [open, setOpen] = useState<number | null>(null);
  // ⚠ Bumped on every open so a concept REMOUNTS rather than resuming. Reviewing the second half
  // of a flow you already finished is not reviewing the flow.
  const [run, setRun] = useState(0);

  const active = CONCEPTS.find((c) => c.n === open);

  if (active) {
    const { Component } = active;
    return (
      <View style={{ flex: 1 }}>
        <Component key={`${active.n}-${run}`} onDone={() => setOpen(null)} />
        <SafeAreaView
          edges={['bottom']}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
          pointerEvents="box-none"
        >
          <View
            style={{
              flexDirection: 'row',
              alignSelf: 'center',
              gap: 1,
              marginBottom: 2,
              borderRadius: theme.radii.pill,
              overflow: 'hidden',
              backgroundColor: withOpacity(theme.colors.midnight, 0.55),
            }}
          >
            <HarnessChip label="✕ concepts" onPress={() => setOpen(null)} />
            <HarnessChip label={`↻ ${active.n}. ${active.name}`} onPress={() => setRun((r) => r + 1)} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}>
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="caption" color="primary">
              Harness · throwaway
            </Text>
            <Text variant="pageTitle" color="ink">
              Onboarding concepts
            </Text>
            <Text variant="body" color="slate">
              Eight takes on the same two asks: turn on push, and build an avatar. Nothing here
              writes — the OS prompt is simulated and no avatar is saved.
            </Text>
          </View>

          {CONCEPTS.map((c) => (
            <Pressable
              key={c.n}
              onPress={() => {
                setRun((r) => r + 1);
                setOpen(c.n);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                gap: theme.spacing.lg,
                padding: theme.spacing.lg,
                borderRadius: theme.radii.md,
                backgroundColor: theme.colors.surface,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: withOpacity(theme.colors.primary, 0.12),
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text variant="cardTitle" color="primary">
                  {c.n}
                </Text>
              </View>
              <View style={{ flex: 1, gap: theme.spacing.xs }}>
                <Text variant="cardTitle" color="ink">
                  {c.name}
                </Text>
                <Text variant="body" color="slate">
                  {c.hook}
                </Text>
                <View
                  style={{
                    alignSelf: 'flex-start',
                    paddingHorizontal: theme.spacing.sm,
                    paddingVertical: 2,
                    borderRadius: theme.radii.pill,
                    backgroundColor: withOpacity(theme.colors.slate, 0.14),
                  }}
                >
                  <Text variant="detail" color="slate">
                    {c.order}
                  </Text>
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function HarnessChip({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {/* ⚠ A literal white, not `theme.colors.snow`: this chip floats on a translucent midnight
          bar which is the same value in both modes, so a theme-aware ink fails in one of them. */}
      <Text variant="detail" style={{ color: '#FFFFFF' }}>
        {label}
      </Text>
    </Pressable>
  );
}
