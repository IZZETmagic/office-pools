import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'
import { readLeagueSeasonMatches } from '@/lib/league/read'
import { getLeagueSeasonCached } from '@/lib/league/season'

// =============================================================
// /api/users/:user_id/fixtures — THE FOOTBALL, FOR A PHONE
// =============================================================
// A member of a Premier League pool opens the Expo app and sees no football at
// all. Not an error — a confident blank, three times over:
//
//   Results tab    `useTournamentMatches` selects `matches` by `tournament_id`.
//                  A league pool keeps a populated `tournament_id` (054b), but
//                  nothing on the league path ever writes a `matches` row, so
//                  the query is well-formed and returns nothing.
//   Home           `useHomeData` reads `matches` for live + scheduled. The World
//                  Cup finished 16 Jul 2026, so both are empty: no live match,
//                  no next kickoff, "0 matches today" — on a Saturday with ten
//                  Premier League games to come.
//   Match detail   reads `matches` by `match_id`; a fixture id is a valid uuid
//                  matching no row, so the screen says "Match not found".
//
// This is the defect the web dashboard carried until `readLeagueDashboardFixtures`
// fixed it, one surface later. Its test file names the failure mode: *an empty
// result is a valid one.*
//
// ## Why a route rather than the phone reading the tables
//
// Unlike the four engine tables migration 050 closed to clients, the three
// calendar tables are world-readable — `league_seasons`, `league_clubs`,
// `league_fixtures` all carry `USING (true)` (050:383-386). So a direct read
// from the phone would *work*, and this route is not defending against a silent
// empty array the way `/api/pools/:id/league` is.
//
// It exists for the other reason: the SHAPING. A league fixture is rendered by
// components written for national teams, so the club's name travels in
// `country_name`, its abbreviation in `country_code` and its crest in
// `flag_url`. Every one of those is positional, which means a mis-mapped key
// renders a crestless card reading "TBD" rather than throwing. That mapping is
// already written and tested once, in `fixtureToMatch`. A second hand-kept copy
// inside `mobile/` is the drift this avoids — and mobile is a separate npm
// project that cannot import the first copy.
//
// ⚠ IT IS LEAGUE-ONLY, ON PURPOSE. World Cup matches keep their existing direct
// read and the phone merges the two lists. Re-plumbing a path that works buys
// nothing here.
//
// ## What it costs, and why the whole season
//
// The season half comes from `getLeagueSeasonCached` — one entry shared by
// every pool playing that season, invalidated off the fixture sync's own
// `changed` array. So the marginal cost of an extra viewer is a cache hit and
// the shaping, not 380 rows through RLS.
//
// The whole season, not a window, because the Results tab filters by date, by
// matchweek and by team, and each of those needs the full set — a windowed read
// would make two of the three lie.
//
// ⚠ DO NOT POLL IT. Score, status and minute reach an open screen on the
// `pool:{id}:leaderboard` broadcast (migration 125), applied straight from the
// payload with no fetch. This is what a screen needs when it OPENS. A
// `refetchInterval` on a season payload would be the most expensive line in the
// app — the same warning `/api/pools/:id/league` carries.
// =============================================================

export const dynamic = 'force-dynamic'

type MembershipRow = {
  pool_id: string
  pools: {
    tournament_id: string | null
    league_season_id: string | null
    status: string | null
    archived_at: string | null
  } | null
}

async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ user_id: string }> },
) {
  const { user_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { userData } = auth.data

  // Caller can only fetch their own fixtures (super admins may inspect any) —
  // the same guard `home-scoring` uses, and for the same reason: the read below
  // runs as the service role.
  if (userData.user_id !== user_id && !userData.is_super_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()

  const { data: rows, error } = await admin
    .from('pool_members')
    .select('pool_id, pools(tournament_id, league_season_id, status, archived_at)')
    .eq('user_id', user_id)
  // ⚠ Surfaced, never swallowed. `const { data } = await …` here would turn a
  // failed read into an empty fixture list rendered as "no matches" — which is
  // the precise bug this route was written to end.
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ⚠ NARROWER THAN "every pool the member is in", and deliberately so. This
  // answers "what football is on for me", and a completed or archived pool has
  // no answer to it. `app/dashboard/page.tsx` draws the same line for the same
  // reason — and note it is NOT the set that feeds scoring, which has to keep
  // covering finished pools or their scores stop rendering.
  const memberships = (rows ?? []) as unknown as MembershipRow[]
  const active = memberships.filter(
    (m) => m.pools?.status === 'open' && !m.pools?.archived_at && m.pools?.league_season_id,
  )

  // One entry per season, with a tournament id to stamp on its fixtures. A
  // season is normally played by several of the member's pools; they share the
  // league's placeholder `tournaments` row, and the field is unread on this
  // path anyway — the phone's `ResultsMatch` has no tournament at all.
  const tournamentBySeason = new Map<string, string>()
  for (const m of active) {
    const seasonId = m.pools!.league_season_id!
    if (!tournamentBySeason.has(seasonId)) {
      tournamentBySeason.set(seasonId, m.pools!.tournament_id ?? '')
    }
  }

  if (tournamentBySeason.size === 0) {
    return NextResponse.json({ seasons: [] })
  }

  const seasonIds = [...tournamentBySeason.keys()]
  // ⚠ `external_league_id` COMES WITH THE NAME, and it is not decoration. It is
  // the key the whole competition design system is cut on — colour, mark and
  // crest URL are all `Record<number, …>` on this id, on both clients, so that
  // they cannot come apart (`lib/design/competitionColor.ts`). A caption alone
  // would force the phone to map a display STRING back to a brand, which is the
  // kind of positional guess this route exists to stop.
  const { data: seasonRows, error: seasonErr } = await admin
    .from('league_seasons')
    .select('season_id, competition_name, external_league_id')
    .in('season_id', seasonIds)
    .returns<Array<{ season_id: string; competition_name: string; external_league_id: number }>>()
  if (seasonErr) {
    return NextResponse.json({ error: seasonErr.message }, { status: 500 })
  }
  const competitionBySeason = new Map((seasonRows ?? []).map((s) => [s.season_id, s.competition_name]))
  const leagueIdBySeason = new Map((seasonRows ?? []).map((s) => [s.season_id, s.external_league_id]))

  const seasons: Array<{
    season_id: string
    competition: string | null
    competition_id: number | null
    matches: unknown[]
  }> = []
  for (const [seasonId, tournamentId] of tournamentBySeason) {
    let season
    try {
      season = await getLeagueSeasonCached(seasonId)
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 })
    }

    const { matches, error: shapeErr } = readLeagueSeasonMatches(season, tournamentId)
    // A season whose fixtures cannot be placed in a matchweek is a broken
    // season, not an empty one. Saying so beats rendering it as no football.
    if (shapeErr) {
      return NextResponse.json({ error: `season ${seasonId}: ${shapeErr}` }, { status: 502 })
    }

    seasons.push({
      season_id: seasonId,
      // The caption. Two crests with no wording cannot say which competition a
      // game belongs to, and a member can be in a Premier League pool and a La
      // Liga one at the same time.
      competition: competitionBySeason.get(seasonId) ?? null,
      // The same competition, as the id everything is themed on. Nullable only
      // because the map lookup is — the column itself is `integer NOT NULL`.
      competition_id: leagueIdBySeason.get(seasonId) ?? null,
      matches,
    })
  }

  return NextResponse.json({ seasons })
}

export const GET = withPerfLogging('users/fixtures', handleGET)
