import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { setStatusBarStyle, StatusBar } from 'expo-status-bar';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  type RefreshControlProps,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
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
  DuelTab,
  LeaguePickemEntriesTab,
  LeaguePickemScoring,
  LeagueTableEntriesTab,
  LmsEntriesTab,
  LmsScoring,
  LeagueTableScoring,
  MembersTab,
  PoolDetailHeader,
  ShowdownDuelHeader,
  ShowdownLeaderboard,
  ShowdownRoom,
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
import { fetchLmsState } from '@/lib/api';
import type { Standing } from '@/components/pool-detail/ShowdownDuelHeader';
import { ShowdownRecapSheet } from '@/components/pool-detail/ShowdownRecapSheet';
import { ShowdownWalkout } from '@/components/pool-detail/ShowdownWalkout';
import { predictionSurfaceFor } from '@/lib/leagueSurface';
import { duelPhase } from '@/lib/duelPhase';
import { MISSING, useCeremonyMarkers } from '@/lib/useCeremonyMarkers';
import { useDuel } from '@/lib/useDuel';
import { useLeaguePool } from '@/lib/useLeaguePool';
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
  // Showdown only. A pool without duels never offers the tab, so a stale
  // `?tab=duel` on another mode falls through to the leaderboard default
  // below — the same way `?tab=form` does on a league pool.
  'duel',
  'room',
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

// Memoized tab panels + header. Switching tabs re-renders PoolDetailScreen so
// the active-pill highlight can move — but the panel/header contents don't
// depend on which tab is active. Without these memo boundaries every tab
// switch re-rendered all ~9 mounted panels, and the highlight couldn't repaint
// until that finished (up to a couple seconds on a big pool). memo() lets each
// panel bail out when its props are unchanged (they are, across a tab switch),
// so the switch commit stays cheap and the highlight snaps immediately. This
// doesn't block a panel's own data updates or internal state — only the
// redundant parent-triggered re-render.
const MemoPoolDetailHeader = memo(PoolDetailHeader);
const MemoDuelTab = memo(DuelTab);
const MemoShowdownLeaderboard = memo(ShowdownLeaderboard);
const MemoShowdownRoom = memo(ShowdownRoom);
const MemoLeaderboardTab = memo(LeaderboardTab);
const MemoLeagueTableEntriesTab = memo(LeagueTableEntriesTab);
const MemoLmsEntriesTab = memo(LmsEntriesTab);
const MemoLeaguePickemEntriesTab = memo(LeaguePickemEntriesTab);
const MemoLmsScoring = memo(LmsScoring);
const MemoLeaguePickemScoring = memo(LeaguePickemScoring);
const MemoLeagueTableScoring = memo(LeagueTableScoring);
const MemoPredictionsTab = memo(PredictionsTab);
const MemoFormTab = memo(FormTab);
const MemoBPFormTab = memo(BPFormTab);
const MemoScoringTab = memo(ScoringTab);
const MemoPoolInfoTab = memo(PoolInfoTab);
const MemoRoundsTab = memo(RoundsTab);
const MemoMembersTab = memo(MembersTab);
const MemoFeesTab = memo(FeesTab);
const MemoSettingsTab = memo(SettingsTab);

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
  /**
   * Vertical scroll of whichever tab is on screen, so the Showdown matchup
   * header can collapse as you read down.
   *
   * ⚠ IT LIVES HERE BECAUSE NOTHING ELSE COULD OWN IT. The header sits
   * outside the pager and every tab is its own ScrollView, so no single
   * scroll position existed — which is why the header could not collapse at
   * all before this. Each page writes its own offset in and hands it over
   * when it becomes the active page (see `TabPage`); a plain shared handler
   * would leave the header collapsed after swiping to a tab sitting at top.
   *
   * Written from the UI thread, read by an animated style. No re-render.
   */
  const scrollY = useSharedValue(0);
  /**
   * How tall the Showdown band is when expanded.
   *
   * ⚠ The band FLOATS over the pager — that is what lets it slide up without a
   * layout pass — so nothing reserves its space automatically. Every page pads
   * by this or its first screenful sits underneath the header. Zero for every
   * other mode, where the header is an ordinary sibling above the pager.
   */
  const [bandHeight, setBandHeight] = useState(0);
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
  const isLeague = data?.pool.isLeague ?? false;
  const isTableMode = isLeague && data?.pool.leagueMode === 'table';
  // ⚠ Read off `data`, like every flag around it — NOT off `pool`, which is
  // destructured ~150 lines below. `useMemo` evaluates both its factory and its
  // dependency array during render, so reaching for `pool` up here is a
  // ReferenceError before the early returns have even run.
  const leagueMode = data?.pool.leagueMode ?? null;
  /**
   * ⚠ DEFINED WITH THE OTHER FLAGS, not beside the JSX that reads it. It used
   * to sit just above the `return`, which worked only because `renderTab` is
   * not CALLED until then — a const in the temporal dead zone that happens to
   * be initialised in time. The same shape already cost a ReferenceError once
   * on this screen; this is not the place to rely on call order.
   */
  const isShowdownPool = isLeague && leagueMode === 'showdown';
  // Has table picking closed? Drives what the Predictions tab offers and
  // whether rivals' tables can be opened. The pool row already carries it, so
  // no query is needed — and it is the same fact the database trigger and RLS
  // both key on, rather than a second definition of "closed".
  const tableIsLocked = data?.pool.leagueTableLockAt
    ? new Date(data.pool.leagueTableLockAt).getTime() <= Date.now()
    : false;
  // Last Man Standing's round, fetched only for a pool that plays it.
  //
  // ⚠ A SEPARATE READ, not a widening of `usePoolDetail`. That hook serves every
  // pool type, and hanging a mode's payload off it would make all 623 World Cup
  // pools carry a shape only one league mode ever uses. The picker route reads
  // the same key, so opening it from here costs nothing.
  //
  // ⚠ Its picks are gated by RLS on the CALLER's client server-side, which is
  // why nothing on the phone filters them: a rival's club is absent until the
  // matchweek locks, and absence is the gate rather than a flag to respect.
  const isLms = isLeague && data?.pool.leagueMode === 'last_man_standing';
  /**
   * Pick'em's open matchweek and its real lock, for the Info card.
   *
   * ⚠ The same `useLeaguePool` the Pick'em tabs call, so React Query serves it
   * from one cache rather than fetching the 165 kB season twice.
   *
   * ⚠ `lock_at`, NOT the first kickoff — migration 101 closes picks an hour
   * earlier, and the two differ on every matchweek from 3 onward.
   */
  const pickemLeague = useLeaguePool(data?.pool.leagueMode === 'pickem' ? id : null);
  // ⚠ Null for every other mode — the payload is the whole season, and a pool
  // with no duels has no reason to pull it. The HEADER needs this, which is
  // why it is here rather than inside `DuelTab`: the header renders outside
  // the pager, above the tab that shows the same bout.
  const duel = useDuel(leagueMode === 'showdown' ? id : null);
  /**
   * Where each member sits, for the `position · PTS` line under their name.
   *
   * ⚠ From the LEADERBOARD, which is the engine's stored order — never
   * recomputed from points here. `league_finalize_ranks` already resolves ties
   * through a seven-key cascade, and a second ordering on this screen would
   * disagree with the Leaderboard tab one swipe away.
   *
   * ⚠⚠ `total_points` IS THE PICKING HALF ONLY. Migration 121: *"`total_points`
   * is what your picking scored; `duel_points` ... lives beside it"* — two
   * columns, summed by the ranker's ORDER BY and by nothing else. `points` here
   * therefore carries the picks, and anything showing a member's SEASON total
   * has to add `duel_points` itself.
   *
   * The header reads this map for a corner's `· N pts`, which is the picking
   * figure. That is the honest label for it there; the Leaderboard sums the two
   * because a leaderboard is about the rank.
   */
  const duelStandings = useMemo(() => {
    const m = new Map<string, Standing>();
    for (const e of data?.leagueLeaderboard ?? []) {
      m.set(e.entry_id, {
        // The avatar gradient is keyed on the PERSON, not the entry — that is what
        // makes a member the same colour here as in Banter.
        userId: e.user_id ?? null,
        rank: e.current_rank ?? null,
        previousRank: e.previous_rank ?? null,
        points: e.total_points ?? 0,
        // For the scouting card's accuracy — same row, no second read.
        correct: e.pickem?.correct_count ?? 0,
        lastFive: e.pickem?.last_five ?? [],
      });
    }
    return m;
  }, [data?.leagueLeaderboard]);

  /**
   * The viewer's own corner, for the sealed band.
   *
   * ⚠ IT EXISTS BECAUSE `duel.current` DOES NOT, THROUGH HALF THE CYCLE. RLS
   * (116) withholds a sealed week's duel rows, so the header has no bout to
   * read "you" off during phases 1 and 6 — which is most of any given week. The
   * member's own entry was never the part being kept secret.
   *
   * ⚠ `ownName` COMES FROM THE POOL PAYLOAD, not from `duel.names`: that map is
   * built from the two sides of every REVEALED duel and is empty in a pool whose
   * draw has not opened yet. See `useDuel`'s note on the field.
   */
  /**
   * The two one-shot markers, and the phase they decide.
   *
   * ⚠ THE MARKERS ARE READ SEPARATELY FROM THE LEAGUE CONTRACT, on purpose —
   * see `useCeremonyMarkers`. They are per-VIEWER, and the season payload they
   * would otherwise ride on is the one thing the read-path review says to cache.
   */
  const ceremony = useCeremonyMarkers(duel.ownEntryId);

  /**
   * ⚠ ONE DERIVATION FOR ALL SIX PHASES. Nothing on this screen may ask "is it
   * revealed?" or "is it sealed?" for itself — `duelPhase` is the only answer,
   * and its header records what a second ad-hoc chain cost in production.
   *
   * ⚠ IT WAITS FOR THE MARKERS. Until `ready`, the machine would be told nobody
   * has watched anything and would throw a walkout over a member who met their
   * opponent days ago. `failed` is treated the same as "already seen": missing
   * one ceremony is recoverable, replaying it on every app open is not.
   */
  /**
   * ⚠ PULLED OUT AS LOCALS SO THE DEPENDENCY ARRAYS NAME STABLE REFERENCES.
   * `useDuel` returns a fresh object literal every render, so depending on
   * `duel` itself would defeat every memo below it — but each of these fields
   * is individually `useMemo`d inside the hook, so naming them is both correct
   * and something the exhaustive-deps rule can actually check.
   */
  const { current: duelCurrent, sealed: duelSealed, lastSettled: duelLastSettled } = duel;
  const duelCount = duel.duels.length;
  const duelIsInPlay = duel.isInPlay;
  const duelLastSettledAt = duel.lastSettledAt;
  const duelOwnName = duel.ownName;

  const duelPhaseState = useMemo(() => {
    const currentDuelId = duelCurrent?.duel.duel_id ?? null;

    /**
     * ⚠ WHILE THE MARKERS ARE UNKNOWN, BOTH CEREMONIES ARE SUPPRESSED — and
     * suppression is expressed as VALUES rather than as an extra branch, so
     * `duelPhase` keeps exactly one code path.
     *
     * Saying "the reveal I last watched is the one on screen" makes the machine
     * return `scouting`; saying "I last saw the recap at the moment the duel
     * settled" makes `settled_at > seen` false. Both are the honest reading of
     * "we do not know yet, so do not throw a full-screen takeover at anybody".
     */
    const known = ceremony.ready;

    /**
     * ⚠ THE REVEAL COLUMN MAY BE KNOWN-ABSENT, WHICH IS NOT THE SAME AS NULL.
     * Migration 136 is applied by hand, so between the code shipping and the
     * migration running there is a window where the walkout can be OPENED but
     * its dismissal cannot be STORED — which would replay it on every app open.
     * Saying "the reveal I last watched is the one on screen" closes it until
     * the column exists, and it re-arms itself the moment 136 lands.
     */
    const seen = ceremony.markers.lastRevealSeenDuel;
    const revealSeenDuel = !known || seen === MISSING ? currentDuelId : seen;

    return duelPhase({
      hasDraw: duelCount > 0 || duelSealed !== null,
      current: duelCurrent
        ? {
            duelId: duelCurrent.duel.duel_id,
            matchweek: duelCurrent.matchweek,
            settledAt: duelCurrent.duel.settled_at,
          }
        : null,
      sealedMatchweek: duelSealed?.matchweek ?? null,
      isInPlay: duelIsInPlay,
      lastSettledAt: duelLastSettledAt,
      revealSeenDuel,
      recapSeenAt: known ? ceremony.markers.lastRecapSeenAt : duelLastSettledAt,
    });
  }, [
    duelCount,
    duelSealed,
    duelCurrent,
    duelIsInPlay,
    duelLastSettledAt,
    ceremony.ready,
    ceremony.markers,
  ]);

  const [walkoutOpen, setWalkoutOpen] = useState(false);

  /**
   * ⚠ CLOSING COUNTS AS WATCHING, HOWEVER IT IS CLOSED — finished, skipped, or
   * backed out of at two seconds. That is the accessibility floor: if the
   * ceremony cannot render for somebody, they press Reveal, close it, and the
   * band names their opponent. Nobody may be trapped behind an animation that
   * will not play.
   */
  const closeWalkout = useCallback(() => {
    setWalkoutOpen(false);
    const duelId = duelCurrent?.duel.duel_id;
    if (duelId) ceremony.markRevealSeen(duelId);
  }, [duelCurrent, ceremony]);

  /**
   * The recap, built from the bout that most recently settled.
   *
   * ⚠ FROM `lastSettled`, NOT `current`. By the time somebody opens the app on
   * a Tuesday, `current` is already next week's duel — reading the recap off it
   * would recap a week nobody has played.
   */
  const duelRecap = useMemo(() => {
    const b = duelLastSettled;
    if (!b || !duelPhaseState.recapPending) return null;
    return {
      duelId: b.duel.duel_id,
      matchweek: b.matchweek,
      you: {
        name: duelOwnName ?? 'You',
        userId: duelStandings.get(b.you.entryId)?.userId ?? null,
        score: b.you.accuracy ?? 0,
      },
      // ⚠ NULL IS A BYE and must stay structural. A bye pays DUEL_BYE, which
      // IS DUEL_TIE, so anything reading the points to detect one calls it a
      // draw against an opponent who never existed.
      them: b.them
        ? {
            name: b.them.name,
            userId: duelStandings.get(b.them.entryId)?.userId ?? null,
            score: b.them.accuracy ?? 0,
          }
        : null,
      points: b.you.points,
    };
  }, [duelLastSettled, duelOwnName, duelPhaseState.recapPending, duelStandings]);

  /** ⚠ BOTH BUTTONS STAMP. Reading the story is not a reason to be told the news again. */
  const dismissRecap = useCallback(() => ceremony.markRecapSeen(), [ceremony]);
  const reviewRecap = useCallback(() => {
    ceremony.markRecapSeen();
    if (duelRecap) router.push(`/pool/${id}/duel/${duelRecap.matchweek}`);
  }, [ceremony, duelRecap, id]);

  const duelYou = useMemo(
    () =>
      duel.ownEntryId ? { entryId: duel.ownEntryId, name: duel.ownName ?? 'You' } : null,
    [duel.ownEntryId, duel.ownName],
  );

  const pickemDeadline = (() => {
    const season = pickemLeague.data?.season;
    const open = season?.openMatchweekNumber ?? null;
    if (open === null) return null;
    const mw = season?.matchweeks.find((m) => m.number === open);
    return mw?.lock_at ? { matchweek: open, locksAt: mw.lock_at } : null;
  })();

  const lmsQuery = useQuery({
    queryKey: ['lms', id],
    queryFn: () => fetchLmsState(id),
    enabled: isLms,
  });
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
  // ⚠ Same FIVE arguments as the tab bar's own call, and they have to stay that
  // way: this list orders the PAGER PAGES and that one orders the PILLS. If they
  // disagree, tapping a pill scrolls to somebody else's tab.
  //
  // ⚠ `pool.leagueMode` is in the dependency array, and it is load-bearing. It
  // decides whether the Duel tab exists, so leaving it out would let the pager
  // keep a page list from before the mode was known while the pill strip — which
  // has no memo — already showed Duel. Every pill would then open the tab to its
  // left.
  const visibleTabs = useMemo(
    () => getVisiblePoolTabs(isAdmin, isProgressive, feesEnabled, isLeague, leagueMode),
    [isAdmin, isProgressive, feesEnabled, isLeague, leagueMode],
  );
  /**
   * The tab a pool OPENS on is the first one it offers.
   *
   * Ryan: a Showdown pool should land on Duel. It cannot be a different literal
   * in `useState` — that initialiser runs before `usePoolDetail` resolves, so
   * the mode is not known yet.
   *
   * ⚠⚠ AND IT CANNOT BE AN EFFECT EITHER, which is what the first two attempts
   * were. An effect runs AFTER the commit, so on the render where the pool
   * arrives the screen is committed with the OLD tab against the NEW tab list —
   * and for a Showdown pool that is a real change of position: 'leaderboard'
   * moves from index 0 to index 1, because Duel has just appeared in front of
   * it. The pager effect duly animates to page 1, `handleMomentumScrollEnd`
   * fires when it lands there, reads 'leaderboard' off the settled page and
   * writes it back to state — setting `skipPagerScrollRef` on the way, which
   * suppresses the scroll back. The landing was correct and something else
   * overruled it a frame later: "it opens on Duel then quickly switches".
   *
   * ⚠ SO IT IS AN ADJUSTMENT DURING RENDER — React's documented pattern for
   * deriving state from changed props. React discards this render and re-runs
   * immediately, so nothing is ever committed holding the wrong pairing:
   * `tabIndex` below is computed from the landed tab on the very first render
   * that knows the mode, the pager is never told to go anywhere else, and there
   * is no scroll for the momentum handler to misread.
   *
   * ⚠ GUARDED BY THE POOL ID IN STATE, not a ref. A ref written during render
   * is the thing React's own guidance warns about — it survives the discarded
   * render, so under StrictMode's double invoke the guard has already flipped
   * before the state it guards was ever set. The pool id also re-lands
   * correctly if this screen is ever reused for a different pool.
   *
   * ⚠ AND IT IS `visibleTabs[0]`, NOT `'duel'`. The first tab a mode offers is
   * already the right landing for every mode — Showdown puts Duel in front,
   * everything else leads with Leaderboard, exactly where they landed before.
   * `lib/poolTabs.ts` owns that order and has tests for it.
   */
  const [landedFor, setLandedFor] = useState<string | null>(null);
  if (data && landedFor !== data.pool.poolId) {
    setLandedFor(data.pool.poolId);
    // A `?tab=` deep link is a choice; `useState` already honoured it.
    const deepLinked = tabParam && TAB_PARAM_VALUES.includes(tabParam as PoolTabKey);
    const landing = visibleTabs[0];
    if (!deepLinked && landing && landing !== tab) setTab(landing);
  }

  /**
   * ⚠ RE-ASSERT THE BAR ON THE WAY BACK IN.
   *
   * The `<StatusBar style="light">` below applies on mount and on a style
   * CHANGE — it does not re-apply when this screen is returned to. The duel
   * decision page pushes on top and sets `dark` (its background is near-white
   * and white glyphs vanish on it), and without this the clock and battery
   * stayed black over the dark Showdown band on the way back.
   *
   * ⚠ THIS SCREEN OWNS THE ANSWER, so this screen gives it. The decision page
   * restoring the bar itself would mean knowing which pool it came from and
   * whether that pool is a Showdown — a fact it has no business holding.
   *
   * ⚠ `'auto'` FOR AN ORDINARY POOL, not `'dark'`: those have no band, so the
   * bar follows the device theme exactly as the root layout sets it.
   *
   * ⚠ IT SITS HERE, BELOW `accentColor`, AND NOT WITH THE OTHER FOCUS EFFECTS.
   * A `useCallback` dependency array is evaluated during RENDER, so reading
   * either of these from further up the component is a temporal-dead-zone
   * ReferenceError rather than a stale value.
   */
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(accentColor || isShowdownPool ? 'light' : 'auto', true);
    }, [accentColor, isShowdownPool]),
  );

  const tabIndex = Math.max(0, visibleTabs.indexOf(tab));

  // A tab that is no longer offered leaves the screen in two minds: `tab` still
  // says 'form', but `indexOf` returns -1 so the pager sits on page 0 and no
  // pill is lit. Reachable via `?tab=form` on a league pool, and via a pool
  // whose visible set changes under the viewer (an admin losing rights, fee
  // tracking switched off). Snap to the first real tab instead.
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.includes(tab)) {
      setTab(visibleTabs[0]);
    }
  }, [visibleTabs, tab]);


  // Stable identity so the memoized Settings panel isn't re-rendered on every
  // tab switch by a fresh inline closure. Reads pool via `data` (optional) so
  // it can sit above the loading/error early-returns without breaking the
  // rules of hooks.
  const handleOpenScoring = useCallback(() => {
    if (!data) return;
    router.push(
      `/pool/${data.pool.poolId}/scoring-config${
        data.pool.predictionMode === 'bracket_picker' ? '?mode=bracket_picker' : ''
      }`,
    );
  }, [data]);

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

  const {
    pool,
    leaderboard,
    league,
    leagueLeaderboard,
    awards,
    superlatives,
    matchdayMvp,
    matchdayInfo,
  } = data;

  // The viewer's own entry in a league pool, taken from the leaderboard rows
  // rather than fetched — they are already loaded and already scoped to this
  // pool. `/table-prediction` falls back to the caller's first entry when this
  // is null, so a miss is a slower path, never a wrong one.
  const ownLeagueEntryId =
    leagueLeaderboard?.find((e) => e.user_id === pool.currentUserId)?.entry_id ?? null;

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
      // Showdown only — `getVisiblePoolTabs` never offers this key elsewhere,
      // so reaching it means the pool has duels.
      case 'duel':
        return <MemoDuelTab poolId={pool.poolId} standings={duelStandings} />;
      case 'room':
        return <MemoShowdownRoom poolId={pool.poolId} />;
      case 'leaderboard':
        // ⚠ Showdown gets its OWN board. The shared one shows a single total,
        // and the whole point here is the split — picks and duels are one
        // number since migration 121, and seeing them apart is the reason the
        // Duels view exists at all.
        if (isShowdownPool) {
          return (
            <MemoShowdownLeaderboard
              poolId={pool.poolId}
              entries={leagueLeaderboard ?? []}
              currentUserId={pool.currentUserId}
            />
          );
        }
        return (
          <MemoLeaderboardTab
            poolId={pool.poolId}
            entries={leaderboard}
            currentUserId={pool.currentUserId}
            awards={awards}
            superlatives={superlatives}
            matchdayMvp={matchdayMvp}
            matchdayInfo={matchdayInfo}
            league={league}
            leagueEntries={leagueLeaderboard}
            // The same lock the picker switches on — one fact, one source.
            tableIsLocked={tableIsLocked}
          />
        );
      case 'predictions': {
        // The rule lives in `lib/leagueSurface.ts`. A league pool must never
        // reach the World Cup wizard — its picks are in `league_predictions`,
        // which that wizard never touches, so it rendered empty with nothing to
        // explain why. Picking on a phone is not built and is not being built
        // yet (Ryan, 2026-09-02); this says so rather than showing a broken
        // screen.
        const surface = predictionSurfaceFor({
          isLeague: pool.isLeague,
          leagueMode: pool.leagueMode,
        });
        // Table mode keeps this tab and this name, and lists ENTRIES like the
        // World Cup does — the picking itself is a route away. See
        // `leagueSurface.ts` and `LeagueTableEntriesTab`.
        if (surface === 'league-table') {
          return (
            <MemoLeagueTableEntriesTab
              poolId={pool.poolId}
              entries={leagueLeaderboard ?? []}
              currentUserId={pool.currentUserId}
              isLocked={tableIsLocked}
              lockAt={pool.leagueTableLockAt}
            />
          );
        }
        if (surface === 'league-lms') {
          return (
            <MemoLmsEntriesTab
              poolId={pool.poolId}
              state={lmsQuery.data ?? null}
              loading={lmsQuery.isPending}
              error={
                lmsQuery.isError
                  ? lmsQuery.error instanceof Error
                    ? lmsQuery.error.message
                    : 'The round could not be loaded.'
                  : null
              }
              currentUserId={pool.currentUserId}
            />
          );
        }
        // Pick'em's landing is a MATCHWEEK, then the entries in it — the only
        // league mode whose landing needs a week, because its reveal is
        // per-matchweek rather than one deadline a season. The picking is a
        // route away, like Table's and LMS's and for the same layout reason.
        if (surface === 'league-pickem') {
          return (
            <MemoLeaguePickemEntriesTab
              poolId={pool.poolId}
              entries={leagueLeaderboard ?? []}
            />
          );
        }
        if (surface === 'league-read-only') {
          return (
            <TabPlaceholder
              icon="iphone.and.arrow.forward"
              title="Make your picks on the web"
              caption="This pool's picking screen isn't on the phone yet. Everything else here is up to date."
            />
          );
        }
        return (
          <MemoPredictionsTab
            poolId={pool.poolId}
            maxEntriesPerUser={pool.maxEntriesPerUser}
            predictionMode={pool.predictionMode}
            predictionDeadline={pool.predictionDeadline}
            isAdmin={pool.isAdmin}
          />
        );
      }
      case 'form':
        return pool.predictionMode === 'bracket_picker' ? (
          <MemoBPFormTab poolId={pool.poolId} />
        ) : (
          <MemoFormTab poolId={pool.poolId} />
        );
      case 'scoring':
        // ⚠ The World Cup Scoring tab lists group bonuses, bracket pairings and
        // a top scorer. A table pool awards none of them and pays for things
        // that list names nowhere, so it was describing a different game.
        if (pool.leagueMode === 'table') {
          return <MemoLeagueTableScoring poolId={pool.poolId} entryId={ownLeagueEntryId} />;
        }
        // ⚠ And Last Man Standing awards nothing at all — no points exist in the
        // mode — so the World Cup tab's group bonuses and exact-scoreline prices
        // were not merely unfinished, they were another game's rules.
        if (pool.leagueMode === 'last_man_standing') {
          return (
            <MemoLmsScoring
              state={lmsQuery.data ?? null}
              loading={lmsQuery.isPending}
              error={
                lmsQuery.isError
                  ? lmsQuery.error instanceof Error
                    ? lmsQuery.error.message
                    : 'The rules could not be loaded.'
                  : null
              }
            />
          );
        }
        // ⚠ And Pick'em's World Cup tab carried one line that was WRONG rather
        // than merely irrelevant: at Results depth the engine charges a correct
        // tap at the pool's TOP price (066), and that screen printed "Correct
        // Result — 50" beneath it. A member who called Arsenal to win read that
        // their pick was worth half what it pays.
        // ⚠ SHOWDOWN TOO, and it was falling through to the World Cup tab —
        // group bonuses, a ×8 Final multiplier, penalty shootouts and a
        // 1,000-point Champion bonus, none of which it can score. It is a
        // PICK'EM WITH A LAYER (Decision 9), so it gets the same screen plus
        // the duel card rather than a screen of its own.
        if (pool.leagueMode === 'pickem' || pool.leagueMode === 'showdown') {
          return (
            <MemoLeaguePickemScoring
              poolId={pool.poolId}
              showDuel={pool.leagueMode === 'showdown'}
            />
          );
        }
        return (
          <MemoScoringTab
            poolId={pool.poolId}
            predictionMode={pool.predictionMode}
          />
        );
      case 'info':
        return (
          <MemoPoolInfoTab
            pool={pool}
            // ⚠ Without this the card reads the league SENTINEL — the season's
            // last kickoff, 269 days out on the live pool — under an "Open"
            // badge, while picking actually closes this week.
            // ⚠ BOTH weekly modes now. Pick'em's date was SUPPRESSED rather
            // than corrected when LMS was fixed — the card had no idea which
            // matchweek it was on, and a blank beat a confident wrong date.
            // The league contract carries the matchweeks now, so it can be
            // right instead of absent.
            matchweekDeadline={
              lmsQuery.data?.open_matchweek != null && lmsQuery.data.open_locks_at
                ? { matchweek: lmsQuery.data.open_matchweek, locksAt: lmsQuery.data.open_locks_at }
                : pickemDeadline
            }
          />
        );
      case 'rounds':
        return <MemoRoundsTab poolId={pool.poolId} />;
      case 'members':
        return <MemoMembersTab poolId={pool.poolId} />;
      case 'fees':
        return <MemoFeesTab pool={pool} />;
      case 'settings':
        return (
          <MemoSettingsTab
            pool={pool}
            onSaved={refresh}
            onOpenScoring={handleOpenScoring}
          />
        );
    }
  }

  const tabBar = (
    <PoolTabBar
      active={tab}
      onChange={handleTabTap}
      isAdmin={pool.isAdmin}
      isProgressive={!!isProgressive}
      feesEnabled={feesEnabled}
      isLeague={isLeague}
      pageOffset={pageOffset}
      accentColor={accentColor}
      poolId={pool.poolId}
      leagueMode={leagueMode}
      // The Showdown band is lit from both edges, stays dark in both app
      // themes, and the strip sits inside it — so the strip goes transparent
      // AND dark, from the one flag that says where it is.
      onDarkBand={isShowdownPool}
    />
  );

  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={{ flex: 1, backgroundColor: theme.colors.snow }}
    >
      {/* Branded headers paint a dark color band behind the status bar; force
          light icons so the clock/battery stay legible. Unmounts when the
          screen leaves and the root-layout's "auto" style takes over again. */}
      {/*
        ⚠ Also for Showdown, and not only for a branded pool. The duel band is
        dark in BOTH app themes, so in light mode the OS would still be drawing
        a dark clock and battery over it.
      */}
      {accentColor || isShowdownPool ? <StatusBar style="light" animated /> : null}
      {/*
        ⚠ SHOWDOWN GETS A DIFFERENT HEADER, and the tab strip moves INSIDE it.
        Every other mode renders exactly what it did before — same header, same
        sibling strip — so this is additive rather than a rewrite of a surface
        four other modes depend on.

        The strip is the same `PoolTabBar` in both branches. It is passed as a
        child rather than duplicated, because two copies of the pill list is how
        the pager and the pills start disagreeing about tab order.
      */}
      {/*
        ⚠ NOT RENDERED HERE FOR SHOWDOWN. Its band floats OVER the pager and is
        drawn after it, further down — see the note by the header itself. Every
        other mode keeps the ordinary arrangement: header, strip, then pager.
      */}
      {isShowdownPool ? null : (
        <>
          <MemoPoolDetailHeader pool={pool} />
          {tabBar}
        </>
      )}
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
        {visibleTabs.map((key, i) => (
          <TabPage
            key={key}
            index={i}
            width={width}
            pageOffset={pageOffset}
            scrollY={scrollY}
            paddingTop={bandHeight}
            paddingBottom={theme.spacing.xxxl}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={accentColor ?? theme.colors.primary}
              />
            }
          >
            {renderTab(key)}
          </TabPage>
        ))}
      </Animated.ScrollView>

      {/*
        ⚠ AFTER THE PAGER, AND THAT IS THE WHOLE TRICK. The band is absolutely
        positioned and floats over the content, so sliding it up UNCOVERS what
        was already underneath — no height animates, nothing re-lays out, and it
        runs on the compositor.

        Rendering it before the pager would put the scrolling content on top of
        it. It reports its expanded height back so every page can pad by it.
      */}
      {isShowdownPool ? (
        <ShowdownDuelHeader
          poolName={pool.poolName}
          poolCode={pool.poolCode ?? null}
          bout={duel.current}
          sealed={duel.sealed}
          you={duelYou}
          onReveal={duelPhaseState.phase === 'revealable' ? () => setWalkoutOpen(true) : null}
          phase={duelPhaseState.phase}
          standings={duelStandings}
          kickoffAt={duel.currentKickoff}
          liveScore={duel.liveScore}
          liveNow={duel.liveNow}
          scrollY={scrollY}
          onExpandedHeight={setBandHeight}
        >
          {tabBar}
        </ShowdownDuelHeader>
      ) : null}

      <BanterFab
        unreadCount={banter.unreadCount}
        onPress={() => banterSheetRef.current?.open()}
      />

      {/*
        ⚠ LAST IN THE TREE, so it covers the band, the pager AND the Banter FAB.
        A floating action button riding over a full-screen ceremony is the one
        thing that would break the takeover, and it is easy to miss because the
        FAB is rendered by a different part of this file.

        ⚠ GUARDED ON THE OPPONENT EXISTING. A bye has no one to walk out, and
        `duelPhase` has no opinion about that — it answers `revealable` for a bye
        week too, because the DRAW has opened either way. The ceremony is the
        wrong shape for "nobody was drawn against you", so the band's own bye
        copy handles it and the marker is never stamped.
      */}
      {/*
        ⚠ THE RESULT IS ALREADY ON THE SCREEN BEHIND THIS. The band, the Room
        and the leaderboard are all correct before it opens — see the sheet's
        own header. This animates news the member could already have read, which
        is what keeps it a flourish rather than a gate.
      */}
      <ShowdownRecapSheet recap={duelRecap} onSkip={dismissRecap} onReview={reviewRecap} />

      {walkoutOpen && duel.current?.them ? (
        <ShowdownWalkout
          matchweek={duel.current.matchweek}
          opponent={{
            name: duel.current.them.name,
            userId: duelStandings.get(duel.current.them.entryId)?.userId ?? null,
            /*
              ⚠ THE OPPONENT'S RECORD, FROM THE SAME `duelTable` THE DUELS
              LEADERBOARD RENDERS. Clue 1 has to agree with the board a member
              can open in two taps — a second derivation here is how the
              ceremony ends up announcing a record the standings contradict.

              ⚠ AND IT IS BUILT FROM SETTLED DUELS ONLY, so the seal costs it
              nothing: a week cannot settle without having locked, and a locked
              week is revealed.
            */
            record: {
              won: duel.duelTable.get(duel.current.them.entryId)?.won ?? 0,
              tied: duel.duelTable.get(duel.current.them.entryId)?.tied ?? 0,
              lost: duel.duelTable.get(duel.current.them.entryId)?.lost ?? 0,
            },
            duelPoints: duel.duelTable.get(duel.current.them.entryId)?.duelPoints ?? 0,
            rank: duelStandings.get(duel.current.them.entryId)?.rank ?? null,
          }}
          onClose={closeWalkout}
        />
      ) : null}

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

/**
 * One page of the horizontal pager: a vertical scroll view that reports its
 * offset to the screen's shared `scrollY`.
 *
 * ⚠ WHY EACH PAGE KEEPS ITS OWN OFFSET TOO.
 *
 * The naive version — one handler on every page writing straight to `scrollY` —
 * looks right until you swipe. Only the visible page emits scroll events, so
 * `scrollY` keeps whatever the PREVIOUS tab left there: swipe from a tab you
 * had scrolled 300pt down to one sitting at the top and the header stays
 * collapsed over a screen that is not scrolled, until you touch it.
 *
 * So each page remembers `mine` and pushes it into the shared value at the
 * moment it BECOMES the active page. `pageOffset` is already a shared value
 * driven by the pager, so the whole exchange happens on the UI thread with no
 * re-render — the same reason the tab pills read it instead of React state.
 *
 * ⚠ The guard inside `onScroll` matters as much as the reaction. A page that is
 * scrolled programmatically while off-screen (a refresh, a keyboard) would
 * otherwise write over the visible page's offset.
 */
function TabPage({
  index,
  width,
  pageOffset,
  scrollY,
  paddingTop,
  paddingBottom,
  refreshControl,
  children,
}: {
  index: number;
  width: number;
  pageOffset: SharedValue<number>;
  scrollY: SharedValue<number>;
  paddingTop: number;
  paddingBottom: number;
  refreshControl: React.ReactElement<RefreshControlProps>;
  children: React.ReactNode;
}) {
  const mine = useSharedValue(0);

  const handler = useAnimatedScrollHandler({
    onScroll: (e) => {
      'worklet';
      mine.value = e.contentOffset.y;
      if (Math.round(pageOffset.value) === index) scrollY.value = mine.value;
    },
  });

  useAnimatedReaction(
    () => Math.round(pageOffset.value) === index,
    (isActive, wasActive) => {
      'worklet';
      if (isActive && !wasActive) scrollY.value = mine.value;
    },
    [index],
  );

  return (
    <Animated.ScrollView
      style={{ width }}
      contentContainerStyle={{ paddingTop, paddingBottom, flexGrow: 1 }}
      onScroll={handler}
      scrollEventThrottle={16}
      refreshControl={refreshControl}
    >
      {children}
    </Animated.ScrollView>
  );
}
