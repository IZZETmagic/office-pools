import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'
import { unstable_cache } from 'next/cache'
import { POOL_CACHE_TTL_SECONDS, poolBulkCacheTag, isPoolCacheEnabled } from '@/lib/poolData'
import type { MatchPredictionAggregate } from '@/app/pools/[pool_id]/analytics/analyticsHelpers'

// =============================================================
// GET /api/pools/:pool_id/crowd
//
// Per-match crowd aggregate: how the pool split across home/draw/away, how many
// were right, and the most popular scoreline. Counted in the database
// (migration 039).
//
// WHY IT EXISTS: this is the only pool-wide input the Form tab needs. Everything
// else it renders comes from the viewer's OWN entry. Serving it here lets Form
// stop pulling the per-tab bulk payload (every prediction + every score row in
// the pool) to compute percentages it could read.
//
// SUBMITTED-ONLY, deliberately: this mirrors computeCrowdConsensus, which ignores
// unsubmitted drafts. The Banter sidebar's Matchday Pulse uses the SAME function
// with the flag off, because it has always counted everyone. Two callers, two
// populations — see the migration for why that is a parameter.
//
// Contains no per-viewer data — it is counts over the whole pool — so it is
// cached per pool and shared, under the same tag the bulk payload uses so a
// score change expires both.
// =============================================================

export type PoolCrowdResponse = {
  aggregate: MatchPredictionAggregate[]
}

function readCrowdCached(poolId: string): Promise<MatchPredictionAggregate[]> {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const { data } = await admin.rpc('pool_match_prediction_accuracy', {
        p_pool_id: poolId,
        p_submitted_only: true,
      })
      return (data ?? []) as MatchPredictionAggregate[]
    },
    ['pool-crowd-aggregate', poolId],
    { tags: [poolBulkCacheTag(poolId)], revalidate: POOL_CACHE_TTL_SECONDS },
  )()
}

async function readCrowdUncached(poolId: string): Promise<MatchPredictionAggregate[]> {
  const admin = createAdminClient()
  const { data } = await admin.rpc('pool_match_prediction_accuracy', {
    p_pool_id: poolId,
    p_submitted_only: true,
  })
  return (data ?? []) as MatchPredictionAggregate[]
}

async function handleGET(
  _request: NextRequest,
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

  if (!membership && userData.is_super_admin !== true) {
    return NextResponse.json({ error: 'Not a member of this pool' }, { status: 403 })
  }

  const aggregate = (await isPoolCacheEnabled())
    ? await readCrowdCached(pool_id)
    : await readCrowdUncached(pool_id)

  return NextResponse.json({ aggregate } satisfies PoolCrowdResponse)
}

export const GET = withPerfLogging('pools/crowd', handleGET)
