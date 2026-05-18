import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text as RNText,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { BadgeDetailSheet, type BadgeDetailSheetHandle } from './BadgeDetailSheet';
import { badgeIcon, type BadgeIconSpec } from './badge-icons';
import { Icon, Text } from '@/components/ui';
import type {
  AnalyticsResponse,
  AnalyticsStreakData,
  BadgeInfo,
  CrowdData,
  CrowdMatchItem,
  LevelInfo,
  MatchXPItem,
  PoolStatsData,
  PredictableMatch,
  XPData,
} from '@/lib/api';
import { useEntryAnalytics } from '@/lib/useEntryAnalytics';
import { usePoolEntries, type PoolEntry } from '@/lib/usePoolEntries';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Props = {
  poolId: string;
};

export function FormTab({ poolId }: Props) {
  const theme = useTheme();
  const { entries, loading: entriesLoading } = usePoolEntries(poolId);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const badgeSheetRef = useRef<BadgeDetailSheetHandle>(null);

  const activeEntryId = selectedEntryId ?? entries[0]?.entryId ?? null;
  const { data, loading, error } = useEntryAnalytics(
    poolId,
    activeEntryId ?? undefined,
  );

  if (entriesLoading && entries.length === 0) {
    return (
      <View style={{ paddingVertical: theme.spacing.xxxl, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyMessage
        icon="chart.bar.xaxis"
        title="No entries yet"
        body="Join the pool to start tracking your form."
      />
    );
  }

  if (loading && !data) {
    return (
      <View style={{ paddingVertical: theme.spacing.xxxl, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (error) {
    return <EmptyMessage icon="exclamationmark.triangle" title="Error" body={error} />;
  }

  if (!data) {
    return (
      <EmptyMessage
        icon="chart.bar.xaxis"
        title="Analytics coming soon"
        body="Analytics will appear once matches are completed."
      />
    );
  }

  return (
    <>
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.xxxl,
          gap: theme.spacing.lg,
        }}
      >
        {entries.length > 1 ? (
          <EntrySelector
            entries={entries}
            activeId={activeEntryId}
            onChange={setSelectedEntryId}
          />
        ) : null}
        <Pressable
          onPress={() =>
            activeEntryId &&
            router.push(`/pool/${poolId}/levels?entryId=${activeEntryId}`)
          }
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        >
          <XPHeroCard xp={data.xp} />
        </Pressable>
        {data.xp.all_badges.length > 0 ? (
          <BadgesSection
            earned={data.xp.earned_badges}
            all={data.xp.all_badges}
            onBadgePress={(badge, earned) =>
              badgeSheetRef.current?.open(badge, earned)
            }
          />
        ) : null}
        <HotColdStreakCards streaks={data.streaks} />
        <TournamentRunSection matchXP={data.xp.match_xp} crowd={data.crowd.matches} />
        <CrowdSection crowd={data.crowd} poolAvg={data.pool_stats.avg_accuracy} />
        <PoolStatsSection stats={data.pool_stats} />
      </View>
      <BadgeDetailSheet ref={badgeSheetRef} />
    </>
  );
}

function EmptyMessage({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.xl,
        paddingVertical: theme.spacing.xxxl,
      }}
    >
      <Icon name={icon} size={36} tint={theme.colors.silver} weight="regular" />
      <Text variant="cardTitle" align="center">
        {title}
      </Text>
      <Text variant="body" color="slate" align="center">
        {body}
      </Text>
    </View>
  );
}

function EntrySelector({
  entries,
  activeId,
  onChange,
}: {
  entries: PoolEntry[];
  activeId: string | null;
  onChange: (id: string) => void;
}) {
  const theme = useTheme();
  const segmented = entries.length <= 4;

  const chips = entries.map((e) => {
    const active = e.entryId === activeId;
    const label = e.entryName || `Entry ${e.entryNumber}`;
    return (
      <Pressable
        key={e.entryId}
        onPress={() => onChange(e.entryId)}
        style={({ pressed }) => ({
          flex: segmented ? 1 : undefined,
          alignItems: 'center',
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.xs + theme.spacing.xxs,
          borderRadius: theme.radii.pill,
          backgroundColor: active
            ? withOpacity(theme.colors.primary, 0.14)
            : withOpacity(theme.colors.ink, 0.05),
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <RNText
          numberOfLines={1}
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 12,
            color: active ? theme.colors.primary : theme.colors.slate,
          }}
        >
          {label}
        </RNText>
      </Pressable>
    );
  });

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.sm,
        ...theme.shadows.card,
      }}
    >
      {segmented ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>{chips}</View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: theme.spacing.xs }}
        >
          {chips}
        </ScrollView>
      )}
    </View>
  );
}

function XPHeroCard({ xp }: { xp: XPData }) {
  const theme = useTheme();
  const levelColor = useLevelColor(xp.current_level.level);

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        gap: theme.spacing.md,
        ...theme.shadows.card,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
        <ProgressRing
          size={72}
          stroke={6}
          progress={Math.max(0, Math.min(1, xp.level_progress))}
          color={levelColor}
          label={`${xp.current_level.level}`}
        />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="sectionHeader" numberOfLines={1}>
            {xp.current_level.name}
          </Text>
          <RNText
            style={{
              fontFamily: fontFamilies.semibold,
              fontSize: 13,
              color: theme.colors.slate,
              fontVariant: ['tabular-nums'],
            }}
          >
            {xp.total_xp} XP
          </RNText>
          {xp.next_level ? (
            <XPToNextLabel
              xpToNext={xp.xp_to_next_level}
              next={xp.next_level}
            />
          ) : null}
        </View>
        <View
          style={{
            width: 28,
            height: 28,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="chevron.right" size={12} tint={theme.colors.slate} weight="semibold" />
        </View>
      </View>

      {xp.next_level ? <ProgressBar progress={xp.level_progress} color={levelColor} /> : null}

      <View style={{ flexDirection: 'row' }}>
        <XPStatColumn label="Match" value={xp.total_base_xp} color={theme.colors.primary} />
        <XPStatColumn label="Bonus" value={xp.total_bonus_xp} color={theme.colors.amber} />
        <XPStatColumn label="Badges" value={xp.total_badge_xp} color={theme.colors.accent} />
      </View>
    </View>
  );
}

function XPToNextLabel({ xpToNext, next }: { xpToNext: number; next: LevelInfo }) {
  const theme = useTheme();
  const color = useLevelColor(next.level);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <RNText
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 11,
          color: theme.colors.slate,
          fontVariant: ['tabular-nums'],
        }}
      >
        {xpToNext} XP to
      </RNText>
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 10,
          color,
        }}
      >
        {next.name}
      </RNText>
    </View>
  );
}

function ProgressBar({ progress, color }: { progress: number; color: string }) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View
      style={{
        height: 8,
        borderRadius: 4,
        backgroundColor: theme.colors.mist,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          minWidth: 8,
          height: '100%',
          backgroundColor: color,
          borderRadius: 4,
        }}
      />
    </View>
  );
}

function XPStatColumn({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 14,
          color,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </RNText>
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 11,
          color: theme.colors.slate,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}

function ProgressRing({
  size,
  stroke,
  progress,
  color,
  label,
}: {
  size: number;
  stroke: number;
  progress: number;
  color: string;
  label: string;
}) {
  const theme = useTheme();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashLen = circumference * progress;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={withOpacity(color, 0.2)}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dashLen} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <RNText
        style={{
          fontFamily: fontFamilies.black,
          fontSize: 22,
          color,
          fontVariant: ['tabular-nums'],
        }}
      >
        {label}
      </RNText>
      {/* silence "theme unused in some paths" */}
      <View style={{ width: 0, height: 0, backgroundColor: theme.colors.surface }} />
    </View>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.sm,
      }}
    >
      <Text variant="sectionHeader">{title}</Text>
      {subtitle ? (
        <RNText
          style={{
            fontFamily: fontFamilies.medium,
            fontSize: 12,
            color: theme.colors.slate,
            fontVariant: ['tabular-nums'],
          }}
        >
          {subtitle}
        </RNText>
      ) : null}
    </View>
  );
}

// Badge icon mapping moved to ./badge-icons so BadgeDetailSheet can read
// from the same source. Keeps the form-tab chip icon and the mini-modal
// icon in sync — they used to drift and stale entries in BadgeDetailSheet
// caused unlocked badges to render as a generic star.
// Re-exported here so existing imports `import { badgeIcon, type BadgeIconSpec }
// from './FormTab'` (if any) keep working.

function useRarityColor(rarity: string): string {
  const theme = useTheme();
  switch (rarity) {
    case 'Common':
      return theme.colors.slate;
    case 'Uncommon':
      return theme.colors.green;
    case 'Rare':
      return theme.colors.primary;
    case 'Very Rare':
      return '#1281E2';
    case 'Legendary':
      return theme.colors.accent;
    default:
      return theme.colors.slate;
  }
}

function BadgesSection({
  earned,
  all,
  onBadgePress,
}: {
  earned: BadgeInfo[];
  all: BadgeInfo[];
  onBadgePress: (badge: BadgeInfo, earned: boolean) => void;
}) {
  const theme = useTheme();
  const earnedIds = new Set(earned.map((b) => b.id));
  const sorted = [...all].sort((a, b) => {
    const aEarned = earnedIds.has(a.id);
    const bEarned = earnedIds.has(b.id);
    if (aEarned !== bEarned) return aEarned ? -1 : 1;
    return 0;
  });

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
        ...theme.shadows.card,
      }}
    >
      <SectionHeader title="Badges" subtitle={`${earned.length}/${all.length} earned`} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: 2,
          paddingBottom: theme.spacing.md,
          gap: theme.spacing.md,
        }}
      >
        {sorted.map((badge) => {
          const isEarned = earnedIds.has(badge.id);
          return (
            <BadgeCell
              key={badge.id}
              badge={badge}
              earned={isEarned}
              onPress={() => onBadgePress(badge, isEarned)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

function BadgeCell({
  badge,
  earned,
  onPress,
}: {
  badge: BadgeInfo;
  earned: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const color = useRarityColor(badge.rarity);
  const icon = badgeIcon(badge.id);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 64,
        alignItems: 'center',
        gap: 4,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: earned ? withOpacity(color, 0.15) : theme.colors.mist,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {earned ? (
          <Icon name={icon.ios} size={18} tint={color} weight="semibold" />
        ) : (
          <Icon name="lock.fill" size={14} tint={theme.colors.slate} weight="semibold" />
        )}
      </View>
      <RNText
        numberOfLines={1}
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 11,
          color: earned ? theme.colors.ink : theme.colors.silver,
          textAlign: 'center',
        }}
      >
        {badge.name}
      </RNText>
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 9,
          color: earned ? color : theme.colors.silver,
          fontVariant: ['tabular-nums'],
        }}
      >
        +{badge.xp_bonus} XP
      </RNText>
    </Pressable>
  );
}

function HotColdStreakCards({ streaks }: { streaks: AnalyticsStreakData }) {
  const theme = useTheme();
  const currentHot = streaks.current_streak.type === 'hot' ? streaks.current_streak.length : 0;
  const coldStreak = streaks.longest_cold_streak;
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
      <StreakCard
        kind="hot"
        iosIcon="flame.fill"
        emoji="🔥"
        caption="Current Hot Streak"
        value={currentHot}
        color={theme.colors.hotStreak}
        footer={
          <RNText
            style={{
              fontFamily: fontFamilies.medium,
              fontSize: 11,
              color: theme.colors.slate,
              textAlign: 'center',
            }}
          >
            Personal best:{' '}
            <RNText style={{ fontFamily: fontFamilies.bold, color: theme.colors.ink }}>
              {streaks.longest_hot_streak}
            </RNText>
          </RNText>
        }
        bordered
      />
      <StreakCard
        kind="cold"
        iosIcon="snowflake"
        emoji="❄️"
        caption="Worst Cold Streak"
        value={coldStreak}
        color={theme.colors.coldStreak}
        footer={
          <RNText
            style={{
              fontFamily: fontFamilies.medium,
              fontSize: 11,
              color: theme.colors.slate,
              textAlign: 'center',
            }}
          >
            Keep this one low!
          </RNText>
        }
      />
    </View>
  );
}

function StreakCard({
  kind,
  iosIcon,
  emoji,
  caption,
  value,
  color,
  footer,
  bordered,
}: {
  kind: 'hot' | 'cold';
  iosIcon: string;
  emoji: string;
  caption: string;
  value: number;
  color: string;
  footer: React.ReactNode;
  bordered?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.sm,
        alignItems: 'center',
        gap: 6,
        borderWidth: bordered ? 1 : 0,
        borderColor: bordered ? withOpacity(color, 0.2) : 'transparent',
        ...theme.shadows.card,
      }}
    >
      <Icon name={iosIcon} size={22} tint={color} weight="semibold" />
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 10,
          color: theme.colors.slate,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          textAlign: 'center',
        }}
      >
        {caption}
      </RNText>
      <RNText
        style={{
          fontFamily: fontFamilies.black,
          fontSize: 36,
          color,
          fontVariant: ['tabular-nums'],
          lineHeight: 40,
        }}
      >
        {value}
      </RNText>
      <StreakBar kind={kind} value={value} color={color} />
      {footer}
    </View>
  );
}

function StreakBar({
  kind,
  value,
  color,
}: {
  kind: 'hot' | 'cold';
  value: number;
  color: string;
}) {
  const theme = useTheme();
  const filled = Math.min(value, 5);
  return (
    <View style={{ flexDirection: 'row', gap: 3, marginVertical: 2 }}>
      {Array.from({ length: 5 }, (_, i) => {
        const isFilled = i < filled;
        // Cold bar: graduated opacity (0.32 → 1.0 across segments)
        const segColor = isFilled
          ? kind === 'cold'
            ? withOpacity(color, 0.15 + 0.17 * (i + 1))
            : color
          : theme.colors.mist;
        return (
          <View
            key={i}
            style={{
              width: 20,
              height: 5,
              borderRadius: 3,
              backgroundColor: segColor,
            }}
          />
        );
      })}
    </View>
  );
}

function useTierColor(tier: string): string {
  const theme = useTheme();
  switch (tier) {
    case 'exact':
      return theme.colors.tierExact;
    case 'winner_gd':
      return theme.colors.tierWinnerGd;
    case 'winner':
      return theme.colors.tierWinner;
    default:
      return theme.colors.tierMiss;
  }
}

function TournamentRunSection({
  matchXP,
  crowd,
}: {
  matchXP: MatchXPItem[];
  crowd: CrowdMatchItem[];
}) {
  const theme = useTheme();
  const sorted = [...matchXP].sort((a, b) => b.match_number - a.match_number);
  const crowdMap = new Map(crowd.map((c) => [c.match_number, c]));
  const [tappedMatch, setTappedMatch] = useState<number | null>(null);

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
        ...theme.shadows.card,
      }}
    >
      <SectionHeader
        title="Your Tournament Run"
        subtitle={
          sorted.length > 0
            ? `${sorted.length} ${sorted.length === 1 ? 'match' : 'matches'}`
            : 'Awaiting kickoff'
        }
      />
      {sorted.length === 0 ? (
        <View
          style={{
            paddingHorizontal: theme.spacing.lg,
            paddingTop: 2,
            paddingBottom: theme.spacing.md,
            gap: theme.spacing.md,
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 13,
              color: theme.colors.slate,
              lineHeight: 18,
            }}
          >
            Your match-by-match journey will appear here as fixtures complete.
            Each pick gets a tier — exact, winner + goal-difference, correct result, or miss.
          </RNText>
          <RunLegend />
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: 4,
            }}
          >
            {sorted.map((match, idx) => (
              <View key={match.match_number} style={{ flexDirection: 'row', alignItems: 'center' }}>
                {idx > 0 ? <Connector prevTier={sorted[idx - 1].tier} /> : null}
                <TournamentNode
                  match={match}
                  crowdMatch={crowdMap.get(match.match_number)}
                  tapped={tappedMatch === match.match_number}
                  onTap={() =>
                    setTappedMatch((cur) => (cur === match.match_number ? null : match.match_number))
                  }
                />
              </View>
            ))}
          </ScrollView>
          <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md }}>
            <RunLegend />
          </View>
        </>
      )}
    </View>
  );
}

function Connector({ prevTier }: { prevTier: string }) {
  const theme = useTheme();
  const isMiss = prevTier === 'submitted';
  const tierColor = useTierColor(prevTier);
  const color = isMiss ? withOpacity(theme.colors.silver, 0.3) : withOpacity(tierColor, 0.35);
  return <View style={{ width: 14, height: 2, backgroundColor: color }} />;
}

function TournamentNode({
  match,
  crowdMatch,
  tapped,
  onTap,
}: {
  match: MatchXPItem;
  crowdMatch: CrowdMatchItem | undefined;
  tapped: boolean;
  onTap: () => void;
}) {
  const theme = useTheme();
  const isMiss = match.tier === 'submitted';
  const tierColor = useTierColor(match.tier);
  const fillColor = isMiss ? theme.colors.mist : withOpacity(tierColor, 0.2);
  const borderColor = isMiss ? theme.colors.silver : tierColor;
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <View style={{ position: 'relative' }}>
        <Pressable
          onPress={onTap}
          hitSlop={4}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: fillColor,
            borderWidth: 2,
            borderColor,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: isMiss ? 'transparent' : tierColor,
            shadowOpacity: isMiss ? 0 : 0.25,
            shadowRadius: 4,
          }}
        >
          <TierIcon tier={match.tier} color={borderColor} />
        </Pressable>
        {tapped && crowdMatch ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: 38,
              left: '50%',
              transform: [{ translateX: -60 }],
              width: 120,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                backgroundColor: theme.colors.ink,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: theme.radii.sm,
              }}
            >
              <RNText
                numberOfLines={1}
                style={{
                  fontFamily: fontFamilies.semibold,
                  fontSize: 10,
                  color: '#FFFFFF',
                  textAlign: 'center',
                }}
              >
                {crowdMatch.home_team} {crowdMatch.actual_score} {crowdMatch.away_team}
              </RNText>
            </View>
          </View>
        ) : null}
      </View>
      <RNText
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 8,
          color: theme.colors.slate,
          fontVariant: ['tabular-nums'],
        }}
      >
        #{match.match_number}
      </RNText>
    </View>
  );
}

function TierIcon({ tier, color }: { tier: string; color: string }) {
  if (tier === 'exact') {
    return <Icon name="star.fill" size={12} tint={color} weight="bold" />;
  }
  if (tier === 'winner_gd') {
    return <Icon name="checkmark" size={11} tint={color} weight="bold" />;
  }
  if (tier === 'winner') {
    return (
      <RNText style={{ fontSize: 14, fontFamily: fontFamilies.black, color, lineHeight: 14 }}>~</RNText>
    );
  }
  return <Icon name="xmark" size={10} tint={color} weight="bold" />;
}

function RunLegend() {
  const theme = useTheme();
  const items: Array<{ color: string; label: string }> = [
    { color: theme.colors.tierExact, label: 'Exact Score' },
    { color: theme.colors.tierWinnerGd, label: 'Winner + GD' },
    { color: theme.colors.tierWinner, label: 'Correct Result' },
    { color: theme.colors.tierMiss, label: 'Miss' },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
      {items.map((it) => (
        <View
          key={it.label}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <View
            style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: it.color }}
          />
          <RNText
            style={{
              fontFamily: fontFamilies.medium,
              fontSize: 11,
              color: theme.colors.slate,
            }}
          >
            {it.label}
          </RNText>
        </View>
      ))}
    </View>
  );
}

type CrowdStats = {
  userAccuracy: number;
  crowdAccuracy: number;
  accuracyDiff: number;
  isOutperforming: boolean;
  crowdAvgConsensus: number;
  crowdAvgContrarian: number;
  crowdAvgContrarianWins: number;
  contrarianAdv: number;
};

function computeCrowdStats(crowd: CrowdData, poolAvg: number): CrowdStats {
  const userCorrect = crowd.matches.filter((m) => m.is_correct).length;
  const total = Math.max(crowd.total_matches, 1);
  const userAcc = Math.round((userCorrect / total) * 100);
  const crowdAcc = Math.round(poolAvg * 100);

  const consensusSum = crowd.matches.reduce(
    (sum, m) => sum + Math.max(m.home_win_pct, m.draw_pct, m.away_win_pct),
    0,
  );
  const avgConsensus = Math.round(consensusSum);
  const avgContrarian = Math.max(0, crowd.total_matches - avgConsensus);
  const crowdAccRate = crowdAcc / 100;
  const avgContrarianWins = Math.round(avgContrarian * crowdAccRate);

  const userContPct =
    crowd.contrarian_count > 0
      ? Math.round((crowd.contrarian_wins / crowd.contrarian_count) * 100)
      : 0;
  const crowdContPct =
    avgContrarian > 0 ? Math.round((avgContrarianWins / avgContrarian) * 100) : 0;

  return {
    userAccuracy: userAcc,
    crowdAccuracy: crowdAcc,
    accuracyDiff: userAcc - crowdAcc,
    isOutperforming: userAcc > crowdAcc,
    crowdAvgConsensus: avgConsensus,
    crowdAvgContrarian: avgContrarian,
    crowdAvgContrarianWins: avgContrarianWins,
    contrarianAdv: userContPct - crowdContPct,
  };
}

function CrowdSection({ crowd, poolAvg }: { crowd: CrowdData; poolAvg: number }) {
  const theme = useTheme();
  const stats = computeCrowdStats(crowd, poolAvg);
  const isEmpty = crowd.total_matches === 0;
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
        ...theme.shadows.card,
      }}
    >
      <VSFaceoff userAccuracy={stats.userAccuracy} crowdAccuracy={stats.crowdAccuracy} />
      <View
        style={{
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.lg,
        }}
      >
        <BattleBar label="Consensus Picks" you={crowd.consensus_count} crowd={stats.crowdAvgConsensus} />
        <BattleBar label="Contrarian Picks" you={crowd.contrarian_count} crowd={stats.crowdAvgContrarian} />
        <BattleBar label="Contrarian Wins" you={crowd.contrarian_wins} crowd={stats.crowdAvgContrarianWins} />
      </View>
      {isEmpty ? (
        <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 12,
              color: theme.colors.slate,
              lineHeight: 16,
              textAlign: 'center',
            }}
          >
            Stats vs the pool average will populate as matches complete.
          </RNText>
        </View>
      ) : stats.accuracyDiff !== 0 ? (
        <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
          <PerformanceCallout
            isOutperforming={stats.isOutperforming}
            accuracyDiff={stats.accuracyDiff}
            contrarianAdv={stats.contrarianAdv}
            showContrarian={crowd.contrarian_count > 0 && stats.contrarianAdv > 0}
          />
        </View>
      ) : null}
    </View>
  );
}

function VSFaceoff({
  userAccuracy,
  crowdAccuracy,
}: {
  userAccuracy: number;
  crowdAccuracy: number;
}) {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, gap: theme.spacing.md }}>
      <Text variant="sectionHeader">You vs The Crowd</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingBottom: theme.spacing.sm,
        }}
      >
        <View style={{ alignItems: 'center', gap: 4 }}>
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 10,
              color: theme.colors.primary,
              letterSpacing: 0.5,
            }}
          >
            YOU
          </RNText>
          <RNText
            style={{
              fontFamily: fontFamilies.black,
              fontSize: 32,
              color: theme.colors.primary,
              fontVariant: ['tabular-nums'],
              lineHeight: 36,
            }}
          >
            {userAccuracy}%
          </RNText>
        </View>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.colors.mist,
            borderWidth: 0.5,
            borderColor: theme.colors.silver,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.black,
              fontSize: 11,
              color: theme.colors.slate,
            }}
          >
            VS
          </RNText>
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 10,
              color: theme.colors.slate,
              letterSpacing: 0.5,
            }}
          >
            POOL AVG
          </RNText>
          <RNText
            style={{
              fontFamily: fontFamilies.black,
              fontSize: 32,
              color: theme.colors.slate,
              fontVariant: ['tabular-nums'],
              lineHeight: 36,
            }}
          >
            {crowdAccuracy}%
          </RNText>
        </View>
      </View>
    </View>
  );
}

function BattleBar({
  label,
  you,
  crowd,
}: {
  label: string;
  you: number;
  crowd: number;
}) {
  const theme = useTheme();
  const total = you + crowd;
  const youPct = total > 0 ? (you / total) * 100 : 50;
  const crowdPct = total > 0 ? (crowd / total) * 100 : 50;
  return (
    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <RNText
          style={{
            fontFamily: fontFamilies.regular,
            fontSize: 13,
            color: theme.colors.slate,
          }}
        >
          {label}
        </RNText>
        <RNText
          style={{
            fontFamily: fontFamilies.semibold,
            fontSize: 11,
            color: theme.colors.slate,
            fontVariant: ['tabular-nums'],
          }}
        >
          {you} vs {crowd}
        </RNText>
      </View>
      <View style={{ flexDirection: 'row', gap: 2, height: 8 }}>
        <View
          style={{
            flex: youPct,
            minWidth: 2,
            backgroundColor: theme.colors.primary,
            borderRadius: 4,
          }}
        />
        <View
          style={{
            flex: crowdPct,
            minWidth: 2,
            backgroundColor: theme.colors.silver,
            borderRadius: 4,
          }}
        />
      </View>
    </View>
  );
}

function PerformanceCallout({
  isOutperforming,
  accuracyDiff,
  contrarianAdv,
  showContrarian,
}: {
  isOutperforming: boolean;
  accuracyDiff: number;
  contrarianAdv: number;
  showContrarian: boolean;
}) {
  const theme = useTheme();
  const accent = isOutperforming ? theme.colors.green : theme.colors.primary;
  const iosIcon = isOutperforming ? 'chart.line.uptrend.xyaxis' : 'target';
  const emoji = isOutperforming ? '📈' : '🎯';
  const message = isOutperforming
    ? `Outperforming the crowd by ${accuracyDiff}%`
    : `The crowd leads by ${Math.abs(accuracyDiff)}%`;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radii.sm,
        backgroundColor: withOpacity(accent, 0.08),
        borderWidth: 1,
        borderColor: withOpacity(accent, 0.13),
      }}
    >
      <Icon name={iosIcon} size={18} tint={accent} weight="semibold" />
      <View style={{ flex: 1, gap: 2 }}>
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 14,
            color: accent,
          }}
        >
          {message}
        </RNText>
        {showContrarian ? (
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 12,
              color: theme.colors.slate,
            }}
          >
            Your contrarian win rate is {contrarianAdv}% higher than average
          </RNText>
        ) : null}
      </View>
    </View>
  );
}

function PoolStatsSection({ stats }: { stats: PoolStatsData }) {
  const theme = useTheme();
  const topPredictable = stats.most_predictable.slice(0, 3);
  const topUpsets = stats.least_predictable.slice(0, 3);
  const isEmpty = stats.completed_matches === 0;
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
        ...theme.shadows.card,
      }}
    >
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.md }}>
        <Text variant="sectionHeader">Pool-Wide Stats</Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.lg,
        }}
      >
        <PoolStatColumn label="Avg Pool Accuracy" value={`${Math.round(stats.avg_accuracy * 100)}%`} />
        <PoolStatColumn label="Competitors" value={`${stats.total_entries}`} />
        <PoolStatColumn label="Matches Scored" value={`${stats.completed_matches}`} />
      </View>

      {isEmpty ? (
        <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 12,
              color: theme.colors.slate,
              lineHeight: 16,
              textAlign: 'center',
            }}
          >
            Most-predictable matches and biggest upsets will appear once results start landing.
          </RNText>
        </View>
      ) : null}

      {topPredictable.length > 0 ? (
        <PredictableBlock
          icon={{ ios: 'trophy.fill', emoji: '🏆' }}
          title="Most Predictable"
          color={theme.colors.green}
          matches={topPredictable}
        />
      ) : null}

      {topUpsets.length > 0 ? (
        <PredictableBlock
          icon={{ ios: 'exclamationmark.triangle.fill', emoji: '⚠️' }}
          title="Biggest Upsets"
          color={theme.colors.red}
          matches={topUpsets}
        />
      ) : null}
    </View>
  );
}

function PoolStatColumn({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <RNText
        style={{
          fontFamily: fontFamilies.black,
          fontSize: 24,
          color: theme.colors.ink,
          fontVariant: ['tabular-nums'],
          lineHeight: 28,
        }}
      >
        {value}
      </RNText>
      <RNText
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 11,
          color: theme.colors.slate,
          textAlign: 'center',
        }}
      >
        {label}
      </RNText>
    </View>
  );
}

function PredictableBlock({
  icon,
  title,
  color,
  matches,
}: {
  icon: { ios: string; emoji: string };
  title: string;
  color: string;
  matches: PredictableMatch[];
}) {
  const theme = useTheme();
  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
        }}
      >
        <Icon name={icon.ios} size={13} tint={color} weight="semibold" />
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 11,
            color,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          {title}
        </RNText>
      </View>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md }}>
        {matches.map((m, i) => (
          <PredictableRow
            key={m.match_number}
            index={i}
            match={m}
            color={color}
            isLast={i === matches.length - 1}
          />
        ))}
      </View>
    </View>
  );
}

function PredictableRow({
  index,
  match,
  color,
  isLast,
}: {
  index: number;
  match: PredictableMatch;
  color: string;
  isLast: boolean;
}) {
  const theme = useTheme();
  const pct = Math.round(match.hit_rate * 100);
  const fillWidth = Math.max(40 * match.hit_rate, 2);
  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingVertical: theme.spacing.sm,
        }}
      >
        <RNText
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: fontFamilies.regular,
            fontSize: 13,
            color: theme.colors.slate,
          }}
        >
          {index + 1}. {match.home_team} vs {match.away_team}
        </RNText>
        <View
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: theme.colors.mist,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: fillWidth,
              height: '100%',
              borderRadius: 2,
              backgroundColor: color,
            }}
          />
        </View>
        <RNText
          style={{
            width: 34,
            textAlign: 'right',
            fontFamily: fontFamilies.bold,
            fontSize: 11,
            color,
            fontVariant: ['tabular-nums'],
          }}
        >
          {pct}%
        </RNText>
      </View>
      {!isLast ? (
        <View style={{ height: 0.5, backgroundColor: withOpacity(theme.colors.silver, 0.5) }} />
      ) : null}
    </View>
  );
}

function useLevelColor(level: number): string {
  const theme = useTheme();
  if (level >= 10) return theme.colors.accent;
  if (level >= 8) return theme.colors.amber;
  if (level >= 6) return theme.colors.primary;
  if (level >= 4) return '#57D0FF';
  return theme.colors.green;
}

// silence unused-arg warning for AnalyticsResponse import in future passes
void (null as unknown as AnalyticsResponse);
