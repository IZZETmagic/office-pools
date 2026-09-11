import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'
import { MIN_MEETINGS, summariseH2H, type H2HFixture } from '@/lib/scouting/h2h'
import { fetchCachedH2H } from '@/lib/scouting/h2hFetch'
import { buildMatchForm, type FormFixture } from '@/lib/scouting/form'
import { scoutSide, type SideScout } from '@/lib/scouting/players'
import { readClubPlayerForm } from '@/lib/scouting/readPlayers'
import { readCrowdSplit } from '@/lib/scouting/readOpponent'
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

  /**
   * ⚠⚠ THE THREE HALVES RUN CONCURRENTLY, AND THAT IS THE PRODUCT.
   *
   * They were sequential and the sheet paid the sum: the form read, then six
   * bounded reads for the people — measured at 590–750ms across four real
   * fixtures — then the head-to-head. A sheet whose stated premise is a quick
   * peek cannot spend a second and a half assembling itself, and nothing here
   * depends on anything else, so the wait is now the slowest branch rather than
   * all three added up.
   *
   * ⚠ EACH BRANCH OWNS ITS OWN FAILURE. `Promise.all` rejects on the FIRST
   * rejection, which would take the whole sheet down with one slow table — so
   * every branch resolves to null instead. Losing one card beats losing the
   * sheet, and each card already says when it is the one that is missing.
   */
  const [form, people, crowd, h2h] = await Promise.all([
    readForm(admin, fixture, homeClub, awayClub).catch((e) => {
      console.error('[scout] form unavailable for', fixture_id, '—', (e as Error).message)
      return null
    }),
    readPeople(admin, fixture).catch((e) => {
      console.error('[scout] player form unavailable for', fixture_id, '—', (e as Error).message)
      return null
    }),
    /**
     * How the whole platform called this fixture.
     *
     * ⚠⚠ PLATFORM-WIDE AND ANONYMOUS, NEVER THIS VIEWER'S POOL.
     * `league_crowd_majority` takes no pool argument precisely so it cannot be
     * narrowed by accident, and it refuses any fixture picked by fewer than
     * three distinct pools — twelve picks can be twelve members of one pool,
     * and reporting that back to one of them is the leak the weekly reveal and
     * the sealed draw exist to stop.
     *
     * ⚠ BEST-EFFORT, AND ITS ABSENCE IS SILENT. Migration 142 must be applied
     * before this returns anything; without it the card simply does not appear.
     */
    readCrowdSplit(admin, [fixture_id])
      .then((m) => m.get(fixture_id) ?? null)
      .catch((e) => {
        console.error('[scout] crowd unavailable for', fixture_id, '—', (e as Error).message)
        return null
      }),
    readH2H(fixture).catch((e) => {
      // The provider being unavailable is not the same as two clubs never
      // having played, and the phone must be able to tell them apart — hence
      // null rather than an empty summary.
      console.error('[scout] h2h unavailable for', fixture_id, '—', (e as Error).message)
      return null
    }),
  ])

  return NextResponse.json({
    fixture: {
      fixture_id: fixture.fixture_id,
      kickoff_at: fixture.kickoff_at,
      venue: fixture.venue,
      home: homeClub,
      away: awayClub,
    },
    form,
    people,
    crowd,
    h2h,
  })
}


/** Form for both clubs, from fixtures the sync already stored. No provider calls. */
async function readForm(
  admin: ReturnType<typeof createAdminClient>,
  fixture: FixtureRow,
  homeClub: ClubRef,
  awayClub: ClubRef,
) {
  const { data: rows, error } = await admin
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

  if (error) throw new Error(error.message)
  const fixtures = (rows ?? []) as unknown as Array<{
    fixture_id: string
    kickoff_at: string
    home_club_id: string
    away_club_id: string
    home_goals: number | null
    away_goals: number | null
  }>

  // ⚠ POSTGREST TRUNCATES AN UNBOUNDED SELECT SILENTLY. A full page here means
  // games are missing, with nothing in the numbers to say so.
  if (fixtures.length >= MAX_FORM_FIXTURES) {
    throw new Error(`hit the ${MAX_FORM_FIXTURES}-row ceiling — the form table would be short`)
  }

  const asForm: FormFixture[] = fixtures.map((f) => ({
    fixtureId: f.fixture_id,
    kickoffAt: f.kickoff_at,
    homeClubId: f.home_club_id,
    awayClubId: f.away_club_id,
    homeGoals: f.home_goals,
    awayGoals: f.away_goals,
  }))

  return buildMatchForm(asForm, { homeClub, awayClub, kickoffAt: fixture.kickoff_at })
}

/**
 * Who is playing well, from migration 141's player rows. No provider calls.
 *
 * ⚠ THE TWO CLUBS RUN CONCURRENTLY TOO. This is the heaviest branch — three
 * bounded reads per club — and the two clubs are independent of each other.
 */
async function readPeople(
  admin: ReturnType<typeof createAdminClient>,
  fixture: FixtureRow,
): Promise<{ home: SideScout; away: SideScout }> {
  const [homeRows, awayRows] = await Promise.all([
    readClubPlayerForm(admin, fixture.season_id, fixture.home_club_id),
    readClubPlayerForm(admin, fixture.season_id, fixture.away_club_id),
  ])
  return {
    home: scoutSide(homeRows.stats, homeRows.goals, fixture.home_club_id),
    away: scoutSide(awayRows.stats, awayRows.goals, fixture.away_club_id),
  }
}

/** Every previous meeting. One provider call per PAIRING, cached a day. */
async function readH2H(fixture: FixtureRow) {
  const home = fixture.home!
  const away = fixture.away!
  const meetings: H2HFixture[] = await fetchCachedH2H(
    home.external_club_id,
    away.external_club_id,
  )
  const summary = summariseH2H(meetings, {
    // ⚠ FROM THIS FIXTURE'S HOME CLUB'S POINT OF VIEW, wherever each meeting was
    // played. The clubs swap ends between fixtures, so reading the payload's
    // home/away columns straight through yields a complete, plausible and
    // entirely different team's record.
    homeExternalId: home.external_club_id,
    venueName: fixture.venue,
  })
  return {
    summary,
    // ⚠ THE GATE TRAVELS WITH THE ANSWER, so the phone cannot carry its own copy
    // of the threshold and disagree with the match tab about it.
    enough: summary.meetings >= MIN_MEETINGS,
    minMeetings: MIN_MEETINGS,
  }
}

export const GET = withPerfLogging('/api/fixtures/[fixture_id]/scout', handler)
