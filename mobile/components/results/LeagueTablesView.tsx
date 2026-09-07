import { useState } from 'react';
import { Pressable, ScrollView, Text as RNText, View } from 'react-native';

import { ClubRow, HeaderRow, Legend } from '@/components/league/leagueTableRow';
import { Text } from '@/components/ui';
import type { LeagueSeasonTable } from '@/lib/useTournamentMatches';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// THE LEAGUE TABLE, ON A PHONE — the real one, as the competition has it
// =============================================================
// Match Centre's second view. It lives here rather than inside each pool
// because a table is a fact about the SEASON, not the pool: `league_standings`
// has no `pool_id` and never could, and thirteen Premier League pools would
// otherwise carry thirteen copies of one table. The same reasoning that moved
// fixtures out of the pool.
//
// ## Nothing here is computed, ordered or classified
//
// `/api/users/:id/fixtures` sends rows already ordered, already banded, already
// shortened. That is not an efficiency — three rules would otherwise have to be
// reimplemented here, and each has been got wrong once already:
//
//   · clubs the feed leaves genuinely level go alphabetically, matching the
//     official app; a raw read would order the same season differently
//   · the band belongs to the PLACE, not the club standing in it — letting it
//     ride along with a moved club drew the relegation bar on 17, 19 and 20
//   · the band phrases match migration 113's SQL, so a row shaded Europa is a
//     row the engine counts as Europa
//
// ⚠ It shades the REAL table, so it can disagree with a pool's scoring band on
// purpose. A cup winner sitting 15th carries a Europa tag from the feed.
// =============================================================

type Props = {
  tables: LeagueSeasonTable[];
  /**
   * Which competition to open on, when something linked here asking for a
   * specific one — the "See the full table" row on a pool's My Table screen.
   * Ignored if that season is not among the member's, which is the honest
   * fallback: showing a table they do have beats an empty screen.
   */
  initialSeasonId?: string | null;
};

export function LeagueTablesView({ tables, initialSeasonId = null }: Props) {
  const theme = useTheme();
  const [seasonId, setSeasonId] = useState<string | null>(initialSeasonId);

  // Falls back rather than tracking the list: a season can vanish between
  // renders (a pool archived, a refetch) and a dangling id would blank a screen
  // that has a perfectly good table to show.
  const active = tables.find((t) => t.season_id === seasonId) ?? tables[0];
  if (!active) return null;

  return (
    <View style={{ flex: 1 }}>
      {/*
        ⚠ ONLY WHEN THERE IS A CHOICE. The Results screen already holds this
        rule for its competition pill: a member in one Premier League pool is
        never shown a control offering to narrow their football to the Premier
        League. A list of one is a dead tap.
      */}
      {tables.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.xl,
            paddingTop: theme.spacing.md,
            paddingBottom: theme.spacing.md,
            gap: theme.spacing.sm,
          }}
        >
          {tables.map((t) => {
            const on = t.season_id === active.season_id;
            return (
              <Pressable
                key={t.season_id}
                onPress={() => setSeasonId(t.season_id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => ({
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                  borderRadius: theme.radii.pill,
                  backgroundColor: on ? withOpacity(theme.colors.primary, 0.12) : theme.colors.mist,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <RNText
                  style={{
                    fontFamily: fontFamilies.bold,
                    fontSize: 13,
                    color: on ? theme.colors.primary : theme.colors.slate,
                  }}
                >
                  {t.competition ?? 'League'}
                </RNText>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        /*
          ⚠ NAMED, NOT PICKED. The rule above forbids a dead TAP, not the word.
          With one league there was neither: the table sat under a header that
          says "Match Centre" and nothing that says whose table this is. The
          pills carry the competition's name when there is a choice; this
          carries it when there is not.

          Padded to the card's own inset rather than the header's, so the
          title sits flush with the left edge of the table it names.
        */
        <View
          style={{
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.md,
            paddingBottom: theme.spacing.md,
          }}
        >
          <Text variant="sectionHeader">{active.competition ?? 'League'}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.hero,
        }}
      >
        <View
          style={{
            borderRadius: theme.radii.lg,
            backgroundColor: theme.colors.surface,
            overflow: 'hidden',
            ...theme.shadows.card,
          }}
        >
          <HeaderRow />
          {active.standings.map((row) => (
            <ClubRow key={row.club_id} row={row} />
          ))}
        </View>

        <Legend rows={active.standings} />
      </ScrollView>
    </View>
  );
}
