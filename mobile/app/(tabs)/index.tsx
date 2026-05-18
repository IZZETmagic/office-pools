import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useRef } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import {
  CountdownHero,
  EmptyHome,
  HomeHeader,
  InviteFriendsBanner,
  LiveMatchCard,
  NextKickoffCard,
  PoolCard,
  PredictionsAlertBanner,
  QuickStats,
  UpcomingMatchCard,
} from '@/components/home';
import { PoolCreateJoinSheet, type PoolCreateJoinSheetHandle } from '@/components/pools';
import { useHomeData } from '@/lib/HomeDataProvider';
import type { MatchSummary, PoolSummary } from '@/lib/useHomeData';
import { useTheme } from '@/theme';

export default function HomeScreen() {
  const theme = useTheme();
  const { data, loading, refreshing, error, refresh, refreshIfStale } = useHomeData();
  const tabBarHeight = useBottomTabBarHeight();
  const initialFocus = useRef(true);
  // Create/Join sheet opened from the "+" in HomeHeader. Mounted at the
  // screen root so the gorhom sheet positions from the bottom of the
  // device rather than the header's bounds.
  const createJoinSheetRef = useRef<PoolCreateJoinSheetHandle | null>(null);
  // Use the staleness-checked refresh on tab focus so quick tab switches
  // don't re-fetch (no spinner flicker). Manual pull-to-refresh still uses
  // the unconditional `refresh`.
  const refreshIfStaleRef = useRef(refreshIfStale);
  refreshIfStaleRef.current = refreshIfStale;

  useFocusEffect(
    useCallback(() => {
      if (initialFocus.current) {
        initialFocus.current = false;
        return;
      }
      refreshIfStaleRef.current();
    }, []),
  );

  if (loading && !data) {
    return (
      <SafeAreaView
        edges={['top', 'left', 'right']}
        style={{ flex: 1, backgroundColor: theme.colors.snow }}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error && !data) {
    return (
      <SafeAreaView
        edges={['top', 'left', 'right']}
        style={{ flex: 1, backgroundColor: theme.colors.snow }}
      >
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
            gap: theme.spacing.lg,
          }}
        >
          <Text variant="sectionHeader" align="center">
            Couldn&apos;t load home
          </Text>
          <Text variant="body" color="slate" align="center">
            {error}
          </Text>
          <Button title="Try Again" onPress={refresh} />
        </View>
      </SafeAreaView>
    );
  }

  const pools = data?.pools ?? [];
  const hasPools = pools.length > 0;
  const poolsNeedingPredictions = pools.filter((p) => p.needsPredictions);
  const inviteTarget =
    pools.find((p) => p.role === 'admin' && p.memberCount < 4) ?? null;

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: theme.colors.snow }}
    >
      <HomeHeader
        fullName={data?.fullName ?? null}
        onMenuPress={() => createJoinSheetRef.current?.open()}
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.md,
          paddingBottom: tabBarHeight + theme.spacing.xl,
          gap: theme.spacing.xl,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />
        }
      >
        {hasPools ? (
          <QuickStats
            bestStreak={data?.bestStreak ?? 0}
            bestRank={data?.bestRank ?? null}
            totalPoints={data?.totalPoints ?? 0}
          />
        ) : null}

        <HomeTournamentSection
          liveMatches={data?.liveMatches ?? []}
          nextMatch={data?.nextMatch ?? null}
          matchesToday={data?.matchesToday ?? 0}
          daysUntilKickoff={data?.daysUntilKickoff ?? 0}
        />

        {poolsNeedingPredictions.length > 0 ? (
          <PredictionsAlertBanner
            count={poolsNeedingPredictions.length}
            onPress={() =>
              router.navigate({
                pathname: '/(tabs)/pools',
                params: { filter: 'pending' },
              })
            }
          />
        ) : null}

        {hasPools ? (
          <YourPoolsSection pools={pools} />
        ) : (
          <View style={{ minHeight: 500 }}>
            <EmptyHome />
          </View>
        )}

        {inviteTarget ? <InviteFriendsBanner pool={inviteTarget} /> : null}

        {(data?.upcomingMatches.length ?? 0) > 0 ? (
          <View style={{ gap: theme.spacing.md }}>
            <Text variant="sectionHeader">Upcoming Matches</Text>
            <View style={{ gap: theme.spacing.sm }}>
              {(data?.upcomingMatches ?? []).map((m) => (
                <UpcomingMatchCard
                  key={m.matchId}
                  match={m}
                  onPress={() => router.push(`/match/${m.matchId}`)}
                />
              ))}
            </View>
          </View>
        ) : null}

      </ScrollView>

      {/* Create/Join action sheet — opened by tapping the "+" in HomeHeader.
          Mounted at the screen root for proper gorhom bottom-sheet positioning. */}
      <PoolCreateJoinSheet ref={createJoinSheetRef} />
    </SafeAreaView>
  );
}

function HomeTournamentSection({
  liveMatches,
  nextMatch,
  matchesToday,
  daysUntilKickoff,
}: {
  liveMatches: MatchSummary[];
  nextMatch: MatchSummary | null;
  matchesToday: number;
  daysUntilKickoff: number;
}) {
  const theme = useTheme();

  if (liveMatches.length > 0) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <Text variant="sectionHeader">Live Now</Text>
        <View style={{ gap: theme.spacing.md }}>
          {liveMatches.map((m) => (
            <LiveMatchCard
              key={m.matchId}
              match={m}
              onPress={() => router.push(`/match/${m.matchId}`)}
            />
          ))}
        </View>
      </View>
    );
  }

  if (daysUntilKickoff > 0) {
    return <CountdownHero daysUntilKickoff={daysUntilKickoff} />;
  }

  if (nextMatch) {
    return (
      <NextKickoffCard
        match={nextMatch}
        matchesToday={matchesToday}
        onPress={() => router.push(`/match/${nextMatch.matchId}`)}
      />
    );
  }

  return null;
}

function YourPoolsSection({ pools }: { pools: PoolSummary[] }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Text variant="sectionHeader">Your Pools</Text>
        <Text variant="caption" color="slate">
          {pools.length}
        </Text>
      </View>

      <FlatList
        data={pools}
        keyExtractor={(item) => item.poolId}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -theme.spacing.xl }}
        contentContainerStyle={{
          gap: theme.spacing.md,
          paddingLeft: theme.spacing.xl,
          paddingRight: theme.spacing.xl,
        }}
        renderItem={({ item }) => (
          <PoolCard pool={item} onPress={() => router.navigate(`/pool/${item.poolId}`)} />
        )}
      />
    </View>
  );
}
