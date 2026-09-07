import type { LeagueSeasonTable, LeagueStandingRow, ResultsMatch, ResultsTeam } from './useTournamentMatches';

// =============================================================
// The context around a league fixture — from what the app already holds
// =============================================================
// Everything here is a SELECTION over data already in memory. `/api/users/:id/fixtures`
// sends the whole season and the whole ordered table in one payload, and
// `useTournamentMatches` keeps both. So the table slice, each club's recent form
// and the earlier meeting cost no network at all — which is the only reason
// they are on a screen opened by a tap.
//
// ⚠ THE JOIN IS A CLUB UUID, NOT A NAME. `lib/league/read.ts` maps
// `home_team_id = f.home_club_id`, and `league_standings.club_id` and
// `league_fixtures.home_club_id` both reference `league_clubs(club_id)` — so a
// fixture's two clubs address their table rows directly. Matching on
// `short_name` would look like it worked and then quietly fail the day two
// clubs shorten to the same string, or a feed renames one mid-season.
//
// ⚠ PURE, AND DELIBERATELY. No hooks, no `supabase`, no `theme` — so the rules
// below can be tested without mounting anything. See `__tests__/matchContext.test.ts`.
// =============================================================

/** How many places either side of a club to keep for context. */
const NEIGHBOURS = 1;

/** How many previous results make up "form". */
export const FORM_LENGTH = 5;

/**
 * The member's table for the competition this match belongs to.
 *
 * ⚠ MATCHED ON `competitionId`, BECAUSE A MATCH CARRIES NO SEASON. `ResultsMatch`
 * has `competitionId` (the api-football league id) and no `season_id` — the
 * league adapter never had a reason to carry one. That is correct while a
 * member holds one season per competition, which is the only shape the fixtures
 * route can currently produce. The day it serves two seasons of the same
 * competition at once, this picks the wrong one and the fix is to carry
 * `season_id` through `fixtureToMatch`.
 */
export function tableForMatch(
  tables: LeagueSeasonTable[],
  match: Pick<ResultsMatch, 'competitionId'>,
): LeagueSeasonTable | null {
  if (match.competitionId === null) return null;
  return tables.find((t) => t.competition_id === match.competitionId) ?? null;
}

/** A gap in the slice, where places were skipped. Rendered as an ellipsis row. */
export type TableSliceEntry =
  | { kind: 'row'; row: LeagueStandingRow; highlight: boolean }
  | { kind: 'gap' };

/**
 * The two clubs' rows in the real table, with a place either side for context.
 *
 * Not the whole table: twenty rows under a scoreline is the Match Centre
 * screen, which is one tap away and already exists. This answers the narrower
 * question the fixture actually poses — where these two stand, and who is
 * around them.
 *
 * When the clubs are close the two windows merge into one contiguous run; when
 * they are far apart a single `gap` marker sits between them. Returns `null`
 * when either club has no row, which is the honest answer early in a season
 * before the feed publishes a table — a slice missing half the fixture is
 * worse than no slice.
 */
export function tableSlice(
  standings: LeagueStandingRow[],
  homeClubId: string | null,
  awayClubId: string | null,
): TableSliceEntry[] | null {
  if (!homeClubId || !awayClubId) return null;

  const homeIdx = standings.findIndex((r) => r.club_id === homeClubId);
  const awayIdx = standings.findIndex((r) => r.club_id === awayClubId);
  if (homeIdx === -1 || awayIdx === -1) return null;

  const keep = new Set<number>();
  for (const idx of [homeIdx, awayIdx]) {
    for (let i = idx - NEIGHBOURS; i <= idx + NEIGHBOURS; i++) {
      if (i >= 0 && i < standings.length) keep.add(i);
    }
  }

  const out: TableSliceEntry[] = [];
  let previous = -1;
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (previous !== -1 && i > previous + 1) out.push({ kind: 'gap' });
    out.push({
      kind: 'row',
      row: standings[i],
      highlight: i === homeIdx || i === awayIdx,
    });
    previous = i;
  }
  return out;
}

/** One previous result, from the club's point of view. */
export type FormResult = {
  matchId: string;
  /** Who they played. Null only if the payload lost a club, which it should not. */
  opponent: ResultsTeam | null;
  /** True when the club in question was at home. */
  wasHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  outcome: 'W' | 'D' | 'L';
  kickoff: string;
};

/**
 * A club's last completed fixtures in this competition, most recent FIRST.
 *
 * ⚠ STRICTLY BEFORE THIS MATCH, and that is the whole subtlety. Read on a
 * fixture that has already been played, "form" must mean the five games leading
 * INTO it — not the five most recent in the season, which would include the
 * match you are looking at and everything after it. A member opening last
 * month's game would otherwise be shown results from the future of that game as
 * though they were its build-up.
 *
 * Compared on epoch milliseconds rather than on the ISO strings: `match_date` is
 * `timestamptz` and the feed is free to serve a different offset per row, which
 * string comparison would order wrongly.
 */
export function clubForm(
  matches: ResultsMatch[],
  opts: {
    clubId: string | null;
    competitionId: number | null;
    /** This fixture's kickoff — the boundary. */
    beforeKickoff: string;
    limit?: number;
  },
): FormResult[] {
  const { clubId, competitionId, beforeKickoff, limit = FORM_LENGTH } = opts;
  if (!clubId || competitionId === null) return [];
  const boundary = new Date(beforeKickoff).getTime();
  if (Number.isNaN(boundary)) return [];

  return matches
    .filter((m) => {
      if (m.competitionId !== competitionId) return false;
      if (m.homeTeamId !== clubId && m.awayTeamId !== clubId) return false;
      // A score, not a status: a postponed fixture can carry `completed` and an
      // abandoned one can carry goals. Both numbers present is the only claim
      // that a result exists to read.
      if (m.homeScoreFt === null || m.awayScoreFt === null) return false;
      const t = new Date(m.matchDate).getTime();
      return !Number.isNaN(t) && t < boundary;
    })
    .sort((a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime())
    .slice(0, limit)
    .map((m) => {
      const wasHome = m.homeTeamId === clubId;
      const goalsFor = (wasHome ? m.homeScoreFt : m.awayScoreFt) as number;
      const goalsAgainst = (wasHome ? m.awayScoreFt : m.homeScoreFt) as number;
      const outcome: FormResult['outcome'] =
        goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D';
      return {
        matchId: m.matchId,
        opponent: wasHome ? m.awayTeam : m.homeTeam,
        wasHome,
        goalsFor,
        goalsAgainst,
        outcome,
        kickoff: m.matchDate,
      };
    });
}

/**
 * The last time these two met, before this match.
 *
 * ⚠ THIS SEASON ONLY, AND THE CARD MUST SAY SO. The fixtures payload is one
 * season per competition, so in a league that plays home and away this is the
 * reverse fixture and nothing else. Real head-to-head history needs
 * `/fixtures/headtohead` and somewhere to keep it; implying we have it when we
 * hold one row would be a confident wrong statement of exactly the kind the
 * blank Results tab used to make.
 */
export function earlierMeeting(
  matches: ResultsMatch[],
  match: Pick<
    ResultsMatch,
    'matchId' | 'competitionId' | 'homeTeamId' | 'awayTeamId' | 'matchDate'
  >,
): ResultsMatch | null {
  const { homeTeamId, awayTeamId, competitionId } = match;
  if (!homeTeamId || !awayTeamId || competitionId === null) return null;
  const boundary = new Date(match.matchDate).getTime();
  if (Number.isNaN(boundary)) return null;

  const pair = new Set([homeTeamId, awayTeamId]);
  return (
    matches
      .filter((m) => {
        if (m.matchId === match.matchId) return false;
        if (m.competitionId !== competitionId) return false;
        if (!m.homeTeamId || !m.awayTeamId) return false;
        if (!pair.has(m.homeTeamId) || !pair.has(m.awayTeamId)) return false;
        if (m.homeScoreFt === null || m.awayScoreFt === null) return false;
        const t = new Date(m.matchDate).getTime();
        return !Number.isNaN(t) && t < boundary;
      })
      .sort((a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime())[0] ?? null
  );
}

/**
 * The feed's own form string, as a fallback.
 *
 * `league_standings.form` is written MOST RECENT LAST ('WWDLW'), and everything
 * else here is most recent first — so it is reversed on the way out. Getting
 * this backwards prints a club's oldest result as its newest, which is
 * invisible until somebody checks it against the table.
 */
export function feedForm(row: LeagueStandingRow | undefined | null): ('W' | 'D' | 'L')[] {
  if (!row?.form) return [];
  return row.form
    .slice(-FORM_LENGTH)
    .split('')
    .reverse()
    .filter((c): c is 'W' | 'D' | 'L' => c === 'W' || c === 'D' || c === 'L');
}

/** The standings row for one club, or null. */
export function rowFor(
  table: LeagueSeasonTable | null,
  clubId: string | null,
): LeagueStandingRow | null {
  if (!table || !clubId) return null;
  return table.standings.find((r) => r.club_id === clubId) ?? null;
}
