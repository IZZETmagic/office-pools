import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// =============================================================
// GET /api/pools/:poolId/lms
// Everything a Last Man Standing screen needs: the round, who is left, the wall
// of picks, and the clubs still available with the game each one plays.
//
// ## ⚠⚠ WHICH CLIENT READS WHAT, AND WHY IT IS NOT A DETAIL
//
// `league_lms_picks` carries the mode's one secret. Migration 086 gives it two
// SELECT policies — your own picks always, everyone else's only once that
// matchweek has LOCKED — and says why in its own comment: *"showing it early
// would let the pool copy the best player."*
//
// So the picks are read with the CALLER'S client and the database does the
// gating. That is deliberate and it is the opposite of what
// `/leaderboard` had to do: there the admin client was already in hand for the
// deny-all totals table, so the seal had to be re-implemented in TypeScript. One
// re-implementation of a policy is a liability; two is a matter of time. Here
// there is no reason to hold the service key at all, so it is not held.
//
// The single exception is `league_entry_totals` (`rounds_won`), which is one of
// migration 050's four deny-all tables: RLS on, zero policies, and a user-scoped
// read returns `[]` with `error: null` — the confident-zero shape that made a
// "rounds won" badge impossible to ever paint. That one row set, and nothing
// else, comes from admin.
//
// ## The round is the scope of everything
//
// Used clubs, the wall, the history: all of it is the OPEN round and clears when
// the next one starts. Ryan, 2026-08-30 — once a new round is active these reset
// so the member can see the clubs are live again. Nothing carries over but
// `rounds_won`.
// =============================================================

/** One cell of the picks wall. Only ever present when the caller may see it. */
type LmsPickCell = {
  entry_id: string
  matchweek_number: number
  club_id: string
  club_name: string
  crest_url: string | null
  /** NULL until the matchweek settles. */
  result: 'survived' | 'eliminated' | null
}

export async function GET(
  request: NextRequest,
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
    .single()
  if (!membership) return NextResponse.json({ error: 'Not a member of this pool' }, { status: 403 })

  const { data: pool } = await supabase
    .from('pools')
    .select('pool_id, league_season_id, league_mode')
    .eq('pool_id', pool_id)
    .single()
  if (!pool?.league_season_id) return NextResponse.json({ error: 'Not a league pool' }, { status: 404 })
  if (pool.league_mode !== 'last_man_standing') {
    return NextResponse.json({ error: 'Not a Last Man Standing pool' }, { status: 404 })
  }
  const seasonId = pool.league_season_id as string

  const { createAdminClient } = await import('@/lib/supabase/server')
  const admin = createAdminClient()

  // ---- the roster ---------------------------------------------------------
  // Admin, and safe: none of this is secret inside a pool — the leaderboard
  // already states every one of these facts. Only the picks are sealed.
  const { data: memberRows, error: memberErr } = await admin
    .from('pool_members')
    .select('member_id, user_id, users(username, full_name)')
    .eq('pool_id', pool_id)
  if (memberErr) return NextResponse.json({ error: `members: ${memberErr.message}` }, { status: 502 })

  const memberIds = (memberRows ?? []).map((m) => m.member_id)
  const { data: entryRows, error: entryErr } = await admin
    .from('pool_entries')
    .select('entry_id, member_id, entry_name')
    .in('member_id', memberIds.length > 0 ? memberIds : ['00000000-0000-0000-0000-000000000000'])
    .is('retired_at', null)
  if (entryErr) return NextResponse.json({ error: `entries: ${entryErr.message}` }, { status: 502 })

  const myEntryIds = (entryRows ?? [])
    .filter((e) => e.member_id === membership.member_id)
    .map((e) => e.entry_id)

  // ---- the round, the survivors and THE PICKS -----------------------------
  // ⚠ `supabase`, not `admin`. See the header: this is the read the seal exists
  // for, and the database is what enforces it.
  const { readLmsState } = await import('@/lib/league/lms')
  const { readSeasonClubs } = await import('@/lib/league/table')
  const { readEntryTotals } = await import('@/lib/league/duels')

  const [state, clubsRes, totalsRes] = await Promise.all([
    readLmsState(supabase, pool_id, myEntryIds),
    readSeasonClubs(supabase, seasonId),
    readEntryTotals(admin, pool_id),
  ])
  if (state.error) return NextResponse.json({ error: state.error }, { status: 502 })
  if (clubsRes.error) return NextResponse.json({ error: `clubs: ${clubsRes.error}` }, { status: 502 })
  // Not fatal: a missing trophy count is a quieter wrong answer than no screen.
  if (totalsRes.error) console.error('[lms route] entry totals failed:', totalsRes.error)

  const clubById = new Map(clubsRes.clubs.map((c) => [c.club_id, c]))
  const survivorByEntry = new Map(state.survivors.map((s) => [s.entry_id, s]))

  const members = (entryRows ?? []).map((e) => {
    const m = (memberRows ?? []).find((x) => x.member_id === e.member_id)
    const u = (m as { users?: unknown } | undefined)?.users
    const user = (Array.isArray(u) ? u[0] : u) as { username?: string; full_name?: string } | undefined
    const s = survivorByEntry.get(e.entry_id)
    return {
      entry_id: e.entry_id,
      user_id: m?.user_id ?? null,
      display_name: e.entry_name || user?.full_name || user?.username || 'Entry',
      username: user?.username ?? '',
      eliminated_matchweek: s?.eliminated_matchweek ?? null,
      // ⚠ No survivor row is NOT elimination — they joined after the round
      // opened and enter the next one. Everybody in it has spent clubs already.
      in_round: s !== undefined,
      is_round_winner: s?.is_winner ?? false,
      rounds_won: totalsRes.totals.get(e.entry_id)?.roundsWon ?? 0,
    }
  })

  // ---- the wall -----------------------------------------------------------
  // `myPicks` and `revealedPicks` together are exactly what this caller may see,
  // because RLS already decided. No client-side filter is applied on top, and
  // none should be: a filter is not a gate.
  const visible = [...state.myPicks, ...state.revealedPicks]
  const picks: LmsPickCell[] = visible.map((p) => {
    const club = clubById.get(p.club_id)
    return {
      entry_id: p.entry_id,
      matchweek_number: p.matchweek_number,
      club_id: p.club_id,
      club_name: club?.club_name ?? 'Unknown club',
      crest_url: club?.crest_url ?? null,
      result: p.result,
    }
  })

  // ---- which weeks the wall has columns for -------------------------------
  const { openMatchweekId, inPlayMatchweekId, readMatchweekFixtureByClub } = await import('@/lib/league/read')
  const { data: weekRows, error: weekErr } = await admin
    .from('league_matchweeks')
    .select(
      'matchweek_id, matchweek_number, fixture_count, completed_fixture_count, lock_at, first_kickoff_at, ranks_snapshot_at',
    )
    .eq('season_id', seasonId)
  if (weekErr) return NextResponse.json({ error: `matchweeks: ${weekErr.message}` }, { status: 502 })

  const weeks = weekRows ?? []
  const now = Date.now()
  const openWeek = weeks.find((w) => w.matchweek_id === openMatchweekId(weeks, now)) ?? null
  const inPlayWeek = weeks.find((w) => w.matchweek_id === inPlayMatchweekId(weeks, now)) ?? null

  const first = state.round?.first_matchweek ?? null
  // ⚠ Only weeks the round actually covers. A round can open on the week AFTER
  // the one still being played (106 re-homing), and a column for a week that
  // predates the round would be empty for everyone — which reads as a matchweek
  // the whole pool failed to pick in.
  const inRound = (n: number | null | undefined): n is number => n != null && first != null && n >= first
  const columns = [
    ...new Set([
      ...picks.map((p) => p.matchweek_number),
      ...(inRound(inPlayWeek?.matchweek_number) ? [inPlayWeek!.matchweek_number] : []),
      ...(inRound(openWeek?.matchweek_number) ? [openWeek!.matchweek_number] : []),
    ]),
  ].sort((a, b) => a - b)

  const lockedAt = new Map(weeks.map((w) => [w.matchweek_number, w.lock_at as string | null]))
  const isLocked = (n: number) => {
    const at = lockedAt.get(n)
    return !!at && new Date(at).getTime() <= now
  }

  // ---- the clubs, and the game each one plays this week --------------------
  // ⚠ The whole decision in this mode is "can this club win THIS week", so a
  // grid of twenty crests and no fixtures moves the answer into the member's
  // head. And a club with no game cannot be backed at all (it would be a free
  // pass), so the picker has to be able to say which those are.
  const usedIn = new Map<string, number>()
  for (const p of state.myPicks) usedIn.set(p.club_id, p.matchweek_number)

  let fixtures: Array<{
    club_id: string
    opponent_name: string
    opponent_crest: string | null
    is_home: boolean
    kickoff_at: string
  }> = []
  if (openWeek && inRound(openWeek.matchweek_number)) {
    const { byClub, error: fxErr } = await readMatchweekFixtureByClub(
      supabase,
      seasonId,
      openWeek.matchweek_number,
    )
    if (fxErr) console.error('[lms route] matchweek fixtures failed:', fxErr)
    fixtures = [...byClub].map(([club_id, f]) => ({
      club_id,
      opponent_name: f.opponentName,
      opponent_crest: f.opponentCrest,
      is_home: f.isHome,
      kickoff_at: f.kickoffAt,
    }))
  }

  return NextResponse.json({
    round: state.round
      ? {
          round_id: state.round.round_id,
          round_number: state.round.round_number,
          first_matchweek: state.round.first_matchweek,
        }
      : null,
    /** The week a pick can still be WRITTEN for. Never the one to narrate with. */
    open_matchweek: inRound(openWeek?.matchweek_number) ? openWeek!.matchweek_number : null,
    /**
     * When that week stops accepting picks.
     *
     * ⚠ `lock_at`, NOT `first_kickoff_at`. Migration 101 moved the deadline to an
     * hour BEFORE the first kickoff and backfilled it — measured on production
     * 2026-09-03: MW3 onward run a 60-minute gap, while MW1 and MW2 sit at zero
     * because they had already locked when 101 ran and a passed deadline is
     * never moved. Anything that says "it locks at kickoff" is an hour wrong.
     */
    open_locks_at: inRound(openWeek?.matchweek_number) ? (openWeek!.lock_at as string | null) : null,
    /** The week being PLAYED. Null between rounds — an answer, not a gap. */
    in_play_matchweek: inRound(inPlayWeek?.matchweek_number) ? inPlayWeek!.matchweek_number : null,
    matchweeks: columns,
    locked_matchweeks: columns.filter(isLocked),
    my_entry_id: myEntryIds[0] ?? null,
    members,
    picks,
    clubs: clubsRes.clubs.map((c) => ({
      club_id: c.club_id,
      club_name: c.club_name,
      crest_url: c.crest_url,
      used_in_matchweek: usedIn.get(c.club_id) ?? null,
    })),
    fixtures,
  })
}
