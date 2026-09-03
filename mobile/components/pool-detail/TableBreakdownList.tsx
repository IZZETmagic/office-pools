import { Image, Platform, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui';
import type { TableBreakdownRow, TableSettings, TableSummary } from '@/lib/api';
import { fontFamilies, useTheme } from '@/theme';

// =============================================================
// ONE TABLE PREDICTION, PRICED — the rendering, for anybody's entry
// =============================================================
// Extracted from the table screen when the same thing was needed for OTHER
// members' tables in the leaderboard sheet. Two copies of a scoring breakdown is
// how the screen a member checks and the screen they compare against start
// disagreeing — the web keeps one copy for the same reason
// (`TableBreakdownView.tsx`).
//
// It renders and nothing else. Who may see whose table is decided before this is
// reached — see the sheet.
// =============================================================

export function TableBreakdownList({
  rows,
  settings,
  summary,
}: {
  rows: TableBreakdownRow[];
  settings: TableSettings;
  summary: TableSummary;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        borderRadius: theme.radii.lg,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
        ...theme.shadows.card,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
          backgroundColor: theme.colors.mist,
          gap: theme.spacing.sm,
        }}
      >
        <HeadCell width={30}>You</HeadCell>
        <View style={{ flex: 1 }}>
          <Text variant="caption" color="slate">Club</Text>
        </View>
        <HeadCell width={38} align="right">Now</HeadCell>
        <HeadCell width={46} align="right">Diff</HeadCell>
        <HeadCell width={40} align="right">Pts</HeadCell>
      </View>
      {rows.map((r) => (
        <ClubRow
          key={r.club_id}
          row={r}
          settings={settings}
          clubCount={rows.length}
          zeroAt={summary.zeroAt}
        />
      ))}
    </View>
  );
}

function ClubRow({
  row,
  settings,
  clubCount,
  zeroAt,
}: {
  row: TableBreakdownRow;
  settings: TableSettings;
  clubCount: number;
  zeroAt: number;
}) {
  const theme = useTheme();
  const band = bandOf(row.predicted_position, settings, clubCount);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        gap: theme.spacing.sm,
        borderTopWidth: 1,
        borderTopColor: theme.colors.mist,
      }}
    >
      <View style={{ width: 30, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <View
          style={{
            width: 3,
            height: 18,
            borderRadius: 2,
            backgroundColor: band ? bandColor(band, theme) : 'transparent',
          }}
        />
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 13,
            fontWeight: '900',
            color: theme.colors.ink,
          }}
        >
          {row.predicted_position}
        </RNText>
      </View>

      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {row.crest_url ? (
          <Image source={{ uri: row.crest_url }} style={{ width: 18, height: 18 }} resizeMode="contain" />
        ) : (
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: theme.colors.mist }} />
        )}
        {/* ⚠ Not truncated. Cutting the tail eats the half that tells two clubs
            apart — "Manchester Unit…" beside "Manchester Cit…". `short_name`
            would be better still and is not on this RPC; two lines is the
            honest fallback. */}
        <Text variant="body" numberOfLines={2} style={{ flexShrink: 1 }}>
          {row.club_name}
        </Text>
      </View>

      <View style={{ width: 38, alignItems: 'flex-end' }}>
        <Text variant="body" color="slate">
          {row.actual_position ?? '—'}
        </Text>
      </View>
      <View style={{ width: 46, alignItems: 'flex-end' }}>
        <Delta delta={row.delta} zeroAt={zeroAt} />
      </View>
      <View style={{ width: 40, alignItems: 'flex-end' }}>
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 13,
            fontWeight: '900',
            color: theme.colors.ink,
          }}
        >
          {row.points ?? '—'}
        </RNText>
      </View>
    </View>
  );
}

/**
 * How far off this club is — coloured by HOW WRONG, never by which way.
 *
 * ⚠ The web version once coloured by direction: a club finishing higher than you
 * said was green, lower was red. It read as praise and blame and measured the
 * wrong thing — six places out is six places out, and the points are identical
 * whether the club overperformed or collapsed. The arrow still says which way,
 * because that is real information; it just no longer decides the colour.
 *
 * The three-stop ramp is the RN equivalent of the web's `color-mix`, which has
 * no React Native counterpart. Coarser, same meaning, and it escalates in both
 * themes — which a Tailwind shade ladder could not, since the palette flips
 * direction between them.
 */
function Delta({ delta, zeroAt }: { delta: number | null; zeroAt: number }) {
  const theme = useTheme();
  if (delta === null) {
    return <Text variant="body" color="slate">—</Text>;
  }
  if (delta === 0) {
    return (
      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: theme.colors.green }}>
        exact
      </RNText>
    );
  }
  // No decay configured: nothing is "more wrong" than anything else, so there is
  // no heat to show and inventing one would misdescribe the scoring.
  const ratio = zeroAt > 0 ? Math.min(1, Math.abs(delta) / zeroAt) : 0;
  const color =
    zeroAt <= 0 ? theme.colors.slate
      : ratio <= 0.34 ? theme.colors.green
      : ratio <= 0.67 ? theme.colors.amber
      : theme.colors.red;

  return (
    <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color }}>
      {delta < 0 ? '▲' : '▼'} {Math.abs(delta)}
    </RNText>
  );
}

/**
 * Which qualification band a predicted position falls in.
 *
 * ⚠ Reads the pool's OWN bounds. 4 and 3 are Premier League numbers, and a
 * league that relegates one club would otherwise shade three.
 */
function bandOf(
  position: number,
  s: TableSettings,
  clubCount: number,
): 'champion' | 'top' | 'europa' | 'conference' | 'relegation' | null {
  if (position === 1) return 'champion';
  if (position <= s.topN) return 'top';
  if (s.europaFrom !== null && s.europaTo !== null && position >= s.europaFrom && position <= s.europaTo) {
    return 'europa';
  }
  if (
    s.conferenceFrom !== null && s.conferenceTo !== null &&
    position >= s.conferenceFrom && position <= s.conferenceTo
  ) {
    return 'conference';
  }
  // Counted from the BOTTOM, so it needs the club count — and the ordering is
  // every club in the competition, so its own length is that count. Reading it
  // from the rows rather than assuming 20 is what makes this right for the
  // Bundesliga's 18 as well.
  if (clubCount > 0 && position > clubCount - s.relegationN) return 'relegation';
  return null;
}

function bandColor(
  band: 'champion' | 'top' | 'europa' | 'conference' | 'relegation',
  theme: ReturnType<typeof useTheme>,
): string {
  switch (band) {
    case 'champion': return theme.colors.accent;
    case 'top': return theme.colors.primary;
    case 'europa': return theme.colors.green;
    case 'conference': return theme.colors.slate;
    case 'relegation': return theme.colors.red;
  }
}

function HeadCell({
  children,
  width,
  align = 'left',
}: {
  children: string;
  width: number;
  align?: 'left' | 'right';
}) {
  return (
    <View style={{ width, alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
      <Text variant="caption" color="slate">{children}</Text>
    </View>
  );
}
