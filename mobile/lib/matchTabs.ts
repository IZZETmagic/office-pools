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
   * Whether `/fixtures/:id/scout` came back with anything to show.
   *
   * ## ⚠⚠ IT USED TO BE TWO FLAGS AND THEY GATED TWO DIFFERENT ENDPOINTS
   *
   * `hasScouting` (head-to-head history) and `hasPlayerForm` (migration 141's
   * ratings) were separate because the two go missing for OPPOSITE reasons: a
   * newly promoted pairing has no history however late in the season, and nobody
   * has 180 minutes in the second week however long the clubs have played each
   * other. The tab appeared on either.
   *
   * That reasoning still holds — it just moved inside the payload. `/scout`
   * returns the pairing, the form, the people and the crowd as four
   * independently nullable fields, and the caller ORs them. One flag here, the
   * same degradation, and the two surfaces can no longer disagree about the
   * floor because there is only one read.
   *
   * ⚠ DELIBERATE CONSEQUENCE: THE TAB NOW APPEARS FAR MORE OFTEN. Venue-split
   * form costs no provider call — it is read straight from `league_fixtures` —
   * so it is present for essentially every league fixture. That does NOT break
   * `MatchTabBar`'s rule, because the rule is that a tab must never be EMPTY and
   * form is real content; it is the degradation the design note asks for
   * ("layer 2 guarantees it never is"). But it is a visible change rather than a
   * refactor, and it is deliberate.
   */
  hasScout: boolean;
}): MatchTabKey[] {
  return ALL_MATCH_TAB_KEYS.filter(
    (k) =>
      (k !== 'lineups' || opts.hasLineups) &&
      (k !== 'stats' || opts.hasStats) &&
      (k !== 'scouting' || opts.hasScout),
  );
}

/**
 * Does a scout payload have anything to show?
 *
 * ⚠ STRUCTURAL, NOT TYPED AGAINST `MatchScoutResponse`. This module's header
 * promises it imports nothing that reaches `react-native`, and keeping that
 * promise literal — rather than relying on `import type` being erased — is what
 * lets the whole file be unit-tested under the `mobile/**` vitest glob.
 *
 * ⚠ ANY ONE FIELD IS ENOUGH, WHICH IS THE DEGRADATION THE DESIGN NOTE ASKS FOR.
 * The four cards go missing for different reasons — a pairing with no history, a
 * date with no fixtures played, a squad with no minutes, a fixture under the
 * crowd's anonymity floor — and the report renders however many it has. The tab
 * refuses to exist only on none of them.
 *
 * ⚠⚠ `!= null`, NEVER `!== null`. A field an older API has never heard of
 * arrives as `undefined`, and a strict check counts that as present — which
 * would offer a Scouting tab that opens onto nothing at all.
 */
export function hasScoutContent(
  scout:
    | {
        h2h?: unknown;
        form?: unknown;
        people?: unknown;
        crowd?: unknown;
      }
    | null
    | undefined,
): boolean {
  if (!scout) return false;
  return (
    scout.h2h != null || scout.form != null || scout.people != null || scout.crowd != null
  );
}
