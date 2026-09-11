import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'
import { MIN_MEETINGS, summariseH2H, type H2HFixture } from '@/lib/scouting/h2h'
import { fetchCachedH2H } from '@/lib/scouting/h2hFetch'

// =============================================================
// /api/fixtures/:fixture_id/h2h — the scout report
// =============================================================
// Every previous meeting between the two clubs, reduced to the handful of
// figures worth showing beside a fixture.
//
// ## Why it has to be a route
//
// `API_FOOTBALL_KEY` is server-side and always will be, so the phone cannot ask
// the provider itself. Unlike `/api/users/:id/fixture-picks` there is nothing
// private here — a head-to-head record is public football — so the guard below
// is not protecting data.
//
// ⚠ IT IS PROTECTING THE QUOTA. Unauthenticated, this is an open proxy to
// api-football on our key: anyone could walk every club pairing and burn the
// 7,500/day plan the fixture sync depends on. `requireAuth` and nothing more.
//
// ## The cost, and why it is small
//
// One provider call per PAIRING, and a pairing's history only changes when the
// two clubs play again. Twenty clubs is 190 pairings, so a whole Premier League
// season's scout reports cost 190 calls — and the cache below means the second
// viewer of a fixture costs nothing.
//
// ⚠ CACHED ON THE CLUB PAIR, NOT THE FIXTURE. The reverse fixture in April has
// the same history as this one, and so does every future meeting; keying on
// `fixture_id` would fetch the same rows again under a different name. The pair
// is ordered low-high before it becomes a key so Arsenal-Chelsea and
// Chelsea-Arsenal are one entry rather than two.
//
// ⚠ WHAT IS DELIBERATELY ABSENT: average possession, shots and xG. They are not
// in the h2h payload and would need one `/fixtures/statistics` call per historic
// meeting — around 8,700 to cover one league's pairings — for numbers that age
// far worse than results do. See `lib/scouting/h2h.ts`.
// =============================================================

export const dynamic = 'force-dynamic'

type FixtureRow = {
  venue: string | null
  home: { external_club_id: number; name: string } | null
  away: { external_club_id: number; name: string } | null
}

/*
 * ⚠ `normalise` AND `cachedH2H` MOVED TO `lib/scouting/h2hFetch.ts` so the
 * match scout sheet can ask the same question without a second cache entry or
 * a second copy of the provider's field names. Two routes each building their
 * own key would double the provider spend on one answer.
 */

async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ fixture_id: string }> },
) {
  const { fixture_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('league_fixtures')
    .select(
      'venue,' +
        ' home:league_clubs!league_fixtures_home_club_id_fkey(external_club_id, name),' +
        ' away:league_clubs!league_fixtures_away_club_id_fkey(external_club_id, name)',
    )
    .eq('fixture_id', fixture_id)
    .maybeSingle()
  // ⚠ Surfaced, never swallowed. A failed read here would otherwise render as
  // "these two have never met", which is a statement about the football rather
  // than about the request.
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Fixture not found' }, { status: 404 })

  const row = data as unknown as FixtureRow
  const homeId = row.home?.external_club_id
  const awayId = row.away?.external_club_id
  if (!homeId || !awayId) {
    return NextResponse.json({ error: 'Fixture has no provider clubs' }, { status: 422 })
  }

  let meetings: H2HFixture[]
  try {
    meetings = await fetchCachedH2H(homeId, awayId)
  } catch (err) {
    // The provider being unavailable is not the same as two clubs never having
    // played, and the phone must be able to tell them apart.
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }

  const summary = summariseH2H(meetings, {
    homeExternalId: homeId,
    venueName: row.venue,
  })

  return NextResponse.json({
    summary,
    homeName: row.home?.name ?? null,
    awayName: row.away?.name ?? null,
    // ⚠ THE GATE TRAVELS WITH THE ANSWER. The phone decides whether to offer a
    // Scouting tab at all, and it must not carry its own copy of the threshold —
    // two clubs with three meetings would get a tab on one surface and not the
    // other the day either number moved.
    enough: summary.meetings >= MIN_MEETINGS,
    minMeetings: MIN_MEETINGS,
  })
}

export const GET = withPerfLogging('fixtures/h2h', handleGET)
