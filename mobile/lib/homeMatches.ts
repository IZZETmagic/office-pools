// =============================================================
// WHAT THE HOME SCREEN SAYS IS ON
// =============================================================
// Moved out of `useHomeData` on 2026-09-02, because it was answering the
// question with the wrong table.
//
// It read `matches` directly — twice, unbounded, filtered only by status and
// **not by tournament at all**:
//
//     .from('matches').eq('status', 'live')
//     .from('matches').in('status', ['scheduled','upcoming']).limit(5)
//
// A league fixture is not in `matches` and never will be, so a member whose only
// pool is a Premier League one got two empty arrays: no live card, no next
// kickoff, "0 matches today" — on a Saturday with ten games to come. Silently,
// because an empty result is a valid one.
//
// The same reads were also a latent cross-leak in the other direction: with no
// tournament filter, a second competition landing in `matches` would show on
// every member's home screen whether or not they were in a pool for it.
//
// So the home cards now derive from the SAME merged list the Results tab uses —
// World Cup matches plus league fixtures, scoped to the member's own pools —
// and this module is the derivation, kept pure so it can be asserted.
// =============================================================

import type { ResultsMatch } from './useTournamentMatches';

export type HomeMatches = {
  /** Every game in progress, soonest first. */
  live: ResultsMatch[];
  /** The next few still to be played, soonest first. */
  upcoming: ResultsMatch[];
  /** The very next kickoff, or null once there is nothing left to play. */
  next: ResultsMatch | null;
  /**
   * How many games share `next`'s calendar day, that one included.
   *
   * The card only says anything when this is more than one, so a single fixture
   * never produces "1 more match today".
   */
  matchesToday: number;
};

/** How many upcoming fixtures the Home list shows. Was a `.limit(5)`. */
export const UPCOMING_LIMIT = 5;

const time = (m: ResultsMatch) => {
  const t = new Date(m.matchDate).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function homeMatchesFrom(matches: ResultsMatch[], now = new Date()): HomeMatches {
  const live = matches.filter((m) => m.status === 'live').sort((a, b) => time(a) - time(b));

  // ⚠ `scheduled` AND `upcoming`. The World Cup writes both into `matches`;
  // a league fixture only ever carries `scheduled` (`league_fixtures_status_ck`).
  // Dropping either would quietly hide one competition's fixtures.
  const ahead = matches
    .filter((m) => m.status === 'scheduled' || m.status === 'upcoming')
    .sort((a, b) => time(a) - time(b));

  // ⚠ FROM NOW, which the old read got for free from the database and this has
  // to do for itself. The merged list is the WHOLE season, past included, so
  // without this "next kickoff" would be a game played in August.
  //
  // ⚠ AND `Number.isFinite`, WHICH IS NOT BELT AND BRACES. `time()` returns
  // +Infinity for a kickoff it cannot parse — right for sorting, since a
  // date-less fixture belongs at the end — but `Infinity >= now` is TRUE, so
  // without this test a fixture with no date passed the filter and became the
  // next kickoff. The card would then count down to nothing. The Results tab
  // has a "Date TBD" section for these; Home has nothing useful to say.
  const future = ahead.filter((m) => {
    const t = time(m);
    return Number.isFinite(t) && t >= now.getTime();
  });
  const upcoming = future.slice(0, UPCOMING_LIMIT);
  const next = upcoming[0] ?? null;

  // Counted across every fixture still ahead, not just the five shown — a full
  // Premier League Saturday is ten games and the old code could never say so,
  // because it counted within its own `.limit(5)`.
  const nextDate = next ? new Date(next.matchDate) : null;
  const matchesToday =
    nextDate && !Number.isNaN(nextDate.getTime())
      ? future.filter((m) => {
          const d = new Date(m.matchDate);
          return !Number.isNaN(d.getTime()) && sameDay(d, nextDate);
        }).length
      : 0;

  return { live, upcoming, next, matchesToday };
}
