import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { recalculatePool } from '@/lib/scoring'
import { withPerfLogging } from '@/lib/api-perf'

// =============================================================
// POST /api/pools/:poolId/recalculate
// Triggers a v2 score recalculation for the pool.
// Pool members can trigger this (e.g. after leaving a pool).
// =============================================================
async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error

  const result = await recalculatePool({ poolId: pool_id })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    entriesProcessed: result.entriesProcessed,
    matchScoresWritten: result.matchScoresWritten,
  })
}

export const POST = withPerfLogging('/api/pools/[id]/recalculate', handlePOST)
