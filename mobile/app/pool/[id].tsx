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
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BanterFab,
  BanterSheet,
  type BanterSheetHandle,
  BPFormTab,
  FeesTab,
  FormTab,
  LeaderboardTab,
  MembersTab,
  PoolDetailHeader,
  PoolInfoTab,
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
import { useReportActivePool } from '@/lib/PresenceProvider';
import { useManualRefresh } from '@/lib/useManualRefresh';
import { usePendingActions } from '@/lib/usePendingActions';
import { usePoolBanter } from '@/lib/usePoolBanter';
import { usePoolDetail } from '@/lib/usePoolDetail';
import { useTheme } from '@/theme';

// Tab names accepted via the `?tab=` deep-link param. Anything else
// silently falls back to the leaderboard default — keeps an admin from
// landing on an unknown tab via a stale or malformed link.
const TAB_PARAM_VALUES: PoolTabKey[] = [
  'leaderboard',
  'predictions',
  'form',
  'scoring',
  'info',
  'rounds',
  'members',
  'fees',
  'settings',
];

export default function PoolDetailScreen() {
  const theme = useTheme();
  const { id, tab: tabParam, banter: banterParam } = useLocalSearchParams<{
    id: string;
    tab?: string;
    banter?: string;
  }>();
  const { data, loading, error, refresh } = usePoolDetail(id);
  // Publish "viewing this pool" to app-wide presence — web Banter UIs
  // show this member with an in-this-pool (vs online-elsewhere) dot.
  useReportActivePool(id);
  // Pull-to-refresh: spinner bound to real user gesture only. Background
  // refreshes (useFocusEffect, route-param changes) still call `refresh`
  // directly without surfacing the iOS spinner.
  const { refreshing, onRefresh } = useManualRefresh(refresh);
  // Imperative handle to the banter bottom sheet. Opening is driven
  // from two places: the BanterFab tap (live user action) and the
  // `?banter=open` deep-link param (cold-start from a push tap or any
  // future incoming deep link).
  const banterSheetRef = useRef<BanterSheetHandle | null>(null);
  // Initial tab: read from `?tab=` if present (so the create-pool flow can
  // land admins on settings, etc.), else leaderboard. Only inspected on
  // first render — the user can navigate freely between tabs after that.
  const [tab, setTab] = useState<PoolTabKey>(() => {
    if (tabParam && TAB_PARAM_VALUES.includes(tabParam as PoolTabKey)) {
      return tabParam as PoolTabKey;
    }
    return 'leaderboard';
  });
  // Fractional page offset of the horizontal pager (0 = first tab,
  // 1 = second, etc). Was previously a useState updated by onScroll,
  // which forced a React re-render of the entire pool detail tree at
  // 60fps during every tab swipe/tap — including all mounted tabs and
  // the always-mounted BanterSheet — which tanked the swipe animation.
  // Switched to a Reanimated shared value driven by
  // useAnimatedScrollHandler: pageOffset.value updates run on the UI
  // thread with no React re-render, and PoolTabBar reads it via
  // useAnimatedReaction to drive its pill slide.
  const pageOffset = useSharedValue(0);
  const { width } = useWindowDimensions();
  const pagerRef = useRef<Animated.ScrollView | null>(null);
  // When a tab change originates from a swipe, the pager has already
  // physically settled at the target page, so the tabIndex effect's
  // animated scrollTo would re-animate to the spot we're already at —
  // a visible hitch at the end of every swipe. This flag skips that one
  // scrollTo. Pill taps and the ?tab= deep link leave it false, so they
  // still animate the pager (and a width change still repositions).
  const skipPagerScrollRef = useRef(false);

  // UI-thread scroll worklet. Writes the fractional page offset into the
  // shared value on every scroll frame without touching React, so the
  // pool detail screen and all its mounted tabs are spared the 60fps
  // re-render that the old setState-based handler caused. Tab snapping
  // is handled separately by the JS-side onMomentumScrollEnd callback —
  // that one fires once per swipe, not per frame, so it stays a normal
  // event handler on the Animated.ScrollView.
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      'worklet';
      if (width > 0) pageOffset.value = e.contentOffset.x / width;
    },
  });

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

  // Auto-acknowledge pending actions when the user navigates to the relevant
  // tab. The `acknowledged_at` flip on user_pending_actions clears the tab
  // dot, pool card dot, bottom-tab dot, and decrements the OS app icon
  // badge — but leaves `completed_at` alone, so per-cell dots inside the
  // tab persist until the user taps the specific cell.
  //
  // - Form tab → badge_unlock + level_up notifications for this pool
  // - Predictions tab → deadline_warning notifications for this pool
  // - Other tabs → no associated action types in this alpha
  //
  // We deliberately don't acknowledge on screen mount, only on tab visit,
  // so an admin briefly opening the pool to peek at Leaderboard doesn't
  // accidentally clear Form-tab dots they haven't looked at.
  const pending = usePendingActions();
  const markPoolActionsAcknowledgedRef = useRef(pending.markPoolActionsAcknowledged);
  markPoolActionsAcknowledgedRef.current = pending.markPoolActionsAcknowledged;
  useEffect(() => {
    if (!id) return;
    if (tab === 'form') {
      void markPoolActionsAcknowledgedRef.current(id, 'badge_unlock');
      void markPoolActionsAcknowledgedRef.current(id, 'level_up');
    } else if (tab === 'predictions') {
      void markPoolActionsAcknowledgedRef.current(id, 'deadline_warning');
    }
  }, [id, tab]);

  // Honor `?banter=open` deep links — fires from a push-tap cold start
  // (community pushes route here via usePushNotificationHandlers).
  // One-shot: only inspected on initial mount so a back-and-forth
  // through the screen doesn't re-open the sheet on every focus.
  const banterDeepLinkConsumed = useRef(false);
  useEffect(() => {
    if (banterDeepLinkConsumed.current) return;
    if (banterParam !== 'open') return;
    if (!data) return;
    banterDeepLinkConsumed.current = true;
    // BanterSheet wraps a gorhom BottomSheet that initializes its
    // Reanimated internals async — calling `expand()` immediately after
    // the BanterSheet mounts silently no-ops because the inner sheetRef
    // isn't attached yet (the outer forwardRef IS, so the optional
    // chain in useImperativeHandle returns truthy, but the wrapped
    // sheetRef.current?.expand() still sees null).
    //
    // 400ms setTimeout + nested rAF clears the bring-up window AND
    // aligns the open animation with the next paint frame. The user
    // is already mid-cold-start transition (splash → home → pool) so
    // the delay reads as a deliberate animation, not a hang.
    const t = setTimeout(() => {
      requestAnimationFrame(() => {
        banterSheetRef.current?.open();
      });
    }, 400);
    return () => clearTimeout(t);
  }, [banterParam, data]);

  const isAdmin = data?.pool.isAdmin ?? false;
  const isProgressive = data?.pool.predictionMode === 'progressive';
  // Implicit toggle: fee tracking is "on" iff the admin has set a
  // positive entry fee in Settings. Drives both the Fees tab visibility
  // in the tab bar and the Fees & Prize Pool card in PoolInfoTab.
  const feesEnabled = (data?.pool.entryFee ?? 0) > 0;
  const rawBrandColor = data?.pool.brandColor ?? null;
  const accentColor = rawBrandColor
    ? rawBrandColor.startsWith('#')
      ? rawBrandColor
      : `#${rawBrandColor}`
    : null;
  const visibleTabs = useMemo(
    () => getVisiblePoolTabs(isAdmin, isProgressive, feesEnabled),
    [isAdmin, isProgressive, feesEnabled],
  );
  const tabIndex = Math.max(0, visibleTabs.indexOf(tab));

  useEffect(() => {
    if (skipPagerScrollRef.current) {
      // Tab change came from a swipe; the pager is already at tabIndex.
      skipPagerScrollRef.current = false;
      return;
    }
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
    if (nextTab && nextTab !== tab) {
      // The pager already settled at page `i`; suppress the redundant
      // animated scrollTo the tabIndex effect would otherwise fire.
      skipPagerScrollRef.current = true;
      setTab(nextTab);
    }
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
            predictionDeadline={pool.predictionDeadline}
            isAdmin={pool.isAdmin}
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
      case 'info':
        return <PoolInfoTab pool={pool} />;
      case 'rounds':
        return <RoundsTab poolId={pool.poolId} />;
      case 'members':
        return <MembersTab poolId={pool.poolId} />;
      case 'fees':
        return <FeesTab pool={pool} />;
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
        feesEnabled={feesEnabled}
        pageOffset={pageOffset}
        accentColor={accentColor}
        poolId={pool.poolId}
      />
      <Animated.ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
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
                onRefresh={onRefresh}
                tintColor={accentColor ?? theme.colors.primary}
              />
            }
          >
            {renderTab(key)}
          </ScrollView>
        ))}
      </Animated.ScrollView>

      <BanterFab
        unreadCount={banter.unreadCount}
        onPress={() => banterSheetRef.current?.open()}
      />

      {/* Banter chat — gorhom BottomSheetModal so it only mounts via
          Portal when present()'d. When closed, it's entirely absent
          from the tree — no touch interception on the parent screen
          (the original bug was a plain `BottomSheet` at index={-1}
          reserving a full-screen container on Android even though
          visually invisible). */}
      <BanterSheet
        ref={banterSheetRef}
        poolId={pool.poolId}
        poolName={pool.poolName}
      />
    </SafeAreaView>
  );
}
