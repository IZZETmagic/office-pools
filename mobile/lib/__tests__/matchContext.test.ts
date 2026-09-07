// =============================================================
// The context around a league fixture
// =============================================================
// `lib/matchContext.ts` is a set of selections over data the app already holds,
// and every one of them has a way of being subtly wrong that renders perfectly:
// a form list that includes the match you are looking at, a table ordered by
// who is at home rather than who is higher, a feed string read back to front.
// None of those throw. They just state something false, confidently, which is the failure
// class this whole surface keeps running into.
//
// So the assertions below are about MEANING, not shape.
// =============================================================

import { describe, it, expect } from 'vitest';

import {
  clubForm,
  earlierMeeting,
  feedForm,
  rowFor,
  tableForMatch,
  twoClubRows,
} from '../matchContext';
import type {
  LeagueSeasonTable,
  LeagueStandingRow,
  ResultsMatch,
} from '../useTournamentMatches';

const PL = 39;
const LALIGA = 140;

function standing(rank: number, clubId: string, over: Partial<LeagueStandingRow> = {}): LeagueStandingRow {
  return {
    club_id: clubId,
    club_name: clubId,
    short_name: clubId,
    crest_url: null,
    rank,
    played: 10,
    won: 5,
    drawn: 2,
    lost: 3,
    goals_for: 15,
    goals_against: 12,
    goals_diff: 3,
    points: 17,
    form: null,
    movement: null,
    band: null,
    ...over,
  };
}

/** A twenty-club table, ranks 1..20, club ids "c1".."c20". */
const TABLE: LeagueStandingRow[] = Array.from({ length: 20 }, (_, i) => standing(i + 1, `c${i + 1}`));

function match(over: Partial<ResultsMatch> = {}): ResultsMatch {
  return {
    matchId: 'm',
    matchNumber: 1,
    stage: 'regular_season',
    groupLetter: null,
    matchDate: '2026-09-05T14:00:00.000Z',
    status: 'completed',
    statusDetail: null,
    originalMatchDate: null,
    venue: null,
    homeTeamId: 'c1',
    awayTeamId: 'c2',
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
    roundNumber: 4,
    competition: 'Premier League',
    competitionId: PL,
    ...over,
  };
}

// ------------------------------------------------------- the two table rows

describe('twoClubRows', () => {
  it('⚠ returns the HIGHER PLACED club first, not the home one', () => {
    // A table is ordered by position. Ordering by home/away would silently
    // reorder the league for half of all fixtures.
    expect(twoClubRows(TABLE, 'c9', 'c4')!.map((r) => r.rank)).toEqual([4, 9]);
    expect(twoClubRows(TABLE, 'c4', 'c9')!.map((r) => r.rank)).toEqual([4, 9]);
  });

  it('returns exactly the two clubs playing, and nobody else', () => {
    const rows = twoClubRows(TABLE, 'c4', 'c5')!;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.club_id)).toEqual(['c4', 'c5']);
  });

  it('⚠ orders on the feed\'s rank, never on points', () => {
    // A club docked points still holds its published position, and a table
    // derived from points cannot see the deduction. Rank 3 has fewer points
    // here and must still come first.
    const docked = [
      standing(3, 'docked', { points: 1 }),
      standing(8, 'clean', { points: 40 }),
    ];
    expect(twoClubRows(docked, 'clean', 'docked')!.map((r) => r.club_id)).toEqual([
      'docked',
      'clean',
    ]);
  });

  it('is null when a club has no row — half a fixture is worse than none', () => {
    // Early season, before the feed publishes a table.
    expect(twoClubRows(TABLE, 'c4', 'not-in-the-table')).toBeNull();
    expect(twoClubRows(TABLE, null, 'c4')).toBeNull();
    expect(twoClubRows(TABLE, 'c4', null)).toBeNull();
    expect(twoClubRows([], 'c4', 'c5')).toBeNull();
  });
});

// ------------------------------------------------------------------- the form

describe('clubForm', () => {
  const season: ResultsMatch[] = [
    // c1's season: four played, one of them AFTER the match in question.
    match({ matchId: 'a', matchDate: '2026-08-01T14:00:00Z', homeTeamId: 'c1', awayTeamId: 'c9', homeScoreFt: 3, awayScoreFt: 0 }),
    match({ matchId: 'b', matchDate: '2026-08-08T14:00:00Z', homeTeamId: 'c7', awayTeamId: 'c1', homeScoreFt: 2, awayScoreFt: 2 }),
    match({ matchId: 'c', matchDate: '2026-08-15T14:00:00Z', homeTeamId: 'c1', awayTeamId: 'c5', homeScoreFt: 0, awayScoreFt: 1 }),
    match({ matchId: 'later', matchDate: '2026-09-12T14:00:00Z', homeTeamId: 'c1', awayTeamId: 'c3', homeScoreFt: 4, awayScoreFt: 0 }),
    // Not played yet.
    match({ matchId: 'unplayed', matchDate: '2026-08-20T14:00:00Z', homeTeamId: 'c1', awayTeamId: 'c8', homeScoreFt: null, awayScoreFt: null }),
    // A different competition entirely.
    match({ matchId: 'other-comp', matchDate: '2026-08-22T14:00:00Z', competitionId: LALIGA, homeTeamId: 'c1', awayTeamId: 'c4', homeScoreFt: 5, awayScoreFt: 0 }),
  ];
  const opts = { clubId: 'c1', competitionId: PL, beforeKickoff: '2026-09-05T14:00:00Z' };

  it('is most recent FIRST', () => {
    expect(clubForm(season, opts).map((r) => r.matchId)).toEqual(['c', 'b', 'a']);
  });

  it('⚠ excludes anything after this fixture — form is the run INTO the match', () => {
    // Opening last month's game must not show results from that game's future
    // as though they were its build-up.
    expect(clubForm(season, opts).map((r) => r.matchId)).not.toContain('later');
  });

  it('ignores unplayed fixtures and other competitions', () => {
    const ids = clubForm(season, opts).map((r) => r.matchId);
    expect(ids).not.toContain('unplayed');
    expect(ids).not.toContain('other-comp');
  });

  it('reads the outcome from the CLUB\'s side, home or away', () => {
    const [loss, draw, win] = clubForm(season, opts);
    // c: c1 at home, lost 0-1.
    expect(loss).toMatchObject({ outcome: 'L', wasHome: true, goalsFor: 0, goalsAgainst: 1 });
    // b: c1 AWAY at c7, drew 2-2 — the goals must not be flipped.
    expect(draw).toMatchObject({ outcome: 'D', wasHome: false, goalsFor: 2, goalsAgainst: 2 });
    // a: c1 at home, won 3-0.
    expect(win).toMatchObject({ outcome: 'W', wasHome: true, goalsFor: 3, goalsAgainst: 0 });
  });

  it('reads an away win as a win, not a loss', () => {
    const awayWin = [
      match({ matchId: 'aw', matchDate: '2026-08-02T14:00:00Z', homeTeamId: 'c7', awayTeamId: 'c1', homeScoreFt: 1, awayScoreFt: 3 }),
    ];
    expect(clubForm(awayWin, opts)[0]).toMatchObject({ outcome: 'W', goalsFor: 3, goalsAgainst: 1 });
  });

  it('caps at five', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      match({
        matchId: `x${i}`,
        matchDate: `2026-0${i < 4 ? 7 : 8}-${String((i % 4) + 1).padStart(2, '0')}T14:00:00Z`,
        homeTeamId: 'c1',
        awayTeamId: `c${i + 3}`,
        homeScoreFt: 1,
        awayScoreFt: 0,
      }),
    );
    expect(clubForm(many, opts)).toHaveLength(5);
  });

  it('is empty rather than throwing when there is no club or no competition', () => {
    expect(clubForm(season, { ...opts, clubId: null })).toEqual([]);
    expect(clubForm(season, { ...opts, competitionId: null })).toEqual([]);
  });
});

// -------------------------------------------------------- the earlier meeting

describe('earlierMeeting', () => {
  const here = match({
    matchId: 'this-one',
    matchDate: '2026-09-05T14:00:00Z',
    homeTeamId: 'c1',
    awayTeamId: 'c2',
  });

  it('finds the reverse fixture, with the clubs the other way round', () => {
    const season = [
      here,
      match({ matchId: 'reverse', matchDate: '2026-02-01T14:00:00Z', homeTeamId: 'c2', awayTeamId: 'c1', homeScoreFt: 1, awayScoreFt: 2 }),
    ];
    expect(earlierMeeting(season, here)?.matchId).toBe('reverse');
  });

  it('never returns the match itself', () => {
    expect(earlierMeeting([{ ...here, homeScoreFt: 1, awayScoreFt: 1 }], here)).toBeNull();
  });

  it('ignores games involving only one of the two clubs', () => {
    const season = [
      here,
      match({ matchId: 'c1-v-c9', matchDate: '2026-02-01T14:00:00Z', homeTeamId: 'c1', awayTeamId: 'c9', homeScoreFt: 1, awayScoreFt: 0 }),
    ];
    expect(earlierMeeting(season, here)).toBeNull();
  });

  it('takes the most recent when there is more than one, and only played ones', () => {
    const season = [
      here,
      match({ matchId: 'old', matchDate: '2026-01-01T14:00:00Z', homeTeamId: 'c2', awayTeamId: 'c1', homeScoreFt: 0, awayScoreFt: 0 }),
      match({ matchId: 'recent', matchDate: '2026-03-01T14:00:00Z', homeTeamId: 'c2', awayTeamId: 'c1', homeScoreFt: 1, awayScoreFt: 2 }),
      match({ matchId: 'unplayed', matchDate: '2026-04-01T14:00:00Z', homeTeamId: 'c2', awayTeamId: 'c1', homeScoreFt: null, awayScoreFt: null }),
    ];
    expect(earlierMeeting(season, here)?.matchId).toBe('recent');
  });
});

// -------------------------------------------------------------- the feed form

describe('feedForm', () => {
  it('⚠ reverses the feed string — it is written most recent LAST', () => {
    // `league_standings.form` is 'WWDLW' with the newest result at the end,
    // and everything else on this screen is newest first. Reading it as-is
    // prints a club's oldest result as its most recent.
    expect(feedForm(standing(1, 'c1', { form: 'WWDLW' }))).toEqual(['W', 'L', 'D', 'W', 'W']);
  });

  it('takes only the last five, then reverses', () => {
    expect(feedForm(standing(1, 'c1', { form: 'LLLWWDLW' }))).toEqual(['W', 'L', 'D', 'W', 'W']);
  });

  it('is empty for a club with no form yet', () => {
    expect(feedForm(standing(1, 'c1', { form: null }))).toEqual([]);
    expect(feedForm(null)).toEqual([]);
    expect(feedForm(undefined)).toEqual([]);
  });

  it('drops characters that are not a result', () => {
    expect(feedForm(standing(1, 'c1', { form: 'W-D' }))).toEqual(['D', 'W']);
  });
});

// ------------------------------------------------------------- table matching

describe('tableForMatch / rowFor', () => {
  const tables: LeagueSeasonTable[] = [
    { season_id: 's-pl', competition: 'Premier League', competition_id: PL, standings: TABLE, standings_fetched_at: null },
    { season_id: 's-ll', competition: 'La Liga', competition_id: LALIGA, standings: [], standings_fetched_at: null },
  ];

  it('picks the table for the match\'s own competition', () => {
    expect(tableForMatch(tables, { competitionId: PL })?.season_id).toBe('s-pl');
    expect(tableForMatch(tables, { competitionId: LALIGA })?.season_id).toBe('s-ll');
  });

  it('is null for a World Cup match, which has no competition id', () => {
    expect(tableForMatch(tables, { competitionId: null })).toBeNull();
  });

  it('is null for a competition the member holds no table for', () => {
    expect(tableForMatch(tables, { competitionId: 78 })).toBeNull();
  });

  it('rowFor finds a club by uuid, and is null when it is absent', () => {
    const t = tableForMatch(tables, { competitionId: PL });
    expect(rowFor(t, 'c7')?.rank).toBe(7);
    expect(rowFor(t, 'nope')).toBeNull();
    expect(rowFor(null, 'c7')).toBeNull();
  });
});
