import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Platform, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui';
import { fetchTablePrediction, type TableSettings } from '@/lib/api';
import { fontFamilies, useTheme } from '@/theme';

// =============================================================
// WHAT THIS POOL CHARGES — table mode's Scoring tab
// =============================================================
// The Scoring tab was the World Cup's: group bonuses, bracket pairings, a top
// scorer. A table pool awards none of those and pays for things that list
// describes nowhere, so a member reading it was being told the rules of a game
// they are not playing.
//
// ⚠ EVERY NUMBER IS THIS POOL'S OWN, not the shipped defaults. `/table-prediction`
// resolves them against `league_pool_settings` with the same COALESCE
// `league_score_table` uses (migrations 093/113), so this screen and the engine
// cannot quote different prices. Quoting the defaults at a pool that has moved a
// number would describe scoring nobody is being charged.
//
// The per-place ladder is computed there too — `placeLadder` lives in the web's
// `lib/`, which this project cannot import, and a hand-kept copy is two screens
// disagreeing about one pool.
// =============================================================

type Props = {
  poolId: string;
  /** Same key the My Table tab uses, so opening this after it is a cache hit. */
  entryId: string | null;
};

export function LeagueTableScoring({ poolId, entryId }: Props) {
  const theme = useTheme();
  const query = useQuery({
    queryKey: ['table-prediction', poolId, entryId],
    queryFn: () => fetchTablePrediction(poolId, entryId ?? undefined),
  });

  if (query.isPending) {
    return (
      <View style={{ paddingVertical: theme.spacing.xxxl, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }
  if (query.isError) {
    return (
      <View style={{ paddingVertical: theme.spacing.hero, paddingHorizontal: theme.spacing.xl }}>
        <Text variant="body" color="red" align="center">
          {query.error instanceof Error ? query.error.message : 'Scoring rules unavailable.'}
        </Text>
      </View>
    );
  }

  const { settings } = query.data;
  // 'headline_only' scores the bands ALONE. Printing a per-place ladder for one
  // of those pools would promise points it never awards.
  const full = settings.profile === 'full_table';

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.lg,
      }}
    >
      {full ? (
        <Card title="Every club you place">
          {settings.ladder.map((rung) => (
            <PointsRow key={rung.label} label={rung.label} value={rung.value} />
          ))}
          <Note>
            {settings.prices.stepPenalty > 0
              ? `A club placed exactly right is worth ${settings.prices.exactPoints.toLocaleString()}, and every place you are out costs ${settings.prices.stepPenalty.toLocaleString()} of that. It never goes negative — the worst a club can do is nothing.`
              : `Every club you place is worth ${settings.prices.exactPoints.toLocaleString()} whether or not it finishes where you put it, because this pool charges nothing for being out.`}
          </Note>
        </Card>
      ) : null}

      <Card title="The places that matter most">
        <PointsRow label="The champion" value={settings.prices.championBonus} />
        <PointsRow label={`Each of the top ${settings.topN}`} value={settings.prices.topFourBonus} />
        <PointsRow label={`All ${settings.topN}, as a set`} value={settings.prices.perfectTopFourBonus} />
        {/* Only where the competition HAS the band. A league with no Europa
            place must not be shown a price for one — the bounds come from the
            feed for exactly this reason. */}
        {settings.europaFrom !== null ? (
          <PointsRow label="Each Europa place" value={settings.prices.europaBonus} />
        ) : null}
        {settings.conferenceFrom !== null ? (
          <PointsRow label="Each Conference place" value={settings.prices.conferenceBonus} />
        ) : null}
        <PointsRow
          label={`Each of the bottom ${settings.relegationN}`}
          value={settings.prices.relegationBonus}
        />
        <Note>
          The top {settings.topN} and the bottom {settings.relegationN} are scored as sets, not
          orders — naming the right clubs earns the bonus even if you have them in the wrong order
          among themselves.
          {full
            ? ' This is on top of the per-place points above.'
            : ' This pool scores the bands only, so where you put everyone else does not affect your score.'}
        </Note>
        <Note>
          The bands come from the competition itself rather than being assumed — a league with a
          different number of European places or relegation spots is scored on its own.
        </Note>
      </Card>

      <Card title="One decision, all season">
        <Note>
          You order every club once, before the deadline. Nothing is picked week to week — your
          score moves because the real table moves, and it settles when the season ends.
        </Note>
      </Card>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        borderRadius: theme.radii.lg,
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.lg,
        gap: theme.spacing.sm,
        ...theme.shadows.card,
      }}
    >
      <Text variant="cardTitle">{title}</Text>
      {children}
    </View>
  );
}

function PointsRow({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
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
          fontSize: 14,
          fontWeight: '900',
          color: theme.colors.primary,
        }}
      >
        {value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString()}
      </RNText>
    </View>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Text variant="detail" color="slate" style={{ lineHeight: 17, marginTop: theme.spacing.xs }}>
      {children}
    </Text>
  );
}
