/**
 * What each LEAGUE mode actually asks of a player.
 *
 * The counterpart to `poolModeInfo.ts`, which says of itself: "The copy in this
 * file describes the three bracket modes only; a league has its own explainer."
 * This is that explainer, and until it existed there was a real cost.
 *
 * ⚠ WHY THIS FILE EXISTS. `PoolInfoTab` resolved its copy with
 *
 *     POOL_MODE_INFO[pool.prediction_mode] ?? POOL_MODE_INFO.full_tournament
 *
 * and a league pool's `prediction_mode` is `'league_pickem'`, which is not a key
 * of that record. So every league pool fell through to the fallback and told its
 * members, in the product's own voice, that they were in a Full Tournament pool
 * where "everyone fills in a predicted score for every match — the full group
 * stage and then each knockout round — and it all rides on a single deadline
 * before the tournament starts." Not one clause of that is true of a league.
 *
 * The fallback is not the bug; it is a sensible guard against an unrecognised
 * mode. The bug was having nothing for a mode we ship.
 *
 * ## Keep this in step with two things
 *
 *  1. `LeagueScoringRulesTab`, which states the same mechanics to the same
 *     member on a neighbouring tab. Two screens disagreeing about how a pool
 *     works is worse than either being briefly out of date.
 *
 * ⚠ Showdown's copy USED to promise "everyone plays everyone the same number of
 * times, so nobody gets an easier run than anybody else". True of a fixed
 * roster, and false the moment somebody joins in October — Decision 10 settles
 * that a straggler joins the draw from the next matchweek, which necessarily
 * gives them fewer duels than the members who were there in August. The promise
 * is now about the draw being made up front and rotated, which stays true.
 *  2. The engines. Every number quoted in `points` below is a default the SQL
 *     COALESCEs against, not a number this file decides.
 *
 * ⚠ 2026-08-30 — THE DRAW IS NO LONGER PUBLISHED, AND IT OPENS ONE DUEL AT A
 * TIME. Migration 116 sealed it; migration 119 then moved the reveal from
 * "when the matchweek opens for picks" to "when the PREVIOUS matchweek is
 * decided", so the next opponent cannot be known while the current duel is
 * still being played.
 *
 * The copy below must carry both halves — the draw was made at pool creation,
 * and each opponent opens when the last duel is settled. It must NEVER say a
 * pairing happens each week: that is the one sentence that would fail the
 * disclosure gate, because it is a claim about a thing we did not do.
 * `LeagueScoringRulesTab`, `LeagueHowToPlayTab` and `DuelsTab` carry the same
 * sentence and move with this one — `leagueModeCopy.guard.test.ts` enforces it.
 */

export type LeagueMode = 'pickem' | 'showdown' | 'last_man_standing' | 'table'
export type LeagueDepth = 'results' | 'scores' | null

export type LeagueModeInfo = {
  label: string
  /** One sentence: what the player is being asked to do. */
  summary: string
  /** The fuller explanation, for surfaces with room to run (Pool Info). */
  description: string
  /** The three things that most change how the mode feels to play. */
  points: string[]
}

/**
 * Depth is part of the identity for the two modes that have picks — a pool
 * where you tap a winner and a pool where you call 3-1 are different games, and
 * a member arriving at Pool Info should be told which one they joined.
 */
export function leagueModeInfo(mode: LeagueMode, depth: LeagueDepth): LeagueModeInfo {
  const scores = depth === 'scores'

  switch (mode) {
    case 'pickem':
      return {
        label: scores ? 'Matchweek Pick’em · Exact Scores' : 'Matchweek Pick’em',
        summary: scores
          ? 'Members call a scoreline for every fixture, one matchweek at a time.'
          : 'Members call the result of every fixture, one matchweek at a time.',
        description: scores
          ? 'Every matchweek, members put a scoreline on all ten fixtures. Picks open one ' +
            'matchweek at a time and lock at that matchweek’s first kickoff — there is no ' +
            'single season deadline, and nobody can work ahead. Each fixture is scored on a ' +
            'tier: the exact score is worth most, then the right winner with the right goal ' +
            'difference, then just the right winner. The next matchweek opens on its own the ' +
            'moment the last one locks.'
          : 'Every matchweek, members call all ten fixtures Home, Draw or Away. Picks open one ' +
            'matchweek at a time and lock at that matchweek’s first kickoff — there is no ' +
            'single season deadline, and nobody can work ahead. Every fixture is worth the ' +
            'same, so there is nothing to gain from a bolder call than the one you believe. ' +
            'The next matchweek opens on its own the moment the last one locks.',
        points: [
          'One matchweek at a time — you cannot pick ahead.',
          'Locks at the first kickoff of the matchweek, automatically.',
          scores
            ? 'Exact score, right margin, or right winner — only the best tier counts.'
            : 'Every fixture is worth the same.',
        ],
      }

    case 'showdown':
      return {
        label: scores ? 'Showdown · Exact Scores' : 'Showdown',
        summary: 'Members play the matchweek, then go head-to-head with one other member.',
        description:
          (scores
            ? 'Members put a scoreline on all ten fixtures each matchweek, '
            : 'Members call all ten fixtures each matchweek, ') +
          'and are drawn against one other member for that week. Whoever scores more wins the ' +
          'duel — three points for a win, one for a tie. The whole season is drawn when the ' +
          'pool is created, but each opponent is revealed only once the previous duel is ' +
          'decided, or a day before you pick if a postponement holds that up — so you play one ' +
          'duel at a time and who comes next is a surprise. The draw ' +
          'rotates, so everybody meets everybody rather than ' +
          'the same pairs coming round again. With an odd number of members somebody sits out ' +
          'each week and takes a point — there was no opponent, so there was no defeat. Duel ' +
          'points decide the table; the weekly score is the tiebreak, so a big week still ' +
          'counts even if you lost the head-to-head.',
        points: [
          // ⚠ THE DISCLOSURE GATE LIVES IN THIS SENTENCE. Migration 116 seals the
          // draw and reveals it a matchweek at a time; that passes gate 1 only
          // while the copy says what actually happens. The draw is made ONCE, at
          // pool creation — never "you have been randomly paired this week",
          // which would be a claim about a thing we did not do.
          'Drawn up front; your next opponent opens when the current duel is decided.',
          // The floor clause lives in `description` rather than here — three
          // bullets is the shape, and the headline rule is the settle arm.
          'Three points a win, one a tie, none for a loss.',
          'A week with no opponent is worth a point.',
        ],
      }

    case 'last_man_standing':
      return {
        label: 'Last Man Standing',
        summary: 'Members back one club a matchweek to win, and cannot use the same club twice.',
        description:
          'Each matchweek every member picks a single club they think will win. If it wins ' +
          'they go through; a draw or a defeat and they are out of the round. A club can only ' +
          'be used once per round, so the safe picks run out and the choice gets harder as the ' +
          'round goes on. When a round ends everybody goes back in for the next one — an early ' +
          'exit in September does not mean watching until May. There are no points in this ' +
          'mode; members are ranked by rounds won.',
        points: [
          'One club a matchweek, to win.',
          'Each club can only be used once per round.',
          'Rounds repeat, so nobody is out for the season.',
        ],
      }

    case 'table':
      return {
        label: 'Predict the Table',
        summary: 'Members order every club in the division once, and live with it all season.',
        description:
          'One decision, made before the deadline and then watched for the rest of the season: ' +
          'members put every club in the division into the order they think it will finish. ' +
          'Each club placed exactly right is worth full points, and every place out costs some ' +
          'of that, down to nothing. On top of the per-place points there are bonuses for the ' +
          'champion and for naming the clubs in the top and relegation places — those are ' +
          'scored as sets rather than orders, so getting the right clubs in roughly the right ' +
          'region still pays. The prediction is scored against the real league table, so ' +
          'points deductions and the league’s own tiebreakers are reflected exactly.',
        points: [
          'One prediction for the whole season, made once.',
          'Scored against the real table, deductions included.',
          'Top and relegation places are scored as sets, not orders.',
        ],
      }
  }
}
