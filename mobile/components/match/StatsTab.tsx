import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Text } from '@/components/ui';
import { visibleStatRows, type StatRow } from '@/lib/matchStatRows';
import type { MatchTeamStats } from '@/lib/useMatchDetail';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// The statistics, as a tug of war
// =============================================================
// One paired bar per statistic, home pulling left and away pulling right. The
// shape is `BattleBar`'s from the pool Form tab, which is the same question at
// a different scale: two numbers competing for one track.
//
// ⚠ A ROW NULL ON BOTH SIDES IS HIDDEN, NOT DRAWN AS ZERO, and this is the
// whole reason `matchStatRows.ts` exists as its own module. Migration 139
// records why: `Red Cards: null` means nobody was sent off, but
// `expected_goals: null` means this competition does not publish xG at all.
// Rendering the second as "0.00" states a fact about the game that is false.
// The rule is per-ROW, not per-value — a stat one side has and the other does
// not is still worth showing.
// =============================================================

export function StatsTab({
  stats,
  homeName,
  awayName,
}: {
  stats: MatchTeamStats[];
  homeName: string;
  awayName: string;
}) {
  const theme = useTheme();
  const home = stats.find((s) => s.side === 'home') ?? null;
  const away = stats.find((s) => s.side === 'away') ?? null;

  const rows = visibleStatRows(home, away);

  if (rows.length === 0) {
    return (
      <View style={{ marginHorizontal: 20, alignItems: 'center', paddingVertical: 40, gap: 6 }}>
        <Text variant="cardTitle" align="center">No statistics yet</Text>
        <Text variant="body" color="slate" align="center">
          They arrive from the competition once the match is under way.
        </Text>
      </View>
    );
  }

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
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 10,
        }}
      >
        <RNText
          numberOfLines={1}
          style={{ flex: 1, fontFamily: fontFamilies.bold, fontSize: 12, color: theme.colors.primary }}
        >
          {homeName}
        </RNText>
        <RNText
          numberOfLines={1}
          style={{
            flex: 1,
            textAlign: 'right',
            fontFamily: fontFamilies.bold,
            fontSize: 12,
            color: theme.colors.accent,
          }}
        >
          {awayName}
        </RNText>
      </View>

      {rows.map((row, i) => (
        <StatBar key={row.key} row={row} home={home} away={away} first={i === 0} />
      ))}
    </View>
  );
}

function StatBar({
  row,
  home,
  away,
  first,
}: {
  row: StatRow;
  home: MatchTeamStats | null;
  away: MatchTeamStats | null;
  first: boolean;
}) {
  const theme = useTheme();
  const h = home ? row.read(home) : null;
  const a = away ? row.read(away) : null;

  // ⚠ A NULL COUNT RENDERS AS 0, A NULL DECIMAL RENDERS AS "—". The row is only
  // here because at least one side has a value; the other side genuinely having
  // none means zero for a count, and "not published" for xG.
  const hShown = h ?? (row.decimals ? null : 0);
  const aShown = a ?? (row.decimals ? null : 0);

  // The split. Both zero is a dead heat rather than a divide by nought, which
  // would otherwise render NaN-width bars on a goalless, shotless opening.
  const total = (hShown ?? 0) + (aShown ?? 0);
  const hFlex = total > 0 ? (hShown ?? 0) / total : 0.5;

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: first ? 0 : 0.5, borderTopColor: withOpacity(theme.colors.mist, 0.5) }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <Value value={hShown} row={row} color={theme.colors.ink} align="left" />
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 11,
            color: theme.colors.slate,
            textAlign: 'center',
          }}
        >
          {row.label}
        </RNText>
        <Value value={aShown} row={row} color={theme.colors.ink} align="right" />
      </View>

      {/* ⚠ `minWidth` ON EACH SIDE, as `BattleBar` does. Without it a 0-14
          statistic renders one bar the full width and the other invisible,
          which reads as a missing row rather than a shut-out. */}
      <View style={{ flexDirection: 'row', height: 6, gap: 2 }}>
        <View
          style={{
            flex: Math.max(hFlex, 0.001),
            minWidth: 2,
            borderRadius: 3,
            backgroundColor: theme.colors.primary,
          }}
        />
        <View
          style={{
            flex: Math.max(1 - hFlex, 0.001),
            minWidth: 2,
            borderRadius: 3,
            backgroundColor: theme.colors.accent,
          }}
        />
      </View>
    </View>
  );
}

function Value({
  value,
  row,
  color,
  align,
}: {
  value: number | null;
  row: StatRow;
  color: string;
  align: 'left' | 'right';
}) {
  return (
    <RNText
      style={{
        width: 56,
        textAlign: align,
        fontFamily: MONO_BOLD,
        fontSize: 13,
        color,
        fontVariant: ['tabular-nums'],
      }}
    >
      {formatStat(value, row)}
    </RNText>
  );
}

/** `null` → "—", a percentage gets its sign back, a decimal keeps two places. */
export function formatStat(value: number | null, row: StatRow): string {
  if (value === null) return '—';
  if (row.percent) return `${value}%`;
  if (row.decimals) return value.toFixed(2);
  return String(value);
}
