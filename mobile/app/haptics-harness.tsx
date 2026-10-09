// DEV ONLY — every feel in `lib/haptics.ts`, on demand.
//
// ⭐⭐ THIS EXISTS BECAUSE NOTHING ELSE CAN ANSWER THE QUESTION. `haptics.guard.test.ts` proves the
// seven feels resolve to seven DIFFERENT calls. It cannot prove they land as seven different
// SENSATIONS, and no native build runs on the machine this was written on — so every weight in that
// table is reasoned from Apple's and Android's own descriptions, not felt. A thumb is the only
// instrument that settles it.
//
// ⭐ EACH ROW PRINTS WHAT IT ACTUALLY RESOLVES TO on this device, via `describeFeel`. That is the
// part that makes a "these two feel the same" report actionable: if `dragStart` and `longPress` both
// say `performAndroidHaptics(long-press)` then the phone is below API 30 and the platform has no
// more to give; if they say different constants and still feel alike, the choice of constant is
// wrong. One is a floor, the other is a bug, and they need opposite fixes.
//
// ⚠ THE PAIRS SECTION IS THE REAL INSTRUMENT. Tapping one row tells you almost nothing — a haptic
// has no memory, so "was that firmer?" needs something to be firmer THAN. Each pair fires A, waits,
// fires B, so the comparison happens inside one gesture instead of across two.
//
// Reached from Profile → Developer, because deep links don't reach a physical phone.

import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import {
  androidApiLevel,
  describeFeel,
  FEEL_NAMES,
  playFeel,
  type FeelName,
} from '@/lib/haptics';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

/**
 * The pairs worth settling, and why each one is here.
 *
 * ⚠ THE FIRST TWO ARE THE FIXES FROM THE COLLISION COMMIT and are the only reason this screen was
 * built. Both pairs were literally the same call until then — `selection`/`press` on iOS, and
 * `dragStart`/`longPress` on any Android below 34. If either still reads as one feel, that commit
 * did not actually achieve anything and the constants need choosing again.
 */
const PAIRS: { a: FeelName; b: FeelName; question: string }[] = [
  {
    a: 'selection',
    b: 'press',
    question: 'Picking vs navigating. Was the second sharper, not just louder?',
  },
  {
    a: 'dragStart',
    b: 'longPress',
    question: 'Picking a row up vs opening a menu. Two things, or one?',
  },
  {
    a: 'toggleOn',
    b: 'toggleOff',
    question: 'On vs off. Heavy against Soft — a thunk, then a give?',
  },
  {
    a: 'dragStart',
    b: 'dragEnd',
    question: 'Picked up vs put down. Below Android 30 these are one feel by design.',
  },
  {
    a: 'selection',
    b: 'keyTick',
    question: 'Same on iOS, on purpose. On Android the second should be a keyboard tap.',
  },
  {
    a: 'success',
    b: 'failure',
    question: 'Saved vs refused. Could you tell which without the screen?',
  },
  {
    a: 'failure',
    b: 'warning',
    question: 'Failed vs are-you-sure. Both are patterns — do they differ?',
  },
];

/** A → pause → B. Long enough that the two do not blur into one buzz. */
const PAIR_GAP_MS = 450;

export default function HapticsHarness() {
  const theme = useTheme();
  const [lastFired, setLastFired] = useState<string | null>(null);
  const [runningPair, setRunningPair] = useState<string | null>(null);

  const fire = useCallback((name: FeelName) => {
    playFeel(name);
    setLastFired(name);
  }, []);

  const firePair = useCallback((a: FeelName, b: FeelName) => {
    const key = `${a}>${b}`;
    setRunningPair(key);
    setLastFired(a);
    playFeel(a);
    // ⚠ A timer, not an animation. Reanimated is not involved and must not be:
    // a React commit mid-gesture stalls animations on iOS 4.1.x, and this
    // screen has no reason to risk it.
    setTimeout(() => {
      playFeel(b);
      setLastFired(b);
      setRunningPair(null);
    }, PAIR_GAP_MS);
  }, []);

  const platformLine =
    Platform.OS === 'ios'
      ? `iOS ${String(Platform.Version)} · UIKit generators`
      : `Android API ${androidApiLevel} · ${
          androidApiLevel >= 34
            ? 'every constant available'
            : androidApiLevel >= 30
              ? 'no Drag_Start / Toggle_*, so dragStart falls to Gesture_Start'
              : 'only the five always-safe constants — several feels share a floor'
        }`;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            padding: theme.spacing.xl,
            gap: theme.spacing.lg,
            paddingBottom: theme.spacing.xxl,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            style={{ alignSelf: 'flex-start' }}
          >
            <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.primary }}>
              ‹ Back
            </RNText>
          </Pressable>

          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="caption" color="primary">
              Harness · dev only
            </Text>
            <Text variant="pageTitle" color="ink">
              Haptics
            </Text>
            <Text variant="body" color="slate">
              Every feel in the app, and what it resolves to on this phone. Turn the volume off —
              some of these are easier to hear than to feel, and the sound is not the thing being
              tested.
            </Text>
          </View>

          {/* The device's own capability, because the Android answers depend on it entirely. */}
          <View
            style={{
              padding: theme.spacing.md,
              borderRadius: theme.radii.md,
              backgroundColor: withOpacity(theme.colors.primary, 0.08),
            }}
          >
            <Text variant="detail" color="primary">
              {platformLine}
            </Text>
          </View>

          {/* ---- the pairs: the reason this screen exists --------------------------------- */}
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="cardTitle">Tell these apart</Text>
            <Text variant="detail" color="slate">
              Fires the first, waits {PAIR_GAP_MS}ms, fires the second.
            </Text>
          </View>

          {PAIRS.map(({ a, b, question }) => {
            const key = `${a}>${b}`;
            const running = runningPair === key;
            return (
              <Pressable
                key={key}
                onPress={() => firePair(a, b)}
                disabled={running}
                accessibilityRole="button"
                accessibilityLabel={`Compare ${a} against ${b}`}
                style={({ pressed }) => ({
                  padding: theme.spacing.lg,
                  borderRadius: theme.radii.md,
                  backgroundColor: theme.colors.surface,
                  borderWidth: theme.borders.accent,
                  borderColor: running ? theme.colors.primary : 'transparent',
                  opacity: pressed ? 0.85 : 1,
                  gap: 4,
                })}
              >
                <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.ink }}>
                  {a} → {b}
                </RNText>
                <Text variant="detail" color="slate">
                  {question}
                </Text>
                <RNText
                  style={{
                    fontFamily: fontFamilies.medium,
                    fontSize: 11,
                    color: theme.colors.slate,
                    marginTop: 2,
                  }}
                >
                  {describeFeel(a).call} · {describeFeel(b).call}
                </RNText>
              </Pressable>
            );
          })}

          {/* ---- every feel on its own ---------------------------------------------------- */}
          <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
            <Text variant="cardTitle">One at a time</Text>
            <Text variant="detail" color="slate">
              Table order — lightest first, patterns last.
            </Text>
          </View>

          {FEEL_NAMES.map((name) => {
            const { purpose, call } = describeFeel(name);
            const isLast = lastFired === name;
            return (
              <Pressable
                key={name}
                onPress={() => fire(name)}
                accessibilityRole="button"
                accessibilityLabel={`Play ${name}`}
                style={({ pressed }) => ({
                  padding: theme.spacing.lg,
                  borderRadius: theme.radii.md,
                  backgroundColor: isLast
                    ? withOpacity(theme.colors.primary, 0.12)
                    : theme.colors.surface,
                  opacity: pressed ? 0.85 : 1,
                  gap: 4,
                })}
              >
                <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.ink }}>
                  haptic{name.charAt(0).toUpperCase()}
                  {name.slice(1)}
                </RNText>
                <Text variant="detail" color="slate">
                  {purpose}
                </Text>
                <RNText
                  style={{
                    fontFamily: fontFamilies.medium,
                    fontSize: 11,
                    color: theme.colors.slate,
                    marginTop: 2,
                  }}
                >
                  {call}
                </RNText>
              </Pressable>
            );
          })}

          <Text variant="detail" color="slate">
            Nothing here writes anything. If a pair reads as one feel, the fix is in the
            `FEELS` table in `lib/haptics.ts` — and `haptics.guard.test.ts` will stop you putting
            two feels back on the same call.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
