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

/**
 * One entry of the caller's in a TABLE-mode pool, and where they placed this
 * fixture's two clubs.
 *
 * ⚠ A TABLE POOL HAS NO PER-FIXTURE PICK AT ALL — it is one decision for the
 * whole season (Decision 11), so `FixturePick` can never describe it. What it
 * does have, and what is worth showing beside a game, is where the member put
 * these two clubs.
 *
 * ⚠ AND NO SCORE. A league table is a FULL-TIME table, so a table pool settles
 * at the end of the season and nothing here claims a running one. Predicted
 * against current is a comparison the member can draw; "you are 4 off" would
 * imply a score that does not exist yet.
 */
type TablePick = {
  entry_id: string
  entry_name: string
  pool_id: string
  pool_name: string
  /** Null when the member filed a table that omits this club — possible on a partial profile. */
  home_position: number | null
  away_position: number | null
}

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
    .select(
      'pool_id, pools(pool_name, league_season_id, league_mode),' +
        ' pool_entries(entry_id, entry_name)',
    )
    .eq('user_id', user_id)
  // ⚠ Surfaced, never swallowed — `const { data } = await …` would turn a failed
  // read into "you have no picks", which is the exact false statement this
  // route was written to stop telling.
  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 })
  }

  type MemberRow = {
    pool_id: string
    pools: { pool_name: string; league_season_id: string | null; league_mode: string | null } | null
    pool_entries: { entry_id: string; entry_name: string }[] | null
  }

  type EntryMeta = { entry_name: string; pool_id: string; pool_name: string; league_mode: string | null }
  const entryMeta = new Map<string, EntryMeta>()
  for (const m of (memberRows ?? []) as unknown as MemberRow[]) {
    // League pools only. A World Cup entry can hold no `league_predictions`
    // row, so including it would only widen the `.in()` list.
    if (!m.pools?.league_season_id) continue
    for (const e of m.pool_entries ?? []) {
      entryMeta.set(e.entry_id, {
        entry_name: e.entry_name,
        pool_id: m.pool_id,
        pool_name: m.pools?.pool_name ?? 'Pool',
        // ⚠ `league_mode`, NOT `prediction_mode`. Every league pool carries
        // `prediction_mode = 'league_pickem'` — all seventeen in production on
        // 2026-09-07, table pickers and Showdown pools included — so that
        // column cannot tell the modes apart and reaching for it here would
        // treat a table pool as a pick'em one.
        league_mode: m.pools?.league_mode ?? null,
      })
    }
  }
  const tableEntryIds = [...entryMeta.entries()]
    .filter(([, v]) => v.league_mode === 'table')
    .map(([k]) => k)

  const entryIds = [...entryMeta.keys()]
  if (entryIds.length === 0) return NextResponse.json({ picks: [], table_picks: [] })

  // ---- 1b. Which two clubs this fixture is between -------------------------
  // Only needed for the table arm: `league_table_predictions` is keyed by club,
  // not by fixture, so the two club ids are how a season-long table is narrowed
  // to the game in front of you.
  let homeClubId: string | null = null
  let awayClubId: string | null = null
  if (tableEntryIds.length > 0) {
    const { data: fxRow, error: fxErr } = await admin
      .from('league_fixtures')
      .select('home_club_id, away_club_id')
      .eq('fixture_id', fixtureId)
      .maybeSingle()
    if (fxErr) {
      return NextResponse.json({ error: fxErr.message }, { status: 500 })
    }
    homeClubId = (fxRow as { home_club_id: string } | null)?.home_club_id ?? null
    awayClubId = (fxRow as { away_club_id: string } | null)?.away_club_id ?? null
  }

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

  // ---- 4. Where a table-mode entry placed these two clubs ------------------
  //
  // ⚠ A SEPARATE ARM BECAUSE A TABLE POOL HAS NO PER-FIXTURE PICK. It is one
  // decision for the whole season (Decision 11), so it can never appear in
  // `league_predictions` and would be invisible on this screen otherwise —
  // which for five of one member's pools is most of their football.
  //
  // ⚠ `league_table_predictions` IS CLIENT-READABLE under its own `Users can
  // view own table predictions` policy, so unlike the points this needs no
  // admin privilege — mobile's existing table screens read it straight through
  // PostgREST. It rides this route only because the tab is already making the
  // call, which saves a second round trip.
  //
  // ⚠⚠ AND THAT MAKES THE `.in(tableEntryIds)` BELOW LOAD-BEARING IN A WAY THE
  // POINTS ARM'S IS NOT. Migration 104 deliberately CLOSED the admin read on
  // this table, so that a pool admin who also plays cannot see rivals' tables
  // before the reveal — "who has filed" is answerable without "what did they
  // put", which is why `table-deadline` returns ids only. Reading it here with
  // the service role steps around that protection, and the ONLY thing putting
  // it back is that `tableEntryIds` contains the caller's own entries and
  // nothing else. Widening this filter would hand a member every rival's
  // finishing order before the reveal, silently.
  const tablePicks: TablePick[] = []
  if (tableEntryIds.length > 0 && homeClubId && awayClubId) {
    const { data: tableRows, error: tableErr } = await admin
      .from('league_table_predictions')
      .select('entry_id, club_id, predicted_position')
      .in('entry_id', tableEntryIds)
      .in('club_id', [homeClubId, awayClubId])
    if (tableErr) {
      return NextResponse.json({ error: tableErr.message }, { status: 500 })
    }

    type TableRow = { entry_id: string; club_id: string; predicted_position: number | null }
    const byEntry = new Map<string, { home: number | null; away: number | null }>()
    for (const r of (tableRows ?? []) as TableRow[]) {
      const slot = byEntry.get(r.entry_id) ?? { home: null, away: null }
      if (r.club_id === homeClubId) slot.home = r.predicted_position
      if (r.club_id === awayClubId) slot.away = r.predicted_position
      byEntry.set(r.entry_id, slot)
    }

    for (const [entryId, slot] of byEntry) {
      const meta = entryMeta.get(entryId)
      if (!meta) continue
      // A member who has filed nothing yet has no row at all, and an entry with
      // neither club placed says nothing worth a card.
      if (slot.home === null && slot.away === null) continue
      tablePicks.push({
        entry_id: entryId,
        entry_name: meta.entry_name,
        pool_id: meta.pool_id,
        pool_name: meta.pool_name,
        home_position: slot.home,
        away_position: slot.away,
      })
    }
  }

  return NextResponse.json({ picks, table_picks: tablePicks })
}

export const GET = withPerfLogging('users/fixture-picks', handleGET)
