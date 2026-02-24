import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PoolsClient } from './PoolsClient'

export default async function PoolsPage() {
  const supabase = await createClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('user_id, username, full_name, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) redirect('/login')

  // Fetch ALL user pools (past and present) with pool details
  const { data: userPools } = await supabase
    .from('pool_members')
    .select(`
      member_id,
      role,
      total_points,
      current_rank,
      has_submitted_predictions,
      joined_at,
      pools!inner(
        pool_id,
        pool_name,
        pool_code,
        description,
        status,
        is_private,
        prediction_deadline,
        tournament_id,
        created_at
      )
    `)
    .eq('user_id', userData.user_id)
    .order('joined_at', { ascending: false })

  // Enrich pools with member counts
  const pools = await Promise.all(
    (userPools ?? []).map(async (m: any) => {
      const pool = m.pools

      const { count: memberCount } = await supabase
        .from('pool_members')
        .select('*', { count: 'exact', head: true })
        .eq('pool_id', pool.pool_id)

      return {
        ...pool,
        role: m.role,
        total_points: m.total_points ?? 0,
        current_rank: m.current_rank,
        has_submitted_predictions: m.has_submitted_predictions,
        joined_at: m.joined_at,
        memberCount: memberCount ?? 0,
      }
    })
  )

  // Stats for hero
  const totalPools = pools.length
  const activePools = pools.filter((p: any) => p.status === 'open' || p.status === 'active').length
  const totalPoints = pools.reduce((sum: number, p: any) => sum + (p.total_points ?? 0), 0)

  return (
    <PoolsClient
      user={userData}
      pools={pools}
      stats={{ totalPools, activePools, totalPoints }}
    />
  )
}
