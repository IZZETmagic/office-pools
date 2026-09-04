import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Card, Icon, Text } from '@/components/ui';
import { duelResult } from '@/lib/duelPoints';
import { fixturesForWeek } from '@/lib/pickemWeek';
import { useDuel } from '@/lib/useDuel';
import { useLeaguePool, type LeagueMatch } from '@/lib/useLeaguePool';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// THE ROOM — every duel of a matchweek, and what each was decided on
// =============================================================
// Ryan, 2026-09-04: there was no way to see your own duel history, nor anybody
// else's, nor what everyone picked in a given week. All three are the same
// question asked about one MATCHWEEK, so the matchweek is the whole navigation:
// walk back through the weeks and every answer is already there.
//
// It replaces the Predictions tab for Showdown, which was a placeholder reading
// "Make your picks on the web" — untrue since the Duel tab's Your Sheet card
// started routing into the RN picker.
//
// ## ⚠ THE SWITCHER STOPS AT WHAT HAS BEEN REVEALED
//
// Migration 116 seals the draw, and the contract reads duels with the VIEWER's
// client — so a sealed week is not in the payload at all. `revealedWeeks` is
// therefore the exact set of weeks a member may look at, and the arrows are
// bounded by it rather than by the season. There is nothing to hide here
// because there is nothing here to hide.
//
// ## ⚠ AN OPEN WEEK HAS NO RIVALS' PICKS, AND THAT IS NOT AN EMPTY WEEK
//
// `/bulk` withholds a matchweek that is still open. So the current week's card
// lists its duels and its fixtures with nobody's picks beside them, and the
// screen has to say "not yet" rather than render blanks that read as "nobody
// picked". Nothing here may reconstruct a pick from another source.
// =============================================================

type Props = {
  poolId: string;
};

export function ShowdownRoom({ poolId }: Props) {
  const theme = useTheme();
  const league = useLeaguePool(poolId);
  const { duels, names, revealedWeeks, pickDirections, bouts } = useDuel(poolId);

  /**
   * Your own entries, so your duel can be anchored in the week.
   *
   * ⚠ From `bouts`, not from a `currentUserId` prop. `useDuel` already resolves
   * which entries are yours — passing the user id in as well would be a second
   * answer to a question that has one, and the two could disagree in a
   * multi-entry pool.
   */
  const ownEntryIds = useMemo(() => new Set(bouts.map((b) => b.you.entryId)), [bouts]);

  // Opens on the LATEST revealed week — the one people are actually talking
  // about — rather than on matchweek one.
  const [week, setWeek] = useState<number | null>(null);
  const shown = week ?? revealedWeeks[revealedWeeks.length - 1] ?? null;

  const [openDuel, setOpenDuel] = useState<string | null>(null);

  const weekDuels = useMemo(
    () => duels.filter((d) => d.matchweek_number === shown),
    [duels, shown],
  );
  const fixtures = useMemo(
    () => (shown === null ? [] : fixturesForWeek(league.data?.season.matches ?? [], shown)),
    [league.data, shown],
  );

  if (league.isPending) {
    return (
      <View style={{ paddingVertical: theme.spacing.xxxl, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (shown === null) {
    return (
      <View style={{ padding: theme.spacing.xxxl, alignItems: 'center', gap: theme.spacing.sm }}>
        <Icon name="person.2.fill" color="slate" size={34} />
        <Text variant="cardTitle">Nothing to show yet</Text>
        <Text variant="body" color="slate" style={{ textAlign: 'center' }}>
          The room fills up as duels open. Your first one appears here once it does.
        </Text>
      </View>
    );
  }

  const i = revealedWeeks.indexOf(shown);
  const canBack = i > 0;
  const canForward = i >= 0 && i < revealedWeeks.length - 1;

  return (
    <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
      {/*
        ⚠ BOUNDED BY `revealedWeeks`, not by the season. Walking past the last
        revealed week would land on a matchweek whose duels the viewer is not
        allowed to see — the arrow simply is not there instead.
      */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Step
          icon="chevron.left"
          label="Previous matchweek"
          enabled={canBack}
          onPress={() => setWeek(revealedWeeks[i - 1])}
        />
        <Text variant="cardTitle">Matchweek {shown}</Text>
        <Step
          icon="chevron.right"
          label="Next matchweek"
          enabled={canForward}
          onPress={() => setWeek(revealedWeeks[i + 1])}
        />
      </View>

      {weekDuels.map((d) => {
        const aIsYou = ownEntryIds.has(d.entry_a);
        const bIsYou = d.entry_b !== null && ownEntryIds.has(d.entry_b);
        return (
          <DuelRow
            key={d.duel_id}
            duel={d}
            names={names}
            isYours={aIsYou || bIsYou}
            open={openDuel === d.duel_id}
            onToggle={() => setOpenDuel(openDuel === d.duel_id ? null : d.duel_id)}
            fixtures={fixtures}
            pickDirections={pickDirections}
          />
        );
      })}
    </View>
  );
}

// -------------------------------------------------------------- one duel

function DuelRow({
  duel,
  names,
  isYours,
  open,
  onToggle,
  fixtures,
  pickDirections,
}: {
  duel: ReturnType<typeof useDuel>['duels'][number];
  names: Record<string, string>;
  isYours: boolean;
  open: boolean;
  onToggle: () => void;
  fixtures: LeagueMatch[];
  pickDirections: Map<string, Map<string, string>>;
}) {
  const theme = useTheme();
  const name = (id: string | null) => (id ? names[id] ?? 'Unknown' : 'Bye');
  const settled = !!duel.settled_at;
  // ⚠ `duelResult` from side A's column, never a literal — a win has been 500
  // since migration 121.
  const aResult = settled && duel.entry_b ? duelResult(duel.points_a) : null;

  const tint =
    aResult === 'won'
      ? theme.colors.green
      : aResult === 'lost'
        ? theme.colors.red
        : theme.colors.ink;

  return (
    <Card bordered style={isYours ? { borderColor: withOpacity(theme.colors.primary, 0.5) } : null}>
      <Pressable onPress={onToggle} accessibilityRole="button">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Text
            variant="cardTitle"
            numberOfLines={1}
            style={{ flex: 1, fontFamily: aResult === 'won' ? fontFamilies.black : undefined }}
          >
            {name(duel.entry_a)}
          </Text>

          <Text
            variant="cardTitle"
            style={{ color: tint, fontFamily: fontFamilies.black, fontVariant: ['tabular-nums'] }}
          >
            {/* ⚠ A duel that has not settled has NULL accuracies, not zeroes.
                Rendering 0–0 on a week nobody has played yet claims a result. */}
            {settled && duel.entry_b
              ? `${duel.accuracy_a ?? 0} – ${duel.accuracy_b ?? 0}`
              : duel.entry_b
                ? 'v'
                : 'bye'}
          </Text>

          <Text
            variant="cardTitle"
            numberOfLines={1}
            style={{
              flex: 1,
              textAlign: 'right',
              fontFamily: aResult === 'lost' ? fontFamilies.black : undefined,
            }}
          >
            {name(duel.entry_b)}
          </Text>

          <Icon name={open ? 'chevron.up' : 'chevron.down'} color="slate" size={12} />
        </View>
      </Pressable>

      {open ? (
        <Sheets
          duel={duel}
          fixtures={fixtures}
          pickDirections={pickDirections}
          names={names}
        />
      ) : null}
    </Card>
  );
}

// ------------------------------------------------------------- the sheets

/**
 * Both members' picks, fixture by fixture.
 *
 * ⚠ WHERE THEY AGREE IS DEAD WEIGHT. A fixture both called the same way cannot
 * separate them whatever it finishes — so those rows are dimmed and the ones
 * they differ on are left bright. That is the reading this whole screen exists
 * for, and it is why the picks are worth showing side by side rather than as
 * two lists.
 */
function Sheets({
  duel,
  fixtures,
  pickDirections,
  names,
}: {
  duel: ReturnType<typeof useDuel>['duels'][number];
  fixtures: LeagueMatch[];
  pickDirections: Map<string, Map<string, string>>;
  names: Record<string, string>;
}) {
  const theme = useTheme();

  if (duel.entry_b === null) {
    return (
      <Text variant="body" color="slate" style={{ marginTop: theme.spacing.md }}>
        {names[duel.entry_a] ?? 'They'} sat this one out — nobody was drawn against them.
      </Text>
    );
  }

  const a = pickDirections.get(duel.entry_a);
  const b = pickDirections.get(duel.entry_b);

  // ⚠ NO PICKS AT ALL means the matchweek has not locked, not that nobody
  // picked — `/bulk` withholds an open week. Saying "not yet" is the only
  // honest reading; blanks would accuse both members of skipping it.
  if (!a && !b) {
    return (
      <Text variant="body" color="slate" style={{ marginTop: theme.spacing.md }}>
        Picks open when the matchweek locks — an hour before the first kickoff.
      </Text>
    );
  }

  const differing = fixtures.filter(
    (f) => a?.get(f.match_id) !== b?.get(f.match_id),
  ).length;

  return (
    <View style={{ marginTop: theme.spacing.md }}>
      <Text variant="detail" color="slate" style={{ marginBottom: theme.spacing.sm }}>
        {differing === 0
          ? 'Identical sheets — nothing can separate them.'
          : `${fixtures.length - differing} of ${fixtures.length} the same. This duel is ${differing} fixture${
              differing === 1 ? '' : 's'
            }.`}
      </Text>

      {fixtures.map((f) => {
        const pa = a?.get(f.match_id) ?? null;
        const pb = b?.get(f.match_id) ?? null;
        const same = pa !== null && pa === pb;
        return (
          <View
            key={f.match_id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
              // Agreement is dimmed, not hidden: seeing that six of ten cancel
              // is what makes the remaining four mean something.
              opacity: same ? 0.4 : 1,
            }}
          >
            <Pick direction={pa} />
            <Text variant="detail" color="slate" numberOfLines={1} style={{ flex: 1 }}>
              {f.home_team?.country_code ?? f.home_team?.country_name ?? 'TBD'} v{' '}
              {f.away_team?.country_code ?? f.away_team?.country_name ?? 'TBD'}
            </Text>
            <Pick direction={pb} align="right" />
          </View>
        );
      })}
    </View>
  );
}

/** One member's call on one fixture. `null` is no pick, which is not a draw. */
function Pick({
  direction,
  align = 'left',
}: {
  direction: string | null;
  align?: 'left' | 'right';
}) {
  const theme = useTheme();
  const label = direction === 'home' ? 'H' : direction === 'away' ? 'A' : direction === 'draw' ? 'D' : '·';
  return (
    <View
      style={{
        width: theme.spacing.xl,
        paddingVertical: theme.spacing.xxs,
        borderRadius: theme.radii.xs,
        backgroundColor: direction ? theme.colors.mist : 'transparent',
        alignItems: 'center',
      }}
    >
      <Text
        variant="detail"
        style={{
          color: direction ? theme.colors.ink : theme.colors.slate,
          fontFamily: fontFamilies.bold,
          textAlign: align,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function Step({
  icon,
  label,
  enabled,
  onPress,
}: {
  icon: string;
  label: string;
  enabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={enabled ? onPress : undefined}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      style={({ pressed }) => ({
        width: theme.spacing.xxl,
        height: theme.spacing.xxl,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.mist,
        alignItems: 'center',
        justifyContent: 'center',
        // Dimmed rather than removed, so the header does not reflow as you walk
        // to either end of the season.
        opacity: !enabled ? 0.3 : pressed ? 0.6 : 1,
      })}
    >
      <Icon name={icon} color="slate" size={14} weight="semibold" />
    </Pressable>
  );
}
