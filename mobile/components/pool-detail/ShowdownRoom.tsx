import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { MemberAvatar } from '@/components/avatar/MemberAvatar';
import { Card, Icon, Text, Pressable } from '@/components/ui';
import {
  AVATAR_GRADIENTS,
  avatarBackgroundFor,
  duelColourIndices,
  getInitials,
  gradientForUser,
} from '@/lib/avatarGradient';
import { duelResult } from '@/lib/duelPoints';
import { buildSheet, sheetSummary, type SheetFixture } from '@/lib/duelSheet';
import { fixturesForWeek } from '@/lib/pickemWeek';
import { toSheetFixtures, useDuel } from '@/lib/useDuel';
import { useDuelLive, type DuelLive } from '@/lib/useDuelLive';
import { useLeaguePool } from '@/lib/useLeaguePool';
import type { Standing } from './ShowdownDuelHeader';
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
// ## ⚠ THE SWITCHER STOPS AT WHAT HAS BEEN REVEALED — IN BOTH SENSES
//
// Migration 116 seals the draw, and the contract reads duels with the VIEWER's
// client — so a sealed week is not in the payload at all. That used to be the
// whole story, and this note used to end here: "there is nothing to hide because
// there is nothing here to hide."
//
// ⚠⚠ THAT STOPPED BEING TRUE WHEN THE WALKOUT SHIPPED (2026-09-06). There are
// now TWO reveals — 116 reveals a duel to the DATABASE, the ceremony reveals it
// to the MEMBER — and this screen only ever knew about the first. Between them
// the Room listed the new opponent's name while the band two tabs away read
// "Sealed · Opponent hidden".
//
// So the bound is `revealedWeeks` MINUS `unwatchedMatchweek`. See that prop.
//
// ## ⚠ AN OPEN WEEK HAS NO RIVALS' PICKS, AND THAT IS NOT AN EMPTY WEEK
//
// `/bulk` withholds a matchweek that is still open. So the current week's card
// lists its duels and its fixtures with a dash where each rival's pick will be,
// and SAYS so under the sheet — a bare dash reads as "nobody picked". Nothing
// here may reconstruct a pick from another source.
//
// ⚠⚠ "`/bulk` WITHHOLDS IT" WAS FALSE FOR THE POOL ADMIN UNTIL 2026-10-09. The
// route handed admins every pick, locked or not — a World Cup rule — so Ryan,
// admin of his own Showdown pool, could expand any duel the night before and
// read both sheets. The server now gates league admins like everyone else (see
// `bypassesRevealGate`), and this screen ALSO refuses to draw a rival's pick for
// a week that has not locked: a second wall, so an older server or a future
// bypass shows a dash rather than a sheet.
// =============================================================

type Props = {
  poolId: string;
  /**
   * Where each member sits, keyed by entry — the SAME map the Duel tab and the
   * band read, built once in `pool/[id].tsx` from the leaderboard. The Room only
   * wants the face from it (`userId`, `avatarColour`, `avatarBuild`).
   */
  standings: Map<string, Standing>;
  /**
   * A matchweek whose duel has opened in RLS but whose walkout this member has
   * not watched — withheld from the switcher until they have.
   *
   * ⚠⚠ "REVEALED" NOW MEANS TWO THINGS, AND THIS ROOM ONLY KNEW ONE OF THEM.
   * Migration 116 reveals a duel to the DATABASE; the walkout reveals it to the
   * MEMBER. Those were the same moment until phase 2 existed, and this file's
   * own header still says the switcher "stops at what has been revealed" —
   * true, and about the wrong reveal.
   *
   * The gap is not hypothetical. During phase 2 there is no in-play matchweek,
   * so `shown` falls back to the LATEST revealed week — which is precisely the
   * one being kept back — and the Room listed both names one tab away from a
   * header reading "Sealed · Opponent hidden".
   *
   * ⚠ IT HIDES A WEEK, NOT A NAME. Blanking the opponent inside the row would
   * leave a duel that looks like a bye. The week simply is not offered yet, and
   * arrives whole the moment the walkout is watched.
   */
  unwatchedMatchweek?: number | null;
};

export function ShowdownRoom({ poolId, standings, unwatchedMatchweek = null }: Props) {
  const theme = useTheme();
  const league = useLeaguePool(poolId);
  const { duels, names, revealedWeeks: rlsRevealed, pickLabels, bouts } = useDuel(poolId);

  /**
   * What this member may actually look at — see `unwatchedMatchweek`.
   *
   * ⚠ FILTERED HERE RATHER THAN IN `useDuel`, because the hook has no idea
   * whether a ceremony has been watched and should not learn: the Duel tab and
   * the band both want the week it withholds.
   */
  const revealedWeeks = useMemo(
    () => (unwatchedMatchweek === null ? rlsRevealed : rlsRevealed.filter((w) => w !== unwatchedMatchweek)),
    [rlsRevealed, unwatchedMatchweek],
  );

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

  /**
   * Has the week on screen LOCKED — i.e. may a rival's pick be shown at all?
   *
   * ⚠ FROM THE OPEN MATCHWEEK, NOT FROM `lock_at` AND A CLOCK. The open week is
   * the one being picked, so every week before it has locked by definition, and
   * the server worked that out against its own clock. `useDuel` gates its picks
   * fetch on the same reading for the same reason (and calling `Date.now()` in
   * render is impure). NULL means nothing is open — the season has run out of
   * weeks to pick — so everything shown has locked.
   */
  const openWeek = league.data?.season.openMatchweekNumber ?? null;
  const picksRevealed = shown !== null && (openWeek === null || shown < openWeek);

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
    /*
      ⚠ TWO REASONS FOR AN EMPTY ROOM, AND THEY ARE NOT THE SAME. A pool that has
      played nothing has nothing to show; a member holding an unwatched walkout
      has a week waiting behind a door they have not opened. Telling them "your
      first one appears here once it does" in the second case would be false, and
      would read as the feature being broken.
    */
    const waiting = unwatchedMatchweek !== null;
    return (
      <View style={{ padding: theme.spacing.xxxl, alignItems: 'center', gap: theme.spacing.sm }}>
        <Icon name={waiting ? 'lock.fill' : 'person.2.fill'} color="slate" size={34} />
        <Text variant="cardTitle">{waiting ? 'Your duel is waiting' : 'Nothing to show yet'}</Text>
        <Text variant="body" color="slate" style={{ textAlign: 'center' }}>
          {waiting
            ? `Matchweek ${unwatchedMatchweek} opens here once you have met your opponent on the Duel tab.`
            : 'The room fills up as duels open. Your first one appears here once it does.'}
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
      <View style={{ gap: theme.spacing.xs }}>
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
        {/* ⚠ THE CARDS LOST THEIR CHEVRON — Ryan, 2026-10-09 — so this line is
            now the only thing that says a card opens. */}
        <Text variant="body" color="slate" align="center">
          Tap on a matchup to see their predictions.
        </Text>
      </View>

      {weekDuels.map((d) => {
        const aIsYou = ownEntryIds.has(d.entry_a);
        const bIsYou = d.entry_b !== null && ownEntryIds.has(d.entry_b);
        return (
          <DuelRow
            key={d.duel_id}
            duel={d}
            names={names}
            standings={standings}
            ownEntryIds={ownEntryIds}
            picksRevealed={picksRevealed}
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

/**
 * The face on a matchup card. Smaller than the band's 84, big enough to be a
 * person rather than a dot.
 */
const AVATAR = 44;

// -------------------------------------------------------------- one duel

function DuelRow({
  duel,
  names,
  standings,
  ownEntryIds,
  picksRevealed,
  isYours,
  open,
  onToggle,
  fixtures,
  pickLabels,
  live,
}: {
  duel: ReturnType<typeof useDuel>['duels'][number];
  names: Record<string, string>;
  standings: Map<string, Standing>;
  ownEntryIds: Set<string>;
  picksRevealed: boolean;
  isYours: boolean;
  open: boolean;
  onToggle: () => void;
  fixtures: SheetFixture[];
  pickLabels: Map<string, Map<string, string>>;
  live: DuelLive;
}) {
  const theme = useTheme();
  const name = (id: string | null) => (id ? names[id] ?? 'Unknown' : 'Nobody');
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

  const standingA = standings.get(duel.entry_a) ?? null;
  const standingB = duel.entry_b ? standings.get(duel.entry_b) ?? null : null;

  /**
   * Both grounds, resolved AGAINST EACH OTHER — the band's rule, card-sized.
   *
   * ⚠ `duelColourIndices`, not each member's own colour. Two teal members would
   * otherwise meet as one colour facing itself, and on your own duel the card
   * would disagree with the band pinned above it, which already shifts one side.
   * Null when either side has no person to resolve (a bye, or an entry the
   * leaderboard does not list) — then each corner falls back to its own.
   */
  const colours =
    standingA?.userId && standingB?.userId && duel.entry_b
      ? duelColourIndices(
          { entryId: duel.entry_a, userId: standingA.userId, chosen: standingA.avatarColour },
          { entryId: duel.entry_b, userId: standingB.userId, chosen: standingB.avatarColour },
        )
      : null;

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
    <Card
      bordered
      padding="lg"
      style={isYours ? { borderColor: withOpacity(theme.colors.primary, 0.5) } : null}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${name(duel.entry_a)} against ${name(duel.entry_b)}`}
        accessibilityHint="Shows their predictions"
        accessibilityState={{ expanded: open }}
      >
        {/*
          ⚠ AVATAR OVER NAME, THE BAND'S SHAPE — Ryan, 2026-10-09. A name beside
          its face would split each half with a 44pt circle, and the names were
          already truncating ("Quantum Quark") with the whole half to themselves.
          Stacked, each name gets its half and two lines.

          ⚠ NO CHEVRON, AND SO NO SPACER. The 12pt spacer on the left existed
          only to answer the chevron on the right (2026-09-05, "centre the dash
          on the page"). With both gone the two corners are equal `flex: 1`
          columns and the score sits on the card's centre by construction. The
          line under the matchweek title says the card opens.
        */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
          <Corner
            name={name(duel.entry_a)}
            standing={standingA}
            colourIndex={colours?.a ?? null}
            emphasis={aResult === 'won'}
          />

          {/* Centred on the FACES, not on the column — the band sets its clock
              the same way, level with the avatars rather than the names. */}
          <View style={{ height: AVATAR, justifyContent: 'center' }}>
            {duel.entry_b === null ? (
              // ⚠ THE SCORELINE'S OWN WIDTH, so a bye sits on the same axis every
              // other row's dash does.
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
                ⚠ THE SCORE THE MOMENT THERE IS ONE — Ryan, 2026-09-05. It used
                to wait for `settled_at`, so a matchweek being played, and a
                played one not yet settled, both showed "v" while the Duel tab
                three taps away had the running scoreline on the header.

                ⚠ A SETTLED DUEL STILL READS ITS STORED ACCURACIES, not the live
                map. That is the engine's own record of the week and it is what
                `duelResult` was computed from; preferring a recomputed number
                would let the card and the result disagree after a rescore.

                ⚠ AND "NO ROWS YET" IS NOT "NIL". `readMatchweekPoints` omits an
                entry with no score rows, so `undefined` means the fixtures have
                not been scored — which is a `v`, not a 0-0 claiming a week
                nobody has played.
              */
              <Scoreline
                kind="duel"
                home={settled ? duel.accuracy_a ?? 0 : running.a}
                away={settled ? duel.accuracy_b ?? 0 : running.b}
                tone={settled ? tint : undefined}
              />
            )}
          </View>

          {duel.entry_b === null ? (
            // A bye names itself, as the band's does: "Nobody", on an empty
            // ground. Not a lock — nothing is being withheld.
            <Corner name="Nobody" standing={null} colourIndex={null} emphasis={false} empty />
          ) : (
            <Corner
              name={name(duel.entry_b)}
              standing={standingB}
              colourIndex={colours?.b ?? null}
              emphasis={aResult === 'lost'}
            />
          )}
        </View>
      </Pressable>

      {open ? (
        <Sheets
          duel={duel}
          fixtures={fixtures}
          pickLabels={pickLabels}
          live={live}
          names={names}
          ownEntryIds={ownEntryIds}
          picksRevealed={picksRevealed}
          isYours={isYours}
        />
      ) : null}
    </Card>
  );
}

/**
 * One side of a matchup: the face, then the name under it.
 *
 * ⚠ The gradient behind the face is drawn even when a face exists, the same as
 * the Leaderboard's: a member with no build shows white initials on it, and one
 * mid-load shows the ground rather than a hole.
 */
function Corner({
  name,
  standing,
  colourIndex,
  emphasis,
  empty = false,
}: {
  name: string;
  standing: Standing | null;
  /** This side's colour after `duelColourIndices`, or null to use the member's own. */
  colourIndex: number | null;
  /** The winner of a settled duel, set in black weight as before. */
  emphasis: boolean;
  /** A bye's missing opponent — no person, no colour. */
  empty?: boolean;
}) {
  const theme = useTheme();
  const userId = standing?.userId ?? null;
  const initials = (
    <Text
      style={{
        fontFamily: fontFamilies.black,
        fontSize: 15,
        lineHeight: 20,
        color: userId ? '#FFFFFF' : theme.colors.slate,
      }}
    >
      {empty ? '' : getInitials(name)}
    </Text>
  );

  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: theme.spacing.sm }}>
      <View
        style={{
          width: AVATAR,
          height: AVATAR,
          borderRadius: theme.radii.pill,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: userId ? 'transparent' : theme.colors.mist,
        }}
      >
        {userId ? (
          <LinearGradient
            colors={[
              ...(colourIndex !== null
                ? AVATAR_GRADIENTS[colourIndex]
                : gradientForUser(userId, standing?.avatarColour)),
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              // Rounds itself — a parent's `overflow` does not reliably clip an
              // absolutely-positioned child to a border radius.
              borderRadius: theme.radii.pill,
            }}
          />
        ) : null}
        {userId ? (
          <MemberAvatar
            userId={userId}
            avatarBuild={standing?.avatarBuild ?? null}
            avatarColour={standing?.avatarColour ?? null}
            size={AVATAR}
            // ⚠ THE RESOLVED INDEX when there is one — see `colours` in DuelRow.
            ground={colourIndex !== null ? avatarBackgroundFor(colourIndex) : undefined}
            fallback={initials}
          />
        ) : (
          initials
        )}
      </View>

      {/* Two lines, not one: "Quantum Quark" wraps rather than losing its tail. */}
      <Text
        variant="cardTitle"
        numberOfLines={2}
        align="center"
        color={empty ? 'slate' : undefined}
        style={{ fontFamily: emphasis ? fontFamilies.black : undefined }}
      >
        {name}
      </Text>
    </View>
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
  ownEntryIds,
  picksRevealed,
  isYours,
}: {
  duel: ReturnType<typeof useDuel>['duels'][number];
  fixtures: SheetFixture[];
  pickLabels: Map<string, Map<string, string>>;
  live: DuelLive;
  names: Record<string, string>;
  ownEntryIds: Set<string>;
  picksRevealed: boolean;
  isYours: boolean;
}) {
  const theme = useTheme();

  /**
   * One pick, or null for a dash.
   *
   * ⚠⚠ A RIVAL'S PICK IS NULL UNTIL THE WEEK LOCKS, whatever the payload holds —
   * Ryan, 2026-10-09: "no user should be able to see the predictions for that
   * matchup" before the matchweek starts. The server is the real wall (`/bulk`
   * through `bypassesRevealGate`); this is the second one, so a payload that
   * somehow carries an open week still draws a dash.
   *
   * ⚠ YOUR OWN STAY. They are yours, and the Duel tab shows them already.
   */
  const label = useCallback(
    (entryId: string, fixtureId: string) =>
      !picksRevealed && !ownEntryIds.has(entryId)
        ? null
        : pickLabels.get(entryId)?.get(fixtureId) ?? null,
    [picksRevealed, ownEntryIds, pickLabels],
  );

  const rows = useMemo(
    () =>
      buildSheet({
        fixtures,
        live: new Map(live.fixtures.map((f) => [f.number, f])),
        mine: live.perFixture.get(duel.entry_a) ?? new Map(),
        theirs: duel.entry_b ? live.perFixture.get(duel.entry_b) ?? new Map() : new Map(),
        label,
        youEntry: duel.entry_a,
        themEntry: duel.entry_b,
      }),
    [fixtures, live, label, duel.entry_a, duel.entry_b],
  );

  /**
   * ⚠ ONLY ONCE THE WEEK HAS LOCKED. Against a column of dashes `sheetSummary`
   * counts every row as agreement — it only calls a row different when BOTH
   * picks are there — and would announce "Identical sheets" over a sheet nobody
   * can see yet.
   */
  const summary = picksRevealed ? sheetSummary(rows) : null;

  if (duel.entry_b === null) {
    return (
      <Text variant="body" color="slate" style={{ marginTop: theme.spacing.md }}>
        {names[duel.entry_a] ?? 'They'} sat this one out — nobody was drawn against them.
      </Text>
    );
  }

  return (
    <View style={{ marginTop: theme.spacing.lg }}>
      {/*
        ⚠ THE SAME SHEET THE DUEL TAB SHOWS — Ryan, 2026-09-05 — and
        `buildSheet`, not a second derivation: the outcome rule has three
        shipped bugs behind it and 21 tests holding it.

        ⚠ NO NAMES ROW ANY MORE — Ryan, 2026-10-09. It repeated the two names
        the card already shows, in blue and red; the faces directly above each
        column now say whose it is. `entry_a` is still the left column and
        `entry_b` the right, matching the corners.
      */}
      <TeamSheetRows rows={rows} />

      {!picksRevealed ? (
        // ⚠ SAID, NOT LEFT TO THE DASHES. A dash after lock means "did not
        // pick"; before lock it means "not yet", and only this line tells them
        // apart.
        <Text variant="detail" color="slate" style={{ marginTop: theme.spacing.sm }}>
          {isYours ? "Your opponent's picks show" : 'Picks show'} when the matchweek locks — an
          hour before the first kickoff.
        </Text>
      ) : summary ? (
        /* Agreement is dead weight by definition: a fixture both called the same
           way cannot separate them whatever it finishes. Saying how many is what
           makes the rest mean something. */
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
