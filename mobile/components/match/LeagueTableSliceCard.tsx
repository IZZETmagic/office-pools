import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, Text as RNText, View } from 'react-native';

import { ClubRow, HeaderRow } from '@/components/league/leagueTableRow';
import { Icon } from '@/components/ui';
import {
  clubColorFromCrestUrl,
  clubIdFromCrestUrl,
  fixturePalette,
} from '@/lib/design/clubColors';
import { getCompetitionMonogram, getPoolStripe } from '@/lib/design/competition';
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
  homeCrestUrl,
  awayCrestUrl,
}: {
  /** The two clubs' table rows, higher placed first. */
  rows: LeagueStandingRow[];
  competition: string | null;
  /** The api-football league id — the key every brand lookup is on. */
  competitionId: number | null;
  seasonId: string;
  /**
   * The fixture, so the away side can change kit.
   *
   * ⚠⚠ THE ROWS ALONE CANNOT ANSWER THIS. They are ordered by POSITION — the
   * note at the top of this file says so — which makes `rows[0]` the away club
   * for half of all fixtures, and the away-kit rule turns entirely on which
   * club is at home. The match screen knows; a table does not.
   */
  homeCrestUrl: string | null;
  awayCrestUrl: string | null;
}) {
  const theme = useTheme();
  const monogram = getCompetitionMonogram(competitionId);

  // ⚠⚠ THE EXTRACT IS A FIXTURE, THE TABLE IS NOT (Ryan, 2026-09-20: "just for
  // the table extract... I do not want to change the actual table standings").
  // These two rows are the two clubs playing, so two blues here collide exactly
  // as they do on every other fixture surface. The full table in Match Centre
  // passes no colour at all and keeps every club in its own — twenty clubs in a
  // column have no home side between them to change kit against.
  const palette = fixturePalette(homeCrestUrl, awayCrestUrl, {
    home: theme.colors.primary,
    away: theme.colors.accent,
  });
  const bothKnown =
    clubColorFromCrestUrl(homeCrestUrl) !== null && clubColorFromCrestUrl(awayCrestUrl) !== null;

  // ⚠ MATCHED ON THE PROVIDER'S CLUB ID, NOT ON THE URL STRING. The standings
  // and the fixture reach this screen down different routes and their crest
  // URLs are not guaranteed to be byte-identical; the numeric id in the last
  // path segment is what both of them carry. A row matching neither — which
  // should not happen — keeps its own colour rather than guessing.
  const homeId = clubIdFromCrestUrl(homeCrestUrl);
  const awayId = clubIdFromCrestUrl(awayCrestUrl);
  const colourFor = (crestUrl: string | null): string | undefined => {
    if (!bothKnown || !palette.usingClubColors) return undefined;
    const id = clubIdFromCrestUrl(crestUrl);
    if (id !== null && id === homeId) return palette.home;
    if (id !== null && id === awayId) return palette.away;
    return undefined;
  };

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
          ⚠ WHITE ON THE COMPETITION'S OWN GRADIENT, because on the card's white
          surface the letters would be invisible. Same chip the competition
          picker and the Results header draw — it held the league's logo until
          2026-09-19 (drafts/2026-09-13_ip_exposure_audit.md §2).
        */}
        {monogram && competitionId != null ? (
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
            <RNText
              style={{
                fontFamily: fontFamilies.black,
                fontSize: 12,
                letterSpacing: 0.2,
                color: '#FFFFFF',
              }}
            >
              {monogram}
            </RNText>
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
          colour={colourFor(row.crest_url)}
        />
      ))}
    </View>
  );
}
