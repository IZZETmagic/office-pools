// =============================================================
// ONE MATCHWEEK'S FIXTURES, IN THE SHAPE THE DUEL SURFACES READ
// =============================================================
// `view.matches` carries the whole season in the World Cup `Match` shape, with
// the league's own facts reused positionally — `country_code` holds the club's
// three-letter abbreviation, `flag_url` its crest. That mapping was written
// inline in `page.tsx` for the ONE week being played, which is all the Duel tab
// ever needed.
//
// ⚠ THE ROOM NEEDS ANY REVEALED WEEK, WHICH IS WHY THIS MOVED. Walking back
// through the season is the whole of that screen, and a second copy of this
// mapping is a second place to get `country_code` wrong — a trap that has
// already cost a round trip on the phone, where a sheet asking for codes
// rendered full names and looked simply unfixed.
//
// ⚠ NO NEW PAYLOAD. `view.matches` is ALREADY sent to the client for the
// Results tab, so the Room filters rows the browser is holding either way. It
// deliberately does not ask the server for a week's fixtures: that would be a
// per-week round trip for data already in memory, on a screen whose entire
// interaction is changing the week.
//
// ⚠ NOTHING HERE IS REVEAL-GATED, AND NOTHING HERE NEEDS TO BE. Fixtures are
// the league's own schedule — public football. What the seal withholds is who
// you are PLAYING (migration 116, in RLS, over `league_duels`) and whose picks
// you may read (`/bulk`). A fixture list gives away neither.

import { shortClubName } from './clubName'

/**
 * The fields this reads off a season match.
 *
 * ⚠ STRUCTURAL, NOT THE `Match` TYPE ITSELF. `Match` lives in the pool page's
 * own types and carries thirty fields this does not touch; naming the eleven it
 * does keeps the module out of that dependency and makes the positional reuse
 * (`country_code`, `flag_url`) impossible to miss.
 */
export type SeasonMatch = {
  match_id: string
  match_number: number
  round_number: number | null
  match_date: string
  /** ⚠ `country_code` IS THE CLUB'S ABBREVIATION on the league path, and
   *  `country_name` its name — see `clubToTeam` in `lib/league/read.ts`. */
  home_team?: { country_name?: string | null; country_code?: string | null; flag_url?: string | null } | null
  away_team?: { country_name?: string | null; country_code?: string | null; flag_url?: string | null } | null
  home_score_ft: number | null
  away_score_ft: number | null
  is_completed: boolean
  status: string
  live_minute: number | null
  live_period: string | null
  live_added: number | null
}

/** The duel surfaces' fixture shape. Mirrors `MatchweekFixture` in PoolDetail. */
export type MatchweekFixtureRow = {
  id: string
  number: number
  homeName: string
  awayName: string
  homeAbbr: string
  awayAbbr: string
  homeCrest: string | null
  awayCrest: string | null
  homeScore: number | null
  awayScore: number | null
  kickoffAt: string
  isCompleted: boolean
  status: string
  liveMinute: number | null
  livePeriod: string | null
  liveAdded: number | null
}

/**
 * Every fixture of one matchweek, in `fixture_number` order.
 *
 * @param matchweek  `round_number`, which on the league path IS the matchweek.
 */
export function matchweekFixtures(
  matches: SeasonMatch[],
  matchweek: number,
): MatchweekFixtureRow[] {
  return matches
    .filter((m) => m.round_number === matchweek)
    .map((m) => ({
      id: m.match_id,
      number: m.match_number,
      // ⚠ SHORT names, and the two sides kept APART rather than pre-joined into
      // "A v B". Every consumer renders them symmetrically around the v with a
      // crest each, so a single string would have to be split back open.
      //
      // `shortClubName` because at 375px "Crystal Palace v Manchester City"
      // truncated — eating the half that tells City from United.
      homeName: shortClubName(m.home_team?.country_name ?? 'Home'),
      awayName: shortClubName(m.away_team?.country_name ?? 'Away'),
      // ⚠ `country_code`, NOT a shortened name. This is the char(3) code out of
      // `league_clubs.abbreviation` — 'ARS', 'NFO' — and it is blank-padded, so
      // it is trimmed. `short_name` next to it in the same object is a shortened
      // NAME ("Nott'm Forest"); both field names sound like the answer and only
      // one is.
      homeAbbr: (m.home_team?.country_code ?? '').trim(),
      awayAbbr: (m.away_team?.country_code ?? '').trim(),
      homeCrest: m.home_team?.flag_url ?? null,
      awayCrest: m.away_team?.flag_url ?? null,
      // The real result. Present while a match is LIVE too, which is what lets
      // a breakdown carry a moving score.
      homeScore: m.home_score_ft,
      awayScore: m.away_score_ft,
      kickoffAt: m.match_date,
      isCompleted: m.is_completed,
      status: m.status,
      liveMinute: m.live_minute,
      livePeriod: m.live_period,
      liveAdded: m.live_added,
    }))
    .sort((a, b) => a.number - b.number)
}
