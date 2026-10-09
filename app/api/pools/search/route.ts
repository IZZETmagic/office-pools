import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withPerfLogging } from '@/lib/api-perf'

async function handleGET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const url = new URL(request.url)
  const q = url.searchParams.get('q') ?? ''
  const status = url.searchParams.get('status') ?? 'open'

  // Fetch pools the user is already in
  const { data: userPools } = await supabase
    .from('pool_members')
    .select('pool_id')
    .eq('user_id', userData.user_id)

  const userPoolIds = new Set((userPools ?? []).map((p: any) => p.pool_id))

  // Build query for public pools
  let query = supabase
    .from('pools')
    .select('pool_id, pool_name, pool_code, description, status, prediction_deadline, prediction_mode, league_mode, created_at')
    .eq('is_private', false)

  if (q.trim()) {
    query = query.or(`pool_name.ilike.%${q}%,pool_code.ilike.%${q}%,description.ilike.%${q}%`)
  }

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  query = query.order('created_at', { ascending: false }).limit(30)

  const { data: pools, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Filter out pools the user is already in
  const availablePools = (pools ?? []).filter((p: any) => !userPoolIds.has(p.pool_id))

  if (availablePools.length === 0) {
    return NextResponse.json({ pools: [] })
  }

  // ⚠ NOT FROM `pool_members`. That table is readable only by a pool's own
  // members, and every pool here is one the caller is NOT in — so counting it
  // returned 0 for every result. Migration 184's function returns the number,
  // and only the number, for public pools.
  const poolIds = availablePools.map((p: any) => p.pool_id)
  const { data: memberCounts, error: countError } = await supabase.rpc('public_pool_member_counts', {
    p_pool_ids: poolIds,
  })
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 })
  }

  const countMap = new Map<string, number>()
  for (const row of (memberCounts ?? []) as Array<{ pool_id: string; member_count: number }>) {
    countMap.set(row.pool_id, row.member_count)
  }

  const poolsWithCounts = availablePools.map((pool: any) => ({
    ...pool,
    memberCount: countMap.get(pool.pool_id) ?? 0,
  }))

  return NextResponse.json({ pools: poolsWithCounts })
}

export const GET = withPerfLogging('/api/pools/search', handleGET)
