import { Platform, Pressable, Text as RNText, View } from 'react-native';

import { AwardBadge, FormDots, LevelPill } from './leaderboard-shared';
import { Icon, Text } from '@/components/ui';
import type { LeaderboardEntry, PoolAward } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type PodiumProps = {
  entries: LeaderboardEntry[];
  currentUserId: string | null;
  awardsByEntry: Record<string, PoolAward[]>;
  onEntryPress?: (entryId: string) => void;
};

export function LeaderboardPodium({
  entries,
  currentUserId,
  awardsByEntry,
  onEntryPress,
}: PodiumProps) {
  const theme = useTheme();
  if (entries.length < 3) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: theme.spacing.sm,
        paddingTop: theme.spacing.sm,
      }}
    >
      <PodiumColumn
        entry={entries[1]}
        rank={2}
        pedestalHeight={120}
        ringColor={theme.colors.silver}
        bgTint={withOpacity(theme.colors.silver, 0.15)}
        medalIcon="medal.fill"
        isCurrentUser={entries[1].user_id === currentUserId}
        awards={awardsByEntry[entries[1].entry_id] ?? []}
        onPress={onEntryPress ? () => onEntryPress(entries[1].entry_id) : undefined}
      />
      <PodiumColumn
        entry={entries[0]}
        rank={1}
        pedestalHeight={150}
        ringColor={theme.colors.accent}
        bgTint={withOpacity(theme.colors.accent, 0.1)}
        medalIcon="trophy.fill"
        isCurrentUser={entries[0].user_id === currentUserId}
        awards={awardsByEntry[entries[0].entry_id] ?? []}
        onPress={onEntryPress ? () => onEntryPress(entries[0].entry_id) : undefined}
      />
      <PodiumColumn
        entry={entries[2]}
        rank={3}
        pedestalHeight={100}
        ringColor={theme.colors.bronze}
        bgTint={withOpacity(theme.colors.bronze, 0.1)}
        medalIcon="medal.fill"
        isCurrentUser={entries[2].user_id === currentUserId}
        awards={awardsByEntry[entries[2].entry_id] ?? []}
        onPress={onEntryPress ? () => onEntryPress(entries[2].entry_id) : undefined}
      />
    </View>
  );
}

function PodiumColumn({
  entry,
  rank,
  pedestalHeight,
  ringColor,
  bgTint,
  medalIcon,
  isCurrentUser,
  awards,
  onPress,
}: {
  entry: LeaderboardEntry;
  rank: number;
  pedestalHeight: number;
  ringColor: string;
  bgTint: string;
  medalIcon: string;
  isCurrentUser: boolean;
  awards: PoolAward[];
  onPress?: () => void;
}) {
  const theme = useTheme();
  const name = entry.entry_name?.trim() ? entry.entry_name : entry.full_name;
  const rankDelta =
    entry.previous_rank !== null && entry.current_rank !== null
      ? entry.previous_rank - entry.current_rank
      : 0;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: theme.spacing.xs,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: '100%', alignItems: 'center', height: 60, justifyContent: 'center' }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            borderWidth: 3,
            borderColor: ringColor,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={medalIcon as never} color="slate" size={22} />
        </View>
        {rankDelta !== 0 ? (
          <View
            style={{
              position: 'absolute',
              right: '12%',
              bottom: -2,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 1,
              paddingHorizontal: 5,
              paddingVertical: 2,
              borderRadius: 999,
              backgroundColor: rankDelta > 0 ? theme.colors.green : theme.colors.red,
            }}
          >
            <Icon
              name={rankDelta > 0 ? 'arrowtriangle.up.fill' : 'arrowtriangle.down.fill'}
              color="ink"
              size={7}
            />
            <RNText
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 8,
                color: '#FFFFFF',
              }}
            >
              {Math.abs(rankDelta)}
            </RNText>
          </View>
        ) : null}
        {awards.length > 0 ? (
          <View
            style={{
              position: 'absolute',
              left: '8%',
              bottom: -2,
              flexDirection: 'row',
              gap: 2,
            }}
          >
            {awards.slice(0, 3).map((a) => (
              <AwardDot key={a.type} type={a.type} />
            ))}
          </View>
        ) : null}
      </View>

      <Text variant="caption" color={isCurrentUser ? 'primary' : 'ink'} align="center" numberOfLines={1}>
        {name}
      </Text>
      <Text variant="detail" color="slate" numberOfLines={1}>
        @{entry.username}
      </Text>
      <LevelPill level={entry.level} levelName={entry.level_name} />
      <FormDots results={entry.last_five} streak={entry.current_streak} size={7} />

      <View
        style={{
          alignSelf: 'stretch',
          height: pedestalHeight,
          borderRadius: theme.radii.md,
          backgroundColor: bgTint,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: theme.spacing.sm,
          gap: 2,
        }}
      >
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 22,
            fontWeight: '900',
            color: theme.colors.primary,
          }}
        >
          {entry.total_points.toLocaleString()}
        </RNText>
        <Text variant="detail" color="slate" align="center">
          {entry.match_points} + {entry.bonus_points}
        </Text>
        <Text variant="detail" color="slate" align="center" numberOfLines={1}>
          {entry.exact_count} exact · {Math.round(entry.hit_rate)}%
        </Text>
      </View>
    </Pressable>
  );
}

const AWARD_DOT_COLOR: Record<string, 'accent' | 'primary' | 'red'> = {
  mvp: 'accent',
  contrarian: 'primary',
  crowd: 'primary',
  hot: 'red',
  cold: 'primary',
};

function AwardDot({ type }: { type: string }) {
  const color = AWARD_DOT_COLOR[type] ?? 'accent';
  const theme = useTheme();
  const bg = color === 'accent' ? theme.colors.accent : color === 'red' ? theme.colors.red : theme.colors.primary;
  return (
    <View
      style={{
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon
        name={(type === 'mvp' ? 'trophy.fill' : type === 'hot' ? 'flame.fill' : type === 'cold' ? 'snowflake' : type === 'contrarian' ? 'dice.fill' : 'person.3.fill') as never}
        color="ink"
        size={8}
      />
    </View>
  );
}
