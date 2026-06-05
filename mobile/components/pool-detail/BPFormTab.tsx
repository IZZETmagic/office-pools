import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text as RNText,
  View,
} from 'react-native';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import Svg, { Circle } from 'react-native-svg';

import { BadgeDetailSheet, type BadgeDetailSheetHandle } from './BadgeDetailSheet';
import { badgeIcon } from './badge-icons';
import { Icon, Text } from '@/components/ui';
import type {
  BadgeInfo,
  BPAnalyticsResponse,
  BPBonusEvent,
  BPPoolComparisonData,
  BPXPData,
} from '@/lib/api';
import { useEntryBracketAnalytics } from '@/lib/useEntryBracketAnalytics';
import { usePoolEntries, type PoolEntry } from '@/lib/usePoolEntries';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Props = {
  poolId: string;
};

export function BPFormTab({ poolId }: Props) {
  const theme = useTheme();
  const { entries, loading: entriesLoading } = usePoolEntries(poolId);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const badgeSheetRef = useRef<BadgeDetailSheetHandle>(null);

  const activeEntryId = selectedEntryId ?? entries[0]?.entryId ?? null;
  const { data, loading, error } = useEntryBracketAnalytics(
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
      <EmptyState
        icon="chart.bar.xaxis"
        title="No entries yet"
        body="Submit a bracket to unlock analytics."
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
    return (
      <EmptyState
        icon="exclamationmark.triangle"
        title="Couldn't load analytics"
        body={error}
      />
    );
  }

  if (!data) {
    return (
      <EmptyState
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
            router.push(
              `/pool/${poolId}/levels?entryId=${activeEntryId}&mode=bracket_picker`,
            )
          }
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        >
          <BPHeroCard xp={data.xp} />
        </Pressable>
        {data.xp.all_badges.length > 0 ? (
          <BPBadgesSection
            earned={data.xp.earned_badges}
            all={data.xp.all_badges}
            onBadgePress={(badge, isEarned) =>
              badgeSheetRef.current?.open(badge, isEarned)
            }
          />
        ) : null}
        <YouVsPoolSection comparison={data.pool_comparison} />
        <PoolWideStatsSection comparison={data.pool_comparison} />
        <BonusEventsSection events={data.xp.bonus_events} />
      </View>
      <BadgeDetailSheet ref={badgeSheetRef} />
    </>
  );
}

// =============================================================
// Hero Card — circular progress ring + Group/Knockout/Badges stats
// =============================================================

function BPHeroCard({ xp }: { xp: BPXPData }) {
  const theme = useTheme();
  const lvlColor = useLevelColor(xp.current_level.level);

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
          color={lvlColor}
          label={`${xp.current_level.level}`}
        />
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
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
            {xp.total_xp.toLocaleString()} XP
          </RNText>
          {xp.next_level ? (
            <XPToNextLabel
              xpToNext={xp.xp_to_next_level}
              nextName={xp.next_level.name}
              nextLevel={xp.next_level.level}
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

      {xp.next_level ? (
        <ProgressBar progress={xp.level_progress} color={lvlColor} />
      ) : null}

      <View style={{ flexDirection: 'row' }}>
        <XPStatColumn
          label="Group"
          value={xp.total_group_base_xp + xp.total_group_bonus_xp}
          color={theme.colors.primary}
        />
        <XPStatColumn
          label="Knockout"
          value={xp.total_knockout_base_xp + xp.total_knockout_bonus_xp}
          color={theme.colors.green}
        />
        <XPStatColumn label="Badges" value={xp.total_badge_xp} color={theme.colors.accent} />
      </View>
    </View>
  );
}

function XPToNextLabel({
  xpToNext,
  nextName,
  nextLevel,
}: {
  xpToNext: number;
  nextName: string;
  nextLevel: number;
}) {
  const theme = useTheme();
  const color = useLevelColor(nextLevel);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.xxs }}>
      <RNText
        style={{
          fontFamily: fontFamilies.regular,
          fontSize: 11,
          color: theme.colors.slate,
        }}
      >
        {xpToNext.toLocaleString()} XP to
      </RNText>
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 11,
          color,
        }}
        numberOfLines={1}
      >
        {nextName}
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
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={size} height={size}>
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
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <RNText
        style={{
          position: 'absolute',
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 20,
          fontWeight: '900',
          color,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}

function ProgressBar({ progress, color }: { progress: number; color: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        height: 8,
        borderRadius: 4,
        backgroundColor: withOpacity(theme.colors.ink, 0.06),
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
          height: '100%',
          backgroundColor: color,
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
    <View style={{ flex: 1, alignItems: 'center', gap: theme.spacing.xxs }}>
      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 16,
          fontWeight: '800',
          color,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value.toLocaleString()}
      </RNText>
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 10,
          letterSpacing: 0.4,
          color: theme.colors.slate,
        }}
      >
        {label.toUpperCase()}
      </RNText>
    </View>
  );
}

// =============================================================
// Bracket Badges section
// =============================================================

// Bracket-picker badge icons live in the shared `./badge-icons` map
// alongside the full/progressive badges. BPFormTab uses the same
// `badgeIcon()` helper as FormTab so PNG medallions and SF-symbol
// fallbacks stay in lockstep across the two surfaces.

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

function BPBadgesSection({
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
      <SectionHeader
        title="Bracket Badges"
        subtitle={`${earned.length}/${all.length} earned`}
      />
      {/* GestureScrollView (from react-native-gesture-handler) — Android
          loses the inner horizontal swipe to the outer page pager when
          using plain ScrollView. Gesture-handler's tree-aware version
          properly yields the swipe to the inner scroller. */}
      <GestureScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.xxs,
          paddingBottom: theme.spacing.md,
          gap: theme.spacing.md,
        }}
      >
        {sorted.map((badge) => {
          const isEarned = earnedIds.has(badge.id);
          return (
            <BPBadgeCell
              key={badge.id}
              badge={badge}
              earned={isEarned}
              onPress={() => onBadgePress(badge, isEarned)}
            />
          );
        })}
      </GestureScrollView>
    </View>
  );
}

function BPBadgeCell({
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
        width: 80,
        alignItems: 'center',
        gap: theme.spacing.xs,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: theme.radii.pill,
          backgroundColor: earned && icon.png
            ? 'transparent'
            : earned
              ? withOpacity(color, 0.15)
              : theme.colors.mist,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {earned ? (
          icon.png ? (
            <Image source={icon.png} style={{ width: 64, height: 64 }} resizeMode="contain" />
          ) : (
            <Icon name={icon.ios} size={26} tint={color} weight="semibold" />
          )
        ) : (
          <Icon name="lock.fill" size={20} tint={theme.colors.slate} weight="semibold" />
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

// =============================================================
// You vs The Pool
// =============================================================

function YouVsPoolSection({
  comparison,
}: {
  comparison: BPPoolComparisonData | null;
}) {
  const theme = useTheme();
  const isEmpty = !comparison;

  // Always render the structure — pre-tournament shows zero/empty values
  // (matches the score-prediction Form tab pattern).
  const userAcc = comparison?.user_overall_accuracy ?? 0;
  const poolAcc = comparison?.pool_avg_overall_accuracy ?? 0;
  const accuracyDiff = userAcc - poolAcc;
  const isOutperforming = accuracyDiff > 0;

  return (
    <SectionCard>
      <VSFaceoff userAccuracy={userAcc} poolAccuracy={poolAcc} />

      {/* Category battle bars — always rendered, zeros pre-tournament */}
      <View
        style={{
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.lg,
        }}
      >
        <BattleBar
          label="Group Positions"
          you={comparison?.user_group_correct ?? 0}
          crowd={Math.round(comparison?.pool_avg_group_correct ?? 0)}
        />
        <BattleBar
          label="Knockout Picks"
          you={comparison?.user_knockout_correct ?? 0}
          crowd={Math.round(comparison?.pool_avg_knockout_correct ?? 0)}
        />
        <BattleBar
          label="Third Place Table"
          you={comparison?.user_third_correct ?? 0}
          crowd={Math.round(comparison?.pool_avg_third_correct ?? 0)}
        />
      </View>

      {/* Bracket Boldness — always rendered */}
      <View
        style={{
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.lg,
        }}
      >
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 10,
            letterSpacing: 0.8,
            color: theme.colors.slate,
          }}
        >
          BRACKET BOLDNESS
        </RNText>
        <BattleBar
          label="Consensus Picks"
          you={comparison?.consensus_count ?? 0}
          crowd={comparison?.pool_avg_consensus ?? 0}
        />
        <BattleBar
          label="Contrarian Picks"
          you={comparison?.contrarian_count ?? 0}
          crowd={comparison?.pool_avg_contrarian ?? 0}
        />
        <BattleBar
          label="Contrarian Wins"
          you={comparison?.contrarian_wins ?? 0}
          crowd={comparison?.pool_avg_contrarian_wins ?? 0}
        />
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
      ) : accuracyDiff !== 0 ? (
        <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
          <PerformanceCallout
            accuracyDiff={accuracyDiff}
            isOutperforming={isOutperforming}
            contrarianCount={comparison?.contrarian_count ?? 0}
          />
        </View>
      ) : null}
    </SectionCard>
  );
}

function VSFaceoff({
  userAccuracy,
  poolAccuracy,
}: {
  userAccuracy: number;
  poolAccuracy: number;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.lg,
        gap: theme.spacing.md,
      }}
    >
      <Text variant="sectionHeader">You vs The Pool</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingBottom: theme.spacing.sm,
        }}
      >
        <View style={{ alignItems: 'center', gap: theme.spacing.xxs }}>
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 10,
              letterSpacing: 0.5,
              color: theme.colors.primary,
            }}
          >
            YOU
          </RNText>
          <RNText
            style={{
              fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
              fontSize: 32,
              fontWeight: '900',
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
            borderWidth: theme.borders.thin,
            borderColor: theme.colors.silver,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 11,
              color: theme.colors.slate,
              letterSpacing: 0.4,
            }}
          >
            VS
          </RNText>
        </View>
        <View style={{ alignItems: 'center', gap: theme.spacing.xxs }}>
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 10,
              letterSpacing: 0.5,
              color: theme.colors.slate,
            }}
          >
            POOL AVG
          </RNText>
          <RNText
            style={{
              fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
              fontSize: 32,
              fontWeight: '900',
              color: theme.colors.slate,
              fontVariant: ['tabular-nums'],
              lineHeight: 36,
            }}
          >
            {poolAccuracy}%
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
  const youPct = total > 0 ? you / total : 0.5;
  return (
    <View style={{ gap: theme.spacing.xxs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <RNText
          style={{ fontFamily: fontFamilies.regular, fontSize: 11, color: theme.colors.slate }}
        >
          {label}
        </RNText>
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 10,
            color: theme.colors.silver,
            fontVariant: ['tabular-nums'],
          }}
        >
          {you} vs {crowd}
        </RNText>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 6,
          gap: 2,
        }}
      >
        <View
          style={{
            flex: Math.max(youPct, 0.02),
            height: '100%',
            backgroundColor: theme.colors.primary,
            borderRadius: 3,
          }}
        />
        <View
          style={{
            flex: Math.max(1 - youPct, 0.02),
            height: '100%',
            backgroundColor: withOpacity(theme.colors.slate, 0.35),
            borderRadius: 3,
          }}
        />
      </View>
    </View>
  );
}

function PerformanceCallout({
  accuracyDiff,
  isOutperforming,
  contrarianCount,
}: {
  accuracyDiff: number;
  isOutperforming: boolean;
  contrarianCount: number;
}) {
  const theme = useTheme();
  const color = isOutperforming ? theme.colors.green : theme.colors.slate;
  const bg = isOutperforming
    ? withOpacity(theme.colors.green, 0.1)
    : withOpacity(theme.colors.ink, 0.04);
  const label = isOutperforming
    ? `You're ${Math.abs(accuracyDiff)}% above pool average`
    : accuracyDiff === 0
      ? `You're matching the pool average`
      : `You're ${Math.abs(accuracyDiff)}% below pool average`;
  const sub =
    contrarianCount > 0
      ? `${contrarianCount} contrarian pick${contrarianCount === 1 ? '' : 's'} this round`
      : 'Stick to your gut on the next round';
  return (
    <View
      style={{
        marginHorizontal: theme.spacing.lg,
        marginBottom: theme.spacing.lg,
        padding: theme.spacing.md,
        borderRadius: theme.radii.md,
        backgroundColor: bg,
        gap: theme.spacing.xxs,
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 13,
          color,
        }}
      >
        {label}
      </RNText>
      <RNText
        style={{
          fontFamily: fontFamilies.regular,
          fontSize: 11,
          color: theme.colors.slate,
        }}
      >
        {sub}
      </RNText>
    </View>
  );
}

// =============================================================
// Pool-Wide Stats
// =============================================================

function PoolWideStatsSection({
  comparison,
}: {
  comparison: BPPoolComparisonData | null;
}) {
  const theme = useTheme();
  const isEmpty =
    !comparison || (comparison.total_scored_picks === 0 && comparison.total_entries === 0);

  return (
    <SectionCard>
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.lg,
          paddingBottom: theme.spacing.md,
        }}
      >
        <Text variant="sectionHeader">Pool-Wide Stats</Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.lg,
        }}
      >
        <PoolStatCell
          value={`${comparison?.pool_avg_overall_accuracy ?? 0}%`}
          label="Avg Pool Accuracy"
        />
        <PoolStatCell value={`${comparison?.total_entries ?? 0}`} label="Competitors" />
        <PoolStatCell
          value={`${comparison?.total_scored_picks ?? 0}`}
          label="Picks Scored"
        />
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
            Pool-wide accuracy and the favorite champion will appear once entries
            are submitted and matches start landing.
          </RNText>
        </View>
      ) : null}

      {comparison?.most_popular_champion ? (
        <FavoriteChampionCard
          teamId={comparison.most_popular_champion.team_id}
          pct={comparison.most_popular_champion.pct}
        />
      ) : null}
    </SectionCard>
  );
}

function PoolStatCell({ value, label }: { value: string; label: string }) {
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

function FavoriteChampionCard({
  teamId: _teamId,
  pct,
}: {
  teamId: string;
  pct: number;
}) {
  const theme = useTheme();
  // We don't have team metadata wired into this screen yet — show pct only.
  return (
    <View
      style={{
        marginHorizontal: theme.spacing.lg,
        marginBottom: theme.spacing.lg,
        padding: theme.spacing.md,
        borderRadius: theme.radii.md,
        backgroundColor: withOpacity(theme.colors.accent, 0.08),
        gap: theme.spacing.xxs,
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 10,
          letterSpacing: 0.8,
          color: theme.colors.slate,
        }}
      >
        POOL'S FAVORITE CHAMPION
      </RNText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <RNText style={{ fontSize: 22 }}>👑</RNText>
        <View style={{ flex: 1 }}>
          <RNText
            style={{
              fontFamily: fontFamilies.semibold,
              fontSize: 13,
              color: theme.colors.ink,
            }}
            numberOfLines={1}
          >
            Most-picked champion
          </RNText>
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 11,
              color: theme.colors.slate,
            }}
          >
            {Math.round(pct * 100)}% of brackets
          </RNText>
        </View>
      </View>
    </View>
  );
}

// =============================================================
// Bonus Events
// =============================================================

function BonusEventsSection({ events }: { events: BPBonusEvent[] }) {
  const theme = useTheme();
  const total = events.reduce((s, e) => s + e.xp, 0);
  const isEmpty = events.length === 0;

  return (
    <SectionCard>
      <SectionHeader
        title="Bonus Events"
        subtitle={isEmpty ? undefined : `${total} XP`}
      />
      {isEmpty ? (
        <View
          style={{
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.lg,
            paddingTop: theme.spacing.xs,
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 12,
              color: theme.colors.slate,
              lineHeight: 16,
              textAlign: 'center',
            }}
          >
            Bonus XP events — perfect group orders, contrarian wins, and more
            — will appear here as you earn them.
          </RNText>
        </View>
      ) : (
        <View
          style={{
            paddingHorizontal: theme.spacing.md,
            paddingBottom: theme.spacing.md,
            gap: theme.spacing.xs,
          }}
        >
          {events.map((event, idx) => (
            <View
              key={`${event.type}-${idx}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.radii.md,
                backgroundColor: withOpacity(theme.colors.accent, 0.06),
              }}
            >
              <RNText style={{ fontSize: 18 }}>{event.emoji || '✨'}</RNText>
              <View style={{ flex: 1, gap: 1 }}>
                <RNText
                  style={{
                    fontFamily: fontFamilies.semibold,
                    fontSize: 12,
                    color: theme.colors.ink,
                  }}
                  numberOfLines={1}
                >
                  {event.label}
                </RNText>
                {event.detail ? (
                  <RNText
                    style={{
                      fontFamily: fontFamilies.regular,
                      fontSize: 10,
                      color: theme.colors.slate,
                    }}
                    numberOfLines={1}
                  >
                    {event.detail}
                  </RNText>
                ) : null}
              </View>
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 12,
                  color: theme.colors.accent,
                  fontVariant: ['tabular-nums'],
                }}
              >
                +{event.xp} XP
              </RNText>
            </View>
          ))}
        </View>
      )}
    </SectionCard>
  );
}

// =============================================================
// Shared helpers
// =============================================================

function SectionCard({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
        ...theme.shadows.card,
      }}
    >
      {children}
    </View>
  );
}

// =============================================================
// Entry Selector — matches FormTab pattern (segmented/scroll)
// =============================================================

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
        // GestureScrollView — see comment on the Bracket Badges scroller.
        <GestureScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: theme.spacing.xs }}
        >
          {chips}
        </GestureScrollView>
      )}
    </View>
  );
}

function EmptyState({
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

function useLevelColor(level: number): string {
  const theme = useTheme();
  if (level >= 10) return theme.colors.accent;
  if (level >= 8) return theme.colors.amber;
  if (level >= 6) return theme.colors.primary;
  if (level >= 4) return '#57D0FF';
  return theme.colors.green;
}

// Silence unused-warn for the BPAnalyticsResponse import in future passes.
void (null as unknown as BPAnalyticsResponse);
