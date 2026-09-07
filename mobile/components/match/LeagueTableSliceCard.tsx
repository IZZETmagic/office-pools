import { router } from 'expo-router';
import { Pressable, Text as RNText, View } from 'react-native';

import {
  BAND_LABEL,
  ClubRow,
  HeaderRow,
  bandColor,
} from '@/components/league/leagueTableRow';
import { Icon, Text } from '@/components/ui';
import type { TableSliceEntry } from '@/lib/matchContext';
import type { LeagueStandingRow } from '@/lib/useTournamentMatches';
import { fontFamilies, useTheme } from '@/theme';

// =============================================================
// Where these two stand
// =============================================================
// The league counterpart to `GroupStandingsCard`. A World Cup group match has
// four teams and a table that fits; a league fixture has twenty, and twenty rows
// under a scoreline is Match Centre's Tables view — one tap away, and already
// built. So this shows the narrower thing the fixture actually asks: these two
// clubs' places, and who is around them.
//
// ⚠ THE ROWS ARE NOT DRAWN HERE. `components/league/leagueTableRow` owns them,
// shared with the full table, so the two screens cannot shade the same season
// differently. See that file for why the band belongs to the place.
// =============================================================

export function LeagueTableSliceCard({
  entries,
  competition,
  seasonId,
}: {
  entries: TableSliceEntry[];
  competition: string | null;
  seasonId: string;
}) {
  const theme = useTheme();

  // Only the bands these few rows actually sit in — the same rule the full
  // table's legend follows. A slice of mid-table has none, and prints none.
  const present = [
    ...new Set(
      entries
        .filter((e): e is Extract<TableSliceEntry, { kind: 'row' }> => e.kind === 'row')
        .map((e) => e.row.band)
        .filter(Boolean),
    ),
  ] as NonNullable<LeagueStandingRow['band']>[];

  return (
    <View style={{ gap: 12 }}>
      <View
        style={{
          marginHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <RNText
          style={{ fontFamily: fontFamilies.bold, fontSize: 16, color: theme.colors.ink }}
        >
          {competition ?? 'League'} Table
        </RNText>
        {/*
          The full table is a real screen with the whole season on it, so this
          is a link rather than an expander. `initialSeasonId` opens Match
          Centre on THIS competition — a member in two leagues who taps from a
          Premier League game should not land on La Liga.
        */}
        <Pressable
          onPress={() =>
            router.navigate({
              // ⚠ `season`, not `seasonId` — the Results screen reads
              // `useLocalSearchParams<{ view, season }>`. Same call as the one
              // on a pool's My Table screen, deliberately identical.
              pathname: '/(tabs)/results',
              params: { view: 'tables', season: seasonId },
            })
          }
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel="See the full table"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <RNText
            style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: theme.colors.primary }}
          >
            Full table
          </RNText>
          <Icon name="chevron.right" size={11} tint={theme.colors.primary} weight="bold" />
        </Pressable>
      </View>

      <View
        style={{
          marginHorizontal: 20,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.lg,
          ...theme.shadows.card,
          overflow: 'hidden',
        }}
      >
        <HeaderRow />
        {entries.map((entry, i) =>
          entry.kind === 'gap' ? (
            // ⚠ A GAP IS DRAWN, NOT CLOSED. Two rows reading 4th and 17th with
            // nothing between them says the clubs are adjacent. This says the
            // table continues and we are not showing it.
            <View
              key={`gap-${i}`}
              style={{
                paddingVertical: 6,
                alignItems: 'center',
                borderTopWidth: 1,
                borderTopColor: theme.colors.mist,
              }}
            >
              <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 13, color: theme.colors.silver }}>
                ⋯
              </RNText>
            </View>
          ) : (
            <ClubRow
              key={entry.row.club_id}
              row={entry.row}
              highlight={entry.highlight}
              divider={i > 0}
            />
          ),
        )}
      </View>

      {present.length > 0 ? (
        <View
          style={{
            marginHorizontal: 20,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.md,
          }}
        >
          {present.map((band) => (
            <View key={band} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View
                style={{
                  width: 3,
                  height: 12,
                  borderRadius: 2,
                  backgroundColor: bandColor(band, theme),
                }}
              />
              <Text variant="detail" color="slate">{BAND_LABEL[band]}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
