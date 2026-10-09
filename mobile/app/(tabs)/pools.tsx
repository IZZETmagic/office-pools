import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  DiscoverFilterSheet,
  DiscoverFilters,
  DiscoverList,
  EmptyPools,
  JoinPoolSheet,
  type JoinPoolSheetHandle,
  PoolCreateJoinSheet,
  type PoolCreateJoinSheetHandle,
  PoolListItem,
  PoolsFilterSheet,
  type PoolsFilterSheetHandle,
  PoolsHeader,
  PoolsSegment,
  type PoolsTab,
} from '@/components/pools';
import { Button, Icon, Pressable, Text } from '@/components/ui';
import {
  applyDiscoverFilters,
  clearDiscoverFilters,
  countDiscoverFilters,
  DEFAULT_DISCOVER_FILTERS,
  type DiscoverFilters as DiscoverFilterState,
} from '@/lib/discoverFilter';
import { useHomeData } from '@/lib/HomeDataProvider';
import {
  applyFilters,
  clearFilters,
  countActiveFilters,
  DEFAULT_FILTERS,
  type PoolsFilters,
} from '@/lib/poolsFilter';
import { useDiscoverPools } from '@/lib/useDiscoverPools';
import { useManualRefresh } from '@/lib/useManualRefresh';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

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
  // Discover's own filters — separate from My Pools', so choosing a
  // competition there does not quietly narrow your own list.
  const [discoverFilters, setDiscoverFilters] = useState<DiscoverFilterState>(DEFAULT_DISCOVER_FILTERS);
  // Sort-and-filter sheets, one per segment, opened by the header's button.
  const filterSheetRef = useRef<PoolsFilterSheetHandle | null>(null);
  const discoverSheetRef = useRef<PoolsFilterSheetHandle | null>(null);
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

  // Full membership list (all statuses) so the Status filter's Completed
  // option has pools to match. `data.pools` is the active-only subset used
  // by the home dashboard.
  const allPools = data?.allPools ?? [];

  const visiblePools = useMemo(() => applyFilters(allPools, filters), [allPools, filters]);
  const activeFilterCount = countActiveFilters(filters);

  const isMyPools = tab === 'my-pools';
  const hasAnyPools = allPools.length > 0;

  // Discover loads the first time it is shown, then keeps its list.
  const discover = useDiscoverPools({ enabled: !isMyPools });
  const visibleDiscover = useMemo(
    () => applyDiscoverFilters(discover.pools, discoverFilters, discoverSearch),
    [discover.pools, discoverFilters, discoverSearch],
  );
  const discoverFilterCount = countDiscoverFilters(discoverFilters);
  const hasDiscoverPools = discover.pools.length > 0;

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
      <PoolsSegment
        active={tab}
        onChange={setTab}
        filter={
          isMyPools
            ? hasAnyPools
              ? {
                  activeCount: activeFilterCount,
                  sortChanged: filters.sort !== DEFAULT_FILTERS.sort,
                  onPress: () => filterSheetRef.current?.open(),
                }
              : null
            : hasDiscoverPools
              ? {
                  activeCount: discoverFilterCount,
                  sortChanged: discoverFilters.sort !== DEFAULT_DISCOVER_FILTERS.sort,
                  onPress: () => discoverSheetRef.current?.open(),
                }
              : null
        }
      />
      {/* ⚠ THE FILTERS LIVE IN A SHEET NOW, so the list must say when it is
          narrowed. Without this line a filtered list reads as "all my pools" —
          most of all when Home's "needs predictions" card lands here with
          `?filter=pending` already applied. */}
      {isMyPools && hasAnyPools && activeFilterCount > 0 ? (
        <FilteredSummary
          shown={visiblePools.length}
          total={allPools.length}
          onClear={() => setFilters(clearFilters(filters))}
        />
      ) : null}
      {!isMyPools ? (
        <DiscoverFilters search={discoverSearch} onSearchChange={setDiscoverSearch} />
      ) : null}
      {/* Below the search box on Discover, because the count includes it. */}
      {!isMyPools && hasDiscoverPools && discoverFilterCount > 0 ? (
        <FilteredSummary
          shown={visibleDiscover.length}
          total={discover.pools.length}
          onClear={() => setDiscoverFilters(clearDiscoverFilters(discoverFilters))}
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
            <NoFilterMatch onClear={() => setFilters(clearFilters(filters))} />
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
          <DiscoverList
            pools={visibleDiscover}
            loading={discover.loading}
            error={discover.error}
            narrowed={discoverSearch.trim() !== '' || discoverFilterCount > 0}
          />
        )}
      </ScrollView>
        </>
      )}

      {/* Sort-and-filter sheet. It opens in its own Modal so it rises over
          the tab bar; every tap writes straight to `filters`, so the list
          behind it is live. */}
      <PoolsFilterSheet
        ref={filterSheetRef}
        pools={allPools}
        filters={filters}
        onChange={setFilters}
      />
      <DiscoverFilterSheet
        ref={discoverSheetRef}
        pools={discover.pools}
        filters={discoverFilters}
        onChange={setDiscoverFilters}
      />

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

/**
 * "Showing 2 of 12 pools · Clear" — under the header row whenever a filter is
 * narrowing the list. Sort alone does not count: it hides nothing.
 */
function FilteredSummary({
  shown,
  total,
  onClear,
}: {
  shown: number;
  total: number;
  onClear: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.xl,
        paddingTop: theme.spacing.sm,
      }}
    >
      <Text style={{ fontFamily: fontFamilies.bold, fontSize: 13, color: theme.colors.slate }}>
        Showing {shown} of {total} {total === 1 ? 'pool' : 'pools'}
      </Text>
      <Pressable onPress={onClear} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear filters">
        <Text style={{ fontFamily: fontFamilies.black, fontSize: 13, color: theme.colors.red }}>Clear</Text>
      </Pressable>
    </View>
  );
}
