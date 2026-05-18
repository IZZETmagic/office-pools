import { SymbolView } from 'expo-symbols';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { joinPool } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type PoolDetail = {
  poolId: string;
  poolName: string;
  poolCode: string;
  description: string | null;
  predictionMode: string;
  brandName: string | null;
  brandEmoji: string | null;
  brandColor: string | null;
  predictionDeadline: string | null;
  maxParticipants: number | null;
  maxEntriesPerUser: number;
  memberCount: number;
  alreadyJoined: boolean;
};

type PoolSettingsRow = {
  group_exact_score: number;
  group_correct_difference: number;
  group_correct_result: number;
  knockout_exact_score: number;
  knockout_correct_difference: number;
  knockout_correct_result: number;
  pso_enabled: boolean;
  pso_exact_score: number | null;
  pso_correct_difference: number | null;
  pso_correct_result: number | null;
};

const MODE_LABEL: Record<string, string> = {
  full_tournament: 'Full Tournament',
  progressive: 'Progressive',
  bracket_picker: 'Bracket Picker',
};

const MODE_COLOR: Record<string, string> = {
  full_tournament: '#3B6EFF',
  progressive: '#059669',
  bracket_picker: '#D97706',
};

function brandHex(hex: string | null): string | null {
  if (!hex) return null;
  return hex.startsWith('#') ? hex : `#${hex}`;
}

function formatLongDate(iso: string | null): string {
  if (!iso) return 'No deadline';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function PoolPreviewSheet() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<PoolDetail | null>(null);
  const [settings, setSettings] = useState<PoolSettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      try {
        const { data: authData } = await supabase.auth.getUser();
        const authUserId = authData.user?.id;
        const [{ data: userData }, { data: poolData }, { data: settingsData }] = await Promise.all([
          authUserId
            ? supabase.from('users').select('user_id').eq('auth_user_id', authUserId).maybeSingle()
            : Promise.resolve({ data: null }),
          supabase
            .from('pools')
            .select(
              'pool_id, pool_name, pool_code, description, prediction_mode, brand_name, brand_emoji, brand_color, prediction_deadline, max_participants, max_entries_per_user',
            )
            .eq('pool_id', id)
            .maybeSingle(),
          supabase
            .from('pool_settings')
            .select(
              'group_exact_score, group_correct_difference, group_correct_result, knockout_exact_score, knockout_correct_difference, knockout_correct_result, pso_enabled, pso_exact_score, pso_correct_difference, pso_correct_result',
            )
            .eq('pool_id', id)
            .maybeSingle(),
        ]);

        if (cancelled) return;
        if (!poolData) {
          setError('Pool not found.');
          setLoading(false);
          return;
        }

        const { count: memberCount } = await supabase
          .from('pool_members')
          .select('*', { count: 'exact', head: true })
          .eq('pool_id', id);

        let alreadyJoined = false;
        if (userData) {
          const { count: joinedCount } = await supabase
            .from('pool_members')
            .select('*', { count: 'exact', head: true })
            .eq('pool_id', id)
            .eq('user_id', (userData as { user_id: string }).user_id);
          alreadyJoined = (joinedCount ?? 0) > 0;
        }

        const pool = poolData as {
          pool_id: string;
          pool_name: string;
          pool_code: string;
          description: string | null;
          prediction_mode: string;
          brand_name: string | null;
          brand_emoji: string | null;
          brand_color: string | null;
          prediction_deadline: string | null;
          max_participants: number | null;
          max_entries_per_user: number;
        };

        if (cancelled) return;
        setDetail({
          poolId: pool.pool_id,
          poolName: pool.pool_name,
          poolCode: pool.pool_code,
          description: pool.description,
          predictionMode: pool.prediction_mode,
          brandName: pool.brand_name,
          brandEmoji: pool.brand_emoji,
          brandColor: pool.brand_color,
          predictionDeadline: pool.prediction_deadline,
          maxParticipants: pool.max_participants,
          maxEntriesPerUser: pool.max_entries_per_user,
          memberCount: memberCount ?? 0,
          alreadyJoined,
        });
        setSettings(settingsData as PoolSettingsRow | null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load pool.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleJoin() {
    if (!detail || joining) return;
    setJoining(true);
    try {
      await joinPool(detail.poolCode);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join pool.');
    } finally {
      setJoining(false);
    }
  }

  async function handleShare() {
    if (!detail) return;
    const url = `https://sportpool.io/join/${detail.poolCode}`;
    await Share.share({
      message: `Join my World Cup prediction pool on SportPool!\n\n${url}`,
      url,
    });
  }

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.snow,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.snow,
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing.xl,
          gap: theme.spacing.md,
        }}
      >
        <Text variant="cardTitle" align="center">
          {error ?? 'Pool not found'}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            paddingHorizontal: theme.spacing.xl,
            paddingVertical: theme.spacing.md,
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.primary,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: '#FFFFFF', fontFamily: fontFamilies.bold }}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const modeColor = MODE_COLOR[detail.predictionMode] ?? theme.colors.primary;
  const modeLabel = MODE_LABEL[detail.predictionMode] ?? 'Pool';
  const brandColor = brandHex(detail.brandColor);
  const isBranded = Boolean(detail.brandName && brandColor);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.spacing.xl,
          // iOS: the modal presentation provides its own safe inset above
          // the card, so a fixed xxl gap places the header comfortably below
          // the rounded modal lip. Android: the modal renders edge-to-edge
          // and inherits the system status bar — we need insets.top so the
          // title isn't tucked behind the notch / camera cutout.
          paddingTop:
            Platform.OS === 'android'
              ? insets.top + theme.spacing.md
              : theme.spacing.xxl,
          paddingBottom: theme.spacing.sm,
        }}
      >
        <View style={{ width: 32 }} />
        <Text variant="cardTitle" numberOfLines={1} align="center" style={{ flex: 1 }}>
          {detail.poolName}
        </Text>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, width: 32, alignItems: 'flex-end' })}
        >
          {/* iOS uses the native SF Symbol xmark.circle.fill (matches iOS
              navigation patterns). Android falls back to the cross-platform
              Icon component since SymbolView is iOS-only and would render
              nothing on Android — leaving users with no visible way to
              close the modal. */}
          {Platform.OS === 'ios' ? (
            <SymbolView
              name="xmark.circle.fill"
              size={28}
              tintColor={withOpacity(theme.colors.slate, 0.35)}
            />
          ) : (
            <Icon
              name="xmark.circle.fill"
              size={28}
              tint={withOpacity(theme.colors.slate, 0.35)}
              filled
            />
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.xl,
          paddingBottom: 120 + insets.bottom,
          gap: theme.spacing.xl,
        }}
      >
        <View style={{ gap: theme.spacing.sm }}>
          {isBranded && brandColor ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {detail.brandEmoji ? <RNText style={{ fontSize: 13 }}>{detail.brandEmoji}</RNText> : null}
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 13,
                  color: theme.colors.slate,
                }}
              >
                {detail.brandName}
              </RNText>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
            <Pill label={modeLabel} color={modeColor} />
            {detail.alreadyJoined ? <Pill label="Joined" color={theme.colors.green} /> : null}
          </View>
          {detail.description ? (
            <Text variant="body" color="slate">
              {detail.description}
            </Text>
          ) : null}
        </View>

        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radii.lg,
            paddingVertical: theme.spacing.xs,
            ...theme.shadows.card,
          }}
        >
          <InfoRow
            icon="person.2.fill"
            label="Players"
            value={
              detail.maxParticipants && detail.maxParticipants > 0
                ? `${detail.memberCount} / ${detail.maxParticipants}`
                : `${detail.memberCount}`
            }
          />
          <RowDivider />
          <InfoRow
            icon="ticket.fill"
            label="Entries per player"
            value={String(detail.maxEntriesPerUser)}
          />
          <RowDivider />
          <InfoRow
            icon="clock.fill"
            label="Deadline"
            value={formatLongDate(detail.predictionDeadline)}
          />
          <RowDivider />
          <InfoRow icon="eye.fill" label="Visibility" value="Public" />
        </View>

        <View style={{ gap: theme.spacing.md }}>
          <Text variant="cardTitle">Share</Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: theme.spacing.sm + 1,
                borderRadius: theme.radii.pill,
                backgroundColor: withOpacity(theme.colors.primary, 0.08),
              }}
            >
              <Icon name="doc.on.clipboard" color="primary" size={18} />
              <RNText
                style={{
                  fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
                  fontSize: 13,
                  fontWeight: '700',
                  color: theme.colors.primary,
                  letterSpacing: 1,
                }}
              >
                {detail.poolCode}
              </RNText>
            </View>
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: theme.spacing.sm + 1,
                borderRadius: theme.radii.pill,
                backgroundColor: withOpacity(theme.colors.primary, 0.08),
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Icon name="square.and.arrow.up" color="primary" size={18} />
              <RNText
                style={{
                  fontFamily: fontFamilies.semibold,
                  fontSize: 13,
                  color: theme.colors.primary,
                }}
              >
                Share
              </RNText>
            </Pressable>
          </View>
        </View>

        {settings ? (
          <View style={{ gap: theme.spacing.md }}>
            <Text variant="cardTitle">Scoring Rules</Text>
            <View style={{ gap: theme.spacing.md }}>
              <ScoringCard title="Group Stage">
                <ScoreRow label="Exact Score" pts={settings.group_exact_score} />
                <ScoreRow label="Correct Difference" pts={settings.group_correct_difference} />
                <ScoreRow label="Correct Result" pts={settings.group_correct_result} />
              </ScoringCard>
              <ScoringCard title="Knockout Stage">
                <ScoreRow label="Exact Score" pts={settings.knockout_exact_score} />
                <ScoreRow label="Correct Difference" pts={settings.knockout_correct_difference} />
                <ScoreRow label="Correct Result" pts={settings.knockout_correct_result} />
              </ScoringCard>
              {settings.pso_enabled ? (
                <ScoringCard title="Penalty Shootout">
                  {settings.pso_exact_score !== null ? (
                    <ScoreRow label="Exact Score" pts={settings.pso_exact_score} />
                  ) : null}
                  {settings.pso_correct_difference !== null ? (
                    <ScoreRow label="Correct Difference" pts={settings.pso_correct_difference} />
                  ) : null}
                  {settings.pso_correct_result !== null ? (
                    <ScoreRow label="Correct Result" pts={settings.pso_correct_result} />
                  ) : null}
                </ScoringCard>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.md + insets.bottom,
          backgroundColor: theme.colors.snow,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
        }}
      >
        <Pressable
          onPress={
            detail.alreadyJoined
              ? () => {
                  router.back();
                  setTimeout(() => router.navigate(`/pool/${detail.poolId}`), 250);
                }
              : handleJoin
          }
          disabled={joining}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            height: 52,
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.primary,
            opacity: joining ? 0.6 : pressed ? 0.85 : 1,
            shadowColor: theme.colors.primary,
            shadowOpacity: 0.3,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
          })}
        >
          {joining ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <SymbolView
                name={detail.alreadyJoined ? 'arrow.right.circle.fill' : 'person.badge.plus'}
                size={20}
                tintColor="#FFFFFF"
                weight="bold"
              />
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 16,
                  color: '#FFFFFF',
                }}
              >
                {detail.alreadyJoined ? 'Go to Pool' : 'Join Pool'}
              </RNText>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: withOpacity(color, 0.1),
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 12,
          color,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm + 2,
      }}
    >
      <View style={{ width: 28, alignItems: 'center' }}>
        <Icon name={icon as never} color="primary" size={20} />
      </View>
      <Text variant="body" color="slate" style={{ flex: 1 }}>
        {label}
      </Text>
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 14,
          color: theme.colors.ink,
        }}
      >
        {value}
      </RNText>
    </View>
  );
}

function RowDivider() {
  const theme = useTheme();
  return (
    <View
      style={{
        height: theme.borders.thin,
        backgroundColor: withOpacity(theme.colors.silver, 0.4),
        marginLeft: theme.spacing.xl + 16,
      }}
    />
  );
}

function ScoringCard({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        gap: theme.spacing.sm,
        ...theme.shadows.card,
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 13,
          color: theme.colors.slate,
        }}
      >
        {title}
      </RNText>
      {children}
    </View>
  );
}

function ScoreRow({ label, pts }: { label: string; pts: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 2,
      }}
    >
      <Text variant="body" color="slate">
        {label}
      </Text>
      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 13,
          fontWeight: '700',
          color: theme.colors.ink,
        }}
      >
        {pts} pts
      </RNText>
    </View>
  );
}
