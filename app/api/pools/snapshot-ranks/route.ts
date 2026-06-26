import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { withPerfLogging } from '@/lib/api-perf'
import { snapshotPoolRanks } from '@/lib/scoring/snapshotRanks'

// =============================================================
// POST /api/pools/snapshot-ranks
// Snapshots current_rank → previous_rank for all entries in the
// given pools. Called when a match is set to live and no other
// match is currently live (new matchday baseline). The automated
// sync-fixtures cron does the same via snapshotPoolRanks directly.
// =============================================================
async function handlePOST(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const body = await request.json()
  const poolIds: string[] = body.pool_ids
  if (!poolIds || poolIds.length === 0) {
    return NextResponse.json({ error: 'No pool_ids provided' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  try {
    const snapshotted = await snapshotPoolRanks(adminClient, poolIds)
    return NextResponse.json({ success: true, snapshotted })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export const POST = withPerfLogging('/api/pools/snapshot-ranks', handlePOST)
