// =============================================================
// Which tabs a match detail screen offers
// =============================================================
// ⚠ IT LIVES IN `lib/` SO IT CAN BE TESTED. The order below drives the swipe
// sequence, the strip layout AND every index into the pager, so an off-by-one
// here shows the wrong page rather than throwing — the kind of bug that ships.
// `MatchTabBar` holds the labels and icons; this holds the set and the order.
//
// ⚠ PURE: nothing here imports `react-native`. See the vitest config's rule for
// `mobile/**`.
// =============================================================

export type MatchTabKey = 'facts' | 'predictions' | 'lineups' | 'stats' | 'scouting';

/**
 * Every tab that can ever exist, in the order they are swiped through.
 *
 * ⚠ NOT THE SET TO RENDER — use `matchTabs()`.
 */
export const ALL_MATCH_TAB_KEYS: readonly MatchTabKey[] = [
  'facts',
  'lineups',
  'stats',
  'scouting',
  'predictions',
];

/**
 * The tabs this particular match can offer.
 *
 * ⚠ A TAB APPEARS ONLY WHEN THIS MATCH HAS ITS ROWS. `MatchTabBar` carried a
 * note from the day it was written: "a tab that is always there and never has
 * anything in it teaches people to stop tapping it. They arrive when their data
 * does." Migration 139 is that data, and this function is what turned the rule
 * from an assertion into something enforced.
 *
 * Line-ups and Statistics are absent for every World Cup match — 139's
 * `matches` arm is deliberately empty — and for any league fixture the backfill
 * has not reached.
 *
 * ⚠ FACTS AND PREDICTIONS ARE ALWAYS PRESENT, which is not an exception to the
 * rule. Facts has the fixture itself; Predictions states plainly when a league
 * fixture has no picks to show, which is a stated boundary rather than a blank.
 */
export function matchTabs(opts: {
  hasLineups: boolean;
  hasStats: boolean;
  /**
   * ⚠ THE SERVER DECIDES THIS ONE. Two clubs need a real history before a
   * "scout report" is anything but noise — the provider holds three meetings
   * for some current Premier League pairings — and the threshold lives with the
   * summariser so the two surfaces cannot disagree about it.
   */
  hasScouting: boolean;
}): MatchTabKey[] {
  return ALL_MATCH_TAB_KEYS.filter(
    (k) =>
      (k !== 'lineups' || opts.hasLineups) &&
      (k !== 'stats' || opts.hasStats) &&
      (k !== 'scouting' || opts.hasScouting),
  );
}
