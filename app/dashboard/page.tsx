import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardClient } from './DashboardClient'
import { calculatePoints, DEFAULT_POOL_SETTINGS, type PoolSettings } from '@/app/pools/[pool_id]/results/points'
import { calculateAllBonusPoints, type MatchWithResult } from '@/lib/bonusCalculation'
import type { PredictionMap, Team, MatchConductData } from '@/lib/tournament'

export default async function DashboardPage() {
  const supabase = await createClient()

  // STEP 1: Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // STEP 2: Look up user_id from users table
  const { data: userData } = await supabase
    .from('users')
    .select('user_id, username, full_name')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) redirect('/login')

  // STEP 3: Fetch user's pools via pool_members
  const { data: userPools } = await supabase
    .from('pool_members')
    .select(`
      member_id,
      role,
      total_points,
      current_rank,
      has_submitted_predictions,
      predictions_submitted_at,
      predictions_last_saved_at,
      joined_at,
      pools!inner(
        pool_id,
        pool_name,
        pool_code,
        description,
        status,
        prediction_deadline,
        tournament_id
      )
    `)
    .eq('user_id', userData.user_id)
    .order('joined_at', { ascending: false })

  // STEP 4: Fetch upcoming matches (next 5 unplayed matches)
  const { data: upcomingMatches } = await supabase
    .from('matches')
    .select(`
      match_id,
      match_number,
      stage,
      match_date,
      status,
      home_team:teams!matches_home_team_id_fkey(country_name),
      away_team:teams!matches_away_team_id_fkey(country_name),
      home_team_placeholder,
      away_team_placeholder
    `)
    .in('status', ['scheduled', 'upcoming'])
    .order('match_date', { ascending: true })
    .limit(5)

  // Normalize team data (Supabase may return arrays for FK joins)
  const normalizedUpcomingMatches = (upcomingMatches ?? []).map((m: any) => ({
    ...m,
    home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
    away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
  }))

  // STEP 5: Fetch shared data needed for bonus calculation (teams, conduct)
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

  // STEP 6: Enrich each pool with calculated points (match + bonus), member count, match counts
  const pools = await Promise.all(
    (userPools ?? []).map(async (m: any) => {
      const pool = m.pools

      // Get member count
      const { count: memberCount } = await supabase
        .from('pool_members')
        .select('*', { count: 'exact', head: true })
        .eq('pool_id', pool.pool_id)

      // Get total matches count
      const { count: totalMatchesCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', pool.tournament_id)

      // Get ALL matches for this tournament (needed for bonus calculation)
      const { data: allMatches } = await supabase
        .from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(country_name, flag_url), away_team:teams!matches_away_team_id_fkey(country_name, flag_url)')
        .eq('tournament_id', pool.tournament_id)
        .order('match_number', { ascending: true })

      // Normalize match join results
      const normalizedMatches: MatchWithResult[] = (allMatches ?? []).map((match: any) => ({
        ...match,
        home_team: Array.isArray(match.home_team) ? match.home_team[0] ?? null : match.home_team,
        away_team: Array.isArray(match.away_team) ? match.away_team[0] ?? null : match.away_team,
      }))

      // Get user's predictions for this pool (with winner_team_id for bonus calc)
      const { data: predictions } = await supabase
        .from('predictions')
        .select('match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
        .eq('member_id', m.member_id)

      // Get pool settings
      const { data: rawPoolSettings } = await supabase
        .from('pool_settings')
        .select('*')
        .eq('pool_id', pool.pool_id)
        .single()

      const poolSettings: PoolSettings = rawPoolSettings
        ? { ...DEFAULT_POOL_SETTINGS, ...rawPoolSettings }
        : DEFAULT_POOL_SETTINGS

      // Build prediction lookup and calculate MATCH points
      const predictionLookup = new Map(
        (predictions ?? []).map((p: any) => [p.match_id, p])
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
      if (predictions && predictions.length > 0) {
        const predictionMap: PredictionMap = new Map()
        for (const p of predictions) {
          predictionMap.set(p.match_id, {
            home: p.predicted_home_score,
            away: p.predicted_away_score,
            homePso: p.predicted_home_pso ?? null,
            awayPso: p.predicted_away_pso ?? null,
            winnerTeamId: p.predicted_winner_team_id ?? null,
          })
        }

        const bonusEntries = calculateAllBonusPoints({
          memberId: m.member_id,
          memberPredictions: predictionMap,
          matches: normalizedMatches,
          teams,
          conductData,
          settings: poolSettings,
          tournamentAwards: null,
        })

        bonusPoints = bonusEntries.reduce((sum, e) => sum + e.points_earned, 0)
      }

      // Count predicted matches
      const predictedMatches = predictions?.length ?? 0

      return {
        ...pool,
        role: m.role,
        match_points: matchPoints,
        bonus_points: bonusPoints,
        total_points: matchPoints + bonusPoints,
        current_rank: m.current_rank,
        has_submitted_predictions: m.has_submitted_predictions,
        predictions_submitted_at: m.predictions_submitted_at,
        predictions_last_saved_at: m.predictions_last_saved_at,
        joined_at: m.joined_at,
        memberCount: memberCount ?? 0,
        totalMatches: totalMatchesCount ?? 0,
        completedMatches: completedMatchesList.length,
        predictedMatches,
      }
    })
  )

  // Calculate stats
  const totalPools = pools.length
  const totalPoints = pools.reduce((sum: number, p: any) => sum + (p.total_points ?? 0), 0)
  const bestRank = pools
    .filter((p: any) => p.current_rank != null)
    .reduce((best: number | null, p: any) => {
      if (best === null) return p.current_rank
      return p.current_rank < best ? p.current_rank : best
    }, null as number | null)

  // Build activity feed
  const activities = pools
    .map((p: any) => ({
      type: 'joined' as const,
      poolName: p.pool_name,
      poolId: p.pool_id,
      date: p.joined_at,
      hasPredictions: p.has_submitted_predictions,
    }))
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  return (
    <DashboardClient
      user={userData}
      pools={pools}
      upcomingMatches={normalizedUpcomingMatches}
      activities={activities}
      totalPools={totalPools}
      totalPoints={totalPoints}
      bestRank={bestRank}
    />
  )
}
