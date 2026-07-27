// ============================================================================
// Scoped match_conduct reads.
//
// WHY THIS EXISTS: nine call sites used to read the ENTIRE match_conduct table
// with no filter and no pagination — `.from('match_conduct').select(cols)` and
// nothing else. That is two problems wearing one coat:
//
//   1. Cost. Every dashboard render, profile render, leaderboard call, analytics
//      call and mobile predictions load pulled the whole table.
//   2. Correctness, on a timer. match_conduct has NO tournament_id column, so an
//      unfiltered read is inherently cross-competition, and PostgREST silently
//      caps any un-ranged select at 1,000 rows. Today: 206 rows, fine. Premier
//      League 2026/27 adds ~760 → 966. The competition after that crosses 1,000
//      and card/conduct bonuses start scoring against SILENTLY truncated data.
//      No error, no log — just wrong bonuses.
//
// The fix scopes by tournament through the match_conduct → matches FK
// (match_conduct_match_id_fkey) so it stays a single round trip, and paginates
// so it can never be truncated. See the 1000-ROW RULE note in lib/poolData.ts.
// ============================================================================
import { fetchAllPages } from '@/lib/poolData'
import type { MatchConductData } from '@/lib/tournament'

export const MATCH_CONDUCT_COLUMNS =
  'match_id, team_id, yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards'

// Structural type — accepts the admin client or a request-scoped RLS client
// without dragging the full generated Database type through every caller.
type QueryableClient = {
  from: (table: string) => any
}

/**
 * Every conduct row for one tournament's matches. Filtered via the embedded
 * `matches` relation so the scoping happens in Postgres (one round trip, no
 * need to fetch match ids first and serialise the two calls).
 *
 * @param throwOnError true on cached paths, so a partial result is never stored.
 */
export async function fetchMatchConductForTournament(
  client: QueryableClient,
  tournamentId: string,
  throwOnError = false,
): Promise<MatchConductData[]> {
  if (!tournamentId) return []
  return fetchAllPages<MatchConductData>(
    'match_conduct',
    (from, to) =>
      client
        .from('match_conduct')
        .select(`${MATCH_CONDUCT_COLUMNS}, matches!inner(tournament_id)`)
        .eq('matches.tournament_id', tournamentId)
        .order('match_id', { ascending: true })
        .range(from, to),
    throwOnError,
  ).then((rows) =>
    // Drop the join artefact — callers expect a bare MatchConductData.
    rows.map(({ ...row }) => {
      delete (row as Record<string, unknown>).matches
      return row as MatchConductData
    }),
  )
}

/**
 * Conduct rows across several tournaments at once. For surfaces that span a
 * user's whole membership (dashboard, profile) rather than a single pool.
 */
export async function fetchMatchConductForTournaments(
  client: QueryableClient,
  tournamentIds: string[],
  throwOnError = false,
): Promise<MatchConductData[]> {
  if (tournamentIds.length === 0) return []
  return fetchAllPages<MatchConductData>(
    'match_conduct',
    (from, to) =>
      client
        .from('match_conduct')
        .select(`${MATCH_CONDUCT_COLUMNS}, matches!inner(tournament_id)`)
        .in('matches.tournament_id', tournamentIds)
        .order('match_id', { ascending: true })
        .range(from, to),
    throwOnError,
  ).then((rows) =>
    rows.map(({ ...row }) => {
      delete (row as Record<string, unknown>).matches
      return row as MatchConductData
    }),
  )
}

/**
 * Conduct rows for an explicit set of match ids. Use when the caller already has
 * the matches in hand (avoids re-deriving the tournament) — e.g. lib/poolData.
 */
export async function fetchMatchConductForMatches(
  client: QueryableClient,
  matchIds: string[],
  throwOnError = false,
): Promise<MatchConductData[]> {
  if (matchIds.length === 0) return []
  return fetchAllPages<MatchConductData>(
    'match_conduct',
    (from, to) =>
      client
        .from('match_conduct')
        .select(MATCH_CONDUCT_COLUMNS)
        .in('match_id', matchIds)
        .order('match_id', { ascending: true })
        .range(from, to),
    throwOnError,
  )
}
