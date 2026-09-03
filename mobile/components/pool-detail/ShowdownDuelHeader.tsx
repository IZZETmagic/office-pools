import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Pressable, Share, View } from 'react-native';
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
// Ryan, 2026-09-03, laying out the rows himself:
//
//     <              [pool name]        [share]
//                   Matchweek [x]
//     [avatar]           v            [avatar]
//     [username]                     [username]
//     [position]·[PTS]           [position]·[PTS]
//     [tab] [tab] [tab] [tab] [tab] [tab] [tab]
//
// A centred fight card: the two of you on the outside, the `v` holding the
// middle, and the tab strip riding INSIDE the same component.
//
// ## ⚠ WHY THE COLLAPSE IS DRIVEN BY A MEASURED HEIGHT
//
// The first version interpolated from a hard-coded `CORNERS_HEIGHT`, and it
// rendered permanently collapsed — a constant that has to match what the
// content actually needs is a guess, and when the guess is short the block is
// clipped to nothing before anybody scrolls. So the block reports its own
// natural height through `onLayout` and the animation runs from THAT.
//
// The important half is the fallback: until it has been measured the animated
// style returns `{}`, so the header renders at natural height. It is expanded by
// construction, and no arithmetic can start it folded.
//
// ## ⚠ THE TABS ARE A CHILD, NOT A SIBLING
//
// A strip sitting below a shrinking header slides up under the thumb mid-tap —
// on a 375pt screen that is the difference between opening Duel and opening
// Picks. Only the block ABOVE the strip changes height.
//
// ## ⚠ YOUR CORNER NEVER SWAPS SIDES
//
// You are always left and always `primary`; they are always right and `red`.
// Laying the corners out by `entry_a` / `entry_b` — the circle method's own
// sides — would put you on the left some weeks and the right others, and make
// your own record unreadable at a glance.
// =============================================================

/** How far you scroll before the matchup is fully folded away. */
const COLLAPSE_DISTANCE = 90;

/** A member's standing, for the `position · PTS` line under each name. */
export type Standing = { rank: number | null; points: number };

type Props = {
  poolName: string;
  poolCode: string | null;
  /** The duel to show. Null when the draw has not been made yet. */
  bout: Bout | null;
  /** The next sealed matchweek, when there is one. */
  sealed: { matchweek: number; opensAt: string | null } | null;
  /** entry_id → where they sit on the leaderboard. */
  standings: Map<string, Standing>;
  /** Shared vertical scroll offset of whichever tab is on screen. */
  scrollY: SharedValue<number>;
  /** The tab strip. Rendered inside this component — see the header note. */
  children: ReactNode;
};

export function ShowdownDuelHeader({
  poolName,
  poolCode,
  bout,
  sealed,
  standings,
  scrollY,
  children,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // Natural height of the matchup block, reported by the block itself.
  const [naturalHeight, setNaturalHeight] = useState(0);

  const matchupStyle = useAnimatedStyle(() => {
    // ⚠ Not measured yet — render at natural height. This is what makes the
    // header expanded on first paint rather than dependent on a constant.
    if (naturalHeight === 0) return {};
    const p = interpolate(scrollY.value, [0, COLLAPSE_DISTANCE], [0, 1], Extrapolation.CLAMP);
    return {
      height: naturalHeight * (1 - p),
      opacity: interpolate(p, [0, 0.7], [1, 0], Extrapolation.CLAMP),
    };
  });

  const collapsedStyle = useAnimatedStyle(() => {
    if (naturalHeight === 0) return { height: 0, opacity: 0 };
    const p = interpolate(scrollY.value, [0, COLLAPSE_DISTANCE], [0, 1], Extrapolation.CLAMP);
    return {
      height: interpolate(p, [0, 1], [0, 34], Extrapolation.CLAMP),
      opacity: interpolate(p, [0.55, 1], [0, 1], Extrapolation.CLAMP),
    };
  });

  async function handleShare() {
    if (!poolCode) return;
    const url = `https://sportpool.io/join/${poolCode}`;
    await Share.share({ message: `Join "${poolName}" on SportPool!\n\n${url}`, url });
  }

  return (
    <View
      style={{
        backgroundColor: theme.colors.snow,
        paddingTop: insets.top + theme.spacing.xs,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.silver,
      }}
    >
      {/* ---------- row 1: chrome, always visible ---------- */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.xs,
        }}
      >
        <RoundButton icon="chevron.left" label="Back" onPress={() => router.back()} />

        {/* Centred by construction: both flanks are the same fixed width, so the
            name sits on the true centre of the screen whatever its length. */}
        <View style={{ flex: 1, minWidth: 0, paddingHorizontal: theme.spacing.sm }}>
          <Text variant="cardTitle" numberOfLines={1} align="center" style={{ fontSize: 15 }}>
            {poolName}
          </Text>
        </View>

        {poolCode ? (
          <RoundButton icon="square.and.arrow.up" label="Share pool" onPress={handleShare} />
        ) : (
          <View style={{ width: 32 }} />
        )}
      </View>

      {/* ---------- rows 2–3: the matchup, collapsing ---------- */}
      <Animated.View style={[{ overflow: 'hidden' }, matchupStyle]}>
        {/* The measured child. `onLayout` reports what the content actually
            needs, which is what the animation above interpolates from. */}
        <View
          onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            // Guard the set: onLayout fires on every re-render, and writing the
            // same number back would re-render forever.
            if (h > 0 && h !== naturalHeight) setNaturalHeight(h);
          }}
        >
          <Matchup bout={bout} sealed={sealed} standings={standings} />
        </View>
      </Animated.View>

      {/* ---------- the collapsed line ---------- */}
      <Animated.View style={[{ overflow: 'hidden', justifyContent: 'center' }, collapsedStyle]}>
        <CollapsedLine bout={bout} sealed={sealed} />
      </Animated.View>

      {/* ---------- row 4: the tab strip, inside the header ---------- */}
      {children}
    </View>
  );
}

// ------------------------------------------------------------- the matchup

function Matchup({
  bout,
  sealed,
  standings,
}: {
  bout: Bout | null;
  sealed: Props['sealed'];
  standings: Map<string, Standing>;
}) {
  const theme = useTheme();

  const matchweek = bout?.matchweek ?? sealed?.matchweek ?? null;

  return (
    <View style={{ paddingBottom: theme.spacing.md }}>
      {/* ---------- row 2: matchweek ---------- */}
      {matchweek !== null ? (
        <Text
          align="center"
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 10,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            color: theme.colors.slate,
            marginBottom: theme.spacing.sm,
          }}
        >
          Matchweek {matchweek}
          {!bout && sealed ? ' · sealed' : ''}
        </Text>
      ) : null}

      {/* ---------- row 3: the two corners and the v ---------- */}
      {bout ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            paddingHorizontal: theme.spacing.lg,
          }}
        >
          <Corner
            name={bout.you.name}
            standing={standings.get(bout.you.entryId) ?? null}
            tone="primary"
          />
          <Middle bout={bout} />
          <Corner
            name={bout.them ? bout.them.name : 'Nobody'}
            standing={bout.them ? standings.get(bout.them.entryId) ?? null : null}
            tone={bout.them ? 'red' : 'muted'}
            subtitle={bout.them ? undefined : 'Bye week'}
          />
        </View>
      ) : (
        <Text align="center" variant="body" color="slate" style={{ paddingHorizontal: 24 }}>
          {sealed
            ? 'Your opponent opens one week at a time.'
            : 'The draw is made once there are two members.'}
        </Text>
      )}
    </View>
  );
}

/**
 * The centre column: the `v` before a duel is played, the scoreline after.
 *
 * ⚠ Only `duelResult` decides the colour. A literal 3 / 1 here is the bug
 * migration 121 left behind on the web for a week — it would tint a win as a
 * defeat while the leaderboard had the member climbing.
 */
function Middle({ bout }: { bout: Bout }) {
  const theme = useTheme();
  const { you, them, settled } = bout;
  const result = settled && them ? duelResult(you.points) : null;
  const tint =
    result === 'won'
      ? theme.colors.green
      : result === 'lost'
        ? theme.colors.red
        : theme.colors.ink;

  return (
    <View style={{ minWidth: 64, alignItems: 'center', paddingTop: 16 }}>
      {settled && them ? (
        <Text
          style={{
            fontFamily: fontFamilies.black,
            fontSize: 22,
            color: tint,
            fontVariant: ['tabular-nums'],
          }}
        >
          {you.accuracy ?? 0}–{them.accuracy ?? 0}
        </Text>
      ) : (
        <Text
          style={{
            fontFamily: fontFamilies.black,
            fontSize: 20,
            color: theme.colors.slate,
          }}
        >
          {them ? 'v' : '—'}
        </Text>
      )}
      <Text
        align="center"
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 8,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: theme.colors.slate,
          marginTop: 3,
        }}
      >
        {!them ? 'no opponent' : settled ? (result ?? '') : 'to play'}
      </Text>
    </View>
  );
}

/** Avatar, username, then `position · PTS`. */
function Corner({
  name,
  standing,
  tone,
  subtitle,
}: {
  name: string;
  standing: Standing | null;
  tone: 'primary' | 'red' | 'muted';
  subtitle?: string;
}) {
  const theme = useTheme();
  const color =
    tone === 'primary'
      ? theme.colors.primary
      : tone === 'red'
        ? theme.colors.red
        : theme.colors.slate;

  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 5 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: theme.radii.pill,
          borderWidth: 2,
          borderColor: color,
          backgroundColor: withOpacity(color, 0.12),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: fontFamilies.black, fontSize: 18, color }}>
          {initials(name)}
        </Text>
      </View>

      <Text variant="cardTitle" numberOfLines={1} align="center" style={{ fontSize: 14 }}>
        {name}
      </Text>

      {subtitle ? (
        <Text variant="detail" color="slate" align="center">
          {subtitle}
        </Text>
      ) : (
        <Text
          align="center"
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 11,
            color: theme.colors.slate,
            fontVariant: ['tabular-nums'],
          }}
        >
          {/* ⚠ An unranked entry shows a dash, never "0th". A member who has not
              been scored yet has no position — printing one would invent it. */}
          {standing?.rank != null ? `${ordinal(standing.rank)}` : '—'}
          {' · '}
          {standing ? standing.points.toLocaleString() : '0'} pts
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------- collapsed line

function CollapsedLine({ bout, sealed }: { bout: Bout | null; sealed: Props['sealed'] }) {
  const theme = useTheme();

  if (!bout) {
    return (
      <Text
        align="center"
        variant="body"
        color="slate"
        numberOfLines={1}
        style={{ paddingHorizontal: theme.spacing.lg }}
      >
        {sealed ? `Matchweek ${sealed.matchweek} · sealed` : 'No duel yet'}
      </Text>
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
        {you.name}
      </Text>
      <Text
        style={{
          fontFamily: fontFamilies.black,
          fontSize: 14,
          color: tint,
          fontVariant: ['tabular-nums'],
        }}
      >
        {settled && them ? `${you.accuracy ?? 0}–${them.accuracy ?? 0}` : them ? 'v' : 'bye'}
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

// -------------------------------------------------------------- furniture

function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 32,
        height: 32,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.mist,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name={icon} color="slate" size={15} weight="semibold" />
    </Pressable>
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

/** 1 → 1st, 2 → 2nd, 11 → 11th. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
