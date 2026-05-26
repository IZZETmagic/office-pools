import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  DEFAULT_FILTERS,
  DiscoverFilters,
  DiscoverList,
  EmptyPools,
  JoinPoolSheet,
  type JoinPoolSheetHandle,
  PoolCreateJoinSheet,
  type PoolCreateJoinSheetHandle,
  PoolListItem,
  PoolsFilterBar,
  PoolsFilterSheet,
  type PoolsFilterSheetHandle,
  PoolsHeader,
  PoolsSegment,
  type DiscoverModeFilter,
  type PoolsFilters,
  type PoolsTab,
} from '@/components/pools';
import { Button, Icon, Text } from '@/components/ui';
import { useHomeData } from '@/lib/HomeDataProvider';
import { useManualRefresh } from '@/lib/useManualRefresh';
import type { PoolSummary } from '@/lib/useHomeData';
import { useTheme, withOpacity } from '@/theme';

export default function PoolsScreen() {
  const theme = useTheme();
  const { data, loading, error, refresh, refreshIfStale } = useHomeData();
  // Pull-to-refresh: spinner bound to user gesture only.
  const { refreshing, onRefresh } = useManualRefresh(refresh);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  // Tab-focus refresh only re-fetches if the cached data is stale (>30s),
  // so flipping back to this tab after a quick detour is instant.
  const refreshIfStaleRef = useRef(refreshIfStale);
  refreshIfStaleRef.current = refreshIfStale;
  const initialFocus = useRef(true);
  const [tab, setTab] = useState<PoolsTab>('my-pools');
  const [filters, setFilters] = useState<PoolsFilters>(DEFAULT_FILTERS);
  const [discoverSearch, setDiscoverSearch] = useState('');
  const [discoverMode, setDiscoverMode] = useState<DiscoverModeFilter>('all');
  // Filter sheet ref — mounted at the screen root (below) so the bottom
  // sheet positions from the bottom of the device, not from inside the
  // filter bar's bounds. The bar invokes `onOpenSheet(config)` which we
  // delegate to `sheetRef.current?.open(config)`.
  const filterSheetRef = useRef<PoolsFilterSheetHandle | null>(null);
  // Create/Join sheet ref — opened from the "+" button in PoolsHeader.
  const createJoinSheetRef = useRef<PoolCreateJoinSheetHandle | null>(null);
  // Join-pool input sheet — opened either from PoolCreateJoinSheet's
  // "Join with Code" row or from EmptyPools' button.
  const joinPoolSheetRef = useRef<JoinPoolSheetHandle | null>(null);

  // The dashboard's "X pools need predictions" card navigates here with
  // `?filter=pending`. Apply that to the filter state once on mount, then
  // clear the param so navigating away and back doesn't re-trigger it.
  // Mirrors iOS's `applyPendingFilter` binding pattern.
  const params = useLocalSearchParams<{ filter?: string }>();
  useEffect(() => {
    if (params.filter === 'pending') {
      setFilters((prev) => ({ ...prev, predictions: 'pending' }));
      router.setParams({ filter: undefined });
    }
  }, [params.filter]);

  useFocusEffect(
    useCallback(() => {
      if (initialFocus.current) {
        initialFocus.current = false;
        return;
      }
      refreshIfStaleRef.current();
    }, []),
  );

  const allPools = data?.pools ?? [];

  const visiblePools = useMemo(() => applyFilters(allPools, filters), [allPools, filters]);

  const isMyPools = tab === 'my-pools';
  const hasAnyPools = allPools.length > 0;

  const headerTitlePrefix = isMyPools ? 'Your' : 'Discover';
  const headerSubtitle = isMyPools ? 'Where the banter begins' : 'Find a pool to join';

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: theme.colors.snow }}
    >
      <PoolsHeader
        titlePrefix={headerTitlePrefix}
        titleAccent="Pools"
        subtitle={headerSubtitle}
        showMenu={isMyPools}
        onMenuPress={() => createJoinSheetRef.current?.open()}
      />
      {/* Loading / error states live below the header so the header
          doesn't pop in when data lands. Segment + filter bar are also
          gated so they don't flash before there's anything to filter. */}
      {loading && !data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : error && !data ? (
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
            Couldn&apos;t load pools
          </Text>
          <Text variant="body" color="slate" align="center">
            {error}
          </Text>
          <Button title="Try Again" onPress={refresh} />
        </View>
      ) : (
        <>
      <PoolsSegment active={tab} onChange={setTab} />
      {isMyPools && hasAnyPools ? (
        <PoolsFilterBar
          filters={filters}
          onChange={setFilters}
          onOpenSheet={(config) => filterSheetRef.current?.open(config)}
        />
      ) : null}
      {!isMyPools ? (
        <DiscoverFilters
          search={discoverSearch}
          onSearchChange={setDiscoverSearch}
          mode={discoverMode}
          onModeChange={setDiscoverMode}
        />
      ) : null}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.md,
          // Tab bar isn't position:'absolute' so content already sits
          // above it — no useBottomTabBarHeight() (would jump from 0 to
          // ~83 once the custom tab bar measures).
          paddingBottom: theme.spacing.xl,
          gap: theme.spacing.md,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {isMyPools ? (
          !hasAnyPools ? (
            <EmptyPools onJoinPress={() => joinPoolSheetRef.current?.open()} />
          ) : visiblePools.length === 0 ? (
            <NoFilterMatch onClear={() => setFilters(DEFAULT_FILTERS)} />
          ) : (
            visiblePools.map((pool) => (
              <PoolListItem
                key={pool.poolId}
                pool={pool}
                onPress={() => router.navigate(`/pool/${pool.poolId}`)}
              />
            ))
          )
        ) : (
          <DiscoverList search={discoverSearch} mode={discoverMode} />
        )}
      </ScrollView>
        </>
      )}

      {/* Filter picker sheet — mounted as a sibling of the ScrollView at
          the screen root so the @gorhom/bottom-sheet positions itself
          from the BOTTOM OF THE DEVICE rather than from inside the
          filter bar's bounds. PoolsFilterBar invokes onOpenSheet(config)
          when a chip / sort button is tapped. */}
      <PoolsFilterSheet ref={filterSheetRef} />

      {/* Create/Join action sheet — opened by tapping the "+" in
          PoolsHeader. Picking "Join with Code" closes this sheet and
          opens JoinPoolSheet (250ms delay so close + open animations
          sequence cleanly). */}
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

function applyFilters(pools: PoolSummary[], filters: PoolsFilters): PoolSummary[] {
  const next = pools.filter((p) => {
    if (filters.status !== 'all' && p.status !== filters.status) return false;
    if (filters.type !== 'all' && p.predictionMode !== filters.type) return false;
    // `needsPredictions` is the canonical "does the user still have to predict
    // something?" check — for progressive pools it accounts for new open
    // rounds even when `hasSubmittedPredictions` was flipped true by an
    // earlier round. Filter on this so the "Pending" pill matches what the
    // dashboard's predictions-alert card counts.
    if (filters.predictions === 'pending' && !p.needsPredictions) return false;
    if (filters.predictions === 'submitted' && p.needsPredictions) return false;
    return true;
  });

  next.sort((a, b) => {
    // Branded pools always lead — sponsorship rule
    const aBranded = a.brandName ? 0 : 1;
    const bBranded = b.brandName ? 0 : 1;
    if (aBranded !== bBranded) return aBranded - bBranded;

    switch (filters.sort) {
      case 'newest':
        return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
      case 'name':
        return a.poolName.localeCompare(b.poolName);
      case 'points':
        return b.totalPoints - a.totalPoints;
      case 'smart':
      default:
        if (a.needsPredictions !== b.needsPredictions) {
          return a.needsPredictions ? -1 : 1;
        }
        if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
        return a.poolName.localeCompare(b.poolName);
    }
  });

  return next;
}

function NoFilterMatch({ onClear }: { onClear: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.lg,
        paddingVertical: theme.spacing.xxxl,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: theme.radii.xl,
          backgroundColor: withOpacity(theme.colors.primary, 0.08),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="line.3.horizontal.decrease.circle" color="primary" size={28} />
      </View>
      <View style={{ alignItems: 'center', gap: theme.spacing.xs, paddingHorizontal: theme.spacing.xl }}>
        <Text variant="cardTitle" align="center">
          No pools match these filters
        </Text>
        <Text variant="body" color="slate" align="center">
          Try clearing them to see more pools.
        </Text>
      </View>
      <Button title="Clear Filters" variant="secondary" onPress={onClear} />
    </View>
  );
}
