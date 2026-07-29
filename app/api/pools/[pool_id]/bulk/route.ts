import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'
import { getPoolBulkData } from '@/lib/poolData'
import { computeReveal, gatePoolPredictions, type PredictionMode } from '@/lib/predictions/revealGate'
import type { PredictionData, MatchScoreNarrow } from '@/app/pools/[pool_id]/types'

// =============================================================
// GET /api/pools/:pool_id/bulk
//
// The two pool-wide arrays that used to ride along on every pool open:
// `predictions` (3,815 kB) and narrow `match_scores` (3,515 kB) on the largest
// pool — 95% of a 7,721 kB payload, for tabs most viewers never open.
//
// The leaderboard (the default tab) reads neither any more: it reads the
// precomputed per-entry stats. So these load only when a tab that genuinely
// needs them is opened — analytics, community, results, members, entries list.
//
// ⚠ THE REVEAL GATE LIVES HERE, AND IT MUST STAY SERVER-SIDE.
// The underlying fetch is an admin read (it has to be — it is shared and cached
// across viewers, and RLS would make it per-viewer). This route is what strips
// other members' still-unlocked picks BEFORE they cross to the browser. Filtering
// in the client would ship them and merely hide them — the exact bug the
// member-predictions feature was designed not to have.
// =============================================================

export type PoolBulkResponse = {
  predictions: PredictionData[]
  matchScores: MatchScoreNarrow[]
}

async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> },
) {
  const { pool_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  // Membership — or a super admin viewing without joining, which is exactly what
  // page.tsx allows for the page itself. Kept identical so a super admin does
  // not get a half-rendered pool.
  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id, role')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .maybeSingle()

  const isSuperAdminViewing = !membership && userData.is_super_admin === true
  if (!membership && !isSuperAdminViewing) {
    return NextResponse.json({ error: 'Not a member of this pool' }, { status: 403 })
  }
  const isAdmin = isSuperAdminViewing || membership!.role === 'admin'

  const admin = createAdminClient()

  const { data: pool } = await admin
    .from('pools')
    .select('pool_id, prediction_mode, prediction_deadline, tournament_id')
    .eq('pool_id', pool_id)
    .maybeSingle()
  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  const { allPredictions, matchScores } = await getPoolBulkData(pool_id)

  // Admins see everything (matches the RLS admin-read policy and the per-entry
  // view route). Everyone else: own entries always, others only once revealable.
  if (isAdmin) {
    return NextResponse.json({ predictions: allPredictions, matchScores } satisfies PoolBulkResponse)
  }

  const { data: ownEntries } = await admin
    .from('pool_entries')
    .select('entry_id')
    .eq('member_id', membership!.member_id)
  const ownIds = new Set((ownEntries ?? []).map((e: { entry_id: string }) => e.entry_id))

  const { data: roundStates } = await admin
    .from('pool_round_states')
    .select('round_key, state, deadline')
    .eq('pool_id', pool_id)

  const { data: matchRows } = await admin
    .from('matches')
    .select('match_id, stage')
    .eq('tournament_id', pool.tournament_id)
  const matchStageById = new Map(
    ((matchRows ?? []) as Array<{ match_id: string; stage: string | null }>).map(
      (m) => [m.match_id, m.stage ?? ''] as [string, string],
    ),
  )

  const reveal = computeReveal(
    {
      prediction_mode: (pool.prediction_mode ?? 'full_tournament') as PredictionMode,
      prediction_deadline: pool.prediction_deadline,
    },
    (roundStates ?? []).map((r: { round_key: string; state: string; deadline: string | null }) => ({
      round_key: r.round_key,
      state: r.state,
      deadline: r.deadline,
    })),
    new Date(),
  )

  const predictions = gatePoolPredictions({
    predictions: allPredictions,
    ownEntryIds: ownIds,
    isAdmin: false, // the admin case returned above
    reveal,
    matchStageById,
  })

  return NextResponse.json({ predictions, matchScores } satisfies PoolBulkResponse)
}

export const GET = withPerfLogging('pools/bulk', handleGET)
