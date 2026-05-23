import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  Text as RNText,
  View,
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  JoinPoolSheet,
  type JoinPoolSheetHandle,
  PoolCreateJoinSheet,
  type PoolCreateJoinSheetHandle,
  PoolsHeader,
} from '@/components/pools';
import {
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
import {
  useTournamentMatches,
  type ResultsMatch,
} from '@/lib/useTournamentMatches';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// ---- Section model ----

type MatchSection = {
  id: string;
  label: string;
  matches: ResultsMatch[];
};

const ROUND_ORDER: Array<{ keys: string[]; label: string }> = [
  { keys: ['group'], label: 'Group Stage' },
  { keys: ['round_32', 'round_of_32'], label: 'Round of 32' },
  { keys: ['round_16', 'round_of_16'], label: 'Round of 16' },
  { keys: ['quarter_final'], label: 'Quarter Finals' },
  { keys: ['semi_final'], label: 'Semi Finals' },
  { keys: ['third_place'], label: 'Third Place' },
  { keys: ['final'], label: 'Final' },
];

function parsedDate(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayLabel(dayStart: Date): string {
  const today = startOfDay(new Date());
  const target = startOfDay(dayStart);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return target.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function dateSections(matchList: ResultsMatch[]): MatchSection[] {
  const buckets = new Map<number, ResultsMatch[]>();
  for (const m of matchList) {
    const d = parsedDate(m.matchDate);
    const key = d ? startOfDay(d).getTime() : -1;
    const arr = buckets.get(key) ?? [];
    arr.push(m);
    buckets.set(key, arr);
  }
  const keys = Array.from(buckets.keys()).sort((a, b) => a - b);
  return keys.map((key) => {
    const dayMatches = (buckets.get(key) ?? []).sort((a, b) => {
      const ad = parsedDate(a.matchDate)?.getTime() ?? 0;
      const bd = parsedDate(b.matchDate)?.getTime() ?? 0;
      return ad - bd;
    });
    const label = key < 0 ? 'Date TBD' : dayLabel(new Date(key));
    return {
      id: `day-${key}`,
      label,
      matches: dayMatches,
    };
  });
}

function roundSections(matchList: ResultsMatch[]): MatchSection[] {
  return ROUND_ORDER.map((round) => {
    const roundMatches = matchList
      .filter((m) => round.keys.includes(m.stage))
      .sort((a, b) => {
        const ad = parsedDate(a.matchDate)?.getTime() ?? 0;
        const bd = parsedDate(b.matchDate)?.getTime() ?? 0;
        return ad - bd;
      });
    return roundMatches.length > 0
      ? { id: round.label, label: round.label, matches: roundMatches }
      : null;
  }).filter((s): s is MatchSection => s !== null);
}

// ---- Screen ----

export default function ResultsScreen() {
  const theme = useTheme();
  // The bottom tab bar is translucent
  // and overlays scroll content. This hook returns its actual rendered
  // height for the current device — iOS ~83 (49 tab bar + safe area), Android
  // ~56dp + bottom safe area — so the last match clears the tab bar.
  const tabBarHeight = useBottomTabBarHeight();
  const { matches, loading, error, refresh, refreshIfStale } =
    useTournamentMatches();
  // Pull-to-refresh: spinner driven by real user-pull gesture only.
  const { refreshing, onRefresh } = useManualRefresh(refresh);
  const [filterMode, setFilterMode] = useState<FilterMode>('date');
  const [selectedTeam, setSelectedTeam] = useState<TeamOption | null>(null);
  const [selectedGroupLetter, setSelectedGroupLetter] = useState<string | null>(null);
  const teamSheetRef = useRef<TeamPickerSheetHandle | null>(null);
  const groupSheetRef = useRef<GroupPickerSheetHandle | null>(null);
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
  useFocusEffect(
    useCallback(() => {
      if (initialFocus.current) {
        initialFocus.current = false;
        return;
      }
      refreshIfStaleRef.current();
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
    }
  }, [filterMode, matches, selectedTeam, selectedGroupLetter]);

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

  // ---- Auto-scroll to live or next match on first content render ----
  const autoScrollDoneRef = useRef(false);
  const sectionYRef = useRef<Record<string, number>>({});
  useEffect(() => {
    if (autoScrollDoneRef.current) return;
    if (filterMode !== 'date') return;
    if (sections.length === 0) return;
    // Wait a frame so onLayout has populated section offsets.
    const handle = setTimeout(() => {
      const liveSection = sections.find((s) =>
        s.matches.some((m) => m.status === 'live'),
      );
      const targetId = liveSection
        ? liveSection.id
        : sections.find((s) => s.matches.some((m) => m.status === 'scheduled'))?.id ??
          sections.find((s) => s.label === 'Today')?.id;
      if (!targetId) return;
      const y = sectionYRef.current[targetId];
      if (typeof y === 'number') {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
        autoScrollDoneRef.current = true;
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [sections, filterMode]);

  // ---- Render ----

  if (loading && matches.length === 0) {
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
        />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error && matches.length === 0) {
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
            {error}
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
        showMenu={false}
      />
      <ResultsFilterBar
        mode={filterMode}
        selectedTeamName={selectedTeam?.name ?? null}
        selectedGroupLetter={selectedGroupLetter}
        onSelectDate={handleSelectDate}
        onSelectRound={handleSelectRound}
        onSelectTeam={handleSelectTeam}
        onSelectGroup={handleSelectGroup}
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: tabBarHeight + 12,
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
          sections.map((section) => (
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
              {filterMode === 'round'
                ? renderRoundMatches(section.matches, theme)
                : section.matches.map((m) => (
                    <MatchResultRow
                      key={m.matchId}
                      match={m}
                      onPress={() => router.push(`/match/${m.matchId}`)}
                    />
                  ))}
              <View style={{ height: 4 }} />
            </View>
          ))
        )}
      </ScrollView>

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
