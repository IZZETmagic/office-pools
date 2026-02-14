import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminPanel } from './AdminPanel'

// =============================================
// TYPES
// =============================================
export type PoolData = {
  pool_id: string
  pool_name: string
  pool_code: string
  description: string | null
  status: string
  is_private: boolean
  max_participants: number | null
  tournament_id: string
  prediction_deadline: string | null
  created_at: string
  updated_at: string
}

export type MemberData = {
  member_id: string
  pool_id: string
  user_id: string
  role: string
  joined_at: string
  entry_fee_paid: boolean
  has_submitted_predictions: boolean
  predictions_submitted_at: string | null
  predictions_locked: boolean
  total_points: number
  current_rank: number | null
  last_rank_update: string | null
  users: {
    user_id: string
    username: string
    full_name: string
    email: string
  }
}

export type MatchData = {
  match_id: string
  tournament_id: string
  match_number: number
  stage: string
  group_letter: string | null
  home_team_id: string | null
  away_team_id: string | null
  home_team_placeholder: string | null
  away_team_placeholder: string | null
  match_date: string
  venue: string | null
  status: string
  home_score_ft: number | null
  away_score_ft: number | null
  home_score_pso: number | null
  away_score_pso: number | null
  winner_team_id: string | null
  is_completed: boolean
  completed_at: string | null
  home_team: { country_name: string } | null
  away_team: { country_name: string } | null
}

export type SettingsData = {
  setting_id: string
  pool_id: string
  group_exact_score: number
  group_correct_difference: number
  group_correct_result: number
  knockout_exact_score: number
  knockout_correct_difference: number
  knockout_correct_result: number
  round_16_multiplier: number
  quarter_final_multiplier: number
  semi_final_multiplier: number
  third_place_multiplier: number
  final_multiplier: number
  pso_enabled: boolean
  pso_exact_score: number | null
  pso_correct_difference: number | null
  pso_correct_result: number | null
  created_at: string
  updated_at: string
}

export type PredictionData = {
  prediction_id: string
  member_id: string
  match_id: string
  predicted_home_score: number
  predicted_away_score: number
}

// =============================================
// SERVER COMPONENT – auth check & data fetching
// =============================================
export default async function AdminPage({
  params,
}: {
  params: Promise<{ pool_id: string }>
}) {
  const { pool_id } = await params
  const supabase = await createClient()

  // STEP 1: Get current authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // STEP 2: Look up user_id from users table
  const { data: userData } = await supabase
    .from('users')
    .select('user_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) redirect('/pools')

  // STEP 3: Check pool_members for this pool_id + user_id
  const { data: membership } = await supabase
    .from('pool_members')
    .select('role, member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  // STEP 4: Verify role = 'admin'
  if (!membership || membership.role !== 'admin') {
    redirect(`/pools?error=admin_required`)
  }

  // STEP 5: Fetch all data needed for admin panel
  const [poolRes, membersRes, settingsRes] = await Promise.all([
    // Pool details
    supabase.from('pools').select('*').eq('pool_id', pool_id).single(),

    // Members with user info
    supabase
      .from('pool_members')
      .select('*, users!inner(user_id, username, full_name, email)')
      .eq('pool_id', pool_id)
      .order('current_rank', { ascending: true, nullsFirst: false }),

    // Pool settings
    supabase.from('pool_settings').select('*').eq('pool_id', pool_id).single(),
  ])

  const pool = poolRes.data as PoolData | null
  if (!pool) redirect('/pools')

  // Fetch matches using the pool's tournament_id
  const matchesRes = await supabase
    .from('matches')
    .select(
      `
      *,
      home_team:teams!matches_home_team_id_fkey(country_name),
      away_team:teams!matches_away_team_id_fkey(country_name)
    `
    )
    .eq('tournament_id', pool.tournament_id)
    .order('match_number', { ascending: true })

  // Fetch all predictions for this pool's members
  const memberIds = (membersRes.data || []).map((m: any) => m.member_id)
  let predictions: PredictionData[] = []
  if (memberIds.length > 0) {
    const { data: predData } = await supabase
      .from('predictions')
      .select('*')
      .in('member_id', memberIds)

    predictions = (predData || []) as PredictionData[]
  }

  const members = (membersRes.data || []) as MemberData[]

  // Normalize team data (Supabase sometimes returns arrays for joins)
  const matches: MatchData[] = (matchesRes.data || []).map((m: any) => ({
    ...m,
    home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
    away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
  }))

  const settings = settingsRes.data as SettingsData | null

  return (
    <AdminPanel
      pool={pool}
      members={members}
      matches={matches}
      settings={settings}
      predictions={predictions}
      currentUserId={userData.user_id}
    />
  )
}
