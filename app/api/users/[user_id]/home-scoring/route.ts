import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'
import { getShadowReadPools, readEntryScoring } from '@/lib/scoring/readSource'

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
//
// The counting itself happens in Postgres (`entry_match_score_summary`, migration
// 037) rather than here, so those rows never leave the database at all: 287,098
// rows across all users collapses to 4,982, one per entry.

type FormResult = 'exact' | 'winner_gd' | 'winner' | 'miss'

type SummaryRow = {
  entry_id: string
  total_completed: number
  exact_count: number
  correct_count: number
  streak: number
  form: FormResult[] | null
}

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

/** An entry with no scored matches — bracket_picker entries are always this. */
function emptySummary(entryId: string): EntryScoringSummary {
  return {
    entry_id: entryId,
    form: [],
    total_completed: 0,
    exact_count: 0,
    correct_count: 0,
    streak: 0,
    match_points: 0,
    bonus_points: 0,
    point_adjustment: 0,
    scored_total_points: 0,
    current_rank: null,
  }
}

/**
 * Aggregates come back already computed — see migration 037 for the counting,
 * the streak rule and the ordering guarantee (form is newest-LAST).
 *
 * The RPC returns at most one row per requested entry, so unlike a raw
 * match_scores read this can never approach PostgREST's 1,000-row response cap.
 */
async function fetchSummaries(
  admin: ReturnType<typeof createAdminClient>,
  entryIds: string[],
  source: 'shadow' | 'prod',
): Promise<SummaryRow[]> {
  if (entryIds.length === 0) return []
  const { data, error } = await admin.rpc('entry_match_score_summary', {
    p_entry_ids: entryIds,
    p_source: source,
  })
  // Surfaced, not swallowed: a discarded error here is exactly how this screen's
  // form and accuracy silently rendered empty for everyone before this route.
  if (error) throw new Error(`entry_match_score_summary(${source}): ${error.message}`)
  return (data ?? []) as SummaryRow[]
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

  const [shadowSummaries, prodSummaries, shadowTotals, prodTotals] = await Promise.all([
    fetchSummaries(admin, shadowIds, 'shadow'),
    fetchSummaries(admin, prodIds, 'prod'),
    readEntryScoring(admin, shadowIds, 'shadow'),
    readEntryScoring(admin, prodIds, 'prod'),
  ])

  // Seed every requested entry, then overlay. The RPC omits entries with no
  // scored matches rather than returning zero rows, so the seed is what makes a
  // missing row and an all-zero row mean the same thing.
  const byEntry = new Map<string, EntryScoringSummary>()
  for (const id of allIds) byEntry.set(id, emptySummary(id))

  for (const row of [...shadowSummaries, ...prodSummaries]) {
    const summary = byEntry.get(row.entry_id)
    if (!summary) continue
    summary.total_completed = row.total_completed
    summary.exact_count = row.exact_count
    summary.correct_count = row.correct_count
    summary.streak = row.streak
    summary.form = row.form ?? []
  }

  // Points and rank must follow the same source as the pool's leaderboard, or
  // the home card and the pool disagree for the same member. Bracket-picker
  // entries have no match_scores at all, so this is the ONLY scoring data they
  // carry — the form/accuracy half is legitimately empty for them.
  for (const [id, summary] of byEntry) {
    const totals = shadowTotals.get(id) ?? prodTotals.get(id)
    if (!totals) continue
    summary.match_points = totals.match_points
    summary.bonus_points = totals.bonus_points
    summary.point_adjustment = totals.point_adjustment
    summary.scored_total_points = totals.scored_total_points
    summary.current_rank = totals.current_rank
  }

  return NextResponse.json({ entries: [...byEntry.values()] })
}

export const GET = withPerfLogging('users/home-scoring', handleGET)
