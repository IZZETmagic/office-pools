import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Card, Icon, Text } from '@/components/ui';
import { duelResult } from '@/lib/duelPoints';
import { buildSheet, sheetSummary, type SheetFixture } from '@/lib/duelSheet';
import { fixturesForWeek } from '@/lib/pickemWeek';
import { toSheetFixtures, useDuel } from '@/lib/useDuel';
import { useDuelLive, type DuelLive } from '@/lib/useDuelLive';
import { useLeaguePool } from '@/lib/useLeaguePool';
import { DUEL_SCORE_W, Scoreline, TeamSheetRows } from './TeamSheet';
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
  const { duels, names, revealedWeeks, pickLabels, bouts } = useDuel(poolId);

  /**
   * Your own entries, so your duel can be anchored in the week.
   *
   * ⚠ From `bouts`, not from a `currentUserId` prop. `useDuel` already resolves
   * which entries are yours — passing the user id in as well would be a second
   * answer to a question that has one, and the two could disagree in a
   * multi-entry pool.
   */
  const ownEntryIds = useMemo(() => new Set(bouts.map((b) => b.you.entryId)), [bouts]);

  /**
   * Opens on the week being PLAYED — Ryan. That is the one people are talking
   * about while they are talking about it.
   *
   * ⚠ Falls back to the latest revealed week, and it has to: `inPlayMatchweekNumber`
   * is NULL between matchweeks, which is most of any given week. It is also
   * checked against `revealedWeeks` rather than trusted — a week can be in play
   * with its duels still sealed, and landing there would open the switcher on a
   * matchweek with nothing in it.
   *
   * ⚠ `week` stays null until the member taps an arrow, so the default keeps
   * following the football as the payload loads. Seeding state from data would
   * pin it to whatever was true on the first render.
   */
  const inPlay = league.data?.season.inPlayMatchweekNumber ?? null;
  const [week, setWeek] = useState<number | null>(null);
  const shown =
    week ??
    (inPlay !== null && revealedWeeks.includes(inPlay)
      ? inPlay
      : revealedWeeks[revealedWeeks.length - 1] ?? null);

  const [openDuel, setOpenDuel] = useState<string | null>(null);

  const weekDuels = useMemo(
    () => duels.filter((d) => d.matchweek_number === shown),
    [duels, shown],
  );
  const fixtures = useMemo(
    () =>
      shown === null
        ? []
        : toSheetFixtures(fixturesForWeek(league.data?.season.matches ?? [], shown)),
    [league.data, shown],
  );

  /**
   * The per-fixture points for the week on screen, so an expanded duel can show
   * WHO TOOK each fixture rather than only who picked what.
   *
   * ⚠ IT MUST COME FROM THE SERVER. Both picks and the final score are already
   * here, so it is tempting to work out who was right on the phone — that is
   * exactly the client-side scoring the architecture rule forbids, and at Scores
   * depth it would have to reimplement the exact/result tiers to get it wrong
   * quietly. `/duel-live` already computes it for every entry in a matchweek.
   *
   * ⚠ ANY REVEALED WEEK, not just the live one — the route takes the matchweek
   * as a parameter and its own header explains why that is safe: the seal
   * withholds who you are PLAYING, never what was scored in a week already
   * played. Polling is off unless this week is the one in progress.
   */
  const live = useDuelLive(poolId, shown, shown !== null && shown === inPlay);

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
            pickLabels={pickLabels}
            live={live}
          />
        );
      })}
    </View>
  );
}

/** The disclosure chevron, and the spacer that balances it. */
const CHEVRON = 12;

// -------------------------------------------------------------- one duel

function DuelRow({
  duel,
  names,
  isYours,
  open,
  onToggle,
  fixtures,
  pickLabels,
  live,
}: {
  duel: ReturnType<typeof useDuel>['duels'][number];
  names: Record<string, string>;
  isYours: boolean;
  open: boolean;
  onToggle: () => void;
  fixtures: SheetFixture[];
  pickLabels: Map<string, Map<string, string>>;
  live: DuelLive;
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

  /**
   * The week's points so far, for a duel that has not settled.
   *
   * Both null until at least one side has a scored fixture — see the note by
   * the scoreline for why that is not the same as nil-nil.
   */
  const running = (() => {
    if (duel.entry_b === null) return { a: null, b: null };
    const a = live.points.get(duel.entry_a);
    const b = live.points.get(duel.entry_b);
    if (a === undefined && b === undefined) return { a: null, b: null };
    return { a: a ?? 0, b: b ?? 0 };
  })();

  return (
    <Card bordered style={isYours ? { borderColor: withOpacity(theme.colors.primary, 0.5) } : null}>
      <Pressable onPress={onToggle} accessibilityRole="button">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          {/*
            ⚠ A SPACER THE SIZE OF THE CHEVRON — Ryan, 2026-09-05: centre the
            dash on the page.

            It already sat dead centre of its own `Scoreline`, and the scoreline
            still landed left of the card's middle, because the chevron is 12pt
            of real layout on the right with nothing answering it on the left.
            Both names are `flex: 1`, so they split whatever is left over — and
            what is left over was 20pt shorter on one side.

            Balancing it in the FLOW rather than positioning the chevron
            absolutely: an absolute chevron needs the row's height to centre
            against, and would sit over the end of a long name instead of
            pushing it. Twenty points of matching inset reads as padding; an
            off-centre axis reads as a mistake.
          */}
          <View style={{ width: CHEVRON }} />

          <Text
            variant="cardTitle"
            numberOfLines={1}
            style={{ flex: 1, fontFamily: aResult === 'won' ? fontFamilies.black : undefined }}
          >
            {name(duel.entry_a)}
          </Text>

          {duel.entry_b === null ? (
            // ⚠ THE SCORELINE'S OWN WIDTH, so a bye sits on the same axis every
            // other row's dash does. Left to size itself it pulled the two names
            // inward and broke the column.
            <Text
              variant="cardTitle"
              color="slate"
              align="center"
              style={{ width: DUEL_SCORE_W, fontFamily: fontFamilies.black }}
            >
              bye
            </Text>
          ) : (
            /*
              ⚠ THE SCORE THE MOMENT THERE IS ONE — Ryan, 2026-09-05. It used to
              wait for `settled_at`, so a matchweek being played, and a played
              one not yet settled, both showed "v" while the Duel tab three taps
              away had the running scoreline on the header. Same duel, two
              answers.

              ⚠ A SETTLED DUEL STILL READS ITS STORED ACCURACIES, not the live
              map. That is the engine's own record of the week and it is what
              `duelResult` was computed from; preferring a recomputed number
              would let the card and the result disagree after a rescore.

              ⚠ AND "NO ROWS YET" IS NOT "NIL". `readMatchweekPoints` omits an
              entry with no score rows, so `undefined` means the fixtures have
              not been scored — which is a `v`, not a 0-0 claiming a week nobody
              has played. One side present is enough: the other genuinely has
              nothing so far, and 0 is the honest number for it.
            */
            <Scoreline
              kind="duel"
              home={settled ? duel.accuracy_a ?? 0 : running.a}
              away={settled ? duel.accuracy_b ?? 0 : running.b}
              tone={settled ? tint : undefined}
            />
          )}

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

          <Icon name={open ? 'chevron.up' : 'chevron.down'} color="slate" size={CHEVRON} />
        </View>
      </Pressable>

      {open ? (
        <Sheets duel={duel} fixtures={fixtures} pickLabels={pickLabels} live={live} names={names} />
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
  pickLabels,
  live,
  names,
}: {
  duel: ReturnType<typeof useDuel>['duels'][number];
  fixtures: SheetFixture[];
  pickLabels: Map<string, Map<string, string>>;
  live: DuelLive;
  names: Record<string, string>;
}) {
  const theme = useTheme();

  const a = pickLabels.get(duel.entry_a);
  const b = duel.entry_b ? pickLabels.get(duel.entry_b) : undefined;

  const rows = useMemo(
    () =>
      buildSheet({
        fixtures,
        live: new Map(live.fixtures.map((f) => [f.number, f])),
        mine: live.perFixture.get(duel.entry_a) ?? new Map(),
        theirs: duel.entry_b ? live.perFixture.get(duel.entry_b) ?? new Map() : new Map(),
        label: (entryId, fixtureId) => pickLabels.get(entryId)?.get(fixtureId) ?? null,
        youEntry: duel.entry_a,
        themEntry: duel.entry_b,
      }),
    [fixtures, live, pickLabels, duel.entry_a, duel.entry_b],
  );

  const summary = sheetSummary(rows);

  if (duel.entry_b === null) {
    return (
      <Text variant="body" color="slate" style={{ marginTop: theme.spacing.md }}>
        {names[duel.entry_a] ?? 'They'} sat this one out — nobody was drawn against them.
      </Text>
    );
  }

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

  return (
    <View style={{ marginTop: theme.spacing.md }}>
      {/*
        ⚠ THE SAME SHEET THE DUEL TAB SHOWS — Ryan, 2026-09-05. This used to be
        a thinner version of it: a chip either side of "ARS v CHE" as one grey
        string, with no crest, no scoreline and no kickoff. It drifted the
        moment the Duel tab's row grew, and a member switching between the two
        tabs is comparing them directly.

        ⚠ AND `buildSheet`, NOT A SECOND DERIVATION. The outcome rule — who took
        a fixture, and the difference between "not started" and "nobody is ahead
        yet" — has three shipped bugs behind it and 21 tests holding it. A
        Room-shaped copy would have had none of them.

        ⚠ WHOSE COLUMN IS WHICH: `entry_a` on the left in blue, `entry_b` on the
        right in red, matching the two names in the header above. Orientation is
        presentational — the circle method's sides carry no meaning — but the
        colours must agree with the names or the sheet is unreadable.
      */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: theme.spacing.sm,
          marginBottom: theme.spacing.xs,
        }}
      >
        <Text variant="caption" numberOfLines={1} style={{ color: theme.colors.primary }}>
          {names[duel.entry_a] ?? 'Unknown'}
        </Text>
        <Text
          variant="caption"
          numberOfLines={1}
          style={{ flex: 1, textAlign: 'right', color: theme.colors.red }}
        >
          {names[duel.entry_b] ?? 'Unknown'}
        </Text>
      </View>

      <TeamSheetRows rows={rows} />

      {/* Agreement is dead weight by definition: a fixture both called the same
          way cannot separate them whatever it finishes. Saying how many is what
          makes the rest mean something. */}
      {summary ? (
        <Text variant="detail" color="slate" style={{ marginTop: theme.spacing.sm }}>
          {summary}
        </Text>
      ) : null}
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
