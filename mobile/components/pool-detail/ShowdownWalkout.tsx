// =============================================================
// THE WALKOUT — phase 2, and the moment the mode is named after
// =============================================================
// Press Reveal, and they come out of the tunnel.
//
// This is the merge Ryan chose on 2026-09-06 between the two designs that
// already existed and disagreed:
//
//   `app/showdown-reveal-playground.tsx`  (2026-06-27) eight cinematic beats,
//                                          a tunnel, and no clues
//   `app/pools/[pool_id]/DuelRevealCeremony.tsx` (2026-09-01) three clues, and
//                                          no walk
//
// The clues ride inside beats 2 to 4 while the figures approach. `lib/
// showdownBeats.ts` owns the timing and explains why it is 6.7s rather than the
// spec's 4.0s; this file owns nothing but pixels.
//
// ## ⚠ HAPTICS, NOT SOUND — AND OFF THE SAME CLOCK AS THE PICTURE
//
// Ryan's call, 2026-09-01. The Remotion twin briefly had a whoosh per gate and
// a shutter on the doors; both were cut, because a share video that makes noise
// when it autoplays is one people scroll past. A phone can do the same job
// silently.
//
//     each clue arriving   → ImpactFeedbackStyle.Light
//     the threshold        → ImpactFeedbackStyle.Heavy
//     the name landing     → ImpactFeedbackStyle.Medium
//
// ⚠ THEY FIRE FROM A `useAnimatedReaction` ON THE ANIMATION'S OWN VALUE, never
// from `setTimeout`. The web's note on this port is explicit — *"two clocks for
// one ceremony drift, and a buzz that lands a beat after the thing it is
// describing is worse than no buzz"* — and a JS-thread timer is exactly that
// second clock: Reanimated drives `t` on the UI thread, so a busy JS thread
// would slide every buzz late while the picture stayed correct.
//
// ## ⚠ NO SVG `transform` STRINGS ANYWHERE IN THIS FILE
//
// `react-native-svg` silently IGNORES them — it renders the element unmoved
// rather than erroring, which has cost this codebase a day before. Every moving
// piece here is an `Animated.View` wrapping static SVG, or a plain view with a
// gradient. The SVG in this file never moves under its own power.
//
// ## ⚠ IT GATES NOTHING, AND IT MUST STAY THAT WAY
//
// Run the disclosure gate's tooltip test: *"Press Reveal to watch them walk
// out"* passes. Skip is on screen throughout, closing counts as watching
// however you close it, and all three clues are facts already on the
// leaderboard. Nothing here is randomised — the round-robin fixed this opponent
// when the season was drawn (083), long before anybody pressed anything — so
// gate 5 is untouched.
//
// ⚠ AND THERE IS NO REPLAY. Ryan, 2026-09-02: *"once revealed there should be
// NO replay button."* `last_reveal_seen_at` (136) is stamped on close, and the
// header stops offering the button. Anyone who wants to see it again is
// reaching for a thing the product deliberately does not have.
// =============================================================

import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Line, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { getInitials, gradientForUser } from '@/lib/avatarGradient';
import {
  BEATS,
  CLUE_AT,
  NAME_AT,
  THRESHOLD_AT,
  WALKOUT_MS,
  beatValue,
  type BeatSeg,
} from '@/lib/showdownBeats';
import { fontFamilies } from '@/theme';

// =============================================================
// The HYPED palette — Ryan's pick, 2026-09-06
// =============================================================
// From `assets/showdown-storyboard/hyped/`: a neon arch in magenta and cyan
// against near-black, a warm-white blowout behind it, and coloured streaks.
//
// ⚠ IT DOES NOT COME FROM THE APP THEME, and that is deliberate rather than
// lazy. The ceremony is a full-screen takeover for six seconds — it is not a
// surface the app's light/dark palette applies to, any more than the dark band
// is. Reaching for `useTheme()` here would put a light ground behind neon in
// light mode, which is the same failure the band's own header records.
const C = {
  ground: '#07040E',
  groundLift: '#150C2B',
  magenta: '#FF2D95',
  cyan: '#22D3EE',
  blowout: '#FFF9E6',
  ray: '#FFE9A8',
  silhouette: '#05030A',
  ink: '#FFFFFF',
  dim: 'rgba(255,255,255,0.55)',
  plate: 'rgba(7,4,14,0.86)',
};

/** The easing curves from MOTION_SPEC.md, resolved once. */
const EASE = {
  // ⚠ `.factory()` IS NOT OPTIONAL. Reanimated 4's `Easing.bezier(...)` returns
  // an EasingFunctionFactory — an object with a `.factory()` method — not a
  // callable. Passing the object straight into a worklet gives a silent
  // "not a function" on the UI thread, which surfaces as the animation simply
  // never moving. The playground found this first.
  ambient: Easing.linear,
  anticipate: Easing.bezier(0.32, 0, 0.67, 0).factory(),
  reveal: Easing.bezier(0.25, 1, 0.5, 1).factory(),
  climax: Easing.bezier(0.34, 1.56, 0.64, 1).factory(),
  settle: Easing.bezier(0.33, 1, 0.68, 1).factory(),
  hero: Easing.bezier(0.22, 1, 0.36, 1).factory(),
  graphic: Easing.bezier(0.65, 0, 0.35, 1).factory(),
} as const;

/**
 * Beat boundaries as PLAIN NUMBERS, keyed by beat number.
 *
 * ⚠⚠ THESE EXIST BECAUSE A WORKLET CANNOT CALL `BEATS.find()`. Every animated
 * style below runs on the UI thread, and the first version of this file reached
 * for a `beat(n)` helper inside each one — a plain arrow function closing over
 * an array. Reanimated cannot serialise that, so the ceremony threw the instant
 * it mounted: the app died on the Reveal press, with the walkout never drawing
 * a frame.
 *
 * ⚠ RESOLVED ONCE, AT MODULE LOAD, ON THE JS THREAD. A worklet may capture
 * plain objects of numbers, so `START[5]` costs nothing and cannot throw. If
 * you need another fact about a beat in an animated style, hoist it here rather
 * than reaching back into `BEATS`.
 */
const START: Record<number, number> = {};
const END: Record<number, number> = {};
for (const b of BEATS) {
  START[b.num] = b.startMs;
  END[b.num] = b.endMs;
}

/**
 * The haptic styles, read off the module HERE rather than inside the reaction.
 *
 * ⚠ `Haptics.ImpactFeedbackStyle.Light` INSIDE A WORKLET CAPTURES `Haptics`
 * ITSELF — a native module object, which does not serialise to the UI thread.
 * Hoisted, the worklet captures three plain enum values and nothing else.
 */
const TAP_LIGHT = Haptics.ImpactFeedbackStyle.Light;
const TAP_MEDIUM = Haptics.ImpactFeedbackStyle.Medium;
const TAP_HEAVY = Haptics.ImpactFeedbackStyle.Heavy;

export type WalkoutOpponent = {
  name: string;
  /** For the avatar gradient — `hash(userId)`, so they are the colour they are everywhere else. */
  userId: string | null;
  /** Clue 1. */
  record: { won: number; tied: number; lost: number };
  /** Clue 2. */
  duelPoints: number;
  /** Clue 3. Null for an unranked entry — see the clue's own note. */
  rank: number | null;
};

type Props = {
  matchweek: number;
  opponent: WalkoutOpponent;
  /**
   * Called however the ceremony ends — finished, skipped, or backed out of.
   *
   * ⚠ THE CALLER STAMPS `last_reveal_seen_at`, AND MUST DO IT ON EVERY PATH.
   * That is the accessibility floor: if this cannot render for somebody, they
   * press Reveal, close it, and the header tells them who they are playing.
   * Nobody may be trapped behind an animation that will not play.
   */
  onClose: () => void;
};

export function ShowdownWalkout({ matchweek, opponent, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  /** The whole ceremony's clock, in milliseconds. Everything reads this. */
  const t = useSharedValue(0);

  useEffect(() => {
    // ⚠ LINEAR, and the beats do the shaping. Easing the CLOCK would ease every
    // curve twice — the climax would overshoot an already-overshot value, and
    // the clue windows would stop being the lengths they were measured to be.
    t.value = withTiming(WALKOUT_MS, { duration: WALKOUT_MS, easing: Easing.linear });
    return () => cancelAnimation(t);
  }, [t]);

  const tap = useCallback((style: Haptics.ImpactFeedbackStyle) => {
    // ⚠ Swallowed: haptics are unavailable on a simulator and on devices with
    // the setting off, and a rejected promise there must not take the ceremony
    // down with it. Established call shape in this codebase.
    Haptics.impactAsync(style).catch(() => {});
  }, []);

  /**
   * ⚠ ONE CLOCK. These compare against the SAME constants the styles below
   * interpolate on, on the same thread, in the same frame. See the header.
   */
  const c0 = CLUE_AT[0];
  const c1 = CLUE_AT[1];
  const c2 = CLUE_AT[2];
  useAnimatedReaction(
    () => t.value,
    (now, prev) => {
      if (prev === null) return;
      const crossed = (m: number) => prev < m && now >= m;
      if (crossed(c0) || crossed(c1) || crossed(c2)) {
        runOnJS(tap)(TAP_LIGHT);
      }
      if (crossed(THRESHOLD_AT)) runOnJS(tap)(TAP_HEAVY);
      if (crossed(NAME_AT)) runOnJS(tap)(TAP_MEDIUM);
    },
    [c0, c1, c2, tap],
  );

  // ------------------------------------------------------------- the tracks

  /**
   * The dolly. One number the whole scene is built on: 0 is the far end of the
   * tunnel, 1 is the threshold, and past 1 the camera has stopped.
   */
  const dolly: BeatSeg[] = [
    { start: 0, end: END[1], easing: EASE.ambient, from: 0, to: 0.08 },
    { start: START[2], end: END[2], easing: EASE.anticipate, from: 0.08, to: 0.3 },
    { start: START[3], end: END[3], easing: EASE.ambient, from: 0.3, to: 0.55 },
    { start: START[4], end: END[4], easing: EASE.reveal, from: 0.55, to: 0.86 },
    { start: START[5], end: END[5], easing: EASE.climax, from: 0.86, to: 1 },
    { start: START[6], end: END[6], easing: EASE.settle, from: 1, to: 1.04 },
  ];

  const archStyle = useAnimatedStyle(() => {
    const d = beatValue(t.value, dolly);
    return {
      // The arch rushes past the camera as the figures cross it.
      transform: [{ scale: 0.55 + d * 2.4 }],
      opacity: d > 1 ? Math.max(0, 1 - (d - 1) * 12) : 1,
    };
  });

  const blowoutStyle = useAnimatedStyle(() => {
    const glow = beatValue(t.value, [
      { start: 0, end: END[2], easing: EASE.anticipate, from: 0.18, to: 0.35 },
      { start: START[3], end: END[4], easing: EASE.ambient, from: 0.35, to: 0.6 },
      // The flare peaks AT the threshold and decays — the spec's beat 5.
      { start: START[5], end: END[5], easing: EASE.climax, from: 0.6, to: 1 },
      { start: START[6], end: END[7], easing: EASE.settle, from: 1, to: 0.42 },
    ]);
    return { opacity: glow, transform: [{ scale: 0.6 + glow * 1.5 }] };
  });

  /**
   * The camera shake, beat 5 only.
   *
   * ⚠ ±3px, PER THE SPEC, AND ONLY FOR 300ms. A shake that outlives its beat
   * reads as a rendering fault rather than an impact — and on a phone held in
   * one hand it is genuinely unpleasant.
   */
  const shakeStyle = useAnimatedStyle(() => {
    const now = t.value;
    if (now < THRESHOLD_AT || now > END[5]) return { transform: [{ translateX: 0 }] };
    const k = (now - THRESHOLD_AT) / (END[5] - THRESHOLD_AT);
    // Decaying oscillation, so it settles instead of stopping dead.
    const amp = 3 * (1 - k);
    return { transform: [{ translateX: Math.sin(now / 18) * amp }] };
  });

  /** Both figures: they rise out of the dark and gain their colour at the threshold. */
  const figuresStyle = useAnimatedStyle(() => {
    const appear = beatValue(t.value, [
      { start: START[3], end: END[3], easing: EASE.ambient, from: 0, to: 0.55 },
      { start: START[4], end: END[4], easing: EASE.reveal, from: 0.55, to: 0.9 },
      { start: START[5], end: END[6], easing: EASE.settle, from: 0.9, to: 1 },
    ]);
    return {
      opacity: appear,
      transform: [{ scale: 0.7 + appear * 0.3 }, { translateY: (1 - appear) * 40 }],
    };
  });

  const nameStyle = useAnimatedStyle(() => {
    const rise = beatValue(t.value, [
      { start: NAME_AT, end: END[7], easing: EASE.hero, from: 0, to: 1 },
    ]);
    return { opacity: rise, transform: [{ translateY: (1 - rise) * 28 }] };
  });

  const lockStyle = useAnimatedStyle(() => ({
    opacity: beatValue(t.value, [
      { start: START[8], end: END[8], easing: EASE.graphic, from: 0, to: 1 },
    ]),
  }));

  // --------------------------------------------------------------- the scene

  const vanishY = height * 0.46;
  const archW = Math.min(width * 0.78, 340);
  const archH = archW * 1.15;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.ground }}>
      {/* The floor, lifting toward the light. Static — the dolly is carried by
          the arch and the figures, which is cheaper and reads the same. */}
      <LinearGradient
        colors={[C.ground, C.groundLift, C.ground]}
        locations={[0, 0.5, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <Animated.View style={[{ flex: 1 }, shakeStyle]}>
        {/* ---------- the blowout, behind everything ---------- */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: width / 2 - width * 0.75,
              top: vanishY - width * 0.75,
              width: width * 1.5,
              height: width * 1.5,
            },
            blowoutStyle,
          ]}
        >
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Defs>
              <SvgGradient id="flare" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={C.blowout} stopOpacity="0.95" />
                <Stop offset="0.45" stopColor={C.ray} stopOpacity="0.35" />
                <Stop offset="1" stopColor={C.ray} stopOpacity="0" />
              </SvgGradient>
            </Defs>
            {/* ⚠ Rays as static geometry inside a view that scales. Rotating
                them individually would need SVG transforms, which this library
                ignores — see the file header. */}
            {Array.from({ length: 14 }).map((_, i) => {
              const a = (i / 14) * Math.PI * 2;
              return (
                <Line
                  key={i}
                  x1={50}
                  y1={50}
                  x2={50 + Math.cos(a) * 52}
                  y2={50 + Math.sin(a) * 52}
                  stroke="url(#flare)"
                  strokeWidth={i % 2 === 0 ? 2.2 : 0.9}
                />
              );
            })}
            <Rect x="0" y="0" width="100" height="100" fill="url(#flare)" opacity={0.5} />
          </Svg>
        </Animated.View>

        {/* ---------- the neon arch ---------- */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: width / 2 - archW / 2,
              top: vanishY - archH * 0.62,
              width: archW,
              height: archH,
            },
            archStyle,
          ]}
        >
          <Svg width="100%" height="100%" viewBox="0 0 100 115">
            <Rect
              x="3" y="3" width="94" height="112" rx="26"
              fill="none" stroke={C.magenta} strokeWidth="3.4" opacity={0.95}
            />
            <Rect
              x="10" y="10" width="80" height="105" rx="20"
              fill="none" stroke={C.cyan} strokeWidth="2.4" opacity={0.9}
            />
          </Svg>
        </Animated.View>

        {/* ---------- the two figures ---------- */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: vanishY - 30,
              left: 0,
              right: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 26,
            },
            figuresStyle,
          ]}
        >
          <Figure t={t} label="You" userId={null} silhouetteOnly />
          <Figure t={t} label={opponent.name} userId={opponent.userId} silhouetteOnly={false} />
        </Animated.View>

        {/* ---------- the clues ---------- */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, top: height * 0.66, paddingHorizontal: 28 }}
        >
          <Clue
            t={t}
            index={0}
            label="Their record"
            value={`${opponent.record.won}W  ${opponent.record.tied}T  ${opponent.record.lost}L`}
          />
          <Clue
            t={t}
            index={1}
            label="Duel points"
            value={opponent.duelPoints.toLocaleString()}
          />
          <Clue
            t={t}
            index={2}
            label="Where that puts them"
            /* ⚠ A dash, never "0th". An entry the engine has not scored has no
               position, and printing one would invent it — the same rule the
               band's corner follows. */
            value={opponent.rank === null ? 'Unranked' : ordinal(opponent.rank)}
          />
        </View>

        {/* ---------- the name ---------- */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: insets.bottom + 132,
              alignItems: 'center',
              paddingHorizontal: 24,
            },
            nameStyle,
          ]}
        >
          <View
            style={{
              paddingHorizontal: 22,
              paddingVertical: 12,
              borderRadius: 16,
              backgroundColor: C.plate,
              borderWidth: 1.5,
              borderColor: C.cyan,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontFamily: fontFamilies.black,
                fontSize: 30,
                lineHeight: 36,
                color: C.ink,
                textAlign: 'center',
              }}
            >
              {opponent.name}
            </Text>
          </View>
        </Animated.View>

        {/* ---------- the lock card ---------- */}
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 96, alignItems: 'center' },
            lockStyle,
          ]}
        >
          <Text
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 11,
              letterSpacing: 2.2,
              textTransform: 'uppercase',
              color: C.magenta,
            }}
          >
            Matchweek {matchweek}
          </Text>
        </Animated.View>
      </Animated.View>

      {/*
        ⚠ SKIP IS ON SCREEN FROM THE FIRST FRAME AND NEVER LEAVES. It is the
        accessibility floor and the disclosure gate's answer in one: whatever
        happens to the animation, one press ends it and the header names the
        opponent. It sits OUTSIDE the shake so it does not move under the thumb.
      */}
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Skip the walkout"
        hitSlop={16}
        style={({ pressed }) => ({
          position: 'absolute',
          top: insets.top + 10,
          right: 18,
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: 'rgba(255,255,255,0.12)',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: 13, color: C.ink }}>Skip</Text>
      </Pressable>

      {/*
        The whole scene is tappable to finish early, which is what most people
        will actually do on a second duel. It is beneath the Skip button in the
        tree so Skip wins the touch where they overlap.
      */}
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close the walkout"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: -1 }}
      />
    </View>
  );
}

// ---------------------------------------------------------------- a figure

function Figure({
  t,
  label,
  userId,
  silhouetteOnly,
}: {
  /**
   * ⚠ THE CLOCK, NOT THE STYLE.
   *
   * Passing a `useAnimatedStyle` result down as a prop needs the annotation
   * `ReturnType<typeof useAnimatedStyle>`, and Reanimated 4's `DefaultStyle`
   * does not satisfy its own `style` union — that mismatch is the source of all
   * five existing type errors in `ShowdownDuelHeader`. Handing down the shared
   * value and building the style here has no such problem, and keeps the figure
   * self-contained besides.
   */
  t: ReturnType<typeof useSharedValue<number>>;
  label: string;
  userId: string | null;
  /** The viewer's own side stays dark: this is not a reveal of you. */
  silhouetteOnly: boolean;
}) {
  const SIZE = 86;

  /**
   * The opponent's own colour, held back until the threshold.
   *
   * ⚠ THIS IS THE SILHOUETTE'S WHOLE JOB. Their gradient is `hash(userId)` and
   * it is the same colour they are in Banter and on the leaderboard — so
   * showing it during the clues would identify them to anybody who has seen it,
   * which is everybody. It arrives at beat 5, with the light.
   */
  const colourStyle = useAnimatedStyle(() => ({
    opacity: beatValue(t.value, [
      { start: START[5], end: END[6], easing: EASE.settle, from: 0, to: 1 },
    ]),
  }));
  return (
    <View style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.silhouette }} />
      {userId && !silhouetteOnly ? (
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, colourStyle]}>
          <LinearGradient
            colors={[...gradientForUser(userId)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: SIZE / 2 }}
          />
        </Animated.View>
      ) : null}
      {/*
        ⚠ THE INITIAL IS A CLUE, SO IT FADES IN WITH THE COLOUR — but only on
        their side. A single letter narrows a ten-person pool hard: "P" over a
        silhouette during clue 2 answers the question the clues are still
        asking. Yours is visible throughout, because you are not the secret.
      */}
      {silhouetteOnly ? (
        <View
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}
        >
          <Initial label={label} />
        </View>
      ) : (
        <Animated.View
          style={[
            { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
            colourStyle,
          ]}
        >
          <Initial label={label} />
        </Animated.View>
      )}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          borderRadius: SIZE / 2,
          borderWidth: 2.5,
          borderColor: silhouetteOnly ? 'rgba(255,255,255,0.22)' : C.cyan,
        }}
      />
    </View>
  );
}

// ----------------------------------------------------------------- a clue

/**
 * One fact, arriving and then giving way to the next.
 *
 * ⚠ EACH CLUE FADES BEFORE THE NEXT ARRIVES rather than stacking. Three facts
 * on screen at once is a table, and a table is read all at once — which removes
 * the deduction the sequence exists to create. Broad to narrow only works if
 * you meet them in order.
 */
function Clue({
  t,
  index,
  label,
  value,
}: {
  t: ReturnType<typeof useSharedValue<number>>;
  index: number;
  label: string;
  value: string;
}) {
  const at = CLUE_AT[index];
  const out = CLUE_AT[index + 1] ?? THRESHOLD_AT;

  const style = useAnimatedStyle(() => {
    const inn = beatValue(t.value, [
      { start: at, end: at + 260, easing: EASE.settle, from: 0, to: 1 },
      { start: out - 220, end: out, easing: EASE.graphic, from: 1, to: 0 },
    ]);
    return {
      opacity: inn,
      transform: [{ translateY: (1 - inn) * 14 }],
    };
  });

  return (
    <Animated.View style={[{ position: 'absolute', left: 28, right: 28, alignItems: 'center' }, style]}>
      <Text
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 10,
          letterSpacing: 1.8,
          textTransform: 'uppercase',
          color: C.dim,
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          fontFamily: fontFamilies.black,
          fontSize: 34,
          lineHeight: 40,
          color: C.ink,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </Animated.View>
  );
}

function Initial({ label }: { label: string }) {
  return (
    <Text style={{ fontFamily: fontFamilies.black, fontSize: 28, lineHeight: 34, color: C.ink }}>
      {getInitials(label)}
    </Text>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
