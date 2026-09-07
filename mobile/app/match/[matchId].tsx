import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  type RefreshControlProps,
  Text as RNText,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MatchDetailHeader } from '@/components/match/MatchDetailHeader';
import {
  awayDisplayName,
  formattedFullDate,
  homeDisplayName,
  isKnockoutTie,
  MONO,
  MONO_BOLD,
  stageLabel,
} from '@/components/match/matchDisplay';
import { FormCard } from '@/components/match/FormCard';
import { LeaguePicksSection } from '@/components/match/LeaguePicksSection';
import { LeagueTableSliceCard } from '@/components/match/LeagueTableSliceCard';
import { LineupsTab } from '@/components/match/LineupsTab';
import { MatchTabBar } from '@/components/match/MatchTabBar';
import { ScoutingTab } from '@/components/match/ScoutingTab';
import { StatsTab } from '@/components/match/StatsTab';
import { SubstitutionIcon } from '@/components/match/SubstitutionIcon';
import { Icon, Text } from '@/components/ui';
import type { BracketStatsResponse, MatchStatsResponse } from '@/lib/api';
import { getCompetitionBand } from '@/lib/design/competitionBand';
import { displayPlayerName } from '@/lib/playerName';
import { fixturePalette } from '@/lib/design/clubColors';
import { matchTabs, type MatchTabKey } from '@/lib/matchTabs';
import { useManualRefresh } from '@/lib/useManualRefresh';
import {
  type BracketPickInfo,
  type GroupStanding,
  type MatchFacts,
  type MatchPredictionInfo,
  type TimelineEvent,
  useMatchDetail,
} from '@/lib/useMatchDetail';
import type { ResultsMatch } from '@/lib/useTournamentMatches';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// One match, in up to four answers
// =============================================================
// The screen used to be a single column under a fixed near-black header: every
// card competed for the same space, the score scrolled away, and a Premier
// League game looked exactly like a World Cup one.
//
// Now it is a competition-coloured band that collapses as you read, over a
// pager of tabs. The arrangement — band absolutely positioned and rendered
// AFTER the pager so sliding it up UNCOVERS content already underneath — is
// `pool/[id].tsx`'s, and the reasons are written out there and in
// `MatchDetailHeader`. Do not reorder them: rendering the band before the pager
// puts the scrolling content on top of it.
//
// ⚠ THE TAB SET ITSELF DEPENDS ON THE MATCH. Facts and Predictions are always
// there; Line-ups and Statistics appear only where migration 139 has rows —
// never for a World Cup match, and not for a league fixture the backfill has
// not reached. `matchTabs()` decides, and every index into the pager reads that
// computed list rather than a module constant.
//
// ⚠ AND WHAT EACH TAB HOLDS STILL DEPENDS ON THE COMPETITION, with one of them
// honest about being empty. A World Cup match has picks, crowd stats and a
// group table; a league fixture has a table slice, form and — once played — a
// timeline, line-ups and statistics, but NO picks, because league picks are
// pool-scoped and the phone does not read them yet. That is stated on the
// Predictions tab rather than papered over — see `YourPredictionsSection`.
// =============================================================

export default function MatchDetailScreen() {
  const theme = useTheme();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { width } = useWindowDimensions();
  const {
    match,
    predictionInfos,
    matchStats,
    bracketStats,
    groupStandings,
    timeline,
    facts,
    leaguePicks,
    leagueTablePicks,
    h2h,
    lineups,
    teamStats,
    leagueContext,
    loading,
    error,
    refresh,
  } = useMatchDetail(matchId);
  // Pull-to-refresh: spinner bound to the user gesture only. Tying the
  // RefreshControl to `loading` also flips it on the initial fetch, which
  // flashed the iOS pull-down circle every time the screen opened.
  const { refreshing, onRefresh } = useManualRefresh(refresh);

  const [tab, setTab] = useState<MatchTabKey>('facts');
  /**
   * ⚠ THE TAB SET IS PER MATCH, NOT PER APP. Line-ups and Statistics exist only
   * where migration 139 has rows — never for a World Cup match, and not for a
   * league fixture the backfill has not reached. Memoised because it is a
   * dependency of the effect that drives the pager.
   */
  const tabs = useMemo(
    () =>
      matchTabs({
        hasLineups: lineups.length > 0,
        hasStats: teamStats.length > 0,
        // ⚠ The SERVER decides this — see `matchTabs`.
        hasScouting: h2h?.enough === true,
      }),
    [lineups.length, teamStats.length, h2h?.enough],
  );
  const tabIndex = Math.max(0, tabs.indexOf(tab));

  /**
   * ⚠ FALL BACK WHEN THE SET SHRINKS UNDER THE ACTIVE TAB. The tabs appear when
   * the line-up read resolves and can disappear again on a refresh that returns
   * none — leaving `tab` naming a page the pager no longer has, and
   * `tabs.indexOf` returning -1. Facts always exists, so it is the floor.
   */
  useEffect(() => {
    if (!tabs.includes(tab)) setTab('facts');
  }, [tabs, tab]);

  /**
   * Fractional page offset of the pager, on the UI thread.
   *
   * Written by `scrollHandler` every scroll frame and read by the tab strip via
   * `useAnimatedReaction`, so following a swipe costs no React re-render of
   * this screen or any mounted tab.
   */
  const pageOffset = useSharedValue(0);
  /**
   * Vertical scroll of whichever tab is on screen, so the band can collapse.
   *
   * ⚠ IT LIVES HERE BECAUSE NOTHING ELSE COULD OWN IT. The band sits outside
   * the pager and every tab is its own ScrollView, so no single scroll position
   * exists. Each page writes its own offset in and hands it over when it
   * becomes the active page — see `TabPage`.
   */
  const scrollY = useSharedValue(0);
  /**
   * The band's expanded height.
   *
   * ⚠ The band FLOATS over the pager — that is what lets it slide without a
   * layout pass — so nothing reserves its space. Every page pads by this, or
   * its first screenful sits underneath the header.
   */
  const [bandHeight, setBandHeight] = useState(0);

  const pagerRef = useRef<Animated.ScrollView | null>(null);
  // When a tab change comes from a swipe the pager has already settled at the
  // target page, so the effect below would re-animate to where we already are —
  // a visible hitch at the end of every swipe. This skips that one scrollTo;
  // strip taps leave it false and still animate.
  const skipPagerScrollRef = useRef(false);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      'worklet';
      if (width > 0) pageOffset.value = e.contentOffset.x / width;
    },
  });

  useEffect(() => {
    if (skipPagerScrollRef.current) {
      skipPagerScrollRef.current = false;
      return;
    }
    pagerRef.current?.scrollTo({ x: tabIndex * width, animated: true });
  }, [tabIndex, width]);

  function handleMomentumScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width <= 0) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    const next = tabs[i];
    if (next && next !== tab) {
      skipPagerScrollRef.current = true;
      setTab(next);
    }
  }

  function renderTab(key: MatchTabKey, m: ResultsMatch) {
    switch (key) {
      case 'facts':
        return (
          <View style={{ gap: 16 }}>
            {/*
              ⚠ MATCH FACTS FIRST, AND IT IS THE ONLY CARD THAT IS ALWAYS HERE.
              The timeline led this tab until now, which meant a fixture that
              had not kicked off opened on nothing at all — every other card is
              conditional, so the first thing on the screen changed depending on
              whether the game had started. The stage, the date and the ground
              are known from the moment a fixture exists, so they are the stable
              top of the tab and everything else stacks under them.
            */}
            <MatchInfoCard match={m} facts={facts} />
            {timeline.length > 0 ? <TimelineCard match={m} events={timeline} facts={facts} /> : null}
            {/*
              Form, then the table, and only on a league fixture — build-up
              before standings, because a member opening a fixture is asking
              about these two clubs before they are asking about the division.
              The World Cup keeps its group card below, unchanged.
            */}
            {leagueContext && hasForm(leagueContext) ? (
              <FormCard
                homeName={homeDisplayName(m)}
                awayName={awayDisplayName(m)}
                homeForm={leagueContext.homeForm}
                awayForm={leagueContext.awayForm}
                homeFeedForm={leagueContext.homeFeedForm}
                awayFeedForm={leagueContext.awayFeedForm}
                earlier={leagueContext.earlier}
                match={m}
              />
            ) : null}
            {leagueContext?.rows && leagueContext.table ? (
              <LeagueTableSliceCard
                rows={leagueContext.rows}
                competition={leagueContext.table.competition}
                competitionId={m.competitionId}
                seasonId={leagueContext.table.season_id}
              />
            ) : null}
            {groupStandings.length > 0 ? (
              <GroupStandingsCard groupLetter={m.groupLetter} standings={groupStandings} />
            ) : null}
          </View>
        );
      case 'lineups':
        return (
          <LineupsTab
            lineups={lineups}
            homeName={m.homeTeam?.shortName ?? homeDisplayName(m)}
            awayName={m.awayTeam?.shortName ?? awayDisplayName(m)}
            homeTeam={m.homeTeam}
            awayTeam={m.awayTeam}
          />
        );
      case 'stats':
        return (
          <StatsTab
            stats={teamStats}
            homeName={m.homeTeam?.shortName ?? homeDisplayName(m)}
            awayName={m.awayTeam?.shortName ?? awayDisplayName(m)}
            homeTeam={m.homeTeam}
            awayTeam={m.awayTeam}
          />
        );
      case 'scouting':
        return h2h ? (
          <ScoutingTab
            match={m}
            summary={h2h.summary}
            homeName={m.homeTeam?.shortName ?? homeDisplayName(m)}
            awayName={m.awayTeam?.shortName ?? awayDisplayName(m)}
            palette={fixturePalette(m.homeTeam?.flagUrl, m.awayTeam?.flagUrl, {
              home: theme.colors.primary,
              away: theme.colors.accent,
            })}
          />
        ) : null;
      case 'predictions':
        // ⚠ TWO DIFFERENT SECTIONS, NOT ONE WITH A BRANCH INSIDE. A league pick
        // and a World Cup prediction share no shape: one is a scoreline OR an
        // outcome scored into four tiers, the other carries a bracket pick, PSO
        // scores and crowd stats. `roundNumber` is the competition test used
        // everywhere else on this screen.
        return m.roundNumber !== null ? (
          <LeaguePicksSection
            match={m}
            picks={leaguePicks}
            tablePicks={leagueTablePicks}
            // The live table is already derived for the Facts tab's slice; the
            // table-pick card reuses it rather than fetching a second copy.
            table={leagueContext?.table ?? null}
          />
        ) : (
          <View style={{ gap: 16 }}>
            <YourPredictionsSection match={m} predictionInfos={predictionInfos} />
            {(matchStats && matchStats.total_predictions > 0) ||
            hasBracketGroupStats(bracketStats) ? (
              <PredictionStatsSection match={m} stats={matchStats} bracketStats={bracketStats} />
            ) : null}
          </View>
        );
    }
  }

  if (loading && !match) {
    return (
      <FallbackShell>
        <ActivityIndicator color={theme.colors.primary} />
      </FallbackShell>
    );
  }

  if (!match) {
    return (
      <FallbackShell>
        <Text variant="cardTitle" align="center">
          Unable to load match
        </Text>
        <Text variant="body" color="slate" align="center">
          {error ?? 'This match could not be found.'}
        </Text>
      </FallbackShell>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <StatusBar style="light" animated />

      <Animated.ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        style={{ flex: 1 }}
      >
        {tabs.map((key, i) => (
          <TabPage
            key={key}
            index={i}
            width={width}
            pageOffset={pageOffset}
            scrollY={scrollY}
            paddingTop={bandHeight + 16}
            paddingBottom={theme.spacing.xxxl}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.primary}
                progressViewOffset={bandHeight}
              />
            }
          >
            {renderTab(key, match)}
          </TabPage>
        ))}
      </Animated.ScrollView>

      {/*
        ⚠ AFTER THE PAGER, AND THAT IS THE WHOLE TRICK. The band is absolutely
        positioned and floats over the content, so sliding it up UNCOVERS what
        was already underneath — no height animates, nothing re-lays out, and it
        runs on the compositor. Rendering it before the pager would put the
        scrolling content on top of it.
      */}
      <MatchDetailHeader
        match={match}
        scrollY={scrollY}
        timeline={timeline}
        onExpandedHeight={setBandHeight}
      >
        <MatchTabBar active={tab} tabs={tabs} onChange={setTab} pageOffset={pageOffset} />
      </MatchDetailHeader>
    </View>
  );
}

/**
 * Loading and not-found, with a way back out.
 *
 * ⚠ THE BACK BUTTON IS THE POINT. These states used to render inside the old
 * always-present header; the band needs a match to colour itself, so without
 * this a failed load would be a dead end with no way off the screen. The band
 * here is the neutral `UNTHEMED_COMPETITION` one, because at this moment we
 * genuinely do not know which competition it is.
 */
function FallbackShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [left, right] = getCompetitionBand(null);
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <StatusBar style="light" animated />
      <LinearGradient
        colors={[left, right]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ paddingTop: insets.top + theme.spacing.xs }}
      >
        <View
          style={{
            height: 34,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: theme.spacing.lg,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => ({
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: 'rgba(255,255,255,0.14)',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Icon name="chevron.left" size={15} tint="#FFFFFF" weight="semibold" />
          </Pressable>
        </View>
      </LinearGradient>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          gap: 12,
        }}
      >
        {children}
      </View>
    </View>
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
 * had scrolled 300pt down to one sitting at the top and the band stays
 * collapsed over a screen that is not scrolled, until you touch it.
 *
 * So each page remembers `mine` and pushes it into the shared value at the
 * moment it BECOMES the active page. `pageOffset` is already a shared value
 * driven by the pager, so the whole exchange happens on the UI thread with no
 * re-render — the same reason the strip's pills read it instead of React state.
 *
 * ⚠ The guard inside `onScroll` matters as much as the reaction. A page that is
 * scrolled programmatically while off-screen (a refresh, a keyboard) would
 * otherwise write over the visible page's offset.
 *
 * Lifted from `pool/[id].tsx`, where the same three sentences are written out
 * at pool scale.
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

/**
 * Has this fixture anything to say about form?
 *
 * ⚠ THE FEED STRING COUNTS, NOT JUST THE DERIVED RESULTS. A member opening the
 * first fixture of a season has no prior games in memory, but the table may
 * still carry last season's tail in `form` — and the card renders that. Testing
 * only `homeForm.length` would hide a populated card.
 */
function hasForm(ctx: NonNullable<ReturnType<typeof useMatchDetail>['leagueContext']>): boolean {
  return (
    ctx.homeForm.length > 0 ||
    ctx.awayForm.length > 0 ||
    ctx.homeFeedForm.length > 0 ||
    ctx.awayFeedForm.length > 0 ||
    ctx.earlier !== null
  );
}

// MARK: - Match Info Card

function MatchInfoCard({ match, facts }: { match: ResultsMatch; facts: MatchFacts | null }) {
  const theme = useTheme();
  // The `emoji` field these rows used to carry is gone with it — it had not been
  // rendered since the card moved onto `Icon`, and a dead field on a type is a
  // thing the next reader has to disprove.
  const rows: { icon: string; label: string }[] = [
    { icon: 'sportscourt', label: stageLabel(match) },
    { icon: 'calendar', label: formattedFullDate(match.matchDate) },
  ];
  if (match.venue) {
    rows.push({ icon: 'mappin.and.ellipse', label: match.venue });
  }
  // ⚠ ONLY WHEN IT EXISTS. The referee arrives on the api-football payload and
  // is written by the league sync from migration 136 onwards, so every fixture
  // played before that has none — and a row reading "Referee —" is worse than
  // no row at all.
  //
  // ⚠ AND IT IS LABELLED, BECAUSE A NAME ALONE DOES NOT SAY WHAT IT IS. Every
  // other row here is self-describing — a date reads as a date, a ground as a
  // ground — but "C. Kavanagh" beside a two-people glyph could be anybody.
  //
  // ⚠ THE FEED ABBREVIATES IT AND THERE IS NO FULLER FORM TO SHOW. All 132
  // referees stored on 2026-09-07 are an initial and a surname, and the live
  // `/fixtures` payload sends "S. Barrott" at source with no other referee
  // field on the fixture. So this is the whole name the provider has.
  if (facts?.referee) {
    rows.push({ icon: 'person.2.fill', label: `Referee · ${facts.referee}` });
  }
  // ⚠ HALF TIME IS DELIBERATELY NOT HERE. It is a moment in the match, not a
  // fact about the fixture, and the timeline marks it in place — on the line,
  // between the events either side of it, which is where it means something.
  // Repeating it in a list of stage/date/ground read as a fifth attribute of
  // the ground. `facts.halfTimeHome/Away` are still loaded and still used
  // there; only this row is gone.

  return (
    <View
      style={{
        marginHorizontal: 20,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        ...theme.shadows.card,
        overflow: 'hidden',
      }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 }}>
        <Text variant="cardTitle">Match Facts</Text>
      </View>
      {rows.map((r) => (
        <View key={r.icon}>
          <View
            style={{
              height: 0.5,
              marginHorizontal: 14,
              backgroundColor: withOpacity(theme.colors.mist, 0.5),
            }}
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <View style={{ width: 24, height: 16, alignItems: 'flex-start', justifyContent: 'center' }}>
              <Icon name={r.icon} size={14} tint={theme.colors.slate} weight="medium" />
            </View>
            <RNText
              style={{
                flex: 1,
                fontFamily: fontFamilies.medium,
                fontSize: 14,
                color: theme.colors.ink,
              }}
            >
              {r.label}
            </RNText>
          </View>
        </View>
      ))}
    </View>
  );
}

// MARK: - Timeline

/**
 * What happened, in two columns.
 *
 * ⚠ HOME LEFT, AWAY RIGHT, AND THE SIDE IS READ NOT DERIVED. `match_events.side`
 * is the side CREDITED — for an own goal that is the opposite of the team the
 * provider attributed it to, and the mapper has already flipped it. Deriving the
 * column from anything else here would put own goals in the wrong half and make
 * the timeline disagree with the scoreline above it.
 */
function TimelineCard({
  match,
  events,
  facts,
}: {
  match: ResultsMatch;
  events: TimelineEvent[];
  facts: MatchFacts | null;
}) {
  const theme = useTheme();

  const goals = events.filter(
    (e) => e.kind === 'goal' || e.kind === 'penalty' || e.kind === 'own_goal',
  ).length;

  // Half time is drawn where it happened rather than at a fixed index: a first
  // half can run to 45+7, and the marker belongs after the last of those.
  const htIndex = events.findIndex((e) => e.minute > 45);
  const showHt =
    facts?.halfTimeHome != null && facts?.halfTimeAway != null && htIndex > 0;

  return (
    <View
      style={{
        marginHorizontal: 20,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        ...theme.shadows.card,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 10,
        }}
      >
        <Text variant="cardTitle">Timeline</Text>
        <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11, color: theme.colors.slate }}>
          {goals === 1 ? '1 goal' : `${goals} goals`}
        </RNText>
      </View>
      <View
        style={{ height: 0.5, marginHorizontal: 14, backgroundColor: withOpacity(theme.colors.mist, 0.6) }}
      />
      {/*
        ⚠ THE LINE IS DRAWN ONCE, BEHIND EVERYTHING, not per row. A border on
        each row would break at every gap and every half-time marker, and the
        seams show. This is one hairline spanning the whole list, with the rows
        rendered over it — so each chip's opaque fill reads as the line passing
        behind it.

        ⚠ It is inset top and bottom so the spine does not run out of the card
        into the header rule; a timeline that touches its own edges looks like a
        list that was cut off.
      */}
      <View style={{ paddingVertical: 8 }}>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 14,
            bottom: 14,
            // The rail is centred in the row, and the row is inset 16 either
            // side — so the line's own centre is that same axis.
            left: '50%',
            width: 1,
            marginLeft: -0.5,
            backgroundColor: withOpacity(theme.colors.mist, 0.9),
          }}
        />
        {events.map((e, i) => (
          <View key={`${e.minute}-${i}`}>
            {showHt && i === htIndex ? (
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <RNText
                  style={{
                    fontFamily: fontFamilies.bold,
                    fontSize: 10,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    color: theme.colors.slate,
                    backgroundColor: theme.colors.snow,
                    paddingHorizontal: 10,
                    paddingVertical: 3,
                    borderRadius: 999,
                    overflow: 'hidden',
                  }}
                >
                  Half time · {facts!.halfTimeHome}–{facts!.halfTimeAway}
                </RNText>
              </View>
            ) : null}
            <TimelineRow event={e} match={match} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The mark for one kind of event.
 *
 * ⚠ HUGEICONS, NOT EMOJI, and the difference is not cosmetic. An emoji is
 * rendered by the PLATFORM: ⚽ and 🟨 are a different size, weight and colour on
 * iOS and Android, they ignore the theme entirely, and 🟥 for a second yellow
 * said the same thing as a straight red. These are the app's own icon set, at
 * the app's own colours, identical on both platforms.
 *
 * ⚠ FILLED, NOT OUTLINE — BY TWO DIFFERENT ROUTES, WHICH IS NOT AN
 * INCONSISTENCY. At 13px inside a 26px chip a stroke glyph reads as
 * decoration, so every mark here is painted. Most use `solid`, which swaps in
 * a purpose-drawn Pro glyph. The CARD cannot: `RectangleVerticalIcon` has no
 * Pro solid variant at all, so it uses `filled`, which paints the free glyph's
 * closed path. A hollow rectangle is simply the wrong drawing for a booking.
 */
function eventGlyph(
  kind: TimelineEvent['kind'],
  theme: ReturnType<typeof useTheme>,
): { icon: string | null; tint: string; muted: boolean; fill: 'solid' | 'filled' } {
  switch (kind) {
    case 'goal':
    case 'penalty':
      return { icon: 'sportscourt.fill', tint: theme.colors.ink, muted: false, fill: 'solid' };
    case 'own_goal':
      // A goal, but for the other side. The column already places it on the
      // side it COUNTED for (the mapper does not flip it), so the colour is
      // what says whose misfortune it was.
      return { icon: 'sportscourt.fill', tint: theme.colors.red, muted: false, fill: 'solid' };
    case 'yellow':
      return { icon: 'rectangle.portrait.fill', tint: theme.colors.amber, muted: false, fill: 'filled' };
    case 'red':
    case 'second_yellow':
      return { icon: 'rectangle.portrait.fill', tint: theme.colors.red, muted: false, fill: 'filled' };
    case 'var_goal_cancelled':
      // VAR is literally a video assistant referee, so the video glyph is the
      // exact thing rather than an approximation.
      return { icon: 'video.fill', tint: theme.colors.slate, muted: true, fill: 'solid' };
    case 'subst':
      // ⚠ NO ICON NAME. A substitution is drawn by `SubstitutionIcon`, which
      // paints its two arrows in two colours and mirrors for the away side —
      // neither of which a single `ICON_MAP` entry can express. `tint` here is
      // only the chip's ring.
      return { icon: null, tint: theme.colors.slate, muted: true, fill: 'solid' };
  }
}

/** A qualifier the name alone does not carry. Null when there is nothing to add. */
function eventNote(e: TimelineEvent): string | null {
  switch (e.kind) {
    case 'penalty':
      return 'pen';
    case 'own_goal':
      return 'OG';
    case 'second_yellow':
      return '2nd yellow';
    case 'var_goal_cancelled':
      return 'disallowed';
    case 'subst':
      return e.relatedName ? displayPlayerName(e.relatedName) : null;
    case 'goal':
      return e.relatedName ? displayPlayerName(e.relatedName) : null;
    default:
      return null;
  }
}

const RAIL = 44;
const CHIP = 26;

/**
 * The minute's own column, one either side of the rail.
 *
 * ⚠ FIXED, AND PRESENT ON BOTH SIDES EVEN WHEN EMPTY. The minute belongs beside
 * the icon, but it can only sit on the side the event happened on — and a slot
 * that exists on one side only would push the rail off centre by its width and
 * bend the line row to row. So both are always reserved and one is always
 * blank, which is what keeps the spine dead straight.
 *
 * Wide enough for the longest value the feed produces: `90+7'` at 10pt mono.
 */
const MINUTE_COL = 34;

function TimelineRow({ event, match }: { event: TimelineEvent; match: ResultsMatch }) {
  const theme = useTheme();
  const isHome = event.side === 'home';
  const { icon, tint, muted, fill } = eventGlyph(event.kind, theme);
  const note = eventNote(event);
  const minute = `${event.minute}${event.extraMinute ? `+${event.extraMinute}` : ''}'`;

  const isSub = event.kind === 'subst';

  /**
   * The player, and the qualifier the name alone does not carry.
   *
   * ⚠ A SUBSTITUTION IS TWO PLAYERS, NOT A PLAYER AND A FOOTNOTE. Everywhere
   * else the second line is a qualifier — "disallowed", "pen", an assist — and
   * is deliberately quieter than the name above it. A substitution is not that
   * shape: both lines are people, equally involved, so they take the same size
   * and weight and are told apart by COLOUR instead.
   *
   * ⚠ RED IS THE ONE GOING OFF AND GREEN THE ONE COMING ON, matching the two
   * arrows in the chip beside them. `playerName` is the departing player and
   * `relatedName` the arriving one — verified by player id across 26
   * substitutions, and NOT re-checkable by name, because `/events` and
   * `/lineups` abbreviate differently. See `eventsToTimeline`.
   */
  const detail = (
    <View style={{ flex: 1, alignItems: isHome ? 'flex-end' : 'flex-start', gap: 1 }}>
      <RNText
        numberOfLines={1}
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 13,
          color: isSub ? theme.colors.red : muted ? theme.colors.slate : theme.colors.ink,
          textDecorationLine: event.kind === 'var_goal_cancelled' ? 'line-through' : 'none',
          textAlign: isHome ? 'right' : 'left',
        }}
      >
        {event.playerName ? displayPlayerName(event.playerName) : '—'}
      </RNText>
      {note ? (
        <RNText
          numberOfLines={1}
          style={{
            fontFamily: isSub ? fontFamilies.semibold : fontFamilies.medium,
            fontSize: isSub ? 13 : 11,
            color: isSub ? theme.colors.green : theme.colors.slate,
            textAlign: isHome ? 'right' : 'left',
          }}
        >
          {note}
        </RNText>
      ) : null}
    </View>
  );

  /**
   * The minute, hard against the rail on the event's own side.
   *
   * ⚠ ALIGNED TOWARDS THE CHIP, not centred in its column — `flex-end` on the
   * left and `flex-start` on the right — so it reads as attached to the icon
   * rather than floating between the icon and the name.
   */
  const minuteCell = (side: 'left' | 'right') => (
    <View
      style={{
        width: MINUTE_COL,
        alignItems: side === 'left' ? 'flex-end' : 'flex-start',
        paddingHorizontal: 4,
      }}
    >
      {(side === 'left') === isHome ? (
        <RNText
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: theme.colors.slate,
            fontVariant: ['tabular-nums'],
          }}
        >
          {minute}
        </RNText>
      ) : null}
    </View>
  );

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 5,
      }}
      // ⚠ COLOUR CANNOT CARRY THIS TO A SCREEN READER, so the substitution
      // spells out which player went which way.
      accessibilityLabel={
        isSub
          ? `${minute} substitution, ${event.playerName ?? 'unknown'} off, ${
              event.relatedName ?? 'unknown'
            } on, ${isHome ? homeDisplayName(match) : awayDisplayName(match)}`
          : `${minute} ${event.kind} ${event.playerName ?? ''} ${
              isHome ? homeDisplayName(match) : awayDisplayName(match)
            }`
      }
    >
      {isHome ? detail : <View style={{ flex: 1 }} />}
      {minuteCell('left')}

      {/* The chip sits ON the line. Its opaque fill is what makes the line look
          like it passes behind it rather than stopping at it. */}
      <View style={{ width: RAIL, alignItems: 'center' }}>
        <View
          style={{
            width: CHIP,
            height: CHIP,
            borderRadius: CHIP / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.surface,
            borderWidth: 1.5,
            borderColor: withOpacity(tint, muted ? 0.25 : 0.45),
          }}
        >
          {icon === null ? (
            // ⚠ MIRRORED FOR THE AWAY SIDE so the red "off" arrow points at the
            // column the departing player's name is in.
            <SubstitutionIcon size={14} flip={!isHome} />
          ) : (
            /* A card is drawn a touch smaller: a portrait rectangle at the same
               nominal size reads bigger than a round glyph beside it. */
            <Icon
              name={icon}
              size={fill === 'filled' ? 12 : 13}
              tint={tint}
              solid={fill === 'solid'}
              filled={fill === 'filled'}
            />
          )}
        </View>
      </View>

      {minuteCell('right')}
      {isHome ? <View style={{ flex: 1 }} /> : detail}
    </View>
  );
}

// MARK: - Group Standings

function GroupStandingsCard({
  groupLetter,
  standings,
}: {
  groupLetter: string | null;
  standings: GroupStanding[];
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 12 }}>
      <RNText
        style={{
          marginHorizontal: 20,
          fontFamily: fontFamilies.bold,
          fontSize: 16,
          color: theme.colors.ink,
        }}
      >
        Group {groupLetter ?? ''} Standings
      </RNText>
      <View
        style={{
          marginHorizontal: 20,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.lg,
          ...theme.shadows.card,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <RNText style={[headerCell, { width: 24, color: theme.colors.slate }]}>#</RNText>
          <RNText style={[headerCell, { flex: 1, color: theme.colors.slate, textAlign: 'left' }]}>
            Team
          </RNText>
          <RNText style={[headerCell, { width: 28, color: theme.colors.slate }]}>P</RNText>
          <RNText style={[headerCell, { width: 34, color: theme.colors.slate }]}>GD</RNText>
          <RNText style={[headerCell, { width: 34, color: theme.colors.slate }]}>Pts</RNText>
        </View>
        <View
          style={{
            height: 0.5,
            marginHorizontal: 12,
            backgroundColor: theme.colors.mist,
          }}
        />
        {standings.map((s, i) => {
          const position = i + 1;
          const positionColor =
            position <= 2 ? theme.colors.green : position === 3 ? theme.colors.amber : theme.colors.slate;
          const rowBg =
            position <= 2
              ? withOpacity(theme.colors.green, 0.04)
              : position === 3
                ? withOpacity(theme.colors.amber, 0.04)
                : 'transparent';
          return (
            <View key={s.teamId}>
              {i > 0 ? (
                <View
                  style={{
                    height: 0.5,
                    marginHorizontal: 12,
                    backgroundColor: withOpacity(theme.colors.mist, 0.5),
                  }}
                />
              ) : null}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: rowBg,
                }}
              >
                <RNText
                  style={{
                    width: 24,
                    textAlign: 'center',
                    fontFamily: MONO_BOLD,
                    fontSize: 12,
                    color: positionColor,
                  }}
                >
                  {position}
                </RNText>
                {s.flagUrl ? (
                  <Image
                    source={{ uri: s.flagUrl }}
                    style={{ width: 22, height: 15, borderRadius: 3, marginRight: 8 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <View
                    style={{
                      width: 22,
                      height: 15,
                      borderRadius: 3,
                      marginRight: 8,
                      backgroundColor: theme.colors.mist,
                    }}
                  />
                )}
                <RNText
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    fontFamily: fontFamilies.medium,
                    fontSize: 13,
                    color: theme.colors.ink,
                  }}
                >
                  {s.teamName}
                </RNText>
                <RNText
                  style={{
                    width: 28,
                    textAlign: 'center',
                    fontFamily: MONO,
                    fontSize: 12,
                    color: theme.colors.slate,
                  }}
                >
                  {s.played}
                </RNText>
                <RNText
                  style={{
                    width: 34,
                    textAlign: 'center',
                    fontFamily: MONO,
                    fontSize: 12,
                    color:
                      s.goalDifference > 0
                        ? theme.colors.green
                        : s.goalDifference < 0
                          ? theme.colors.red
                          : theme.colors.slate,
                  }}
                >
                  {s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference}
                </RNText>
                <RNText
                  style={{
                    width: 34,
                    textAlign: 'center',
                    fontFamily: MONO_BOLD,
                    fontSize: 13,
                    color: theme.colors.ink,
                  }}
                >
                  {s.points}
                </RNText>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const headerCell = {
  fontFamily: fontFamilies.semibold,
  fontSize: 10,
  textAlign: 'center' as const,
};

// MARK: - Prediction Stats ("How Others Predicted")

function hasBracketGroupStats(bracketStats: BracketStatsResponse | null): boolean {
  const gp = bracketStats?.group_predictions;
  if (!gp) return false;
  const home = gp.home_team?.total_predictions ?? 0;
  const away = gp.away_team?.total_predictions ?? 0;
  return home > 0 || away > 0;
}

function PredictionStatsSection({
  match,
  stats,
  bracketStats,
}: {
  match: ResultsMatch;
  stats: MatchStatsResponse | null;
  bracketStats: BracketStatsResponse | null;
}) {
  const theme = useTheme();
  const hasScoreStats = stats !== null && stats.total_predictions > 0;
  const showBracket = hasBracketGroupStats(bracketStats);
  return (
    <View style={{ gap: 12 }}>
      <RNText
        style={{
          marginHorizontal: 20,
          fontFamily: fontFamilies.bold,
          fontSize: 16,
          color: theme.colors.ink,
        }}
      >
        How Others Predicted
      </RNText>
      {hasScoreStats && stats ? (
        <>
          <ResultDistributionCard match={match} stats={stats} />
          {stats.top_scores.length > 0 ? <TopScoresCard stats={stats} /> : null}
          {stats.exact_correct_pct !== null || stats.result_correct_pct !== null ? (
            <AccuracyCard stats={stats} />
          ) : null}
        </>
      ) : null}
      {showBracket && bracketStats?.group_predictions ? (
        <BracketGroupPositionsCard prediction={bracketStats.group_predictions} />
      ) : null}
    </View>
  );
}

function ResultDistributionCard({
  match,
  stats,
}: {
  match: ResultsMatch;
  stats: MatchStatsResponse;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        marginHorizontal: 20,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: 16,
        gap: 12,
        ...theme.shadows.card,
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 12,
          color: theme.colors.slate,
        }}
      >
        {stats.total_predictions} predictions
      </RNText>
      <ResultBar stats={stats} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <ResultLabel
          team={match.homeTeam?.countryName ?? stats.home_team ?? 'Home'}
          pct={stats.home_win_pct}
          color={theme.colors.primary}
          align="flex-start"
        />
        <ResultLabel team="Draw" pct={stats.draw_pct} color={theme.colors.slate} align="center" />
        <ResultLabel
          team={match.awayTeam?.countryName ?? stats.away_team ?? 'Away'}
          pct={stats.away_win_pct}
          color={theme.colors.red}
          align="flex-end"
        />
      </View>
    </View>
  );
}

function ResultBar({ stats }: { stats: MatchStatsResponse }) {
  const theme = useTheme();
  return (
    <View
      style={{
        height: 8,
        flexDirection: 'row',
        gap: 2,
        overflow: 'hidden',
      }}
    >
      {stats.home_win_pct > 0 ? (
        <View
          style={{
            flex: stats.home_win_pct,
            backgroundColor: theme.colors.primary,
            borderRadius: 4,
          }}
        />
      ) : null}
      {stats.draw_pct > 0 ? (
        <View
          style={{
            flex: stats.draw_pct,
            backgroundColor: withOpacity(theme.colors.slate, 0.4),
            borderRadius: 4,
          }}
        />
      ) : null}
      {stats.away_win_pct > 0 ? (
        <View
          style={{
            flex: stats.away_win_pct,
            backgroundColor: theme.colors.red,
            borderRadius: 4,
          }}
        />
      ) : null}
    </View>
  );
}

function ResultLabel({
  team,
  pct,
  color,
  align,
}: {
  team: string;
  pct: number;
  color: string;
  align: 'flex-start' | 'center' | 'flex-end';
}) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: align, gap: 2 }}>
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 20,
          color,
          fontVariant: ['tabular-nums'],
        }}
      >
        {Math.round(pct * 100)}%
      </RNText>
      <RNText
        numberOfLines={1}
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 10,
          color: theme.colors.slate,
          textAlign: align === 'center' ? 'center' : align === 'flex-start' ? 'left' : 'right',
        }}
      >
        {team}
      </RNText>
    </View>
  );
}

function TopScoresCard({ stats }: { stats: MatchStatsResponse }) {
  const theme = useTheme();
  return (
    <View
      style={{
        marginHorizontal: 20,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: 16,
        gap: 10,
        ...theme.shadows.card,
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 14,
          color: theme.colors.ink,
        }}
      >
        Most Predicted Scores
      </RNText>
      {stats.top_scores.slice(0, 5).map((s) => (
        <View
          key={`${s.home}-${s.away}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
        >
          <RNText
            style={{
              width: 44,
              fontFamily: MONO_BOLD,
              fontSize: 14,
              color: theme.colors.ink,
            }}
          >
            {s.home} - {s.away}
          </RNText>
          <View
            style={{
              flex: 1,
              height: 6,
              backgroundColor: withOpacity(theme.colors.primary, 0.15),
              borderRadius: 3,
            }}
          >
            <View
              style={{
                width: `${Math.max(2, Math.round(s.pct * 100))}%`,
                height: '100%',
                backgroundColor: theme.colors.primary,
                borderRadius: 3,
              }}
            />
          </View>
          <RNText
            style={{
              width: 28,
              textAlign: 'right',
              fontFamily: MONO,
              fontSize: 11,
              color: theme.colors.slate,
            }}
          >
            {s.count}
          </RNText>
          <RNText
            style={{
              width: 40,
              textAlign: 'right',
              fontFamily: fontFamilies.medium,
              fontSize: 10,
              color: theme.colors.slate,
            }}
          >
            ({Math.round(s.pct * 100)}%)
          </RNText>
        </View>
      ))}
    </View>
  );
}

function BracketGroupPositionsCard({
  prediction,
}: {
  prediction: NonNullable<BracketStatsResponse['group_predictions']>;
}) {
  const theme = useTheme();
  const teams = [prediction.home_team, prediction.away_team].filter(
    (t): t is NonNullable<typeof t> => t !== null && t.total_predictions > 0,
  );
  if (teams.length === 0) return null;
  const total = teams[0].total_predictions;
  return (
    <View
      style={{
        marginHorizontal: theme.spacing.xl,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        gap: theme.spacing.lg,
        ...theme.shadows.card,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: theme.spacing.md,
        }}
      >
        <Text variant="cardTitle">Predicted Group Finish</Text>
        <Text variant="detail" color="slate">
          {total.toLocaleString()} {total === 1 ? 'pick' : 'picks'}
        </Text>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        {teams.map((team) => (
          <PositionBar key={team.team_id} team={team} />
        ))}
      </View>

      {/* Legend pinned bottom-right — matches the Group Standings color
          language (1st & 2nd green, 3rd amber, 4th slate) so it reinforces
          what the bar colors mean without competing with the title row. */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
          gap: theme.spacing.md,
        }}
      >
        <LegendSwatch label="1st" color={theme.colors.green} />
        <LegendSwatch label="2nd" color={withOpacity(theme.colors.green, 0.55)} />
        <LegendSwatch label="3rd" color={theme.colors.amber} />
        <LegendSwatch label="4th" color={theme.colors.slate} />
      </View>
    </View>
  );
}

function LegendSwatch({ label, color }: { label: string; color: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: theme.radii.sm / 4,
          backgroundColor: color,
        }}
      />
      <Text variant="detail" color="slate">
        {label}
      </Text>
    </View>
  );
}

function PositionBar({
  team,
}: {
  team: NonNullable<
    NonNullable<BracketStatsResponse['group_predictions']>['home_team']
  >;
}) {
  const theme = useTheme();
  // Match the Group Standings card's color language (sitting just above
  // this on the same screen): top 2 green, 3rd amber, 4th slate. The user
  // already learned what these colors mean reading standings.
  const positionColor: Record<'1' | '2' | '3' | '4', string> = {
    '1': theme.colors.green,
    '2': withOpacity(theme.colors.green, 0.55),
    '3': theme.colors.amber,
    '4': theme.colors.slate,
  };

  // Drop inline labels under ~14% so the bar doesn't get crowded.
  const labelThreshold = 0.14;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        {team.flag_url ? (
          <Image
            source={{ uri: team.flag_url }}
            style={{ width: 22, height: 15, borderRadius: 2 }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View
            style={{ width: 22, height: 15, borderRadius: 2, backgroundColor: theme.colors.mist }}
          />
        )}
        <Text variant="body" style={{ flex: 1, fontFamily: fontFamilies.semibold }}>
          {team.team_name ?? 'Team'}
        </Text>
      </View>

      {(() => {
        // Build the list of visible segments first so we know which one is
        // the leftmost vs rightmost (those get the larger outer radius).
        // Segments are also separated by a 2px gap, so each one carries its
        // own radii on both sides.
        const visible = (['1', '2', '3', '4'] as const).filter(
          (pos) => team.position_pcts[pos] > 0,
        );
        // `sm` (12) on a 28-tall bar reads as a clear quarter-curve without
        // clamping to a pill. `xs` (6) for the segment-to-segment corners
        // gives a distinctly subtler curve so the outer/inner hierarchy is
        // still visible without the bar looking lozenge-y.
        const outerRadius = theme.radii.sm; // 12
        const innerRadius = theme.radii.xs; // 6
        return (
          <View
            style={{
              flexDirection: 'row',
              // 28 is the sweet spot where `md` outer radius still reads as
              // pill-rounded ends while `sm` inner radius renders as visible
              // quarter-curves rather than also clamping to pill. Below ~26
              // the md/sm distinction disappears and both look identical.
              height: 28,
              gap: 2,
            }}
          >
            {visible.map((pos, i) => {
              const pct = team.position_pcts[pos];
              const showLabel = pct >= labelThreshold;
              const isFirst = i === 0;
              const isLast = i === visible.length - 1;
              return (
                <View
                  key={pos}
                  style={{
                    flex: pct,
                    backgroundColor: positionColor[pos],
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 4,
                    borderTopLeftRadius: isFirst ? outerRadius : innerRadius,
                    borderBottomLeftRadius: isFirst ? outerRadius : innerRadius,
                    borderTopRightRadius: isLast ? outerRadius : innerRadius,
                    borderBottomRightRadius: isLast ? outerRadius : innerRadius,
                  }}
                >
                  {showLabel ? (
                    <RNText
                      numberOfLines={1}
                      style={{
                        fontFamily: fontFamilies.bold,
                        fontSize: 11,
                        color: '#FFFFFF',
                        letterSpacing: 0.2,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {Math.round(pct * 100)}%
                    </RNText>
                  ) : null}
                </View>
              );
            })}
          </View>
        );
      })()}
    </View>
  );
}

function AccuracyCard({ stats }: { stats: MatchStatsResponse }) {
  const theme = useTheme();
  return (
    <View
      style={{
        marginHorizontal: 20,
        flexDirection: 'row',
        gap: 16,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: 16,
        ...theme.shadows.card,
      }}
    >
      {stats.exact_correct_pct !== null ? (
        <AccuracyStat
          label="Exact Score"
          pct={stats.exact_correct_pct}
          color={theme.colors.accent}
        />
      ) : null}
      {stats.result_correct_pct !== null ? (
        <AccuracyStat
          label="Correct Result"
          pct={stats.result_correct_pct}
          color={theme.colors.primary}
        />
      ) : null}
    </View>
  );
}

function AccuracyStat({ label, pct, color }: { label: string; pct: number; color: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 24,
          color,
          fontVariant: ['tabular-nums'],
        }}
      >
        {Math.round(pct * 100)}%
      </RNText>
      <RNText
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 11,
          color: theme.colors.slate,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}

// MARK: - Your Predictions

function YourPredictionsSection({
  match,
  predictionInfos,
}: {
  match: ResultsMatch;
  predictionInfos: MatchPredictionInfo[];
}) {
  const theme = useTheme();

  // Group by pool, preserving original order.
  const grouped = (() => {
    const seen: string[] = [];
    const byPool = new Map<string, MatchPredictionInfo[]>();
    for (const info of predictionInfos) {
      if (!byPool.has(info.poolName)) {
        seen.push(info.poolName);
        byPool.set(info.poolName, []);
      }
      byPool.get(info.poolName)!.push(info);
    }
    return seen.map((name) => ({ poolName: name, entries: byPool.get(name)! }));
  })();

  return (
    <View style={{ gap: 12 }}>
      <RNText
        style={{
          marginHorizontal: 20,
          fontFamily: fontFamilies.bold,
          fontSize: 16,
          color: theme.colors.ink,
        }}
      >
        Your Predictions
      </RNText>
      {predictionInfos.length === 0 ? (
        <View
          style={{
            marginHorizontal: 20,
            paddingVertical: 28,
            paddingHorizontal: 20,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radii.lg,
            alignItems: 'center',
            gap: 8,
            ...theme.shadows.card,
          }}
        >
          {/* ⚠ WORLD CUP ONLY NOW. This section used to carry a second string
              for a league fixture — "Your picks are on the web" — because the
              phone could not read league picks. It can: a league fixture is
              routed to `LeaguePicksSection` before it ever reaches here, so a
              branch on `roundNumber` would be dead code pretending to be a
              safeguard. */}
          <Text variant="cardTitle" align="center">No predictions yet</Text>
          <Text variant="body" color="slate" align="center">
            Join a pool and make your prediction for this match
          </Text>
        </View>
      ) : (
        grouped.map((group) => (
          <View
            key={group.poolName}
            style={{
              marginHorizontal: 20,
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radii.lg,
              ...theme.shadows.card,
              overflow: 'hidden',
            }}
          >
            <RNText
              style={{
                paddingHorizontal: 16,
                paddingTop: 14,
                paddingBottom: 10,
                fontFamily: fontFamilies.bold,
                fontSize: 14,
                color: theme.colors.ink,
              }}
            >
              {group.poolName}
            </RNText>
            <View
              style={{
                height: 0.5,
                marginHorizontal: 14,
                backgroundColor: theme.colors.mist,
              }}
            />
            {group.entries.map((info) =>
              info.isBracketPicker ? (
                <BracketPickerRow key={info.entryId} match={match} info={info} />
              ) : (
                <PredictionRow key={info.entryId} match={match} info={info} />
              ),
            )}
            <View style={{ height: 4 }} />
          </View>
        ))
      )}
    </View>
  );
}

function PredictionRow({ match, info }: { match: ResultsMatch; info: MatchPredictionInfo }) {
  const theme = useTheme();
  const isLive = match.status === 'live';
  const isFinished = match.status === 'completed';
  const isKnockout = isKnockoutTie(match);
  const showResult = (isLive || isFinished) && info.prediction !== null;
  const pts = info.breakdownPoints ?? info.matchPoints;

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <RNText
          style={{
            flex: 1,
            fontFamily: fontFamilies.semibold,
            fontSize: 14,
            color: theme.colors.ink,
          }}
        >
          {info.entryName}
        </RNText>
        {showResult ? (
          <>
            <ResultBadge info={info} isKnockout={isKnockout} match={match} />
            {pts !== null ? (
              <RNText
                style={{
                  fontFamily: MONO_BOLD,
                  fontSize: 12,
                  color: pts > 0 ? theme.colors.green : theme.colors.slate,
                }}
              >
                +{pts.toLocaleString()} pts
              </RNText>
            ) : null}
          </>
        ) : null}
      </View>
      {info.prediction ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 4,
          }}
        >
          {isKnockout ? (
            <RNText
              numberOfLines={1}
              style={{
                fontFamily: fontFamilies.medium,
                fontSize: 12,
                color: theme.colors.slate,
              }}
            >
              {info.predictedHomeTeam ?? homeDisplayName(match)}
            </RNText>
          ) : null}
          <RNText
            style={{
              fontFamily: MONO_BOLD,
              fontSize: 15,
              color: theme.colors.ink,
              fontVariant: ['tabular-nums'],
            }}
          >
            {info.prediction.predictedHomeScore}
          </RNText>
          <RNText style={{ fontFamily: MONO_BOLD, fontSize: 13, color: theme.colors.mist }}>
            -
          </RNText>
          <RNText
            style={{
              fontFamily: MONO_BOLD,
              fontSize: 15,
              color: theme.colors.ink,
              fontVariant: ['tabular-nums'],
            }}
          >
            {info.prediction.predictedAwayScore}
          </RNText>
          {isKnockout ? (
            <RNText
              numberOfLines={1}
              style={{
                fontFamily: fontFamilies.medium,
                fontSize: 12,
                color: theme.colors.slate,
              }}
            >
              {info.predictedAwayTeam ?? awayDisplayName(match)}
            </RNText>
          ) : null}
          {info.prediction.predictedHomePso !== null &&
          info.prediction.predictedAwayPso !== null ? (
            <RNText
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: theme.colors.primary,
              }}
            >
              ({info.prediction.predictedHomePso}-{info.prediction.predictedAwayPso} PSO)
            </RNText>
          ) : null}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <RNText
            style={{
              fontFamily: fontFamilies.medium,
              fontSize: 12,
              color: theme.colors.slate,
              paddingHorizontal: 10,
              paddingVertical: 3,
              backgroundColor: withOpacity(theme.colors.mist, 0.5),
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            Not predicted
          </RNText>
        </View>
      )}
    </View>
  );
}

function BracketPickerRow({ match, info }: { match: ResultsMatch; info: MatchPredictionInfo }) {
  const theme = useTheme();
  const isLive = match.status === 'live';
  const isFinished = match.status === 'completed';
  const isKnockout = isKnockoutTie(match);
  const bp: BracketPickInfo | null = info.bracketPick;

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <RNText
          style={{
            flex: 1,
            fontFamily: fontFamilies.semibold,
            fontSize: 14,
            color: theme.colors.ink,
          }}
        >
          {info.entryName}
        </RNText>
        {isKnockout &&
        bp?.predictedWinnerName &&
        (isLive || isFinished) &&
        bp.isCorrectWinner !== null ? (
          <Badge
            label={bp.isCorrectWinner ? 'Correct' : 'Miss'}
            color={bp.isCorrectWinner ? theme.colors.green : theme.colors.red}
          />
        ) : null}
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 4,
          flexWrap: 'wrap',
        }}
      >
        {bp && isKnockout ? (
          bp.predictedWinnerName ? (
            <>
              <RNText
                style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}
              >
                Winner:
              </RNText>
              <RNText
                style={{
                  fontFamily: fontFamilies.semibold,
                  fontSize: 12,
                  color: theme.colors.ink,
                }}
              >
                {bp.predictedWinnerName}
              </RNText>
              {bp.predictedPenalty ? (
                <RNText
                  style={{
                    fontFamily: fontFamilies.medium,
                    fontSize: 10,
                    color: theme.colors.primary,
                  }}
                >
                  (PSO)
                </RNText>
              ) : null}
            </>
          ) : (
            <NoPickPill />
          )
        ) : bp && !isKnockout ? (
          bp.homeTeamPosition !== null || bp.awayTeamPosition !== null ? (
            <>
              {bp.homeTeamName && bp.homeTeamPosition !== null ? (
                <>
                  <RNText
                    style={{
                      fontFamily: fontFamilies.semibold,
                      fontSize: 12,
                      color: theme.colors.ink,
                    }}
                  >
                    {bp.homeTeamName}
                  </RNText>
                  <RNText
                    style={{
                      fontFamily: fontFamilies.medium,
                      fontSize: 11,
                      color: theme.colors.slate,
                    }}
                  >
                    {ordinal(bp.homeTeamPosition)}
                  </RNText>
                </>
              ) : null}
              {bp.homeTeamPosition !== null && bp.awayTeamPosition !== null ? (
                <RNText
                  style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: theme.colors.mist }}
                >
                  ·
                </RNText>
              ) : null}
              {bp.awayTeamName && bp.awayTeamPosition !== null ? (
                <>
                  <RNText
                    style={{
                      fontFamily: fontFamilies.semibold,
                      fontSize: 12,
                      color: theme.colors.ink,
                    }}
                  >
                    {bp.awayTeamName}
                  </RNText>
                  <RNText
                    style={{
                      fontFamily: fontFamilies.medium,
                      fontSize: 11,
                      color: theme.colors.slate,
                    }}
                  >
                    {ordinal(bp.awayTeamPosition)}
                  </RNText>
                </>
              ) : null}
            </>
          ) : (
            <NoPickPill />
          )
        ) : (
          <NoPickPill />
        )}
      </View>
    </View>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <RNText
      style={{
        fontFamily: fontFamilies.bold,
        fontSize: 10,
        color,
        paddingHorizontal: 7,
        paddingVertical: 3,
        backgroundColor: withOpacity(color, 0.12),
        borderRadius: 999,
        overflow: 'hidden',
      }}
    >
      {label}
    </RNText>
  );
}

function NoPickPill() {
  const theme = useTheme();
  return (
    <RNText
      style={{
        fontFamily: fontFamilies.medium,
        fontSize: 12,
        color: theme.colors.slate,
        paddingHorizontal: 10,
        paddingVertical: 3,
        backgroundColor: withOpacity(theme.colors.mist, 0.5),
        borderRadius: 999,
        overflow: 'hidden',
      }}
    >
      No pick
    </RNText>
  );
}

function ordinal(n: number): string {
  const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

function ResultBadge({
  info,
  isKnockout,
  match,
}: {
  info: MatchPredictionInfo;
  isKnockout: boolean;
  match: ResultsMatch;
}) {
  const theme = useTheme();
  const result = resolveResultType(info, isKnockout, match, theme);
  return <Badge label={result.label} color={result.color} />;
}

function resolveResultType(
  info: MatchPredictionInfo,
  isKnockout: boolean,
  match: ResultsMatch,
  theme: ReturnType<typeof useTheme>,
): { label: string; color: string } {
  // Server-provided breakdown wins for knockout (handles team mismatch).
  if (info.breakdownResultType && isKnockout) {
    if (info.teamsMatch === false) {
      return { label: 'Wrong Teams', color: theme.colors.amber };
    }
    return breakdownResultLabel(info.breakdownResultType, theme);
  }
  // Fallback: client-side calc.
  const pred = info.prediction;
  const homeActual = match.homeScoreFt;
  const awayActual = match.awayScoreFt;
  if (!pred || homeActual === null || awayActual === null) {
    return { label: 'Pending', color: theme.colors.amber };
  }
  if (pred.predictedHomeScore === homeActual && pred.predictedAwayScore === awayActual) {
    return { label: 'Exact', color: theme.colors.accent };
  }
  const actualOutcome =
    homeActual === awayActual ? 0 : homeActual > awayActual ? 1 : -1;
  const predOutcome =
    pred.predictedHomeScore === pred.predictedAwayScore
      ? 0
      : pred.predictedHomeScore > pred.predictedAwayScore
        ? 1
        : -1;
  if (actualOutcome === predOutcome) {
    const actualGD = homeActual - awayActual;
    const predGD = pred.predictedHomeScore - pred.predictedAwayScore;
    if (actualGD === predGD) return { label: 'Winner+GD', color: theme.colors.green };
    return { label: 'Winner', color: theme.colors.primary };
  }
  return { label: 'Miss', color: theme.colors.red };
}

function breakdownResultLabel(
  type: string,
  theme: ReturnType<typeof useTheme>,
): { label: string; color: string } {
  switch (type) {
    case 'exact':
      return { label: 'Exact', color: theme.colors.accent };
    case 'winner_gd':
      return { label: 'Winner+GD', color: theme.colors.green };
    case 'winner':
      return { label: 'Winner', color: theme.colors.primary };
    case 'miss':
      return { label: 'Miss', color: theme.colors.red };
    case 'wrong_teams':
      return { label: 'Wrong Teams', color: theme.colors.amber };
    default:
      return {
        label: type.charAt(0).toUpperCase() + type.slice(1),
        color: theme.colors.slate,
      };
  }
}
