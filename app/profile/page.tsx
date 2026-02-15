import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfilePage from './ProfilePage'

export default async function ProfileServerPage() {
  const supabase = await createClient()

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get user profile from users table
  const { data: profile } = await supabase
    .from('users')
    .select('user_id, username, full_name, email, created_at')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) redirect('/login')

  // Get user's pool memberships with pool details
  const { data: userPools } = await supabase
    .from('pool_members')
    .select(`
      member_id,
      pool_id,
      role,
      total_points,
      current_rank,
      has_submitted_predictions,
      joined_at,
      pools!inner(
        pool_id,
        pool_name
      )
    `)
    .eq('user_id', profile.user_id)

  const poolMemberships = (userPools ?? []).map((m: any) => ({
    member_id: m.member_id,
    pool_id: m.pool_id,
    pool_name: m.pools.pool_name,
    role: m.role,
    total_points: m.total_points ?? 0,
    current_rank: m.current_rank,
    has_submitted_predictions: m.has_submitted_predictions,
    joined_at: m.joined_at,
  }))

  // Get member counts for each pool (for rank display like #2/12)
  const memberCounts: Record<string, number> = {}
  for (const pool of poolMemberships) {
    const { count } = await supabase
      .from('pool_members')
      .select('*', { count: 'exact', head: true })
      .eq('pool_id', pool.pool_id)
    memberCounts[pool.pool_id] = count ?? 0
  }

  // Get all predictions for the user's memberships
  const memberIds = poolMemberships.map((p: any) => p.member_id)
  let predictions: any[] = []

  if (memberIds.length > 0) {
    const { data: predictionData } = await supabase
      .from('predictions')
      .select(`
        prediction_id,
        member_id,
        match_id,
        predicted_home_score,
        predicted_away_score,
        points_awarded,
        matches!inner(
          match_id,
          match_number,
          stage,
          group_letter,
          match_date,
          status,
          home_score_ft,
          away_score_ft,
          home_team_placeholder,
          away_team_placeholder,
          home_team:teams!matches_home_team_id_fkey(country_name),
          away_team:teams!matches_away_team_id_fkey(country_name)
        )
      `)
      .in('member_id', memberIds)
      .order('match_date', { referencedTable: 'matches', ascending: false })

    predictions = predictionData ?? []
  }

  // Get pool settings for each pool (needed for accurate points display)
  const poolSettingsMap: Record<string, any> = {}
  for (const pool of poolMemberships) {
    const { data: settings } = await supabase
      .from('pool_settings')
      .select('*')
      .eq('pool_id', pool.pool_id)
      .single()
    if (settings) {
      poolSettingsMap[pool.pool_id] = settings
    }
  }

  // Get total match counts per pool's tournament for prediction ratio
  // We'll get all matches since all pools share the same tournament
  const { count: totalMatchCount } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })

  return (
    <ProfilePage
      profile={{
        user_id: profile.user_id,
        username: profile.username,
        full_name: profile.full_name,
        email: user.email ?? '',
        created_at: profile.created_at,
      }}
      poolMemberships={poolMemberships}
      memberCounts={memberCounts}
      predictions={predictions}
      totalMatchCount={totalMatchCount ?? 0}
      poolSettingsMap={poolSettingsMap}
    />
  )
}
