import { ActivityIndicator, Pressable, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { duelResult, DUEL_WIN, DUEL_TIE } from '@/lib/duelPoints';
import { formatDhms, useCountdown } from '@/lib/useCountdown';
import { router } from 'expo-router';

import { useDuel, type Bout, type DuelRecord, type Sheet } from '@/lib/useDuel';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// THE DUEL TAB — the fight, on the phone
// =============================================================
// Showdown's whole claim is that a 38-week parallel Pick'em becomes a personal
// league: by November you have a named rival and a record against them. On the
// web that lives on a page which IS the duel (drafts/2026-08-31_showdown_one_page_plan).
// Here it is a tab, because Ryan's call 2026-09-03 was to keep the tab strip on
// the phone and put the matchup in a collapsing header above it.
//
// ## ⚠ IT DERIVES NOTHING — `useDuel` DOES
//
// The matchup header sits directly above this tab and names the same opponent
// at the same moment. When both worked it out for themselves they could drift;
// now they read one hook. If you are about to add a `useMemo` over
// `showdown.duels` in this file, put it in `lib/useDuel.ts` instead.
//
// ## ⚠ A MISSING MATCHWEEK IS SEALED, NOT EMPTY
//
// Migration 116 seals the draw in RLS and the contract reads it with the
// VIEWER's client, so `showdown.duels` holds the weeks this member may see and
// no others. Three states look identical if you only count rows:
//
//   · a BYE      — a row exists, `entry_b === null`. Nobody was drawn.
//   · a SEALED   — NO ROW. `sealed.matchweek` names it and `sealed.opensAt`
//                  is when it opens.
//   · past the end of the season — no row and nothing sealed.
//
// Reading "no row" as "no opponent" would show the bye card to somebody whose
// duel is merely still hidden — telling them they have a free week when they
// are about to be drawn against someone.
//
// ## ⚠ NOTHING HERE COMPUTES A SCORE, OR A REVEAL TIME
//
// Points come from `league_duels`, written by `league_score_duels`. The reveal
// instant comes from `league_duel_reveals_at` through the contract. Migration
// 127 exists precisely because a front end re-derived the second one and got a
// confident, wrong answer for a fortnight — so neither is recomputed here.
// =============================================================

type Props = {
  poolId: string;
};

export function DuelTab({ poolId }: Props) {
  const theme = useTheme();
  const { loading, error, isShowdown, bouts, current, record, sealed, sheet, ownEntryId } =
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

  // Not a Showdown pool at all. The tab should not have been offered, so this is
  // a guard rather than a state anybody is meant to reach.
  if (!isShowdown) {
    return <Empty icon="person.2.fill" title="This pool has no duels" caption="" />;
  }

  // Two members are needed before a schedule exists at all.
  if (bouts.length === 0 && sealed === null) {
    return (
      <Empty
        icon="person.2.fill"
        title="No duels yet"
        caption="The draw is made once there are two members. Invite someone and your season appears."
      />
    );
  }

  return (
    <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
      {current ? <BoutCard bout={current} /> : null}

      {/*
        YOUR SHEET — the one thing a member can DO while the next opponent is
        still sealed. Picks stay open for the whole wait, which is the design
        rather than an accident: a progress bar and the games still missing turn
        dead time into preparation.
      */}
      {sheet && ownEntryId ? (
        <SheetCard poolId={poolId} entryId={ownEntryId} sheet={sheet} />
      ) : null}

      {/*
        The sealed card sits UNDER the current duel, never instead of it. Both
        are true at once for most of a week: this week's opponent is known and
        being played, and the next one is still counting down. Showing only one
        is what made the web card name the wrong matchweek.
      */}
      {sealed !== null ? (
        <SealedCard matchweek={sealed.matchweek} opensAt={sealed.opensAt} />
      ) : null}

      <RecordCard record={record} />

      {bouts.some((b) => b.settled) ? <SeasonList bouts={bouts} /> : null}
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
   * screens cannot drift and a member does not land on a week they cannot
   * change — the same call `LeaguePickemEntriesTab` makes.
   */
  const openPicker = () => router.navigate(`/pool/${poolId}/pickem/${entryId}`);

  return (
    <Card>
      <Row>
        <Label>Your sheet</Label>
        <Text
          style={{
            fontFamily: fontFamilies.black,
            fontSize: 15,
            lineHeight: 20,
            color: theme.colors.ink,
            fontVariant: ['tabular-nums'],
          }}
        >
          {sheet.done}
          <Text
            style={{
              fontFamily: fontFamilies.black,
              fontSize: 15,
              lineHeight: 20,
              color: theme.colors.slate,
              fontVariant: ['tabular-nums'],
            }}
          >
            {' / '}
            {sheet.total}
          </Text>
        </Text>
      </Row>

      {/* The bar. `flex` rather than a percentage width string so it cannot
          disagree with its own track by a rounding error. */}
      <View
        style={{
          height: 8,
          borderRadius: theme.radii.pill,
          backgroundColor: theme.colors.mist,
          overflow: 'hidden',
          marginTop: theme.spacing.sm,
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
      */}
      <Pressable
        onPress={openPicker}
        accessibilityRole="button"
        style={({ pressed }) => ({
          marginTop: theme.spacing.md,
          backgroundColor: theme.colors.primary,
          borderRadius: theme.radii.pill,
          paddingVertical: 13,
          alignItems: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: fontFamilies.black,
            fontSize: 12,
            lineHeight: 16,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: '#FFFFFF',
          }}
        >
          {finished ? 'See your picks' : 'Finish your picks'}
        </Text>
      </Pressable>
    </Card>
  );
}

/** "Arsenal v Forest and Chelsea v Fulham and 3 more still open." */
function openList(open: Sheet['open']): string {
  // ⚠ `country_name` IS THE CLUB'S NAME, and `country_code` its abbreviation —
  // a league fixture travels through types written for national teams, so the
  // field names lie. Name first, to match the web card; the code is the
  // fallback rather than the preference, because "ARS v NFO" is a worse
  // sentence than the one the web already says.
  const name = (m: Sheet['open'][number]) =>
    `${m.home_team?.country_name ?? m.home_team?.country_code ?? 'TBD'} v ${
      m.away_team?.country_name ?? m.away_team?.country_code ?? 'TBD'
    }`;
  const first = open.slice(0, 2).map(name).join(' and ');
  const rest = open.length > 2 ? ` and ${open.length - 2} more` : '';
  return `${first}${rest} still open.`;
}

// ---------------------------------------------------------------- the bout

function BoutCard({ bout }: { bout: Bout }) {
  const theme = useTheme();
  const { you, them, settled, matchweek } = bout;

  // A bye is its own outcome and gets its own card. It is not a duel with a
  // missing half — there was never an opponent, and the copy has to say so
  // plainly or a member reads it as a bug.
  if (!them) {
    return (
      <Card>
        <Label>Matchweek {matchweek}</Label>
        <Text variant="cardTitle" style={{ marginBottom: theme.spacing.xs }}>
          Nobody was drawn against you
        </Text>
        <Text variant="body" color="slate">
          With an odd number of members somebody sits out each week, and it rotates. You take
          the points either way — there was no opponent, so there was no defeat.
        </Text>
        {settled ? (
          <Row style={{ marginTop: theme.spacing.md }}>
            <Text variant="body" color="slate">
              Bye
            </Text>
            <Text variant="cardTitle" style={{ color: theme.colors.green }}>
              +{you.points ?? DUEL_TIE}
            </Text>
          </Row>
        ) : null}
      </Card>
    );
  }

  const result = settled ? duelResult(you.points) : null;
  const tint =
    result === 'won'
      ? theme.colors.green
      : result === 'lost'
        ? theme.colors.red
        : theme.colors.accent;

  return (
    <Card>
      <Label>
        Matchweek {matchweek}
        {settled ? '' : ' · to play'}
      </Label>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Corner name={you.name} label="You" score={you.accuracy} align="left" tone="primary" />
        <View style={{ alignItems: 'center', minWidth: 54 }}>
          {settled ? (
            <Text
              style={{
                fontFamily: fontFamilies.black,
                fontSize: 22,
                color: tint,
                fontVariant: ['tabular-nums'],
              }}
            >
              {you.accuracy ?? 0} – {them.accuracy ?? 0}
            </Text>
          ) : (
            <Text style={{ fontFamily: fontFamilies.black, fontSize: 18, color: theme.colors.slate }}>
              V
            </Text>
          )}
        </View>
        <Corner name={them.name} label="Them" score={them.accuracy} align="right" tone="red" />
      </View>

      {settled ? (
        <View
          style={{
            marginTop: theme.spacing.md,
            paddingTop: theme.spacing.md,
            borderTopWidth: 1,
            borderTopColor: theme.colors.silver,
          }}
        >
          <Row>
            <Text variant="body" style={{ color: tint, fontFamily: fontFamilies.bold }}>
              {result === 'won'
                ? 'You won this duel'
                : result === 'tied'
                  ? 'Level — a point each way'
                  : 'They took this one'}
            </Text>
            <Text variant="cardTitle" style={{ color: tint }}>
              {(you.points ?? 0) > 0 ? `+${you.points}` : '0'}
            </Text>
          </Row>
        </View>
      ) : null}
    </Card>
  );
}

/**
 * A corner of the ring.
 *
 * ⚠ The score is only shown once it exists. Before a duel settles both sides
 * read null, and rendering that as `0` would say the week has been played and
 * nobody scored — which is a different, much worse claim than "not yet".
 */
function Corner({
  name,
  label,
  score,
  align,
  tone,
}: {
  name: string;
  label: string;
  score: number | null;
  align: 'left' | 'right';
  tone: 'primary' | 'red';
}) {
  const theme = useTheme();
  const color = tone === 'primary' ? theme.colors.primary : theme.colors.red;
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
      <Text
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 9,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: theme.colors.slate,
        }}
      >
        {label}
      </Text>
      <Text variant="cardTitle" numberOfLines={1} style={{ color }}>
        {name}
      </Text>
      {score !== null ? (
        <Text variant="body" color="slate" style={{ fontVariant: ['tabular-nums'] }}>
          {score} pts
        </Text>
      ) : null}
    </View>
  );
}

// -------------------------------------------------------------- the seal

/**
 * The next duel this member is not allowed to see yet.
 *
 * ⚠ THE COPY MUST NOT SAY THE PAIRING HAPPENS NOW. The whole season was drawn
 * when the pool was created; only the SHOWING is weekly. "You'll be randomly
 * paired" would be a claim about something we did not do, and it is the one
 * sentence in this mode that fails the disclosure gate — see
 * `lib/leagueModeInfo.ts`, which carries the same rule for the web and is
 * enforced by `leagueModeCopy.guard.test.ts`.
 */
function SealedCard({ matchweek, opensAt }: { matchweek: number; opensAt: string | null }) {
  const theme = useTheme();
  // ⚠ Shared with the duel header's kickoff clock — see `lib/useCountdown`.
  // Day granularity here because a reveal can be a week out; the header counts
  // hours because a kickoff never is.
  const ms = useCountdown(opensAt);
  const remaining = ms === null ? null : formatDhms(ms);

  return (
    <Card accent>
      <Label>Matchweek {matchweek}</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Icon name="lock.fill" size={16} tint={theme.colors.accent} />
        <Text variant="cardTitle">Your opponent is sealed</Text>
      </View>

      {remaining ? (
        <Text
          style={{
            fontFamily: fontFamilies.black,
            fontSize: 30,
            marginTop: theme.spacing.sm,
            color: theme.colors.accent,
            fontVariant: ['tabular-nums'],
          }}
        >
          {remaining}
        </Text>
      ) : null}

      <Text variant="body" color="slate" style={{ marginTop: theme.spacing.sm }}>
        Your fixtures were drawn when the pool was created. We open them one week at a time.
      </Text>
    </Card>
  );
}


// ------------------------------------------------------------- the record

function RecordCard({
  record,
}: {
  record: DuelRecord;
}) {
  const theme = useTheme();
  return (
    <Card>
      <Row>
        <View style={{ flexDirection: 'row', gap: theme.spacing.lg }}>
          <Stat label="Won" value={record.won} />
          <Stat label="Tied" value={record.tied} />
          <Stat label="Lost" value={record.lost} />
          {record.byes > 0 ? <Stat label="Byes" value={record.byes} /> : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text
            style={{
              fontFamily: fontFamilies.black,
              fontSize: 20,
              color: theme.colors.ink,
              fontVariant: ['tabular-nums'],
            }}
          >
            {record.points}
          </Text>
          <Text variant="detail" color="slate">
            duel points
          </Text>
        </View>
      </Row>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  return (
    <View>
      <Text
        style={{
          fontFamily: fontFamilies.black,
          fontSize: 17,
          color: theme.colors.ink,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
      <Text variant="detail" color="slate">
        {label}
      </Text>
    </View>
  );
}

// ------------------------------------------------------------ the season

/**
 * Every duel already decided.
 *
 * ⚠ SETTLED ONLY, and that is the sealed draw showing through rather than an
 * omission. A member can see the weeks they have played and the one week that
 * is open; the rest of the season genuinely is not theirs to read yet. Listing
 * "MW 12 · —" for every hidden week would advertise a schedule we hide.
 */
function SeasonList({ bouts }: { bouts: Bout[] }) {
  const theme = useTheme();
  const settled = bouts.filter((b) => b.settled).reverse();

  return (
    <Card>
      <Label>Your season</Label>
      <View style={{ gap: theme.spacing.sm }}>
        {settled.map((b) => {
          const r = b.them ? duelResult(b.you.points) : null;
          const tint = !b.them
            ? theme.colors.slate
            : r === 'won'
              ? theme.colors.green
              : r === 'lost'
                ? theme.colors.red
                : theme.colors.accent;
          return (
            <Row key={b.duel.duel_id}>
              <Text variant="body" color="slate" style={{ width: 52 }}>
                MW {b.matchweek}
              </Text>
              <Text variant="body" numberOfLines={1} style={{ flex: 1, fontFamily: fontFamilies.semibold }}>
                {b.them ? b.them.name : 'Bye'}
              </Text>
              <Text
                variant="body"
                style={{ color: tint, fontFamily: fontFamilies.bold, fontVariant: ['tabular-nums'] }}
              >
                {b.them ? `${b.you.accuracy ?? 0}–${b.them.accuracy ?? 0}` : '—'}
              </Text>
              <Text
                variant="body"
                style={{
                  color: tint,
                  fontFamily: fontFamilies.bold,
                  width: 44,
                  textAlign: 'right',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {(b.you.points ?? 0) >= DUEL_WIN
                  ? 'W'
                  : !b.them
                    ? 'Bye'
                    : (b.you.points ?? 0) >= DUEL_TIE
                      ? 'T'
                      : 'L'}
              </Text>
            </Row>
          );
        })}
      </View>
    </Card>
  );
}

// -------------------------------------------------------------- furniture

function Card({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: accent ? withOpacity(theme.colors.accent, 0.4) : theme.colors.silver,
        padding: theme.spacing.lg,
        gap: theme.spacing.xs,
      }}
    >
      {children}
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Text
      style={{
        fontFamily: fontFamilies.bold,
        fontSize: 9,
        letterSpacing: 1.3,
        textTransform: 'uppercase',
        color: theme.colors.slate,
        marginBottom: theme.spacing.xs,
      }}
    >
      {children}
    </Text>
  );
}

function Row({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function Empty({ icon, title, caption }: { icon: string; title: string; caption: string }) {
  const theme = useTheme();
  return (
    <View style={{ padding: theme.spacing.xxxl, alignItems: 'center', gap: theme.spacing.sm }}>
      <Icon name={icon} size={34} tint={theme.colors.slate} />
      <Text variant="cardTitle">{title}</Text>
      {caption ? (
        <Text variant="body" color="slate" style={{ textAlign: 'center' }}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
