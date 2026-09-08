import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import type { LeagueLeaderboardEntry } from '@/lib/api';
import { getInitials, gradientForUser } from '@/lib/avatarGradient';
import { ladderGap, ladderGapLabel, type LadderGap } from '@/lib/ladderGap';
import { useDuel, type DuelRecordRow } from '@/lib/useDuel';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// THE SHOWDOWN LEADERBOARD — a ladder, not a table
// =============================================================
// Ryan, 2026-09-04: it should not look like the other leaderboards. "Like you're
// fighting, like you're trying to climb."
//
// The edge does not come from painting a table darker. It comes from one line:
// how far you are from the member above you. A standings table tells you where
// you sit; a gap tells you what to do about it.
//
// ## ⚠⚠ TWO CURRENCIES, ADDED HERE — `total_points` IS PICKS ONLY
//
// Migration 121's header says it plainly: *"`total_points` is what your picking
// scored; `duel_points` is ... and lives beside it"*. The ranking sums them in
// its ORDER BY — `(t.total_points + t.duel_points) DESC` — and no column
// carries both.
//
// So a row's headline number is `total_points + duelPoints`, and the split is
// those two as they come. This file first shipped with the opposite belief and
// showed `total − duel`, which gave a member who TIED their duel 250 points and
// 0 for picks: the subtraction cancelled a sum that had never happened.
//
// ## ⚠ TWO ORDERS, AND ONLY ONE OF THEM IS OURS
//
// TABLE reads `current_rank` from the engine and never sorts. `league_finalize_ranks`
// resolves ties through a seven-key cascade, and a client sort would disagree
// with the number printed beside it.
//
// DUELS has no stored order — nothing in the database ranks by duel points
// alone — so that one IS a client sort, and its tie-break is a product decision
// rather than an engine fact: duel points → most wins → season total. Wins
// before total because two members level on points are separated by who
// actually won rather than drew.
// =============================================================

type Props = {
  poolId: string;
  entries: LeagueLeaderboardEntry[];
  currentUserId: string | null;
};

type Board = 'table' | 'duels';

export function ShowdownLeaderboard({ poolId, entries, currentUserId }: Props) {
  const theme = useTheme();
  const [board, setBoard] = useState<Board>('table');
  const { duelTable } = useDuel(poolId);

  const rows = useMemo(() => {
    const shaped = entries.map((e) => {
      const duel = duelTable.get(e.entry_id) ?? EMPTY;
      // ⚠ `total_points` IS THE PICKING HALF. The two are separate columns and
      // the engine sums them only in its ORDER BY, so the headline number has
      // to be summed here too.
      const picksPoints = e.total_points ?? 0;
      return {
        entry: e,
        duel,
        picksPoints,
        combined: picksPoints + duel.duelPoints,
        isYou: e.user_id === currentUserId,
      };
    });

    if (board === 'table') {
      // ⚠ THE ENGINE'S ORDER, and it is only a SORT because the list arrives
      // unordered — the KEY is `current_rank`, never points. An entry with no
      // rank has not been scored and sits last rather than first.
      return [...shaped].sort(
        (a, b) =>
          (a.entry.current_rank ?? Number.MAX_SAFE_INTEGER) -
          (b.entry.current_rank ?? Number.MAX_SAFE_INTEGER),
      );
    }

    // Ours: duel points, then wins, then the season total.
    return [...shaped].sort(
      (a, b) =>
        b.duel.duelPoints - a.duel.duelPoints ||
        b.duel.won - a.duel.won ||
        b.combined - a.combined,
    );
  }, [entries, duelTable, board, currentUserId]);

  /**
   * The number this board is ORDERED BY, row for row.
   *
   * ⚠ THE SAME VALUE THAT IS PRINTED ON THE RIGHT of each row, which is what
   * keeps the gap line arithmetic a member can check. Measuring the Table gap on
   * duel points, or the Duels gap on the season total, would produce a sentence
   * that contradicts the two numbers either side of it.
   */
  const values = useMemo(
    () =>
      rows.map((r) => ({
        name: displayName(r.entry),
        value: board === 'table' ? r.combined : r.duel.duelPoints,
      })),
    [rows, board],
  );

  return (
    <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
      {/*
        ⚠ PILLS, NOT A SEGMENTED CONTROL — Ryan asked for the Matches tab's
        shape rather than something flipping in a corner. Two of them, because
        there are two questions: where you sit, and who is winning fights.
      */}
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <BoardPill label="Table" active={board === 'table'} onPress={() => setBoard('table')} />
        <BoardPill label="Duels" active={board === 'duels'} onPress={() => setBoard('duels')} />
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        {rows.map((r, i) => (
          <Row
            key={r.entry.entry_id}
            position={i + 1}
            row={r}
            board={board}
            /*
              ⚠ COMPUTED OFF THE RENDERED ORDER, and only for the viewer's own
              rows. `ladderGap` compares against the NEIGHBOUR rather than
              re-deriving a position, so it is right on both boards without being
              told which order it is looking at.
            */
            gap={r.isYou ? ladderGap(values, i) : null}
          />
        ))}
      </View>
    </View>
  );
}

const EMPTY: DuelRecordRow = { duelPoints: 0, won: 0, tied: 0, lost: 0, byes: 0, form: [] };

/** The name a member would recognise: their entry name, else their username. */
function displayName(e: LeagueLeaderboardEntry): string {
  return e.entry_name?.trim() ? e.entry_name : e.username || e.full_name;
}

// ------------------------------------------------------------------- a row

function Row({
  position,
  row,
  board,
  gap,
}: {
  position: number;
  row: {
    entry: LeagueLeaderboardEntry;
    duel: DuelRecordRow;
    picksPoints: number;
    combined: number;
    isYou: boolean;
  };
  board: Board;
  /** Non-null on the viewer's own rows only — see `ladderGap`'s header. */
  gap: LadderGap | null;
}) {
  const theme = useTheme();
  const { entry, duel, picksPoints, combined, isYou } = row;
  const name = displayName(entry);
  // ⚠ Gold for first, because `accent` is already the belt colour in the duel
  // band — the same idea should not arrive in a second colour two screens on.
  const leader = position === 1;

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radii.md,
          // Your own row is anchored in the SAME blue as your corner in the
          // band, so you find yourself without reading a single name.
          backgroundColor: isYou
            ? withOpacity(theme.colors.primary, 0.12)
            : theme.colors.surface,
          borderWidth: theme.borders.thin,
          borderColor: isYou ? withOpacity(theme.colors.primary, 0.4) : theme.colors.silver,
        }}
      >
        {/*
          ⚠ POSITION AND MOVEMENT ARE ONE BLOCK, not two children of the row.
          As siblings they each took the row's `gap` on both sides, so the arrow
          arrived with 12pt either side of it and pushed the avatar a long way
          off the number. Grouped, the row's gap applies ONCE — between the
          block and the avatar — and the two numbers sit together where they
          belong.

          ⚠ Both halves stay FIXED WIDTH, which is what keeps the column
          readable down the list: the arrow slot is held open even when a member
          has not moved, or their avatar would sit left of everybody else's.
        */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xxs,
          }}
        >
          {/* `cardTitle` for the SIZE, black for the WEIGHT — the type scale has
              the 16/20 step but not a display face at it. */}
          <Text
            variant="cardTitle"
            style={{
              width: theme.spacing.lg,
              textAlign: 'right',
              fontFamily: fontFamilies.black,
              color: leader ? theme.colors.accent : theme.colors.slate,
              fontVariant: ['tabular-nums'],
            }}
          >
            {position}
          </Text>
          <View style={{ width: theme.spacing.lg, alignItems: 'center' }}>
            <Movement current={entry.current_rank} previous={entry.previous_rank} />
          </View>
        </View>

        <Avatar userId={entry.user_id} name={name} />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="cardTitle" numberOfLines={1}>
            {name}
          </Text>
          {board === 'table' ? (
            /* The two halves as they come — no arithmetic between them. */
            <Text variant="detail" color="slate">
              {picksPoints.toLocaleString()} picks · {duel.duelPoints.toLocaleString()} duels
            </Text>
          ) : (
            <Text variant="detail" color="slate">
              {duel.won}W {duel.tied}T {duel.lost}L
              {duel.byes > 0 ? ` · ${duel.byes} bye${duel.byes === 1 ? '' : 's'}` : ''}
            </Text>
          )}
          {/*
            ⚠ THE GAP LINE — this component's own header has promised it since
            2026-09-04 and nothing rendered it until 2026-09-07: *"a standings
            table tells you where you sit; a gap tells you what to do about it."*

            ⚠ ON YOUR OWN ROW ONLY, and against the member directly above. The
            distance to the leader is a number nobody in eighth can act on, and
            in a pool built on "no bad feelings" it is a line telling half the
            room the season is over in October.

            ⚠ IT INHERITS YOUR ROW'S TINT rather than taking a colour of its
            own. Green for a lead and red for a deficit would make the board's
            only editorial line the loudest thing on it — and this is a
            statement of distance, not a verdict.
          */}
          {gap ? (
            <Text
              variant="detail"
              style={{
                color: theme.colors.primary,
                fontFamily: fontFamilies.bold,
                marginTop: theme.spacing.xxs,
              }}
            >
              {ladderGapLabel(gap, board === 'table' ? 'pts' : 'duel pts')}
            </Text>
          ) : null}
        </View>

        {board === 'duels' ? <Form form={duel.form} /> : null}

        {/*
          ⚠ FIXED WIDTH, AND IT IS WHAT ALIGNS THE FORM STRIP. Nothing after the
          name column had a width of its own, so the row packed to the right and
          every element's x depended on how many digits the TOTAL happened to
          have: a member on 250 pushed their dots ~55pt left of a member on 0.
          The strip was internally aligned the whole time and still could not be
          read down the list.

          `minWidth`, not `width`, so a five-figure season total grows the column
          rather than being clipped — every row grows with it, so the alignment
          holds either way.
        */}
        <Text
          variant="cardTitle"
          style={{
            minWidth: theme.spacing.hero,
            textAlign: 'right',
            fontFamily: fontFamilies.black,
            fontVariant: ['tabular-nums'],
          }}
        >
          {(board === 'table' ? combined : duel.duelPoints).toLocaleString()}
        </Text>
      </View>

    </View>
  );
}

// ------------------------------------------------------------------- parts

/**
 * ⚠ The same gradient the duel band and Banter use, keyed on the PERSON — so a
 * member is one colour everywhere in the product. See `lib/avatarGradient`.
 */
function Avatar({ userId, name }: { userId: string | null; name: string }) {
  const theme = useTheme();
  const size = theme.spacing.xxl;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: theme.radii.pill,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.mist,
      }}
    >
      {userId ? (
        <LinearGradient
          colors={[...gradientForUser(userId)]}
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
      {/* ⚠ The one size here that is NOT a token, deliberately. `caption` is
          the right 11/14 step but carries 1.5 of tracking, which pushes two
          initials apart inside a 32pt circle — the avatars elsewhere in the app
          set this size directly for the same reason. */}
      <Text
        style={{
          fontFamily: fontFamilies.black,
          fontSize: 11,
          lineHeight: 15,
          color: userId ? '#FFFFFF' : theme.colors.slate,
        }}
      >
        {getInitials(name)}
      </Text>
    </View>
  );
}

/**
 * Which way they moved since the last matchweek settled.
 *
 * ⚠ Rank is LOWER-IS-BETTER, so a fall in the number is a CLIMB. Reading it the
 * other way points every arrow at the wrong member.
 */
function Movement({ current, previous }: { current: number | null; previous: number | null }) {
  const theme = useTheme();
  if (current === null || previous === null || current === previous) return null;
  const climbed = current < previous;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Icon
        name={climbed ? 'arrow.up' : 'arrow.down'}
        tint={climbed ? theme.colors.green : theme.colors.red}
        size={10}
        weight="semibold"
      />
      <Text
        variant="detail"
        style={{ color: climbed ? theme.colors.green : theme.colors.red }}
      >
        {Math.abs(previous - current)}
      </Text>
    </View>
  );
}

/** How many duels the strip shows. Fixed, so every row is the same width. */
const FORM_SLOTS = 5;

/**
 * The last five duels, as a COLUMN-ALIGNED strip.
 *
 * ⚠ ALWAYS FIVE SLOTS, PADDED AT THE FRONT. Ryan: "can they all be aligned
 * vertically? Otherwise it's going to be hard to read." Rendering only the
 * results a member has makes each row a different width, so the fourth duel
 * sits at a different x on every line and the strip cannot be read DOWN. With a
 * fixed grid the rightmost column is always the most recent duel and the one
 * beside it always the one before, for everybody.
 *
 * ⚠ Padded at the FRONT, not the back. The strip is anchored on the LATEST
 * duel, so a member with three results has two empty slots on the left rather
 * than trailing gaps that would push their most recent result out of the
 * column everybody else's sits in.
 */
function Form({ form }: { form: DuelRecordRow['form'] }) {
  const theme = useTheme();
  const tint = (r: DuelRecordRow['form'][number]) =>
    r === 'won'
      ? theme.colors.green
      : r === 'lost'
        ? theme.colors.red
        : r === 'tied'
          ? theme.colors.accent
          : theme.colors.silver;

  const slots: (DuelRecordRow['form'][number] | null)[] = [
    ...Array<null>(Math.max(0, FORM_SLOTS - form.length)).fill(null),
    ...form.slice(-FORM_SLOTS),
  ];

  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
      {slots.map((r, i) => (
        <View
          key={i}
          style={{
            width: theme.spacing.sm,
            height: theme.spacing.sm,
            borderRadius: theme.radii.pill,
            // An empty slot is a faint track, not a missing dot — it holds the
            // column open and reads as "no duel here" rather than as a result.
            backgroundColor: r ? tint(r) : withOpacity(theme.colors.slate, 0.18),
          }}
        />
      ))}
    </View>
  );
}

function BoardPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radii.pill,
        backgroundColor: active ? withOpacity(theme.colors.primary, 0.16) : theme.colors.mist,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        variant="caption"
        style={{ color: active ? theme.colors.primary : theme.colors.slate }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
