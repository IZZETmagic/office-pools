import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { joinPool } from '@/lib/api';
import { useHomeData } from '@/lib/HomeDataProvider';
import { supabase } from '@/lib/supabase';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// expo-clipboard is an optional native module — same defensive require
// pattern as SettingsTab. Lets the screen render in tooling where the
// module isn't linked yet; production builds always have it.
let Clipboard: typeof import('expo-clipboard') | null = null;
try {
  Clipboard = require('expo-clipboard');
} catch {
  Clipboard = null;
}

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
  // Full-tournament / progressive mode — per-match scoring.
  group_exact_score: number;
  group_correct_difference: number;
  group_correct_result: number;
  knockout_exact_score: number;
  knockout_correct_difference: number;
  knockout_correct_result: number;
  // Round multipliers (full/progressive only). Applied on top of the
  // per-match knockout scores for each round.
  round_32_multiplier: number;
  round_16_multiplier: number;
  quarter_final_multiplier: number;
  semi_final_multiplier: number;
  third_place_multiplier: number;
  final_multiplier: number;
  pso_enabled: boolean;
  pso_exact_score: number | null;
  pso_correct_difference: number | null;
  pso_correct_result: number | null;
  // Bonus points (full/progressive). Each is nullable + zero-by-default;
  // we only render rows the admin actually set to a positive value, so
  // the Bonus Points card shrinks to just the rules that are in play.
  bonus_group_winner_and_runnerup: number | null;
  bonus_group_winner_only: number | null;
  bonus_group_runnerup_only: number | null;
  bonus_both_qualify_swapped: number | null;
  bonus_one_qualifies_wrong_position: number | null;
  bonus_all_16_qualified: number | null;
  bonus_12_15_qualified: number | null;
  bonus_8_11_qualified: number | null;
  bonus_correct_bracket_pairing: number | null;
  bonus_match_winner_correct: number | null;
  bonus_champion_correct: number | null;
  bonus_second_place_correct: number | null;
  bonus_third_place_correct: number | null;
  bonus_best_player_correct: number | null;
  bonus_top_scorer_correct: number | null;
  // Bracket Picker mode — no per-match scores; everything is bonus points
  // for correct group positions, third-place qualifiers, knockout winners,
  // and penalty calls. Columns are nullable in the DB because non-bracket
  // pools don't fill them in. Match the field names in
  // lib/bracketPickerScoring.ts DEFAULTS.
  bp_group_correct_1st: number | null;
  bp_group_correct_2nd: number | null;
  bp_group_correct_3rd: number | null;
  bp_group_correct_4th: number | null;
  bp_third_correct_qualifier: number | null;
  bp_third_correct_eliminated: number | null;
  bp_third_all_correct_bonus: number | null;
  bp_r32_correct: number | null;
  bp_r16_correct: number | null;
  bp_qf_correct: number | null;
  bp_sf_correct: number | null;
  bp_third_place_match_correct: number | null;
  bp_final_correct: number | null;
  bp_champion_bonus: number | null;
  bp_penalty_correct: number | null;
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
  // Pool-code tap-to-copy feedback. Flips true on tap, reverts after 2s.
  // 2s matches the existing SettingsTab copy pattern — long enough for
  // the user to register the green confirmation, short enough to feel
  // snappy. Industry standard hovers in the 1.5–2s range (Slack, GitHub,
  // Notion all sit here).
  const [codeCopied, setCodeCopied] = useState(false);
  // Refresh the home dashboard's pool list after a successful join so the
  // new card shows up on Home and Pools tabs immediately.
  const { refresh: refreshHomeData } = useHomeData();

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
            // Select all bracket-picker scoring fields too so bracket pools
            // can render the right rules in the preview. Non-bracket pools
            // ignore the bp_* columns; bracket pools ignore the per-match
            // columns. Cheaper to over-select than to branch the query.
            .select(
              'group_exact_score, group_correct_difference, group_correct_result, knockout_exact_score, knockout_correct_difference, knockout_correct_result, round_32_multiplier, round_16_multiplier, quarter_final_multiplier, semi_final_multiplier, third_place_multiplier, final_multiplier, pso_enabled, pso_exact_score, pso_correct_difference, pso_correct_result, bonus_group_winner_and_runnerup, bonus_group_winner_only, bonus_group_runnerup_only, bonus_both_qualify_swapped, bonus_one_qualifies_wrong_position, bonus_all_16_qualified, bonus_12_15_qualified, bonus_8_11_qualified, bonus_correct_bracket_pairing, bonus_match_winner_correct, bonus_champion_correct, bonus_second_place_correct, bonus_third_place_correct, bonus_best_player_correct, bonus_top_scorer_correct, bp_group_correct_1st, bp_group_correct_2nd, bp_group_correct_3rd, bp_group_correct_4th, bp_third_correct_qualifier, bp_third_correct_eliminated, bp_third_all_correct_bonus, bp_r32_correct, bp_r16_correct, bp_qf_correct, bp_sf_correct, bp_third_place_match_correct, bp_final_correct, bp_champion_bonus, bp_penalty_correct',
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
      // Refresh Home / Pools cards so the new pool appears immediately
      // when the user navigates back to those tabs later.
      void refreshHomeData();
      // Replace the discover-preview modal with the pool's leaderboard so
      // tapping back doesn't return to the modal (the user already joined).
      router.replace(`/pool/${detail.poolId}`);
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

  // Tap-to-copy the pool code. Silent-fail when Clipboard isn't linked
  // (which only happens in tooling, not real builds). The visual feedback
  // — pill turns green, label flips to "Copied" — is driven by codeCopied;
  // it reverts after 2s on the same timeout the SettingsTab uses.
  async function handleCopyCode() {
    if (!detail || !Clipboard) return;
    try {
      await Clipboard.setStringAsync(detail.poolCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // Ignore — copy failure is non-critical, user can long-press text instead.
    }
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
        {/* Back chevron on the left — cross-platform navigation pattern.
            Lucide ChevronLeft via our Icon component renders consistently
            on both iOS and Android. */}
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => ({
            opacity: pressed ? 0.5 : 1,
            width: 32,
            alignItems: 'flex-start',
          })}
        >
          <Icon name="chevron.left" size={24} color="ink" weight="bold" />
        </Pressable>
        <Text variant="cardTitle" numberOfLines={1} align="center" style={{ flex: 1 }}>
          {detail.poolName}
        </Text>
        {/* Right-side spacer — matches the back button's footprint so the
            title stays optically centered. */}
        <View style={{ width: 32 }} />
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
            {/* Pool code pill — tap to copy. Swaps to a green "Copied"
                state for 2s after a successful copy. Disabled (visually
                identical, just no press handler) when Clipboard isn't
                linked, which only happens in tooling. */}
            <Pressable
              onPress={handleCopyCode}
              disabled={!Clipboard}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: theme.spacing.sm + 1,
                borderRadius: theme.radii.pill,
                backgroundColor: codeCopied
                  ? withOpacity(theme.colors.green, 0.16)
                  : withOpacity(theme.colors.primary, 0.08),
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Icon
                name={codeCopied ? 'checkmark.circle.fill' : 'doc.on.clipboard'}
                tint={codeCopied ? theme.colors.green : undefined}
                color={codeCopied ? undefined : 'primary'}
                size={18}
              />
              <RNText
                style={{
                  fontFamily: codeCopied
                    ? fontFamilies.bold
                    : Platform.OS === 'ios'
                      ? 'Menlo-Bold'
                      : 'monospace',
                  fontSize: 13,
                  fontWeight: '700',
                  color: codeCopied ? theme.colors.green : theme.colors.primary,
                  letterSpacing: codeCopied ? 0 : 1,
                  // Android's text-measurement omits the trailing letter-spacing,
                  // so the last glyph gets clipped by the parent. Match it with
                  // a paddingRight equal to the letterSpacing value. iOS already
                  // measures the trailing space correctly so this is Android-only.
                  ...Platform.select({
                    android: codeCopied ? {} : { paddingRight: 1 },
                    default: {},
                  }),
                }}
              >
                {codeCopied ? 'Copied' : detail.poolCode}
              </RNText>
            </Pressable>
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
              {detail.predictionMode === 'bracket_picker' ? (
                // Bracket Picker mode has no per-match scoring — points come
                // from correct group positions, third-place predictions,
                // knockout winners, the champion pick, and (optionally)
                // penalty calls. Mirrors the DEFAULTS in
                // lib/bracketPickerScoring.ts. Falls back to those defaults
                // when the admin hasn't overridden them in pool_settings.
                <>
                  <ScoringCard title="Group Positions">
                    <ScoreRow label="Correct 1st Place" pts={settings.bp_group_correct_1st ?? 4} />
                    <ScoreRow label="Correct 2nd Place" pts={settings.bp_group_correct_2nd ?? 3} />
                    <ScoreRow label="Correct 3rd Place" pts={settings.bp_group_correct_3rd ?? 2} />
                    <ScoreRow label="Correct 4th Place" pts={settings.bp_group_correct_4th ?? 1} />
                  </ScoringCard>
                  <ScoringCard title="Third-Place Qualifiers">
                    <ScoreRow
                      label="Correct Qualifier"
                      pts={settings.bp_third_correct_qualifier ?? 2}
                    />
                    <ScoreRow
                      label="Correct Elimination"
                      pts={settings.bp_third_correct_eliminated ?? 1}
                    />
                    <ScoreRow
                      label="All Correct Bonus"
                      pts={settings.bp_third_all_correct_bonus ?? 10}
                    />
                  </ScoringCard>
                  <ScoringCard title="Knockout Winners">
                    <ScoreRow label="Round of 32" pts={settings.bp_r32_correct ?? 1} />
                    <ScoreRow label="Round of 16" pts={settings.bp_r16_correct ?? 2} />
                    <ScoreRow label="Quarter-Final" pts={settings.bp_qf_correct ?? 4} />
                    <ScoreRow label="Semi-Final" pts={settings.bp_sf_correct ?? 8} />
                    <ScoreRow
                      label="Third-Place Match"
                      pts={settings.bp_third_place_match_correct ?? 10}
                    />
                    <ScoreRow label="Final" pts={settings.bp_final_correct ?? 20} />
                  </ScoringCard>
                  <ScoringCard title="Bonus Picks">
                    <ScoreRow label="Champion Bonus" pts={settings.bp_champion_bonus ?? 50} />
                    <ScoreRow label="Correct Penalty Call" pts={settings.bp_penalty_correct ?? 1} />
                  </ScoringCard>
                </>
              ) : (
                // Full-tournament and progressive modes both score per-match
                // (exact / difference / result), so they render the same
                // three (or four with PSO) cards.
                <>
                  <ScoringCard title="Group Stage">
                    <ScoreRow label="Exact Score" pts={settings.group_exact_score} />
                    <ScoreRow label="Correct Difference" pts={settings.group_correct_difference} />
                    <ScoreRow label="Correct Result" pts={settings.group_correct_result} />
                  </ScoringCard>
                  <ScoringCard title="Knockout Stage">
                    <ScoreRow label="Exact Score" pts={settings.knockout_exact_score} />
                    <ScoreRow label="Correct Difference" pts={settings.knockout_correct_difference} />
                    <ScoreRow label="Correct Result" pts={settings.knockout_correct_result} />
                    <ScoringDivider />
                    <ScoringSubheader title="Round Multipliers" />
                    <MultiplierRow label="Round of 32" value={settings.round_32_multiplier} />
                    <MultiplierRow label="Round of 16" value={settings.round_16_multiplier} />
                    <MultiplierRow label="Quarter Final" value={settings.quarter_final_multiplier} />
                    <MultiplierRow label="Semi Final" value={settings.semi_final_multiplier} />
                    <MultiplierRow label="3rd Place" value={settings.third_place_multiplier} />
                    <MultiplierRow label="Final" value={settings.final_multiplier} />
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
                  {(() => {
                    // Only render rules the admin actually set to a
                    // positive value. Keeps the card terse on pools that
                    // only use a handful of bonuses (most of them).
                    const rows = collectBonusRows(settings);
                    if (rows.length === 0) return null;
                    return (
                      <ScoringCard title="Bonus Points">
                        {rows.map((r) => (
                          <ScoreRow key={r.label} label={r.label} pts={r.pts} />
                        ))}
                      </ScoringCard>
                    );
                  })()}
                </>
              )}
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
              <Icon
                name={detail.alreadyJoined ? 'arrow.right.circle.fill' : 'person.badge.plus'}
                size={20}
                tint="#FFFFFF"
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

function MultiplierRow({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  // Whole-number multipliers render as "×2"; fractional ones as "×1.5"
  // so the admin's exact configured value is visible (matches the
  // in-pool ScoringTab's MultiplierRow).
  const display = value === Math.floor(value) ? `×${value}` : `×${value.toFixed(1)}`;
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
        {display}
      </RNText>
    </View>
  );
}

function ScoringDivider() {
  const theme = useTheme();
  return (
    <View
      style={{
        height: 0.5,
        backgroundColor: withOpacity(theme.colors.silver, 0.5),
        marginVertical: 4,
      }}
    />
  );
}

function ScoringSubheader({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <RNText
      style={{
        fontFamily: fontFamilies.bold,
        fontSize: 11,
        color: theme.colors.slate,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        marginTop: 2,
      }}
    >
      {title}
    </RNText>
  );
}

// Mirrors collectBonusRows in ScoringTab — surfaces only rules the
// admin set to a positive value, so the Bonus Points card shrinks
// to just what's actually in play for this pool.
type BonusRow = { label: string; pts: number };
function collectBonusRows(s: PoolSettingsRow): BonusRow[] {
  const rows: BonusRow[] = [];
  const push = (label: string, v: number | null) => {
    if (v !== null && v !== undefined && v > 0) rows.push({ label, pts: v });
  };
  push('Winner & Runner-up', s.bonus_group_winner_and_runnerup);
  push('Winner Only', s.bonus_group_winner_only);
  push('Runner-up Only', s.bonus_group_runnerup_only);
  push('Both Qualify (Swapped)', s.bonus_both_qualify_swapped);
  push('One Qualifies (Wrong Pos)', s.bonus_one_qualifies_wrong_position);
  push('All 16 Qualified', s.bonus_all_16_qualified);
  push('12-15 Qualified', s.bonus_12_15_qualified);
  push('8-11 Qualified', s.bonus_8_11_qualified);
  push('Correct Bracket Pairing', s.bonus_correct_bracket_pairing);
  push('Match Winner Correct', s.bonus_match_winner_correct);
  push('Champion Correct', s.bonus_champion_correct);
  push('2nd Place Correct', s.bonus_second_place_correct);
  push('3rd Place Correct', s.bonus_third_place_correct);
  push('Top Scorer Correct', s.bonus_top_scorer_correct);
  push('Best Player Correct', s.bonus_best_player_correct);
  return rows;
}
