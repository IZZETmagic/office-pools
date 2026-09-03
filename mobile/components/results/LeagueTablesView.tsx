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

/**
 * ⚠ ONE SOURCE FOR THE COLUMN WIDTHS. The header and the rows are separate
 * components with no shared layout, so a width changed in one and not the other
 * silently un-aligns the whole table — and a 2px drift is visible down twenty
 * rows.
 *
 * Budgeted for a 375pt phone: 343 after the screen's own padding, 320 inside
 * the card. Rank 22 + crest 26 + these 177 leaves ~95 for the club, which is
 * what the longest shortened name needs — "Nott'm Forest", 13 characters at
 * 13px. Anything longer than that does not exist: `shortClubName` turns
 * "Borussia Mönchengladbach" into "Gladbach" and "Wolverhampton Wanderers"
 * into "Wolves".
 */
const COL = {
  rank: 22,
  pl: 22,
  w: 20,
  d: 20,
  l: 20,
  /** Goals for and against — "45-23" is the widest this gets. */
  ga: 40,
  gd: 26,
  pts: 29,
} as const;

/** Both rows read from this, so a header can never sit off its own column. */
const ROW_PAD_LEFT = 8;
const ROW_PAD_RIGHT = 12;

function HeaderRow() {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: ROW_PAD_LEFT,
        paddingRight: ROW_PAD_RIGHT,
        paddingVertical: 10,
        backgroundColor: theme.colors.mist,
      }}
    >
      <View style={{ width: COL.rank }} />
      <View style={{ flex: 1, paddingLeft: 26 }}>
        <Head align="left">Club</Head>
      </View>
      <Head width={COL.pl}>PL</Head>
      <Head width={COL.w}>W</Head>
      <Head width={COL.d}>D</Head>
      <Head width={COL.l}>L</Head>
      <Head width={COL.ga}>+/-</Head>
      <Head width={COL.gd}>GD</Head>
      <Head width={COL.pts}>PTS</Head>
    </View>
  );
}

/**
 * ⚠ NOT `Text variant="caption"`. That carries `letterSpacing: 1.5`, which adds
 * 4.5px to "PTS" — enough to push a centred header off the column it labels.
 */
function Head({
  children,
  width,
  align = 'center',
}: {
  children: string;
  width?: number;
  align?: 'left' | 'center';
}) {
  const theme = useTheme();
  return (
    <View style={{ width, alignItems: align === 'left' ? 'flex-start' : 'center' }}>
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 11,
          letterSpacing: 0.4,
          color: theme.colors.slate,
        }}
      >
        {children}
      </RNText>
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
        paddingLeft: ROW_PAD_LEFT,
        paddingRight: ROW_PAD_RIGHT,
        paddingVertical: theme.spacing.md,
        borderTopWidth: 1,
        borderTopColor: theme.colors.mist,
        // The stripe belongs to the PLACE, not the club standing in it.
        borderLeftWidth: 3,
        borderLeftColor: row.band ? bandColor(row.band, theme) : 'transparent',
      }}
    >
      <View style={{ width: COL.rank, alignItems: 'center' }}>
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

      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 4 }}>
        {row.crest_url ? (
          <Image source={{ uri: row.crest_url }} style={{ width: 20, height: 20 }} resizeMode="contain" />
        ) : (
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.mist }} />
        )}
        {/* `short_name`, resolved server-side by the same helper the web uses.
            Truncating the full name would eat the half that tells two clubs
            apart — "Manchester Unit…" beside "Manchester Cit…". */}
        <RNText
          numberOfLines={1}
          style={{
            fontFamily: fontFamilies.semibold,
            fontSize: 13,
            color: theme.colors.ink,
            flexShrink: 1,
          }}
        >
          {row.short_name}
        </RNText>
      </View>

      <Num width={COL.pl} muted>{row.played}</Num>
      <Num width={COL.w} muted>{row.won}</Num>
      <Num width={COL.d} muted>{row.drawn}</Num>
      <Num width={COL.l} muted>{row.lost}</Num>
      {/* Goals for and against — the PAIR, not the difference. GD is its own
          column, and printing the same number twice would spend width this
          table has none of. */}
      <Num width={COL.ga} muted>{`${row.goals_for}-${row.goals_against}`}</Num>
      <Num width={COL.gd} muted>
        {row.goals_diff > 0 ? `+${row.goals_diff}` : String(row.goals_diff)}
      </Num>
      <Num width={COL.pts} bold>{row.points}</Num>
    </View>
  );
}

function Num({
  children,
  width,
  bold = false,
  muted = false,
}: {
  children: React.ReactNode;
  width: number;
  bold?: boolean;
  muted?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ width, alignItems: 'center' }}>
      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: bold ? 13 : 12,
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
