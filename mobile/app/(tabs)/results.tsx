import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text as RNText,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  JoinPoolSheet,
  type JoinPoolSheetHandle,
  PoolCreateJoinSheet,
  type PoolCreateJoinSheetHandle,
  PoolsHeader,
} from '@/components/pools';
import {
  CompetitionHeader,
  CompetitionPickerSheet,
  LeagueTablesView,
  type CompetitionPickerSheetHandle,
  type CompetitionOption,
  GroupPickerSheet,
  type GroupPickerSheetHandle,
  MatchResultRow,
  ResultsFilterBar,
  TeamPickerSheet,
  type TeamPickerSheetHandle,
  type FilterMode,
  type GroupOption,
  type TeamOption,
} from '@/components/results';
import { Text } from '@/components/ui';
import { useManualRefresh } from '@/lib/useManualRefresh';
// useTournamentMatches now comes from the shared provider mounted at root
// (lib/TournamentMatchesProvider.tsx) so first-visit Results renders with
// data already loaded — no more empty-state + arrival jump.
import { useTournamentMatches } from '@/lib/TournamentMatchesProvider';
import {
  anchorSectionIndex,
  dateSections,
  dayLabel,
  distinctCompetitions,
  EXPAND_STEP,
  parsedDate,
  ROW_BUDGET,
  roundSections,
  startOfDay,
  windowSections,
  type MatchSection,
} from '@/lib/resultsSections';
import { type ResultsMatch } from '@/lib/useTournamentMatches';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// ---- Screen ----

export default function ResultsScreen() {
  const theme = useTheme();
  const { matches, leagueTables, loading, leagueLoading, error, leagueError, refresh, refreshIfStale } =
    useTournamentMatches();
  // ⚠ BOTH SOURCES, or a league member is told the wrong thing. `loading` is the
  // World Cup read alone (the splash gate waits on it); without `leagueLoading`
  // here the screen renders its empty state for the length of the league fetch
  // and a member reads "No Matches" a moment before their season arrives. Same
  // for the error: a failed league fetch with no World Cup pool would otherwise
  // be indistinguishable from a season with no football in it.
  const anyLoading = loading || leagueLoading;
  const anyError = error ?? leagueError;
  // Pull-to-refresh: spinner driven by real user-pull gesture only.
  const { refreshing, onRefresh } = useManualRefresh(refresh);
  const [filterMode, setFilterMode] = useState<FilterMode>('date');
  const [selectedTeam, setSelectedTeam] = useState<TeamOption | null>(null);
  const [selectedGroupLetter, setSelectedGroupLetter] = useState<string | null>(null);
  const [selectedCompetition, setSelectedCompetition] = useState<CompetitionOption | null>(null);
  const teamSheetRef = useRef<TeamPickerSheetHandle | null>(null);
  const groupSheetRef = useRef<GroupPickerSheetHandle | null>(null);
  const competitionSheetRef = useRef<CompetitionPickerSheetHandle | null>(null);

  // Match Centre's two views. A table is a fact about the SEASON, so it lives
  // here beside the football rather than inside each pool — thirteen Premier
  // League pools would otherwise carry thirteen copies of one table.
  //
  // ⚠ Read ONCE, on first render. After that the member navigates freely — a
  // param re-applied on every render would snap them back to Tables every time
  // this screen re-rendered for any other reason.
  const { view: viewParam, season: seasonParam } = useLocalSearchParams<{
    view?: string;
    season?: string;
  }>();
  const [view, setView] = useState<'matches' | 'tables'>(
    viewParam === 'tables' ? 'tables' : 'matches',
  );

  /**
   * The header control, or null.
   *
   * ⚠ NOTHING TO SHOW, NO CONTROL. `leagueTables` is empty for a World Cup-only
   * member — `league_standings` is league data and there is no World Cup table
   * — and for a league season whose first matches have not been played. Either
   * way the toggle would lead to a blank screen, so the "+" stays instead,
   * which also keeps create-and-join in front of the people still joining.
   *
   * The label names WHERE THE TAP GOES. See PoolsHeader's `toggle`.
   */
  const headerToggle =
    leagueTables.length === 0
      ? null
      : view === 'matches'
        ? { label: 'Tables', icon: 'list.number', onPress: () => setView('tables') }
        : { label: 'Matches', icon: 'sportscourt', onPress: () => setView('matches') };
  const scrollRef = useRef<ScrollView | null>(null);
  // Create / Join pool sheet refs — opened by the "+" button in the
  // header. Same pattern as the Home and Pools tabs so the user can
  // create or join a pool from any primary tab without first navigating
  // back to one of the pool-centric screens.
  const createJoinSheetRef = useRef<PoolCreateJoinSheetHandle | null>(null);
  const joinPoolSheetRef = useRef<JoinPoolSheetHandle | null>(null);

  // Per-tab stale-refresh on focus — consistent with home + pools.
  const refreshIfStaleRef = useRef(refreshIfStale);
  refreshIfStaleRef.current = refreshIfStale;
  const initialFocus = useRef(true);
  // Set by the effect further down, once it exists. Held in a ref so this
  // handler can be declared before it and still stay identity-stable —
  // `useFocusEffect` re-subscribes whenever its callback changes.
  const reAnchorRef = useRef<(() => void) | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (initialFocus.current) {
        // The first focus is the mount, and the mount effect already anchors.
        initialFocus.current = false;
        return;
      }
      refreshIfStaleRef.current();
      // ⚠ EVERY RETURN, not just the first. Coming back from another tab or
      // from a match detail puts the member back on what is next — which is
      // the question this screen exists to answer, and the answer moves while
      // they are away.
      reAnchorRef.current?.();
    }, []),
  );

  const sections = useMemo<MatchSection[]>(() => {
    switch (filterMode) {
      case 'date':
        return dateSections(matches);
      case 'round':
        return roundSections(matches);
      case 'team': {
        if (!selectedTeam) return dateSections(matches);
        const filtered = matches.filter(
          (m) =>
            m.homeTeamId === selectedTeam.id || m.awayTeamId === selectedTeam.id,
        );
        return dateSections(filtered);
      }
      case 'group': {
        const groupMatches = matches.filter((m) => m.stage === 'group');
        if (!selectedGroupLetter) return dateSections(groupMatches);
        return dateSections(
          groupMatches.filter((m) => m.groupLetter === selectedGroupLetter),
        );
      }
      case 'competition': {
        // Narrow, then section by day — the same shape as `team` above, so a
        // member moving between the two pills gets the same list rearranged
        // rather than a different screen.
        if (!selectedCompetition) return dateSections(matches);
        return dateSections(
          matches.filter((m) => m.competitionId === selectedCompetition.id),
        );
      }
    }
  }, [filterMode, matches, selectedTeam, selectedGroupLetter, selectedCompetition]);

  // How far the member has asked to see beyond the default window, in sections.
  // Reset whenever the filter changes, because "twelve more matchweeks" means
  // nothing once the list is a different list.
  const [expandBefore, setExpandBefore] = useState(0);
  const [expandAfter, setExpandAfter] = useState(0);
  useEffect(() => {
    setExpandBefore(0);
    setExpandAfter(0);
  }, [filterMode, selectedTeam, selectedGroupLetter, selectedCompetition]);

  const visible = useMemo(() => {
    const base = windowSections(sections, anchorSectionIndex(sections), ROW_BUDGET);
    const start = Math.max(0, base.start - expandBefore);
    const end = Math.min(sections.length, base.end + expandAfter);
    return { start, end, sections: sections.slice(start, end) };
  }, [sections, expandBefore, expandAfter]);

  // Available teams across the full match list, sorted alphabetically.
  const availableTeams = useMemo<TeamOption[]>(() => {
    const seen = new Set<string>();
    const out: TeamOption[] = [];
    for (const m of matches) {
      if (m.homeTeamId && m.homeTeam && !seen.has(m.homeTeamId)) {
        seen.add(m.homeTeamId);
        out.push({
          id: m.homeTeamId,
          name: m.homeTeam.countryName,
          flagUrl: m.homeTeam.flagUrl,
        });
      }
      if (m.awayTeamId && m.awayTeam && !seen.has(m.awayTeamId)) {
        seen.add(m.awayTeamId);
        out.push({
          id: m.awayTeamId,
          name: m.awayTeam.countryName,
          flagUrl: m.awayTeam.flagUrl,
        });
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [matches]);

  // ---- What this list is made of, which decides which pills exist ----
  //
  // Asked of the MATCHES rather than of the member's pools. `useHomeData` does
  // not select `league_season_id`, so the pool list cannot answer it — and the
  // matches can, exactly and without another read.
  const hasGroupStage = useMemo(() => matches.some((m) => m.stage === 'group'), [matches]);
  const hasMatchweeks = useMemo(() => matches.some((m) => m.roundNumber !== null), [matches]);
  // "Round" is World Cup wording. With nothing but a league in the list the
  // pill says what a member would say out loud.
  const roundPillLabel = hasMatchweeks && !hasGroupStage ? 'Matchweek' : 'Round';

  // Available group letters, sorted, with match count per group.
  const availableGroups = useMemo<GroupOption[]>(() => {
    const counts = new Map<string, number>();
    for (const m of matches) {
      if (m.stage !== 'group' || !m.groupLetter) continue;
      counts.set(m.groupLetter, (counts.get(m.groupLetter) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([letter, matchCount]) => ({ letter, matchCount }))
      .sort((a, b) => a.letter.localeCompare(b.letter));
  }, [matches]);

  /**
   * The competitions in the member's own football, for the pill and its sheet.
   *
   * ⚠ DERIVED FROM THE LIST, not from a static table of leagues. The list is
   * already scoped to the pools the member is in, so this is exactly what they
   * hold — which is what makes `.length > 1` the right test for showing the
   * pill at all. A member in one Premier League pool never sees a control
   * offering to narrow their football to the Premier League.
   */
  const availableCompetitions = useMemo<CompetitionOption[]>(
    () => distinctCompetitions(matches),
    [matches],
  );

  /**
   * ⚠ Whether the competition BANDS appear, which is a different question from
   * whether the pill does — and it is answered from the whole list rather than
   * per section on purpose. Per-section, a Saturday with two leagues would show
   * headers and the Sunday with one would not, so the bands would blink in and
   * out as a member scrolled. One list, one answer.
   */
  const showCompetitionBands = availableCompetitions.length > 1;

  // ---- Filter handlers ----

  function handleSelectDate() {
    setFilterMode('date');
  }
  function handleSelectRound() {
    setFilterMode('round');
  }
  function handleSelectTeam() {
    if (filterMode === 'team' && selectedTeam) {
      // Clear selection
      setSelectedTeam(null);
      setFilterMode('date');
      return;
    }
    teamSheetRef.current?.open();
  }
  function handleSelectGroup() {
    if (filterMode === 'group' && selectedGroupLetter) {
      setSelectedGroupLetter(null);
      setFilterMode('date');
      return;
    }
    groupSheetRef.current?.open();
  }
  function handleTeamPicked(team: TeamOption) {
    setSelectedTeam(team);
    setFilterMode('team');
  }
  function handleGroupPicked(letter: string) {
    setSelectedGroupLetter(letter);
    setFilterMode('group');
  }
  function handleSelectCompetition() {
    // Unlike Team and Group, tapping an active pill REOPENS the sheet rather
    // than clearing — the sheet carries its own "All competitions" row, so the
    // undo lives where the choice was made and this tap can mean "change it".
    competitionSheetRef.current?.open();
  }
  function handleCompetitionPicked(competition: CompetitionOption | null) {
    setSelectedCompetition(competition);
    setFilterMode(competition ? 'competition' : 'date');
  }

  // ---- Anchor on what is next, on arrival and on every return ----
  //
  // ⚠ THIS USED TO HAPPEN ONCE PER APP LAUNCH, and that was the bug.
  // `autoScrollDoneRef` latched true after the first successful scroll and was
  // never reset, while the tab screens stay MOUNTED (`enableScreens(false)` is
  // load-bearing for the tab-switch jump fix). So a member who scrolled back
  // into September, went to Home and came back was still in September — and
  // coming back from a match never re-anchored either.
  //
  // Match Centre's job is to answer "what is on"; the answer changes while you
  // are away, so arriving is the moment to re-answer it.
  const autoScrollDoneRef = useRef(false);
  const sectionYRef = useRef<Record<string, number>>({});

  // ⚠ The window lives in a ref so the focus handler below can stay identity-
  // stable. `useFocusEffect` re-subscribes whenever its callback changes, and a
  // callback rebuilt on every render would re-run this on every render too.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  /**
   * Anchor as soon as the layout can answer, rather than at one guessed moment.
   *
   * ⚠ THE SINGLE `setTimeout(…, 200)` WAS THE FRAGILE PART, and it failed in the
   * way that looks exactly like "it does nothing": if `onLayout` has not run for
   * the target section yet, `scrollToAnchor` finds no offset, returns false, and
   * the list simply stays where it is. 200 ms is fine on a warm 30-row list and
   * not obviously fine on a freshly mounted 120-row one.
   *
   * So it retries on a short interval and gives up after a second — bounded, so
   * a list that genuinely has no anchor (a finished season) costs a handful of
   * cheap checks rather than spinning.
   */
  const anchorAttemptRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const anchorSoon = useCallback(() => {
    if (anchorAttemptRef.current) clearInterval(anchorAttemptRef.current);
    let attempts = 0;
    anchorAttemptRef.current = setInterval(() => {
      attempts += 1;
      // Stop on success, or once a second of layout has plainly not produced
      // the offset we need.
      if (scrollToAnchorRef.current?.(true) || attempts >= 12) {
        if (anchorAttemptRef.current) clearInterval(anchorAttemptRef.current);
        anchorAttemptRef.current = null;
      }
    }, 80);
  }, []);

  // Cleared on unmount so a backgrounded screen is not left holding a timer.
  useEffect(() => () => {
    if (anchorAttemptRef.current) clearInterval(anchorAttemptRef.current);
  }, []);

  const scrollToAnchorRef = useRef<((animated: boolean) => boolean) | null>(null);

  const scrollToAnchor = useCallback((animated: boolean) => {
    // ⚠ Searched within the WINDOW, not the whole list. Only mounted sections
    // have a layout offset, so a target outside it silently does nothing.
    const secs = visibleRef.current.sections;
    if (secs.length === 0) return false;
    const liveSection = secs.find((s) => s.matches.some((m) => m.status === 'live'));
    const targetId = liveSection
      ? liveSection.id
      : secs.find((s) => s.matches.some((m) => m.status === 'scheduled'))?.id ??
        secs.find((s) => s.label === 'Today')?.id;
    if (!targetId) return false;
    const y = sectionYRef.current[targetId];
    if (typeof y !== 'number') return false;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated });
    return true;
  }, []);
  scrollToAnchorRef.current = scrollToAnchor;

  // First content render. Still one-shot: this fires as sections arrive, and
  // without the latch it would fight the member's own scrolling every time the
  // league fetch or a broadcast changed the list.
  useEffect(() => {
    if (autoScrollDoneRef.current) return;
    if (view !== 'matches') return;
    if (visible.sections.length === 0) return;
    // Latch immediately: `anchorSoon` retries on its own, and without the latch
    // this effect would restart it on every list change.
    autoScrollDoneRef.current = true;
    anchorSoon();
  }, [sections, view, anchorSoon, visible.sections.length]);

  // What the focus handler above calls. Wired through a ref because it has to
  // reset STATE — the window the member may have expanded — and that reset has
  // to land before the scroll, since the mounted sections decide the offsets.
  reAnchorRef.current = () => {
    if (view !== 'matches') return;
    // ⚠ Collapse "Show earlier"/"Show more" back to the default window. Without
    // this a member who had paged back through August returns to a list still
    // holding August, and the anchor is a long way down it.
    setExpandBefore(0);
    setExpandAfter(0);
    // The state reset has to re-render and `onLayout` re-run before the offsets
    // are right, so this waits for them rather than guessing how long that takes.
    anchorSoon();
  };

  // ---- Coming back from Tables ----
  //
  // ⚠ A THIRD DOOR, and it does not go through either of the two above.
  // Switching to Tables swaps out the whole fragment — `ScrollView` included —
  // so coming back MOUNTS A NEW ONE, at offset 0. That is the "shoots to the
  // very top" report: not a failure to scroll, a brand-new list starting where
  // every list starts.
  //
  // `useFocusEffect` cannot see it — the screen never lost focus, only its
  // children were swapped — and the first-render effect is latched by then. So
  // the toggle has to say so itself.
  const prevViewRef = useRef(view);
  useEffect(() => {
    const previous = prevViewRef.current;
    prevViewRef.current = view;
    if (previous === view || view !== 'matches') return;
    reAnchorRef.current?.();
  }, [view]);

  // ---- Render ----

  if (anyLoading && matches.length === 0) {
    return (
      <SafeAreaView
        edges={['top', 'left', 'right']}
        style={{ flex: 1, backgroundColor: theme.colors.snow }}
      >
        <PoolsHeader
          titlePrefix="Match"
          titleAccent="Centre"
          subtitle="Where predictions meet reality"
          onMenuPress={() => createJoinSheetRef.current?.open()}
          toggle={headerToggle}
        />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (anyError && matches.length === 0) {
    return (
      <SafeAreaView
        edges={['top', 'left', 'right']}
        style={{ flex: 1, backgroundColor: theme.colors.snow }}
      >
        <PoolsHeader
          titlePrefix="Match"
          titleAccent="Centre"
          subtitle="Where predictions meet reality"
          onMenuPress={() => createJoinSheetRef.current?.open()}
          toggle={headerToggle}
        />
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
            gap: theme.spacing.md,
          }}
        >
          <Text variant="cardTitle" align="center">
            Unable to Load
          </Text>
          <Text variant="body" color="slate" align="center">
            {anyError}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const empty = matches.length === 0;

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: theme.colors.snow }}
    >
      <PoolsHeader
        titlePrefix="Match"
        titleAccent="Centre"
        subtitle="Where predictions meet reality"
        onMenuPress={() => createJoinSheetRef.current?.open()}
        toggle={headerToggle}
      />
      {view === 'tables' ? (
        <LeagueTablesView tables={leagueTables} initialSeasonId={seasonParam ?? null} />
      ) : (
      <>
      <ResultsFilterBar
        mode={filterMode}
        selectedTeamName={selectedTeam?.name ?? null}
        selectedGroupLetter={selectedGroupLetter}
        roundLabel={roundPillLabel}
        showGroup={hasGroupStage}
        selectedCompetitionName={selectedCompetition?.name ?? null}
        showCompetition={availableCompetitions.length > 1}
        onSelectDate={handleSelectDate}
        onSelectRound={handleSelectRound}
        onSelectTeam={handleSelectTeam}
        onSelectGroup={handleSelectGroup}
        onSelectCompetition={handleSelectCompetition}
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 24,
          gap: 12,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {empty || sections.length === 0 ? (
          <EmptyState filterMode={filterMode} />
        ) : (
          <>
          {visible.start > 0 ? (
            <MoreButton
              label="Show earlier"
              onPress={() => setExpandBefore((n) => n + EXPAND_STEP)}
            />
          ) : null}
          {visible.sections.map((section) => (
            <View
              key={section.id}
              onLayout={(e) => {
                sectionYRef.current[section.id] = e.nativeEvent.layout.y;
              }}
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radii.lg,
                overflow: 'hidden',
                ...theme.shadows.card,
              }}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 14,
                  color: theme.colors.ink,
                  paddingHorizontal: 16,
                  paddingTop: 14,
                  paddingBottom: 10,
                }}
              >
                {section.label}
              </RNText>
              <View
                style={{
                  height: 0.5,
                  marginHorizontal: 14,
                  backgroundColor: theme.colors.mist,
                }}
              />
              {section.blocks.map((block, i) => (
                <View key={block.id}>
                  {showCompetitionBands ? (
                    <CompetitionHeader
                      competition={block.competition}
                      competitionId={block.competitionId}
                      // No rule above the first band — the section's own header
                      // and its hairline are already there.
                      divided={i > 0}
                    />
                  ) : null}
                  {filterMode === 'round'
                    ? renderRoundMatches(block.matches, theme)
                    : block.matches.map((m) => (
                        <MatchResultRow
                          key={m.matchId}
                          match={m}
                          onPress={() => router.push(`/match/${m.matchId}`)}
                        />
                      ))}
                </View>
              ))}
              <View style={{ height: 4 }} />
            </View>
          ))}
          {visible.end < sections.length ? (
            <MoreButton
              label="Show more"
              onPress={() => setExpandAfter((n) => n + EXPAND_STEP)}
            />
          ) : null}
          </>
        )}
      </ScrollView>
      </>
      )}

      <TeamPickerSheet
        ref={teamSheetRef}
        teams={availableTeams}
        onSelect={handleTeamPicked}
      />
      <GroupPickerSheet
        ref={groupSheetRef}
        groups={availableGroups}
        onSelect={handleGroupPicked}
      />
      <CompetitionPickerSheet
        ref={competitionSheetRef}
        competitions={availableCompetitions}
        selectedId={selectedCompetition?.id ?? null}
        onSelect={handleCompetitionPicked}
      />
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

/**
 * The way out of the window. Plain and unstyled on purpose — it is a seam in the
 * list, not a call to action, and a season has two of them.
 */
function MoreButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        paddingVertical: 12,
        borderRadius: theme.radii.lg,
        backgroundColor: withOpacity(theme.colors.ink, 0.04),
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 13,
          color: theme.colors.primary,
        }}
      >
        {label}
      </RNText>
    </Pressable>
  );
}

// In round-mode sections, group the round's matches by date and show subtle
// date sub-headers — mirrors iOS `roundMatchesWithDateHeaders`. The faint
// inter-row dividers are intentionally omitted in this mode (per design
// feedback) — the date sub-headers already provide enough visual rhythm.
function renderRoundMatches(matchList: ResultsMatch[], theme: ReturnType<typeof useTheme>) {
  const days = new Map<number, ResultsMatch[]>();
  for (const m of matchList) {
    const d = parsedDate(m.matchDate);
    const key = d ? startOfDay(d).getTime() : -1;
    const arr = days.get(key) ?? [];
    arr.push(m);
    days.set(key, arr);
  }
  const keys = Array.from(days.keys()).sort((a, b) => a - b);

  return keys.map((key) => {
    const dayMatches = (days.get(key) ?? []).sort((a, b) => {
      const ad = parsedDate(a.matchDate)?.getTime() ?? 0;
      const bd = parsedDate(b.matchDate)?.getTime() ?? 0;
      return ad - bd;
    });
    const label = key < 0 ? 'Date TBD' : dayLabel(new Date(key));
    return (
      <View key={key}>
        <RNText
          style={{
            fontFamily: fontFamilies.medium,
            fontSize: 11,
            color: theme.colors.slate,
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 2,
          }}
        >
          {label}
        </RNText>
        {dayMatches.map((m) => (
          <MatchResultRow
            key={m.matchId}
            match={m}
            onPress={() => router.push(`/match/${m.matchId}`)}
          />
        ))}
      </View>
    );
  });
}

function EmptyState({ filterMode }: { filterMode: FilterMode }) {
  const theme = useTheme();
  const title = filterMode === 'date' ? 'No Matches' : 'No Matches';
  const subtitle =
    filterMode === 'date'
      ? 'Match results will appear here.'
      : 'No matches for this filter.';
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingVertical: 80,
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 16,
          color: theme.colors.ink,
        }}
      >
        {title}
      </RNText>
      <RNText
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 14,
          color: theme.colors.slate,
          textAlign: 'center',
        }}
      >
        {subtitle}
      </RNText>
    </View>
  );
}
