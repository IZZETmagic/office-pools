import type { LineupPlayer } from './useMatchDetail';

// =============================================================
// Turning a feed's `grid` into rows on a pitch
// =============================================================
// ⚠ IT LIVES HERE RATHER THAN IN `LineupsTab.tsx` SO IT CAN BE TESTED. The
// vitest config's rule for `mobile/**` is pure modules only — nothing under that
// glob may import `react-native` — and its note says the way to test screen
// logic is to move the logic out of the screen. This is that move.
//
// ⚠ PURE: no hooks, no theme, no components.
// =============================================================

/**
 * Rows beyond this are a malformed grid, not a formation.
 *
 * A 4-2-3-1 is four outfield rows plus the keeper; nothing real reaches eight,
 * so a `grid` of "44:1" is a parse to reject rather than a row to draw halfway
 * down the pitch.
 */
export const MAX_ROWS = 8;

/** `"2:3"` → `{row: 2, col: 3}`; anything else → null. */
export function parseGrid(grid: string | null): { row: number; col: number } | null {
  if (!grid) return null;
  const [rawRow, rawCol] = grid.split(':');
  // ⚠ `Number('')` IS 0, NOT NaN. A grid of ":" or "2:" would otherwise parse
  // to a real position and put a player in a column nobody picked.
  if (!rawRow?.trim() || !rawCol?.trim()) return null;
  const row = Number(rawRow);
  const col = Number(rawCol);
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
  if (row < 1 || row > MAX_ROWS) return null;
  if (col < 1) return null;
  return { row, col };
}

/**
 * `[{grid:'2:3'}, ...]` → rows in ascending row order, each sorted by column.
 *
 * ⚠ A PLAYER WITH NO GRID STILL GETS ON THE PITCH, in a trailing row of his
 * own. Dropping him would quietly render a ten-man team, and a missing shirt is
 * far harder to notice than a slightly odd row — the feed does occasionally
 * omit a grid on a starter.
 */
export function groupByRow(players: LineupPlayer[]): LineupPlayer[][] {
  const byRow = new Map<number, { col: number; player: LineupPlayer }[]>();
  const ungridded: LineupPlayer[] = [];

  for (const p of players) {
    const parsed = parseGrid(p.grid);
    if (!parsed) {
      ungridded.push(p);
      continue;
    }
    const bucket = byRow.get(parsed.row) ?? [];
    bucket.push({ col: parsed.col, player: p });
    byRow.set(parsed.row, bucket);
  }

  const rows = [...byRow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, entries]) => entries.sort((a, b) => a.col - b.col).map((e) => e.player));

  if (ungridded.length > 0) rows.push(ungridded);
  return rows;
}

/**
 * "B. Leno" → "Leno", for a chip 58 points wide.
 *
 * ⚠ `/fixtures/lineups` ALREADY ABBREVIATES THE FORENAME — it sends
 * "E. Nketiah" where `/fixtures/events` sends "Eddie Nketiah" — so this mostly
 * drops an initial that is already an initial. It is not a general name
 * shortener, and the two endpoints must never be joined by name.
 */
export function surnameOf(name: string | null): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed === '') return '';
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1];
}

// =============================================================
// How deep each row stands
// =============================================================

/**
 * The goalkeeper's depth, as a percentage of the pitch's length from his own
 * goal line.
 *
 * ⚠ PINNED, AND NOT PART OF THE FORMATION'S SPACING. He used to take an equal
 * slice of the band like everyone else, which stood him 8.6% out — past the
 * six-yard box (3.79%) and a third of the way to the penalty spot — and spent a
 * whole row's worth of pitch on a player who does not move up it. 4% puts him
 * just off his line, in the goal area where a keeper actually stands, and hands
 * the difference to the outfield.
 *
 * ⚠ IT CANNOT GO MUCH BELOW THIS. His rating badge hangs about 29pt above the
 * circle's centre, and at 4% that centre sits 40pt from the top of the drawing.
 * Under roughly 2.6% the badge would be cut off by the edge of the pitch.
 */
export const GK_DEPTH = 4;

/**
 * How big a player is on the pitch, and how far his furniture reaches.
 *
 * ⚠⚠ THESE LIVE HERE, NOT IN THE COMPONENT, BECAUSE THE SPACING DEPENDS ON
 * THEM. Two facing strikers overlap or they do not, and that is decided by the
 * pitch's length, the row depths AND the size of the things hanging off a
 * circle. With the sizes in a `.tsx` no test could see them, and on 2026-09-09
 * the front rows collided: the away striker's substitution minute landed on the
 * home striker's name, and the name itself crossed the halfway line.
 */
export const CHIP = 48;
/** How far a badge hangs outside the circle. */
export const MARK = 17;

/**
 * The highest thing on a player: his substitution minute.
 *
 * ⚠ TRACED, NOT GUESSED — I added `MARK` twice on the first attempt and it
 * cancels. From the player's centre: the circle top is CHIP/2; the arrow's
 * wrapper sits 4 above that at `top: -4`; the wrapper is MARK tall so its
 * BOTTOM is MARK lower again; and the minute is `bottom: MARK + 1` inside it,
 * which puts its bottom edge 1 above the wrapper's top. So the two MARKs
 * cancel and only the +1 and the line's own 12 survive.
 */
export const REACH_UP = CHIP / 2 + 4 + 1 + 12;
/** The lowest: circle bottom, the gap, and the name label. */
export const REACH_DOWN = CHIP / 2 + 3 + 11 * 1.32;

/** Where the outfield rows begin and end, as percentages of the length. */
export const OUTFIELD_FROM = 14;
/**
 * ⚠⚠ SHORT OF THE HALFWAY LINE, AND 44 RATHER THAN 46 BECAUSE 46 WAS NOT SHORT
 * ENOUGH. A front row at 46% leaves 8% of the pitch between the two of them —
 * 64pt — and two facing strikers need 100pt: 58 for the taller one's
 * substitution minute and 42 for the other's name. They collided, and the name
 * crossed the centre line as well, which needs 42pt of clear pitch on its own
 * and had 32.
 *
 * At 44% the gap is 12% and the clearance 6%, which on a 170m pitch is 113pt
 * and 56pt. `pitchGeometry` explains why the pitch got longer at the same time
 * — pulling the row back alone would have cost the spacing between rows.
 */
export const OUTFIELD_TO = 44;

/**
 * The depth of every row, front to back, as percentages of the pitch length.
 *
 * ⚠ THE OUTFIELD IS SPACED END TO END, not by slicing a band into equal parts
 * and taking the middle of each. Slicing wastes half a gap at each end: five
 * rows over 46% gave 9.2% between them, where pinning the keeper and running
 * the other four from 14% to 46% gives 10.7% — 86pt instead of 74pt on a 393pt
 * phone, for the same pitch.
 *
 * ⚠ THE KEEPER IS THE FIRST ROW ONLY IF HE IS ALONE IN IT. `groupByRow` sorts
 * by the feed's `grid`, and a starter whose grid is missing lands in a trailing
 * row of his own — so a lineup with no grids at all would put eleven players in
 * "row one". Pinning that row to the goal line would stack the whole team on
 * top of the keeper, so when the first row holds more than one player this
 * falls back to spreading everyone evenly, which is what it did before.
 */
export function rowDepths(rowCount: number, firstRowIsKeeper: boolean): number[] {
  if (rowCount <= 0) return [];

  if (!firstRowIsKeeper || rowCount === 1) {
    // The old even spread: each row takes the middle of its own slice.
    const BAND = OUTFIELD_TO - GK_DEPTH;
    return Array.from({ length: rowCount }, (_, i) => GK_DEPTH + ((i + 0.5) / rowCount) * BAND);
  }

  const outfield = rowCount - 1;
  if (outfield === 1) return [GK_DEPTH, (OUTFIELD_FROM + OUTFIELD_TO) / 2];

  return [
    GK_DEPTH,
    ...Array.from(
      { length: outfield },
      (_, i) => OUTFIELD_FROM + (i / (outfield - 1)) * (OUTFIELD_TO - OUTFIELD_FROM),
    ),
  ];
}
