import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { LeaderboardLegend } from './LeaderboardLegend';
import { LeaderboardPodium } from './LeaderboardPodium';
import { LeaderboardRow } from './LeaderboardRow';
import { LeaguePickemLeaderboard } from './LeaguePickemLeaderboard';
import { LeagueTableLeaderboard } from './LeagueTableLeaderboard';
import { LmsLeaderboard } from './LmsLeaderboard';
import { TableEntrySheet, type TableEntrySheetTarget } from './TableEntrySheet';
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
  /**
   * Table mode: has the deadline passed? Gates whether a RIVAL's table can be
   * opened at all. The database enforces the same rule (RLS 078/104); this is
   * what lets the sheet explain rather than come back empty.
   */
  tableIsLocked?: boolean;
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
  tableIsLocked = false,
}: LeaderboardTabProps) {
  const theme = useTheme();
  // Which table is open, if any. Held here rather than in the list so the
  // sheet is a sibling of it and not a child of a row that can unmount.
  const [openTable, setOpenTable] = useState<TableEntrySheetTarget | null>(null);

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
  // ⚠ Showdown still falls through on purpose: it is wrong for it too, but it is
  // the wrongness that is already shipped, and guessing at what a duel row should
  // say is worse than its own pass. Pick'em no longer does — see below.
  //
  // Last Man Standing needed its own list for a reason the other modes do not
  // share — it has no points at all, so a score column is a column of zeros by
  // design, and its stored rank is entry_id order (see `LeagueLeaderboardEntry
  // .lms`). The question the mode asks is who is still in.
  if (league?.mode === 'last_man_standing' && leagueEntries) {
    return (
      <LmsLeaderboard entries={leagueEntries} league={league} currentUserId={currentUserId} />
    );
  }

  // ⚠ Pick'em was NOT showing zeros — it was showing "No Entries Yet". Every
  // league pool gets an empty World Cup list (`usePoolDetail` narrows the union
  // there), so a mode without its own branch fell to the empty state and denied
  // that anybody was playing, over the top of a fully scored pool.
  //
  // It is also the one league mode where rank, movement and form are all real,
  // which is why it gets the podium rather than a bare list.
  if (league?.mode === 'pickem' && leagueEntries) {
    return (
      <LeaguePickemLeaderboard
        entries={leagueEntries}
        league={league}
        currentUserId={currentUserId}
      />
    );
  }

  if (league?.mode === 'table' && leagueEntries) {
    return (
      <>
        <LeagueTableLeaderboard
          entries={leagueEntries}
          league={league}
          currentUserId={currentUserId}
          onEntryPress={(entry) =>
            setOpenTable({
              entryId: entry.entry_id,
              displayName: entry.entry_name?.trim() ? entry.entry_name : entry.full_name,
              isOwnEntry: entry.user_id === currentUserId,
            })
          }
        />
        <TableEntrySheet
          poolId={poolId}
          target={openTable}
          isLocked={tableIsLocked}
          onClose={() => setOpenTable(null)}
        />
      </>
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

  /**
   * The podium waits until there is something to rank.
   *
   * ⚠ `entries.length >= 3` alone was not enough. Before anyone has scored,
   * every entry is on 0 and the server ranks them all equal, so the podium
   * crowned a winner at random and handed two other members a silver and a
   * bronze they had not earned — from the moment a pool reached three people.
   * In a league that state lasts from pool creation until the first matchweek
   * is scored. Ranking people by nothing is exactly the "bad feelings" the
   * product sets out not to create. Web already refuses to do this; this is
   * the same guard.
   */
  const anyoneHasScored = entries.some((e) => e.total_points !== 0);
  const hasPodium = entries.length >= 3 && anyoneHasScored;
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
          // ⚠ The engine writes RANK() OVER (…), not ROW_NUMBER(), so ties
          // legitimately share a rank (1, 1, 3). Deriving the number from the
          // array position broke every tie apart and disagreed with the league
          // boards two tabs away, which already read the stored rank — the same
          // two entries showed joint-4th there and 4th/5th here. Position is
          // only a fallback for a pool the server has not ranked yet.
          rank={entry.current_rank ?? restStart + i + 1}
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
