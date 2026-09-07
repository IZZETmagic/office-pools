import type { TimelineEvent } from './useMatchDetail';

// =============================================================
// Who scored, for the header
// =============================================================
// The two lists under the scoreline. Derived from the same `match_events` rows
// the timeline draws, so the header and the Facts tab can never disagree about
// who scored — which they would the moment either counted goals for itself.
//
// ⚠ PURE, and in `lib/` so it can be tested: nothing here imports
// `react-native`. See the vitest config's rule for `mobile/**`.
// =============================================================

/** One scorer, and every goal they got. */
export type ScorerLine = {
  name: string;
  /** Already formatted — "25'", "45+2'", "62' (pen)", "30' (og)". */
  minutes: string[];
};

/**
 * ⚠ EXACTLY THE KINDS THAT PUT A GOAL ON THE BOARD. `var_goal_cancelled` is in
 * the timeline precisely because it did NOT count, and a set that included it
 * would print a scorer for a goal the screen shows struck through two inches
 * below.
 */
const SCORING = new Set<TimelineEvent['kind']>(['goal', 'penalty', 'own_goal']);

function label(e: TimelineEvent): string {
  const minute = `${e.minute}${e.extraMinute ? `+${e.extraMinute}` : ''}'`;
  if (e.kind === 'own_goal') return `${minute} (og)`;
  if (e.kind === 'penalty') return `${minute} (pen)`;
  return minute;
}

/**
 * The scorers for each side, in the order they scored.
 *
 * ⚠ `side` IS THE SIDE CREDITED, NOT THE SCORER'S TEAM, and for an own goal
 * those differ. The mapper deliberately does not flip it — the row is already
 * on the side the goal counted for — so an own goal is listed under the team
 * that BENEFITED, marked "(og)". That is what makes these two lists add up to
 * the scoreline above them; putting it under the scorer's own club would show
 * 2-1 over a list reading 1-2.
 *
 * ⚠ A PLAYER APPEARS ONCE, with every one of their goals beside them. Two lines
 * reading "Haaland 12'" and "Haaland too'" is how a broadcast would never do it,
 * and a hat-trick would push the crests off the screen.
 */
export function matchScorers(events: TimelineEvent[]): {
  home: ScorerLine[];
  away: ScorerLine[];
} {
  const build = (side: 'home' | 'away'): ScorerLine[] => {
    const order: string[] = [];
    const byPlayer = new Map<string, string[]>();

    for (const e of events) {
      if (e.side !== side || !SCORING.has(e.kind)) continue;
      // A goal the feed could not name still counts on the scoreboard, so it is
      // listed rather than dropped — the alternative is a header that adds up
      // to less than the score beside it.
      const name = e.playerName?.trim() || 'Unknown';
      if (!byPlayer.has(name)) {
        byPlayer.set(name, []);
        order.push(name);
      }
      byPlayer.get(name)!.push(label(e));
    }

    return order.map((name) => ({ name, minutes: byPlayer.get(name)! }));
  };

  return { home: build('home'), away: build('away') };
}

/** True when there is anything at all to draw. */
export function hasScorers(s: { home: ScorerLine[]; away: ScorerLine[] }): boolean {
  return s.home.length > 0 || s.away.length > 0;
}
