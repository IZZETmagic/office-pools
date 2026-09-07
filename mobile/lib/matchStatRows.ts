import type { MatchTeamStats } from './useMatchDetail';

// =============================================================
// Which statistics the tab draws, grouped, and in which order
// =============================================================
// ⚠ A LIST, NOT A LOOP OVER THE OBJECT'S KEYS. Iterating `Object.keys` would
// put the columns on screen in whatever order migration 139 happens to declare
// them, rename a row the day a column is renamed, and print `side` and
// `fixture_id` as statistics. This is the running order a viewer expects, and
// it is a product decision rather than a schema one.
//
// ⚠ THE SECTIONS ARE THE POINT. Nineteen rows in one card is a wall — nothing
// groups, so nothing can be skimmed. Split by what the numbers are ABOUT, a
// reader can go straight to the half they care about and ignore the rest.
//
// ⚠ AND A SECTION WITH NOTHING IN IT DOES NOT APPEAR AT ALL. The provider's
// type set varies by fixture and by competition — measured on production, 20 of
// 60 Premier League stat rows carry no `expected_goals` and 40 carry no
// `Free Kicks` — so an empty "Expected goals" card would be a heading over a
// blank, on maybe a third of matches. `visibleStatSections` drops them.
//
// ⚠ PURE, and in `lib/` so it can be tested: nothing here imports
// `react-native`. See the vitest config's rule for `mobile/**`.
// =============================================================

export type StatSectionKey =
  | 'possession'
  | 'shots'
  | 'expected'
  | 'passing'
  | 'goalkeeping'
  | 'discipline';

export type StatRow = {
  key: string;
  label: string;
  section: StatSectionKey;
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

/** Section order, top to bottom, and the words above each card. */
export const STAT_SECTIONS: { key: StatSectionKey; title: string }[] = [
  { key: 'possession', title: 'Possession' },
  { key: 'shots', title: 'Shots' },
  { key: 'expected', title: 'Expected goals' },
  { key: 'passing', title: 'Passing' },
  { key: 'goalkeeping', title: 'Goalkeeping' },
  { key: 'discipline', title: 'Discipline' },
];

export const STAT_ROWS: StatRow[] = [
  { key: 'possession', section: 'possession', label: 'Possession', read: (s) => s.possessionPct, percent: true },

  { key: 'shots_total', section: 'shots', label: 'Shots', read: (s) => s.shotsTotal },
  { key: 'shots_on', section: 'shots', label: 'On target', read: (s) => s.shotsOn },
  { key: 'shots_off', section: 'shots', label: 'Off target', read: (s) => s.shotsOff },
  { key: 'shots_blocked', section: 'shots', label: 'Blocked', read: (s) => s.shotsBlocked },
  { key: 'shots_inside_box', section: 'shots', label: 'Inside box', read: (s) => s.shotsInsideBox },
  { key: 'shots_outside_box', section: 'shots', label: 'Outside box', read: (s) => s.shotsOutsideBox },
  // ⚠ Corners sit with the shots, not in a set-piece section of their own. They
  // are attacking output and the provider gives us no other set-piece number to
  // keep them company.
  { key: 'corners', section: 'shots', label: 'Corners', read: (s) => s.corners },

  { key: 'expected_goals', section: 'expected', label: 'Expected goals', read: (s) => s.expectedGoals, decimals: true },
  { key: 'goals_prevented', section: 'expected', label: 'Goals prevented', read: (s) => s.goalsPrevented, decimals: true },

  { key: 'passes_total', section: 'passing', label: 'Passes', read: (s) => s.passesTotal },
  { key: 'passes_accurate', section: 'passing', label: 'Accurate', read: (s) => s.passesAccurate },
  { key: 'passes_pct', section: 'passing', label: 'Accuracy', read: (s) => s.passesPct, percent: true },

  // ⚠ ONE ROW TODAY, AND THAT IS THE FEED'S DOING. Every other football app
  // puts saves in a Defence section beside tackles, interceptions and
  // clearances — api-football sends us none of those, so naming this section
  // "Defence" would promise four numbers and deliver one. It is what it is,
  // and it grows if the provider ever widens.
  { key: 'saves', section: 'goalkeeping', label: 'Saves', read: (s) => s.saves },

  { key: 'fouls', section: 'discipline', label: 'Fouls', read: (s) => s.fouls },
  { key: 'free_kicks', section: 'discipline', label: 'Free kicks', read: (s) => s.freeKicks },
  { key: 'offsides', section: 'discipline', label: 'Offsides', read: (s) => s.offsides },
  { key: 'yellow_cards', section: 'discipline', label: 'Yellow cards', read: (s) => s.yellowCards },
  { key: 'red_cards', section: 'discipline', label: 'Red cards', read: (s) => s.redCards },
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

export type StatSection = { key: StatSectionKey; title: string; rows: StatRow[] };

/**
 * The visible rows, grouped into the cards that will hold them.
 *
 * Sections come back in `STAT_SECTIONS` order with their empty members removed,
 * and a section left with no rows at all is dropped entirely — a heading over a
 * blank card says the data is missing in a way that looks like a bug.
 */
export function visibleStatSections(
  home: MatchTeamStats | null,
  away: MatchTeamStats | null,
): StatSection[] {
  const visible = visibleStatRows(home, away);
  return STAT_SECTIONS.map(({ key, title }) => ({
    key,
    title,
    rows: visible.filter((r) => r.section === key),
  })).filter((s) => s.rows.length > 0);
}
