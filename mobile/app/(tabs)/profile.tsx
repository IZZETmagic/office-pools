// The Profile tab — a hub.
//
// Header and avatar card on top (unchanged), then four doors, then the
// settings rows in plain view. The tab fits on one screen; everything with
// depth lives on the page its door opens.
//
// ⭐ Why a hub (2026-09-28): the old tab stacked Pool Performance, Prediction
// Accuracy and an inline Trophy Case, and each was World-Cup-shaped — it
// summed points across modes, folded Table / LMS / Showdown into an
// exact-score vocabulary, and one of its three rings repeated another. The
// replacement pages each speak one mode's language, or none.
//
// The doors:
//   · Seasons          — app/profile/seasons.tsx
//   · Trophy Room      — app/profile/trophies.tsx
//   · Scouting Report  — app/profile/scouting.tsx (needs /api/me/scouting)
//   · My Crews         — app/profile/crews/ (Crews, 2026-10-02). Groups,
//                        never people: there is no friends list. Still no
//                        derived or suggested crews (Ryan, 2026-09-28).
//
// Settings are tiles too — Account, Notifications, Archived Pools, Help — in
// the same grid, after the four feature doors. Sign Out and Delete Account
// live one level down, inside Account.

import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useMemo, useRef } from 'react';
import { RefreshControl, ScrollView, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarCard } from '@/components/avatar/AvatarCard';
import {
  JoinPoolSheet,
  type JoinPoolSheetHandle,
  PoolCreateJoinSheet,
  type PoolCreateJoinSheetHandle,
  PoolsHeader,
} from '@/components/pools';
import { HubTile } from '@/components/profile/HubTile';
import { DividedList, SectionWrapper, SettingsRow } from '@/components/settings';
import { useHomeData } from '@/lib/HomeDataProvider';
import { crewsTeaser } from '@/lib/crews';
import { groupSeasons, seasonsTeaser, trophyTeaser, versionLabel } from '@/lib/profileHub';
import { useMyCrews } from '@/lib/useCrews';
import { useArchivedPools } from '@/lib/useArchivedPools';
import { useManualRefresh } from '@/lib/useManualRefresh';
import { usePodium } from '@/lib/usePodium';
import { useTrophies } from '@/lib/useTrophies';
import { fontFamilies, useTheme } from '@/theme';

type Row = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
};

export default function ProfileScreen() {
  const theme = useTheme();
  const { data, refresh } = useHomeData();
  const trophies = useTrophies();
  const podium = usePodium();
  const { rows: archived, loading: archivedLoading } = useArchivedPools();
  const { data: myCrews } = useMyCrews();

  // Pull-to-refresh: spinner bound to real user gesture only. Refreshes the
  // badge count alongside the pools, since the avatar card shows both.
  const { refreshing, onRefresh } = useManualRefresh(() =>
    Promise.all([refresh(), trophies.refresh()]),
  );
  // Create / Join pool sheets — opened by the "+" button in the header.
  const createJoinSheetRef = useRef<PoolCreateJoinSheetHandle | null>(null);
  const joinPoolSheetRef = useRef<JoinPoolSheetHandle | null>(null);

  const pools = useMemo(() => data?.pools ?? [], [data?.pools]);
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

  // Competition names are not needed for a count, so the hub groups without
  // the extra tournaments read the Seasons page makes.
  const seasonSections = useMemo(
    () =>
      data && archived
        ? groupSeasons(data.allPools, [], new Set(archived.map((a) => a.poolId)))
        : null,
    [data, archived],
  );

  const archivedSubtitle = archivedLoading
    ? 'Checking…'
    : archived && archived.length > 0
      ? `${archived.length} archived`
      : 'None archived';

  /**
   * Every door on the hub, features first, then settings — two per row.
   *
   * ⭐ SETTINGS ARE TILES TOO (Ryan, 2026-09-28): a tile each for Account,
   * Notifications, Archived Pools and Help, in place of the list that used to
   * sit under the grid. Their icons take the neutral `slate` tint so they read
   * as settings rather than as features, without a second visual system.
   * A tile with no `onPress` is a page not built yet ("Soon").
   */
  const hubTiles: {
    id: string;
    icon: string;
    title: string;
    teaser: string | null;
    tint: string;
    onPress?: () => void;
  }[] = [
    {
      id: 'seasons',
      icon: 'calendar',
      title: 'Seasons',
      teaser: seasonsTeaser(seasonSections),
      tint: theme.colors.primary,
      onPress: () => router.push('/profile/seasons'),
    },
    {
      id: 'trophies',
      icon: 'trophy.fill',
      title: 'Trophy Room',
      teaser: trophies.error ? 'Your badges' : trophyTeaser(trophies.total, podium?.first ?? null),
      tint: theme.colors.amber,
      onPress: () => router.push('/profile/trophies'),
    },
    {
      id: 'scouting',
      icon: 'binoculars',
      title: 'Scouting Report',
      teaser: 'How you pick, across every league pool',
      tint: theme.colors.green,
      onPress: () => router.push('/profile/scouting'),
    },
    {
      id: 'crews',
      icon: 'person.3.fill',
      title: 'My Crews',
      // ⚠ Falls back to the generic line while loading, on error, and with no crews — the API
      // answers 404 until it deploys, and a tile must never say something false.
      teaser: crewsTeaser(myCrews ?? null),
      tint: theme.colors.red,
      onPress: () => router.push('/profile/crews'),
    },
    {
      id: 'account',
      icon: 'person.crop.circle.fill',
      title: 'Account',
      teaser: 'Password and sign out',
      tint: theme.colors.slate,
      onPress: () => router.push('/settings/account'),
    },
    {
      id: 'notifications',
      icon: 'bell.fill',
      title: 'Notifications',
      teaser: 'Push alerts and email',
      tint: theme.colors.slate,
      onPress: () => router.push('/settings/notifications'),
    },
    {
      id: 'archived',
      icon: 'archivebox.fill',
      title: 'Archived Pools',
      teaser: archivedSubtitle,
      tint: theme.colors.slate,
      onPress: () => router.push('/settings/archived-pools'),
    },
    {
      id: 'help',
      icon: 'questionmark.circle.fill',
      title: 'Help & Legal',
      teaser: 'FAQs, privacy, terms and contact',
      tint: theme.colors.slate,
      onPress: () => router.push('/settings/help'),
    },
  ];
  const tileRows = hubTiles.reduce<(typeof hubTiles)[]>((rows, tile, i) => {
    if (i % 2 === 0) rows.push([tile]);
    else rows[rows.length - 1].push(tile);
    return rows;
  }, []);

  /**
   * Dev-only doors into the two Showdown review surfaces. They exist because
   * deep links do not reach a physical device, and this machine has no
   * simulator. ⚠⚠ `__DEV__` IS LOAD-BEARING — these carry fixture data (a duel
   * against a "Priya" who is in nobody's pool), and Metro strips the branch
   * from a production bundle only because the check is a literal `__DEV__`.
   */
  const devRows: Row[] = [
    {
      id: 'dev-phases',
      icon: 'flame.fill',
      title: 'Showdown phase harness',
      subtitle: 'All six phases on demand, from fixtures',
      onPress: () => router.push('/showdown-phase-harness'),
    },
    {
      id: 'dev-reveal',
      icon: 'sparkles',
      title: 'Reveal playground',
      subtitle: 'The 2026-06-27 motion-spec scrubber',
      onPress: () => router.push('/showdown-reveal-playground'),
    },
    {
      id: 'dev-onboarding',
      icon: 'person.crop.circle',
      title: 'Onboarding concepts',
      subtitle: 'Eight takes on push + avatar — nothing writes',
      onPress: () => router.push('/onboarding-harness'),
    },
    {
      id: 'dev-crews',
      icon: 'person.3.fill',
      title: 'My Crews concept',
      subtitle: 'The nine decisions of 2 Oct — fixtures, nothing saves',
      onPress: () => router.push('/crews-concept'),
    },
    {
      id: 'dev-onboarding-flow',
      icon: 'sparkles',
      title: 'Onboarding journey',
      subtitle: '⚠ Builds a real avatar — the picker and board are the live ones',
      onPress: () => router.push('/onboarding-flow'),
    },
  ];

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
        {/* The avatar card, unchanged. Its third stat was "Total Points" — a sum
            across modes (duel points + table points + World Cup points), which
            means nothing — and is now Badges (Ryan, 2026-09-28). */}
        <AvatarCard
          fullName={data?.fullName ?? 'User'}
          username={data?.username ?? ''}
          memberSince={data?.memberSince ? formatMemberSince(data.memberSince) : null}
          initials={initials}
          stats={[
            { label: 'Pools', value: String(pools.length) },
            { label: 'Predictions', value: totalPredictions.toLocaleString() },
            {
              label: 'Badges',
              value: trophies.total === null ? '–' : trophies.total.toLocaleString(),
            },
          ]}
        />

        <View style={{ paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm }}>
          {tileRows.map((row) => (
            <View key={row[0].id} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              {row.map(({ id, ...tile }) => (
                <HubTile key={id} {...tile} />
              ))}
            </View>
          ))}
        </View>

        {__DEV__ ? (
          <SectionWrapper title="Developer">
            <DividedList
              items={devRows}
              keyOf={(i) => i.id}
              render={({ id: _id, ...row }) => <SettingsRow {...row} />}
            />
          </SectionWrapper>
        ) : null}

        <RNText
          style={{
            textAlign: 'center',
            fontFamily: fontFamilies.medium,
            fontSize: 11,
            color: theme.colors.slate,
          }}
        >
          {versionLabel({
            appVersion: Constants.expoConfig?.version,
            runtimeVersion: Updates.runtimeVersion,
            updateId: Updates.updateId,
            isDev: __DEV__,
          })}
        </RNText>
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

function formatMemberSince(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
