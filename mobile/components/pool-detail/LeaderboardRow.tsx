import { Platform, Pressable, Text as RNText, View } from 'react-native';

import { AwardBadge, FormDots, LevelPill, rankColor } from './leaderboard-shared';
import { Icon, Text } from '@/components/ui';
import type { LeaderboardEntry, PoolAward } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type RowProps = {
  entry: LeaderboardEntry;
  rank: number;
  isCurrentUser: boolean;
  awards: PoolAward[];
  onPress?: () => void;
};

export function LeaderboardRow({ entry, rank, isCurrentUser, awards, onPress }: RowProps) {
  const theme = useTheme();
  const name = entry.entry_name?.trim() ? entry.entry_name : entry.full_name;
  const rankDelta =
    entry.previous_rank !== null && entry.current_rank !== null
      ? entry.previous_rank - entry.current_rank
      : 0;
  const rankFg = rankColor(rank, theme);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.md + 2,
        borderRadius: theme.radii.lg,
        // Current-user row. iOS uses the alpha-based tint + 1.5pt border that
        // renders cleanly via iOS's CoreAnimation compositor. Android uses
        // pre-blended solid hex equivalents — alpha-compositing the border
        // over the tint over elevation created a visible "double container"
        // ring. Android values are also bumped a notch (~15% bg, ~40%
        // border, 2pt) so the row reads as clearly distinct against the
        // surrounding white rows; iOS achieves the same visual punch with
        // its softer alpha values thanks to platform shadow/tint rendering.
        backgroundColor: isCurrentUser
          ? Platform.OS === 'android'
            ? '#E2E6FA' // primary @ 15% pre-blended over white
            : withOpacity(theme.colors.primary, 0.08)
          : theme.colors.surface,
        borderWidth: isCurrentUser
          ? Platform.OS === 'android'
            ? 2
            : theme.borders.accent
          : 0,
        borderColor: isCurrentUser
          ? Platform.OS === 'android'
            ? '#B1BDF1' // primary @ 40% pre-blended over white
            : withOpacity(theme.colors.primary, 0.25)
          : 'transparent',
        opacity: pressed ? 0.85 : 1,
        ...theme.shadows.card,
      })}
    >
      <View style={{ width: 36, alignItems: 'center' }}>
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 14,
            fontWeight: '900',
            color: rankFg,
          }}
        >
          #{rank}
        </RNText>
        {rankDelta !== 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1, marginTop: 2 }}>
            <Icon
              name={rankDelta > 0 ? 'arrowtriangle.up.fill' : 'arrowtriangle.down.fill'}
              color={rankDelta > 0 ? 'green' : 'red'}
              size={8}
            />
            <RNText
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 9,
                color: rankDelta > 0 ? theme.colors.green : theme.colors.red,
              }}
            >
              {Math.abs(rankDelta)}
            </RNText>
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="cardTitle" numberOfLines={1} style={{ flexShrink: 1 }}>
            {name}
          </Text>
          {isCurrentUser ? (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: theme.radii.pill,
                backgroundColor: withOpacity(theme.colors.primary, 0.15),
              }}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 9,
                  color: theme.colors.primary,
                  letterSpacing: 0.5,
                }}
              >
                YOU
              </RNText>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text variant="detail" color="slate">
            @{entry.username}
          </Text>
          <LevelPill level={entry.level} levelName={entry.level_name} />
        </View>
        {awards.length > 0 ? (
          <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
            {awards.map((a) => (
              <AwardBadge key={a.type} award={a} />
            ))}
          </View>
        ) : null}
        <FormDots results={entry.last_five} streak={entry.current_streak} />
      </View>

      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 17,
            fontWeight: '900',
            color: theme.colors.primary,
          }}
        >
          {entry.total_points.toLocaleString()}
        </RNText>
        <Text variant="detail" color="slate">
          {entry.match_points} + {entry.bonus_points}
        </Text>
        <Text variant="detail" color="slate">
          {entry.exact_count} exact · {Math.round(entry.hit_rate)}%
        </Text>
      </View>

      <Icon name="chevron.right" color="slate" size={11} />
    </Pressable>
  );
}
