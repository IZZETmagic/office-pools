import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { duelResult } from '@/lib/duelPoints';
import type { Bout } from '@/lib/useDuel';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// THE MATCHUP IS THE HEADER
// =============================================================
// Ryan, 2026-09-03: *"I still want the top header with the match up always
// present as expected with it being collapsable but the tabs remain below or
// would be even better if they were integrated into the collapsable header
// component thing."*
//
// So this replaces `PoolDetailHeader` for Showdown pools and takes the tab
// strip as its own child. Three zones, and only the middle one moves:
//
//   CHROME    back · pool name and matchweek · overflow      — fixed
//   CORNERS   you, the score or countdown, them              — COLLAPSES
//   TABS      passed in as `children`, pinned to the bottom  — fixed
//
// ## ⚠ WHY THE TABS ARE INSIDE THIS COMPONENT AND NOT A SIBLING
//
// Because the strip must not move while the corners are animating. If the tabs
// sat below a shrinking header they would slide up under the thumb mid-tap, and
// on a 375pt screen that is the difference between opening Duel and opening
// Picks. Rendering them as a child of the same fixed-height container means the
// only thing with a changing height is the block ABOVE them.
//
// ## ⚠ YOUR CORNER NEVER SWAPS SIDES
//
// You are always left and always `primary`; they are always right and `red`.
// The temptation is to lay the corners out by `entry_a` / `entry_b`, which are
// the circle method's own sides — that would put you on the left some weeks and
// the right others, and make your own record unreadable at a glance.
// =============================================================

/** Below this many points of scroll the corners are full height; above, collapsed. */
const COLLAPSE_DISTANCE = 64;
const CORNERS_HEIGHT = 92;
const COLLAPSED_HEIGHT = 34;

type Props = {
  poolName: string;
  /** The duel to show. Null when the draw has not been made yet. */
  bout: Bout | null;
  /** The next sealed matchweek, when there is one. */
  sealed: { matchweek: number; opensAt: string | null } | null;
  /** Shared vertical scroll offset of whichever tab is on screen. */
  scrollY: SharedValue<number>;
  /** The tab strip. Rendered inside this component — see the header note. */
  children: ReactNode;
  onOpenMenu?: () => void;
};

export function ShowdownDuelHeader({
  poolName,
  bout,
  sealed,
  scrollY,
  children,
  onOpenMenu,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // The full-size corners: fade and shrink away as you read down.
  const cornersStyle = useAnimatedStyle(() => {
    const p = interpolate(scrollY.value, [0, COLLAPSE_DISTANCE], [0, 1], Extrapolation.CLAMP);
    return {
      height: interpolate(p, [0, 1], [CORNERS_HEIGHT, 0], Extrapolation.CLAMP),
      opacity: interpolate(p, [0, 0.6], [1, 0], Extrapolation.CLAMP),
      // Scale from the top so the block folds upward into the chrome rather
      // than drifting toward the middle of its own shrinking box.
      transform: [{ scaleY: interpolate(p, [0, 1], [1, 0.85], Extrapolation.CLAMP) }],
    };
  });

  // The collapsed line takes over. It is a separate row rather than the same
  // one restyled: at 34pt there is no room for ranks or weekly scores, so the
  // two states hold genuinely different content and cross-fading them is
  // cheaper than animating six properties on five nodes.
  const collapsedStyle = useAnimatedStyle(() => {
    const p = interpolate(scrollY.value, [0, COLLAPSE_DISTANCE], [0, 1], Extrapolation.CLAMP);
    return {
      height: interpolate(p, [0, 1], [0, COLLAPSED_HEIGHT], Extrapolation.CLAMP),
      opacity: interpolate(p, [0.5, 1], [0, 1], Extrapolation.CLAMP),
    };
  });

  const matchweekLabel = bout
    ? `Matchweek ${bout.matchweek}`
    : sealed
      ? `Matchweek ${sealed.matchweek}`
      : null;

  return (
    <View
      style={{
        backgroundColor: theme.colors.snow,
        paddingTop: insets.top + theme.spacing.xs,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.silver,
      }}
    >
      {/* ---- chrome: fixed ---- */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => ({
            width: 30,
            height: 30,
            borderRadius: theme.radii.pill,
            backgroundColor: theme.colors.mist,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name="chevron.left" color="slate" size={15} weight="semibold" />
        </Pressable>

        {/*
          The pool name is DEMOTED on purpose. You know which pool you opened;
          you do not yet know who you are fighting. It stays legible as an
          eyebrow rather than competing with the corners underneath it.
        */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 10,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: theme.colors.slate,
            }}
          >
            {poolName}
            {matchweekLabel ? ` · ${matchweekLabel}` : ''}
          </Text>
        </View>

        {onOpenMenu ? (
          <Pressable
            onPress={onOpenMenu}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Pool menu"
            style={({ pressed }) => ({
              width: 30,
              height: 30,
              borderRadius: theme.radii.pill,
              backgroundColor: theme.colors.mist,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Icon name="ellipsis" color="slate" size={15} />
          </Pressable>
        ) : (
          <View style={{ width: 30 }} />
        )}
      </View>

      {/* ---- corners: the part that collapses ---- */}
      <Animated.View style={[{ overflow: 'hidden' }, cornersStyle]}>
        <Corners bout={bout} sealed={sealed} />
      </Animated.View>

      {/* ---- collapsed line: takes over ---- */}
      <Animated.View style={[{ overflow: 'hidden', justifyContent: 'center' }, collapsedStyle]}>
        <CollapsedLine bout={bout} sealed={sealed} />
      </Animated.View>

      {/* ---- the tab strip, inside the header and never moving ---- */}
      {children}
    </View>
  );
}

// ------------------------------------------------------------- full corners

function Corners({ bout, sealed }: { bout: Bout | null; sealed: Props['sealed'] }) {
  const theme = useTheme();

  // No draw yet — fewer than two members. Said plainly rather than shown as an
  // empty ring, which reads as a loading state that never resolves.
  if (!bout) {
    return (
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm }}>
        <Text variant="cardTitle">{sealed ? 'Your opponent is sealed' : 'No duel yet'}</Text>
        <Text variant="body" color="slate">
          {sealed
            ? 'It opens one week at a time.'
            : 'The draw is made once there are two members.'}
        </Text>
      </View>
    );
  }

  const { you, them, settled } = bout;
  const result = settled && them ? duelResult(you.points) : null;
  const tint =
    result === 'won'
      ? theme.colors.green
      : result === 'lost'
        ? theme.colors.red
        : theme.colors.ink;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.sm,
      }}
    >
      <Corner name={you.name} sub="You" tone="primary" align="left" />

      <View style={{ alignItems: 'center', minWidth: 62 }}>
        {settled && them ? (
          <Text
            style={{
              fontFamily: fontFamilies.black,
              fontSize: 20,
              color: tint,
              fontVariant: ['tabular-nums'],
            }}
          >
            {you.accuracy ?? 0} – {them.accuracy ?? 0}
          </Text>
        ) : (
          <Text style={{ fontFamily: fontFamilies.black, fontSize: 16, color: theme.colors.slate }}>
            {them ? 'V' : 'BYE'}
          </Text>
        )}
        <Text
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 8,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: theme.colors.slate,
            marginTop: 2,
          }}
        >
          {!them ? 'no opponent' : settled ? (result ?? '') : 'to play'}
        </Text>
      </View>

      {/*
        A bye still gets a right-hand corner, deliberately empty and labelled.
        Collapsing the row to one name would make a free week look like a
        rendering fault on the screen the mode is named after.
      */}
      <Corner
        name={them ? them.name : 'Nobody'}
        sub={them ? 'Them' : 'Bye week'}
        tone={them ? 'red' : 'muted'}
        align="right"
      />
    </View>
  );
}

function Corner({
  name,
  sub,
  tone,
  align,
}: {
  name: string;
  sub: string;
  tone: 'primary' | 'red' | 'muted';
  align: 'left' | 'right';
}) {
  const theme = useTheme();
  const color =
    tone === 'primary'
      ? theme.colors.primary
      : tone === 'red'
        ? theme.colors.red
        : theme.colors.slate;

  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        alignItems: align === 'right' ? 'flex-end' : 'flex-start',
        gap: 3,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: theme.radii.pill,
          borderWidth: 2,
          borderColor: color,
          backgroundColor: withOpacity(color, 0.12),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: fontFamilies.black, fontSize: 12, color }}>
          {initials(name)}
        </Text>
      </View>
      <Text variant="cardTitle" numberOfLines={1} style={{ fontSize: 13 }}>
        {name}
      </Text>
      <Text
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 8,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: theme.colors.slate,
        }}
      >
        {sub}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------- collapsed line

function CollapsedLine({ bout, sealed }: { bout: Bout | null; sealed: Props['sealed'] }) {
  const theme = useTheme();

  if (!bout) {
    return (
      <View style={{ paddingHorizontal: theme.spacing.lg }}>
        <Text variant="body" color="slate" numberOfLines={1}>
          {sealed ? `Matchweek ${sealed.matchweek} · sealed` : 'No duel yet'}
        </Text>
      </View>
    );
  }

  const { you, them, settled } = bout;
  const result = settled && them ? duelResult(you.points) : null;
  const tint =
    result === 'won'
      ? theme.colors.green
      : result === 'lost'
        ? theme.colors.red
        : theme.colors.ink;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
      }}
    >
      <Dot name={you.name} tone="primary" />
      <Text variant="body" numberOfLines={1} style={{ flex: 1, fontFamily: fontFamilies.bold }}>
        You
      </Text>

      <Text
        style={{
          fontFamily: fontFamilies.black,
          fontSize: 14,
          color: tint,
          fontVariant: ['tabular-nums'],
        }}
      >
        {settled && them ? `${you.accuracy ?? 0} – ${them.accuracy ?? 0}` : them ? 'v' : 'bye'}
      </Text>

      <Text
        variant="body"
        numberOfLines={1}
        style={{ flex: 1, textAlign: 'right', fontFamily: fontFamilies.bold }}
      >
        {them ? them.name : 'Nobody'}
      </Text>
      <Dot name={them ? them.name : '—'} tone={them ? 'red' : 'muted'} />
    </View>
  );
}

function Dot({ name, tone }: { name: string; tone: 'primary' | 'red' | 'muted' }) {
  const theme = useTheme();
  const color =
    tone === 'primary'
      ? theme.colors.primary
      : tone === 'red'
        ? theme.colors.red
        : theme.colors.slate;
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: theme.radii.pill,
        backgroundColor: withOpacity(color, 0.14),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: fontFamilies.black, fontSize: 8, color }}>{initials(name)}</Text>
    </View>
  );
}

/** First letters of the first two words — "Priya Nair" → "PN". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
