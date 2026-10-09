import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, ScrollView, Share, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DiscoverPoolCard } from '@/components/pools';
import { Icon, Pressable, Text } from '@/components/ui';
import { joinPool } from '@/lib/api';
import { useHomeData } from '@/lib/HomeDataProvider';
import { howItWorks, leaguePointsCards, shareMessage, type PointsCard } from '@/lib/poolPreview';
import { supabase } from '@/lib/supabase';
import {
  DISCOVER_POOL_COLUMNS,
  toDiscoverPools,
  type DiscoverPool,
  type DiscoverPoolRow,
} from '@/lib/useDiscoverPools';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// The pool preview — what opens when you tap a pool on Discover
// =============================================================
// Preview A (Ryan, 2026-10-09): "card A, grown up". The Discover card itself
// at the top (`DiscoverPoolCard variant="hero"`), then How it works, then the
// pool's own points, with Share and Join pinned below.
//
// ⚠ IT DESCRIBED A WORLD CUP POOL WHATEVER IT OPENED ON — "Pool" for the game,
// the season's last kick-off as the "Deadline", World Cup group-stage and
// penalty-shootout scoring for a Premier League pool, and a Share button that
// sent "Join MY World Cup prediction pool". The copy and the numbers now come
// from lib/poolPreview.ts, which is tested; the card's facts come from the same
// select Discover uses, so the two cannot disagree.
// =============================================================

type PoolMeta = {
  maxParticipants: number | null;
  maxEntriesPerUser: number;
  isPrivate: boolean;
};

type PoolSettingsRow = {
  // The per-match prices — World Cup pools AND league Pick'em / Showdown, whose
  // engine prices against these same columns.
  group_exact_score: number;
  group_correct_difference: number;
  group_correct_result: number;
  pso_enabled: boolean;
  pso_exact_score: number | null;
  pso_correct_difference: number | null;
  pso_correct_result: number | null;
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

const WORLD_CUP_MODES = new Set(['full_tournament', 'progressive', 'bracket_picker']);

export default function PoolPreviewSheet() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [pool, setPool] = useState<DiscoverPool | null>(null);
  const [meta, setMeta] = useState<PoolMeta | null>(null);
  const [settings, setSettings] = useState<PoolSettingsRow | null>(null);
  const [alreadyJoined, setAlreadyJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        const [{ data: userData }, poolRes, settingsRes] = await Promise.all([
          authUserId
            ? supabase.from('users').select('user_id').eq('auth_user_id', authUserId).maybeSingle()
            : Promise.resolve({ data: null }),
          supabase
            .from('pools')
            .select(`${DISCOVER_POOL_COLUMNS}, max_participants, max_entries_per_user`)
            .eq('pool_id', id)
            .maybeSingle(),
          supabase
            .from('pool_settings')
            // Select all bracket-picker scoring fields too so bracket pools
            // can render the right rules in the preview. Non-bracket pools
            // ignore the bp_* columns; bracket pools ignore the per-match
            // columns. Cheaper to over-select than to branch the query.
            .select(
              'group_exact_score, group_correct_difference, group_correct_result, pso_enabled, pso_exact_score, pso_correct_difference, pso_correct_result, bp_group_correct_1st, bp_group_correct_2nd, bp_group_correct_3rd, bp_group_correct_4th, bp_third_correct_qualifier, bp_third_correct_eliminated, bp_third_all_correct_bonus, bp_r32_correct, bp_r16_correct, bp_qf_correct, bp_sf_correct, bp_third_place_match_correct, bp_final_correct, bp_champion_bonus, bp_penalty_correct',
            )
            .eq('pool_id', id)
            .maybeSingle(),
        ]);
        if (poolRes.error) throw poolRes.error;

        if (cancelled) return;
        const row = poolRes.data as unknown as
          | (DiscoverPoolRow & { max_participants: number | null; max_entries_per_user: number })
          | null;
        if (!row) {
          setError('Pool not found.');
          setLoading(false);
          return;
        }

        const [[card], { count: memberRowCount }, joinedRes] = await Promise.all([
          toDiscoverPools([row]),
          // ⚠ ONLY FOR A PRIVATE POOL YOU ARE IN. A non-member counting
          // `pool_members` always gets 0 (members-only policy), which is why
          // public pools are counted by migration 184's function instead.
          row.is_private
            ? supabase.from('pool_members').select('*', { count: 'exact', head: true }).eq('pool_id', id)
            : Promise.resolve({ count: null }),
          userData
            ? supabase
                .from('pool_members')
                .select('*', { count: 'exact', head: true })
                .eq('pool_id', id)
                .eq('user_id', (userData as { user_id: string }).user_id)
            : Promise.resolve({ count: 0 }),
        ]);

        if (cancelled) return;
        setPool(row.is_private ? { ...card, memberCount: memberRowCount ?? 0 } : card);
        setMeta({
          maxParticipants: row.max_participants,
          maxEntriesPerUser: row.max_entries_per_user,
          isPrivate: row.is_private,
        });
        setAlreadyJoined((joinedRes.count ?? 0) > 0);
        setSettings((settingsRes.data as PoolSettingsRow | null) ?? null);
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
    if (!pool || joining) return;
    setJoining(true);
    try {
      await joinPool(pool.poolCode);
      // Refresh Home / Pools cards so the new pool appears immediately
      // when the user navigates back to those tabs later.
      void refreshHomeData();
      // Replace the discover-preview modal with the pool's leaderboard so
      // tapping back doesn't return to the modal (the user already joined).
      router.replace(`/pool/${pool.poolId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join pool.');
    } finally {
      setJoining(false);
    }
  }

  async function handleShare() {
    if (!pool) return;
    await Share.share(shareMessage(pool));
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.snow, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (error || !pool || !meta) {
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

  const steps = howItWorks(pool, new Date());
  if (meta.maxEntriesPerUser > 1) steps.push(`You can have up to ${meta.maxEntriesPerUser} entries in this pool.`);
  if (meta.maxParticipants && meta.maxParticipants > 0) {
    steps.push(`Open to ${meta.maxParticipants} players — ${pool.memberCount} so far.`);
  }
  const leagueCards = leaguePointsCards(pool, settings);
  const isWorldCup = pool.predictionMode !== null && WORLD_CUP_MODES.has(pool.predictionMode);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: theme.spacing.xl,
          paddingRight: theme.spacing.lg,
          // iOS: the modal presentation provides its own safe inset above the
          // card. Android: the modal renders edge-to-edge under the status bar.
          paddingTop: Platform.OS === 'android' ? insets.top + theme.spacing.md : theme.spacing.lg,
          paddingBottom: theme.spacing.xs,
        }}
      >
        <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, letterSpacing: 1.4, color: theme.colors.slate }}>
          {meta.isPrivate ? 'POOL' : 'PUBLIC POOL'}
        </RNText>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.mist,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Icon name="xmark" size={15} color="slate" weight="bold" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.sm,
          paddingBottom: 120 + insets.bottom,
          gap: theme.spacing.lg,
        }}
      >
        <DiscoverPoolCard pool={pool} variant="hero" />

        {steps.length ? (
          <Section label="How it works">
            <WhiteCard>
              <View style={{ paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, gap: theme.spacing.md }}>
                {steps.map((line, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: withOpacity(theme.colors.primary, 0.12),
                      }}
                    >
                      <RNText style={{ fontFamily: fontFamilies.black, fontSize: 12, color: theme.colors.primary }}>
                        {i + 1}
                      </RNText>
                    </View>
                    <Text variant="body" style={{ flex: 1, color: theme.colors.ink }}>
                      {line}
                    </Text>
                  </View>
                ))}
              </View>
            </WhiteCard>
          </Section>
        ) : null}

        {leagueCards
          ? leagueCards.map((card) => <PointsSection key={card.title} card={card} />)
          : null}

        {isWorldCup && settings ? <WorldCupScoring mode={pool.predictionMode!} settings={settings} /> : null}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          flexDirection: 'row',
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.md + insets.bottom,
          backgroundColor: theme.colors.snow,
          borderTopWidth: theme.borders.thin,
          borderTopColor: withOpacity(theme.colors.silver, 0.4),
        }}
      >
        <Pressable
          onPress={handleShare}
          accessibilityRole="button"
          accessibilityLabel="Share this pool"
          style={({ pressed }) => ({
            width: 54,
            height: 54,
            borderRadius: 27,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.mist,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Icon name="square.and.arrow.up" color="ink" size={20} weight="semibold" />
        </Pressable>
        <Pressable
          onPress={
            alreadyJoined
              ? () => {
                  router.back();
                  setTimeout(() => router.navigate(`/pool/${pool.poolId}`), 250);
                }
              : handleJoin
          }
          disabled={joining}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flex: 1,
            height: 54,
            borderRadius: 27,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.primary,
            opacity: joining ? 0.6 : pressed ? 0.85 : 1,
          })}
        >
          {joining ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <RNText style={{ fontFamily: fontFamilies.black, fontSize: 17, color: '#FFFFFF' }}>
              {alreadyJoined ? 'Go to pool' : 'Join pool'}
            </RNText>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 12,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: theme.colors.slate,
          paddingHorizontal: theme.spacing.xs,
        }}
      >
        {label}
      </RNText>
      {children}
    </View>
  );
}

function WhiteCard({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: 20,
        borderCurve: 'continuous',
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

function PointsSection({ card }: { card: PointsCard }) {
  const theme = useTheme();
  return (
    <Section label={card.title}>
      <WhiteCard>
        {card.rows.map((row, i) => (
          <View key={row.label}>
            {i > 0 ? (
              <View
                style={{
                  height: theme.borders.thin,
                  marginLeft: theme.spacing.lg,
                  backgroundColor: withOpacity(theme.colors.silver, 0.4),
                }}
              />
            ) : null}
            <PointsRow label={row.label} points={row.points} />
          </View>
        ))}
      </WhiteCard>
      {card.footnote ? (
        <Text variant="caption" color="slate" style={{ paddingHorizontal: theme.spacing.xs }}>
          {card.footnote}
        </Text>
      ) : null}
    </Section>
  );
}

function PointsRow({ label, points }: { label: string; points: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        minHeight: 46,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
      }}
    >
      <RNText style={{ flex: 1, fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.ink }}>{label}</RNText>
      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 15,
          fontWeight: '700',
          color: theme.colors.primary,
        }}
      >
        {points}
      </RNText>
    </View>
  );
}

/**
 * The World Cup modes' scoring, as this screen always drew it — kept for a
 * tournament pool, which is the only kind it was ever right for.
 */
function WorldCupScoring({ mode, settings }: { mode: string; settings: PoolSettingsRow }) {
  const theme = useTheme();
  const cards: PointsCard[] =
    mode === 'bracket_picker'
      ? // Bracket Picker mode has no per-match scoring — points come from
        // correct group positions, third-place predictions, knockout winners,
        // the champion pick, and (optionally) penalty calls. Mirrors the
        // DEFAULTS in lib/bracketPickerScoring.ts, which apply when the admin
        // hasn't overridden them in pool_settings.
        [
          {
            title: 'Group positions',
            rows: [
              { label: 'Correct 1st place', points: settings.bp_group_correct_1st ?? 4 },
              { label: 'Correct 2nd place', points: settings.bp_group_correct_2nd ?? 3 },
              { label: 'Correct 3rd place', points: settings.bp_group_correct_3rd ?? 2 },
              { label: 'Correct 4th place', points: settings.bp_group_correct_4th ?? 1 },
            ],
          },
          {
            title: 'Third-place qualifiers',
            rows: [
              { label: 'Correct qualifier', points: settings.bp_third_correct_qualifier ?? 2 },
              { label: 'Correct elimination', points: settings.bp_third_correct_eliminated ?? 1 },
              { label: 'All correct bonus', points: settings.bp_third_all_correct_bonus ?? 10 },
            ],
          },
          {
            title: 'Knockout winners',
            rows: [
              { label: 'Round of 32', points: settings.bp_r32_correct ?? 1 },
              { label: 'Round of 16', points: settings.bp_r16_correct ?? 2 },
              { label: 'Quarter-final', points: settings.bp_qf_correct ?? 4 },
              { label: 'Semi-final', points: settings.bp_sf_correct ?? 8 },
              { label: 'Third-place match', points: settings.bp_third_place_match_correct ?? 10 },
              { label: 'Final', points: settings.bp_final_correct ?? 20 },
            ],
          },
          {
            title: 'Bonus picks',
            rows: [
              { label: 'Champion bonus', points: settings.bp_champion_bonus ?? 50 },
              { label: 'Correct penalty call', points: settings.bp_penalty_correct ?? 1 },
            ],
          },
        ]
      : [
          // A "Knockout Stage" card once sat here reading knockout_*, which
          // migration 042 retired. Knockout matches score off these same group
          // values, scaled by the round multiplier.
          {
            title: 'Points per match',
            rows: [
              { label: 'Exact score', points: settings.group_exact_score },
              { label: 'Correct difference', points: settings.group_correct_difference },
              { label: 'Correct result', points: settings.group_correct_result },
            ],
          },
          ...(settings.pso_enabled
            ? [
                {
                  title: 'Penalty shootout',
                  rows: [
                    ...(settings.pso_exact_score !== null ? [{ label: 'Exact score', points: settings.pso_exact_score }] : []),
                    ...(settings.pso_correct_difference !== null
                      ? [{ label: 'Correct difference', points: settings.pso_correct_difference }]
                      : []),
                    ...(settings.pso_correct_result !== null
                      ? [{ label: 'Correct result', points: settings.pso_correct_result }]
                      : []),
                  ],
                },
              ]
            : []),
        ];
  return (
    <View style={{ gap: theme.spacing.lg }}>
      {cards.map((card) => (
        <PointsSection key={card.title} card={card} />
      ))}
    </View>
  );
}
