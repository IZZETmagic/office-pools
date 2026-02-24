import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: userData } = await supabase
    .from('users')
    .select('user_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

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
    .select('pool_id, pool_name, pool_code, description, status, prediction_deadline, created_at')
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

  // Filter out pools the user is already in and get member counts
  const availablePools = (pools ?? []).filter((p: any) => !userPoolIds.has(p.pool_id))

  // Fetch member counts for the available pools
  const poolsWithCounts = await Promise.all(
    availablePools.map(async (pool: any) => {
      const { count } = await supabase
        .from('pool_members')
        .select('*', { count: 'exact', head: true })
        .eq('pool_id', pool.pool_id)

      return { ...pool, memberCount: count ?? 0 }
    })
  )

  return NextResponse.json({ pools: poolsWithCounts })
}
