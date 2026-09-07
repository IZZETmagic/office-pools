import type { MatchTeamStats } from './useMatchDetail';

// =============================================================
// Which statistics the tab draws, in which order
// =============================================================
// ⚠ A LIST, NOT A LOOP OVER THE OBJECT'S KEYS. Iterating `Object.keys` would
// put the columns on screen in whatever order migration 139 happens to declare
// them, rename a row the day a column is renamed, and print `side` and
// `fixture_id` as statistics. This is the running order a viewer expects —
// possession, then shots, then the discipline — and it is a product decision
// rather than a schema one.
//
// ⚠ PURE, and in `lib/` so it can be tested: nothing here imports
// `react-native`. See the vitest config's rule for `mobile/**`.
// =============================================================

export type StatRow = {
  key: string;
  label: string;
  /** Pulls the figure off one side's row. Null means that side has none. */
  read: (s: MatchTeamStats) => number | null;
  /** Render with a trailing '%'. */
  percent?: boolean;
  /**
   * Render to two decimal places, and — importantly — render a missing value as
   * "—" rather than 0.
   *
   * ⚠ THIS FLAG IS THE NULL POLICY, not just formatting. Migration 139 keeps
   * null and zero apart because they mean different things: a null COUNT is
   * "none happened", a null xG is "this competition does not publish it". A
   * count therefore falls back to 0 and a decimal does not.
   */
  decimals?: boolean;
};

export const STAT_ROWS: StatRow[] = [
  { key: 'possession', label: 'Possession', read: (s) => s.possessionPct, percent: true },
  { key: 'shots_total', label: 'Shots', read: (s) => s.shotsTotal },
  { key: 'shots_on', label: 'On target', read: (s) => s.shotsOn },
  { key: 'shots_off', label: 'Off target', read: (s) => s.shotsOff },
  { key: 'shots_blocked', label: 'Blocked', read: (s) => s.shotsBlocked },
  { key: 'shots_inside_box', label: 'Inside box', read: (s) => s.shotsInsideBox },
  { key: 'shots_outside_box', label: 'Outside box', read: (s) => s.shotsOutsideBox },
  { key: 'saves', label: 'Saves', read: (s) => s.saves },
  { key: 'corners', label: 'Corners', read: (s) => s.corners },
  { key: 'offsides', label: 'Offsides', read: (s) => s.offsides },
  { key: 'fouls', label: 'Fouls', read: (s) => s.fouls },
  { key: 'free_kicks', label: 'Free kicks', read: (s) => s.freeKicks },
  { key: 'yellow_cards', label: 'Yellow cards', read: (s) => s.yellowCards },
  { key: 'red_cards', label: 'Red cards', read: (s) => s.redCards },
  { key: 'passes_total', label: 'Passes', read: (s) => s.passesTotal },
  { key: 'passes_accurate', label: 'Accurate passes', read: (s) => s.passesAccurate },
  { key: 'passes_pct', label: 'Pass accuracy', read: (s) => s.passesPct, percent: true },
  // The two the feed only sometimes sends. They sit last because a competition
  // that publishes neither should not open its statistics tab with two dashes.
  { key: 'expected_goals', label: 'Expected goals', read: (s) => s.expectedGoals, decimals: true },
  { key: 'goals_prevented', label: 'Goals prevented', read: (s) => s.goalsPrevented, decimals: true },
];

/**
 * The rows worth drawing for this fixture.
 *
 * ⚠ THE TEST IS PER ROW, NOT PER VALUE. A statistic neither side has is hidden;
 * one that only one side has is kept, because "14 shots against none" is a real
 * and interesting answer. Hiding it would silently flatter the side with none.
 */
export function visibleStatRows(
  home: MatchTeamStats | null,
  away: MatchTeamStats | null,
): StatRow[] {
  return STAT_ROWS.filter(
    (r) => (home ? r.read(home) : null) !== null || (away ? r.read(away) : null) !== null,
  );
}
