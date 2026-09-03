import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Image, Platform, Pressable, Text as RNText, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { TableBreakdownList } from './TableBreakdownList';
import { TablePicker } from './TablePicker';
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

  const { breakdown, settings, summary, savedAt, order, clubs, seededOrder } = query.data;
  const filed = breakdown.length > 0;

  // ⚠ BEFORE THE LOCK YOU DRAG; AFTER IT YOU WATCH. One screen at two points in
  // time — and the lock is the ONLY switch, because it is the same fact the
  // database trigger enforces. Deciding this on "have they filed" instead would
  // strand someone who filed early with no way to change their mind.
  if (!settings.isLocked) {
    return (
      <TablePicker
        poolId={poolId}
        entryId={entryId}
        clubs={clubs}
        // Their own order if they have one, else the alphabetical seed.
        initialOrder={order.length > 0 ? order : seededOrder}
        settings={settings}
        savedAt={savedAt}
        initiallySaved={order.length > 0}
      />
    );
  }

  // Locked and never filed. ⚠ Decision 11: "never got the chance" and "had the
  // chance and skipped it" score the same nothing and deserve different
  // sentences — a blank screen under a 0 reads as having played badly.
  if (!filed) {
    return (
      <EmptyState
        icon="lock.fill"
        title="You didn’t predict the table"
        caption="It scores nothing, and everything else in the pool counts as normal."
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

      <TableBreakdownList rows={breakdown} settings={settings} summary={summary} />

      {/*
        The doorway, at the moment the intent forms: they have just read twenty
        `Now` values and the next thought is "what does the real table look
        like". The table itself lives in Match Centre rather than in this pool —
        it is a fact about the SEASON, and thirteen Premier League pools would
        otherwise carry thirteen copies of it.

        ⚠ Carries the season, so it opens on THIS competition rather than
        whichever one Match Centre happens to list first.
      */}
      <SeeFullTable seasonId={settings.seasonId} />

      <Text variant="detail" color="slate">
        {summary.isFinal
          ? 'The season is over — these are the final positions.'
          : 'Positions move every matchweek, so this total is provisional until the season ends.'}
      </Text>
    </View>
  );
}

function SeeFullTable({ seasonId }: { seasonId: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() =>
        router.navigate({
          pathname: '/(tabs)/results',
          params: { view: 'tables', season: seasonId },
        })
      }
      accessibilityRole="link"
      accessibilityLabel="See the full league table"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.radii.lg,
        backgroundColor: theme.colors.surface,
        opacity: pressed ? 0.7 : 1,
        ...theme.shadows.card,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexShrink: 1 }}>
        <Icon name="list.number" color="primary" size={16} />
        <Text variant="body" style={{ flexShrink: 1 }}>See the full table</Text>
      </View>
      <Icon name="chevron.right" color="slate" size={11} />
    </Pressable>
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
