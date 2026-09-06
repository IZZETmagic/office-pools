// =============================================================
// THE RECAP — phase 5, the news rather than the story
// =============================================================
// Ryan, 2026-09-06: *"right after the last match in that match week has
// finished ... a pop-up in the middle of the screen that shows a little
// animation of you and your opponent coming in from the sides, with the scores
// counting up. There is a review showdown button or a skip button."*
//
// The React Native twin of `app/pools/[pool_id]/DuelRecapSheet.tsx`, and it
// inherits that file's two hard rules unchanged.
//
// ## ⚠⚠ THE RECAP MAY NEVER BE THE ONLY WAY TO LEARN THE RESULT
//
// The duel card, the season table, the Room and the leaderboard are all correct
// and visible BEHIND this before it opens. Withhold the result until the
// ceremony has been watched and it stops being a recap and becomes *"we hold
// your score back so you come back"* — which is the disclosure gate's own
// worked example of a failure, quoted in CLAUDE.md.
//
// So this animates a number the member could already have read. That is the
// point: the ceremony is a flourish on known news, not a gate on unknown news.
//
// ## ⚠ SKIP IS AS EASY AS REVIEW
//
// Same size, same weight, side by side — never a grey link under a bright
// button. A member who never wants the ceremony should be able to say so in one
// tap, forever. Making the exit harder than the entrance is the fastest way to
// teach somebody to resent a feature.
//
// Both buttons dismiss and both stamp the marker. Review navigates as well; it
// must not come back because you read it.
//
// ## ⚠ THIN ON PURPOSE — THE POPUP IS THE NEWS, THE PAGE IS THE STORY
//
// Ryan split these on 2026-08-31 after the popup briefly carried the whole
// recap. A modal is a bad place to read anything. Who won, what it paid, two
// buttons — everything else is a screen away.
// =============================================================

import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { getInitials, gradientForUser } from '@/lib/avatarGradient';
import { duelResult } from '@/lib/duelPoints';
import { fontFamilies, useTheme } from '@/theme';

export type RecapSide = {
  name: string;
  userId: string | null;
  /** The weekly accuracy the duel was judged on. */
  score: number;
};

export type DuelRecap = {
  duelId: string;
  matchweek: number;
  you: RecapSide;
  /**
   * ⚠ NULL IS A BYE, AND IT IS THE ONLY SAFE WAY TO DETECT ONE. A bye pays
   * `DUEL_BYE`, which IS `DUEL_TIE` — reading the points would call it a tie.
   * Migration 100 settled the reasoning: no opponent, so no defeat.
   */
  them: RecapSide | null;
  /** What the engine paid. Read from the duel row, never recomputed. */
  points: number | null;
};

/** How long the two sides take to arrive, and the count-up that follows. */
const SLIDE_MS = 420;
const COUNT_MS = 900;

export function ShowdownRecapSheet({
  recap,
  onSkip,
  onReview,
}: {
  recap: DuelRecap | null;
  /** Dismiss. The caller stamps `last_recap_seen_at`. */
  onSkip: () => void;
  /** Dismiss AND navigate. The caller stamps too — reading it is not a reason to see it again. */
  onReview: () => void;
}) {
  const theme = useTheme();

  const enter = useSharedValue(0);
  useEffect(() => {
    if (!recap) return;
    enter.value = 0;
    enter.value = withTiming(1, { duration: SLIDE_MS, easing: Easing.out(Easing.cubic) });
  }, [recap, enter]);

  const leftStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateX: (1 - enter.value) * -70 }],
  }));
  const rightStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateX: (1 - enter.value) * 70 }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.94 + enter.value * 0.06 }],
  }));
  const buttonsStyle = useAnimatedStyle(() => ({
    // ⚠ THE BUTTONS ARRIVE AFTER THE COUNT. A Skip under the thumb while the
    // numbers are still moving gets pressed by accident, and the member never
    // finds out there was a ceremony.
    opacity: withDelay(SLIDE_MS + COUNT_MS, withTiming(enter.value, { duration: 220 })),
  }));

  if (!recap) return null;

  const bye = recap.them === null;
  // ⚠ Structural, never by value — see `DuelRecap.them`.
  const result = bye ? null : duelResult(recap.points);

  const headline = bye
    ? 'Bye week'
    : result === 'won'
      ? 'You won'
      : result === 'lost'
        ? 'You lost'
        : 'Drawn';

  /**
   * ⚠ NO CONSOLATION, AND NO CELEBRATION BEYOND THE FACT. The web's decision
   * card records the rule: stating a defeat plainly is respect; dressing it up
   * produces the bad feeling the product exists to avoid. There is no
   * "unlucky!", no "so close!", and no softening adverb anywhere in this file.
   */
  const tint =
    result === 'won' ? theme.colors.green : result === 'lost' ? theme.colors.red : theme.colors.slate;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onSkip}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(4,6,16,0.72)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing.lg,
        }}
      >
        <Animated.View
          style={[
            {
              width: '100%',
              maxWidth: 380,
              borderRadius: theme.radii.lg,
              backgroundColor: theme.colors.surface,
              padding: theme.spacing.xl,
              alignItems: 'center',
              gap: theme.spacing.md,
            },
            cardStyle,
          ]}
        >
          <Text
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 10,
              letterSpacing: 1.8,
              textTransform: 'uppercase',
              color: theme.colors.slate,
            }}
          >
            Matchweek {recap.matchweek} · decided
          </Text>

          <Text style={{ fontFamily: fontFamilies.black, fontSize: 26, color: tint }}>
            {headline}
          </Text>

          {/* ---------- the two sides, arriving ---------- */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.spacing.lg,
              marginTop: theme.spacing.xs,
            }}
          >
            <Animated.View style={[{ alignItems: 'center', gap: 8 }, leftStyle]}>
              <Face side={recap.you} />
              <Count to={recap.you.score} />
            </Animated.View>

            <Text
              style={{
                fontFamily: fontFamilies.black,
                fontSize: 18,
                color: theme.colors.silver,
              }}
            >
              {bye ? '' : '–'}
            </Text>

            <Animated.View style={[{ alignItems: 'center', gap: 8 }, rightStyle]}>
              {recap.them ? (
                <>
                  <Face side={recap.them} />
                  <Count to={recap.them.score} />
                </>
              ) : (
                <>
                  <View
                    style={{
                      width: FACE,
                      height: FACE,
                      borderRadius: FACE / 2,
                      backgroundColor: theme.colors.mist,
                    }}
                  />
                  <Text variant="detail" color="slate">
                    Nobody
                  </Text>
                </>
              )}
            </Animated.View>
          </View>

          {bye ? (
            <Text variant="body" color="slate" style={{ textAlign: 'center' }}>
              Nobody was drawn against you this week. It counts the same as a draw.
            </Text>
          ) : null}

          {/* ---------- the two ways out, equally weighted ---------- */}
          <Animated.View
            style={[
              { flexDirection: 'row', gap: theme.spacing.sm, width: '100%', marginTop: theme.spacing.sm },
              buttonsStyle,
            ]}
          >
            <Out label="Skip" onPress={onSkip} />
            <Out label="Review" onPress={onReview} primary />
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const FACE = 64;

function Face({ side }: { side: RecapSide }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: FACE,
        height: FACE,
        borderRadius: FACE / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.mist,
      }}
    >
      {side.userId ? (
        <LinearGradient
          colors={[...gradientForUser(side.userId)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: FACE / 2,
          }}
        />
      ) : null}
      <Text
        style={{
          fontFamily: fontFamilies.black,
          fontSize: 22,
          lineHeight: 28,
          color: side.userId ? '#FFFFFF' : theme.colors.slate,
        }}
      >
        {getInitials(side.name)}
      </Text>
    </View>
  );
}

/**
 * A score, counting up from zero.
 *
 * ⚠ JS-DRIVEN, AND DELIBERATELY SO. Everywhere else in this feature a second
 * clock would be a bug — the walkout's haptics must ride the same UI-thread
 * value as its picture. Here the count IS the whole animation: there is nothing
 * for it to drift against. A weekly accuracy is a handful of points, so this
 * renders a handful of frames, and `setState` at that rate is invisible.
 *
 * The Reanimated alternative — an `Animated.createAnimatedComponent(TextInput)`
 * driven through `useAnimatedProps` — buys nothing here and costs a text input
 * in the middle of a modal, with its own focus and accessibility behaviour to
 * suppress.
 *
 * ⚠ IT LANDS ON THE REAL NUMBER, always. The interval is cleared by value, not
 * by elapsed time, so a backgrounded app or a slow frame cannot leave the score
 * one short — which would be a wrong result on screen rather than a slow one.
 */
function Count({ to }: { to: number }) {
  const theme = useTheme();
  const [n, setN] = useState(0);
  const fired = useRef(false);

  useEffect(() => {
    if (to <= 0) {
      setN(0);
      return;
    }
    const steps = Math.min(to, 24);
    const every = Math.max(28, Math.round(COUNT_MS / steps));
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      const v = Math.round((to * i) / steps);
      setN(v);
      if (i >= steps) {
        clearInterval(id);
        // One tap when the number settles — the same "this has landed" beat the
        // walkout uses for the name.
        if (!fired.current) {
          fired.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
      }
    }, every);
    return () => clearInterval(id);
  }, [to]);

  return (
    <Text
      style={{
        fontFamily: fontFamilies.black,
        fontSize: 30,
        lineHeight: 36,
        color: theme.colors.ink,
        fontVariant: ['tabular-nums'],
      }}
    >
      {n}
    </Text>
  );
}

/** ⚠ Both outs are the same component, so they cannot drift in weight. */
function Out({
  label,
  onPress,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: 1,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.radii.md,
        alignItems: 'center',
        backgroundColor: primary ? theme.colors.primary : theme.colors.mist,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        variant="cardTitle"
        style={{ color: primary ? '#FFFFFF' : theme.colors.ink }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
