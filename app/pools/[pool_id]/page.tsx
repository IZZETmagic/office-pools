import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PoolDetail } from './PoolDetail'
import type {
  PoolData,
  MemberData,
  MatchData,
  SettingsData,
  PredictionData,
  TeamData,
  ExistingPrediction,
  PlayerScoreData,
  BonusScoreData,
} from './types'

export default async function PoolPage({
  params,
}: {
  params: Promise<{ pool_id: string }>
}) {
  const { pool_id } = await params
  const supabase = await createClient()

  // STEP 1: Get authenticated user
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

  if (!userData) redirect('/dashboard')

  // STEP 3: Check membership
  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id, role')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership) redirect('/dashboard')

  const isAdmin = membership.role === 'admin'

  // STEP 4: Fetch all data in parallel
  const [poolRes, membersRes, settingsRes, teamsRes] = await Promise.all([
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

    // All teams (for predictions)
    supabase
      .from('teams')
      .select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url')
      .order('group_letter', { ascending: true })
      .order('fifa_ranking_points', { ascending: false }),
  ])

  const pool = poolRes.data as PoolData | null
  if (!pool) redirect('/dashboard')

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

  // Normalize team data (Supabase sometimes returns arrays for joins)
  const matches: MatchData[] = (matchesRes.data || []).map((m: any) => ({
    ...m,
    home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
    away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
  }))

  const members = (membersRes.data || []) as MemberData[]
  const settings = settingsRes.data as SettingsData | null
  const teams = (teamsRes.data || []) as TeamData[]

  // Fetch conduct data for group stage tiebreakers
  const [{ data: conductRes }, { data: playerScoresRes }, { data: bonusScoresRes }] = await Promise.all([
    supabase
      .from('match_conduct')
      .select('match_id, team_id, yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards'),
    supabase
      .from('player_scores')
      .select('member_id, match_points, bonus_points, total_points')
      .in('member_id', members.map(m => m.member_id)),
    supabase
      .from('bonus_scores')
      .select('bonus_score_id, member_id, bonus_type, bonus_category, related_group_letter, related_match_id, points_earned, description')
      .in('member_id', members.map(m => m.member_id)),
  ])

  const conductData = (conductRes || []) as {
    match_id: string
    team_id: string
    yellow_cards: number
    indirect_red_cards: number
    direct_red_cards: number
    yellow_direct_red_cards: number
  }[]

  const playerScores = (playerScoresRes || []) as {
    member_id: string
    match_points: number
    bonus_points: number
    total_points: number
  }[]

  const bonusScores = (bonusScoresRes || []) as BonusScoreData[]

  // Fetch user's predictions (for results + predictions tabs)
  const { data: userPredictions } = await supabase
    .from('predictions')
    .select('match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id, prediction_id')
    .eq('member_id', membership.member_id)

  // Fetch all predictions (needed for admin tabs + leaderboard bonus computation)
  let allPredictions: PredictionData[] = []
  const memberIds = members.map((m) => m.member_id)
  if (memberIds.length > 0) {
    const { data: predData } = await supabase
      .from('predictions')
      .select('*')
      .in('member_id', memberIds)

    allPredictions = (predData || []) as PredictionData[]
  }

  // Check deadline
  const isPastDeadline = pool.prediction_deadline
    ? new Date(pool.prediction_deadline) < new Date()
    : false

  const psoEnabled = settings?.pso_enabled ?? true

  // Get the current member's submission state
  const currentMember = members.find(m => m.member_id === membership.member_id)

  return (
    <PoolDetail
      pool={pool}
      members={members}
      matches={matches}
      settings={settings}
      userPredictions={(userPredictions || []) as ExistingPrediction[]}
      allPredictions={allPredictions}
      teams={teams}
      conductData={conductData}
      playerScores={playerScores}
      bonusScores={bonusScores}
      memberId={membership.member_id}
      currentUserId={userData.user_id}
      isAdmin={isAdmin}
      isPastDeadline={isPastDeadline}
      psoEnabled={psoEnabled}
      hasSubmitted={currentMember?.has_submitted_predictions ?? false}
      submittedAt={currentMember?.predictions_submitted_at ?? null}
      lastSavedAt={currentMember?.predictions_last_saved_at ?? null}
      predictionsLocked={currentMember?.predictions_locked ?? false}
    />
  )
}
