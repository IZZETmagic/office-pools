import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'
import {
  getShadowReadPools,
  readEntryScoring,
  readMatchScoreClassification,
  type MatchScoreClassification,
} from '@/lib/scoring/readSource'

// GET /api/users/:user_id/home-scoring
//
// Per-entry scoring aggregates for the RN home screen: recent form, accuracy
// counts and the current scoring streak.
//
// This route exists because the app CANNOT compute these itself. The shadow
// tables are RLS deny-all (0 policies), so a user-scoped PostgREST client
// reads nothing from them, and `readSource` is server-side TypeScript the app
// never executes. Duplicating source resolution in the client is exactly the
// divergence this programme keeps removing — so the resolution lives here and
// the app asks for the answer.
//
// It also returns DERIVED aggregates rather than rows. The hook it replaces
// pulled every scored match for every entry the user owns — thousands of rows
// — to produce a handful of small numbers. This returns one object per entry.

type FormResult = 'exact' | 'winner_gd' | 'winner' | 'miss'

export type EntryScoringSummary = {
  entry_id: string
  /** Newest-last, at most 5 — the form indicator dots. */
  form: FormResult[]
  total_completed: number
  exact_count: number
  correct_count: number
  /** Consecutive point-scoring matches counting back from the most recent. */
  streak: number
  /** Same source as the pool's own leaderboard — see the note on the route. */
  match_points: number
  bonus_points: number
  point_adjustment: number
  scored_total_points: number
  current_rank: number | null
}

function summarise(entryId: string, rows: MatchScoreClassification[]): EntryScoringSummary {
  // paginateByEntry orders by match_number ascending, so the tail is newest.
  const ordered = [...rows].sort((a, b) => a.match_number - b.match_number)

  let exact = 0
  let correct = 0
  for (const r of ordered) {
    if (r.score_type === 'exact') exact++
    if (r.score_type !== 'miss') correct++
  }

  let streak = 0
  for (let i = ordered.length - 1; i >= 0; i--) {
    if ((ordered[i].total_points ?? 0) > 0) streak++
    else break
  }

  return {
    entry_id: entryId,
    form: ordered.slice(-5).map((r) => r.score_type),
    total_completed: ordered.length,
    exact_count: exact,
    correct_count: correct,
    streak,
    match_points: 0,
    bonus_points: 0,
    point_adjustment: 0,
    scored_total_points: 0,
    current_rank: null,
  }
}

async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ user_id: string }> },
) {
  const { user_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { userData } = auth.data

  // Caller can only fetch their own summary (super admins may inspect any).
  if (userData.user_id !== user_id && !userData.is_super_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Entries are resolved server-side from the authenticated user rather than
  // accepted from the client: the read below runs as the service role, so a
  // client-supplied entry list would be a way to read anyone's scores.
  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('pool_members')
    .select('pool_id, pool_entries(entry_id)')
    .eq('user_id', user_id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type MemberRow = { pool_id: string; pool_entries?: Array<{ entry_id: string }> | null }
  const memberships = (rows ?? []) as MemberRow[]

  const shadowPools = await getShadowReadPools(admin)
  const shadowIds: string[] = []
  const prodIds: string[] = []
  for (const m of memberships) {
    const target = shadowPools.has(m.pool_id) ? shadowIds : prodIds
    for (const e of m.pool_entries ?? []) {
      if (e.entry_id) target.push(e.entry_id)
    }
  }

  const allIds = [...shadowIds, ...prodIds]
  if (allIds.length === 0) {
    return NextResponse.json({ entries: [] })
  }

  // Both reads are paginated. The accuracy counts describe EVERY scored match,
  // so a bounded read would silently under-report once a user's rows crossed
  // PostgREST's 1,000-row cap — which the previous client-side query did.
  const [shadowRows, prodRows, shadowTotals, prodTotals] = await Promise.all([
    readMatchScoreClassification(admin, shadowIds, 'shadow'),
    readMatchScoreClassification(admin, prodIds, 'prod'),
    readEntryScoring(admin, shadowIds, 'shadow'),
    readEntryScoring(admin, prodIds, 'prod'),
  ])

  const byEntry = new Map<string, MatchScoreClassification[]>()
  for (const id of allIds) byEntry.set(id, [])
  for (const r of [...shadowRows, ...prodRows]) {
    byEntry.get(r.entry_id)?.push(r)
  }

  const entries = [...byEntry.entries()].map(([id, rs]) => {
    const summary = summarise(id, rs)
    // Points and rank must follow the same source as the pool's leaderboard, or
    // the home card and the pool disagree for the same member. Bracket-picker
    // entries have no match_scores at all, so this is the ONLY scoring data
    // they carry — the form/accuracy half above is legitimately empty for them.
    const totals = shadowTotals.get(id) ?? prodTotals.get(id)
    if (totals) {
      summary.match_points = totals.match_points
      summary.bonus_points = totals.bonus_points
      summary.point_adjustment = totals.point_adjustment
      summary.scored_total_points = totals.scored_total_points
      summary.current_rank = totals.current_rank
    }
    return summary
  })
  return NextResponse.json({ entries })
}

export const GET = withPerfLogging('users/home-scoring', handleGET)
