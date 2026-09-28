// Seasons — opened from the Profile hub.
//
// Every competition you've played, live ones first, each pool in its own
// mode's language. The figures come from `poolCardBlocks`, the same per-mode
// calls the Pools tab card makes, so the two can never disagree — including
// Last Man Standing having no rank at all.
//
// Finished pools wear a medal when they were a podium finish, by the same
// rules the Trophy Room counts (`podiumFinishes`). Archived pools are left out;
// they have their own row in settings.

import { router } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsHeader } from '@/components/settings';
import { Icon } from '@/components/ui';
import { getModeChip, getModeName } from '@/lib/design/poolMode';
import { finishMedal, seasonRowStats, type SeasonSection } from '@/lib/profileHub';
import { useManualRefresh } from '@/lib/useManualRefresh';
import type { PoolSummary } from '@/lib/useHomeData';
import { useSeasons } from '@/lib/useSeasons';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export default function SeasonsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { sections, refresh } = useSeasons();
  const { refreshing, onRefresh } = useManualRefresh(refresh);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SettingsHeader title="Seasons" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: theme.spacing.md,
          paddingHorizontal: theme.spacing.xl,
          paddingBottom: theme.spacing.xxl + insets.bottom,
          gap: theme.spacing.xl,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
      >
        {sections === null ? (
          <View style={{ padding: theme.spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : sections.length === 0 ? (
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, padding: theme.spacing.xl }}>
            <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate, textAlign: 'center' }}>
              Join a pool and your seasons collect here, one competition at a time.
            </RNText>
          </View>
        ) : (
          sections.map((s) => <Section key={s.tournamentId} section={s} />)
        )}
      </ScrollView>
    </View>
  );
}

function Section({ section }: { section: SeasonSection<PoolSummary> }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm + 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <RNText numberOfLines={1} style={{ flex: 1, fontFamily: fontFamilies.black, fontSize: 17, color: theme.colors.ink }}>
          {section.name}
        </RNText>
        <View
          style={{
            backgroundColor: section.live ? theme.colors.greenLight : theme.colors.mist,
            borderRadius: theme.radii.pill,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.black,
              fontSize: 9.5,
              letterSpacing: 0.6,
              color: section.live ? theme.colors.green : theme.colors.slate,
            }}
          >
            {section.live ? 'IN PROGRESS' : 'FINISHED'}
          </RNText>
        </View>
      </View>
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg }}>
        {section.pools.map((p, i) => (
          <View key={p.poolId}>
            {i > 0 ? (
              <View style={{ height: 0.5, marginHorizontal: theme.spacing.md, backgroundColor: withOpacity(theme.colors.slate, 0.25) }} />
            ) : null}
            <PoolRow pool={p} />
          </View>
        ))}
      </View>
    </View>
  );
}

const MEDAL = { 1: '#F5C518', 2: '#A7B0C4', 3: '#CD7F32' } as const;

function PoolRow({ pool }: { pool: PoolSummary }) {
  const theme = useTheme();
  const finished = pool.status === 'completed';
  const medal = finished ? finishMedal(pool) : null;
  const stats = seasonRowStats(pool);
  const chip = getModeChip(pool.predictionMode, pool.leagueMode, theme.mode === 'dark');

  return (
    <Pressable
      onPress={() => router.push(`/pool/${pool.poolId}`)}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm + 2,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.md - 1,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {medal ? (
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: MEDAL[medal],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RNText style={{ fontFamily: fontFamilies.black, fontSize: 13, color: '#fff' }}>{medal}</RNText>
        </View>
      ) : (
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            backgroundColor: withOpacity(chip.base, chip.tint),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: chip.ink }} />
        </View>
      )}

      <View style={{ flex: 1, gap: 1 }}>
        <RNText numberOfLines={1} style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}>
          {pool.poolName}
        </RNText>
        <RNText numberOfLines={1} style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, color: theme.colors.slate }}>
          {getModeName(pool.predictionMode, pool.leagueMode)} · {pool.memberCount}{' '}
          {pool.memberCount === 1 ? 'member' : 'members'}
        </RNText>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
        {stats.map((st) => (
          <View key={st.label} style={{ alignItems: 'flex-end' }}>
            <RNText
              style={{
                fontFamily: fontFamilies.black,
                fontSize: 14,
                color: st.muted ? theme.colors.slate : theme.colors.ink,
              }}
            >
              {st.value}
            </RNText>
            <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 10, color: theme.colors.slate }}>
              {st.label}
            </RNText>
          </View>
        ))}
        <Icon name="chevron.right" tint={theme.colors.slate} size={11} weight="semibold" />
      </View>
    </Pressable>
  );
}
