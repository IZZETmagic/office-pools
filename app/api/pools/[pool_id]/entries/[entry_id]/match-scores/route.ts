import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'
import { getScoringSource, readMatchScores } from '@/lib/scoring/readSource'

// =============================================================
// GET /api/pools/:pool_id/entries/:entry_id/match-scores
//
// The FULL 22-column match_scores rows for ONE entry.
//
// The pool-wide payload carries only the 8 columns in MatchScoreNarrow. The
// other 14 — predicted/actual scores, PSO, team ids, base points, multiplier —
// are read by exactly two client surfaces (PointsBreakdownModal and
// results/MatchCard), both of which only ever display a single entry at a time.
//
// Shipping them for every entry cost 8,477 kB on every pool open against
// 3,698 kB narrow, to serve ~104 rows that a member may never ask for. So they
// are fetched here, on demand, for the one entry being looked at.
// =============================================================

async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ pool_id: string; entry_id: string }> },
) {
  const { pool_id, entry_id } = await params

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

  // Membership proves access to the POOL; it does not prove this entry belongs
  // to it. Without this check a member of pool A could read any entry in any
  // pool by id, since the read below runs as the service role.
  const admin = createAdminClient()
  const { data: entry } = await admin
    .from('pool_entries')
    .select('entry_id, member_id, pool_members!inner(pool_id)')
    .eq('entry_id', entry_id)
    .maybeSingle()

  const entryPoolId = (entry as { pool_members?: { pool_id?: string } } | null)?.pool_members?.pool_id
  if (!entry || entryPoolId !== pool_id) {
    return NextResponse.json({ error: 'Entry not found in this pool' }, { status: 404 })
  }

  const { data: pool } = await admin
    .from('pools')
    .select('prediction_mode')
    .eq('pool_id', pool_id)
    .maybeSingle()

  const source = await getScoringSource(admin, pool_id, pool?.prediction_mode ?? 'full_tournament')
  const scores = await readMatchScores(admin, [entry_id], source)

  return NextResponse.json({ scores })
}

export const GET = withPerfLogging('pools/entry-match-scores', handleGET)
