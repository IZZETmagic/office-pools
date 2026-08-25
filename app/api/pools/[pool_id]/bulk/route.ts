import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'
import { getPoolBulkData } from '@/lib/poolData'
import { readAllLeaguePredictions, readLeagueRevealContext } from '@/lib/league/read'
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
  /**
   * League pools at Results depth, where a pick is a TAP rather than a
   * scoreline. Carried separately because `PredictionData` requires non-null
   * scores — widening it would put a nullable hole through four World Cup call
   * sites to describe a league concept. Absent for every bracket pool.
   */
  outcomes?: Array<{ entry_id: string; match_id: string; outcome: 'home' | 'draw' | 'away' }>
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
    .select('pool_id, prediction_mode, prediction_deadline, tournament_id, league_season_id')
    .eq('pool_id', pool_id)
    .maybeSingle()
  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  const bulk = await getPoolBulkData(pool_id)
  const matchScores = bulk.matchScores

  // A league pool's picks are in `league_predictions`, so the shared bulk read
  // returns an EMPTY predictions array for one — correctly, since it reads the
  // World Cup table. Its match SCORES do come through, because
  // readMatchScoresNarrow already has a league arm.
  const leagueSeasonId = (pool as { league_season_id?: string | null }).league_season_id ?? null
  let allPredictions = bulk.allPredictions
  let allOutcomes: NonNullable<PoolBulkResponse['outcomes']> = []

  if (leagueSeasonId) {
    // `pool_entries.pool_id` has been populated and trigger-maintained since
    // migration 056, so this no longer has to go through pool_members.
    // Retired entries are excluded for the same reason they are excluded from
    // the leaderboard: someone who stopped participating is not in the pool.
    const { data: entryRows } = await admin
      .from('pool_entries')
      .select('entry_id')
      .eq('pool_id', pool_id)
      .is('retired_at', null)
    const leagueEntryIds = ((entryRows ?? []) as Array<{ entry_id: string }>).map((e) => e.entry_id)

    const { predictions, outcomes, error } = await readAllLeaguePredictions(admin, leagueEntryIds)
    if (error) {
      // Loud. A silent empty array here reads to a member as "nobody has
      // picked", which is the failure mode this codebase keeps producing.
      console.error('[pools/bulk] league predictions failed:', error)
    }
    allPredictions = predictions as unknown as PredictionData[]
    allOutcomes = outcomes
  }

  // Admins see everything (matches the RLS admin-read policy and the per-entry
  // view route). Everyone else: own entries always, others only once revealable.
  if (isAdmin) {
    return NextResponse.json({
      predictions: allPredictions, matchScores,
      ...(leagueSeasonId ? { outcomes: allOutcomes } : {}),
    } satisfies PoolBulkResponse)
  }

  const { data: ownEntries } = await admin
    .from('pool_entries')
    .select('entry_id')
    .eq('member_id', membership!.member_id)
  const ownIds = new Set((ownEntries ?? []).map((e: { entry_id: string }) => e.entry_id))

  // The gate needs two things: which scopes have closed, and which scope each
  // pick belongs to. A league keeps neither where the World Cup does — it has
  // no `pool_round_states` rows at all (its round states are derived) and its
  // fixtures are not in `matches`.
  let revealRounds: Array<{ round_key: string; state: string | null; deadline: string | null }> = []
  let matchStageById = new Map<string, string>()

  if (leagueSeasonId) {
    const ctx = await readLeagueRevealContext(admin, leagueSeasonId)
    if (ctx.error) console.error('[pools/bulk] league reveal context failed:', ctx.error)
    revealRounds = ctx.roundStates
    matchStageById = ctx.stageById
  } else {
    const { data: roundStates } = await admin
      .from('pool_round_states')
      .select('round_key, state, deadline')
      .eq('pool_id', pool_id)
    revealRounds = (roundStates ?? []) as typeof revealRounds

    const { data: matchRows } = await admin
      .from('matches')
      .select('match_id, stage')
      .eq('tournament_id', pool.tournament_id)
    matchStageById = new Map(
      ((matchRows ?? []) as Array<{ match_id: string; stage: string | null }>).map(
        (m) => [m.match_id, m.stage ?? ''] as [string, string],
      ),
    )
  }

  const reveal = computeReveal(
    {
      prediction_mode: (pool.prediction_mode ?? 'full_tournament') as PredictionMode,
      prediction_deadline: pool.prediction_deadline,
    },
    revealRounds,
    new Date(),
  )

  const predictions = gatePoolPredictions({
    predictions: allPredictions,
    ownEntryIds: ownIds,
    isAdmin: false, // the admin case returned above
    reveal,
    matchStageById,
  })

  // Outcomes go through the SAME gate, not a parallel rule. They are picks; a
  // Results pool leaking them a matchweek early would be exactly the leak the
  // gate exists to prevent, and a second implementation of the rule is how that
  // happens.
  const revealedOutcomes = gatePoolPredictions({
    predictions: allOutcomes,
    ownEntryIds: ownIds,
    isAdmin: false,
    reveal,
    matchStageById,
  })

  return NextResponse.json({
    predictions, matchScores,
    ...(leagueSeasonId ? { outcomes: revealedOutcomes } : {}),
  } satisfies PoolBulkResponse)
}

export const GET = withPerfLogging('pools/bulk', handleGET)
