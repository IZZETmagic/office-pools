import { router } from 'expo-router';
import { ActivityIndicator, Image, View } from 'react-native';

import { Button, Card, Icon, Text } from '@/components/ui';
import { useDuel, type Opponent, type Season, type Sheet } from '@/lib/useDuel';
import type { LeagueMatch } from '@/lib/useLeaguePool';
import type { Standing } from './ShowdownDuelHeader';
import { useTheme } from '@/theme';

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
};

export function DuelTab({ poolId, standings }: Props) {
  const theme = useTheme();
  const { loading, error, isShowdown, sheet, fixtures, season, opponent, ownEntryId } =
    useDuel(poolId);

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
      {sheet && ownEntryId ? (
        <SheetCard poolId={poolId} entryId={ownEntryId} sheet={sheet} />
      ) : null}
      {opponent ? (
        <OpponentCard opponent={opponent} standing={standings.get(opponent.entryId) ?? null} />
      ) : null}
      {fixtures.length > 0 ? <DecidedOnCard fixtures={fixtures} /> : null}
      {season ? <ScoutingCard season={season} /> : null}
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
      <Row>
        {/* `caption` IS the token for an uppercase label — bold 11 at 1.5
            tracking. The hand-rolled 9pt at 1.3 was a near-miss of it. */}
        <Text variant="caption" color="slate">
          Your sheet
        </Text>
        <Text variant="cardTitle" style={{ fontVariant: ['tabular-nums'] }}>
          {sheet.done}
          <Text variant="cardTitle" color="slate" style={{ fontVariant: ['tabular-nums'] }}>
            {' / '}
            {sheet.total}
          </Text>
        </Text>
      </Row>

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

      <Text variant="body" color="slate" style={{ marginTop: theme.spacing.md }}>
        {finished ? 'Your sheet is in. Nothing left to pick.' : openList(sheet.open)}
      </Text>

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
function DecidedOnCard({ fixtures }: { fixtures: LeagueMatch[] }) {
  const theme = useTheme();

  return (
    <Card bordered>
      <Row>
        <Text variant="cardTitle">What it will be decided on</Text>
        <Text variant="caption" color="slate">
          {fixtures.length} fixture{fixtures.length === 1 ? '' : 's'}
        </Text>
      </Row>

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
}: {
  opponent: Opponent;
  standing: Standing | null;
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
      <Row>
        <Text variant="caption" color="slate">
          Scouting {opponent.name}
        </Text>
        <Text variant="cardTitle" color="slate" style={{ fontVariant: ['tabular-nums'] }}>
          {standing?.rank != null ? ordinal(standing.rank) : '—'}
          {' · '}
          {(standing?.points ?? 0).toLocaleString()} pts
        </Text>
      </Row>

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

      {/* Who they keep backing. */}
      {opponent.topClub ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <Text variant="caption" color="slate">
            Backs most often
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              marginTop: theme.spacing.sm,
            }}
          >
            {opponent.topClub.crest ? (
              <Image
                source={{ uri: opponent.topClub.crest }}
                style={{ width: theme.spacing.xl, height: theme.spacing.xl }}
                resizeMode="contain"
              />
            ) : null}
            <Text variant="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
              {opponent.topClub.name}
            </Text>
            <Text variant="body" color="slate" style={{ fontVariant: ['tabular-nums'] }}>
              {opponent.topClub.times}×
            </Text>
          </View>
        </View>
      ) : null}

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
      <Text variant="caption" color="slate">
        Your season
      </Text>

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

// -------------------------------------------------------------- furniture

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
