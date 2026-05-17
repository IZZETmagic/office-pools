import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BanterFab,
  BPFormTab,
  FormTab,
  LeaderboardTab,
  MembersTab,
  PoolDetailHeader,
  RoundsTab,
  PoolTabBar,
  PredictionsTab,
  ScoringTab,
  SettingsTab,
  TabPlaceholder,
  getVisiblePoolTabs,
  type PoolTabKey,
} from '@/components/pool-detail';
import { Button, Text } from '@/components/ui';
import { usePoolBanter } from '@/lib/usePoolBanter';
import { usePoolDetail } from '@/lib/usePoolDetail';
import { useTheme } from '@/theme';

export default function PoolDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, refreshing, error, refresh } = usePoolDetail(id);
  const [tab, setTab] = useState<PoolTabKey>('leaderboard');
  const [pageOffset, setPageOffset] = useState(0);
  const { width } = useWindowDimensions();
  const pagerRef = useRef<ScrollView | null>(null);

  // Refresh the leaderboard / pool data whenever the screen regains focus —
  // so an admin point adjustment from the member detail flow is reflected
  // in the leaderboard the moment we navigate back.
  const initialFocus = useRef(true);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useFocusEffect(
    useCallback(() => {
      if (initialFocus.current) {
        initialFocus.current = false;
        return;
      }
      refreshRef.current();
    }, []),
  );

  const banter = usePoolBanter(id);
  const isAdmin = data?.pool.isAdmin ?? false;
  const isProgressive = data?.pool.predictionMode === 'progressive';
  const rawBrandColor = data?.pool.brandColor ?? null;
  const accentColor = rawBrandColor
    ? rawBrandColor.startsWith('#')
      ? rawBrandColor
      : `#${rawBrandColor}`
    : null;
  const visibleTabs = useMemo(
    () => getVisiblePoolTabs(isAdmin, isProgressive),
    [isAdmin, isProgressive],
  );
  const tabIndex = Math.max(0, visibleTabs.indexOf(tab));

  useEffect(() => {
    pagerRef.current?.scrollTo({ x: tabIndex * width, animated: true });
  }, [tabIndex, width]);

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

  if (error || !data) {
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
            gap: theme.spacing.md,
          }}
        >
          <Text variant="sectionHeader" align="center">
            Couldn&apos;t load pool
          </Text>
          {error ? (
            <Text variant="body" color="slate" align="center">
              {error}
            </Text>
          ) : null}
          <Button title="Try Again" onPress={refresh} />
        </View>
      </SafeAreaView>
    );
  }

  const { pool, leaderboard, awards, superlatives, matchdayMvp, matchdayInfo } = data;

  function handleTabTap(next: PoolTabKey) {
    setTab(next);
  }

  function handleMomentumScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    const nextTab = visibleTabs[i];
    if (nextTab && nextTab !== tab) setTab(nextTab);
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width > 0) setPageOffset(e.nativeEvent.contentOffset.x / width);
  }

  function renderTab(key: PoolTabKey) {
    switch (key) {
      case 'leaderboard':
        return (
          <LeaderboardTab
            poolId={pool.poolId}
            entries={leaderboard}
            currentUserId={pool.currentUserId}
            awards={awards}
            superlatives={superlatives}
            matchdayMvp={matchdayMvp}
            matchdayInfo={matchdayInfo}
          />
        );
      case 'predictions':
        return (
          <PredictionsTab
            poolId={pool.poolId}
            maxEntriesPerUser={pool.maxEntriesPerUser}
            predictionMode={pool.predictionMode}
          />
        );
      case 'form':
        return pool.predictionMode === 'bracket_picker' ? (
          <BPFormTab poolId={pool.poolId} />
        ) : (
          <FormTab poolId={pool.poolId} />
        );
      case 'scoring':
        return (
          <ScoringTab
            poolId={pool.poolId}
            predictionMode={pool.predictionMode}
          />
        );
      case 'rounds':
        return <RoundsTab poolId={pool.poolId} />;
      case 'members':
        return <MembersTab poolId={pool.poolId} />;
      case 'settings':
        return (
          <SettingsTab
            pool={pool}
            onSaved={refresh}
            onOpenScoring={() =>
              router.push(
                `/pool/${pool.poolId}/scoring-config${
                  pool.predictionMode === 'bracket_picker' ? '?mode=bracket_picker' : ''
                }`,
              )
            }
          />
        );
    }
  }

  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={{ flex: 1, backgroundColor: theme.colors.snow }}
    >
      {/* Branded headers paint a dark color band behind the status bar; force
          light icons so the clock/battery stay legible. Unmounts when the
          screen leaves and the root-layout's "auto" style takes over again. */}
      {accentColor ? <StatusBar style="light" animated /> : null}
      <PoolDetailHeader pool={pool} />
      <PoolTabBar
        active={tab}
        onChange={handleTabTap}
        isAdmin={pool.isAdmin}
        isProgressive={!!isProgressive}
        pageOffset={pageOffset}
        accentColor={accentColor}
      />
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
      >
        {visibleTabs.map((key) => (
          <ScrollView
            key={key}
            style={{ width }}
            contentContainerStyle={{ paddingBottom: theme.spacing.xxxl, flexGrow: 1 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={accentColor ?? theme.colors.primary}
              />
            }
          >
            {renderTab(key)}
          </ScrollView>
        ))}
      </ScrollView>

      <BanterFab
        unreadCount={banter.unreadCount}
        onPress={() =>
          router.push({
            pathname: '/pool/[id]/banter',
            params: { id: pool.poolId, poolName: pool.poolName },
          })
        }
      />
    </SafeAreaView>
  );
}
