import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfilePage from './ProfilePage'
import { calculatePoints, DEFAULT_POOL_SETTINGS, type PoolSettings } from '@/app/pools/[pool_id]/results/points'
import { calculateAllBonusPoints, type MatchWithResult } from '@/lib/bonusCalculation'
import type { PredictionMap, Team, MatchConductData } from '@/lib/tournament'

export default async function ProfileServerPage() {
  const supabase = await createClient()

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get user profile from users table
  const { data: profile } = await supabase
    .from('users')
    .select('user_id, username, full_name, email, created_at, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) redirect('/login')

  // Get user's pool memberships with pool details and prediction counts
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
        pool_name,
        tournament_id
      ),
      predictions(prediction_id)
    `)
    .eq('user_id', profile.user_id)

  const poolMemberships = (userPools ?? []).map((m: any) => ({
    member_id: m.member_id,
    pool_id: m.pool_id,
    pool_name: m.pools.pool_name,
    tournament_id: m.pools.tournament_id,
    role: m.role,
    total_points: m.total_points ?? 0,
    current_rank: m.current_rank,
    has_submitted_predictions: m.has_submitted_predictions,
    joined_at: m.joined_at,
    prediction_count: Array.isArray(m.predictions) ? m.predictions.length : 0,
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

  // Get all predictions for the user's memberships (with match details)
  const memberIds = poolMemberships.map((p: any) => p.member_id)
  let predictions: any[] = []

  if (memberIds.length > 0) {
    // Fetch predictions per member separately to avoid join deduplication issues
    const allPredictions: any[] = []
    for (const memberId of memberIds) {
      const { data: predictionData } = await supabase
        .from('predictions')
        .select(`
          prediction_id,
          member_id,
          match_id,
          predicted_home_score,
          predicted_away_score,
          points_awarded,
          matches(
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
        .eq('member_id', memberId)

      if (predictionData) {
        allPredictions.push(...predictionData)
      }
    }

    // Normalize: unwrap matches if returned as array
    predictions = allPredictions.map((p: any) => ({
      ...p,
      matches: Array.isArray(p.matches) ? p.matches[0] : p.matches,
    }))

    // Sort by match_date descending
    predictions.sort((a: any, b: any) => {
      const dateA = new Date(a.matches?.match_date ?? 0).getTime()
      const dateB = new Date(b.matches?.match_date ?? 0).getTime()
      return dateB - dateA
    })
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

  // Fetch shared data needed for on-the-fly bonus calculation (teams, conduct)
  const [{ data: allTeams }, { data: conductRes }] = await Promise.all([
    supabase
      .from('teams')
      .select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url')
      .order('group_letter', { ascending: true })
      .order('fifa_ranking_points', { ascending: false }),
    supabase
      .from('match_conduct')
      .select('match_id, team_id, yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards'),
  ])

  const teams: Team[] = (allTeams ?? []).map((t: any) => ({
    ...t,
    group_letter: t.group_letter?.trim() || '',
    country_code: t.country_code?.trim() || '',
  }))

  const conductData: MatchConductData[] = (conductRes ?? []) as MatchConductData[]

  // Calculate match + bonus points on-the-fly for each membership (same as dashboard)
  const playerScoresMap: Record<string, { match_points: number; bonus_points: number; total_points: number }> = {}

  for (const pool of poolMemberships) {
    // Get ALL matches for this pool's tournament
    const { data: allMatches } = await supabase
      .from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(country_name, flag_url), away_team:teams!matches_away_team_id_fkey(country_name, flag_url)')
      .eq('tournament_id', pool.tournament_id)
      .order('match_number', { ascending: true })

    const normalizedMatches: MatchWithResult[] = (allMatches ?? []).map((match: any) => ({
      ...match,
      home_team: Array.isArray(match.home_team) ? match.home_team[0] ?? null : match.home_team,
      away_team: Array.isArray(match.away_team) ? match.away_team[0] ?? null : match.away_team,
    }))

    // Get user's predictions for this pool (with PSO + winner fields for bonus calc)
    const { data: memberPredictions } = await supabase
      .from('predictions')
      .select('match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
      .eq('member_id', pool.member_id)

    const poolSettings: PoolSettings = poolSettingsMap[pool.pool_id]
      ? { ...DEFAULT_POOL_SETTINGS, ...poolSettingsMap[pool.pool_id] }
      : DEFAULT_POOL_SETTINGS

    // Calculate MATCH points
    const predictionLookup = new Map(
      (memberPredictions ?? []).map((p: any) => [p.match_id, p])
    )

    let matchPoints = 0
    const completedMatchesList = normalizedMatches.filter(
      (match: any) => (match.status === 'completed' || match.status === 'live') && match.home_score_ft !== null && match.away_score_ft !== null
    )

    for (const match of completedMatchesList) {
      const pred = predictionLookup.get(match.match_id)
      if (pred && match.home_score_ft !== null && match.away_score_ft !== null) {
        const hasPso = match.home_score_pso !== null && match.away_score_pso !== null
        const result = calculatePoints(
          pred.predicted_home_score,
          pred.predicted_away_score,
          match.home_score_ft,
          match.away_score_ft,
          match.stage,
          poolSettings,
          hasPso
            ? {
                actualHomePso: match.home_score_pso!,
                actualAwayPso: match.away_score_pso!,
                predictedHomePso: pred.predicted_home_pso ?? null,
                predictedAwayPso: pred.predicted_away_pso ?? null,
              }
            : undefined
        )
        matchPoints += result.points
      }
    }

    // Calculate BONUS points
    let bonusPoints = 0
    if (memberPredictions && memberPredictions.length > 0) {
      const predictionMap: PredictionMap = new Map()
      for (const p of memberPredictions) {
        predictionMap.set(p.match_id, {
          home: p.predicted_home_score,
          away: p.predicted_away_score,
          homePso: p.predicted_home_pso ?? null,
          awayPso: p.predicted_away_pso ?? null,
          winnerTeamId: p.predicted_winner_team_id ?? null,
        })
      }

      const bonusEntries = calculateAllBonusPoints({
        memberId: pool.member_id,
        memberPredictions: predictionMap,
        matches: normalizedMatches,
        teams,
        conductData,
        settings: poolSettings,
        tournamentAwards: null,
      })

      bonusPoints = bonusEntries.reduce((sum, e) => sum + e.points_earned, 0)
    }

    playerScoresMap[pool.member_id] = {
      match_points: matchPoints,
      bonus_points: bonusPoints,
      total_points: matchPoints + bonusPoints,
    }
  }

  // Get total match counts per pool's tournament for prediction ratio
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
        is_super_admin: profile.is_super_admin ?? false,
      }}
      poolMemberships={poolMemberships}
      memberCounts={memberCounts}
      predictions={predictions}
      totalMatchCount={totalMatchCount ?? 0}
      poolSettingsMap={poolSettingsMap}
      playerScoresMap={playerScoresMap}
    />
  )
}
