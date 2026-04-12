import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { withPerfLogging } from '@/lib/api-perf'

// =============================================================
// POST /api/pools/snapshot-ranks
// Snapshots current_rank → previous_rank for all entries in the
// given pools. Called when a match is set to live and no other
// match is currently live (new matchday baseline).
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

  // Fetch all entries for the given pools
  const { data: members } = await adminClient
    .from('pool_members')
    .select('member_id')
    .in('pool_id', poolIds)

  if (!members || members.length === 0) {
    return NextResponse.json({ success: true, snapshotted: 0 })
  }

  const memberIds = members.map((m: any) => m.member_id)

  const { data: entries } = await adminClient
    .from('pool_entries')
    .select('entry_id, current_rank')
    .in('member_id', memberIds)

  if (!entries || entries.length === 0) {
    return NextResponse.json({ success: true, snapshotted: 0 })
  }

  // Write current_rank → previous_rank for each entry
  const batchSize = 50
  let snapshotted = 0
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize)
    await Promise.all(
      batch.map((entry: { entry_id: string; current_rank: number | null }) =>
        adminClient
          .from('pool_entries')
          .update({ previous_rank: entry.current_rank })
          .eq('entry_id', entry.entry_id)
          .then(({ error }: { error: any }) => {
            if (error) {
              console.error(`[snapshot-ranks] Failed for ${entry.entry_id}:`, error)
            } else {
              snapshotted++
            }
          })
      )
    )
  }

  return NextResponse.json({ success: true, snapshotted })
}

export const POST = withPerfLogging('/api/pools/snapshot-ranks', handlePOST)
