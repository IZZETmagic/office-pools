import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'
import { MIN_MEETINGS, summariseH2H, type H2HFixture } from '@/lib/scouting/h2h'
import { fetchCachedH2H } from '@/lib/scouting/h2hFetch'
import { buildMatchForm, type FormFixture } from '@/lib/scouting/form'
import type { ClubRef } from '@/lib/scouting/opponent'

// =============================================================
// /api/fixtures/:fixture_id/scout — the peek under the hood
// =============================================================
// What the prediction flow shows when somebody taps the binoculars on a
// fixture: how the two clubs are going AT THE ENDS THEY ARE PLAYING, and what
// usually happens when they meet.
//
// ## ⚠ ONE ROUND TRIP, BECAUSE IT IS A PEEK
//
// The sheet slides up over the picker with the member mid-decision. Two
// sequential fetches means two spinners inside one gesture, so both halves come
// back together — and either may be absent without the other failing.
//
// ## ⚠ THE TWO HALVES FAIL FOR OPPOSITE REASONS, WHICH IS WHY THERE ARE TWO
//
// Head-to-head goes missing for a PAIRING — two promoted clubs have never met
// however late in the season it is. Form goes missing for a DATE — nobody has
// played anybody in the second week of August. Between them something is nearly
// always there, and the sheet renders whichever half it got.
//
// ⚠ FORM COSTS NO PROVIDER CALLS. It is read from `league_fixtures`, which the
// sync already fills. Head-to-head costs one call per club PAIRING, cached a
// day and shared with `/h2h` through `fetchCachedH2H` — the second viewer of a
// fixture costs nothing, and so does the reverse fixture in April.
//
// ⚠ REQUIRES AUTH, THOUGH NONE OF IT IS PRIVATE. Form and head-to-head are
// public football. The guard protects the QUOTA: unauthenticated this is an
// open proxy to api-football on our key.
// =============================================================

export const dynamic = 'force-dynamic'

/**
 * A season is 380 fixtures and this asks for the two clubs' share of them —
 * about 76. The ceiling is a tripwire rather than a page size.
 *
 * ⚠ POSTGREST TRUNCATES AN UNBOUNDED `.select()` AT 1,000 ROWS SILENTLY, and a
 * form table built on a truncated page is missing games with no way to tell.
 */
const MAX_FORM_FIXTURES = 200

type ClubRow = {
  club_id: string
  name: string
  abbreviation: string
  crest_url: string | null
  external_club_id: number
}

type FixtureRow = {
  fixture_id: string
  season_id: string
  kickoff_at: string
  venue: string | null
  home_club_id: string
  away_club_id: string
  home: ClubRow | null
  away: ClubRow | null
}

const toClubRef = (c: ClubRow): ClubRef => ({
  clubId: c.club_id,
  name: c.name,
  abbreviation: c.abbreviation,
  crestUrl: c.crest_url,
})

async function handler(
  _req: NextRequest,
  { params }: { params: Promise<{ fixture_id: string }> },
) {
  const { fixture_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('league_fixtures')
    .select(
      'fixture_id, season_id, kickoff_at, venue, home_club_id, away_club_id,' +
        ' home:league_clubs!league_fixtures_home_club_id_fkey' +
        '(club_id, name, abbreviation, crest_url, external_club_id),' +
        ' away:league_clubs!league_fixtures_away_club_id_fkey' +
        '(club_id, name, abbreviation, crest_url, external_club_id)',
    )
    .eq('fixture_id', fixture_id)
    .maybeSingle()

  // ⚠ Surfaced, never swallowed. A failed read would otherwise render as "these
  // two have never met" — a statement about the football rather than about the
  // request.
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Fixture not found' }, { status: 404 })

  const fixture = data as unknown as FixtureRow
  if (!fixture.home || !fixture.away) {
    return NextResponse.json({ error: 'Fixture has no clubs' }, { status: 422 })
  }

  const homeClub = toClubRef(fixture.home)
  const awayClub = toClubRef(fixture.away)

  // ---- form, from fixtures the sync already stored --------------------------
  let form = null
  try {
    const { data: rows, error: formErr } = await admin
      .from('league_fixtures')
      .select('fixture_id, kickoff_at, home_club_id, away_club_id, home_goals, away_goals')
      .eq('season_id', fixture.season_id)
      // ⚠ BOTH CLUBS IN ONE READ. Two reads would double the round trips for a
      // sheet whose whole point is that it opens instantly.
      .or(
        `home_club_id.eq.${fixture.home_club_id},away_club_id.eq.${fixture.home_club_id},` +
          `home_club_id.eq.${fixture.away_club_id},away_club_id.eq.${fixture.away_club_id}`,
      )
      .limit(MAX_FORM_FIXTURES)

    if (formErr) throw new Error(formErr.message)
    const fixtures = (rows ?? []) as unknown as Array<{
      fixture_id: string
      kickoff_at: string
      home_club_id: string
      away_club_id: string
      home_goals: number | null
      away_goals: number | null
    }>

    if (fixtures.length >= MAX_FORM_FIXTURES) {
      throw new Error(
        `hit the ${MAX_FORM_FIXTURES}-row ceiling for fixture ${fixture_id} — ` +
          'a form table built on a truncated page is missing games silently',
      )
    }

    const asForm: FormFixture[] = fixtures.map((f) => ({
      fixtureId: f.fixture_id,
      kickoffAt: f.kickoff_at,
      homeClubId: f.home_club_id,
      awayClubId: f.away_club_id,
      homeGoals: f.home_goals,
      awayGoals: f.away_goals,
    }))

    form = buildMatchForm(asForm, {
      homeClub,
      awayClub,
      kickoffAt: fixture.kickoff_at,
    })
  } catch (e) {
    // ⚠ BEST-EFFORT, LIKE ITS SIBLING. Losing one half of the sheet is better
    // than losing the sheet.
    console.error('[scout] form unavailable for', fixture_id, '—', (e as Error).message)
  }

  // ---- head to head, shared cache with /h2h --------------------------------
  let h2h = null
  try {
    const meetings: H2HFixture[] = await fetchCachedH2H(
      fixture.home.external_club_id,
      fixture.away.external_club_id,
    )
    const summary = summariseH2H(meetings, {
      // ⚠ FROM THIS FIXTURE'S HOME CLUB'S POINT OF VIEW, wherever each meeting
      // was played. The clubs swap ends between fixtures, so reading the
      // payload's home/away columns straight through yields a complete,
      // plausible and entirely different team's record.
      homeExternalId: fixture.home.external_club_id,
      venueName: fixture.venue,
    })
    h2h = {
      summary,
      // ⚠ THE GATE TRAVELS WITH THE ANSWER, so the phone cannot carry its own
      // copy of the threshold and disagree with the match tab about it.
      enough: summary.meetings >= MIN_MEETINGS,
      minMeetings: MIN_MEETINGS,
    }
  } catch (e) {
    // The provider being unavailable is not the same as two clubs never having
    // played, and the phone must be able to tell them apart — hence null rather
    // than an empty summary.
    console.error('[scout] h2h unavailable for', fixture_id, '—', (e as Error).message)
  }

  return NextResponse.json({
    fixture: {
      fixture_id: fixture.fixture_id,
      kickoff_at: fixture.kickoff_at,
      venue: fixture.venue,
      home: homeClub,
      away: awayClub,
    },
    form,
    h2h,
  })
}

export const GET = withPerfLogging('/api/fixtures/[fixture_id]/scout', handler)
