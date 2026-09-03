import { useQuery } from '@tanstack/react-query';
import { Image, Platform, Text as RNText, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import {
  fetchTablePrediction,
  type TableBreakdownRow,
  type TableSettings,
  type TableSummary,
} from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// MY TABLE — one decision in August, then a season of watching it
// =============================================================
// This is the Predictions tab for a table pool. It keeps that name and that
// slot: the pool asks for one prediction, so the tab that holds predictions is
// where it belongs, and adding a second tab beside an empty one would have been
// describing our data model rather than the game.
//
// Two screens that are really one screen at two points in time:
//
//   before the lock   the ordering you filed, and how long is left
//   after the lock    the same list against the real table, with what each
//                     club is currently worth
//
// The second is the reason the mode exists. Decision 9's original objection to
// Full Table was that "done for the season in August leaves nothing to say to
// each other on a Tuesday in November" — this screen is the answer.
//
// ## Nothing here computes a score
//
// Per-club points, deltas and band hits come from `league_table_breakdown`
// (migration 081). The totals and the band-bonus lines come from
// `summariseTable` on the SERVER (`lib/league/tableSummary.ts`), because that
// formula mirrors `league_score_table` and a copy here would be its third. The
// only arithmetic below is `Math.abs` on a delta, for an arrow.
//
// ## Read-only, on purpose
//
// Ryan, 2026-09-02: a league pool on a phone is read-only until picking gets
// its own design pass — the same call that reverted the Pick'em picker. Before
// the deadline this screen shows what you filed and sends you to the web to
// change it; it does not drag.
// =============================================================

type Props = {
  poolId: string;
  /** Null when the viewer has no entry — a super admin looking in, say. */
  entryId: string | null;
};

export function LeagueMyTableTab({ poolId, entryId }: Props) {
  const theme = useTheme();

  // ⚠ NO `refetchInterval`. A table moves when a matchweek finishes, not on a
  // timer, and the 30 s staleTime plus the AppState focus wiring already brings
  // this current when someone opens the app. Polling it would buy nothing.
  const query = useQuery({
    queryKey: ['table-prediction', poolId, entryId],
    queryFn: () => fetchTablePrediction(poolId, entryId ?? undefined),
  });

  if (query.isPending) {
    return <Centered>Loading your table…</Centered>;
  }
  if (query.isError) {
    return (
      <Centered tone="red">
        {query.error instanceof Error ? query.error.message : 'That table could not be loaded.'}
      </Centered>
    );
  }

  const { breakdown, settings, summary, savedAt } = query.data;
  const filed = breakdown.length > 0;

  // ⚠ THREE STATES, NOT TWO. "Never got the chance" and "had the chance and
  // skipped it" score the same nothing and deserve different sentences —
  // Decision 11. A blank screen under a 0 reads as having played badly.
  if (!filed) {
    return settings.isLocked ? (
      <EmptyState
        icon="lock.fill"
        title="You didn’t predict the table"
        caption="It scores nothing, and everything else in the pool counts as normal."
      />
    ) : (
      <EmptyState
        icon="iphone.and.arrow.forward"
        title="Predict the table on the web"
        caption={
          settings.lockAt
            ? `Twenty clubs, one order, one deadline — ${formatDeadline(settings.lockAt)}. Picking isn’t on the phone yet.`
            : 'Twenty clubs, one order, one deadline. Picking isn’t on the phone yet.'
        }
      />
    );
  }

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.lg,
      }}
    >
      <ScoreHeader summary={summary} isLocked={settings.isLocked} savedAt={savedAt} />

      {/* ⚠ WITHOUT THIS THE SCREEN CONTRADICTS THE LEADERBOARD. The per-club
          points below are only the POSITIONAL half; the band bonuses are the
          rest, and they are most of a good table's score. A total without them
          reads as a mistake in the scoring — the opposite of what a breakdown
          is for. */}
      {summary.lines.length > 0 ? (
        <MakeUp summary={summary} />
      ) : null}

      <ClubList rows={breakdown} settings={settings} summary={summary} />

      <Text variant="detail" color="slate">
        {summary.isFinal
          ? 'The season is over — these are the final positions.'
          : 'Positions move every matchweek, so this total is provisional until the season ends.'}
      </Text>
    </View>
  );
}

function ScoreHeader({
  summary,
  isLocked,
  savedAt,
}: {
  summary: TableSummary;
  isLocked: boolean;
  savedAt: string | null;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radii.lg,
        backgroundColor: theme.colors.surface,
        ...theme.shadows.card,
      }}
    >
      <View style={{ flexShrink: 1 }}>
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 26,
            fontWeight: '900',
            color: theme.colors.primary,
          }}
        >
          {summary.total.toLocaleString()}
        </RNText>
        <Text variant="detail" color="slate">
          points from this table · {summary.exact} exactly right
        </Text>
        {/* Only before the lock, where it answers "did my change save?". After
            it, the date is months old and says nothing anyone is asking. */}
        {!isLocked && savedAt ? (
          <Text variant="detail" color="slate">
            Saved {formatDeadline(savedAt)}
          </Text>
        ) : null}
      </View>
      <Pill
        label={summary.isFinal ? 'Final' : 'Provisional'}
        tone={summary.isFinal ? 'green' : 'slate'}
      />
    </View>
  );
}

function MakeUp({ summary }: { summary: TableSummary }) {
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
      <View style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, backgroundColor: theme.colors.mist }}>
        <Text variant="caption" color="slate">
          How the total is made up
        </Text>
      </View>
      <MakeUpLine label="Points from where you put each club" points={summary.positional} />
      {summary.lines.map((l) => (
        <MakeUpLine key={l.label} label={l.label} points={l.points} />
      ))}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm + 2,
          backgroundColor: theme.colors.mist,
        }}
      >
        <Text variant="cardTitle">Total</Text>
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 14,
            fontWeight: '900',
            color: theme.colors.ink,
          }}
        >
          {summary.total.toLocaleString()}
        </RNText>
      </View>
    </View>
  );
}

function MakeUpLine({ label, points }: { label: string; points: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderTopWidth: 1,
        borderTopColor: theme.colors.mist,
      }}
    >
      <Text variant="body" color="slate" style={{ flexShrink: 1 }}>
        {label}
      </Text>
      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 13,
          fontWeight: '700',
          color: theme.colors.ink,
        }}
      >
        +{points.toLocaleString()}
      </RNText>
    </View>
  );
}

function ClubList({
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
        <HeadCell width={32} align="right">Now</HeadCell>
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

      <View style={{ width: 32, alignItems: 'flex-end' }}>
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

// ---------------------------------------------------------------- furniture

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

function Pill({ label, tone }: { label: string; tone: 'green' | 'slate' }) {
  const theme = useTheme();
  const color = tone === 'green' ? theme.colors.green : theme.colors.slate;
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: theme.radii.pill,
        backgroundColor: withOpacity(color, 0.15),
      }}
    >
      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 10, color, letterSpacing: 0.4 }}>
        {label}
      </RNText>
    </View>
  );
}

function Centered({ children, tone }: { children: string; tone?: 'red' }) {
  const theme = useTheme();
  return (
    <View style={{ paddingVertical: theme.spacing.hero, paddingHorizontal: theme.spacing.xl }}>
      <Text variant="body" color={tone === 'red' ? 'red' : 'slate'} align="center">
        {children}
      </Text>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  caption,
}: {
  icon: string;
  title: string;
  caption: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.hero,
        paddingHorizontal: theme.spacing.xl,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: withOpacity(theme.colors.accent, 0.12),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon as never} color="accent" size={28} />
      </View>
      <Text variant="sectionHeader" align="center">{title}</Text>
      <Text variant="body" color="slate" align="center">{caption}</Text>
    </View>
  );
}

/** Device-local, like every other instant in the app. */
function formatDeadline(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'soon';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
