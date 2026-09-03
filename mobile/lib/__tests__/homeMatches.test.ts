// =============================================================
// What the Home screen says is on
// =============================================================
// This replaced two `matches` reads that were wrong in two directions at once:
// they could not see a league fixture (it is not in that table), and they were
// not filtered by tournament (so a second competition would have shown on every
// member's home screen). Neither failed loudly.
//
// The reads also got two things for free from the database that this now has to
// do for itself, and both are pinned below: only future fixtures count as
// "next", and `matchesToday` is counted across everything still ahead rather
// than inside the five that are displayed.
// =============================================================

import { describe, it, expect } from 'vitest';
import { homeMatchesFrom, UPCOMING_LIMIT } from '../homeMatches';
import type { ResultsMatch } from '../useTournamentMatches';

const NOW = new Date('2026-11-28T12:00:00.000Z');

const m = (o: Partial<ResultsMatch> & { matchId: string; matchDate: string }): ResultsMatch => ({
  matchNumber: 1,
  stage: 'regular_season',
  groupLetter: null,
  status: 'scheduled',
  statusDetail: null,
  originalMatchDate: null,
  venue: null,
  homeTeamId: 'h',
  awayTeamId: 'a',
  homeScoreFt: null,
  awayScoreFt: null,
  homeScorePso: null,
  awayScorePso: null,
  liveMinute: null,
  livePeriod: null,
  liveAdded: null,
  homeTeamPlaceholder: null,
  awayTeamPlaceholder: null,
  homeTeam: null,
  awayTeam: null,
  roundNumber: 13,
  competition: 'Premier League',
  competitionId: 39,
  ...o,
});

describe('homeMatchesFrom', () => {
  it('finds the next kickoff among league fixtures — the whole point', () => {
    const { next } = homeMatchesFrom(
      [
        m({ matchId: 'sun', matchDate: '2026-11-29T16:30:00.000Z' }),
        m({ matchId: 'sat', matchDate: '2026-11-28T15:00:00.000Z' }),
      ],
      NOW,
    );
    expect(next?.matchId).toBe('sat');
  });

  it('ignores what has already been played', () => {
    // ⚠ The merged list is the WHOLE season, past included — the old read got
    // this from the database. Without it "next kickoff" is a game in August.
    const { next, upcoming } = homeMatchesFrom(
      [
        m({ matchId: 'august', matchDate: '2026-08-15T15:00:00.000Z', status: 'completed' }),
        m({ matchId: 'gone', matchDate: '2026-11-28T11:00:00.000Z' }),
        m({ matchId: 'later', matchDate: '2026-11-28T15:00:00.000Z' }),
      ],
      NOW,
    );
    expect(next?.matchId).toBe('later');
    expect(upcoming.map((x) => x.matchId)).toEqual(['later']);
  });

  it('counts a full Saturday, not just the fixtures it displays', () => {
    // Ten games on one day, five shown. The old code counted inside its own
    // `.limit(5)` and could never say "10".
    const saturday = Array.from({ length: 10 }, (_, i) =>
      m({ matchId: `s${i}`, matchDate: `2026-11-28T${14 + (i % 6)}:00:00.000Z` }),
    );
    const { matchesToday, upcoming } = homeMatchesFrom(saturday, NOW);
    expect(matchesToday).toBe(10);
    expect(upcoming).toHaveLength(UPCOMING_LIMIT);
  });

  it('does not count tomorrow as today', () => {
    const { matchesToday } = homeMatchesFrom(
      [
        m({ matchId: 'sat', matchDate: '2026-11-28T15:00:00.000Z' }),
        m({ matchId: 'sun', matchDate: '2026-11-29T16:30:00.000Z' }),
      ],
      NOW,
    );
    expect(matchesToday).toBe(1);
  });

  it('takes both status words — the World Cup writes two, a league writes one', () => {
    // `league_fixtures_status_ck` only allows `scheduled`; `matches` also holds
    // `upcoming`. Dropping either would hide one competition's fixtures.
    const { upcoming } = homeMatchesFrom(
      [
        m({ matchId: 'wc', matchDate: '2026-11-28T18:00:00.000Z', status: 'upcoming' }),
        m({ matchId: 'pl', matchDate: '2026-11-28T15:00:00.000Z', status: 'scheduled' }),
      ],
      NOW,
    );
    expect(upcoming.map((x) => x.matchId)).toEqual(['pl', 'wc']);
  });

  it('surfaces every live game, soonest first', () => {
    const { live } = homeMatchesFrom(
      [
        m({ matchId: 'b', matchDate: '2026-11-28T15:00:00.000Z', status: 'live' }),
        m({ matchId: 'a', matchDate: '2026-11-28T12:30:00.000Z', status: 'live' }),
        m({ matchId: 'c', matchDate: '2026-11-28T17:30:00.000Z' }),
      ],
      NOW,
    );
    expect(live.map((x) => x.matchId)).toEqual(['a', 'b']);
  });

  it('says nothing rather than something wrong when the season is over', () => {
    const { next, matchesToday, upcoming } = homeMatchesFrom(
      [m({ matchId: 'done', matchDate: '2026-08-15T15:00:00.000Z', status: 'completed' })],
      NOW,
    );
    expect(next).toBeNull();
    expect(matchesToday).toBe(0);
    expect(upcoming).toEqual([]);
  });

  it('does not throw on an unparseable kickoff', () => {
    const { next } = homeMatchesFrom([m({ matchId: 'tbd', matchDate: '' })], NOW);
    // Sorted last and never chosen as "next" — a fixture with no date is not
    // the next thing on.
    expect(next).toBeNull();
  });
});
