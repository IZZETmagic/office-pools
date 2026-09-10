import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'
import { scoutSide, type SideScout } from '@/lib/scouting/players'
import { readClubPlayerForm } from '@/lib/scouting/readPlayers'

// =============================================================
// /api/fixtures/:fixture_id/players — who is actually playing well
// =============================================================
// The people half of a scout report: in-form names by rating, and the danger
// men by goals plus assists, for each side.
//
// ## ⚠ IT COSTS NO PROVIDER CALLS AT ALL, UNLIKE ITS NEIGHBOUR
//
// `/h2h` spends one api-football call per club pairing. This spends none: every
// row it reads was already paid for and stored by the fixture sync, in the
// `/fixtures?ids=` bundle that migration 141 finally started keeping. That is
// also why it is a SEPARATE ROUTE rather than more fields on `/h2h` — the two
// have different costs and completely different shelf lives. A pairing's history
// changes when the clubs next play; form changes every weekend.
//
// ⚠ SO THE CACHE IS SHORT, AND KEYED ON THE FIXTURE. There is no pair-level
// reuse to be had here: the reverse fixture in April will have entirely
// different form behind it.
//
// ⚠ REQUIRES AUTH, THOUGH THERE IS NOTHING PRIVATE IN IT. Player form is public
// football. The guard protects the DATABASE rather than the data — this is
// three bounded reads per club and an open version would let anyone walk every
// fixture in every season.
//
// ⚠ THE TABLE IT READS HAS A KNOWN-WRONG COLUMN. `is_starter` reads true for
// whole squads because the provider sends `substitute: false` for all of them;
// nothing in this path filters on it. See `lib/scouting/players.ts`.
// =============================================================

export const dynamic = 'force-dynamic'

type FixtureRow = {
  season_id: string
  home_club_id: string
  away_club_id: string
  home: { club_id: string; name: string; abbreviation: string } | null
  away: { club_id: string; name: string; abbreviation: string } | null
}

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
      'season_id, home_club_id, away_club_id,' +
        ' home:league_clubs!league_fixtures_home_club_id_fkey(club_id, name, abbreviation),' +
        ' away:league_clubs!league_fixtures_away_club_id_fkey(club_id, name, abbreviation)',
    )
    .eq('fixture_id', fixture_id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'Could not read fixture' }, { status: 500 })
  }
  const fixture = data as unknown as FixtureRow | null
  if (!fixture?.home || !fixture?.away) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let home: SideScout
  let away: SideScout
  try {
    // Sequential rather than parallel: two clubs is two round trips either way,
    // and a failure part-way through should not leave a half-built card.
    const homeRows = await readClubPlayerForm(admin, fixture.season_id, fixture.home_club_id)
    const awayRows = await readClubPlayerForm(admin, fixture.season_id, fixture.away_club_id)
    home = scoutSide(homeRows.stats, homeRows.goals, fixture.home_club_id)
    away = scoutSide(awayRows.stats, awayRows.goals, fixture.away_club_id)
  } catch (e) {
    console.error('[players] read failed for', fixture_id, '—', (e as Error).message)
    return NextResponse.json({ error: 'Could not read player form' }, { status: 500 })
  }

  /**
   * ⚠ THE GATE TRAVELS WITH THE ANSWER, the same way `MIN_MEETINGS` does on the
   * head-to-head route. The phone must not carry its own copy of "is there
   * enough here to show a card", or the two surfaces disagree the day either
   * threshold moves. A fixture early in a season has stats for nobody, and an
   * empty card teaches people to stop tapping.
   */
  const enough = home.inForm.length > 0 || away.inForm.length > 0

  return NextResponse.json({
    enough,
    home: { club: fixture.home, scout: home },
    away: { club: fixture.away, scout: away },
  })
}

export const GET = withPerfLogging('/api/fixtures/[fixture_id]/players', handler)
