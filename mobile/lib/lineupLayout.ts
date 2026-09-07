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
