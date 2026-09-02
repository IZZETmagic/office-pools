import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'
import { getShadowReadPools, readEntryScoring } from '@/lib/scoring/readSource'
import { getLevelName } from '@/lib/levelNames'

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
  /**
   * The STORED XP level from `entry_xp_state`, never a client-side derivation —
   * and NULL for a league entry, matching the web pools page.
   *
   * ⚠ NULL is meaningful twice over. XP is World Cup machinery end to end:
   * `entry_xp_state` is written by World Cup scoring, so a league entry has no
   * row and a level would be 1 for everyone. The web card shows the matchweek
   * in that space instead; the phone must not invent a number where the web
   * deliberately shows none.
   */
  current_level: number | null
  /** Paired here so the name can never drift from the number. */
  level_name: string | null
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
    current_level: null,
    level_name: null,
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

  // Which of the user's pools are leagues — asked as a flat list of ids rather
  // than embedded in the membership select, because PostgREST types an embedded
  // relation as an array and the shape fight is not worth a join we can do as an
  // indexed lookup on ids we already hold.
  const poolIds = [...new Set(memberships.map((m) => m.pool_id))]
  const { data: leaguePoolRows, error: leagueErr } = await admin
    .from('pools')
    .select('pool_id')
    .in('pool_id', poolIds)
    .not('league_season_id', 'is', null)
    .returns<Array<{ pool_id: string }>>()
  if (leagueErr) {
    return NextResponse.json({ error: leagueErr.message }, { status: 500 })
  }
  const leaguePools = new Set((leaguePoolRows ?? []).map((r) => r.pool_id))

  const shadowPools = await getShadowReadPools(admin)
  const shadowIds: string[] = []
  const prodIds: string[] = []
  // Entries whose pool is a league — they get NO level, see `current_level`.
  const leagueEntryIds = new Set<string>()
  for (const m of memberships) {
    const target = shadowPools.has(m.pool_id) ? shadowIds : prodIds
    for (const e of m.pool_entries ?? []) {
      if (!e.entry_id) continue
      target.push(e.entry_id)
      if (leaguePools.has(m.pool_id)) leagueEntryIds.add(e.entry_id)
    }
  }

  const allIds = [...shadowIds, ...prodIds]
  if (allIds.length === 0) {
    return NextResponse.json({ entries: [] })
  }

  const [shadowSummaries, prodSummaries, shadowTotals, prodTotals, levelRows] =
    await Promise.all([
      fetchSummaries(admin, shadowIds, 'shadow'),
      fetchSummaries(admin, prodIds, 'prod'),
      readEntryScoring(admin, shadowIds, 'shadow'),
      readEntryScoring(admin, prodIds, 'prod'),
      // Two named columns, keyed by the entries already resolved above. The
      // level is READ, never derived — the phone used to run its own points →
      // level table, against `scored_total_points`, which is not XP at all.
      admin
        .from('entry_xp_state')
        .select('entry_id, current_level')
        .in('entry_id', allIds)
        .returns<Array<{ entry_id: string; current_level: number | null }>>(),
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

  // ⚠ A discarded PostgREST error here would silently blank every level, which
  // is the exact shape of bug that left form and accuracy empty for months.
  if (levelRows.error) {
    return NextResponse.json({ error: levelRows.error.message }, { status: 500 })
  }
  for (const row of levelRows.data ?? []) {
    const summary = byEntry.get(row.entry_id)
    if (!summary || leagueEntryIds.has(row.entry_id)) continue
    summary.current_level = row.current_level ?? 1
    summary.level_name = getLevelName(summary.current_level)
  }

  return NextResponse.json({ entries: [...byEntry.values()] })
}

export const GET = withPerfLogging('users/home-scoring', handleGET)
