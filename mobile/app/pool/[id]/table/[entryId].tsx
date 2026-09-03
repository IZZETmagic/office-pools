import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TableBreakdownList, TablePicker } from '@/components/pool-detail';
import { Icon, Text } from '@/components/ui';
import { fetchTablePrediction } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// ONE TABLE, FULL SCREEN — the wizard for Predict the Table
// =============================================================
// The World Cup's shape, applied: the Predictions tab lists entries and tapping
// one comes here, exactly as `/pool/[id]/entry/[entryId]` does for the bracket
// picker. Ryan's call, 2026-09-03.
//
// ⚠ A SEPARATE ROUTE, NOT A BRANCH INSIDE THAT ONE. The wizard route opens with
// `usePredictions`, which reads the `predictions` table — a league pool has no
// rows there and never will, so branching after that hook means running a read
// that cannot succeed and hoping its empty result is harmless. This file needs
// different data, so it is a different screen; the working route is untouched.
//
// ⚠ AND IT IS WHAT MAKES THE PICKER LAY OUT. `TablePicker` renders a
// `ScrollViewContainer` with `flex: 1`, which needs a parent with real height.
// Inside the pool's tab pager it had none — `flex: 1` collapses to the content
// inside a ScrollView. On its own route it has the screen, which is where
// `BracketPickerWizard` has always got its height from.
//
// ## Three things it can be
//
//   your own, open      the picker — drag, autosaving
//   your own, locked    the same twenty clubs, priced against the real table
//   somebody else's     the same read-only view, once the deadline has passed
//
// The last is gated in the DATABASE (RLS on `league_table_predictions`, 078 and
// 104 — including for admins). The check here decides what is OFFERED, so a
// member gets a sentence rather than an empty list.
// =============================================================

export default function TableEntryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id, entryId, viewAs, owner } = useLocalSearchParams<{
    id: string;
    entryId: string;
    viewAs?: string;
    owner?: string;
  }>();
  // Spectate = a member looking at somebody else's table after the lock.
  const spectate = viewAs === 'member';
  const ownerName = typeof owner === 'string' ? owner : '';

  const query = useQuery({
    // The same key the pool's tabs use, so arriving here from a screen that has
    // already loaded this entry costs nothing.
    queryKey: ['table-prediction', id, entryId],
    queryFn: () => fetchTablePrediction(id, entryId),
  });

  const title = spectate && ownerName ? `${ownerName}’s table` : 'Your table';

  return (
    // ⚠ `edges={[]}` PLUS AN EXPLICIT `paddingTop`, not `edges={['top']}`.
    //
    // This is a `fullScreenModal`, and the edge inset did not apply — the
    // header drew UNDER the status bar, back button behind the clock. The same
    // file it was copied from does it manually in its loading and error states
    // for what is presumably the same reason; only its main render uses the
    // edge, and that is the one line that did not survive the presentation.
    <SafeAreaView
      edges={[]}
      style={{ flex: 1, backgroundColor: theme.colors.snow, paddingTop: insets.top }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.sm,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: theme.radii.pill,
            backgroundColor: withOpacity(theme.colors.ink, 0.06),
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name="chevron.left" color="ink" size={16} weight="semibold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="cardTitle" numberOfLines={1}>{title}</Text>
        </View>
      </View>

      <Content query={query} poolId={id} entryId={entryId} spectate={spectate} ownerName={ownerName} />
    </SafeAreaView>
  );
}

function Content({
  query,
  poolId,
  entryId,
  spectate,
  ownerName,
}: {
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchTablePrediction>>>>;
  poolId: string;
  entryId: string;
  spectate: boolean;
  ownerName: string;
}) {
  const theme = useTheme();

  if (query.isPending) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }
  if (query.isError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.xl }}>
        <Text variant="body" color="red" align="center">
          {query.error instanceof Error ? query.error.message : 'That table could not be loaded.'}
        </Text>
      </View>
    );
  }

  const { breakdown, settings, summary, savedAt, order, clubs, seededOrder } = query.data;

  // ⚠ The lock is the ONLY switch, and it is the same fact the database trigger
  // enforces. Deciding on "have they filed" would strand somebody who filed
  // early with no way to change their mind.
  if (!spectate && !settings.isLocked) {
    return (
      <TablePicker
        poolId={poolId}
        entryId={entryId}
        clubs={clubs}
        initialOrder={order.length > 0 ? order : seededOrder}
        settings={settings}
        savedAt={savedAt}
        initiallySaved={order.length > 0}
      />
    );
  }

  if (breakdown.length === 0) {
    return (
      <View style={{ alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.hero, paddingHorizontal: theme.spacing.xl }}>
        <Icon name="lock.fill" color="silver" size={30} />
        <Text variant="cardTitle" align="center">
          {spectate
            ? `${ownerName || 'They'} didn’t predict the table`
            : 'You didn’t predict the table'}
        </Text>
        <Text variant="detail" color="slate" align="center" style={{ maxWidth: 280 }}>
          It scores nothing, and everything else in the pool counts as normal.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: theme.spacing.hero,
        gap: theme.spacing.md,
      }}
    >
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
        </View>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: theme.radii.pill,
            backgroundColor: withOpacity(summary.isFinal ? theme.colors.green : theme.colors.slate, 0.15),
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 10,
              letterSpacing: 0.4,
              color: summary.isFinal ? theme.colors.green : theme.colors.slate,
            }}
          >
            {summary.isFinal ? 'Final' : 'Provisional'}
          </RNText>
        </View>
      </View>

      {/* ⚠ Without this the screen contradicts the leaderboard: the per-club
          points below are only the POSITIONAL half, and the band bonuses are
          most of a good table's score. */}
      {summary.lines.length > 0 ? (
        <View
          style={{
            borderRadius: theme.radii.lg,
            backgroundColor: theme.colors.surface,
            overflow: 'hidden',
            ...theme.shadows.card,
          }}
        >
          <View style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, backgroundColor: theme.colors.mist }}>
            <Text variant="caption" color="slate">How the total is made up</Text>
          </View>
          <Line label="Points from where each club was put" points={summary.positional} />
          {summary.lines.map((l) => (
            <Line key={l.label} label={l.label} points={l.points} />
          ))}
        </View>
      ) : null}

      <TableBreakdownList rows={breakdown} settings={settings} summary={summary} />

      {/* The doorway to the real table, at the moment the intent forms: they
          have just read twenty `Now` values. It lives in Match Centre because a
          table is a fact about the SEASON — thirteen Premier League pools would
          otherwise carry thirteen copies of it. */}
      <SeeFullTable seasonId={settings.seasonId} />

      <Text variant="detail" color="slate">
        {summary.isFinal
          ? 'The season is over — these are the final positions.'
          : 'Positions move every matchweek, so this total is provisional until the season ends.'}
      </Text>
    </ScrollView>
  );
}

function Line({ label, points }: { label: string; points: number }) {
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
      <Text variant="body" color="slate" style={{ flexShrink: 1 }}>{label}</Text>
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
