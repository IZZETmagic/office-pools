import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';

import { Button, Card, Icon, Text } from '@/components/ui';
import { getInitials, gradientForUser } from '@/lib/avatarGradient';
import { Scoreline, TeamSheetRows } from './TeamSheet';
import type { SheetRow, Verdict } from '@/lib/duelSheet';
import { useDuel, type DuelState, type Opponent, type Season, type Sheet } from '@/lib/useDuel';
import type { LeagueMatch } from '@/lib/useLeaguePool';
import type { Standing } from './ShowdownDuelHeader';
import { fontFamilies, useTheme } from '@/theme';

// =============================================================
// THE DUEL TAB — being rebuilt, one card at a time
// =============================================================
// Ryan, 2026-09-03: strip it back to the Your Sheet card and add the rest
// deliberately.
//
// ## ⚠ THE BOUT ITSELF IS NOT HERE ANY MORE, AND THAT IS THE POINT
//
// The matchup, the countdown, both corners and the scoreline all live in
// `ShowdownDuelHeader`, which is pinned above this tab and never leaves the
// screen. A `BoutCard` underneath it was the same fight said twice, three
// centimetres apart — and two surfaces naming an opponent are two surfaces that
// can disagree about one.
//
// So this tab is for what the header cannot hold: the things a member DOES, and
// the season behind them. Right now that is one card.
//
// ## ⚠ IT DERIVES NOTHING — `useDuel` DOES
//
// The header reads the same hook. If you are about to add a `useMemo` over
// `showdown.duels` or the season in this file, put it in `lib/useDuel.ts`
// instead. That shared derivation is the only reason the two surfaces cannot
// drift apart about who is playing whom.
//
// ## ⚠ A MISSING MATCHWEEK IS SEALED, NOT EMPTY
//
// Migration 116 seals the draw in RLS and the contract reads it with the
// VIEWER's client, so `showdown.duels` holds the weeks this member may see and
// no others. A week with no row is HIDDEN, not a bye — a bye is a row that
// exists with nobody on the other side. Whatever comes back here next has to
// keep telling those two apart.
// =============================================================

type Props = {
  poolId: string;
  /**
   * entry_id → where they sit. The SAME map the header uses.
   *
   * ⚠ Passed in rather than fetched: the leaderboard is not in the league
   * contract, and a second read would give the header and this tab two sources
   * for one number — which is how a card ends up disagreeing with the row above
   * it about somebody's rank.
   */
  standings: Map<string, Standing>;
  /**
   * May the opponent be named on this tab — `duelPhase(...).opponentVisible`.
   *
   * ⚠⚠ IT CANNOT BE INFERRED FROM `opponent` BEING NON-NULL, WHICH IS THE BUG
   * THIS FIXES. `useDuel.opponent` reads `current?.them`, and `current` is "the
   * first UNSETTLED bout, FALLING BACK TO THE LAST RESULT" — so the moment a
   * matchweek settles, every card on this tab keeps naming the person you have
   * just finished playing. Ryan, 2026-09-06, on a sealed matchweek 4: *"there
   * should be nothing related to any opponent because we have no opponent right
   * now ... that was the last active match week and that's over."*
   *
   * It is the SAME failure the band had an hour earlier, on a second surface —
   * a component deciding the phase for itself instead of reading the one module
   * that owns it. The band was wrong about the week; this was wrong about the
   * person.
   *
   * ⚠ IT ALSO COVERS PHASE 2. `opponentVisible` is false while the walkout is
   * still on offer, so "Scouting Marcus" can no longer sit three cards below a
   * button promising to reveal who Marcus is.
   *
   * ⚠ Defaults to `true` so an un-updated caller degrades to the old behaviour
   * rather than to a tab with its opponent cards silently missing.
   */
  opponentVisible?: boolean;
  /**
   * Open the scout report on somebody.
   *
   * ⚠ THE POOL SCREEN OWNS THE SHEET. A gorhom sheet rendered inside this tab
   * would sit in the pager's ScrollView, where `position: absolute` fills the
   * scroll content rather than the screen.
   */
  onScout: (entryId: string) => void;
};

export function DuelTab({ poolId, standings, opponentVisible = true, onScout }: Props) {
  const theme = useTheme();
  const {
    loading,
    error,
    isShowdown,
    sheet,
    fixtures,
    series,
    season,
    opponent,
    ownEntryId,
    current,
    isInPlay,
    sheetRows,
    remaining,
    summary,
    verdict,
    elsewhere,
    openMatchweek,
  } = useDuel(poolId);

  if (loading) {
    return (
      <View style={{ paddingVertical: theme.spacing.xxxl, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <Empty
        icon="exclamationmark.triangle"
        title="The duel could not be loaded"
        caption="Pull down to try again."
      />
    );
  }

  // Not a Showdown pool at all. The tab is never offered for one, so this is a
  // guard rather than a state anybody is meant to reach.
  if (!isShowdown) {
    return <Empty icon="person.2.fill" title="This pool has no duels" caption="" />;
  }

  // Nothing to pick AND nothing played — a brand new entry in a pool that has
  // not started. Anything else has at least one card to show.
  if (!season && !sheet && !opponent) {
    return (
      <Empty
        icon="pencil.line"
        title="Nothing to pick right now"
        caption="The next matchweek opens on its own the moment this one locks."
      />
    );
  }

  return (
    <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
      {/*
        ⚠ THE TAPE LEADS — Ryan, 2026-09-03. The header names your opponent and
        this is the first thing that says anything ABOUT them, so it belongs
        against the header rather than four cards down. Everything below it is
        preparation; this is the reason to prepare.

        ⚠ AND IT LEADS WITH NOTHING WHEN THERE IS NOBODY. Gated on
        `opponentVisible`, not on `opponent` — see the prop's note. While the
        draw is sealed this card was still comparing the member against last
        week's opponent, under a header already counting down to a new one.
      */}
      {opponentVisible && opponent && season && ownEntryId ? (
        <TapeCard
          opponent={opponent}
          season={season}
          you={standings.get(ownEntryId) ?? null}
          them={standings.get(opponent.entryId) ?? null}
        />
      ) : null}
      {/*
        ⚠ THE TAB HAS TWO STATES AND THE MATCHWEEK LOCK IS THE DOOR BETWEEN
        THEM — Ryan, 2026-09-04, the morning matchweek 3 kicked off.

        BEFORE lock the tab is preparation: your sheet (what is still unpicked),
        the opponent scouted, and the fixtures the duel will be decided on.
        Every one of those cards exists to inform a pick.

        AFTER lock there are no picks left to inform, and all three become
        wallpaper — worse than that, "Your sheet" invites a member to open a
        picker that will refuse them. So they go, and the fixture list is
        replaced by the same ten games with both columns filled in: the team
        sheet, which is the duel itself rather than a preview of it.

        ⚠ LOCK, NOT KICKOFF. Migration 101 closes picks an hour before the first
        game, and the sheets open at the same moment. Waiting for kickoff would
        leave an hour where the picks are settled, both sheets are readable, and
        the tab still shows a "finish your picks" button.

        `isInPlay` is the server's own `inPlayMatchweekId` answer, read off the
        contract — never a `lock_at` comparison made here.
      */}
      {isInPlay ? (
        <>
          {sheetRows.length > 0 && current ? (
            <TeamSheetCard
              rows={sheetRows}
              themName={current.them?.name ?? null}
              remaining={remaining}
              summary={summary}
              verdict={verdict}
            />
          ) : null}
          {elsewhere.length > 0 ? (
            <ElsewhereCard
              duels={elsewhere}
              matchweek={current?.matchweek ?? null}
              standings={standings}
            />
          ) : null}
        </>
      ) : (
        <>
          {sheet && ownEntryId ? (
            <SheetCard poolId={poolId} entryId={ownEntryId} sheet={sheet} />
          ) : null}
          {opponentVisible && opponent ? (
            <OpponentCard
              opponent={opponent}
              standing={standings.get(opponent.entryId) ?? null}
              onScout={onScout}
            />
          ) : null}
          {fixtures.length > 0 ? (
            <DecidedOnCard fixtures={fixtures} hasOpponent={opponentVisible && !!opponent} />
          ) : null}
        </>
      )}
      {series.length > 0 ? <AgainstTheRoomCard series={series} /> : null}
      {/* ⚠ STAYS IN BOTH STATES. "Your season" is a record, not preparation —
          it is the one card that is as true on Saturday afternoon as it was on
          Friday morning. */}
      {season ? <ScoutingCard season={season} /> : null}
      {/*
        ⚠⚠ THE ONLY WAY INTO THE PICKER, AND IT IS WHY THIS ROW EXISTS.

        `predictionSurfaceFor` sends a Showdown pool to `league-read-only`, so
        the Pick'em entries tab is never rendered for one — the button inside
        "Your sheet" is the single route to `/pool/:id/pickem/:entryId` on the
        phone. Hiding that card while a matchweek is in play therefore hid the
        picking as well, and not for a moment: `openMatchweekId` SKIPS a locked
        matchweek, so matchweek 4 is open from the Saturday matchweek 3 locks
        until it finishes on Monday night. That is most of the week, and all of
        the weekend.

        So the card goes and the door does not. It is one line at the bottom
        rather than a card near the top because that is its real priority while
        football is being played — the live duel is the tab, and next week's
        sheet can wait until this one is over.
      */}
      {isInPlay && sheet && ownEntryId && openMatchweek !== null ? (
        <NextWeekRow
          poolId={poolId}
          entryId={ownEntryId}
          matchweek={openMatchweek}
          sheet={sheet}
        />
      ) : null}
    </View>
  );
}

// --------------------------------------------------------------- your sheet

function SheetCard({
  poolId,
  entryId,
  sheet,
}: {
  poolId: string;
  entryId: string;
  sheet: Sheet;
}) {
  const theme = useTheme();
  const finished = sheet.open.length === 0;

  /**
   * ⚠ No `mw` on the route. The picker resolves the week itself, so the two
   * screens cannot drift and a member does not land on a week they can no
   * longer change — the same call `LeaguePickemEntriesTab` makes.
   */
  const openPicker = () => router.navigate(`/pool/${poolId}/pickem/${entryId}`);

  return (
    /*
      ⚠ THE APP'S `Card`, NOT A HAND-ROLLED ONE. This was a local `View` on
      `radii.md` with a hard 1pt border — 18pt corners and no shadow, against the
      24pt and `shadows.card` every other card in the product uses. It read as
      almost-right, which is the worst way to be wrong: nothing looks broken,
      the screen just does not feel like the rest of the app.
    */
    <Card bordered>
      <CardHeader
        title="Your sheet"
        meta={`${sheet.done} / ${sheet.total}`}
        subtitle={finished ? 'Your sheet is in. Nothing left to pick.' : openList(sheet.open)}
      />

      {/* The bar. Two flexed children rather than a percentage width, so the
          fill cannot disagree with its own track by a rounding error. */}
      <View
        style={{
          height: theme.spacing.sm,
          borderRadius: theme.radii.pill,
          backgroundColor: theme.colors.mist,
          overflow: 'hidden',
          marginTop: theme.spacing.md,
          flexDirection: 'row',
        }}
      >
        <View
          style={{
            flex: Math.max(sheet.done, 0),
            backgroundColor: theme.colors.primary,
            borderRadius: theme.radii.pill,
          }}
        />
        <View style={{ flex: Math.max(sheet.total - sheet.done, 0) }} />
      </View>

      {/*
        ⚠ THE SAME BLUE BUTTON IN BOTH STATES. A finished sheet gets a way IN,
        not a task — we do not ask for something already done — but reviewing is
        not asking, and demoting it to an outline just made the card look like it
        had nothing to offer. Ryan's call on the web; kept here so the two agree.

        ⚠ The pill radius is an explicit override of the `Button` primitive,
        which is `radii.md`. It matches the web card this one is a port of, and
        it is still a TOKEN — never a magic number.
      */}
      <Button
        title={finished ? 'See your picks' : 'Finish your picks'}
        onPress={openPicker}
        fullWidth
        style={{ marginTop: theme.spacing.lg, borderRadius: theme.radii.pill }}
      />
    </Card>
  );
}

// ------------------------------------------------------ what it rides on

/**
 * The fixtures this duel will be decided on.
 *
 * ⚠ THE WHOLE WEEK, picked or not — not `sheet.open`. The question this answers
 * is what the duel rides on, which does not change as a member works through
 * their sheet. `Your sheet` above already says what is left to do.
 *
 * ⚠ No extra read: these are the open matchweek's fixtures, which the league
 * contract already carries for the sheet.
 */
function DecidedOnCard({
  fixtures,
  hasOpponent,
}: {
  fixtures: LeagueMatch[];
  /** False while the draw is sealed — there is nobody to agree or differ with. */
  hasOpponent: boolean;
}) {
  const theme = useTheme();

  return (
    <Card bordered>
      <CardHeader
        title="What it will be decided on"
        meta={`${fixtures.length} fixture${fixtures.length === 1 ? '' : 's'}`}
        /*
          ⚠ THE SUBTITLE NAMES A SECOND PERSON, so it cannot be said while the
          draw is sealed. "Where you agree, nothing can separate you" is a
          sentence about somebody, and during the countdown there is no somebody
          — the fixtures are still the right thing to show, the reading of them
          is not.
        */
        subtitle={
          hasOpponent
            ? 'Where you agree, nothing can separate you. Where you differ is the duel.'
            : 'These are the games your duel will ride on, whoever you are drawn against.'
        }
      />

      <View style={{ marginTop: theme.spacing.md }}>
        {fixtures.map((f, i) => (
          <View
            key={f.match_id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              paddingVertical: theme.spacing.sm,
              // A rule between rows, never above the first — a line under the
              // heading would read as a second border on the card.
              borderTopWidth: i === 0 ? 0 : theme.borders.thin,
              borderTopColor: theme.colors.silver,
            }}
          >
            <Side name={f.home_team?.country_name} crest={f.home_team?.flag_url} />
            <Text variant="detail" color="slate">
              v
            </Text>
            <Side name={f.away_team?.country_name} crest={f.away_team?.flag_url} align="right" />
          </View>
        ))}
      </View>
    </Card>
  );
}

/**
 * One club on a fixture row.
 *
 * ⚠ `country_name` and `flag_url` ARE the club's name and crest. A league
 * fixture travels through types written for national teams, so the field names
 * lie — renaming them would not fail, it would silently render "TBD" with no
 * crest, because the adapter picks fields explicitly.
 */
function Side({
  name,
  crest,
  align = 'left',
}: {
  name?: string | null;
  crest?: string | null;
  align?: 'left' | 'right';
}) {
  const theme = useTheme();
  const label = (
    <Text
      variant="body"
      numberOfLines={1}
      style={{ flex: 1, textAlign: align === 'right' ? 'right' : 'left' }}
    >
      {name ?? 'TBD'}
    </Text>
  );
  const badge = crest ? (
    <Image
      // Decorative — the club's name is the label right next to it.
      alt=""
      source={{ uri: crest }}
      style={{ width: theme.spacing.lg, height: theme.spacing.lg }}
      resizeMode="contain"
    />
  ) : null;

  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
      }}
    >
      {align === 'right' ? (
        <>
          {label}
          {badge}
        </>
      ) : (
        <>
          {badge}
          {label}
        </>
      )}
    </View>
  );
}

// ------------------------------------------------------------- the team sheet

/**
 * The card that replaces the fixture list the moment a matchweek locks.
 *
 * Same ten games, both columns filled in. Before lock it says what the duel
 * WILL be decided on; after lock it is the deciding, in progress — which is why
 * it is one card in two states rather than two cards.
 *
 * ⚠ THE OPPONENT'S COLUMN IS REVEAL-GATED AT THE SOURCE. Their picks arrive
 * through the bulk route, which withholds a matchweek still open for picks. If
 * a label is null here it is because nothing was released, and nothing on this
 * card may reconstruct a pick from anywhere else.
 */
function TeamSheetCard({
  rows,
  themName,
  remaining,
  summary,
  verdict,
}: {
  rows: SheetRow[];
  themName: string | null;
  remaining: number;
  summary: string | null;
  verdict: Verdict | null;
}) {
  const theme = useTheme();

  return (
    <Card bordered>
      <CardHeader
        title="The team sheet"
        meta={
          remaining > 0
            ? `${remaining} to play`
            : rows.length > 0
              ? 'All played'
              : undefined
        }
        subtitle="Both sheets are open. Where you agree, nothing can separate you."
      />

      {/* The two column heads carry the same colours as the chips beneath them,
          which is what makes the sheet readable without a key — and they are the
          header's colours, so "you" is the same blue in both places. */}
      {/*
        ⚠ NOT `width: CHIP_W`. The heads were pinned to the chip width beneath
        them, which truncated "Marcus" to "MARC…" for no reason — the row is
        otherwise empty, so the name had the whole card to sit in and was being
        clipped against a column it does not belong to. It is a LABEL for the
        column, not a cell in it: `flex: 1` and right-aligned gives it
        everything spare while keeping it on one line.
      */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: theme.spacing.sm,
          marginTop: theme.spacing.md,
          marginBottom: theme.spacing.sm,
        }}
      >
        <Text variant="caption" style={{ color: theme.colors.primary }}>
          You
        </Text>
        <Text
          variant="caption"
          numberOfLines={1}
          style={{ flex: 1, textAlign: 'right', color: theme.colors.red }}
        >
          {themName ?? '—'}
        </Text>
      </View>
      {/*
        ⚠ THE CLUB NAMES ARE GONE AND THE ROW IS BIGGER FOR IT — Ryan,
        2026-09-04. "Nott'm Forest" and "Bournemouth" were spending the width on
        strings a crest already says, and paying for it with a small crest and a
        code nobody could read at arm's length. The kickoff moved into the
        middle, where the `v` was, so an unplayed row is no longer two rows tall.

        ⚠ SHARED WITH THE ROOM. `TeamSheetRows` is one implementation for both
        tabs — see the note at the top of `TeamSheet.tsx`.
      */}
      <TeamSheetRows rows={rows} />

      {/* What the sheet MEANS. Agreements cannot separate two members by
          definition, so the duel is only ever the divergences. */}
      {summary || verdict ? (
        <View
          style={{
            marginTop: theme.spacing.sm,
            paddingTop: theme.spacing.md,
            borderTopWidth: theme.borders.thin,
            borderTopColor: theme.colors.silver,
            gap: theme.spacing.xs,
          }}
        >
          {summary ? (
            <Text variant="body" color="slate">
              {summary}
            </Text>
          ) : null}
          {verdict ? (
            <Text variant="body" color="slate">
              {verdict.safe
                ? verdict.leader === 'you'
                  ? `Mathematically safe — a ${verdict.lead}-point lead with nothing left that can close it.`
                  : `Out of reach — behind by ${verdict.lead}, with less than that still to play for.`
                : verdict.deciders === 0
                  ? verdict.lead === 0
                    ? 'Level, with everything played.'
                    : `${verdict.lead} points in it, with everything played.`
                  : `${verdict.lead === 0 ? 'Level' : `${verdict.lead} points in it`} — ${
                      verdict.deciders === 1
                        ? 'one game left, and it decides the duel'
                        : `${verdict.deciders} games left, and they decide the duel`
                    }.`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}


// ------------------------------------------------------------ next week's sheet

/**
 * The way into the picker while a matchweek is being played.
 *
 * Deliberately a ROW and not a card: during a live matchweek the tab belongs to
 * the duel in progress, and next week's sheet is the quietest thing on it. It
 * still has to be reachable — see the note at the call site for why nothing
 * else on the phone reaches the picker for a Showdown pool.
 */
function NextWeekRow({
  poolId,
  entryId,
  matchweek,
  sheet,
}: {
  poolId: string;
  entryId: string;
  matchweek: number;
  sheet: Sheet;
}) {
  const theme = useTheme();
  const finished = sheet.open.length === 0;

  return (
    <Pressable
      onPress={() => router.navigate(`/pool/${poolId}/pickem/${entryId}`)}
      accessibilityRole="button"
      accessibilityLabel={
        finished
          ? `See your picks for matchweek ${matchweek}`
          : `Finish your picks for matchweek ${matchweek}`
      }
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radii.lg,
        borderWidth: theme.borders.thin,
        borderColor: theme.colors.silver,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name={finished ? 'checkmark.circle.fill' : 'pencil.line'} color="slate" size={18} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="body" numberOfLines={1} style={{ fontFamily: fontFamilies.bold }}>
          Matchweek {matchweek} is open
        </Text>
        <Text variant="detail" color="slate" numberOfLines={1}>
          {finished
            ? `All ${sheet.total} picked — you can still change them.`
            : `${sheet.done} of ${sheet.total} picked.`}
        </Text>
      </View>
      <Icon name="chevron.right" color="slate" size={14} />
    </Pressable>
  );
}

// -------------------------------------------------------- elsewhere on the card

/**
 * Every other duel in the live matchweek.
 *
 * The mode is personal, but the pool is not: five duels resolve on the same ten
 * fixtures, and knowing two other members are level makes the afternoon bigger
 * than your own game. It is also the only place the rest of the room is visible
 * while a matchweek is being played.
 *
 * ⚠ ONLY THE WEEK BEING PLAYED, and it needs no reveal check to stay that way:
 * a later matchweek's duel rows were withheld by RLS (migration 116), so they
 * are not here to filter out.
 */
function ElsewhereCard({
  duels,
  matchweek,
  standings,
}: {
  duels: DuelState['elsewhere'];
  matchweek: number | null;
  standings: Map<string, Standing>;
}) {
  const theme = useTheme();

  return (
    <Card bordered>
      <CardHeader
        title="Elsewhere on the card"
        meta={matchweek !== null ? `Matchweek ${matchweek}` : undefined}
        subtitle="The rest of the room, on the same ten games."
      />

      <View style={{ marginTop: theme.spacing.md }}>
        {duels.map((d, i) => {
          const lead = d.pa === d.pb ? null : d.pa > d.pb ? 'a' : 'b';
          return (
            <View
              key={d.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: theme.spacing.sm,
                borderTopWidth: i === 0 ? 0 : theme.borders.thin,
                borderTopColor: theme.colors.silver,
              }}
            >
              <Fighter
                name={d.aName}
                userId={standings.get(d.a)?.userId ?? null}
                leading={lead === 'a'}
                dimmed={lead === 'b'}
              />
              <Scoreline home={d.pa} away={d.pb} kind="duel" />
              <Fighter
                name={d.bName}
                userId={standings.get(d.b)?.userId ?? null}
                leading={lead === 'b'}
                dimmed={lead === 'a'}
                align="right"
              />
            </View>
          );
        })}
      </View>
    </Card>
  );
}

/**
 * One member in somebody else's duel.
 *
 * ⚠ DIMMED RATHER THAN RE-COLOURED. Blue and red mean "you" and "your opponent"
 * everywhere else on this tab; painting a third pair of members in them would
 * make the two cards contradict each other. Their own avatar gradient carries
 * who they are, and weight carries who is ahead.
 */
function Fighter({
  name,
  userId,
  leading,
  dimmed,
  align = 'left',
}: {
  name: string;
  userId: string | null;
  leading: boolean;
  dimmed: boolean;
  align?: 'left' | 'right';
}) {
  const theme = useTheme();
  const gradient = userId ? gradientForUser(userId) : null;

  const face = (
    <View style={{ width: 26, height: 26, borderRadius: theme.radii.pill, overflow: 'hidden' }}>
      {gradient ? (
        <LinearGradient
          colors={[gradient[0], gradient[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text variant="detail" style={{ color: '#FFFFFF', fontFamily: fontFamilies.bold }}>
            {getInitials(name)}
          </Text>
        </LinearGradient>
      ) : (
        <View style={{ flex: 1, backgroundColor: theme.colors.mist }} />
      )}
    </View>
  );

  const label = (
    <Text
      variant="detail"
      numberOfLines={1}
      color={leading ? 'ink' : 'slate'}
      style={{
        flexShrink: 1,
        fontFamily: leading ? fontFamilies.bold : undefined,
        textAlign: align === 'right' ? 'right' : 'left',
      }}
    >
      {name}
    </Text>
  );

  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        gap: theme.spacing.sm,
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      {align === 'right' ? (
        <>
          {label}
          {face}
        </>
      ) : (
        <>
          {face}
          {label}
        </>
      )}
    </View>
  );
}

// ------------------------------------------------------- scouting the other

/**
 * What is known about the member you are playing.
 *
 * ⚠ THIS ONLY EXISTS ONCE THE DUEL IS REVEALED, and everything in it comes from
 * matchweeks that have already LOCKED. Migration 116 hides who you play NEXT;
 * it never hid the picks of weeks already played, which are public to the pool.
 * So this is not a hole in the seal — it is the seal working as designed.
 *
 * The web's equivalent card scouts the READER instead, because it renders only
 * during the sealed window when there is no opponent to scout. Here the header
 * has already named them, so the mockup's original version becomes possible.
 */
function OpponentCard({
  opponent,
  standing,
  onScout,
}: {
  opponent: Opponent;
  standing: Standing | null;
  /**
   * ⚠ THE SHEET IS NOT RENDERED HERE, AND CANNOT BE. A gorhom `BottomSheet`
   * lays out where it sits in the tree, and this card is inside the pager's
   * ScrollView — an absolutely positioned sheet there fills the scroll CONTENT
   * and is clipped by the viewport. The pool screen owns it; this asks.
   */
  onScout: (entryId: string) => void;
}) {
  const theme = useTheme();
  const met = opponent.met.won + opponent.met.drawn + opponent.met.lost;
  /**
   * ⚠ Joined HERE, from two sources on purpose: the numerator is the engine's
   * `correct_count` off the leaderboard row, the denominator is how many
   * revealed picks they have made. Neither hook holds both, and fetching the
   * leaderboard twice to keep the pair together is the worse trade.
   */
  const accuracy = opponent.picks
    ? Math.round(((standing?.correct ?? 0) / opponent.picks) * 100)
    : null;

  return (
    <Card bordered>
      <CardHeader
        title={`Scouting ${opponent.name}`}
        // Their SEASON total — both currencies, the way the leaderboard shows it.
        meta={`${standing?.rank != null ? ordinal(standing.rank) : '—'} · ${(
          (standing?.points ?? 0) + opponent.duelPoints
        ).toLocaleString()} pts`}
        subtitle="How they have been playing, from weeks already revealed."
      />

      {/* Their last five duels — against anyone, oldest first. */}
      {opponent.form.length > 0 ? (
        <View style={{ marginTop: theme.spacing.md }}>
          <Text variant="caption" color="slate">
            Last {opponent.form.length} duel{opponent.form.length === 1 ? '' : 's'}
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs, marginTop: theme.spacing.sm }}>
            {opponent.form.map((r, i) => (
              <FormPip key={i} result={r} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing.lg, marginTop: theme.spacing.lg }}>
        <Stat
          label="Accuracy"
          value={accuracy === null ? '—' : `${accuracy}%`}
          sub={`${standing?.correct ?? 0} of ${opponent.picks} picks`}
        />
        {opponent.agreement !== null ? (
          <Stat
            label="You agree"
            value={`${opponent.agreement}%`}
            sub="on fixtures you both picked"
          />
        ) : null}
      </View>

      {/* ⚠ "BACKS MOST OFTEN" MOVED TO THE SCOUT REPORT, Ryan 2026-09-10.
          It lived here and there, computed two different ways: this one counted
          raw backings in the browser off `useLeaguePoolPicks` with a floor of
          three, the report counts them on the server with denominators and a
          floor of two. Two answers to one question, and the card had no room
          for the denominator that makes the answer mean anything — "3×" cannot
          tell three of three from three of eleven.

          The link at the foot of this card is where it went. */}

      {/*
        ⚠ TWO ZEROES UNDER "FIRST MEETING" IS NOISE PRETENDING TO BE DATA. There
        is no record yet, so the card says so rather than showing 0–0–0.
      */}
      <Text variant="body" color="slate" style={{ marginTop: theme.spacing.lg }}>
        {met === 0
          ? 'You have not met yet.'
          : `Met ${met} time${met === 1 ? '' : 's'} — you have ${opponent.met.won} win${
              opponent.met.won === 1 ? '' : 's'
            }, ${opponent.met.drawn} tied and ${opponent.met.lost} lost.`}
      </Text>

      {opponent.home !== null && opponent.draw !== null && opponent.away !== null ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <Text variant="caption" color="slate">
            How they call them
          </Text>
          <TendencyBar home={opponent.home} draw={opponent.draw} away={opponent.away} />
        </View>
      ) : (
        <Text variant="detail" color="slate" style={{ marginTop: theme.spacing.sm }}>
          Not enough played weeks to read their habits yet.
        </Text>
      )}

      {/*
        ⚠⚠ THIS CARD AND THE FULL DOSSIER ARE TWO IMPLEMENTATIONS OF ONE CLAIM,
        AND THAT IS A KNOWN DEBT RATHER THAN A DESIGN.

        The three figures above — accuracy, agreement, and the home/draw/away
        tendency — are derived HERE, in the browser, off `useLeaguePoolPicks`.
        `lib/scouting/opponent.ts` derives the same three on the server, with
        denominators and a different sample floor (10 here, MIN_RATE_SAMPLE=5
        there). They will not always agree, and when they disagree nothing will
        error — the card will simply say 62% and the report 58%, about the same
        person, on two taps.

        That is the duel-scale failure again: one constant, several readers,
        nine settled duels displayed wrong for four days with no exception
        raised. The fix is for this card to READ the dossier rather than
        recompute it, which deletes the client-side derivation entirely. It is
        not done here because this card ships today and the dossier does not.
        Do not add a fourth site in the meantime.
      */}
      <Pressable
        onPress={() => onScout(opponent.entryId)}
        accessibilityRole="button"
        accessibilityLabel={`Full scout report on ${opponent.name}`}
        style={{
          marginTop: theme.spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Text variant="body" style={{ color: theme.colors.primary, fontFamily: fontFamilies.bold }}>
          Full scout report
        </Text>
        <Icon name="chevron.right" size={14} color="primary" />
      </Pressable>

    </Card>
  );
}

// -------------------------------------------------------- against the room

/**
 * Every matchweek as a contest against the room: how far ABOVE or BELOW the
 * pool's median you finished.
 *
 * ⚠ THE MEDIAN IS THE AXIS, NOT A SECOND BAR. Two bars of absolute points ask
 * the reader to do the comparison themselves, and the interesting number was
 * never "400" — it was "100 clear of the room". Ryan made that call on the web
 * on 2026-08-31 and it holds here.
 *
 * ⚠ THE MAGNITUDE IS DELIBERATELY GONE. A 700 in a big week and a 200 in a thin
 * one can both be +100 on the room, and on this chart they look the same —
 * because for a head-to-head pool they ARE the same. The absolute total is the
 * Your Season card; this answers a different question.
 */
function AgainstTheRoomCard({ series }: { series: DuelState['series'] }) {
  const theme = useTheme();
  const rows = series.map((r) => ({ ...r, gap: r.your_points - r.median_points }));
  // ⚠ Symmetric scale. Fitted to whichever side happens to be bigger, one bad
  // week would make every good one look modest.
  const reach = Math.max(...rows.map((r) => Math.abs(r.gap)), 1);
  const beat = rows.filter((r) => r.gap > 0).length;

  return (
    <Card bordered>
      <CardHeader
        title="Against the room"
        meta={`${beat} of ${rows.length} ${rows.length === 1 ? 'week' : 'weeks'}`}
        subtitle="How far above or below the pool’s median you finished each matchweek."
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'stretch',
          // ⚠ `flex-start`, so capped columns sit together at the left rather
          // than spreading across the card with gaps between them.
          justifyContent: 'flex-start',
          gap: theme.spacing.xs,
          height: theme.spacing.heroLg,
          marginTop: theme.spacing.lg,
        }}
      >
        {rows.map((r) => (
          <View
            key={r.matchweek_number}
            style={{
              flex: 1,
              // ⚠ CAPPED, AND THAT IS THE WHOLE FIX. `flex: 1` alone divides the
              // width between however many weeks exist, so ONE week became a
              // 300pt slab — a bar has to stay a bar whether the season is one
              // week old or thirty-eight. The floor stops a full season from
              // thinning to invisible threads.
              maxWidth: theme.spacing.xxl,
              minWidth: theme.spacing.md,
            }}
          >
            {/* Two equal halves with the rule between them: the room's line is
                the middle of the column, so a bar grows from it either way. */}
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              {r.gap > 0 ? (
                <View
                  style={{
                    height: `${(r.gap / reach) * 100}%`,
                    backgroundColor: theme.colors.green,
                    borderTopLeftRadius: theme.radii.xs,
                    borderTopRightRadius: theme.radii.xs,
                  }}
                />
              ) : null}
            </View>
            <View style={{ height: theme.borders.thin, backgroundColor: theme.colors.silver }} />
            <View style={{ flex: 1 }}>
              {r.gap < 0 ? (
                <View
                  style={{
                    height: `${(Math.abs(r.gap) / reach) * 100}%`,
                    backgroundColor: theme.colors.red,
                    borderBottomLeftRadius: theme.radii.xs,
                    borderBottomRightRadius: theme.radii.xs,
                  }}
                />
              ) : null}
            </View>
          </View>
        ))}
      </View>

      {/* ⚠ Only the ENDS are labelled. Thirty-eight numbers under a chart this
          tall is a ruler, and one week labelled at both ends reads as a pairing
          it is not. */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: theme.spacing.sm }}>
        {rows.length > 1 ? (
          <>
            <Text variant="detail" color="slate">
              MW {rows[0].matchweek_number}
            </Text>
            <Text variant="detail" color="slate">
              MW {rows[rows.length - 1].matchweek_number}
            </Text>
          </>
        ) : (
          <Text variant="detail" color="slate">
            Matchweek {rows[0].matchweek_number}
          </Text>
        )}
      </View>
    </Card>
  );
}

// ----------------------------------------------------------- your scouting

/**
 * How the reader has been playing.
 *
 * ⚠ IT SCOUTS THE READER, NOT THE OPPONENT, and that is forced rather than
 * chosen. The mockup's version reads "Priya backs the home side 68% of the
 * time" — which cannot exist while the draw is sealed, because the whole point
 * of the window is that nobody knows who Priya is yet. Pointing the same stats
 * at the member keeps the card and loses nothing: they are the one who can act
 * on their own tendencies.
 *
 * ⚠ If this ever DOES scout the opponent once a duel is revealed, it needs
 * their picks — which the reveal gate withholds until the matchweek locks. That
 * is a contract change, not a component one.
 */
function ScoutingCard({ season }: { season: Season }) {
  const theme = useTheme();

  return (
    <Card bordered>
      <CardHeader
        title="Your season"
        meta={season.rank != null ? ordinal(season.rank) : undefined}
        subtitle="How you have been playing, across every week you picked in."
      />

      <View style={{ flexDirection: 'row', gap: theme.spacing.lg, marginTop: theme.spacing.md }}>
        <Stat label="Points" value={season.points.toLocaleString()} />
        <Stat
          label="Accuracy"
          value={season.accuracy === null ? '—' : `${season.accuracy}%`}
          sub={`${season.correct} of ${season.picks} picks`}
        />
      </View>

      {/*
        ⚠ THE TENDENCY IS SUPPRESSED UNDER TEN PICKS, in `useDuel`. "100% home"
        off two picks is noise wearing a percentage, and a tendency needs a
        season to be one. Null here means not enough to say, never zero.
      */}
      {season.home !== null && season.draw !== null && season.away !== null ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <Text variant="caption" color="slate">
            How you call them
          </Text>
          <TendencyBar home={season.home} draw={season.draw} away={season.away} />
        </View>
      ) : null}
    </Card>
  );
}

/**
 * Home / draw / away as one track.
 *
 * ⚠ Flexed by the percentages themselves, not by width strings — and the three
 * are derived to total 100 (`away = 100 - home - draw`) so the track is always
 * exactly filled. Rounding each independently lets them come to 99 and leaves a
 * gap at the end of the bar.
 */
function TendencyBar({ home, draw, away }: { home: number; draw: number; away: number }) {
  const theme = useTheme();
  return (
    <>
      <View
        style={{
          flexDirection: 'row',
          height: theme.spacing.sm,
          borderRadius: theme.radii.pill,
          overflow: 'hidden',
          marginTop: theme.spacing.sm,
          backgroundColor: theme.colors.mist,
        }}
      >
        <View style={{ flex: home, backgroundColor: theme.colors.primary }} />
        <View style={{ flex: draw, backgroundColor: theme.colors.slate }} />
        <View style={{ flex: away, backgroundColor: theme.colors.accent }} />
      </View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.lg, marginTop: theme.spacing.sm }}>
        <Key color={theme.colors.primary} label="Home" value={home} />
        <Key color={theme.colors.slate} label="Draw" value={draw} />
        <Key color={theme.colors.accent} label="Away" value={away} />
      </View>
    </>
  );
}

/**
 * One duel result as a dot.
 *
 * ⚠ A BYE IS ITS OWN THING, not a draw. It scores the same 250, which is
 * exactly why it cannot be told from a tie by value — so it is told apart
 * structurally and shown as neither.
 */
function FormPip({ result }: { result: 'won' | 'tied' | 'lost' | 'bye' }) {
  const theme = useTheme();
  const color =
    result === 'won'
      ? theme.colors.green
      : result === 'lost'
        ? theme.colors.red
        : result === 'tied'
          ? theme.colors.accent
          : theme.colors.silver;
  return (
    <View
      style={{
        width: theme.spacing.lg,
        height: theme.spacing.lg,
        borderRadius: theme.radii.pill,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="detail" style={{ color: theme.colors.midnight }}>
        {result === 'won' ? 'W' : result === 'lost' ? 'L' : result === 'tied' ? 'T' : '–'}
      </Text>
    </View>
  );
}

/** 1 → 1st, 2 → 2nd, 11 → 11th. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text variant="caption" color="slate">
        {label}
      </Text>
      <Text
        variant="pageTitle"
        style={{ marginTop: theme.spacing.xs, fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
      {sub ? (
        <Text variant="detail" color="slate" style={{ marginTop: theme.spacing.xxs }}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function Key({ color, label, value }: { color: string; label: string; value: number }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
      <View
        style={{
          width: theme.spacing.sm,
          height: theme.spacing.sm,
          borderRadius: theme.radii.pill,
          backgroundColor: color,
        }}
      />
      <Text variant="detail" color="slate">
        {label} {value}%
      </Text>
    </View>
  );
}

/** "Arsenal v Forest and Chelsea v Fulham and 3 more still open." */
function openList(open: Sheet['open']): string {
  // ⚠ `country_name` IS THE CLUB'S NAME, and `country_code` its abbreviation —
  // a league fixture travels through types written for national teams, so the
  // field names lie. Name first, to match the web card; the code is a fallback
  // rather than the preference, because "ARS v NFO" is a worse sentence than
  // the one the web already says.
  const name = (m: Sheet['open'][number]) =>
    `${m.home_team?.country_name ?? m.home_team?.country_code ?? 'TBD'} v ${
      m.away_team?.country_name ?? m.away_team?.country_code ?? 'TBD'
    }`;
  const first = open.slice(0, 2).map(name).join(' and ');
  const rest = open.length > 2 ? ` and ${open.length - 2} more` : '';
  return `${first}${rest} still open.`;
}

// ---------------------------------------------------------- tale of the tape

/**
 * The two of you, measured against each other.
 *
 * ⚠ EVERY ROW IS A COMPARISON, so the winning side is BOLDED rather than
 * labelled — the shape of the card is the comparison. Adding a "leader" chip to
 * each row would say the same thing twice and take the width to say it.
 */
function TapeCard({
  opponent,
  season,
  you,
  them,
}: {
  opponent: Opponent;
  season: Season;
  you: Standing | null;
  them: Standing | null;
}) {
  const met = opponent.met.won + opponent.met.drawn + opponent.met.lost;

  return (
    <Card bordered>
      <CardHeader
        title="Tale of the tape"
        meta={met === 0 ? 'First meeting' : `Met ${met}×`}
        subtitle={`How you and ${opponent.name} compare this season.`}
      />

      {/*
        ⚠ LIKE FOR LIKE. `season.points` is the SUM of both currencies, while a
        `Standing`'s `points` is `total_points` — the picking half alone. Putting
        one against the other compares a member's whole season with their
        opponent's picking, and hands the row to whoever is on the left.
      */}
      <TapeRow
        label="Season points"
        you={season.points}
        them={(them?.points ?? 0) + opponent.duelPoints}
        first
      />
      <TapeRow label="Correct picks" you={season.correct} them={them?.correct ?? 0} />
      {/* ⚠ Lower is better here, and only here — 2nd beats 5th. */}
      <TapeRow label="Table" you={season.rank} them={them?.rank ?? null} lowerIsBetter />
      <TapeRow label="Duel points" you={season.duelPoints} them={opponent.duelPoints} />

      {/* Form, in the leaderboard's own vocabulary so a week does not have two
          different truths across two screens. */}
      <TapeLine>
        <FormDots types={you?.lastFive ?? []} />
        <TapeLabel>Form</TapeLabel>
        <FormDots types={them?.lastFive ?? []} align="right" />
      </TapeLine>

      {/*
        ⚠ TWO ZEROES UNDER "FIRST MEETING" IS NOISE PRETENDING TO BE DATA. There
        is no record yet, so the row says so and shows nothing on either side.
      */}
      <TapeLine>
        <TapeNumber value={met === 0 ? null : opponent.met.won} strong={met > 0} />
        <TapeLabel>{met === 0 ? 'First meeting' : `Met ${met}× · W–D–L`}</TapeLabel>
        <TapeNumber value={met === 0 ? null : opponent.met.lost} strong={met > 0} align="right" />
      </TapeLine>
    </Card>
  );
}

function TapeRow({
  label,
  you,
  them,
  lowerIsBetter = false,
  first = false,
}: {
  label: string;
  you: number | null;
  them: number | null;
  lowerIsBetter?: boolean;
  first?: boolean;
}) {
  // ⚠ Level is NOT a win for either side. A tie bolds neither, which is the
  // honest rendering of a comparison with no answer.
  const better =
    you === null || them === null || you === them
      ? null
      : lowerIsBetter
        ? you < them
          ? 'you'
          : 'them'
        : you > them
          ? 'you'
          : 'them';

  return (
    <TapeLine first={first}>
      <TapeNumber value={you} strong={better === 'you'} />
      <TapeLabel>{label}</TapeLabel>
      <TapeNumber value={them} strong={better === 'them'} align="right" />
    </TapeLine>
  );
}

function TapeLine({ children, first = false }: { children: React.ReactNode; first?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderTopWidth: first ? 0 : theme.borders.thin,
        borderTopColor: theme.colors.silver,
        marginTop: first ? theme.spacing.sm : 0,
      }}
    >
      {children}
    </View>
  );
}

function TapeLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="detail" color="slate" style={{ letterSpacing: 1 }}>
      {children}
    </Text>
  );
}

function TapeNumber({
  value,
  strong,
  align = 'left',
}: {
  value: number | null;
  strong: boolean;
  align?: 'left' | 'right';
}) {
  const theme = useTheme();
  return (
    <Text
      variant="cardTitle"
      style={{
        flex: 1,
        textAlign: align,
        color: strong ? theme.colors.ink : theme.colors.slate,
        fontFamily: strong ? fontFamilies.black : fontFamilies.medium,
        fontVariant: ['tabular-nums'],
      }}
    >
      {value === null ? '—' : value.toLocaleString()}
    </Text>
  );
}

/**
 * The leaderboard's form dots, at duel scale.
 *
 * ⚠ THE SAME `score_type` VOCABULARY the leaderboard reads, so a member sees the
 * same five results in both places. ⚠ At Results depth the engine only ever
 * writes `winner` or `miss` (066), so `exact` and `winner_gd` simply never
 * occur there — the palette covers them rather than the screen promising them.
 */
function FormDots({ types, align = 'left' }: { types: string[]; align?: 'left' | 'right' }) {
  const theme = useTheme();
  if (types.length === 0) {
    return (
      <Text variant="detail" color="slate" style={{ flex: 1, textAlign: align }}>
        —
      </Text>
    );
  }
  const tint = (t: string) =>
    t === 'exact'
      ? theme.colors.tierExact
      : t === 'winner_gd'
        ? theme.colors.tierWinnerGd
        : t === 'winner'
          ? theme.colors.tierWinner
          : theme.colors.tierMiss;
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        gap: theme.spacing.xxs,
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      }}
    >
      {types.map((t, i) => (
        <View
          key={i}
          style={{
            width: theme.spacing.sm,
            height: theme.spacing.sm,
            borderRadius: theme.radii.pill,
            backgroundColor: tint(t),
          }}
        />
      ))}
    </View>
  );
}

// -------------------------------------------------------------- furniture

/**
 * Every card on this tab opens the same way.
 *
 * Ryan, 2026-09-04, on "Against the room": that header shape — a title, a
 * figure hard right, and one line saying what the card is for — is the one the
 * others should wear. Six cards each inventing their own heading is how a tab
 * reads as six screens that happen to be stacked.
 *
 * ⚠ `meta` and `subtitle` are BOTH optional and both earn their place when
 * present. A card with no natural figure gets no chip rather than a padded one,
 * and a title that already says everything gets no second sentence. Uniform
 * does not mean identical.
 */
function CardHeader({
  title,
  meta,
  subtitle,
}: {
  title: string;
  meta?: string;
  subtitle?: string;
}) {
  const theme = useTheme();
  return (
    <>
      <Row>
        <Text variant="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </Text>
        {meta ? (
          <Text variant="caption" color="slate">
            {meta}
          </Text>
        ) : null}
      </Row>
      {subtitle ? (
        <Text variant="body" color="slate" style={{ marginTop: theme.spacing.xs }}>
          {subtitle}
        </Text>
      ) : null}
    </>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
      }}
    >
      {children}
    </View>
  );
}

function Empty({ icon, title, caption }: { icon: string; title: string; caption: string }) {
  const theme = useTheme();
  return (
    <View style={{ padding: theme.spacing.xxxl, alignItems: 'center', gap: theme.spacing.sm }}>
      <Icon name={icon} color="slate" size={34} />
      <Text variant="cardTitle">{title}</Text>
      {caption ? (
        <Text variant="body" color="slate" style={{ textAlign: 'center' }}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
