import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Text } from '@/components/ui';
import { visibleStatSections, type StatRow, type StatSection } from '@/lib/matchStatRows';
import type { MatchTeamStats } from '@/lib/useMatchDetail';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// The statistics, grouped, as a tug of war
// =============================================================
// One card per kind of number — shots, expected goals, passing, goalkeeping,
// discipline — because nineteen rows in a single card is a wall: nothing groups,
// so nothing can be skimmed. The grouping lives in `lib/matchStatRows.ts` where
// it can be tested; this file draws it.
//
// Inside a card, one paired bar per statistic: home pulling left, away pulling
// right. The shape is `BattleBar`'s from the pool Form tab, which is the same
// question at a different scale — two numbers competing for one track.
//
// ⚠ POSSESSION IS DRAWN DIFFERENTLY, AND IT EARNS IT. It is the only figure
// here that is a share of a fixed whole: the two numbers always total 100, so a
// single full-width split bar with the percentages inside says everything a row
// would and reads at a glance. Every other statistic is two independent counts
// that merely happen to be comparable.
//
// ⚠ A ROW NULL ON BOTH SIDES IS HIDDEN, NOT DRAWN AS ZERO, and a section left
// with no rows is dropped entirely. Migration 139 records why: `Red Cards: null`
// means nobody was sent off, but `expected_goals: null` means this competition
// does not publish xG at all. Rendering the second as "0.00" states a fact about
// the game that is false, and a heading over an empty card looks like a bug.
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

  const sections = visibleStatSections(home, away);

  if (sections.length === 0) {
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
    <View style={{ gap: 16 }}>
      {/*
        The two clubs, named once at the top rather than on every card. Their
        colours are what tie a bar back to a side, so the legend has to come
        before the first of them.
      */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginHorizontal: 20,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Swatch color={theme.colors.primary} />
          <RNText
            numberOfLines={1}
            style={{ flex: 1, fontFamily: fontFamilies.bold, fontSize: 12, color: theme.colors.ink }}
          >
            {homeName}
          </RNText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
          <RNText
            numberOfLines={1}
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 12,
              color: theme.colors.ink,
              textAlign: 'right',
            }}
          >
            {awayName}
          </RNText>
          <Swatch color={theme.colors.accent} />
        </View>
      </View>

      {sections.map((section) => (
        <SectionCard key={section.key} section={section} home={home} away={away} />
      ))}
    </View>
  );
}

function Swatch({ color }: { color: string }) {
  return <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />;
}

function SectionCard({
  section,
  home,
  away,
}: {
  section: StatSection;
  home: MatchTeamStats | null;
  away: MatchTeamStats | null;
}) {
  const theme = useTheme();
  const isPossession = section.key === 'possession';

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
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: isPossession ? 10 : 4 }}>
        <Text variant="cardTitle">{section.title}</Text>
      </View>

      {isPossession
        ? section.rows.map((row) => (
            <PossessionBar key={row.key} row={row} home={home} away={away} />
          ))
        : section.rows.map((row, i) => (
            <StatBar key={row.key} row={row} home={home} away={away} first={i === 0} />
          ))}
      <View style={{ height: 8 }} />
    </View>
  );
}

/**
 * Possession, as one full-width bar with the numbers inside it.
 *
 * ⚠ THE TWO SIDES SUM TO 100 BY DEFINITION, which is what makes this shape
 * honest here and wrong for everything else on the tab. A split bar implies the
 * whole is fixed; drawing shots that way would suggest 16 and 13 were shares of
 * 29 rather than two independent counts.
 */
function PossessionBar({
  row,
  home,
  away,
}: {
  row: StatRow;
  home: MatchTeamStats | null;
  away: MatchTeamStats | null;
}) {
  const theme = useTheme();
  const h = home ? row.read(home) : null;
  const a = away ? row.read(away) : null;
  const total = (h ?? 0) + (a ?? 0);
  const hFlex = total > 0 ? (h ?? 0) / total : 0.5;

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
      <View style={{ flexDirection: 'row', height: 30, gap: 3 }}>
        <View
          style={{
            flex: Math.max(hFlex, 0.001),
            minWidth: 34,
            borderRadius: theme.radii.xs,
            backgroundColor: theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RNText
            style={{ fontFamily: MONO_BOLD, fontSize: 13, color: '#FFFFFF', fontVariant: ['tabular-nums'] }}
          >
            {h === null ? '—' : `${h}%`}
          </RNText>
        </View>
        <View
          style={{
            flex: Math.max(1 - hFlex, 0.001),
            minWidth: 34,
            borderRadius: theme.radii.xs,
            backgroundColor: theme.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RNText
            style={{ fontFamily: MONO_BOLD, fontSize: 13, color: '#FFFFFF', fontVariant: ['tabular-nums'] }}
          >
            {a === null ? '—' : `${a}%`}
          </RNText>
        </View>
      </View>
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
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderTopWidth: first ? 0 : 0.5,
        borderTopColor: withOpacity(theme.colors.mist, 0.5),
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 5,
        }}
      >
        <Value value={hShown} row={row} align="left" />
        <RNText
          style={{
            fontFamily: fontFamilies.medium,
            fontSize: 11,
            color: theme.colors.slate,
            textAlign: 'center',
          }}
        >
          {row.label}
        </RNText>
        <Value value={aShown} row={row} align="right" />
      </View>

      {/* ⚠ `minWidth` ON EACH SIDE, as `BattleBar` does. Without it a 0-14
          statistic renders one bar the full width and the other invisible,
          which reads as a missing row rather than a shut-out. */}
      <View style={{ flexDirection: 'row', height: 5, gap: 2 }}>
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
  align,
}: {
  value: number | null;
  row: StatRow;
  align: 'left' | 'right';
}) {
  const theme = useTheme();
  return (
    <RNText
      style={{
        width: 56,
        textAlign: align,
        fontFamily: MONO_BOLD,
        fontSize: 13,
        color: theme.colors.ink,
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
