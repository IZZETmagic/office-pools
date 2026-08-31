import { NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { readMatchweekPoints } from '@/lib/league/duels'

// /api/pools/:pool_id/duel-live — the numbers on the duel card that MOVE.
//
// ## Why this exists
//
// `showdownData` is a server prop assembled once when the pool page renders,
// and nothing updated it afterwards. So during a live match the duel scoreline
// sat frozen at whatever it was on page load — 400–200 all afternoon — while
// the leaderboard next to it moved in realtime off the
// `pool:{id}:leaderboard` broadcast. The team sheet's red ticking clock had the
// same problem: it showed the minute the page loaded and never advanced.
//
// Everything was built. None of it moved.
//
// ## Why not `/live`, and why not `router.refresh()`
//
// `/live` reads the World Cup `matches` table; it has no league branch and
// giving it one would widen a route that four other surfaces depend on.
//
// `router.refresh()` would re-run the whole pool page per goal, per viewer —
// reintroducing exactly what `PoolDetail`'s broadcast comment celebrates
// escaping: "it was a doorbell, and then everyone fetched over HTTP anyway".
// This returns ten fixtures and a points map, not a pool payload.
//
// ⚠ ADMIN AFTER MEMBERSHIP, and required: `league_match_scores` is deny-all
// (migration 050). Membership is proven first, exactly as `/live` does.
//
// ⚠ THE MATCHWEEK COMES FROM THE CALLER, not from re-deriving it here. The
// client already holds `inPlayMatchweek`, and `readLeaguePoolView` — the only
// existing derivation — reads the whole season (clubs, 380 fixtures, standings)
// to produce it. That is a page-load read, not a poll read. Migration 103's
// lesson is about not COPYING a rule; passing the answer in copies nothing.
//
// Safe to accept as a parameter because match SCORES are not what the reveal
// gate protects. It withholds who you are PLAYING; what people scored in a
// past week is already on the team sheet, and a future week has no scores.
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pool_id: string }> },
) {
  const { pool_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .maybeSingle()
  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this pool' }, { status: 403 })
  }

  const admin = createAdminClient()

  const { data: pool } = await admin
    .from('pools')
    .select('pool_id, league_season_id, league_mode')
    .eq('pool_id', pool_id)
    .maybeSingle()
  if (!pool?.league_season_id || pool.league_mode !== 'showdown') {
    return NextResponse.json({ error: 'Not a showdown pool' }, { status: 404 })
  }

  const url = new URL(_req.url)
  const inPlay = Number(url.searchParams.get('matchweek'))
  if (!Number.isInteger(inPlay) || inPlay < 1) {
    return NextResponse.json({ error: 'matchweek required' }, { status: 400 })
  }

  const { points, perFixture, error } = await readMatchweekPoints(admin, pool_id, inPlay)
  if (error) console.error('[duel-live] matchweek points failed:', error)

  const { data: mw } = await admin
    .from('league_matchweeks')
    .select('matchweek_id')
    .eq('season_id', pool.league_season_id)
    .eq('matchweek_number', inPlay)
    .maybeSingle()

  type FixtureRow = {
    fixture_number: number
    home_goals: number | null
    away_goals: number | null
    status: string | null
    is_completed: boolean
    live_minute: number | null
    live_period: string | null
    live_added: number | null
  }
  let fx: FixtureRow[] = []
  if (mw) {
    const { data, error: fxErr } = await admin
      .from('league_fixtures')
      .select('fixture_number, home_goals, away_goals, status, is_completed,'
        + ' live_minute, live_period, live_added')
      .eq('matchweek_id', mw.matchweek_id)
      .order('fixture_number')
    // ⚠ Logged, not discarded. A swallowed PostgREST error here would freeze
    // the clock again and look exactly like the bug this route exists to fix.
    if (fxErr) console.error('[duel-live] fixtures failed:', fxErr.message)
    fx = (data ?? []) as unknown as FixtureRow[]
  }

  return NextResponse.json({
    inPlayMatchweek: inPlay,
    // Maps do not survive JSON, so both go over as plain objects and the client
    // rebuilds them. Ten entries and ten fixtures — small enough that shape
    // matters less than it looking like what it replaces.
    points: Object.fromEntries(points),
    perFixture: Object.fromEntries(
      [...perFixture].map(([entryId, byFixture]) => [entryId, Object.fromEntries(byFixture)]),
    ),
    fixtures: fx.map((f) => ({
      number: f.fixture_number,
      homeScore: f.home_goals,
      awayScore: f.away_goals,
      status: f.status,
      isCompleted: f.is_completed,
      liveMinute: f.live_minute,
      livePeriod: f.live_period,
      liveAdded: f.live_added,
    })),
  })
}
