import { useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui';
import type { LeagueSeasonTable, LeagueStandingRow } from '@/lib/useTournamentMatches';
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
};

export function LeagueTablesView({ tables }: Props) {
  const theme = useTheme();
  const [seasonId, setSeasonId] = useState<string | null>(null);

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
      ) : null}

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

function HeaderRow() {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: theme.spacing.sm,
        paddingRight: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        backgroundColor: theme.colors.mist,
      }}
    >
      <View style={{ width: 26 }} />
      <View style={{ flex: 1 }}>
        <Text variant="caption" color="slate">Club</Text>
      </View>
      <Num>Pl</Num>
      <Num>GD</Num>
      <Num wide>Pts</Num>
    </View>
  );
}

function ClubRow({ row }: { row: LeagueStandingRow }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: theme.spacing.sm,
        paddingRight: theme.spacing.md,
        paddingVertical: theme.spacing.sm + 1,
        borderTopWidth: 1,
        borderTopColor: theme.colors.mist,
        // The stripe belongs to the PLACE. See the header.
        borderLeftWidth: 3,
        borderLeftColor: row.band ? bandColor(row.band, theme) : 'transparent',
      }}
    >
      <View style={{ width: 23, alignItems: 'center' }}>
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 12,
            fontWeight: '700',
            color: theme.colors.slate,
          }}
        >
          {row.rank}
        </RNText>
      </View>

      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        {row.crest_url ? (
          <Image source={{ uri: row.crest_url }} style={{ width: 18, height: 18 }} resizeMode="contain" />
        ) : (
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: theme.colors.mist }} />
        )}
        {/* The shortened name, resolved server-side by the same helper the web
            uses — truncation would eat the half that tells two clubs apart. */}
        <Text variant="body" numberOfLines={1} style={{ flexShrink: 1 }}>
          {row.short_name}
        </Text>
      </View>

      <Num muted>{row.played}</Num>
      <Num muted>{row.goals_diff > 0 ? `+${row.goals_diff}` : String(row.goals_diff)}</Num>
      <Num wide bold>{row.points}</Num>
    </View>
  );
}

function Num({
  children,
  wide = false,
  bold = false,
  muted = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
  bold?: boolean;
  muted?: boolean;
}) {
  const theme = useTheme();
  if (typeof children === 'string' && !bold && !muted) {
    return (
      <View style={{ width: wide ? 34 : 30, alignItems: 'flex-end' }}>
        <Text variant="caption" color="slate">{children}</Text>
      </View>
    );
  }
  return (
    <View style={{ width: wide ? 34 : 30, alignItems: 'flex-end' }}>
      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 12,
          fontWeight: bold ? '900' : '600',
          color: muted ? theme.colors.slate : theme.colors.ink,
        }}
      >
        {children}
      </RNText>
    </View>
  );
}

/**
 * ⚠ Only the bands this competition actually has. Printing a fixed key would
 * advertise a Conference place to a league that has none — and the bands come
 * from the feed precisely because they differ by competition and by season.
 */
function Legend({ rows }: { rows: LeagueStandingRow[] }) {
  const theme = useTheme();
  const present = [...new Set(rows.map((r) => r.band).filter(Boolean))] as NonNullable<
    LeagueStandingRow['band']
  >[];
  if (present.length === 0) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.md,
        paddingTop: theme.spacing.md,
        paddingHorizontal: theme.spacing.xs,
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
  );
}

const BAND_LABEL: Record<NonNullable<LeagueStandingRow['band']>, string> = {
  champions: 'Champions League',
  europa: 'Europa League',
  conference: 'Conference League',
  relegation: 'Relegation',
};

function bandColor(
  band: NonNullable<LeagueStandingRow['band']>,
  theme: ReturnType<typeof useTheme>,
): string {
  switch (band) {
    case 'champions': return theme.colors.primary;
    case 'europa': return theme.colors.green;
    case 'conference': return theme.colors.slate;
    case 'relegation': return theme.colors.red;
  }
}
