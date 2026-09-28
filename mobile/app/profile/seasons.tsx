// Seasons — opened from the Profile hub.
//
// Every competition you've played, live ones first, each pool in its own
// mode's language. The figures come from `poolCardBlocks`, the same per-mode
// calls the Pools tab card makes, so the two can never disagree — including
// Last Man Standing having no rank at all.
//
// ⚠ ALIGNED COLUMNS, LABELS IN THE HEADER (Ryan, 2026-09-28). Each row used to
// carry its own labels at its own width, so the bold figures zig-zagged down
// the page. Pools are now grouped by mode inside each competition; a group's
// subheader names the two columns once, and every row puts its figures in the
// same two fixed-width, right-aligned slots.
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
import {
  finishMedal,
  groupByMode,
  seasonRowCells,
  type SeasonCell,
  type SeasonModeGroup,
  type SeasonSection,
} from '@/lib/profileHub';
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
      {/* ⚠ ONE CARD PER MODE, not one card per competition with hairlines
          between the modes — a hairline was too faint to tell the groups apart
          (Ryan, 2026-09-28). */}
      <View style={{ gap: theme.spacing.sm }}>
        {groupByMode(section.pools).map((g) => (
          <ModeGroup key={g.key} group={g} />
        ))}
      </View>
    </View>
  );
}

/** Column widths — every row in every group uses the same two, so figures line up down the page. */
const COL_A = 54;
const COL_B = 74;
const CHEVRON = 11;

function ModeGroup({ group }: { group: SeasonModeGroup<PoolSummary> }) {
  const theme = useTheme();
  const chip = getModeChip(group.predictionMode, group.leagueMode, theme.mode === 'dark');
  const headerText = {
    fontFamily: fontFamilies.black,
    fontSize: 9.5,
    letterSpacing: 0.6,
    color: theme.colors.slate,
    textAlign: 'right' as const,
  };

  return (
    <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, overflow: 'hidden' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.md,
          paddingBottom: 6,
        }}
      >
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: chip.ink }} />
          <RNText style={{ ...headerText, textAlign: 'left', color: chip.ink }}>
            {getModeName(group.predictionMode, group.leagueMode).toUpperCase()}
          </RNText>
        </View>
        <RNText style={{ ...headerText, width: COL_A }}>{group.headers[0].toUpperCase()}</RNText>
        <RNText style={{ ...headerText, width: COL_B }}>{group.headers[1].toUpperCase()}</RNText>
        <View style={{ width: CHEVRON }} />
      </View>
      {group.pools.map((p, i) => (
        <View key={p.poolId}>
          {i > 0 ? (
            <View
              style={{
                height: 0.5,
                marginLeft: theme.spacing.md,
                backgroundColor: withOpacity(theme.colors.slate, 0.15),
              }}
            />
          ) : null}
          <PoolRow pool={p} />
        </View>
      ))}
    </View>
  );
}

const MEDAL = { 1: '#F5C518', 2: '#A7B0C4', 3: '#CD7F32' } as const;

function PoolRow({ pool }: { pool: PoolSummary }) {
  const theme = useTheme();
  const finished = pool.status === 'completed';
  const medal = finished ? finishMedal(pool) : null;
  const { cells } = seasonRowCells(pool);

  return (
    <Pressable
      onPress={() => router.push(`/pool/${pool.poolId}`)}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.md - 2,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        {medal ? (
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: MEDAL[medal],
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RNText style={{ fontFamily: fontFamilies.black, fontSize: 11, color: '#fff' }}>{medal}</RNText>
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 1 }}>
          <RNText numberOfLines={1} style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}>
            {pool.poolName}
          </RNText>
          <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, color: theme.colors.slate }}>
            {pool.memberCount} {pool.memberCount === 1 ? 'member' : 'members'}
          </RNText>
        </View>
      </View>
      <Cell cell={cells[0]} width={COL_A} />
      <Cell cell={cells[1]} width={COL_B} />
      <Icon name="chevron.right" tint={theme.colors.slate} size={CHEVRON} weight="semibold" />
    </Pressable>
  );
}

function Cell({ cell, width }: { cell: SeasonCell; width: number }) {
  const theme = useTheme();
  return (
    <View style={{ width, alignItems: 'flex-end' }}>
      <RNText
        numberOfLines={1}
        style={{
          fontFamily: fontFamilies.black,
          fontSize: 15,
          fontVariant: ['tabular-nums'],
          color: cell.muted ? theme.colors.slate : theme.colors.ink,
        }}
      >
        {cell.value}
      </RNText>
      {/* Always drawn, so a row with no sub-line keeps the same height as its neighbours. */}
      <RNText numberOfLines={1} style={{ fontFamily: fontFamilies.medium, fontSize: 10.5, color: theme.colors.slate }}>
        {cell.sub ?? ' '}
      </RNText>
    </View>
  );
}
