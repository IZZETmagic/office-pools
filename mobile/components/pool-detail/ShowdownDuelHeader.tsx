import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Share, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { getInitials, gradientForUser } from '@/lib/avatarGradient';
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

/**
 * The corner avatar. Big on purpose — it is the subject of the screen, and
 * everything under it (name 15, standing 12) is sized to stay subordinate.
 */
const AVATAR = 80;

/** How far you scroll before the matchup is fully folded away. */
const COLLAPSE_DISTANCE = 90;

/**
 * A member, as the corner needs them.
 *
 * ⚠ `userId` is here for the AVATAR, not the standing. The gradient is
 * `hash(userId)`, which is how the same person is the same colour in Banter and
 * here — key it on `entry_id` and somebody's rival changes colour between two
 * screens of the same app.
 */
export type Standing = { userId: string | null; rank: number | null; points: number };

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
        <CollapsedLine bout={bout} sealed={sealed} standings={standings} />
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
    // ⚠ Generous on purpose. This is the screen the mode is named after, and
    // a cramped matchup reads as a summary of the duel rather than the duel.
    <View style={{ paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xl }}>
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
            marginBottom: theme.spacing.lg,
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
            paddingHorizontal: theme.spacing.md,
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
    <View style={{ minWidth: 72, alignItems: 'center', paddingTop: 27, gap: 5 }}>
      {settled && them ? (
        <Text
          style={{
            fontFamily: fontFamilies.black,
            fontSize: 22,
            lineHeight: 28, // see the initials above — 'body' caps it at 20
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
            lineHeight: 26, // see the initials above — 'body' caps it at 20
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
  const userId = standing?.userId ?? null;

  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 9 }}>
      {/*
        The shaded avatar the rest of the app uses — gradient keyed on the
        person, white initials. The ring stays in the CORNER colour so you can
        still find yourself at a glance: the gradient says WHO, the ring says
        WHICH SIDE.

        ⚠ TWO VIEWS, AND IT HAS TO BE TWO. A shadow is clipped by
        `overflow: 'hidden'` on the same element, and the avatar needs that clip
        to stay round — so the outer view carries the lift and the inner one
        carries the circle. Collapsing them loses the shadow silently.

        ⚠ The outer view needs a solid `backgroundColor` or Android draws no
        elevation at all. It takes the header's own colour, so nothing shows
        around the circle it sits behind.
      */}
      <View
        style={{
          width: AVATAR,
          height: AVATAR,
          borderRadius: theme.radii.pill,
          backgroundColor: theme.colors.snow,
          // ⚠ THE LIFT IS DIFFERENT IN THE TWO THEMES, and it has to be. A dark
          // drop shadow on a near-black surface is invisible — it was on BOTH
          // avatars and rendering nothing, which looked like the effect only
          // applying to one of them. On dark the depth is a centred coloured
          // GLOW; on light it stays a shadow.
          ...(theme.mode === 'dark' ? theme.shadows.avatarGlow : theme.shadows.avatar),
          // Tinted with the person's own colour, so the avatar reads as lit
          // rather than as a sticker dropped on the page. The LIGHTER stop —
          // the darker one is what made the glow disappear into the background
          // it was supposed to lift off.
          shadowColor: userId ? gradientForUser(userId)[0] : theme.colors.slate,
        }}
      >
        <View
          style={{
            width: AVATAR,
            height: AVATAR,
            borderRadius: theme.radii.pill,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            // ⚠ TRANSPARENT WHEN THERE IS A GRADIENT, and that is not a
            // tidy-up. A `backgroundColor` paints UNDER a border, so the
            // previous tint bled through the opponent's transparent ring as a
            // faint red halo — a ring we had just removed, back again in a
            // paler shade. Only the empty case needs a fill.
            backgroundColor: userId ? 'transparent' : withOpacity(color, 0.12),
          }}
        >
          {userId ? (
            <LinearGradient
              colors={[...gradientForUser(userId)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                // ⚠ THE GRADIENT ROUNDS ITSELF. The parent's `overflow` does
                // not reliably clip an absolutely-positioned child to a border
                // radius — the opponent came out an octagon the moment their
                // ring stopped drawing the outline for them.
                borderRadius: theme.radii.pill,
              }}
            />
          ) : null}
          <Text
            style={{
              fontFamily: fontFamilies.black,
              fontSize: 26,
              // ⚠ SET WITH THE FONT SIZE, ALWAYS. `Text` defaults to variant
              // 'body' and its `lineHeight: 20` shears the tops off anything
              // larger.
              lineHeight: 32,
              color: userId ? '#FFFFFF' : color,
            }}
          >
            {getInitials(name)}
          </Text>
        </View>

        {/*
          THE RIM LIGHT — the bit that actually makes the avatar look raised.

          Ryan spotted it on his own avatar before it was deliberate: his ring is
          a FLAT primary blue while the gradient beneath runs light at the top to
          dark at the bottom, so the ring vanishes into the crown and stands
          slightly lighter than the base. The eye reads that lit bottom edge as
          the disc lifting off the page — which is the depth the drop shadow was
          never delivering.

          So it becomes a real component, on BOTH avatars: a ring that is
          transparent on three sides and faintly light along the bottom. Per-side
          border colours over a pill radius render as four arcs, and only the
          base one is painted.

          ⚠ `borderBottomColor` after `borderColor` is not stylistic ordering —
          RN resolves the specific side over the general one, which is what
          leaves the other three arcs invisible.
        */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: theme.radii.pill,
            borderWidth: 2,
            borderColor: 'transparent',
            borderBottomColor:
              theme.mode === 'dark' ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.55)',
          }}
        />

        {/*
          ⚠ THE RING IS AN OVERLAY, NOT A BORDER ON THE CIRCLE — Ryan, and it
          took three goes to get here. A border insets its content, so putting
          one only on your own avatar made the two circles different sizes;
          keeping it transparent on theirs fixed the size and let the background
          bleed through as a halo instead.

          Drawn on top, at the same bounds, it changes NO geometry: both avatars
          are the same circle, and only one of them is wearing anything.
        */}
        {tone === 'primary' ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: theme.radii.pill,
              borderWidth: 3,
              borderColor: color,
            }}
          />
        ) : null}
      </View>

      <Text variant="cardTitle" numberOfLines={1} align="center" style={{ fontSize: 15 }}>
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
            fontSize: 12,
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

function CollapsedLine({
  bout,
  sealed,
  standings,
}: {
  bout: Bout | null;
  sealed: Props['sealed'];
  standings: Map<string, Standing>;
}) {
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
  const youUser = standings.get(you.entryId)?.userId ?? null;
  const themUser = them ? standings.get(them.entryId)?.userId ?? null : null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
      }}
    >
      <Dot name={you.name} userId={youUser} tone="primary" />
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
      <Dot name={them ? them.name : '—'} userId={themUser} tone={them ? 'red' : 'muted'} />
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

function Dot({
  name,
  userId,
  tone,
}: {
  name: string;
  userId: string | null;
  tone: 'primary' | 'red' | 'muted';
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
        width: 22,
        height: 22,
        borderRadius: theme.radii.pill,
        overflow: 'hidden',
        backgroundColor: withOpacity(color, 0.14),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {userId ? (
        <LinearGradient
          colors={[...gradientForUser(userId)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            // Rounds itself — see the corner avatar for why the parent's clip
            // is not enough on its own.
            borderRadius: theme.radii.pill,
          }}
        />
      ) : null}
      <Text
        style={{
          fontFamily: fontFamilies.black,
          fontSize: 8,
          color: userId ? '#FFFFFF' : color,
        }}
      >
        {getInitials(name)}
      </Text>
    </View>
  );
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
