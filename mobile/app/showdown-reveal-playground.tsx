// Showdown tunnel-walk-out reveal — interactive playground.
//
// Implements the beat structure + easings from
// `assets/showdown-storyboard/MOTION_SPEC.md` using Reanimated 4 + placeholder
// shapes (no Skia yet). Lets you play the 4-second reveal, scrub to any beat,
// and read the easing name + beat label live as it plays.
//
// Open via deep link from any browser/Safari on the dev phone:
//     officepools://showdown-reveal-playground
// Or programmatically from anywhere: router.push('/showdown-reveal-playground')
//
// Once we land on a mood + timing we like here, the next step is to swap the
// placeholder rectangles for real silhouettes + Skia-composited light shafts.
// The timing + easing + beat structure should not change at that point.

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useHomeData } from '@/lib/HomeDataProvider';
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useDerivedValue } from 'react-native-reanimated';

// Lazy-load Skia so the playground keeps rendering on a dev build that
// hasn't yet been rebuilt with the new native module. Without this, the
// require at the top of the module would throw at first navigation and
// take the whole playground down with it. After a dev-build rebuild,
// SkiaApi resolves and the lens flare lights up automatically.
let SkiaApi: typeof import('@shopify/react-native-skia') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SkiaApi = require('@shopify/react-native-skia');
} catch {
  // Native Skia bindings not present in this dev build yet — the
  // <SkiaLensFlare/> component will render null until rebuilt.
}

// ============================================================================
// Spec — mirrors assets/showdown-storyboard/MOTION_SPEC.md
// ============================================================================

const REVEAL_DURATION_MS = 4000;

// Interactive mode: swipe-up gesture as a trigger.
// -------------------------------------------------------------------------
// Any clear upward fling on the canvas fires the spec-paced reveal — same
// playback that the PLAY button drives. The gesture signals INTENT ("yes,
// show me my matchup"), not control. The motion design lands the same way
// every time, the in-app reveal matches the eventual shareable artifact,
// and the gesture stays tactile because it's a real physical action — just
// a discrete one, not a continuous drag.
//
// Trade-off accepted: less moment-to-moment tactile feedback than direct
// drag control, but the motion design and the cinematic timing matter more
// for what this reveal is supposed to be.

type Beat = {
  num: number;
  label: string;
  startMs: number;
  endMs: number;
  easingName: keyof typeof EASING;
};

const BEATS: Beat[] = [
  { num: 1, label: 'Establish',          startMs:    0, endMs:  400, easingName: 'ambient'    },
  { num: 2, label: 'Atmosphere build',   startMs:  400, endMs: 1000, easingName: 'anticipate' },
  { num: 3, label: 'Silhouettes emerge', startMs: 1000, endMs: 1400, easingName: 'ambient'    },
  { num: 4, label: 'Stride forward',     startMs: 1400, endMs: 1900, easingName: 'reveal'     },
  { num: 5, label: 'Threshold (climax)', startMs: 1900, endMs: 2200, easingName: 'climax'     },
  { num: 6, label: 'Full reveal',        startMs: 2200, endMs: 2700, easingName: 'settle'     },
  { num: 7, label: 'Hero shot',          startMs: 2700, endMs: 3300, easingName: 'hero'       },
  { num: 8, label: 'Lock card',          startMs: 3300, endMs: 4000, easingName: 'graphic'    },
];

// Cubic-bezier easings copied from MOTION_SPEC.md SHOWDOWN_EASINGS.
// Reanimated 4's `Easing.bezier(...)` returns an EasingFunctionFactory (an
// object with a `.factory()` method), not a directly-callable function. We
// resolve them via `.factory()` once at module load so beatInterpolate can
// call them as plain `(t) => number` worklets. `Easing.linear` is already
// a function, so it goes through as-is.
const EASING = {
  ambient:    Easing.linear,
  anticipate: Easing.bezier(0.32, 0,    0.67, 0   ).factory(),
  reveal:     Easing.bezier(0.25, 1,    0.5,  1   ).factory(),
  climax:     Easing.bezier(0.34, 1.56, 0.64, 1   ).factory(),
  settle:     Easing.bezier(0.33, 1,    0.68, 1   ).factory(),
  hero:       Easing.bezier(0.22, 1,    0.36, 1   ).factory(),
  graphic:    Easing.bezier(0.65, 0,    0.35, 1   ).factory(),
} as const;

// Per-beat animation segment. Applies a custom easing curve inside the
// [start, end] window and holds the `to` value after the window ends.
type BeatSeg = {
  start: number;
  end: number;
  easing: (t: number) => number;
  from: number;
  to: number;
};

// Worklet helper — given the current progress in ms and an ordered list of
// beat segments, returns the eased value at that moment. Replaces linear
// interpolate() so the spec'd per-beat cubic-beziers actually shape the
// motion (anticipation eases in, climax overshoots, settle decays, etc.)
// instead of every transition being a straight line through sample points.
function beatInterpolate(t: number, segments: BeatSeg[]): number {
  'worklet';
  let lastTo = segments[0].from;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (t < seg.start) return lastTo;
    if (t < seg.end) {
      const local = (t - seg.start) / (seg.end - seg.start);
      const eased = seg.easing(local);
      return seg.from + (seg.to - seg.from) * eased;
    }
    lastTo = seg.to;
  }
  return lastTo;
}

// Stable per-user colour palette. Hash the user_id → pick from a curated set
// of distinguishable hues. Same user always gets the same colour across
// surfaces, which matters once this data wiring is real in production.
const CHIP_PALETTE = [
  '#7c3aed', // violet
  '#0891b2', // teal
  '#16a34a', // green
  '#dc2626', // red
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#ef4444', // rose
  '#f97316', // orange
];

function colourFromId(id: string | null | undefined): string {
  if (!id) return CHIP_PALETTE[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return CHIP_PALETTE[Math.abs(h) % CHIP_PALETTE.length];
}

function initialOf(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return (trimmed.charAt(0) || '?').toUpperCase();
}

// Bundle of identity props the name plates render. Matches the data
// injection contract in MOTION_SPEC.md.
type PlayerIdentity = {
  displayName: string;
  initial: string;
  colour: string;
};

// Mood palette — Cinematic, the v1 default per the storyboard review.
const COLOURS = {
  deepNavy:      '#0a1a3e',
  gold:          '#d4af37',
  goldDim:       '#7a6420',
  spotlight:     '#fff7d6',
  tunnelWall:    '#1c2540',
  silhouette:    '#0c0c14',
  silhouetteLit: '#1f263d',
  namePlate:     'rgba(10, 26, 62, 0.85)',
  namePlateGold: '#d4af37',
};

// ============================================================================
// Screen
// ============================================================================

export default function ShowdownRevealPlaygroundScreen() {
  // Animated progress in MILLISECONDS (matches BEATS table directly — easier to
  // read than 0..1 normalised).
  const progress = useSharedValue(0);

  const [activeBeatNum, setActiveBeatNum] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [displayedMs, setDisplayedMs] = useState(0);
  const [showCenterline, setShowCenterline] = useState(false);
  const [revealMode, setRevealMode] = useState<'passive' | 'interactive'>('passive');
  const [canvasAspect, setCanvasAspect] = useState<'landscape' | 'portrait'>(
    'landscape',
  );

  // Real identity wiring. PLAYER A is the signed-in super admin so the demo
  // reflects "your" matchup. PLAYER B stays a placeholder until we hook this
  // up to the actual Showdown pairing table (which doesn't exist pre-Phase 3a).
  // When the pairing table lands, swap the placeholder for the resolved
  // opponent from `pool_id + gameweek`.
  const { data: homeData } = useHomeData();
  const playerA: PlayerIdentity = {
    displayName: (homeData?.fullName ?? homeData?.username ?? 'YOU').toUpperCase(),
    initial: initialOf(homeData?.fullName ?? homeData?.username ?? 'Y'),
    colour: colourFromId(homeData?.appUserId),
  };
  const playerB: PlayerIdentity = {
    displayName: 'OPPONENT',
    initial: 'O',
    colour: colourFromId('placeholder-opponent-id'),
  };

  // 16:9 reads as broadcast / cinema (matches the current spec). 3:4 reads
  // as portrait mobile card (closer to what an in-app matchup card on a
  // phone will actually look like). 9:16 is a different ratio still — story
  // / reel format — worth its own pass later.
  const aspectRatio = canvasAspect === 'portrait' ? 3 / 4 : 16 / 9;


  // Mirror the shared `progress` value to JS state so the beat label + timer
  // update during playback.
  useAnimatedReaction(
    () => progress.value,
    (current) => {
      const beat =
        BEATS.find((b) => current >= b.startMs && current < b.endMs) ??
        BEATS[BEATS.length - 1];
      runOnJS(setActiveBeatNum)(beat.num);
      runOnJS(setDisplayedMs)(Math.round(current));
    },
  );

  // Reset playback flag when timing animation finishes (or is cancelled).
  useEffect(() => {
    return () => cancelAnimation(progress);
  }, [progress]);

  const play = useCallback(() => {
    const startFrom = progress.value >= REVEAL_DURATION_MS ? 0 : progress.value;
    const remaining = REVEAL_DURATION_MS - startFrom;
    progress.value = startFrom;
    setIsPlaying(true);
    progress.value = withTiming(
      REVEAL_DURATION_MS,
      { duration: remaining, easing: Easing.linear },
      (finished) => {
        if (finished) {
          runOnJS(setIsPlaying)(false);
        }
      },
    );
  }, [progress]);

  const pause = useCallback(() => {
    cancelAnimation(progress);
    setIsPlaying(false);
  }, [progress]);

  const reset = useCallback(() => {
    cancelAnimation(progress);
    progress.value = 0;
    setIsPlaying(false);
  }, [progress]);

  const scrubToBeat = useCallback(
    (beat: Beat) => {
      cancelAnimation(progress);
      progress.value = beat.startMs;
      setIsPlaying(false);
    },
    [progress],
  );

  // Toggle between passive (PLAY button) and interactive (swipe-up) playback.
  // Switching modes always resets to the closed/0ms state so we're comparing
  // the same reveal from the beginning each time.
  const switchMode = useCallback(
    (next: 'passive' | 'interactive') => {
      cancelAnimation(progress);
      progress.value = 0;
      setIsPlaying(false);
      setRevealMode(next);
    },
    [progress],
  );

  // Swipe-up to trigger the reveal. Fling detection (not pan) gives a
  // clean directional "intent" gesture — fast upward flick on the canvas
  // fires the same spec-paced playback the PLAY button drives. Guarded so
  // a second swipe during playback is a no-op, not a hiccup.
  const handleSwipeUp = useCallback(() => {
    if (!isPlaying) play();
  }, [isPlaying, play]);

  const swipeUpGesture = Gesture.Fling()
    .direction(Directions.UP)
    .onStart(() => {
      'worklet';
      runOnJS(handleSwipeUp)();
    });

  const activeBeat = BEATS[activeBeatNum - 1];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Showdown reveal', headerStyle: { backgroundColor: COLOURS.deepNavy }, headerTintColor: '#fff' }} />

      <View style={styles.header}>
        <Text style={styles.title}>Showdown reveal playground</Text>
        <Text style={styles.subtitle}>
          {revealMode === 'interactive'
            ? 'Swipe up on the canvas to open the tunnel'
            : '4-second tunnel walk-out · Cinematic mood · placeholder geometry'}
        </Text>
      </View>

      <AspectToggle aspect={canvasAspect} onChange={setCanvasAspect} />
      <ModeToggle mode={revealMode} onChange={switchMode} />

      {revealMode === 'interactive' ? (
        <GestureDetector gesture={swipeUpGesture}>
          <RevealCanvas
            progress={progress}
            showCenterline={showCenterline}
            showSwipePrompt
            aspectRatio={aspectRatio}
            playerA={playerA}
            playerB={playerB}
          />
        </GestureDetector>
      ) : (
        <RevealCanvas
          progress={progress}
          showCenterline={showCenterline}
          aspectRatio={aspectRatio}
          playerA={playerA}
          playerB={playerB}
        />
      )}

      <BeatHeadsUp activeBeat={activeBeat} ms={displayedMs} />

      <Controls
        isPlaying={isPlaying}
        onPlay={play}
        onPause={pause}
        onReset={reset}
        showCenterline={showCenterline}
        onToggleCenterline={() => setShowCenterline((v) => !v)}
      />

      <BeatScrubber activeBeatNum={activeBeatNum} onSelect={scrubToBeat} />

      <Footer />
    </SafeAreaView>
  );
}

// ============================================================================
// Skia lens flare — Skia-rendered bloom at the climax beat.
// ----------------------------------------------------------------------------
// Replaces the previous translucent-circle View-based flare with a real
// Skia composition: a wide bloomed outer halo + a small intense inner hot
// spot, both blurred and colour-shifted. Sits above the figures so it reads
// as a camera-artifact lens flare rather than a light source in the scene.
//
// The opacity + radius animations come straight from the Reanimated progress
// shared value via `useDerivedValue` — same UI-thread driver as the rest of
// the playground, no JS-thread frame syncs needed.
// ============================================================================

function SkiaLensFlare({
  progress,
  width,
  height,
}: {
  progress: Animated.SharedValue<number>;
  width: number;
  height: number;
}) {
  // Hooks must run unconditionally (React rules), so derive values first
  // and short-circuit on the Skia availability check below.
  const opacity = useDerivedValue(() =>
    interpolate(
      progress.value,
      [1700, 1900, 2200, 2500],
      [0, 0.85, 1, 0],
      Extrapolation.CLAMP,
    ),
  );
  const outerR = useDerivedValue(() =>
    interpolate(
      progress.value,
      [1700, 2200, 2500],
      [50, 170, 110],
      Extrapolation.CLAMP,
    ),
  );
  const innerR = useDerivedValue(() =>
    interpolate(
      progress.value,
      [1700, 2200, 2500],
      [12, 55, 30],
      Extrapolation.CLAMP,
    ),
  );

  if (!SkiaApi) return null;
  const {
    BlurMask,
    Canvas: SkiaCanvas,
    Circle: SkiaCircle,
    Group: SkiaGroup,
  } = SkiaApi;

  const cx = width / 2;
  const cy = height * 0.45;

  return (
    <SkiaCanvas
      style={[StyleSheet.absoluteFill, { width, height }]}
      pointerEvents="none"
    >
      {/* Outer gold halo — wide blur, low opacity, gives the warm spill. */}
      <SkiaGroup opacity={opacity}>
        <BlurMask blur={32} style="solid" />
        <SkiaCircle cx={cx} cy={cy} r={outerR} color="#fff7d6" />
      </SkiaGroup>
      {/* Inner white-hot core — tight blur, full strength, the "bulb". */}
      <SkiaGroup opacity={opacity}>
        <BlurMask blur={8} style="solid" />
        <SkiaCircle cx={cx} cy={cy} r={innerR} color="#ffffff" />
      </SkiaGroup>
    </SkiaCanvas>
  );
}

// ============================================================================
// Athlete silhouette — single SVG, front-facing, generic athletic build.
// ----------------------------------------------------------------------------
// • Single dark fill (`COLOURS.silhouette`) — figures stay anonymous through
//   the whole 4s reveal, which matches the spec ("two athletes squared off
//   in a tunnel") and means avatars aren't required.
// • ViewBox 100×200 so the figure scales cleanly to any size; the wrapper
//   sets pixel dimensions.
// • Mirror-symmetric about x=50 so left and right placements are
//   geometrically identical — eliminates the rectangle-era visual imbalance.
// • No anatomy is animated yet (no walk cycle / pose change). That's a
//   later iteration; for now the parent View handles all transform animation.
// ============================================================================

function AthleteSilhouette() {
  return (
    <Svg
      viewBox="0 0 100 200"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMax meet"
    >
      {/* Head */}
      <Circle cx="50" cy="22" r="15" fill={COLOURS.silhouette} />
      {/* Neck */}
      <Rect x="44" y="34" width="12" height="8" fill={COLOURS.silhouette} />
      {/* Torso + legs (single path, mirror-symmetric about x=50) */}
      <Path
        d="
          M 25 50
          L 75 50
          L 73 80
          L 70 110
          L 67 135
          L 65 200
          L 53 200
          L 50 145
          L 47 200
          L 35 200
          L 33 135
          L 30 110
          L 27 80
          Z
        "
        fill={COLOURS.silhouette}
      />
      {/* Arms (mirror pair, hanging at sides) */}
      <Path
        d="M 18 52 L 25 52 L 28 130 L 22 135 Z"
        fill={COLOURS.silhouette}
      />
      <Path
        d="M 75 52 L 82 52 L 78 135 L 72 130 Z"
        fill={COLOURS.silhouette}
      />
    </Svg>
  );
}

// ============================================================================
// Canvas — the 16:9 area where the animation plays
// ============================================================================

function RevealCanvas({
  progress,
  showCenterline,
  showSwipePrompt = false,
  aspectRatio = 16 / 9,
  playerA,
  playerB,
}: {
  progress: Animated.SharedValue<number>;
  showCenterline: boolean;
  showSwipePrompt?: boolean;
  aspectRatio?: number;
  playerA: PlayerIdentity;
  playerB: PlayerIdentity;
}) {
  // Measure canvas dimensions so the Skia overlay knows where to draw.
  // Skia uses absolute pixel coords (not percentages), so it needs the real
  // size of the canvas at the moment it mounts/relayouts.
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  // Background — slight brightening through the climax beat
  const backgroundStyle = useAnimatedStyle(() => {
    const colour = interpolateColor(
      progress.value,
      [0, 1900, 2200, 4000],
      [COLOURS.deepNavy, COLOURS.deepNavy, '#1a2c5a', '#152448'],
    );
    return { backgroundColor: colour };
  });

  // Distant doorway — small at first, grows + brightens, fills screen at climax
  const doorwayStyle = useAnimatedStyle(() => {
    const width = interpolate(
      progress.value,
      [0, 1000, 1900, 2200, 4000],
      [40, 80, 140, 320, 320],
      Extrapolation.CLAMP,
    );
    const height = interpolate(
      progress.value,
      [0, 1000, 1900, 2200, 4000],
      [60, 120, 200, 200, 200],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      progress.value,
      [0, 400, 2200, 4000],
      [0.55, 0.75, 1, 0.7],
      Extrapolation.CLAMP,
    );
    return { width, height, opacity };
  });

  // (The View-based flare was removed in favour of <SkiaLensFlare/>, which
  // composes a bloomed gold halo + white-hot core via Skia. The animation
  // contract is identical — same opacity and radius curves driven by the
  // progress shared value — just rendered with real GPU blur.)

  // Tunnel walls — visible during the dolly-in, fade out past the threshold
  const tunnelStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      progress.value,
      [0, 400, 1900, 2200],
      [0.9, 1, 0.85, 0],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Hero subject A — left silhouette.
  // Scale + translateX now use the spec'd per-beat easings so the motion
  // actually shapes: beats 3–4 reveal-curve in, beat 5 overshoots at climax,
  // beat 6 settles. The squared-off translate uses `hero` (ease-out-quint)
  // so it snaps decisively rather than drifting. Opacity stays linear —
  // the fade-in is just connective tissue, not a beat moment.
  const heroAStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      progress.value,
      [0, 1000, 1400, 4000],
      [0, 0, 1, 1],
      Extrapolation.CLAMP,
    );
    const scale = beatInterpolate(progress.value, [
      { start: 1000, end: 1400, easing: EASING.reveal,  from: 0.4, to: 0.7  },
      { start: 1400, end: 1900, easing: EASING.reveal,  from: 0.7, to: 1.0  },
      { start: 1900, end: 2200, easing: EASING.climax,  from: 1.0, to: 1.1  },
      { start: 2200, end: 2700, easing: EASING.settle,  from: 1.1, to: 1.05 },
    ]);
    const translateX = beatInterpolate(progress.value, [
      { start: 2700, end: 3300, easing: EASING.hero, from: 0, to: -28 },
    ]);
    return {
      opacity,
      transform: [{ translateX }, { scale }],
    };
  });

  // Hero subject B — right silhouette (mirrors A).
  const heroBStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      progress.value,
      [0, 1000, 1400, 4000],
      [0, 0, 1, 1],
      Extrapolation.CLAMP,
    );
    const scale = beatInterpolate(progress.value, [
      { start: 1000, end: 1400, easing: EASING.reveal,  from: 0.4, to: 0.7  },
      { start: 1400, end: 1900, easing: EASING.reveal,  from: 0.7, to: 1.0  },
      { start: 1900, end: 2200, easing: EASING.climax,  from: 1.0, to: 1.1  },
      { start: 2200, end: 2700, easing: EASING.settle,  from: 1.1, to: 1.05 },
    ]);
    const translateX = beatInterpolate(progress.value, [
      { start: 2700, end: 3300, easing: EASING.hero, from: 0, to: 28 },
    ]);
    return {
      opacity,
      transform: [{ translateX }, { scale }],
    };
  });

  // Camera shake at the threshold (climax) beat — applies to the whole canvas.
  // Keyframes sum to zero (+3 -3 +3 -3) so there's no net horizontal drift —
  // the canvas returns to dead-centre when the climax ends.
  const shakeStyle = useAnimatedStyle(() => {
    const shake = interpolate(
      progress.value,
      [1900, 1970, 2050, 2130, 2200],
      [0, 3, -3, 3, 0],
      Extrapolation.CLAMP,
    );
    return { transform: [{ translateX: shake }] };
  });

  // Name plates rise from bottom at the hero shot beat. translateY uses
  // `hero` (ease-out-quint) so plates snap up decisively rather than drifting.
  const namePlatesStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      progress.value,
      [2500, 2700, 4000],
      [0, 1, 1],
      Extrapolation.CLAMP,
    );
    const translateY = beatInterpolate(progress.value, [
      { start: 2500, end: 3300, easing: EASING.hero, from: 40, to: 0 },
    ]);
    return { opacity, transform: [{ translateY }] };
  });

  // Gameweek lockup fades in at the lock card beat with `graphic` (ease-in-out
  // -cubic) so the title eases on rather than popping.
  const gameweekStyle = useAnimatedStyle(() => {
    const opacity = beatInterpolate(progress.value, [
      { start: 3100, end: 3500, easing: EASING.graphic, from: 0, to: 1 },
    ]);
    return { opacity };
  });

  // Tunnel doors — the primary reveal surface. Cover the canvas at progress=0;
  // slide apart and clear the frame by the climax beat. The same animation
  // drives both passive playback (doors part as time advances) and interactive
  // mode (your swipe drags them apart directly). The gold seam on the inner
  // edge of each door is the bright sliver of light leaking through when
  // closed — visually sells the "light behind the doors" effect.
  //
  // The door motion is now a two-beat curve: `anticipate` (ease-in-cubic) for
  // the slow-build creak as they start to open, then `climax` (overshoot) at
  // the threshold so they SNAP open instead of decelerating into nothing.
  const doorLeftStyle = useAnimatedStyle(() => {
    const translateX = beatInterpolate(progress.value, [
      { start: 0,    end: 1700, easing: EASING.anticipate, from: 0,    to: -260 },
      { start: 1700, end: 2200, easing: EASING.climax,     from: -260, to: -320 },
    ]);
    return { transform: [{ translateX }] };
  });
  const doorRightStyle = useAnimatedStyle(() => {
    const translateX = beatInterpolate(progress.value, [
      { start: 0,    end: 1700, easing: EASING.anticipate, from: 0,   to: 260 },
      { start: 1700, end: 2200, easing: EASING.climax,     from: 260, to: 320 },
    ]);
    return { transform: [{ translateX }] };
  });

  // Swipe-up prompt (interactive mode only) — visible at the closed state,
  // fades out as the user starts opening the doors. The chevron drifts up
  // subtly to suggest the gesture direction.
  const swipePromptStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      progress.value,
      [0, 400, 800],
      [1, 0.5, 0],
      Extrapolation.CLAMP,
    );
    const translateY = interpolate(
      progress.value,
      [0, 800],
      [0, -12],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ translateY }] };
  });

  return (
    <Animated.View
      style={[styles.canvas, { aspectRatio }, backgroundStyle]}
      onLayout={(e) =>
        setLayout({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })
      }
    >
      <Animated.View style={[styles.canvasInner, shakeStyle]}>
        {/* Distant doorway (bright opening) — wrapped in a centered row
            so the animated width grows symmetrically around the centre,
            not from a fixed left anchor. */}
        <View style={styles.doorwayCentre} pointerEvents="none">
          <Animated.View style={[styles.doorway, doorwayStyle]} />
        </View>

        {/* Tunnel walls (converging perspective) */}
        <Animated.View style={[styles.tunnelWallLeft, tunnelStyle]} />
        <Animated.View style={[styles.tunnelWallRight, tunnelStyle]} />

        {/* Hero subjects — front-facing athletic silhouettes. Same SVG on both
            sides for guaranteed visual symmetry. */}
        <View style={styles.heroSubjectsRow}>
          <Animated.View style={[styles.heroSubject, heroAStyle]}>
            <AthleteSilhouette />
          </Animated.View>
          <Animated.View style={[styles.heroSubject, heroBStyle]}>
            <AthleteSilhouette />
          </Animated.View>
        </View>

        {/* Skia lens-flare overlay — drawn ABOVE the figures so it reads as
            a camera artifact (lens bloom) rather than scene lighting. Sized
            to the measured canvas so the flare lands at the threshold beat's
            visual centre regardless of aspect ratio. */}
        {layout.width > 0 ? (
          <SkiaLensFlare
            progress={progress}
            width={layout.width}
            height={layout.height}
          />
        ) : null}

        {/* Name plates — driven by real player identities passed in via props.
            Display name is truncated to 14 chars per the motion spec to
            preserve thumbnail legibility on share previews. Real display
            names will vary in length; balancing them at the layout level
            (min-width, ellipsis, centred typography) is a follow-up. */}
        <Animated.View style={[styles.namePlateRow, namePlatesStyle]}>
          <View style={styles.namePlate}>
            <View style={[styles.initialChip, { backgroundColor: playerA.colour }]}>
              <Text style={styles.initialChipText}>{playerA.initial}</Text>
            </View>
            <Text style={styles.namePlateText} numberOfLines={1}>
              {playerA.displayName.slice(0, 14)}
            </Text>
          </View>
          <Text style={styles.versus}>vs</Text>
          <View style={styles.namePlate}>
            <View style={[styles.initialChip, { backgroundColor: playerB.colour }]}>
              <Text style={styles.initialChipText}>{playerB.initial}</Text>
            </View>
            <Text style={styles.namePlateText} numberOfLines={1}>
              {playerB.displayName.slice(0, 14)}
            </Text>
          </View>
        </Animated.View>

        {/* Gameweek lockup */}
        <Animated.View style={[styles.gameweek, gameweekStyle]}>
          <Text style={styles.gameweekText}>GAMEWEEK 3</Text>
        </Animated.View>

        {/* Tunnel doors — cover all the artwork when closed; slide off-frame
            by the climax beat. Gold seam on the inner edge reads as light
            spilling through the gap. Pointer-events none so the parent
            GestureDetector still catches the pan in interactive mode. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.doorLeft, doorLeftStyle]}
        />
        <Animated.View
          pointerEvents="none"
          style={[styles.doorRight, doorRightStyle]}
        />

        {/* Swipe-up prompt — interactive mode only. Sits above the artwork
            so it reads against any beat. Pointer-events none so the parent
            GestureDetector still catches the pan. */}
        {showSwipePrompt ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.swipePrompt, swipePromptStyle]}
          >
            <Text style={styles.swipeChevron}>⌃</Text>
            <Text style={styles.swipeLabel}>Swipe up to reveal</Text>
          </Animated.View>
        ) : null}

        {/* Debug centreline + horizon — drawn ABOVE all layers so it never gets
            hidden by atmosphere. Lets you eyeball whether each element is
            equidistant from the canvas centre at any beat. */}
        {showCenterline ? (
          <>
            <View pointerEvents="none" style={styles.centerlineVertical} />
            <View pointerEvents="none" style={styles.centerlineHorizontal} />
          </>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

// ============================================================================
// Beat heads-up — live label of which beat is playing and the easing in use
// ============================================================================

function BeatHeadsUp({ activeBeat, ms }: { activeBeat: Beat; ms: number }) {
  return (
    <View style={styles.headsUp}>
      <View>
        <Text style={styles.headsUpBeat}>
          Beat {activeBeat.num} · {activeBeat.label}
        </Text>
        <Text style={styles.headsUpEasing}>
          {(activeBeat.startMs / 1000).toFixed(1)}s – {(activeBeat.endMs / 1000).toFixed(1)}s ·
          easing: {activeBeat.easingName}
        </Text>
      </View>
      <Text style={styles.headsUpTimer}>{(ms / 1000).toFixed(2)}s</Text>
    </View>
  );
}

// ============================================================================
// Aspect toggle — switches the canvas between 16:9 (broadcast/landscape)
// and 3:4 (portrait card). Production matchup card on mobile will be
// portrait; share artifact to WhatsApp/Instagram will be 9:16 story or 1:1
// chat — those are next ratios to add when we're ready.
// ============================================================================

function AspectToggle({
  aspect,
  onChange,
}: {
  aspect: 'landscape' | 'portrait';
  onChange: (next: 'landscape' | 'portrait') => void;
}) {
  return (
    <View style={styles.modeToggleRow}>
      <Pressable
        onPress={() => onChange('landscape')}
        style={[
          styles.modeTogglePill,
          aspect === 'landscape' && styles.modeTogglePillActive,
        ]}
      >
        <Text
          style={[
            styles.modeTogglePillText,
            aspect === 'landscape' && styles.modeTogglePillTextActive,
          ]}
        >
          16:9 LANDSCAPE
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange('portrait')}
        style={[
          styles.modeTogglePill,
          aspect === 'portrait' && styles.modeTogglePillActive,
        ]}
      >
        <Text
          style={[
            styles.modeTogglePillText,
            aspect === 'portrait' && styles.modeTogglePillTextActive,
          ]}
        >
          3:4 PORTRAIT
        </Text>
      </Pressable>
    </View>
  );
}

// ============================================================================
// Mode toggle — switches between passive PLAY-button playback and the
// gesture-driven "swipe up to open the tunnel" interactive variant. Lives
// above the canvas so it's the first thing you see when the screen mounts.
// ============================================================================

function ModeToggle({
  mode,
  onChange,
}: {
  mode: 'passive' | 'interactive';
  onChange: (next: 'passive' | 'interactive') => void;
}) {
  return (
    <View style={styles.modeToggleRow}>
      <Pressable
        onPress={() => onChange('passive')}
        style={[
          styles.modeTogglePill,
          mode === 'passive' && styles.modeTogglePillActive,
        ]}
      >
        <Text
          style={[
            styles.modeTogglePillText,
            mode === 'passive' && styles.modeTogglePillTextActive,
          ]}
        >
          PASSIVE
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange('interactive')}
        style={[
          styles.modeTogglePill,
          mode === 'interactive' && styles.modeTogglePillActive,
        ]}
      >
        <Text
          style={[
            styles.modeTogglePillText,
            mode === 'interactive' && styles.modeTogglePillTextActive,
          ]}
        >
          INTERACTIVE
        </Text>
      </Pressable>
    </View>
  );
}

// ============================================================================
// Controls
// ============================================================================

function Controls({
  isPlaying,
  onPlay,
  onPause,
  onReset,
  showCenterline,
  onToggleCenterline,
}: {
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  showCenterline: boolean;
  onToggleCenterline: () => void;
}) {
  return (
    <View>
      <View style={styles.controls}>
        {isPlaying ? (
          <Pressable style={styles.controlButton} onPress={onPause}>
            <Text style={styles.controlButtonText}>PAUSE</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.controlButton, styles.controlButtonPrimary]} onPress={onPlay}>
            <Text style={styles.controlButtonTextPrimary}>PLAY</Text>
          </Pressable>
        )}
        <Pressable style={styles.controlButton} onPress={onReset}>
          <Text style={styles.controlButtonText}>RESET</Text>
        </Pressable>
      </View>
      <Pressable
        style={[
          styles.toggleButton,
          showCenterline && styles.toggleButtonActive,
        ]}
        onPress={onToggleCenterline}
      >
        <Text
          style={[
            styles.toggleButtonText,
            showCenterline && styles.toggleButtonTextActive,
          ]}
        >
          {showCenterline ? '✓ Centerline ON' : 'Show centerline (debug)'}
        </Text>
      </Pressable>
    </View>
  );
}

// ============================================================================
// Beat scrubber — jump to any beat
// ============================================================================

function BeatScrubber({
  activeBeatNum,
  onSelect,
}: {
  activeBeatNum: number;
  onSelect: (b: Beat) => void;
}) {
  return (
    <View>
      <Text style={styles.scrubberLabel}>Scrub to beat:</Text>
      <View style={styles.scrubberRow}>
        {BEATS.map((b) => {
          const isActive = b.num === activeBeatNum;
          return (
            <Pressable
              key={b.num}
              style={[styles.scrubberPip, isActive && styles.scrubberPipActive]}
              onPress={() => onSelect(b)}
            >
              <Text
                style={[
                  styles.scrubberPipText,
                  isActive && styles.scrubberPipTextActive,
                ]}
              >
                {b.num}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ============================================================================
// Footer reference
// ============================================================================

function Footer() {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerText}>
        Spec: assets/showdown-storyboard/MOTION_SPEC.md
      </Text>
      <Text style={styles.footerText}>
        Placeholders only — silhouettes + light shafts come with Skia in the next pass.
      </Text>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#08101f', paddingHorizontal: 16 },
  header: { paddingTop: 8, paddingBottom: 12 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#9aa6c4', fontSize: 13, marginTop: 2 },

  // Canvas — height is derived from screen width via aspectRatio, which is
  // now passed in dynamically (16:9 landscape / 3:4 portrait toggle).
  canvas: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLOURS.deepNavy,
    marginBottom: 14,
  },
  canvasInner: { flex: 1, position: 'relative' },

  // Wrapper that pins the doorway vertically and centres it horizontally,
  // so the animated width grows symmetrically around the canvas centre line
  // regardless of its current size.
  doorwayCentre: {
    position: 'absolute',
    top: '30%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },

  // Distant doorway — only owns its appearance + animated dimensions.
  // Positioning is delegated to `doorwayCentre`.
  doorway: {
    backgroundColor: COLOURS.spotlight,
    borderRadius: 12,
    shadowColor: COLOURS.gold,
    shadowOpacity: 0.7,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },

  // (Lens flare style removed; replaced by the Skia <SkiaLensFlare/>
  // overlay which composites GPU-blurred halo + hot core.)

  // Converging tunnel walls
  tunnelWallLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '32%',
    backgroundColor: COLOURS.tunnelWall,
    transform: [{ skewY: '-10deg' }],
  },
  tunnelWallRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: '32%',
    backgroundColor: COLOURS.tunnelWall,
    transform: [{ skewY: '10deg' }],
  },

  // Hero subjects
  heroSubjectsRow: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 32,
  },
  heroSubject: {
    // Container only — geometry is owned by the SVG inside. Aspect matches
    // the silhouette's 1:2 viewBox (100×200) so it scales cleanly.
    width: 40,
    height: 80,
  },

  // Name plates (beats 7-8)
  namePlateRow: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  namePlate: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLOURS.namePlate,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    borderColor: COLOURS.namePlateGold,
    borderWidth: 1,
    gap: 6,
  },
  initialChip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  namePlateText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  versus: { color: COLOURS.gold, fontSize: 14, fontWeight: '700' },

  // Gameweek lockup (beat 8)
  gameweek: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  gameweekText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
    textShadowColor: COLOURS.gold,
    textShadowRadius: 8,
  },

  // Tunnel doors — two halves of the canvas. The inner edge of each carries
  // a gold seam that reads as light leaking through when the doors are closed.
  // backgroundColor is slightly lighter than the canvas bg so the doors are
  // visible as a distinct surface (not just "more darkness").
  doorLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '50%',
    backgroundColor: '#13182a',
    borderRightWidth: 1.5,
    borderRightColor: COLOURS.gold,
    shadowColor: COLOURS.gold,
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 2, height: 0 },
  },
  doorRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: '50%',
    backgroundColor: '#13182a',
    borderLeftWidth: 1.5,
    borderLeftColor: COLOURS.gold,
    shadowColor: COLOURS.gold,
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: -2, height: 0 },
  },

  // Swipe-up prompt (interactive mode). Sits centered near the bottom of the
  // canvas so the gesture direction matches the hint. Pointer events disabled
  // so the parent GestureDetector receives the pan.
  swipePrompt: {
    position: 'absolute',
    bottom: 18,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  swipeChevron: {
    color: COLOURS.gold,
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 32,
    marginBottom: 2,
  },
  swipeLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // Mode toggle (passive vs interactive) — segmented control above the canvas.
  modeToggleRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    padding: 4,
    backgroundColor: '#0f1a35',
    borderRadius: 10,
  },
  modeTogglePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 7,
    alignItems: 'center',
  },
  modeTogglePillActive: { backgroundColor: COLOURS.gold },
  modeTogglePillText: {
    color: '#9aa6c4',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  modeTogglePillTextActive: { color: COLOURS.deepNavy },

  // Debug centerlines (toggleable). 1px hairlines drawn above every animated
  // layer so asymmetric drift becomes obvious — vertical line for left-right,
  // horizontal line for top-bottom.
  centerlineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 1,
    marginLeft: -0.5,
    backgroundColor: '#ff3b30',
    opacity: 0.6,
  },
  centerlineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
    marginTop: -0.5,
    backgroundColor: '#ff3b30',
    opacity: 0.4,
  },

  // Toggle button (centerline debug)
  toggleButton: {
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0f1a35',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1c2540',
  },
  toggleButtonActive: { borderColor: '#ff3b30', backgroundColor: '#2a0d10' },
  toggleButtonText: { color: '#9aa6c4', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  toggleButtonTextActive: { color: '#ff8a82' },

  // Heads-up display
  headsUp: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#0f1a35',
    marginBottom: 12,
  },
  headsUpBeat: { color: '#fff', fontSize: 14, fontWeight: '700' },
  headsUpEasing: { color: '#9aa6c4', fontSize: 12, marginTop: 2 },
  headsUpTimer: { color: COLOURS.gold, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // Controls
  controls: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  controlButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#1c2540',
    alignItems: 'center',
  },
  controlButtonPrimary: { backgroundColor: COLOURS.gold },
  controlButtonText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  controlButtonTextPrimary: { color: COLOURS.deepNavy, fontSize: 14, fontWeight: '700', letterSpacing: 1 },

  // Scrubber
  scrubberLabel: { color: '#9aa6c4', fontSize: 12, marginBottom: 8 },
  scrubberRow: { flexDirection: 'row', gap: 6 },
  scrubberPip: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 6,
    backgroundColor: '#1c2540',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrubberPipActive: { backgroundColor: COLOURS.gold },
  scrubberPipText: { color: '#9aa6c4', fontSize: 14, fontWeight: '700' },
  scrubberPipTextActive: { color: COLOURS.deepNavy },

  // Footer
  footer: { marginTop: 'auto', paddingVertical: 14 },
  footerText: { color: '#5d6a8e', fontSize: 11, lineHeight: 16 },
});
