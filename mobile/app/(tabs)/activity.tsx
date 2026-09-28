import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ActivityCard,
  ActivityFilterChips,
  MatchweekStoryCard,
  MentionCard,
  NeedsYouCard,
} from '@/components/activity';
import {
  JoinPoolSheet,
  type JoinPoolSheetHandle,
  PoolCreateJoinSheet,
  type PoolCreateJoinSheetHandle,
  PoolsHeader,
} from '@/components/pools';
import { Button, Icon, Text } from '@/components/ui';
import { useSharedActivity } from '@/lib/ActivityProvider';
import { groupByDay, matchesFilter, type ActivityFilter } from '@/lib/activityFilters';
import type { ActivityLink } from '@/lib/api';
import { useManualRefresh } from '@/lib/useManualRefresh';
import type { ActivityItem } from '@/lib/useActivity';
import { fontFamilies, useTheme } from '@/theme';

/**
 * A focus within this long of the last fetch reuses it. Needs You has to catch
 * up after a pick is made on another screen, but the route costs ~1.5s and
 * flicking between tabs should not refetch every time.
 */
const FOCUS_REFRESH_MS = 30_000;

function go(link: ActivityLink | undefined): (() => void) | null {
  if (!link) return null;
  return () => router.push(link as never);
}

/**
 * The Activity tab — Needs You, then the history, filterable by chip.
 *
 *   Needs you      open decisions only, never filtered, gone once done
 *   [chips]        All · Results · Rank · Rewards · Mentions (sticky)
 *   Today …        the history in day groups, every row opens its screen
 */
export default function ActivityScreen() {
  const theme = useTheme();
  const { items, needsYou, loading, error, refresh, markSeen } = useSharedActivity();
  // Pull-to-refresh: spinner bound to real user gesture only.
  const { refreshing, onRefresh } = useManualRefresh(refresh);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  // Create / Join pool sheets — opened by the "+" button in the header.
  // Same pattern as the Home and Pools tabs so the user can create or
  // join a pool from any primary tab.
  const createJoinSheetRef = useRef<PoolCreateJoinSheetHandle | null>(null);
  const joinPoolSheetRef = useRef<JoinPoolSheetHandle | null>(null);
  const lastFocusFetchRef = useRef(0);

  // On focus: refresh if stale, THEN mark seen. In that order so the rows that
  // are new on this visit keep their dots while being read — the fetch carries
  // the old seen_at — and the tab dot clears as soon as the tab is opened.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (Date.now() - lastFocusFetchRef.current > FOCUS_REFRESH_MS) {
          lastFocusFetchRef.current = Date.now();
          await refresh();
        }
        if (!cancelled) await markSeen();
      })();
      return () => {
        cancelled = true;
      };
    }, [refresh, markSeen]),
  );

  const unreadMentions = useMemo(
    () => items.filter((i) => i.activityType === 'mention' && !i.isRead).length,
    [items],
  );
  const groups = useMemo(
    () => groupByDay(items.filter((i) => matchesFilter(i, filter))),
    [items, filter],
  );

  const hasAnything = items.length > 0 || needsYou.length > 0;
  const subtitle =
    needsYou.length > 0
      ? `${needsYou.length} thing${needsYou.length === 1 ? '' : 's'} need${needsYou.length === 1 ? 's' : ''} you`
      : "Don't miss a beat";

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: theme.colors.snow }}
    >
      <PoolsHeader
        titlePrefix="Your"
        titleAccent="Feed"
        subtitle={subtitle}
        onMenuPress={() => createJoinSheetRef.current?.open()}
      />

      {loading && !hasAnything ? (
        <SkeletonState />
      ) : error && !hasAnything ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : !hasAnything ? (
        <EmptyState />
      ) : (
        <ScrollView
          stickyHeaderIndices={[1]}
          contentContainerStyle={{ paddingBottom: theme.spacing.xxxl }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
        >
          {/* 0 — Needs you. Never filtered. */}
          <View style={{ paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm + 2 }}>
            {needsYou.length > 0 ? (
              <>
                <SectionLabel text={`Needs you · ${needsYou.length}`} />
                {needsYou.map((n) => (
                  <NeedsYouCard key={n.id} item={n} onPress={() => router.push(n.link as never)} />
                ))}
              </>
            ) : null}
          </View>

          {/* 1 — the chips, sticky. */}
          <ActivityFilterChips value={filter} onChange={setFilter} unreadMentions={unreadMentions} />

          {/* 2 — the history. */}
          <View style={{ paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm + 2 }}>
            {groups.length === 0 ? (
              <FilterEmpty filter={filter} />
            ) : (
              groups.map((g) => (
                <View key={g.key} style={{ gap: theme.spacing.sm + 2 }}>
                  <SectionLabel text={g.label} />
                  {g.items.map((item) => (
                    <HistoryRow key={item.activityId} item={item} />
                  ))}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

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

function HistoryRow({ item }: { item: ActivityItem }) {
  const open = go(item.link);
  if (item.activityType === 'mention') return <MentionCard item={item} onPress={open} />;
  if (item.activityType === 'matchweek_story') return <MatchweekStoryCard item={item} onOpen={open} />;
  if (!open) return <ActivityCard item={item} />;
  return (
    <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <ActivityCard item={item} />
    </Pressable>
  );
}

function SectionLabel({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <RNText
      style={{
        fontFamily: fontFamilies.bold,
        fontSize: 11,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: theme.colors.slate,
        marginTop: theme.spacing.md,
        marginLeft: theme.spacing.xs,
      }}
    >
      {text}
    </RNText>
  );
}

const FILTER_EMPTY: Record<ActivityFilter, string> = {
  all: 'Nothing here yet.',
  results: 'Your matchweek results land here once a week is fully scored.',
  rank: 'Rank moves in your pools show up here.',
  rewards: 'Badges, XP and levels you earn show up here.',
  mentions: 'When someone @mentions you in Banter, it shows up here.',
};

function FilterEmpty({ filter }: { filter: ActivityFilter }) {
  const theme = useTheme();
  return (
    <RNText
      style={{
        fontFamily: fontFamilies.medium,
        fontSize: 13,
        color: theme.colors.slate,
        textAlign: 'center',
        paddingVertical: theme.spacing.xxl,
        paddingHorizontal: theme.spacing.lg,
      }}
    >
      {FILTER_EMPTY[filter]}
    </RNText>
  );
}

function SkeletonState() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
}

function EmptyState() {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing.xxl,
        gap: theme.spacing.md,
      }}
    >
      <Icon name="bell.slash" tint={theme.colors.mist} size={40} weight="regular" />
      <Text variant="cardTitle">No Activity Yet</Text>
      <RNText
        style={{
          fontFamily: fontFamilies.regular,
          fontSize: 14,
          color: theme.colors.slate,
          textAlign: 'center',
          paddingHorizontal: theme.spacing.xxl,
        }}
      >
        Your feed will light up as you play — predictions, rank changes, badges, and more.
      </RNText>
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing.xxl,
        gap: theme.spacing.md,
      }}
    >
      <Icon name="exclamationmark.triangle" tint={theme.colors.mist} size={40} weight="regular" />
      <Text variant="cardTitle">Unable to Load</Text>
      <RNText
        style={{
          fontFamily: fontFamilies.regular,
          fontSize: 14,
          color: theme.colors.slate,
          textAlign: 'center',
          paddingHorizontal: theme.spacing.xxl,
        }}
      >
        {message}
      </RNText>
      <Button title="Try Again" onPress={onRetry} />
    </View>
  );
}
