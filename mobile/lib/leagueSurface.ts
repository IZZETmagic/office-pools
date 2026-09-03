// =============================================================
// WHICH PREDICTION SURFACE A POOL GETS
// =============================================================
// Three rules, each of which has cost something, in one place instead of buried
// in a `switch` on a 900-line screen.
// =============================================================

export type PoolShape = {
  isLeague: boolean
  leagueMode: 'pickem' | 'showdown' | 'last_man_standing' | 'table' | null
}

export type PredictionSurface =
  /**
   * Table mode's own screen: the ordering you filed, priced against the real
   * table. Still READ-ONLY — it does not drag — but it has real content to
   * show, which is why it is not the placeholder below.
   *
   * ⚠ It stays under the PREDICTIONS tab rather than getting one of its own.
   * The pool asks for exactly one prediction, so the tab that holds predictions
   * is where it belongs; a second tab beside an empty one would be describing
   * our data model rather than the game.
   */
  | 'league-table'
  /**
   * Last Man Standing. The landing is the round — your own state, then the wall
   * of everybody's picks across its matchweeks — and the picking is a route away
   * at `pool/[id]/survivor/[entryId]`, exactly as Table mode does it.
   *
   * ⚠ A separate ROUTE, not a branch inside the tab. Anything scrollable
   * rendered in the tab pager cannot get a height; `LeagueTableEntriesTab` paid
   * for that lesson first and its header records it.
   */
  | 'league-lms'
  /**
   * Pick'em. The landing is a MATCHWEEK — the entries in it, yours first — and
   * the picking is a route away at `pool/[id]/pickem/[entryId]`, the same shape
   * Table and LMS use and for the same layout reason.
   *
   * ⚠ It is the only mode whose landing has a week dimension. Table asks for one
   * prediction a season and LMS asks one a week within a round; Pick'em asks for
   * ten a week, thirty-eight times, and every one of those weeks reveals on its
   * OWN clock. So the switcher is not a convenience — without it, thirty-seven
   * weeks of the season are unreachable.
   */
  | 'league-pickem'
  /**
   * Every other league pool. The phone shows what it can READ and sends picking
   * to the web — Ryan's call 2026-09-02: a picking control is a product decision
   * that deserves its own design pass rather than arriving behind a read
   * contract.
   *
   * ⚠ Now only Showdown, which is the largest of the four to design.
   */
  | 'league-read-only'
  /** The World Cup wizard. */
  | 'world-cup'

/**
 * ⚠ RULE 1 — `isLeague`, NOT `leagueMode`, is the discriminant.
 *
 * `league_season_id` is the column every league branch on the web is gated on,
 * and a pool can carry it with a NULL mode: two production pools do, created
 * before migration 077. Reading a NULL mode as *"not a league"* would send
 * exactly those back to the World Cup flow — the path this function exists to
 * close for them.
 *
 * ⚠ RULE 2 — a league pool NEVER reaches the World Cup wizard.
 *
 * Its picks live in `league_predictions`, which that wizard never touches. Until
 * 2026-09-02 mobile did not select `league_mode` at all, so a Premier League
 * pool opened on a phone rendered the World Cup wizard against no rows: an empty
 * screen with nothing on it to explain why. That is the defect this closes, and
 * it is closed by READING the pool correctly, not by building a picker.
 */
export function predictionSurfaceFor(pool: PoolShape): PredictionSurface {
  if (!pool.isLeague) return 'world-cup'
  // ⚠ Reached ONLY after `isLeague` — rule 1 above. The mode is allowed to
  // choose between league surfaces; it is never allowed to decide whether this
  // is a league at all, which is the distinction a NULL mode turns on.
  if (pool.leagueMode === 'table') return 'league-table'
  if (pool.leagueMode === 'last_man_standing') return 'league-lms'
  if (pool.leagueMode === 'pickem') return 'league-pickem'
  return 'league-read-only'
}
