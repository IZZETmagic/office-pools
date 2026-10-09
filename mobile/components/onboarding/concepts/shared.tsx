// =============================================================
// Shared parts for the onboarding concept mock-ups
// =============================================================
// THROWAWAY. Delete this folder once a direction is picked and built for real.
//
// 🔴🔴 NOTHING IN HERE MAY TOUCH REAL STATE. Two rules, and both exist because a mock-up that
// writes is worse than no mock-up at all:
//
//   1. THE OS PUSH PROMPT IS NEVER FIRED. iOS gives an app exactly ONE
//      `requestPermissionsAsync()` that shows a dialog; every later call resolves silently with
//      the same answer. Burning it on a mock-up would be UNRECOVERABLE short of reinstalling the
//      app, and would take the real onboarding's one shot with it. `<SimulatedPushAlert>` below
//      is a drawn copy of the iOS alert — same words, same button order, same emphasis.
//   2. NO SecureStore FLAGS, NO SUPABASE WRITE. The avatar built here is held in component state
//      and thrown away on unmount, so flipping through the eight concepts cannot replace a face
//      or mark onboarding complete and lock somebody out of the flow they are reviewing.
// =============================================================

import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  View,
  Text as RNText,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';

import { Text, Pressable } from '@/components/ui';
import {
  composeAvatar,
  headOnly,
  PALETTE,
  type AvatarAssets,
  type AvatarConfig,
} from '@/lib/avatar/compose';
import type { StoredAvatarBuild } from '@/lib/avatar/storedConfig';
import { AVATAR_BACKGROUNDS, inkOn } from '@/lib/avatarGradient';
import { useAvatarAssets } from '@/lib/useAvatarAssets';
import { fontFamilies, useTheme, withOpacity, type Theme } from '@/theme';

// ---------------------------------------------------------------------------
// The face a concept starts from
// ---------------------------------------------------------------------------

/**
 * ⭐ NEVER A BLANK CANVAS. Every concept that builds an avatar opens on a real, finished face,
 * so the member's first act is TWEAKING rather than CREATING. A blank builder asks someone who
 * has been in the app for nine seconds to have an opinion about a base mesh; a seeded one asks
 * them to react, which everybody can do instantly.
 */
export const SEED_BUILD: StoredAvatarBuild = {
  base: 'base-neck-100',
  skin: '#F5C9A6',
  hair: 'm03-quiff',
  hairColour: '#4A3B32',
  facialHair: null,
  glasses: null,
  earrings: null,
  garment: null,
  expression: 'x-happy',
  eyes: null,
  mouth: null,
  eyeColour: '#5B3A1E',
  mouthColour: '#B67A70',
  shirt: '#3B6EFF',
};

function pick<T>(xs: readonly T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

/** A different face every time, drawn only from art this bundle actually carries. */
export function randomBuild(assets: AvatarAssets): StoredAvatarBuild {
  const hair = Object.keys(assets.hair);
  const expressions = Object.keys(assets.expressions);
  const facial = Object.keys(assets.facialhair);
  return {
    ...SEED_BUILD,
    skin: pick(PALETTE.skin),
    hair: pick(hair),
    hairColour: pick(PALETTE.hair),
    // ⚠ Weighted, not uniform. A coin-flip beard makes half the shuffles look like the same
    // bearded man; one in three reads as variety.
    facialHair: Math.random() < 0.34 ? pick(facial) : null,
    expression: pick(expressions),
    eyeColour: pick(PALETTE.eye),
    shirt: pick(PALETTE.shirt),
  };
}

/** The member's colour. Chosen once per concept mount so a shuffle does not repaint the room. */
export function randomGround(): string {
  return pick(AVATAR_BACKGROUNDS);
}

// ---------------------------------------------------------------------------
// The simulated iOS permission alert
// ---------------------------------------------------------------------------

export type SimPushStatus = 'undetermined' | 'granted' | 'denied';

/**
 * Stands in for `usePushPermission` inside the harness. Same shape, no OS call — see the
 * banner at the top of this file for why that is not negotiable.
 */
export function useSimulatedPush() {
  const [status, setStatus] = useState<SimPushStatus>('undetermined');
  const [asking, setAsking] = useState(false);

  const ask = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAsking(true);
  }, []);

  const answer = useCallback((granted: boolean) => {
    setAsking(false);
    setStatus(granted ? 'granted' : 'denied');
    void Haptics.notificationAsync(
      granted ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
    );
  }, []);

  return { status, asking, ask, answer };
}

/**
 * A drawn copy of the iOS notification-permission alert. Deliberately faithful — the point of
 * reviewing a soft-ask is to see what the screen looks like the instant BEFORE the real dialog
 * lands on top of it, and a friendly-looking stand-in would flatter every concept equally.
 */
export function SimulatedPushAlert({
  visible,
  onAnswer,
}: {
  visible: boolean;
  onAnswer: (granted: boolean) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View
        style={{
          flex: 1,
          backgroundColor: '#00000059',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
        }}
      >
        {/* ⚠ Hardcoded iOS system colours, not theme tokens — this is the OS's surface, not ours,
            and it does not follow our palette in either mode. */}
        <View style={{ width: 270, borderRadius: 14, backgroundColor: '#F2F2F2', overflow: 'hidden' }}>
          <View style={{ padding: 16, paddingBottom: 14, alignItems: 'center', gap: 4 }}>
            <RNText
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 17,
                color: '#000',
                textAlign: 'center',
              }}
            >
              “SportPool” Would Like to Send You Notifications
            </RNText>
            <RNText
              style={{
                fontFamily: fontFamilies.regular,
                fontSize: 13,
                lineHeight: 17,
                color: '#000',
                textAlign: 'center',
              }}
            >
              Notifications may include alerts, sounds and icon badges. These can be configured in
              Settings.
            </RNText>
          </View>
          <View style={{ flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#3C3C4340' }}>
            <AlertButton label="Don’t Allow" onPress={() => onAnswer(false)} />
            <View style={{ width: 0.5, backgroundColor: '#3C3C4340' }} />
            <AlertButton label="Allow" bold onPress={() => onAnswer(true)} />
          </View>
        </View>
        <RNText
          style={{
            marginTop: 16,
            fontFamily: fontFamilies.bold,
            fontSize: 11,
            letterSpacing: 1.2,
            color: '#FFFFFFAA',
          }}
        >
          SIMULATED — THE REAL PROMPT IS NEVER FIRED HERE
        </RNText>
      </View>
    </Modal>
  );
}

function AlertButton({ label, bold, onPress }: { label: string; bold?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? '#00000010' : 'transparent',
      })}
    >
      <RNText
        style={{
          fontFamily: bold ? fontFamilies.bold : fontFamilies.regular,
          fontSize: 17,
          color: '#007AFF',
        }}
      >
        {label}
      </RNText>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// An iOS notification banner
// ---------------------------------------------------------------------------

export type BannerContent = {
  title: string;
  body: string;
  /** Drawn in the app-icon square. An avatar SVG when the concept has one to show. */
  avatarSvg?: string | null;
  ground?: string;
};

/**
 * The lock-screen banner, drawn. Used by the concepts that SHOW what a notification is rather
 * than describing it — the difference between "we'll remind you before picks lock" and watching
 * “Picks lock in 2 hours” slide down from the top of the screen.
 */
export function PhoneBanner({
  content,
  style,
}: {
  content: BannerContent;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <Animated.View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          padding: 12,
          borderRadius: 20,
          // ⚠ A banner floats over whatever is behind it, so this is deliberately a near-opaque
          // light surface in BOTH modes rather than `theme.colors.surface` — iOS does not repaint
          // its banner chrome to match our dark theme.
          backgroundColor: theme.mode === 'dark' ? '#2C2C2EF2' : '#FFFFFFF2',
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        },
        style,
      ]}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 9,
          overflow: 'hidden',
          backgroundColor: content.ground ?? '#3B6EFF',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {content.avatarSvg ? (
          <SvgXml xml={content.avatarSvg} width={38} height={38} />
        ) : (
          <RNText style={{ fontFamily: fontFamilies.black, fontSize: 15, color: '#FFF' }}>SP</RNText>
        )}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 13,
            color: theme.mode === 'dark' ? '#FFF' : '#000',
          }}
          numberOfLines={1}
        >
          {content.title}
        </RNText>
        <RNText
          style={{
            fontFamily: fontFamilies.regular,
            fontSize: 13,
            lineHeight: 16,
            color: theme.mode === 'dark' ? '#FFFFFFCC' : '#000000CC',
          }}
          numberOfLines={2}
        >
          {content.body}
        </RNText>
      </View>
      <RNText
        style={{
          fontFamily: fontFamilies.regular,
          fontSize: 11,
          color: theme.mode === 'dark' ? '#FFFFFF8A' : '#0000008A',
        }}
      >
        now
      </RNText>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// The compact avatar builder
// ---------------------------------------------------------------------------

/**
 * ⚠ THREE STEPS, NOT SEVEN. The real editor (`app/profile/avatar.tsx`) has skin, eyes, hair,
 * glasses, facial hair, shirt and colour, and it is right that it does — it is a destination
 * somebody chose to open. In ONBOARDING the same seven is a wall, so this offers the three that
 * change the face most at a glance and puts everything else behind Shuffle. Any concept below
 * can hand off to the full editor afterwards; none of them should open it first.
 *
 * ⭐ COMPOSES LOCALLY, like the real editor and for the same reason: a preview that round-trips
 * `/api/avatar/me` measured 284–476ms warm, against 0.8ms here. A builder that lags behind the
 * tap feels broken no matter how good the art is.
 */
export function AvatarQuickBuild({
  build,
  ground,
  onChange,
  size,
  compact,
}: {
  build: StoredAvatarBuild;
  ground: string;
  onChange: (next: StoredAvatarBuild) => void;
  size?: number;
  compact?: boolean;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { assets, error } = useAvatarAssets();
  const avatarSize = size ?? Math.min(width - 80, 220);

  const preview = useMemo(
    () => (assets ? composeAvatar({ ...build, background: ground, mark: false }, assets) : ''),
    [assets, build, ground],
  );

  if (error) {
    return (
      <View style={{ padding: theme.spacing.xl, alignItems: 'center', gap: theme.spacing.sm }}>
        <Text variant="cardTitle" color="red" align="center">
          The avatar art didn’t load
        </Text>
        <Text variant="body" color="slate" align="center">
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            width: avatarSize,
            height: avatarSize,
            borderRadius: avatarSize / 2,
            backgroundColor: ground,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {preview ? (
            <SvgXml xml={preview} width={avatarSize} height={avatarSize} />
          ) : (
            <ActivityIndicator color="#FFF" />
          )}
        </View>
      </View>

      {assets ? (
        <View style={{ gap: compact ? theme.spacing.sm : theme.spacing.lg }}>
          <Row label="Skin">
            <Swatches
              colours={PALETTE.skin}
              value={build.skin}
              onPick={(c) => onChange({ ...build, skin: c })}
            />
          </Row>
          <Row label="Hair">
            <HeadTiles
              assets={assets}
              build={build}
              options={[null, ...Object.keys(assets.hair)]}
              value={build.hair}
              onPick={(k) => onChange({ ...build, hair: k })}
            />
          </Row>
          <Row label="Shirt">
            <Swatches
              colours={PALETTE.shirt}
              value={build.shirt}
              onPick={(c) => onChange({ ...build, shirt: c })}
            />
          </Row>
        </View>
      ) : null}
    </View>
  );
}

/** The Shuffle control, split out so concepts can place it where their layout wants it. */
export function ShuffleButton({ onShuffle, label = 'Shuffle' }: { onShuffle: () => void; label?: string }) {
  const theme = useTheme();
  const spin = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  return (
    <Pressable
      onPress={() => {
        spin.value = withTiming(spin.value + 360, { duration: 420, easing: Easing.out(Easing.cubic) });
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onShuffle();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        height: 40,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.mist,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Animated.View style={style}>
        <RNText style={{ fontSize: 16 }}>🎲</RNText>
      </Animated.View>
      <Text variant="cardTitle" color="ink">
        {label}
      </Text>
    </Pressable>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="caption" color="slate" style={{ paddingHorizontal: theme.spacing.xl }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function Swatches({
  colours,
  value,
  onPick,
}: {
  colours: readonly string[];
  value: string;
  onPick: (c: string) => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm }}
    >
      {colours.map((c) => {
        const on = c === value;
        return (
          <Pressable
            key={c}
            onPress={() => {
              void Haptics.selectionAsync();
              onPick(c);
            }}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: c,
              borderWidth: on ? 3 : 1,
              borderColor: on ? theme.colors.primary : theme.colors.silver,
            }}
          />
        );
      })}
    </ScrollView>
  );
}

/**
 * ⚠ THE MAGENTA SENTINEL, lifted from the real editor verbatim. A tile is composed on a colour
 * nothing ships and that path is then deleted, leaving the head transparent so the TILE supplies
 * its own background. Composing on a real colour would stamp an opaque square over the tint.
 * The colour is deliberately hideous: if this ever stops matching, tiles turn MAGENTA rather
 * than quietly going square.
 */
const HEAD_GROUND = '#FF00FF';
const HEAD_CANVAS = /<path[^>]*fill="rgb\(255,0,255\)"[^>]*\/?>/;
/** ⚠ Reaches OUTSIDE the 2048 canvas, which is why the tile carries the same colour behind it. */
const HEAD_CROP = '-63 -55 2166 2166';

function HeadTiles({
  assets,
  build,
  options,
  value,
  onPick,
}: {
  assets: AvatarAssets;
  build: StoredAvatarBuild;
  options: (string | null)[];
  value: string | null;
  onPick: (k: string | null) => void;
}) {
  const theme = useTheme();
  const tiles = useMemo(() => {
    const base = {
      ...build,
      expression: null,
      eyes: null,
      mouth: null,
      facialHair: null,
      glasses: null,
      earrings: null,
      garment: null,
      mark: false,
      background: HEAD_GROUND,
    } as AvatarConfig;
    return options.map((k) => {
      const full = { ...base, hair: k } as AvatarConfig;
      const head = headOnly(
        composeAvatar(full, assets),
        { skin: full.skin, shirt: full.shirt, hair: full.hairColour },
        (full.hair && assets.hairBackfill?.[full.hair]) || '',
        (full.hair && assets.hairBehind?.[full.hair]) || '',
      )
        .replace(/viewBox="[^"]*"/, `viewBox="${HEAD_CROP}"`)
        .replace(HEAD_CANVAS, '');
      return { k, head };
    });
    // ⚠ THE DEPENDENCY LIST IS THE CONTRACT — everything a tile draws and nothing else. `build`
    // itself must never appear: a new object every render would defeat the memo entirely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, options, build.base, build.skin, build.hairColour, build.shirt]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm }}
    >
      {tiles.map(({ k, head }) => {
        const on = k === value;
        return (
          <Pressable
            key={k ?? 'none'}
            onPress={() => {
              void Haptics.selectionAsync();
              onPick(k);
            }}
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              overflow: 'hidden',
              backgroundColor: theme.colors.mist,
              borderWidth: on ? 3 : 1,
              borderColor: on ? theme.colors.primary : theme.colors.silver,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SvgXml xml={head} width={54} height={54} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** The head alone, cropped — for concepts that drop the built face into a list row or a banner. */
export function useHeadSvg(build: StoredAvatarBuild, ground: string): string | null {
  const { assets } = useAvatarAssets();
  return useMemo(() => {
    if (!assets) return null;
    const cfg = { ...build, background: ground, mark: false } as AvatarConfig;
    return headOnly(
      composeAvatar(cfg, assets),
      { skin: cfg.skin, shirt: cfg.shirt, hair: cfg.hairColour },
      (cfg.hair && assets.hairBackfill?.[cfg.hair]) || '',
      (cfg.hair && assets.hairBehind?.[cfg.hair]) || '',
    ).replace(/viewBox="[^"]*"/, `viewBox="${HEAD_CROP}"`);
  }, [assets, build, ground]);
}

// ---------------------------------------------------------------------------
// Positive reinforcement
// ---------------------------------------------------------------------------

/**
 * ⭐ THE REWARD IS THE THING THEY JUST MADE, never a thing we invented and withheld. Confetti
 * fires on a completion the member can see the cause of; it is decoration ON an achievement,
 * not a substitute for one. Nothing here is saved up, delayed or released later — that is the
 * line between reinforcement and a slot machine.
 */
export function Confetti({ fire }: { fire: boolean }) {
  const { width } = useWindowDimensions();
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }).map((_, i) => ({
        id: i,
        x: Math.random() * width,
        delay: Math.random() * 260,
        colour: pick(['#3B6EFF', '#F5C518', '#22C55E', '#EF4444', '#A6B5FF', '#F8C1E7']),
        size: 6 + Math.random() * 7,
        drift: (Math.random() - 0.5) * 140,
      })),
    [width],
  );
  if (!fire) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {pieces.map(({ id, ...p }) => (
        <ConfettiPiece key={id} {...p} />
      ))}
    </View>
  );
}

function ConfettiPiece({
  x,
  delay,
  colour,
  size,
  drift,
}: {
  x: number;
  delay: number;
  colour: string;
  size: number;
  drift: number;
}) {
  const { height } = useWindowDimensions();
  const t = useSharedValue(0);
  useMemo(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 1500 + Math.random() * 700 }));
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: t.value * height * 0.75 },
      { translateX: t.value * drift },
      { rotate: `${t.value * 540}deg` },
    ],
    opacity: 1 - t.value * t.value,
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: -20,
          left: x,
          width: size,
          height: size * 1.6,
          borderRadius: 2,
          backgroundColor: colour,
        },
        style,
      ]}
    />
  );
}

/** A tick that draws itself in. The completion signal every concept shares. */
export function DoneTick({ size = 28, colour }: { size?: number; colour?: string }) {
  const theme = useTheme();
  const s = useSharedValue(0);
  useMemo(() => {
    s.value = withSequence(withSpring(1.25, { damping: 6 }), withSpring(1, { damping: 12 }));
  }, [s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colour ?? theme.colors.green,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <RNText style={{ color: '#FFF', fontFamily: fontFamilies.black, fontSize: size * 0.55 }}>✓</RNText>
    </Animated.View>
  );
}

/** A soft pulsing halo, for drawing the eye at the one thing a screen wants tapped. */
export function Pulse({ colour, size }: { colour: string; size: number }) {
  const t = useSharedValue(0);
  useMemo(() => {
    t.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
  }, [t]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + t.value * 0.35 }],
    opacity: 0.35 * (1 - t.value),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colour,
        },
        style,
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Bits of product to sit the asks inside
// ---------------------------------------------------------------------------

export type MockRow = { name: string; pts: number; initials: string; colour: string };

/** A pool leaderboard, faked — the context several concepts motivate both asks from. */
export const MOCK_ROWS: MockRow[] = [
  { name: 'Sarah M.', pts: 412, initials: 'SM', colour: '#0DB68B' },
  { name: 'Dev P.', pts: 388, initials: 'DP', colour: '#F47A93' },
  { name: 'Marcus T.', pts: 375, initials: 'MT', colour: '#41A6FA' },
];

export function MockLeaderboard({
  headSvg,
  ground,
  youName = 'You',
  youRank = 4,
  youPts = 361,
  highlight,
  faceless,
}: {
  headSvg?: string | null;
  ground: string;
  youName?: string;
  youRank?: number;
  youPts?: number;
  highlight?: boolean;
  /** Draws your row as an unfilled seat — a dashed ring and a dash instead of a face. */
  faceless?: boolean;
}) {
  const theme = useTheme();
  const rows = MOCK_ROWS.slice(0, 3);
  return (
    <View
      style={{
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
      }}
    >
      {rows.map((r, i) => (
        <View
          key={r.name}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.mist,
          }}
        >
          <Text variant="cardTitle" color="slate" style={{ width: 20 }}>
            {i + 1}
          </Text>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: r.colour,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RNText style={{ fontFamily: fontFamilies.black, fontSize: 12, color: inkOn(r.colour) }}>
              {r.initials}
            </RNText>
          </View>
          <Text variant="cardTitle" color="ink" style={{ flex: 1 }}>
            {r.name}
          </Text>
          <Text variant="cardTitle" color="slate">
            {r.pts}
          </Text>
        </View>
      ))}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          backgroundColor: highlight ? withOpacity(theme.colors.primary, 0.1) : 'transparent',
        }}
      >
        <Text variant="cardTitle" color={highlight ? 'primary' : 'slate'} style={{ width: 20 }}>
          {youRank}
        </Text>
        {faceless ? (
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: theme.colors.silver,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RNText style={{ fontFamily: fontFamilies.black, fontSize: 14, color: theme.colors.silver }}>
              ?
            </RNText>
          </View>
        ) : (
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              overflow: 'hidden',
              backgroundColor: ground,
            }}
          >
            {headSvg ? <SvgXml xml={headSvg} width={34} height={34} /> : null}
          </View>
        )}
        <Text variant="cardTitle" color={faceless ? 'slate' : 'ink'} style={{ flex: 1 }}>
          {faceless ? 'Your seat' : youName}
        </Text>
        <Text variant="cardTitle" color={highlight ? 'primary' : 'slate'}>
          {youPts}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Harness chrome
// ---------------------------------------------------------------------------

/** Shared skip affordance. ⚠ Never styled to induce guilt — see the disclosure gate. */
export function SkipLink({ label = 'Maybe later', onPress }: { label?: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        alignItems: 'center',
        paddingVertical: theme.spacing.md,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text variant="cardTitle" color="slate">
        {label}
      </Text>
    </Pressable>
  );
}

export function themedShadow(theme: Theme) {
  return {
    shadowColor: '#000',
    shadowOpacity: theme.mode === 'dark' ? 0.4 : 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  };
}
