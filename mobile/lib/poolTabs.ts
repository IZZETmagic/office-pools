// =============================================================
// WHICH TABS A POOL OFFERS, AND IN WHAT ORDER
// =============================================================
// Lifted out of `PoolTabBar` so it can be TESTED. It is pure logic that lived
// in a component importing React Native, which put it beyond the root runner —
// and it had quietly grown a second consumer that depends on its ORDER: the
// pool screen lands a member on `getVisiblePoolTabs(...)[0]`, so "Duel comes
// first" stopped being a layout detail and became the Showdown landing rule.
//
// ⚠ NOTHING HERE MAY IMPORT REACT NATIVE. That is what keeps it testable, and
// `mobile/lib/__tests__/poolTabs.test.ts` is what it buys.

export type PoolTabKey =
  | 'duel'
  | 'room'
  | 'leaderboard'
  | 'predictions'
  | 'form'
  | 'scoring'
  | 'info'
  | 'rounds'
  | 'members'
  | 'fees'
  | 'settings';

export type TabDef = {
  key: PoolTabKey;
  label: string;
  icon: string;
};

// Order matters — this drives the swipe sequence and tab-bar layout.
// 'info' sits AFTER Scoring (the last tab non-admins see today) so it
// becomes the natural "end-of-strip" surface for non-admins. Admins
// then continue into the admin-only Rounds / Members / Settings.
export const ALL_TABS: TabDef[] = [
  // ⚠ FIRST, and only in Showdown. The mode is named after the duel, so the
  // duel is the landing — everything else in the pool is how you train for it.
  // Filtered out everywhere else, so no other mode's tab order moves.
  { key: 'duel', label: 'Duel', icon: 'flame.fill' },
  { key: 'leaderboard', label: 'Leaderboard', icon: 'trophy.fill' },
  // ⚠ Showdown only, and it REPLACES Predictions there rather than joining it.
  // A Showdown member picks from the Duel tab's Your Sheet card; this tab is
  // where they read the week back — their duels, everybody else's, and what
  // each was decided on.
  { key: 'room', label: 'The Room', icon: 'figure.boxing' },
  { key: 'predictions', label: 'Predictions', icon: 'pencil.line' },
  { key: 'form', label: 'Form', icon: 'chart.bar.xaxis' },
  { key: 'scoring', label: 'Scoring', icon: 'list.number' },
  { key: 'info', label: 'Info', icon: 'info.circle.fill' },
  { key: 'rounds', label: 'Rounds', icon: 'calendar.badge.clock' },
  { key: 'members', label: 'Members', icon: 'person.3.fill' },
  { key: 'fees', label: 'Fees', icon: 'dollarsign.circle.fill' },
  { key: 'settings', label: 'Settings', icon: 'gearshape.fill' },
];

export function getVisiblePoolTabs(
  isAdmin: boolean,
  isProgressive: boolean,
  feesEnabled: boolean,
  isLeague = false,
  /**
   * ⚠ READ THE `isLeague` WARNING BELOW BEFORE USING THIS.
   *
   * The rule there is that `leagueMode` must never decide whether a pool IS a
   * league — two production pools carry a season id with a NULL mode and would
   * be thrown back to the World Cup flow. It does NOT say the mode can never be
   * read: choosing between league SURFACES by mode is exactly what
   * `lib/leagueSurface.ts` does, and this is the same question one level up.
   *
   * So: `isLeague` gates the league-ness, `leagueMode` gates a single mode's
   * own tab. A NULL-mode league pool simply gets no Duel tab, which is right —
   * it has no duels.
   */
  leagueMode: 'pickem' | 'showdown' | 'last_man_standing' | 'table' | null = null,
): PoolTabKey[] {
  return ALL_TABS.filter((t) => {
    // The duel is Showdown's whole subject and meaningless anywhere else.
    if (t.key === 'duel') return isLeague && leagueMode === 'showdown';
    if (t.key === 'room') return isLeague && leagueMode === 'showdown';
    // ⚠ AND SHOWDOWN LOSES `predictions`. Its placeholder said "make your picks
    // on the web", which stopped being true the moment the Duel tab started
    // routing into the RN picker — and The Room answers the question that tab
    // was standing in for.
    if (t.key === 'predictions') return !(isLeague && leagueMode === 'showdown');
    if (t.key === 'rounds') return isAdmin && isProgressive;
    if (t.key === 'fees') return isAdmin && feesEnabled;
    if (t.key === 'members' || t.key === 'settings') return isAdmin;
    // ⚠ FORM CANNOT RENDER FOR A LEAGUE POOL — every one of its inputs is
    // missing, and deliberately so. It reads `entry_xp_state` (form dots,
    // streak, hit rate, level, XP), which the league outbox route BLOCKS rather
    // than skipping: `computePoolEntryAnalytics` goes through `readMatchScores`,
    // which has no league arm, so running it would compute accuracy and streak
    // from zero rows and then STORE the zeros — "worse than blank".
    //
    // So the tab showed a confident 0% accuracy and no streak under a heading
    // promising form. Hidden until Form is built for a league, which is a
    // product decision rather than a rendering one (Ryan, 2026-09-02). The web
    // dropped this tab for league pools already; this is mobile catching up.
    //
    // ⚠ `isLeague`, never `leagueMode` — two production pools carry a season id
    // with a NULL mode, and their analytics are just as empty.
    if (t.key === 'form') return !isLeague;
    return true;
  }).map((t) => t.key);
}
