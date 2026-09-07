import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'

// =============================================================
// /api/users/:user_id/fixture-picks?fixture_id= — YOUR PICK, ON ONE FIXTURE
// =============================================================
// The match detail screen's Predictions tab, for a league fixture.
//
// ## What this replaces, and why the old reasoning was only half right
//
// The tab has said "no predictions" for every league fixture since it shipped,
// on a stated v1 boundary: league picks are pool-scoped, a match opened from the
// GLOBAL list has no pool in hand, and the alternative was thought to be one
// `/api/pools/:id/league` contract call per pool per tap — the fetch-per-goal
// pattern the league read review exists to stop.
//
// That is true of the CONTRACT ROUTE and false of the DATA. `league_predictions`
// carries a `Users can view own league predictions` policy keyed on `auth.uid()`
// and is keyed `(entry_id, fixture_id)`, so a member's own picks for one fixture
// across every pool are a single RLS-confined read. The boundary was really two
// boundaries, and only the second one holds:
//
//   · THE PICK is readable by the client. No route needed for it.
//   · THE POINTS are not. `league_match_scores` is one of migration 050's four
//     deny-all tables — RLS on, zero policies — so a user-scoped read returns
//     an empty array with `error: null`, the silent-zero failure that the
//     `denyAllTables` guard test exists to catch.
//
// So this route exists for the points, and carries the pick along with them
// because it is already holding the rows.
//
// ⚠⚠ IT READS WITH THE ADMIN CLIENT, WHICH MEANS IT MUST RE-IMPLEMENT THE RLS
// IT BYPASSES. This is the Last Man Standing lesson, and it is the only
// genuinely dangerous thing in this file: the service role sees every entry in
// every pool, so the entry set below is resolved FROM THE CALLER'S OWN
// MEMBERSHIPS FIRST and every subsequent query is confined to it with `.in()`.
// A future edit that filters `league_match_scores` by `fixture_id` alone would
// hand a member every rival's score for that game, and nothing would fail.
//
// ⚠ THE CALLER MAY ONLY ASK ABOUT THEMSELVES. Same guard as `fixtures` and
// `home-scoring`, and it is load-bearing here for the same reason — the read
// below runs as the service role.
//
// ## What it deliberately does not return
//
// Other members' picks. That is not a cost decision but a correctness one:
// league picks reveal per MATCHWEEK on `lock_at`, and Showdown seals a duel
// until its reveal. A crowd breakdown on this screen would have to re-implement
// both gates, and getting it wrong leaks a rival's pick before kickoff. The
// World Cup arm's crowd stats come from a route that knows those matches are
// long finished; there is no such shortcut here.
// =============================================================

export const dynamic = 'force-dynamic'

/** One entry of the caller's that predicted this fixture. */
type FixturePick = {
  entry_id: string
  entry_name: string
  pool_id: string
  pool_name: string
  predicted_home_score: number | null
  predicted_away_score: number | null
  /** For modes that pick an outcome rather than a scoreline. */
  predicted_outcome: string | null
  /**
   * `exact` | `winner_gd` | `winner` | `miss`, or null before the fixture is
   * scored. The phone already has a colour token per tier.
   */
  score_type: string | null
  /** Null until scored — which is NOT the same as zero, and `miss` IS zero. */
  points: number | null
}

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ user_id: string }> },
) {
  const { user_id } = await params
  const fixtureId = request.nextUrl.searchParams.get('fixture_id')
  if (!fixtureId) {
    return NextResponse.json({ error: 'fixture_id is required' }, { status: 400 })
  }

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { userData } = auth.data

  if (userData.user_id !== user_id && !userData.is_super_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()

  // ---- 1. The caller's own entries. EVERYTHING BELOW IS CONFINED TO THESE ----
  //
  // ⚠ Read through `pool_members` with `pool_entries` nested, which is the
  // pattern `useMatchDetail` and `useMemberDetail` both use: PostgREST struggles
  // to filter `pool_entries` through a `pool_members!inner` join where the
  // relationship name is ambiguous.
  const { data: memberRows, error: memberErr } = await admin
    .from('pool_members')
    .select('pool_id, pools(pool_name, league_season_id), pool_entries(entry_id, entry_name)')
    .eq('user_id', user_id)
  // ⚠ Surfaced, never swallowed — `const { data } = await …` would turn a failed
  // read into "you have no picks", which is the exact false statement this
  // route was written to stop telling.
  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 })
  }

  type MemberRow = {
    pool_id: string
    pools: { pool_name: string; league_season_id: string | null } | null
    pool_entries: { entry_id: string; entry_name: string }[] | null
  }

  const entryMeta = new Map<string, { entry_name: string; pool_id: string; pool_name: string }>()
  for (const m of (memberRows ?? []) as unknown as MemberRow[]) {
    // League pools only. A World Cup entry can hold no `league_predictions`
    // row, so including it would only widen the `.in()` list.
    if (!m.pools?.league_season_id) continue
    for (const e of m.pool_entries ?? []) {
      entryMeta.set(e.entry_id, {
        entry_name: e.entry_name,
        pool_id: m.pool_id,
        pool_name: m.pools?.pool_name ?? 'Pool',
      })
    }
  }

  const entryIds = [...entryMeta.keys()]
  if (entryIds.length === 0) return NextResponse.json({ picks: [] })

  // ---- 2. The picks, and 3. the points — both confined to those entries ----
  const [predRes, scoreRes] = await Promise.all([
    admin
      .from('league_predictions')
      .select('entry_id, predicted_home_score, predicted_away_score, predicted_outcome')
      .eq('fixture_id', fixtureId)
      .in('entry_id', entryIds),
    // ⚠ `.in('entry_id', entryIds)` IS THE RLS. `league_match_scores` has no
    // policy of its own; this list is the only thing standing between a member
    // and every rival's score for this fixture. Never relax it to a
    // `fixture_id`-only filter.
    admin
      .from('league_match_scores')
      .select('entry_id, score_type, total_points')
      .eq('fixture_id', fixtureId)
      .in('entry_id', entryIds),
  ])
  if (predRes.error) {
    return NextResponse.json({ error: predRes.error.message }, { status: 500 })
  }
  if (scoreRes.error) {
    return NextResponse.json({ error: scoreRes.error.message }, { status: 500 })
  }

  const scoreByEntry = new Map(
    ((scoreRes.data ?? []) as { entry_id: string; score_type: string | null; total_points: number | null }[])
      .map((s) => [s.entry_id, s]),
  )

  type PredRow = {
    entry_id: string
    predicted_home_score: number | null
    predicted_away_score: number | null
    predicted_outcome: string | null
  }

  const picks: FixturePick[] = ((predRes.data ?? []) as PredRow[]).flatMap((p) => {
    const meta = entryMeta.get(p.entry_id)
    // Cannot happen — `entryIds` came from `entryMeta` — but a pick with no
    // pool to name is not worth rendering.
    if (!meta) return []
    const score = scoreByEntry.get(p.entry_id)
    return [{
      entry_id: p.entry_id,
      entry_name: meta.entry_name,
      pool_id: meta.pool_id,
      pool_name: meta.pool_name,
      predicted_home_score: p.predicted_home_score,
      predicted_away_score: p.predicted_away_score,
      predicted_outcome: p.predicted_outcome,
      score_type: score?.score_type ?? null,
      // ⚠ NULL BEFORE SCORING, AND THAT IS NOT ZERO. `miss` is a real zero the
      // engine wrote; an unscored fixture has no number at all, and printing 0
      // for it tells a member their correct pick earned nothing.
      points: score?.total_points ?? null,
    }]
  })

  return NextResponse.json({ picks })
}

export const GET = withPerfLogging('users/fixture-picks', handleGET)
