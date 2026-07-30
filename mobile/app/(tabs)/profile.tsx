// Port of ios/OfficePools/Views/Profile/ProfileView.swift.
// This tab is about *you*: profile card, quick stats, pool performance,
// accuracy, trophy case. Everything that *configures* you — account,
// notifications, archived pools, help, sign out, delete — lives behind the
// single Settings row and under app/settings/.

import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  Text as RNText,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  JoinPoolSheet,
  type JoinPoolSheetHandle,
  PoolCreateJoinSheet,
  type PoolCreateJoinSheetHandle,
  PoolsHeader,
} from '@/components/pools';
import { SettingsCard, SettingsRow } from '@/components/settings';
import { Icon, Text } from '@/components/ui';
import { badgeIcon } from '@/components/pool-detail/badge-icons';
import { useAuth } from '@/lib/auth';
import { useHomeData } from '@/lib/HomeDataProvider';
import type { PoolSummary } from '@/lib/useHomeData';
import { useManualRefresh } from '@/lib/useManualRefresh';
import { supabase } from '@/lib/supabase';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export default function ProfileScreen() {
  const theme = useTheme();
  const { data, refresh } = useHomeData();
  // Pull-to-refresh: spinner bound to real user gesture only.
  const { refreshing, onRefresh } = useManualRefresh(refresh);
  // Create / Join pool sheets — opened by the "+" button in the header.
  const createJoinSheetRef = useRef<PoolCreateJoinSheetHandle | null>(null);
  const joinPoolSheetRef = useRef<JoinPoolSheetHandle | null>(null);

  const pools = data?.pools ?? [];
  const totalPoints = useMemo(() => pools.reduce((s, p) => s + p.totalPoints, 0), [pools]);
  const totalPredictions = useMemo(
    () => pools.reduce((s, p) => s + (p.accuracyStats?.totalCompleted ?? p.predictionsCompleted), 0),
    [pools],
  );

  const initials = useMemo(() => {
    const name = data?.fullName ?? '';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (name.slice(0, 2) || '?').toUpperCase();
  }, [data?.fullName]);

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: theme.colors.snow }}
    >
      <PoolsHeader
        titlePrefix="Your"
        titleAccent="Profile"
        subtitle="Stats, settings & more"
        onMenuPress={() => createJoinSheetRef.current?.open()}
      />
      <ScrollView
        contentContainerStyle={{
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.xl,
          gap: theme.spacing.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <ProfileCard
          fullName={data?.fullName ?? 'User'}
          username={data?.username ?? ''}
          memberSince={data?.memberSince ?? null}
          totalPoints={totalPoints}
          initials={initials}
        />

        {pools.length === 0 ? (
          <EmptyStatsCard />
        ) : (
          <>
            <QuickStatsRow
              poolsCount={pools.length}
              totalPoints={totalPoints}
              totalPredictions={totalPredictions}
            />
            <PoolPerformanceSection pools={pools} />
            <AccuracySection pools={pools} />
          </>
        )}

        <TrophyCaseSection />

        <SettingsSection />

        <VersionFooter />
      </ScrollView>

      <PoolCreateJoinSheet
        ref={createJoinSheetRef}
        onJoinPress={() => {
          setTimeout(() => joinPoolSheetRef.current?.open(), 250);
        }}
      />
      <JoinPoolSheet ref={joinPoolSheetRef} />
    </SafeAreaView>
  );
}

function ProfileCard({
  fullName,
  username,
  memberSince,
  totalPoints,
  initials,
}: {
  fullName: string;
  username: string;
  memberSince: string | null;
  totalPoints: number;
  initials: string;
}) {
  const theme = useTheme();
  const memberSinceLabel = memberSince ? formatMemberSince(memberSince) : null;
  return (
    <View
      style={{
        marginHorizontal: theme.spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: withOpacity(theme.colors.primary, 0.12),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 20,
            color: theme.colors.primary,
          }}
        >
          {initials}
        </RNText>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <RNText
            numberOfLines={1}
            style={{ fontFamily: fontFamilies.bold, fontSize: 17, color: theme.colors.ink }}
          >
            {fullName}
          </RNText>
          {totalPoints > 0 ? (
            <View
              style={{
                paddingHorizontal: 7,
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: theme.colors.primaryLight,
              }}
            >
              <RNText
                style={{
                  fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
                  fontSize: 10,
                  color: theme.colors.primary,
                }}
              >
                {totalPoints.toLocaleString()} pts
              </RNText>
            </View>
          ) : null}
        </View>
        <RNText
          style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate }}
        >
          @{username}
        </RNText>
        {memberSinceLabel ? (
          <RNText
            style={{ fontFamily: fontFamilies.medium, fontSize: 11, color: theme.colors.slate }}
          >
            Member since {memberSinceLabel}
          </RNText>
        ) : null}
      </View>
    </View>
  );
}

function QuickStatsRow({
  poolsCount,
  totalPoints,
  totalPredictions,
}: {
  poolsCount: number;
  totalPoints: number;
  totalPredictions: number;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: theme.spacing.sm + 2,
        paddingHorizontal: theme.spacing.xl,
      }}
    >
      <StatCard
        title="Pools"
        value={String(poolsCount)}
        icon="person.3.fill"
        color={theme.colors.primary}
      />
      <StatCard
        title="Points"
        value={String(totalPoints)}
        icon="bolt.fill"
        color={theme.colors.accent}
      />
      <StatCard
        title="Predictions"
        value={String(totalPredictions)}
        icon="checkmark.circle.fill"
        color={theme.colors.green}
      />
    </View>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string;
  icon: string;
  color: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 6,
        paddingVertical: theme.spacing.md + 2,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
      }}
    >
      <Icon name={icon as never} tint={color} size={16} weight="semibold" />
      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 20,
          color: theme.colors.ink,
        }}
      >
        {value}
      </RNText>
      <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 10, color: theme.colors.slate }}>
        {title}
      </RNText>
    </View>
  );
}

function PoolPerformanceSection({ pools }: { pools: PoolSummary[] }) {
  const theme = useTheme();
  return (
    <SectionWrapper title="Pool Performance">
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg }}>
        {pools.map((pool, idx) => (
          <View key={pool.poolId}>
            <PoolStatRow pool={pool} />
            {idx < pools.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </View>
    </SectionWrapper>
  );
}

function PoolStatRow({ pool }: { pool: PoolSummary }) {
  const theme = useTheme();
  const acc = pool.accuracyStats;
  const accuracy =
    acc && acc.totalCompleted > 0 ? Math.round((acc.correctCount / acc.totalCompleted) * 100) : null;
  const rankEmoji = pool.currentRank === 1 ? '🥇' : pool.currentRank === 2 ? '🥈' : pool.currentRank === 3 ? '🥉' : null;
  const memberCount = pool.totalEntries || pool.memberCount;
  const rankBarColor = (() => {
    if (!pool.currentRank || memberCount < 2) return theme.colors.mist;
    const pct = (memberCount - pool.currentRank + 1) / memberCount;
    if (pct >= 0.75) return theme.colors.green;
    if (pct >= 0.5) return theme.colors.primary;
    if (pct >= 0.25) return theme.colors.amber;
    return theme.colors.red;
  })();

  return (
    <View style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.md - 2, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <RNText
          numberOfLines={1}
          style={{ flex: 1, fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}
        >
          {pool.poolName}
        </RNText>
        {pool.currentRank ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            {rankEmoji ? <RNText style={{ fontSize: 12 }}>{rankEmoji}</RNText> : null}
            <RNText
              style={{
                fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
                fontSize: 12,
                color: theme.colors.slate,
              }}
            >
              #{pool.currentRank}/{memberCount}
            </RNText>
          </View>
        ) : null}
      </View>

      {pool.currentRank && memberCount > 1 ? (
        <View style={{ height: 4, borderRadius: 3, backgroundColor: theme.colors.mist, overflow: 'hidden' }}>
          <View
            style={{
              height: 4,
              borderRadius: 3,
              backgroundColor: rankBarColor,
              width: `${((memberCount - pool.currentRank + 1) / memberCount) * 100}%`,
            }}
          />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md + 2 }}>
        <MiniStat value={String(pool.totalPoints)} label="pts" color={theme.colors.primary} />
        <MiniStat
          value={String(acc?.totalCompleted ?? pool.predictionsCompleted)}
          label="pred"
          color={theme.colors.green}
        />
        {accuracy !== null ? (
          <MiniStat
            value={`${accuracy}%`}
            label="acc"
            color={accuracy >= 70 ? theme.colors.green : accuracy >= 40 ? theme.colors.amber : theme.colors.slate}
          />
        ) : null}
      </View>
    </View>
  );
}

function MiniStat({ value, label, color }: { value: string; label: string; color: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 13,
          color,
        }}
      >
        {value}
      </RNText>
      <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 10, color: theme.colors.slate }}>
        {label}
      </RNText>
    </View>
  );
}

function AccuracySection({ pools }: { pools: PoolSummary[] }) {
  const theme = useTheme();
  // Aggregate across all pools.
  const totals = useMemo(() => {
    let exact = 0;
    let correct = 0;
    let completed = 0;
    for (const p of pools) {
      const a = p.accuracyStats;
      if (!a) continue;
      exact += a.exactCount;
      correct += a.correctCount;
      completed += a.totalCompleted;
    }
    return { exact, correct, completed };
  }, [pools]);

  const accuracyPct = totals.completed > 0 ? Math.round((totals.correct / totals.completed) * 100) : 0;
  const exactPct = totals.completed > 0 ? Math.round((totals.exact / totals.completed) * 100) : 0;
  const incorrect = Math.max(0, totals.completed - totals.correct);

  return (
    <SectionWrapper title="Prediction Accuracy">
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.lg,
          paddingVertical: theme.spacing.md,
          gap: theme.spacing.md - 2,
        }}
      >
        <View style={{ flexDirection: 'row' }}>
          <RingColumn value={accuracyPct} label="Accuracy" subtitle={`${totals.correct}/${totals.completed}`} color={theme.colors.green} />
          <RingColumn value={exactPct} label="Exact" subtitle={`${totals.exact} scores`} color={theme.colors.accent} />
          <RingColumn value={accuracyPct} label="Hit Rate" subtitle={`${totals.correct} wins`} color={theme.colors.primary} />
        </View>

        <Divider />

        {totals.completed > 0 ? (
          <AccuracyBar
            exact={totals.exact}
            correctNonExact={totals.correct - totals.exact}
            miss={incorrect}
          />
        ) : null}

        <View style={{ paddingHorizontal: theme.spacing.md, gap: 10 }}>
          <BreakdownRow label="Exact Score" count={totals.exact} total={totals.completed} color={theme.colors.accent} />
          <BreakdownRow label="Correct Result" count={Math.max(0, totals.correct - totals.exact)} total={totals.completed} color={theme.colors.green} />
          <BreakdownRow label="Incorrect" count={incorrect} total={totals.completed} color={theme.colors.red} />
        </View>
      </View>
    </SectionWrapper>
  );
}

function RingColumn({
  value,
  label,
  subtitle,
  color,
}: {
  value: number;
  label: string;
  subtitle: string;
  color: string;
}) {
  const theme = useTheme();
  // Static SVG-free ring: outer track + a percentage fill ring using a
  // rotated half-circle approach is heavy; for v1 we render an outer
  // ring track + inner text. The numeric value already carries the signal.
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          borderWidth: 5,
          borderColor: withOpacity(color, 0.12),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            position: 'absolute',
            inset: -5,
            borderRadius: 24,
            borderWidth: 5,
            borderColor: color,
            borderRightColor: value >= 25 ? color : 'transparent',
            borderBottomColor: value >= 50 ? color : 'transparent',
            borderLeftColor: value >= 75 ? color : 'transparent',
            borderTopColor: value >= 1 ? color : 'transparent',
            transform: [{ rotate: '-45deg' }],
          }}
        />
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 11,
            color: theme.colors.ink,
          }}
        >
          {value}%
        </RNText>
      </View>
      <RNText
        style={{ fontFamily: fontFamilies.semibold, fontSize: 11, color: theme.colors.ink }}
      >
        {label}
      </RNText>
      <RNText
        style={{ fontFamily: fontFamilies.medium, fontSize: 9, color: theme.colors.slate }}
      >
        {subtitle}
      </RNText>
    </View>
  );
}

function AccuracyBar({
  exact,
  correctNonExact,
  miss,
}: {
  exact: number;
  correctNonExact: number;
  miss: number;
}) {
  const theme = useTheme();
  const total = Math.max(1, exact + correctNonExact + miss);
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 2,
        marginHorizontal: theme.spacing.md,
        height: 8,
      }}
    >
      {exact > 0 ? (
        <View
          style={{
            backgroundColor: theme.colors.accent,
            borderRadius: 4,
            flex: exact / total,
          }}
        />
      ) : null}
      {correctNonExact > 0 ? (
        <View
          style={{
            backgroundColor: theme.colors.green,
            borderRadius: 4,
            flex: correctNonExact / total,
          }}
        />
      ) : null}
      {miss > 0 ? (
        <View
          style={{
            backgroundColor: withOpacity(theme.colors.red, 0.4),
            borderRadius: 4,
            flex: miss / total,
          }}
        />
      ) : null}
    </View>
  );
}

function BreakdownRow({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const theme = useTheme();
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <RNText
        style={{ flex: 1, fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.ink }}
      >
        {label}
      </RNText>
      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 13,
          color: theme.colors.ink,
        }}
      >
        {count}
      </RNText>
      <RNText
        style={{
          width: 44,
          textAlign: 'right',
          fontFamily: fontFamilies.medium,
          fontSize: 11,
          color: theme.colors.slate,
        }}
      >
        ({pct}%)
      </RNText>
    </View>
  );
}

function SettingsSection() {
  return (
    <SectionWrapper title="Settings">
      <SettingsCard>
        <SettingsRow
          icon="gearshape.fill"
          title="Settings"
          subtitle="Account, notifications, archived pools & help"
          onPress={() => router.push('/settings')}
        />
      </SettingsCard>
    </SectionWrapper>
  );
}

function VersionFooter() {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.xl + theme.spacing.md,
      }}
    >
      <RNText
        style={{ fontFamily: fontFamilies.semibold, fontSize: 12, color: theme.colors.slate }}
      >
        SportPool
      </RNText>
      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Regular' : 'monospace',
          fontSize: 11,
          color: theme.colors.slate,
        }}
      >
        v1.0.0
      </RNText>
    </View>
  );
}

// Lifetime Trophy Case — cumulative badge counts from the append-only
// badge_unlocks ledger (reads the user's own rows; RLS self-read policy allows
// it across all pools, even ones they've left). Reuses the mobile medallion art.
const TRANSIENT_BADGES = new Set(['top_dog']);

function formatBadgeName(id: string): string {
  return id
    .replace(/^bp_/, '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function TrophyCaseSection() {
  const theme = useTheme();
  const { user } = useAuth();
  const [badges, setBadges] = useState<{ id: string; count: number }[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: userRow } = await supabase
        .from('users')
        .select('user_id')
        .eq('auth_user_id', user.id)
        .single();
      const appUserId = (userRow as { user_id: string } | null)?.user_id;
      if (!appUserId) {
        if (!cancelled) setBadges([]);
        return;
      }
      // Archived pools are excluded (migration 040): an archived pool stops
      // counting toward trophies until it is restored. `!inner` makes the
      // embedded pools row a join rather than a left-join, so `.is()` on it
      // actually filters the outer rows. Must stay in step with the web
      // Trophy Case (app/profile/ProfilePage.tsx) — two surfaces deriving the
      // same number differently is how they came to disagree about levels.
      const { data } = await supabase
        .from('badge_unlocks')
        .select('badge_id, pool:pools!inner(archived_at)')
        .eq('user_id', appUserId)
        .is('pool.archived_at', null);
      if (cancelled) return;
      const counts = new Map<string, number>();
      for (const row of (data ?? []) as { badge_id: string }[]) {
        if (TRANSIENT_BADGES.has(row.badge_id)) continue;
        counts.set(row.badge_id, (counts.get(row.badge_id) ?? 0) + 1);
      }
      setBadges(
        [...counts.entries()]
          .map(([id, count]) => ({ id, count }))
          .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (badges === null) {
    return (
      <SectionWrapper title="Trophy Case">
        <View style={{ padding: theme.spacing.xl, alignItems: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SectionWrapper>
    );
  }

  if (badges.length === 0) {
    return (
      <SectionWrapper title="Trophy Case">
        <View style={{ padding: theme.spacing.xl }}>
          <Text style={{ color: theme.colors.slate, textAlign: 'center' }}>
            No trophies yet — earn badges by making great predictions.
          </Text>
        </View>
      </SectionWrapper>
    );
  }

  return (
    <SectionWrapper title="Trophy Case">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {badges.map(({ id, count }) => {
          const icon = badgeIcon(id);
          return (
            <View
              key={id}
              style={{
                width: '31%',
                alignItems: 'center',
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radii.md,
                paddingVertical: theme.spacing.md,
                paddingHorizontal: theme.spacing.sm,
              }}
            >
              {icon.png ? (
                <Image source={icon.png} resizeMode="contain" style={{ width: 44, height: 44 }} />
              ) : (
                <Text style={{ fontSize: 30 }}>{icon.emoji}</Text>
              )}
              <Text
                numberOfLines={1}
                style={{ fontSize: 11, fontWeight: '600', color: theme.colors.ink, marginTop: 6, textAlign: 'center' }}
              >
                {formatBadgeName(id)}
              </Text>
              <View
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  backgroundColor: theme.colors.primary,
                  borderRadius: theme.radii.pill,
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{count}×</Text>
              </View>
            </View>
          );
        })}
      </View>
    </SectionWrapper>
  );
}

function SectionWrapper({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm + 4 }}>
      <Text variant="sectionHeader" style={{ paddingHorizontal: theme.spacing.xl }}>
        {title}
      </Text>
      <View style={{ paddingHorizontal: theme.spacing.xl }}>{children}</View>
    </View>
  );
}

function EmptyStatsCard() {
  const theme = useTheme();
  return (
    <View
      style={{
        marginHorizontal: theme.spacing.xl,
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.xxl,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: withOpacity(theme.colors.primary, 0.08),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon
          name="chart.bar.fill"
          tint={withOpacity(theme.colors.primary, 0.4)}
          size={26}
          weight="regular"
        />
      </View>
      <RNText
        style={{ fontFamily: fontFamilies.bold, fontSize: 16, color: theme.colors.ink }}
      >
        No stats yet
      </RNText>
      <RNText
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 13,
          color: theme.colors.slate,
          textAlign: 'center',
          paddingHorizontal: theme.spacing.xxl,
        }}
      >
        Join a pool to start tracking{'\n'}your prediction performance
      </RNText>
    </View>
  );
}

function Divider() {
  const theme = useTheme();
  return (
    <View
      style={{
        height: 0.5,
        marginHorizontal: theme.spacing.md - 2,
        backgroundColor: withOpacity(theme.colors.mist, 0.5),
      }}
    />
  );
}

function formatMemberSince(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
