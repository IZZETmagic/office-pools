// Port of ios/OfficePools/Views/Profile/ProfileView.swift.
// Five sections: profile card, quick stats, pool performance, account info,
// notification prefs, danger zone. Sign-out is wired; edit profile and
// account deletion route through their existing handlers / endpoints.

import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  JoinPoolSheet,
  type JoinPoolSheetHandle,
  PoolCreateJoinSheet,
  type PoolCreateJoinSheetHandle,
  PoolsHeader,
} from '@/components/pools';
import { Icon, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useHomeData } from '@/lib/HomeDataProvider';
import { fetchNotificationPrefs, updateNotificationPref, deleteAccount, fetchPushPrefs, updatePushPref } from '@/lib/api';
import type { PoolSummary } from '@/lib/useHomeData';
import { useManualRefresh } from '@/lib/useManualRefresh';
import { supabase } from '@/lib/supabase';
import { usePushPermission, type PushPermissionStatus } from '@/lib/usePushPermission';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

const NOTIF_OPTIONS: Array<{ key: string; label: string; desc: string; icon: string }> = [
  { key: 'POOL_ACTIVITY', label: 'Pool Activity', desc: 'Join/leave pool, invitations', icon: 'person.3.fill' },
  { key: 'PREDICTIONS', label: 'Predictions', desc: 'Deadline reminders, confirmations', icon: 'target' },
  { key: 'MATCH_RESULTS', label: 'Match Results', desc: 'Results and points earned', icon: 'sportscourt.fill' },
  { key: 'LEADERBOARD', label: 'Leaderboard Updates', desc: 'Rank changes, weekly standings', icon: 'chart.bar.fill' },
  { key: 'ADMIN', label: 'Admin Notifications', desc: 'Settings changed, member removed', icon: 'gearshape.fill' },
  { key: 'COMMUNITY', label: 'Community & Mentions', desc: '@mentions in pool chat', icon: 'bubble.left.and.bubble.right.fill' },
];

export default function ProfileScreen() {
  const theme = useTheme();
  const { signOut } = useAuth();
  const { data, refresh } = useHomeData();
  // Pull-to-refresh: spinner bound to real user gesture only.
  const { refreshing, onRefresh } = useManualRefresh(refresh);
  const tabBarHeight = useBottomTabBarHeight();
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
          paddingBottom: tabBarHeight + theme.spacing.xl,
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

        <AccountSection
          username={data?.username ?? ''}
          fullName={data?.fullName ?? ''}
          email={data?.email ?? ''}
        />

        <SecuritySection />

        <PushNotificationsSection />

        <PushPreferencesSection />

        <NotificationsSection />

        <LegalSection />

        <DangerZone onSignOut={signOut} />

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
                {totalPoints} pts
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

function AccountSection({
  username,
  fullName,
  email,
}: {
  username: string;
  fullName: string;
  email: string;
}) {
  const theme = useTheme();
  return (
    <SectionWrapper title="Account">
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg }}>
        <AccountRow label="Username" value={username} />
        <Divider />
        <AccountRow label="Full Name" value={fullName} />
        <Divider />
        <AccountRow label="Email" value={email} />
      </View>
    </SectionWrapper>
  );
}

function AccountRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 11,
      }}
    >
      <RNText
        style={{
          width: 76,
          fontFamily: fontFamilies.medium,
          fontSize: 12,
          color: theme.colors.slate,
        }}
      >
        {label}
      </RNText>
      <RNText
        numberOfLines={1}
        style={{ flex: 1, fontFamily: fontFamilies.medium, fontSize: 14, color: theme.colors.ink }}
      >
        {value}
      </RNText>
    </View>
  );
}

function SecuritySection() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <SectionWrapper title="Security">
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm + 4,
          padding: theme.spacing.md,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.lg,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: theme.colors.primaryLight,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="lock.fill" tint={theme.colors.primary} size={14} weight="semibold" />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <RNText
            style={{ fontFamily: fontFamilies.semibold, fontSize: 14, color: theme.colors.ink }}
          >
            Change Password
          </RNText>
          <RNText
            style={{ fontFamily: fontFamilies.medium, fontSize: 11, color: theme.colors.slate }}
          >
            Update your account password
          </RNText>
        </View>
        <Icon name="chevron.right" tint={theme.colors.slate} size={12} weight="semibold" />
      </Pressable>

      <ChangePasswordModal open={open} onClose={() => setOpen(false)} />
    </SectionWrapper>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useTheme();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) {
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
      setSuccess(false);
      setLoading(false);
    }
  }, [open]);

  async function handleSubmit() {
    setError(null);
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    setSuccess(true);
    setTimeout(onClose, 1200);
  }

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.snow }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: theme.spacing.xl,
            paddingVertical: theme.spacing.md,
          }}
        >
          <RNText
            style={{ fontFamily: fontFamilies.bold, fontSize: 17, color: theme.colors.ink }}
          >
            Change Password
          </RNText>
          <Pressable onPress={onClose} hitSlop={12}>
            <RNText
              style={{ fontFamily: fontFamilies.semibold, fontSize: 15, color: theme.colors.primary }}
            >
              Done
            </RNText>
          </Pressable>
        </View>

        {success ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md }}>
            <Icon name="checkmark.circle.fill" tint={theme.colors.green} size={48} weight="regular" />
            <RNText
              style={{ fontFamily: fontFamilies.bold, fontSize: 18, color: theme.colors.ink }}
            >
              Password Updated
            </RNText>
          </View>
        ) : (
          <View style={{ padding: theme.spacing.xl, gap: theme.spacing.md }}>
            {error ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  padding: 10,
                  backgroundColor: theme.colors.redLight,
                  borderRadius: theme.radii.sm,
                }}
              >
                <Icon
                  name="exclamationmark.circle.fill"
                  tint={theme.colors.red}
                  size={12}
                  weight="regular"
                />
                <RNText
                  style={{
                    flex: 1,
                    fontFamily: fontFamilies.medium,
                    fontSize: 12,
                    color: theme.colors.red,
                  }}
                >
                  {error}
                </RNText>
              </View>
            ) : null}

            <LabeledInput
              label="NEW PASSWORD"
              placeholder="At least 8 characters"
              value={newPassword}
              onChangeText={setNewPassword}
              secure
            />
            <LabeledInput
              label="CONFIRM PASSWORD"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secure
            />

            <Pressable
              onPress={handleSubmit}
              disabled={loading || !newPassword || !confirmPassword}
              style={({ pressed }) => ({
                marginTop: theme.spacing.sm,
                paddingVertical: theme.spacing.md + 2,
                alignItems: 'center',
                borderRadius: theme.radii.md,
                backgroundColor:
                  !newPassword || !confirmPassword
                    ? withOpacity(theme.colors.primary, 0.4)
                    : theme.colors.primary,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <RNText
                  style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: '#FFFFFF' }}
                >
                  Update Password
                </RNText>
              )}
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function LabeledInput({
  label,
  placeholder,
  value,
  onChangeText,
  secure,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (s: string) => void;
  secure?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 10,
          letterSpacing: 0.5,
          color: theme.colors.slate,
        }}
      >
        {label}
      </RNText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.slate}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 14,
          color: theme.colors.ink,
          padding: 12,
          backgroundColor: withOpacity(theme.colors.mist, 0.5),
          borderRadius: theme.radii.md,
        }}
      />
    </View>
  );
}

function PushNotificationsSection() {
  const theme = useTheme();
  const { status, request, openSettings } = usePushPermission();

  const { label, ctaLabel, onCtaPress, statusBadge } = pushSectionState(
    status,
    request,
    openSettings,
    theme,
  );

  return (
    <SectionWrapper title="Push Notifications">
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm + 4,
            paddingHorizontal: theme.spacing.md - 2,
            paddingVertical: theme.spacing.sm + 2,
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: theme.colors.primaryLight,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="bell.fill" tint={theme.colors.primary} size={13} weight="semibold" />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <RNText
              style={{ fontFamily: fontFamilies.semibold, fontSize: 14, color: theme.colors.ink }}
            >
              Push Notifications
            </RNText>
            <RNText
              style={{ fontFamily: fontFamilies.medium, fontSize: 11, color: theme.colors.slate }}
            >
              {label}
            </RNText>
          </View>
          {statusBadge}
          {onCtaPress ? (
            <Pressable
              onPress={onCtaPress}
              hitSlop={8}
              style={({ pressed }) => ({
                paddingHorizontal: theme.spacing.sm + 2,
                paddingVertical: 6,
                borderRadius: theme.radii.pill,
                backgroundColor: withOpacity(theme.colors.primary, 0.12),
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.semibold,
                  fontSize: 13,
                  color: theme.colors.primary,
                }}
              >
                {ctaLabel}
              </RNText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </SectionWrapper>
  );
}

function pushSectionState(
  status: PushPermissionStatus | null,
  request: () => Promise<PushPermissionStatus>,
  openSettings: () => Promise<void>,
  theme: ReturnType<typeof useTheme>,
): {
  label: string;
  ctaLabel: string | null;
  onCtaPress: (() => void) | null;
  statusBadge: React.ReactNode;
} {
  if (status === null) {
    return { label: 'Checking…', ctaLabel: null, onCtaPress: null, statusBadge: null };
  }
  if (status === 'granted') {
    return {
      label: 'Receiving push notifications',
      ctaLabel: null,
      onCtaPress: null,
      statusBadge: (
        <Icon name="checkmark.circle.fill" tint={theme.colors.green} size={20} weight="regular" />
      ),
    };
  }
  if (status === 'denied') {
    return {
      label: 'Disabled — open Settings to re-enable',
      ctaLabel: 'Settings',
      onCtaPress: () => void openSettings(),
      statusBadge: null,
    };
  }
  // undetermined
  return {
    label: 'Get alerts for mentions, results & deadlines',
    ctaLabel: 'Enable',
    onCtaPress: () => void request(),
    statusBadge: null,
  };
}

const PUSH_PREF_OPTIONS: Array<{ key: string; label: string; desc: string; icon: string }> = [
  { key: 'POOL_ACTIVITY', label: 'Pool Activity', desc: 'Join/leave a pool, invitations', icon: 'person.3.fill' },
  { key: 'PREDICTIONS', label: 'Predictions', desc: 'Deadline reminders, confirmations', icon: 'target' },
  { key: 'MATCH_RESULTS', label: 'Match Results', desc: 'Per-match outcomes, matchday recaps', icon: 'sportscourt.fill' },
  { key: 'LEADERBOARD', label: 'Leaderboard', desc: 'Rank changes and shake-ups', icon: 'chart.bar.fill' },
  { key: 'ADMIN', label: 'Admin Alerts', desc: 'Settings changed, points adjusted', icon: 'gearshape.fill' },
  { key: 'COMMUNITY', label: 'Community', desc: '@mentions and pool chat', icon: 'bubble.left.and.bubble.right.fill' },
  { key: 'GAMIFICATION', label: 'Achievements', desc: 'Badges, level-ups, streaks, MVP', icon: 'rosette' },
];

function PushPreferencesSection() {
  const theme = useTheme();
  const { status } = usePushPermission();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  // Only meaningful when push permission is granted — otherwise the toggles
  // would be misleading (the OS would suppress everything regardless).
  const enabled = status === 'granted';

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchPushPrefs()
      .then((res) => {
        if (cancelled) return;
        setPrefs(res.preferences);
      })
      .catch((err) => console.warn('[profile] failed to load push prefs', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  async function handleToggle(key: string) {
    const next = !(prefs[key] ?? true);
    setUpdatingKey(key);
    setPrefs((p) => ({ ...p, [key]: next })); // optimistic
    try {
      await updatePushPref(key, next);
    } catch (err) {
      setPrefs((p) => ({ ...p, [key]: !next })); // revert
      console.warn('[profile] push pref toggle failed', err);
    } finally {
      setUpdatingKey(null);
    }
  }

  if (!enabled) {
    // Permission isn't granted — hiding the section avoids implying the
    // toggles do anything. Users opt in via the section above first.
    return null;
  }

  return (
    <SectionWrapper title="Push Categories">
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg }}>
        {loading ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.spacing.sm,
              paddingVertical: theme.spacing.xl,
            }}
          >
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <RNText
              style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate }}
            >
              Loading preferences...
            </RNText>
          </View>
        ) : (
          PUSH_PREF_OPTIONS.map((opt, idx) => (
            <View key={opt.key}>
              <NotificationRow
                option={opt}
                enabled={prefs[opt.key] ?? true}
                updating={updatingKey === opt.key}
                onToggle={() => handleToggle(opt.key)}
              />
              {idx < PUSH_PREF_OPTIONS.length - 1 ? <Divider /> : null}
            </View>
          ))
        )}
      </View>
    </SectionWrapper>
  );
}

function NotificationsSection() {
  const theme = useTheme();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchNotificationPrefs()
      .then((res) => {
        if (cancelled) return;
        setPrefs(res.preferences);
      })
      .catch((err) => {
        console.warn('[profile] failed to load notification prefs', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(key: string) {
    const next = !(prefs[key] ?? true);
    setUpdatingKey(key);
    setPrefs((p) => ({ ...p, [key]: next })); // optimistic
    try {
      await updateNotificationPref(key, next);
    } catch (err) {
      setPrefs((p) => ({ ...p, [key]: !next })); // revert
      console.warn('[profile] toggle failed', err);
    } finally {
      setUpdatingKey(null);
    }
  }

  return (
    <SectionWrapper title="Email Notifications">
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg }}>
        {loading ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.spacing.sm,
              paddingVertical: theme.spacing.xl,
            }}
          >
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <RNText
              style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate }}
            >
              Loading preferences...
            </RNText>
          </View>
        ) : (
          NOTIF_OPTIONS.map((opt, idx) => (
            <View key={opt.key}>
              <NotificationRow
                option={opt}
                enabled={prefs[opt.key] ?? true}
                updating={updatingKey === opt.key}
                onToggle={() => handleToggle(opt.key)}
              />
              {idx < NOTIF_OPTIONS.length - 1 ? <Divider /> : null}
            </View>
          ))
        )}
      </View>
    </SectionWrapper>
  );
}

function NotificationRow({
  option,
  enabled,
  updating,
  onToggle,
}: {
  option: { key: string; label: string; desc: string; icon: string };
  enabled: boolean;
  updating: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm + 4,
        paddingHorizontal: theme.spacing.md - 2,
        paddingVertical: theme.spacing.sm + 2,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: theme.colors.primaryLight,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={option.icon as never} tint={theme.colors.primary} size={13} weight="semibold" />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <RNText
          style={{ fontFamily: fontFamilies.semibold, fontSize: 14, color: theme.colors.ink }}
        >
          {option.label}
        </RNText>
        <RNText
          style={{ fontFamily: fontFamilies.medium, fontSize: 11, color: theme.colors.slate }}
        >
          {option.desc}
        </RNText>
      </View>
      {updating ? (
        <ActivityIndicator size="small" color={theme.colors.primary} />
      ) : (
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: theme.colors.mist, true: theme.colors.primary }}
        />
      )}
    </View>
  );
}

const LEGAL_LINKS: Array<{ label: string; url: string; icon: string }> = [
  { label: 'FAQs', url: 'https://sportpool.io/faq', icon: 'questionmark.circle.fill' },
  { label: 'Privacy Policy', url: 'https://sportpool.io/privacy', icon: 'hand.raised.fill' },
  { label: 'Terms & Conditions', url: 'https://sportpool.io/terms', icon: 'doc.text.fill' },
  { label: 'Contact Us', url: 'https://sportpool.io/contact', icon: 'envelope.fill' },
];

function LegalSection() {
  const theme = useTheme();

  async function openLink(url: string) {
    try {
      await WebBrowser.openBrowserAsync(url, {
        // Match the app's primary so the modal toolbar looks branded.
        toolbarColor: theme.colors.surface,
        controlsColor: theme.colors.primary,
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch (err) {
      console.warn('[profile] failed to open browser', err);
    }
  }

  return (
    <SectionWrapper title="Help & Legal">
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg }}>
        {LEGAL_LINKS.map((link, idx) => (
          <View key={link.url}>
            <LegalRow
              label={link.label}
              icon={link.icon}
              onPress={() => openLink(link.url)}
            />
            {idx < LEGAL_LINKS.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </View>
    </SectionWrapper>
  );
}

function LegalRow({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm + 4,
        paddingHorizontal: theme.spacing.md - 2,
        paddingVertical: theme.spacing.sm + 2,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: theme.colors.primaryLight,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon as never} tint={theme.colors.primary} size={14} weight="semibold" />
      </View>
      <RNText
        style={{ flex: 1, fontFamily: fontFamilies.semibold, fontSize: 14, color: theme.colors.ink }}
      >
        {label}
      </RNText>
      <Icon name="arrow.up.right" tint={theme.colors.slate} size={11} weight="semibold" />
    </Pressable>
  );
}

function DangerZone({ onSignOut }: { onSignOut: () => void | Promise<void> }) {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: theme.spacing.xl, gap: theme.spacing.md - 2 }}>
      <Pressable
        onPress={() => {
          Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: () => onSignOut() },
          ]);
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          padding: theme.spacing.md,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.lg,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: theme.colors.redLight,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            name="rectangle.portrait.and.arrow.right"
            tint={theme.colors.red}
            size={14}
            weight="semibold"
          />
        </View>
        <RNText
          style={{ flex: 1, fontFamily: fontFamilies.semibold, fontSize: 14, color: theme.colors.red }}
        >
          Sign Out
        </RNText>
        <Icon name="chevron.right" tint={theme.colors.slate} size={12} weight="semibold" />
      </Pressable>

      <Pressable
        onPress={() => {
          Alert.alert(
            'Delete Account',
            'This is permanent. All your predictions, scores, and pool memberships will be permanently deleted.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteAccount();
                    await supabase.auth.signOut();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Failed to delete account';
                    Alert.alert('Delete failed', msg);
                  }
                },
              },
            ],
          );
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          padding: theme.spacing.md,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.lg,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: theme.colors.redLight,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="trash.fill" tint={theme.colors.red} size={14} weight="semibold" />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <RNText
            style={{ fontFamily: fontFamilies.semibold, fontSize: 14, color: theme.colors.red }}
          >
            Delete Account
          </RNText>
          <RNText
            style={{ fontFamily: fontFamilies.medium, fontSize: 11, color: theme.colors.slate }}
          >
            Permanently remove all data
          </RNText>
        </View>
        <Icon name="chevron.right" tint={theme.colors.slate} size={12} weight="semibold" />
      </Pressable>
    </View>
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
