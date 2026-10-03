import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ActivityCard,
  ActivityFilterChips,
  CrewNeedsCard,
  MatchweekStoryCard,
  MentionCard,
  NeedsYouCard,
} from '@/components/activity';
import { SaveCrewSheet, type SaveCrewSheetHandle } from '@/components/crews/SaveCrewSheet';
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
import {
  answerCrewInvite,
  answerCrewSeat,
  dismissCrewPrompt,
  isCrewNeed,
  type ActivityLink,
  type NeedAction,
  type NeedsYouItem,
} from '@/lib/api';
import { useHomeData } from '@/lib/HomeDataProvider';
import { useManualRefresh } from '@/lib/useManualRefresh';
import type { ActivityItem } from '@/lib/useActivity';
import { fontFamilies, useTheme } from '@/theme';

/**
 * A focus within this long of the last fetch reuses it. Needs You has to catch
 * up after a pick is made on another screen, but the route costs ~1.5s and
 * flicking between tabs should not refetch every time.
 */
const FOCUS_REFRESH_MS = 30_000;

/**
 * How few rows a chip may show before the list fetches older pages on its own.
 * Mentions are rare, so without this the Mentions chip could open on an empty
 * screen while older mentions sat one page away.
 */
const FILTER_FILL_ROWS = 8;
/** …and at most this many pages per chip change, so a member with no mentions
 * at all does not page through their entire history every time they tap it. */
const FILTER_FILL_PAGES = 4;

type Row =
  | { kind: 'needs'; key: 'needs' }
  | { kind: 'chips'; key: 'chips' }
  | { kind: 'heading'; key: string; label: string }
  | { kind: 'item'; key: string; item: ActivityItem }
  | { kind: 'empty'; key: 'empty' };

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
  const {
    items,
    needsYou,
    loading,
    error,
    refresh,
    settleNeeds,
    restoreNeeds,
    markSeen,
    nextBefore,
    loadingMore,
    loadMoreError,
    loadMore,
  } = useSharedActivity();
  // Pull-to-refresh: spinner bound to real user gesture only.
  const { refreshing, onRefresh } = useManualRefresh(refresh);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  // Create / Join pool sheets — opened by the "+" button in the header.
  // Same pattern as the Home and Pools tabs so the user can create or
  // join a pool from any primary tab.
  const createJoinSheetRef = useRef<PoolCreateJoinSheetHandle | null>(null);
  const joinPoolSheetRef = useRef<JoinPoolSheetHandle | null>(null);
  const saveCrewSheetRef = useRef<SaveCrewSheetHandle | null>(null);
  const lastFocusFetchRef = useRef(0);
  const { refresh: refreshHomeData } = useHomeData();

  /**
   * A crew card's buttons (lib/crews/needs.ts decides which a card has). The card leaves the moment
   * one is pressed (Ryan, 2026-10-02) — then the route is called, and the list reconciles with the
   * server in the background. A failure puts the card back and says why: "This pool is full." comes
   * straight from the server.
   *
   * "Save as crew" is the one that waits: it only opens the sheet, and the card leaves when the
   * crew is actually saved (onSaved below), not when someone might still close the sheet.
   */
  const savingNeedRef = useRef<NeedsYouItem | null>(null);
  const onCrewAction = useCallback(
    async (item: NeedsYouItem, action: NeedAction) => {
      if (action.id === 'save') {
        savingNeedRef.current = item;
        saveCrewSheetRef.current?.open({
          poolId: item.pool_id,
          suggestedName: item.crew?.name ?? item.pool_name,
          people: item.crew?.people ?? 0,
        });
        return;
      }
      const removed = settleNeeds((n) => n.id === item.id);
      try {
        switch (action.id) {
          case 'take':
            await answerCrewSeat(item.pool_id, 'take');
            void refreshHomeData();
            router.navigate(`/pool/${item.pool_id}`);
            break;
          case 'decline':
            if (item.kind === 'crew_invite' && item.crew?.invite_id) await answerCrewInvite(item.crew.invite_id, 'decline');
            else await answerCrewSeat(item.pool_id, 'decline');
            break;
          case 'join':
            if (item.crew?.invite_id) await answerCrewInvite(item.crew.invite_id, 'join');
            break;
          case 'dismiss':
            await dismissCrewPrompt(item.pool_id);
            break;
        }
        void refresh();
      } catch (e) {
        restoreNeeds(removed);
        Alert.alert('That didn’t work', e instanceof Error ? e.message : 'Please try again.');
      }
    },
    [refresh, refreshHomeData, settleNeeds, restoreNeeds],
  );

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
  const filtered = useMemo(() => items.filter((i) => matchesFilter(i, filter)), [items, filter]);

  /**
   * One flat list, so FlatList only draws what is near the screen.
   *   0 Needs you   1 chips (sticky)   2… headings and rows
   */
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [
      { kind: 'needs', key: 'needs' },
      { kind: 'chips', key: 'chips' },
    ];
    const groups = groupByDay(filtered);
    if (groups.length === 0 && nextBefore === null) out.push({ kind: 'empty', key: 'empty' });
    for (const g of groups) {
      out.push({ kind: 'heading', key: `h-${g.key}`, label: g.label });
      for (const item of g.items) out.push({ kind: 'item', key: item.activityId, item });
    }
    return out;
  }, [filtered, nextBefore]);

  // A chip with too little on screen pulls older pages until it has enough,
  // the history ends, or it has tried FILTER_FILL_PAGES times.
  const fillPagesRef = useRef(0);
  useEffect(() => {
    fillPagesRef.current = 0;
  }, [filter]);
  useEffect(() => {
    if (filter === 'all' || !nextBefore || loadingMore || loadMoreError) return;
    if (filtered.length >= FILTER_FILL_ROWS || fillPagesRef.current >= FILTER_FILL_PAGES) return;
    fillPagesRef.current += 1;
    loadMore();
  }, [filter, filtered.length, nextBefore, loadingMore, loadMoreError, loadMore]);

  const renderRow = useCallback(
    ({ item: row }: { item: Row }) => {
      switch (row.kind) {
        case 'needs':
          // Bottom padding lives here, not on the chips: the chips are sticky,
          // and padding of their own would leave a gap above them while pinned.
          return (
            <View
              style={{
                paddingHorizontal: theme.spacing.xl,
                paddingBottom: needsYou.length > 0 ? theme.spacing.lg : 0,
                gap: theme.spacing.sm + 2,
              }}
            >
              {needsYou.length > 0 ? (
                <>
                  <SectionLabel text={`Needs you · ${needsYou.length}`} />
                  {needsYou.map((n) =>
                    isCrewNeed(n) ? (
                      <CrewNeedsCard key={n.id} item={n} onAction={onCrewAction} />
                    ) : (
                      <NeedsYouCard
                        key={n.id}
                        item={n}
                        onPress={() => {
                          if (n.link) router.push(n.link as never);
                        }}
                      />
                    ),
                  )}
                </>
              ) : null}
            </View>
          );
        case 'chips':
          return (
            <ActivityFilterChips value={filter} onChange={setFilter} unreadMentions={unreadMentions} />
          );
        case 'heading':
          return (
            <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.sm + 2 }}>
              <SectionLabel text={row.label} />
            </View>
          );
        case 'item':
          return (
            <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.sm + 2 }}>
              <HistoryRow item={row.item} />
            </View>
          );
        case 'empty':
          return <FilterEmpty filter={filter} />;
      }
    },
    [theme, needsYou, filter, unreadMentions, onCrewAction],
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
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          stickyHeaderIndices={[1]}
          initialNumToRender={14}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (!loadMoreError) loadMore();
          }}
          ListFooterComponent={
            <ListFooter
              loadingMore={loadingMore}
              error={loadMoreError}
              atEnd={nextBefore === null && items.length > 0}
              onRetry={loadMore}
            />
          }
          contentContainerStyle={{ paddingBottom: theme.spacing.xxxl }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
        />
      )}

      <PoolCreateJoinSheet
        ref={createJoinSheetRef}
        onJoinPress={() => {
          setTimeout(() => joinPoolSheetRef.current?.open(), 250);
        }}
      />
      <JoinPoolSheet ref={joinPoolSheetRef} />
      <SaveCrewSheet
        ref={saveCrewSheetRef}
        onSaved={() => {
          const saved = savingNeedRef.current;
          savingNeedRef.current = null;
          if (saved) settleNeeds((n) => n.id === saved.id);
          void refresh();
        }}
      />
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

/**
 * The bottom of the list: a spinner while the next page loads, a retry if it
 * failed, and an end marker once the whole history is in. The end marker is the
 * point of the disclosure gate — the feed is a finite record, not a stream.
 */
function ListFooter({
  loadingMore,
  error,
  atEnd,
  onRetry,
}: {
  loadingMore: boolean;
  error: string | null;
  atEnd: boolean;
  onRetry: () => void;
}) {
  const theme = useTheme();
  const box = { paddingVertical: theme.spacing.xl, alignItems: 'center' as const };
  if (loadingMore) {
    return (
      <View style={box}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }
  if (error) {
    return (
      <Pressable onPress={onRetry} accessibilityRole="button" style={box}>
        <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 13, color: theme.colors.slate }}>
          {"Couldn't load more · "}
          <RNText style={{ fontFamily: fontFamilies.bold, color: theme.colors.primary }}>Try again</RNText>
        </RNText>
      </Pressable>
    );
  }
  if (atEnd) {
    return (
      <View style={box}>
        <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate }}>
          {"That's everything since you joined"}
        </RNText>
      </View>
    );
  }
  return null;
}

/**
 * A group heading. "Matchweek 5 · Sun 20 Sep" splits into a bold heading and a
 * quieter date, so the matchweek reads first; a plain day ("Friday 25 Sep")
 * is just the heading. Sized as a heading, not a caption: at 11px uppercase
 * slate it disappeared against the cards (Ryan, 2026-09-29).
 */
function SectionLabel({ text }: { text: string }) {
  const theme = useTheme();
  const [head, ...rest] = text.split(' · ');
  const tail = rest.join(' · ');
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: theme.spacing.sm,
        marginTop: theme.spacing.lg,
        marginLeft: theme.spacing.xs,
      }}
    >
      <RNText style={{ fontFamily: fontFamilies.black, fontSize: 20, color: theme.colors.ink }}>
        {head}
      </RNText>
      {tail ? (
        <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 14, color: theme.colors.slate }}>
          {tail}
        </RNText>
      ) : null}
    </View>
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
