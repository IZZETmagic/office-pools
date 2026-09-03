import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { duelResult, DUEL_WIN, DUEL_TIE } from '@/lib/duelPoints';
import { useLeaguePool, type DuelRow } from '@/lib/useLeaguePool';
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
// ## ⚠ A MISSING MATCHWEEK IS SEALED, NOT EMPTY
//
// This is the one thing to get right in this file. Migration 116 seals the draw
// in RLS and the contract reads it with the VIEWER's client, so
// `showdown.duels` holds the weeks this member may see and no others. Three
// states look identical if you only count rows:
//
//   · a BYE      — a row exists, `entry_b === null`. Nobody was drawn.
//   · a SEALED   — NO ROW. `season.sealedMatchweekNumber` names it and
//                  `sealedOpensAtLatest` is when it opens.
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

/** One side of a duel, oriented so "you" is always the first. */
type Side = {
  entryId: string;
  name: string;
  /** What their picks scored that week. Null until the duel settles. */
  accuracy: number | null;
  /** The duel's own points — 500/250/0. Null until it settles. */
  points: number | null;
};

type Bout = {
  duel: DuelRow;
  matchweek: number;
  you: Side;
  /** `null` is a BYE — a row that exists with nobody on the other side. */
  them: Side | null;
  settled: boolean;
};

export function DuelTab({ poolId }: Props) {
  const theme = useTheme();
  const league = useLeaguePool(poolId);

  const data = league.data;
  const showdown = data?.showdown ?? null;
  const ownEntryIds = useMemo(
    () => new Set((data?.you.entries ?? []).map((e) => e.entry_id)),
    [data],
  );

  /**
   * Every revealed duel the viewer is in, oriented so they are always side A.
   *
   * ⚠ The orientation is presentational only. `entry_a` / `entry_b` are the
   * schedule's own sides and carry no meaning about who is "home" — flipping
   * them for display is safe, reading anything into them would not be.
   */
  const bouts = useMemo<Bout[]>(() => {
    if (!showdown) return [];
    const name = (id: string) => showdown.names[id] ?? 'Unknown';
    const out: Bout[] = [];

    for (const d of showdown.duels) {
      const iAmA = ownEntryIds.has(d.entry_a);
      const iAmB = d.entry_b !== null && ownEntryIds.has(d.entry_b);
      if (!iAmA && !iAmB) continue;

      const you: Side = iAmA
        ? { entryId: d.entry_a, name: name(d.entry_a), accuracy: d.accuracy_a, points: d.points_a }
        : {
            entryId: d.entry_b as string,
            name: name(d.entry_b as string),
            accuracy: d.accuracy_b,
            points: d.points_b,
          };

      const them: Side | null = iAmA
        ? d.entry_b === null
          ? null
          : { entryId: d.entry_b, name: name(d.entry_b), accuracy: d.accuracy_b, points: d.points_b }
        : { entryId: d.entry_a, name: name(d.entry_a), accuracy: d.accuracy_a, points: d.points_a };

      out.push({ duel: d, matchweek: d.matchweek_number, you, them, settled: !!d.settled_at });
    }
    return out.sort((a, b) => a.matchweek - b.matchweek);
  }, [showdown, ownEntryIds]);

  /**
   * The duel to lead with: the first one not yet settled, else the most recent
   * result.
   *
   * ⚠ NOT `inPlayMatchweekNumber`. A duel can be revealed and waiting several
   * days before its football starts, and during that window there is no
   * in-play week at all — leading on it would leave the tab headless for the
   * most anticipatory part of the cycle, which is the part this mode is for.
   */
  const current = useMemo(
    () => bouts.find((b) => !b.settled) ?? bouts[bouts.length - 1] ?? null,
    [bouts],
  );

  /** Your record across settled duels. A bye is counted separately, never as a tie. */
  const record = useMemo(() => {
    let won = 0;
    let tied = 0;
    let lost = 0;
    let byes = 0;
    let points = 0;
    for (const b of bouts) {
      if (!b.settled) continue;
      points += b.you.points ?? 0;
      if (!b.them) {
        // ⚠ Structural, not by value: DUEL_BYE === DUEL_TIE on purpose, so this
        // is the ONLY way to tell a free week from a drawn one.
        byes += 1;
        continue;
      }
      const r = duelResult(b.you.points);
      if (r === 'won') won += 1;
      else if (r === 'tied') tied += 1;
      else if (r === 'lost') lost += 1;
    }
    return { won, tied, lost, byes, points };
  }, [bouts]);

  if (league.isPending) {
    return (
      <View style={{ paddingVertical: theme.spacing.xxxl, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (league.isError || !data) {
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
  if (!showdown) {
    return <Empty icon="person.2.fill" title="This pool has no duels" caption="" />;
  }

  const sealedNumber = data.season.sealedMatchweekNumber;
  const sealedAt = data.season.sealedOpensAtLatest;

  // Two members are needed before a schedule exists at all.
  if (bouts.length === 0 && sealedNumber === null) {
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
        The sealed card sits UNDER the current duel, never instead of it. Both
        are true at once for most of a week: this week's opponent is known and
        being played, and the next one is still counting down. Showing only one
        is what made the web card name the wrong matchweek.
      */}
      {sealedNumber !== null ? (
        <SealedCard matchweek={sealedNumber} opensAt={sealedAt} />
      ) : null}

      <RecordCard record={record} />

      {bouts.some((b) => b.settled) ? <SeasonList bouts={bouts} /> : null}
    </View>
  );
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
  const remaining = useCountdown(opensAt);

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

/**
 * A ticking `d h m s` until `iso`, or null once it has passed.
 *
 * ⚠ It ticks on a timer but it does not DERIVE the target — the instant comes
 * from `league_duel_reveals_at` over the contract. That distinction is the
 * whole of migration 127: the front end may count down to the answer, it may
 * not work out what the answer is.
 */
function useCountdown(iso: string | null): string | null {
  const target = iso === null ? null : Date.parse(iso);
  const [, tick] = useState(0);

  useEffect(() => {
    if (target === null || Number.isNaN(target)) return;
    // One second, and cleared on unmount. A tab the member has swiped away from
    // must not keep a timer alive behind the pager.
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (target === null || Number.isNaN(target)) return null;
  const ms = target - Date.now();
  if (ms <= 0) return null;

  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

// ------------------------------------------------------------- the record

function RecordCard({
  record,
}: {
  record: { won: number; tied: number; lost: number; byes: number; points: number };
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
