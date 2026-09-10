import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, Text as RNText, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Icon, Text } from '@/components/ui';
import type { DossierResponse } from '@/lib/api';
import { getInitials, gradientForUser } from '@/lib/avatarGradient';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// The scout report's header — who this is, and where
// =============================================================
// A collapsing band, the same idea as the Showdown matchup header: it FLOATS
// over the scroll view rather than sitting above it, so sliding it up reclaims
// the space with no layout pass. `translateY` and `opacity` are compositor
// properties and run at display rate.
//
// ## ⚠ THE ROW THAT SURVIVES IS ALREADY THE TOP ROW
//
// The duel header morphs — every piece travels to its own collapsed position,
// with the arithmetic that implies. This does not, on purpose. The identity row
// (back arrow, avatar, name) is the FIRST thing in the band, and the band slides
// up by exactly the height of everything BELOW it. So the row lands where it
// lands because it was never going to move relative to the band's top, and there
// is no landing position to compute or get wrong.
//
// The avatar still shrinks, because a 56pt circle in a 44pt chrome row would
// overflow it. That is one scale on one view, not a morph.
//
// ⚠ THE SLIDE DISTANCE IS MEASURED, NEVER ASSUMED. `detailsH` comes from
// `onLayout` on the block that goes away. A hardcoded height is wrong the first
// time a name wraps to two lines, and wrong differently on every device.
// =============================================================

/** Height of the row that stays behind. Matches the chrome rows elsewhere. */
export const IDENTITY_ROW = 52;

export function DossierHeader({
  data,
  scrollY,
  topInset,
  onHeight,
  onDetailsHeight,
}: {
  data: DossierResponse;
  scrollY: SharedValue<number>;
  topInset: number;
  /** Total expanded height, so the scroll view can pad by it. */
  onHeight: (h: number) => void;
  /** How far the band may travel — the part that disappears. */
  onDetailsHeight: (h: number) => void;
}) {
  const theme = useTheme();

  const displayName = data.entry_name?.trim()
    ? data.entry_name
    : (data.full_name ?? 'This member');

  // ⚠ KEYED ON THE USER, NOT THE ENTRY. A member must be the same colour here
  // as in Banter and on the duel card; the array's order is frozen for exactly
  // that reason (see `avatarGradient.ts`).
  const gradient = data.user_id ? gradientForUser(data.user_id) : null;

  return (
    <View
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
      style={{
        paddingTop: topInset + 6,
        backgroundColor: theme.colors.snow,
      }}
    >
      <IdentityRow
        name={displayName}
        gradient={gradient}
        scrollY={scrollY}
        isSelf={data.is_self}
      />

      <Details
        data={data}
        displayName={displayName}
        scrollY={scrollY}
        onLayout={(h) => onDetailsHeight(h)}
      />
    </View>
  );
}

/** Back, avatar, name. The row that is still there at the bottom of the scroll. */
function IdentityRow({
  name,
  gradient,
  scrollY,
  isSelf,
}: {
  name: string;
  gradient: readonly [string, string] | null;
  scrollY: SharedValue<number>;
  isSelf: boolean;
}) {
  const theme = useTheme();

  /**
   * ⚠ THE AVATAR SHRINKS AROUND ITS OWN CENTRE, so the row's layout never
   * changes — only what is drawn inside a box that stays 34pt. Scaling the
   * ROW would move the name with it.
   */
  const avatarShrink = useAnimatedStyle(() => {
    const p = interpolate(scrollY.value, [0, 60], [0, 1], Extrapolation.CLAMP);
    return { transform: [{ scale: 1 - p * 0.18 }] };
  });

  return (
    <View
      style={{
        height: IDENTITY_ROW,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 10,
      }}
    >
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Icon name="chevron.left" size={22} color="ink" />
      </Pressable>

      <Animated.View style={avatarShrink}>
        <Avatar name={name} gradient={gradient} size={34} />
      </Animated.View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <RNText
          numberOfLines={1}
          style={{ fontFamily: fontFamilies.black, fontSize: 17, color: theme.colors.ink }}
        >
          {isSelf ? 'Your season' : name}
        </RNText>
      </View>

      {/* ⚠ THE WORD "SCOUT" LIVES HERE RATHER THAN AS A TITLE ABOVE THE NAME.
          Once the band collapses this row is the whole header, and a row that
          says only a person's name does not say what screen you are on. */}
      <Text variant="caption" color="slate">
        Scout
      </Text>
    </View>
  );
}

/** Everything that goes away: the big avatar, the pool, and the standing. */
function Details({
  data,
  displayName,
  scrollY,
  onLayout,
}: {
  data: DossierResponse;
  displayName: string;
  scrollY: SharedValue<number>;
  onLayout: (h: number) => void;
}) {
  const theme = useTheme();
  const { pool, competition, standing } = data;

  /**
   * ⚠ IT FADES FASTER THAN THE BAND TRAVELS. Text at 40% opacity halfway
   * through a slide reads as a rendering fault rather than a transition, so it
   * is gone by the time the band is 55% of the way up.
   */
  const fade = useAnimatedStyle(() => {
    const p = interpolate(scrollY.value, [0, 90], [0, 1], Extrapolation.CLAMP);
    return { opacity: interpolate(p, [0, 0.55], [1, 0], Extrapolation.CLAMP) };
  });

  const subtitle = data.is_self ? displayName : (data.full_name ?? null);

  return (
    <Animated.View
      onLayout={(e) => onLayout(e.nativeEvent.layout.height)}
      style={[{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 18 }, fade]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar
          name={displayName}
          gradient={data.user_id ? gradientForUser(data.user_id) : null}
          size={58}
        />

        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <RNText
            numberOfLines={1}
            style={{ fontFamily: fontFamilies.black, fontSize: 22, color: theme.colors.ink }}
          >
            {data.is_self ? 'Your season' : displayName}
          </RNText>

          {/* ⚠ ONLY WHEN IT ADDS SOMETHING. For most members the entry name IS
              their name, and printing it twice under itself looks like a bug. */}
          {subtitle && subtitle !== displayName ? (
            <Text variant="body" color="slate" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {pool || competition ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
          {pool ? <Chip label={pool.name} tone="primary" /> : null}
          {pool?.league_mode ? <Chip label={modeLabel(pool.league_mode)} tone="mode" /> : null}
          {competition ? (
            <Chip label={`${competition.name} ${competition.season}`} tone="plain" />
          ) : null}
        </View>
      ) : null}

      {standing ? (
        <View style={{ flexDirection: 'row', gap: 18, marginTop: 14 }}>
          {/* ⚠⚠ `rank` IS NULL IN LAST MAN STANDING AND THE SERVER IS WHAT
              WITHHELD IT — the stored column is entry-id order there, not a
              standing. Do not reach for it from anywhere else. */}
          {standing.rank !== null ? (
            <Figure value={`${standing.rank}`} label="in the pool" ordinal />
          ) : null}
          <Figure value={`${standing.total_points}`} label="points" />
        </View>
      ) : null}
    </Animated.View>
  );
}

function Avatar({
  name,
  gradient,
  size,
}: {
  name: string;
  gradient: readonly [string, string] | null;
  size: number;
}) {
  const theme = useTheme();
  const initials = getInitials(name);

  // ⚠ A MEMBER WITH NO USER ID STILL GETS A CIRCLE. An entry can outlive its
  // user row; a missing gradient must not leave a hole where a face goes.
  if (!gradient) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: theme.radii.pill,
          backgroundColor: withOpacity(theme.colors.primary, 0.12),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: Math.round(size * 0.36),
            color: theme.colors.primary,
          }}
        >
          {initials}
        </RNText>
      </View>
    );
  }

  return (
    <LinearGradient
      colors={gradient as unknown as [string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: theme.radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.black,
          fontSize: Math.round(size * 0.36),
          color: '#FFFFFF',
        }}
      >
        {initials}
      </RNText>
    </LinearGradient>
  );
}

function Chip({ label, tone }: { label: string; tone: 'primary' | 'mode' | 'plain' }) {
  const theme = useTheme();
  const bg =
    tone === 'primary'
      ? withOpacity(theme.colors.primary, 0.14)
      : tone === 'mode'
        ? withOpacity(theme.colors.accent, 0.14)
        : theme.colors.mist;
  const fg =
    tone === 'primary'
      ? theme.colors.primary
      : tone === 'mode'
        ? theme.colors.accent
        : theme.colors.slate;

  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: theme.radii.pill,
        backgroundColor: bg,
        maxWidth: '100%',
      }}
    >
      <RNText
        numberOfLines={1}
        style={{ fontFamily: fontFamilies.bold, fontSize: 11, color: fg }}
      >
        {label}
      </RNText>
    </View>
  );
}

function Figure({
  value,
  label,
  ordinal,
}: {
  value: string;
  label: string;
  ordinal?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 17,
          color: theme.colors.ink,
          fontVariant: ['tabular-nums'],
        }}
      >
        {ordinal ? ordinalise(value) : value}
      </RNText>
      <Text variant="detail" color="slate">
        {label}
      </Text>
    </View>
  );
}

/** 1 → 1st. ⚠ 11th/12th/13th are not 11st/12nd/13rd. */
function ordinalise(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const ones = n % 10;
  return `${n}${ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th'}`;
}

function modeLabel(mode: string): string {
  return mode === 'pickem'
    ? "Pick'em"
    : mode === 'showdown'
      ? 'Showdown'
      : mode === 'last_man_standing'
        ? 'Last Man Standing'
        : mode === 'table'
          ? 'Predict the Table'
          : mode;
}
