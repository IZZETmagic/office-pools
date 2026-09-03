import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';

import { LeaderboardLegend } from './LeaderboardLegend';
import { LeaderboardPodium } from './LeaderboardPodium';
import { LeaderboardRow } from './LeaderboardRow';
import { LeagueTableLeaderboard } from './LeagueTableLeaderboard';
import { MatchdayInfoBar } from './MatchdayInfoBar';
import { MatchdayMVPBanner } from './MatchdayMVPBanner';
import { SuperlativesSection } from './SuperlativesSection';
import { Icon, Text } from '@/components/ui';
import type {
  LeaderboardEntry,
  LeagueLeaderboardEntry,
  LeagueLeaderboardMeta,
  MatchdayInfo,
  MatchdayMvp,
  PoolAward,
  Superlative,
} from '@/lib/api';
import { useTheme, withOpacity } from '@/theme';

type LeaderboardTabProps = {
  poolId: string;
  entries: LeaderboardEntry[];
  currentUserId: string | null;
  awards: PoolAward[];
  superlatives: Superlative[];
  matchdayMvp: MatchdayMvp | null;
  matchdayInfo: MatchdayInfo | null;
  /** Non-null for a league pool; its rows are in `leagueEntries`. */
  league?: LeagueLeaderboardMeta | null;
  /** League rows. Null for a World Cup pool, where `entries` carries them. */
  leagueEntries?: LeagueLeaderboardEntry[] | null;
};

export function LeaderboardTab({
  poolId,
  entries,
  currentUserId,
  awards,
  superlatives,
  matchdayMvp,
  matchdayInfo,
  league = null,
  leagueEntries = null,
}: LeaderboardTabProps) {
  const theme = useTheme();

  const awardsByEntry = useMemo(() => {
    const map: Record<string, PoolAward[]> = {};
    for (const a of awards) {
      const arr = map[a.entry_id] ?? [];
      arr.push(a);
      map[a.entry_id] = arr;
    }
    return map;
  }, [awards]);

  const openBreakdown = useCallback(
    (entryId: string) => {
      router.push(`/pool/${poolId}/breakdown?entryId=${entryId}`);
    },
    [poolId],
  );

  // ---- LEAGUE ------------------------------------------------------------
  // A league pool's rows carry a different set of facts, so it gets its own
  // list rather than a set of flags threaded through this one. Everything below
  // — the podium, the Exact/W+GD/Winner/Miss legend, the matchday MVP banner,
  // the superlatives, the "N of M matches" bar — is computed from analytics the
  // league engine deliberately does not write (the outbox BLOCKS XP and badges
  // rather than storing zeros), so for a league pool every one of them rendered
  // a confident zero over the top of scores it never read.
  //
  // ⚠ Table mode is the only league mode built here so far. The others fall
  // through to the World Cup list on purpose: it is wrong for them too, but it
  // is the wrongness that is already shipped, and replacing it blind would be
  // guessing at what a Showdown row should say.
  if (league?.mode === 'table' && leagueEntries) {
    return (
      <LeagueTableLeaderboard
        entries={leagueEntries}
        league={league}
        currentUserId={currentUserId}
        // Points to the World Cup breakdown, which holds nothing for a table
        // entry. Left unwired until that screen has a table arm — a tap that
        // opens an empty page is worse than a row that does not respond.
        onEntryPress={undefined}
      />
    );
  }

  if (entries.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.md,
          paddingVertical: theme.spacing.hero,
          paddingHorizontal: theme.spacing.xl,
        }}
      >
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: withOpacity(theme.colors.accent, 0.12),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="trophy" color="accent" size={32} />
        </View>
        <Text variant="sectionHeader" align="center">
          No Entries Yet
        </Text>
        <Text variant="body" color="slate" align="center">
          The leaderboard will appear once entries are submitted.
        </Text>
      </View>
    );
  }

  const hasPodium = entries.length >= 3;
  const restStart = hasPodium ? 3 : 0;
  const rest = entries.slice(restStart);

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.lg,
      }}
    >
      {matchdayMvp ? <MatchdayMVPBanner mvp={matchdayMvp} /> : null}

      {hasPodium ? (
        <LeaderboardPodium
          entries={entries}
          currentUserId={currentUserId}
          awardsByEntry={awardsByEntry}
          onEntryPress={openBreakdown}
        />
      ) : null}

      <LeaderboardLegend />

      {rest.map((entry, i) => (
        <LeaderboardRow
          key={entry.entry_id}
          entry={entry}
          rank={restStart + i + 1}
          isCurrentUser={entry.user_id === currentUserId}
          awards={awardsByEntry[entry.entry_id] ?? []}
          onPress={() => openBreakdown(entry.entry_id)}
        />
      ))}

      {superlatives.length > 0 ? <SuperlativesSection superlatives={superlatives} /> : null}

      {matchdayInfo ? <MatchdayInfoBar info={matchdayInfo} /> : null}
    </View>
  );
}
