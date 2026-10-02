import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { joinPool } from '@/lib/pools/join'

// The join itself — lookup, join-ability, the tier cap, restoring a returning
// member's entries, the first entry, the Showdown schedule — lives in
// lib/pools/join.ts so every door into a pool walks the same steps.
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { userData } = auth.data

  const { pool_id, pool_code } = await request.json()

  if (!pool_id && !pool_code) {
    return NextResponse.json({ error: 'pool_id or pool_code is required' }, { status: 400 })
  }

  // Admin client: the pool code is the auth mechanism for private pools, and
  // since migration 151 there is no client INSERT policy on pool_members.
  const result = await joinPool(
    createAdminClient(),
    pool_id ? { poolId: pool_id } : { poolCode: pool_code },
    userData.user_id,
  )

  if (!result.ok) {
    return NextResponse.json(
      result.reason ? { error: result.error, reason: result.reason } : { error: result.error },
      { status: result.status },
    )
  }

  return NextResponse.json({
    member_id: result.memberId,
    pool_id: result.poolId,
    pool_name: result.poolName,
    restored_entries: result.restoredEntries,
  })
}
