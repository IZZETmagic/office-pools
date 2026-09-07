import { Image, Platform, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui';
import type { LeagueStandingRow } from '@/lib/useTournamentMatches';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// One row of a league table, wherever it is drawn
// =============================================================
// Lifted out of `results/LeagueTablesView.tsx` when the match detail screen
// gained a table slice of its own. It is an extraction, not a rewrite: the
// widths, the fonts and the band stripe are that file's, unchanged.
//
// ⚠ IT MOVED SO THE TWO SCREENS CANNOT DISAGREE. The band is the thing worth
// protecting. `bandColor` and `BAND_LABEL` below match migration 113's phrases,
// so a row shaded Europa is a row the engine counts as Europa — and a second
// hand-kept copy inside `components/match/` is exactly the drift that drew the
// relegation bar on 17, 19 and 20 on 2026-08-28.
//
// ⚠ NOTHING HERE COMPUTES, ORDERS OR CLASSIFIES ANYTHING. `/api/users/:id/fixtures`
// sends rows already ordered, already banded, already shortened, with each
// place's `rank` and band carried on the POSITION rather than on the club
// standing in it. These components render what they are handed.
// =============================================================

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
export const COL = {
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
export const ROW_PAD_LEFT = 8;
export const ROW_PAD_RIGHT = 12;

/** The table's numerals. Android has no bold `monospace`, hence the fork. */
const TABLE_MONO = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';

export function HeaderRow() {
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
export function Head({
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

export function ClubRow({
  row,
  /**
   * Tint the row, for the two clubs playing the match this table is attached
   * to. Off everywhere else — the full table in Match Centre has no such club.
   */
  highlight = false,
  /** The full table draws a divider above every row but its first. */
  divider = true,
}: {
  row: LeagueStandingRow;
  highlight?: boolean;
  divider?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: ROW_PAD_LEFT,
        paddingRight: ROW_PAD_RIGHT,
        paddingVertical: theme.spacing.md,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: theme.colors.mist,
        backgroundColor: highlight ? withOpacity(theme.colors.primary, 0.06) : 'transparent',
        // The stripe belongs to the PLACE, not the club standing in it.
        borderLeftWidth: 3,
        borderLeftColor: row.band ? bandColor(row.band, theme) : 'transparent',
      }}
    >
      <View style={{ width: COL.rank, alignItems: 'center' }}>
        <RNText
          style={{
            fontFamily: TABLE_MONO,
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
            fontFamily: highlight ? fontFamilies.bold : fontFamilies.semibold,
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

export function Num({
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
          fontFamily: TABLE_MONO,
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
export function Legend({ rows }: { rows: LeagueStandingRow[] }) {
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

export const BAND_LABEL: Record<NonNullable<LeagueStandingRow['band']>, string> = {
  champions: 'Champions League',
  europa: 'Europa League',
  conference: 'Conference League',
  relegation: 'Relegation',
};

export function bandColor(
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
