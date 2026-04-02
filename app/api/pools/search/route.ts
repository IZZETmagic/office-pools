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
    .select('pool_id, pool_name, pool_code, description, status, prediction_deadline, prediction_mode, created_at')
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

  // Fetch member counts in a single query instead of N+1
  const poolIds = availablePools.map((p: any) => p.pool_id)
  const { data: memberCounts } = await supabase
    .from('pool_members')
    .select('pool_id')
    .in('pool_id', poolIds)

  // Build a count map
  const countMap = new Map<string, number>()
  for (const row of memberCounts ?? []) {
    countMap.set(row.pool_id, (countMap.get(row.pool_id) ?? 0) + 1)
  }

  const poolsWithCounts = availablePools.map((pool: any) => ({
    ...pool,
    memberCount: countMap.get(pool.pool_id) ?? 0,
  }))

  return NextResponse.json({ pools: poolsWithCounts })
}

export const GET = withPerfLogging('/api/pools/search', handleGET)
