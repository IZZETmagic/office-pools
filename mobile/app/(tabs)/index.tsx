import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ConfirmDialog, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
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
import {
  JoinPoolSheet,
  type JoinPoolSheetHandle,
  PoolCreateJoinSheet,
  type PoolCreateJoinSheetHandle,
} from '@/components/pools';
import { useHomeData } from '@/lib/HomeDataProvider';
import { homeMatchesFrom } from '@/lib/homeMatches';
import { useTournamentMatches } from '@/lib/TournamentMatchesProvider';
import type { PoolSummary } from '@/lib/useHomeData';
import type { ResultsMatch } from '@/lib/useTournamentMatches';
import { useManualRefresh } from '@/lib/useManualRefresh';
import { useNotificationPrompt } from '@/lib/useNotificationPrompt';
import { useTheme } from '@/theme';

export default function HomeScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { data, loading, error, refresh, refreshIfStale } = useHomeData();
  // ⚠ The Home cards read the MERGED match list — World Cup matches and league
  // fixtures — not `useHomeData`. Those two `matches` reads asked the wrong
  // table for a league pool and returned nothing, silently. See
  // `lib/homeMatches.ts` for the whole note.
  const {
    matches,
    refresh: refreshMatches,
    refreshIfStale: refreshMatchesIfStale,
  } = useTournamentMatches();
  const homeMatches = useMemo(() => homeMatchesFrom(matches), [matches]);
  // ⚠ BOTH FEEDS, AND THAT IS THE FIX. This screen renders two things that
  // come from two different hooks — pools and stats from `useHomeData`, the
  // match cards from the shared match feed — and until 2026-09-03 every
  // refresh on it, pull and focus alike, drove only the first.
  //
  // So Home held whatever the match list looked like when the app started.
  // On a phone opened before kick-off that is a fixture still marked
  // `scheduled`: "next kickoff" and "upcoming" for a game already being
  // played, and no Live Now card at all. The Results tab was right about the
  // same fixture at the same moment, for the single reason that it wires its
  // pull and its focus to THIS feed (`results.tsx`) — which is how the
  // asymmetry was found.
  const refreshAll = useCallback(
    () => Promise.all([refresh(), refreshMatches()]),
    [refresh, refreshMatches],
  );
  // Pull-to-refresh: spinner is bound to user gesture only. Background
  // refreshes (focus, realtime, stale) trigger via `refresh` directly and
  // don't surface the OS-level spinner.
  const { refreshing, onRefresh } = useManualRefresh(refreshAll);
  // One-shot notification soft-ask. Surfaces a custom ConfirmDialog the
  // first time the user lands here with permission still 'undetermined'.
  // Tapping "Enable" triggers the OS prompt; tapping "Not now" dismisses
  // permanently (persisted in SecureStore). See useNotificationPrompt.
  const notificationPrompt = useNotificationPrompt({ enabled: !!user });
  const initialFocus = useRef(true);
  // Create/Join action sheet opened from the "+" in HomeHeader. Picking
  // "Join with Code" closes this one and opens JoinPoolSheet below.
  const createJoinSheetRef = useRef<PoolCreateJoinSheetHandle | null>(null);
  const joinPoolSheetRef = useRef<JoinPoolSheetHandle | null>(null);
  // Use the staleness-checked refresh on tab focus so quick tab switches
  // don't re-fetch (no spinner flicker). Manual pull-to-refresh still uses
  // the unconditional `refresh`.
  const refreshIfStaleRef = useRef(refreshIfStale);
  refreshIfStaleRef.current = refreshIfStale;
  // The match feed keeps its own 30 s clock, so this is a second staleness
  // question and not a duplicate of the one above — coming back to Home after
  // a while has to be able to answer "has the football moved?" too.
  const refreshMatchesIfStaleRef = useRef(refreshMatchesIfStale);
  refreshMatchesIfStaleRef.current = refreshMatchesIfStale;

  useFocusEffect(
    useCallback(() => {
      if (initialFocus.current) {
        initialFocus.current = false;
        return;
      }
      refreshIfStaleRef.current();
      refreshMatchesIfStaleRef.current();
    }, []),
  );

  const pools = data?.pools ?? [];
  const hasPools = pools.length > 0;
  const poolsNeedingPredictions = pools.filter((p) => p.needsPredictions);
  // Hide the "Share Invite" card once the pool's tournament is underway —
  // predictions are locked by then, so there's no point inviting new members.
  // "Started" = the prediction deadline (first kickoff) has passed, or scoring
  // has already begun.
  const now = Date.now();
  const inviteTarget =
    pools.find((p) => {
      if (p.role !== 'admin' || p.memberCount >= 4) return false;
      const tournamentStarted =
        p.hasScoringStarted ||
        (p.predictionDeadline != null && Date.parse(p.predictionDeadline) <= now);
      return !tournamentStarted;
    }) ?? null;

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: theme.colors.snow }}
    >
      <HomeHeader
        fullName={data?.fullName ?? null}
        onMenuPress={() => createJoinSheetRef.current?.open()}
      />
      {/* Loading / error states sit below the header so the header
          doesn't pop in when data lands. */}
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
            Couldn&apos;t load home
          </Text>
          <Text variant="body" color="slate" align="center">
            {error}
          </Text>
          <Button title="Try Again" onPress={refresh} />
        </View>
      ) : (
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.md,
          // Tab bar isn't position:'absolute' (see (tabs)/_layout.tsx
          // tabBarStyle), so content already sits above it — no need
          // for useBottomTabBarHeight() padding (which would return 0
          // until the custom tab bar's onLayout fires and then jump).
          paddingBottom: theme.spacing.xl,
          gap: theme.spacing.xl,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
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
          liveMatches={homeMatches.live}
          nextMatch={homeMatches.next}
          matchesToday={homeMatches.matchesToday}
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

        {homeMatches.upcoming.length > 0 ? (
          <View style={{ gap: theme.spacing.md }}>
            <Text variant="sectionHeader">Upcoming Matches</Text>
            <View style={{ gap: theme.spacing.sm }}>
              {homeMatches.upcoming.map((m) => (
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
      )}

      {/* Create/Join action sheet — opened by tapping the "+" in HomeHeader.
          Picking "Join with Code" closes this and opens JoinPoolSheet
          (with a small timeout so the gorhom close + open animations
          sequence cleanly instead of fighting each other). */}
      <PoolCreateJoinSheet
        ref={createJoinSheetRef}
        onJoinPress={() => {
          setTimeout(() => joinPoolSheetRef.current?.open(), 250);
        }}
      />
      <JoinPoolSheet ref={joinPoolSheetRef} />

      {/* Notification soft-ask. shouldPrompt only flips true the FIRST
          time a signed-in user lands here with OS permission still
          'undetermined' — once dismissed (either choice) the SecureStore
          flag prevents it from showing again on subsequent app launches. */}
      <ConfirmDialog
        visible={notificationPrompt.shouldPrompt}
        title="Get notified about your pools?"
        description="Turn on notifications and we'll ping you when new banter lands, your pools earn badges, deadlines get close, and matches finish."
        confirmLabel="Enable Notifications"
        cancelLabel="Not now"
        onConfirm={() => {
          void notificationPrompt.enable();
        }}
        onCancel={() => {
          void notificationPrompt.dismiss();
        }}
      />
    </SafeAreaView>
  );
}

function HomeTournamentSection({
  liveMatches,
  nextMatch,
  matchesToday,
  daysUntilKickoff,
}: {
  liveMatches: ResultsMatch[];
  nextMatch: ResultsMatch | null;
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

  // ⚠ THE COUNTDOWN ONLY WINS IF THERE IS NOTHING SOONER, and that clause is
  // new. `CountdownHero` hard-codes the date `2026-06-11` and the words "FIFA
  // World Cup"; the branch is inert today only because that date has passed and
  // `daysUntilKickoff` floors at 0. Without the extra test, any future
  // competition given a kickoff constant would put a World-Cup-branded
  // countdown in front of a member with a Premier League game on tonight.
  //
  // The hero is a World Cup hero. It should say so by yielding to a real
  // fixture, not by relying on arithmetic to stay at zero.
  if (daysUntilKickoff > 0 && !nextMatch) {
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
          // Extra vertical padding so the cards' drop shadows + elevation
          // halo render fully instead of being clipped at the FlatList's
          // tight content-height boundary (which sized exactly to the
          // 180px card height before, cutting off the bottom shadow band).
          paddingTop: theme.spacing.xxs,
          paddingBottom: theme.spacing.sm,
        }}
        renderItem={({ item }) => (
          <PoolCard pool={item} onPress={() => router.navigate(`/pool/${item.poolId}`)} />
        )}
      />
    </View>
  );
}
