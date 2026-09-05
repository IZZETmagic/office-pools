import { Image, View, type TextStyle } from 'react-native';

import { Text } from '@/components/ui';
import type { FixtureOutcome, SheetRow } from '@/lib/duelSheet';
import { fontFamilies, useTheme } from '@/theme';

// =============================================================
// THE TEAM SHEET — one row per fixture, both sides' picks
// =============================================================
// Lifted out of `DuelTab` so THE ROOM can render the same thing. Ryan,
// 2026-09-04: expanding a duel in The Room should show the sheet the Duel tab
// shows, not a thinner version of it.
//
// ⚠ ONE IMPLEMENTATION, NOT A PORT. The Room had its own row — a chip, then
// "ARS v CHE" as a single grey string, with no crest, no scoreline and no
// kickoff — and the two drifted the moment the Duel tab's row grew crests and a
// stacked kickoff. Two surfaces showing the same duel must not disagree about
// what it looked like, and a member switching tabs is comparing them directly.
//
// Rows come in as `SheetRow[]` from `lib/duelSheet.ts`, so both callers share
// the DERIVATION as well as the rendering — including the outcome rule, which
// has three shipped bugs behind it.

/** One fixture row per entry, in the order the sheet gives them. */
export function TeamSheetRows({
  rows,
  gap,
}: {
  rows: SheetRow[];
  /** Vertical padding per row. The Room packs more duels onto a screen. */
  gap?: number;
}) {
  const theme = useTheme();
  const pad = gap ?? theme.spacing.sm;

  return (
    <View>
      {rows.map((r, i) => (
        <View
          key={r.number}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingVertical: pad,
            // A rule between rows, never above the first — a line under the
            // heading would read as a second border on the card.
            borderTopWidth: i === 0 ? 0 : theme.borders.thin,
            borderTopColor: theme.colors.silver,
          }}
        >
          <PickChip label={r.myPick} won={r.outcome === 'you'} outcome={r.outcome} tone="primary" />

          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }}>
            <Club
              abbr={r.homeAbbr}
              name={r.homeName}
              crest={r.homeCrest}
              faded={r.result !== null && r.result !== 'home'}
              align="right"
            />
            <Centre row={r} />
            <Club
              abbr={r.awayAbbr}
              name={r.awayName}
              crest={r.awayCrest}
              faded={r.result !== null && r.result !== 'away'}
            />
          </View>

          <PickChip
            label={r.theirPick}
            won={r.outcome === 'them'}
            outcome={r.outcome}
            tone="red"
            align="right"
          />
        </View>
      ))}
    </View>
  );
}

/**
 * Wide enough for "HOME ✓" and a "2-1" scoreline; fixed, so the fixtures never
 * jitter as picks land.
 *
 * ⚠ 46, NOT 52. Every point taken from the two chips is a point the club codes
 * and crests get back, and "DRAW" is only about 25pt of text at this size — the
 * old width was padding, not need. Budgeted against a 360pt phone, the
 * narrowest this product runs on: each club side lands at 53pt, which holds a
 * 26pt crest and a three-letter code with room to spare.
 */
export const CHIP_W = 44;

/**
 * The crest, now that it is the club's main identifier rather than decoration.
 *
 * ⚠ IT IS THE EXPENSIVE ONE. Every point here comes off the club code beside
 * it, and the code is the thing that has to stay legible — three letters that
 * ellipsize to two are worse than a slightly smaller badge. 30 is what a 375pt
 * phone affords next to a 13pt code; below that (a 360pt mini) the code
 * compresses rather than the layout breaking.
 */
const CREST = 30;

/**
 * The middle column: a scoreline, or the day over the kickoff.
 *
 * ⚠ FIXED, AND THAT IS WHAT KEEPS THE COLUMN STRAIGHT. Sized so the widest
 * thing it ever holds — "10:00 AM" at 11pt, about 48pt — clears it. An `auto`
 * width would size per row, and the crests either side would step in and out
 * down the card as kickoff times changed length.
 */
const CENTRE_W = 54;

/**
 * Guaranteed air either side of the middle column — Ryan, 2026-09-04.
 *
 * ⚠ A MARGIN, NOT SPARE FLEX. Letting the club groups pool their leftover space
 * around the centre would have made the gap track the screen: about 4pt on a
 * 375 and nearly 40 on a Pro Max, so the crests would drift away from the
 * kickoff they belong to on exactly the phones with room to look nice. A fixed
 * margin reads the same on every device, and the leftover goes where it is
 * harmless — out by the chips.
 */
const CENTRE_AIR = 8;

/**
 * One member's pick for one fixture.
 *
 * ⚠ `won` IS PASSED IN, NEVER DERIVED BY FLIPPING. The outcome names the
 * fixture's winner absolutely — `you` / `them` / `neither` — and each chip asks
 * whether it is that winner. A chip that inverted its neighbour's value turned
 * "different picks, neither scored" into a tick for the opponent.
 */
function PickChip({
  label,
  won,
  outcome,
  tone,
  align = 'left',
}: {
  label: string | null;
  won: boolean;
  outcome: FixtureOutcome;
  tone: 'primary' | 'red';
  align?: 'left' | 'right';
}) {
  const theme = useTheme();
  const colour = tone === 'primary' ? theme.colors.primary : theme.colors.red;

  if (label === null) {
    return (
      <Text
        variant="detail"
        color="slate"
        style={{ width: CHIP_W, textAlign: align === 'right' ? 'right' : 'left', opacity: 0.5 }}
      >
        —
      </Text>
    );
  }

  const same = outcome === 'same';
  return (
    <View
      style={{
        width: CHIP_W,
        borderRadius: theme.radii.xs,
        paddingVertical: theme.spacing.xs,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        backgroundColor: won ? colour : same ? theme.colors.mist : 'transparent',
        borderWidth: won || same ? 0 : theme.borders.thin,
        borderColor: colour,
      }}
    >
      <Text
        variant="detail"
        style={{
          fontFamily: fontFamilies.bold,
          color: won ? '#FFFFFF' : same ? theme.colors.slate : colour,
        }}
      >
        {label}
      </Text>
      {/* The win marker. Colour alone cannot carry it: an outline means both
          "waiting" and "did not take it", and grey means "you picked the same".
          The tick is the only unambiguous "this one was mine". */}
      {won ? (
        <Text variant="detail" style={{ color: '#FFFFFF', fontFamily: fontFamilies.bold }}>
          ✓
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One club on a team-sheet row: three-letter code and crest, mirrored about the
 * middle column so the two sides carry the same weight.
 *
 * ⚠ CODE ONLY — the full name is gone. On a phone the crest IS the club, and
 * the name was spending the row's width to repeat it; "CRY" beside the Palace
 * badge is unambiguous where a clipped "Crystal Pal…" is just worse. It is also
 * what a broadcast scoreboard does at this size.
 *
 * ⚠ SO THE NAME STILL HAS TO REACH A SCREEN READER. A crest with no accessible
 * name beside a three-letter code is an unlabelled image where the content is —
 * hence `accessibilityLabel` carrying the real name.
 *
 * ⚠ THE WINNER IS LIT AND THE LOSER DIMMED, at full time only — `faded` comes
 * from `result`, which the sheet builder leaves null until the match is
 * completed. Fading a side at 1-0 in the twelfth minute states an outcome the
 * game has not reached.
 */
function Club({
  abbr,
  name,
  crest,
  faded,
  align = 'left',
}: {
  abbr: string | null;
  name: string | null;
  crest: string | null;
  faded: boolean;
  align?: 'left' | 'right';
}) {
  const theme = useTheme();
  // `league_clubs.abbreviation` is NOT NULL, so this should never fire — but
  // rendering "TBD" for a club we can name would be a worse failure than three
  // letters taken off the front of its own name.
  const code = abbr ?? (name ? name.slice(0, 3).toUpperCase() : 'TBD');

  const badge = crest ? (
    <Image
      alt=""
      source={{ uri: crest }}
      // ⚠ NO `flexShrink: 0` HERE, DELIBERATELY — this is the half that gives.
      // On a phone too narrow for both (a 360pt mini), `contain` lets the box
      // narrow and renders the crest smaller inside it, undistorted. A crest
      // one step down is still the club; "AR…" is not.
      style={{ width: CREST, height: CREST }}
      resizeMode="contain"
    />
  ) : null;
  const label = (
    <Text
      numberOfLines={1}
      style={{
        fontFamily: fontFamilies.bold,
        fontSize: 13,
        lineHeight: 18,
        color: theme.colors.ink,
        // ⚠ THE CODE NEVER SHRINKS. It is three letters carrying the whole
        // club now that the name is gone, and flex would happily ellipsize it
        // to two before touching the image beside it.
        flexShrink: 0,
      }}
    >
      {code}
    </Text>
  );

  return (
    <View
      accessible
      accessibilityLabel={name ?? code}
      style={{
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        gap: theme.spacing.xs,
        opacity: faded ? 0.45 : 1,
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

/**
 * The middle column of a fixture row: what there is to say about the match
 * itself, stacked.
 *
 * A played or running game shows its scoreline over its clock; one still to
 * come shows the day over the kickoff. Two lines either way, so the rows keep
 * one rhythm down the card instead of growing a second line only sometimes.
 *
 * ⚠ THE CLOCK HANGS OFF THE MATCH, NOT OFF WHO IS WINNING THE DUEL. The web
 * rendered it on `outcome === 'pending'`, which worked only while "not scored"
 * and "not started" were the same state — and the moment a live fixture stopped
 * being `pending`, the ticking minute vanished from the row that most needs it.
 */
function Centre({ row }: { row: SheetRow }) {
  const theme = useTheme();
  const hasScore = row.homeScore !== null && row.awayScore !== null;

  if (hasScore) {
    return (
      <View style={{ width: CENTRE_W, marginHorizontal: CENTRE_AIR, alignItems: 'center' }}>
        <Scoreline home={row.homeScore} away={row.awayScore} live={row.clock !== null} />
        {row.clock ? (
          <SubLine tone={theme.colors.red}>{row.clock}</SubLine>
        ) : row.isCompleted ? (
          <SubLine tone={theme.colors.slate}>FT</SubLine>
        ) : null}
      </View>
    );
  }

  const { day, time } = formatKickoff(row.kickoffAt);
  return (
    <View style={{ width: CENTRE_W, marginHorizontal: CENTRE_AIR, alignItems: 'center' }}>
      {/*
        ⚠ THE SAME `SubLine` FOR BOTH — Ryan, 2026-09-04, and the blue is gone
        on purpose. Primary is the pick language on this card: your chips are
        blue, your opponent's are red, and a blue kickoff put a third thing in
        the viewer's colour that had nothing to do with whose pick it was.
        A kickoff is neutral information about the match, so it reads in the
        neutral tone the day above it already used.
      */}
      <SubLine tone={theme.colors.slate}>{day}</SubLine>
      <SubLine tone={theme.colors.slate}>{time}</SubLine>
    </View>
  );
}

/** The small line under a scoreline or over a kickoff. */
function SubLine({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <Text
      numberOfLines={1}
      style={{
        fontFamily: fontFamilies.bold,
        fontSize: 9,
        lineHeight: 13,
        letterSpacing: 0.8,
        color: tone,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * Two numbers either side of a fixed dash.
 *
 * The dash lands in the same place on every row and the digits grow outwards
 * from it, so a column of scores reads down cleanly. A single centred string
 * cannot do that — it centres the STRING, and a longer one shifts its own
 * digits sideways.
 */
/**
 * ⚠ TWO SIZES, BECAUSE IT CARRIES TWO DIFFERENT NUMBERS. A fixture's score is
 * one digit a side and sits between two pick chips, so it is small and narrow.
 * A duel's score is three digits a side — 400-250 — and is the whole point of
 * an "elsewhere" row, so it is bigger and needs the width to match. At the
 * fixture's 46pt a three-digit duel score clips its own hundreds column.
 */
const SCORELINE = {
  fixture: { width: CENTRE_W, size: 13 },
  duel: { width: 76, size: 15 },
} as const;

export function Scoreline({
  home,
  away,
  live = false,
  kind = 'fixture',
}: {
  home: number | null;
  away: number | null;
  live?: boolean;
  kind?: keyof typeof SCORELINE;
}) {
  const theme = useTheme();
  const { width, size } = SCORELINE[kind];

  if (home === null || away === null) {
    return (
      <Text variant="detail" color="slate" style={{ width, textAlign: 'center', opacity: 0.5 }}>
        v
      </Text>
    );
  }

  const tint = live ? theme.colors.red : theme.colors.ink;
  const digit: TextStyle = {
    fontFamily: fontFamilies.black,
    fontSize: size,
    // ⚠ WITH THE SIZE. The `detail` variant caps `lineHeight` at 13 and shears
    // the tops off anything larger.
    lineHeight: size + 5,
    color: tint,
    fontVariant: ['tabular-nums'],
    flex: 1,
  };

  return (
    <View style={{ width, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="detail" style={[digit, { textAlign: 'right' }]}>
        {home}
      </Text>
      <Text
        variant="detail"
        color="slate"
        style={{ paddingHorizontal: 3, fontSize: size, lineHeight: size + 5, opacity: 0.6 }}
      >
        –
      </Text>
      <Text variant="detail" style={[digit, { textAlign: 'left' }]}>
        {away}
      </Text>
    </View>
  );
}

/**
 * Kickoff as its two lines, in the DEVICE's timezone — `match_date` is
 * timestamptz and every surface in this app shows it device-local.
 *
 * Split rather than one string because the two stack: the day is the quiet
 * qualifier, the time is the thing being read.
 */
function formatKickoff(iso: string | null): { day: string; time: string } {
  if (!iso) return { day: '', time: 'TBC' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: '', time: 'TBC' };
  return {
    day: d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
    time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  };
}
