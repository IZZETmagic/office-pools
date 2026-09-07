import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Image, Pressable, Text as RNText, View } from 'react-native';

import { ClubRow, HeaderRow } from '@/components/league/leagueTableRow';
import { Icon } from '@/components/ui';
import { getCompetitionMarkPng, getPoolStripe } from '@/lib/design/competition';
import type { LeagueStandingRow } from '@/lib/useTournamentMatches';
import { fontFamilies, useTheme } from '@/theme';

// =============================================================
// Where these two stand
// =============================================================
// The league counterpart to `GroupStandingsCard`. A World Cup group match has
// four teams and a table that fits; a league fixture has twenty, and twenty rows
// under a scoreline is Match Centre's Tables view — one tap away, and already
// built.
//
// So it is exactly the two clubs playing, with their real table line beside
// them. An earlier version padded that out with a neighbouring place either
// side and an ellipsis where the table continued; the neighbours were not the
// question the fixture asks, and the gap marker was explaining a decision
// rather than telling anyone anything.
//
// ⚠ HIGHER PLACED FIRST, not home first. This is a table, and a table is
// ordered by position — putting the home side on top would silently reorder the
// league for half of all fixtures.
//
// ⚠ THE ROWS ARE NOT DRAWN HERE. `components/league/leagueTableRow` owns them,
// shared with the full table, so the two screens cannot shade the same season
// differently. See that file for why the band belongs to the place.
// =============================================================

export function LeagueTableSliceCard({
  rows,
  competition,
  competitionId,
  seasonId,
}: {
  /** The two clubs' table rows, higher placed first. */
  rows: LeagueStandingRow[];
  competition: string | null;
  /** The api-football league id — the key every brand lookup is on. */
  competitionId: number | null;
  seasonId: string;
}) {
  const theme = useTheme();
  const mark = getCompetitionMarkPng(competitionId);

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
      {/*
        The competition, named and marked. Tapping opens the full table.
        `initialSeasonId` opens Match Centre on THIS competition — a member in
        two leagues who taps from a Premier League game should not land on
        La Liga.
      */}
      <Pressable
        onPress={() =>
          router.navigate({
            // ⚠ `season`, not `seasonId` — the Results screen reads
            // `useLocalSearchParams<{ view, season }>`.
            pathname: '/(tabs)/results',
            params: { view: 'tables', season: seasonId },
          })
        }
        accessibilityRole="link"
        accessibilityLabel={`${competition ?? 'League'} table. Open the full table.`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 12,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        {/*
          ⚠ THE MARK IS A WHITE KNOCKOUT, so it needs the competition's own
          gradient behind it — on the card's white surface it would be invisible.
          Same chip the competition picker and the rail draw.
        */}
        {mark && competitionId != null ? (
          <LinearGradient
            colors={getPoolStripe(competitionId)}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Image
              source={mark}
              style={{ width: 17, height: 17 }}
              resizeMode="contain"
              fadeDuration={0}
            />
          </LinearGradient>
        ) : null}

        <RNText
          numberOfLines={1}
          style={{ flex: 1, fontFamily: fontFamilies.bold, fontSize: 16, color: theme.colors.ink }}
        >
          {competition ?? 'League'}
        </RNText>
        <Icon name="chevron.right" size={12} tint={theme.colors.silver} weight="bold" />
      </Pressable>

      <HeaderRow />
      {rows.map((row, i) => (
        <ClubRow
          key={row.club_id}
          row={row}
          // Both rows ARE the fixture, so neither is highlighted against the
          // other — the tint existed to pick them out of their neighbours, and
          // there are no neighbours now.
          highlight={false}
          divider={i > 0}
        />
      ))}
    </View>
  );
}
