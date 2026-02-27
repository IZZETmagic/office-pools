import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PoolsClient } from './PoolsClient'
import { calculatePoints, checkKnockoutTeamsMatch, DEFAULT_POOL_SETTINGS, type PoolSettings } from '@/app/pools/[pool_id]/results/points'
import { calculateAllBonusPoints, type MatchWithResult } from '@/lib/bonusCalculation'
import { resolveFullBracket } from '@/lib/bracketResolver'
import type { PredictionMap, Team, MatchConductData } from '@/lib/tournament'

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

  // Fetch ALL user pools (past and present) with pool details and entries
  const { data: userPools } = await supabase
    .from('pool_members')
    .select(`
      member_id,
      role,
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
      ),
      pool_entries(
        entry_id,
        entry_name,
        entry_number,
        has_submitted_predictions,
        predictions_submitted_at,
        total_points,
        current_rank
      )
    `)
    .eq('user_id', userData.user_id)
    .order('joined_at', { ascending: false })

  // Fetch shared data needed for bonus calculation (teams, conduct)
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

  // Enrich pools with member counts and calculated points (match + bonus)
  const pools = await Promise.all(
    (userPools ?? []).map(async (m: any) => {
      const pool = m.pools

      // Get member count
      const { count: memberCount } = await supabase
        .from('pool_members')
        .select('*', { count: 'exact', head: true })
        .eq('pool_id', pool.pool_id)

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

      // Get entries for this member
      const entries = ((m as any).pool_entries || []) as any[]
      const bestEntry = entries.length > 0
        ? entries.reduce((best: any, e: any) => (e.total_points > best.total_points ? e : best), entries[0])
        : null
      const anySubmitted = entries.some((e: any) => e.has_submitted_predictions)
      const defaultEntryId = bestEntry?.entry_id || entries[0]?.entry_id

      // Get user's predictions for this pool
      const { data: predictions } = defaultEntryId
        ? await supabase
            .from('predictions')
            .select('match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
            .eq('entry_id', defaultEntryId)
        : { data: null }

      // Get pool settings
      const { data: rawPoolSettings } = await supabase
        .from('pool_settings')
        .select('*')
        .eq('pool_id', pool.pool_id)
        .single()

      const poolSettings: PoolSettings = rawPoolSettings
        ? { ...DEFAULT_POOL_SETTINGS, ...rawPoolSettings }
        : DEFAULT_POOL_SETTINGS

      // Build prediction maps
      const predictionLookup = new Map(
        (predictions ?? []).map((p: any) => [p.match_id, p])
      )

      const predictionMap: PredictionMap = new Map()
      for (const p of (predictions ?? [])) {
        predictionMap.set(p.match_id, {
          home: p.predicted_home_score,
          away: p.predicted_away_score,
          homePso: p.predicted_home_pso ?? null,
          awayPso: p.predicted_away_pso ?? null,
          winnerTeamId: p.predicted_winner_team_id ?? null,
        })
      }

      // Resolve bracket for knockout team matching
      const bracket = resolveFullBracket({
        matches: normalizedMatches,
        predictionMap,
        teams,
        conductData,
      })

      // Calculate MATCH points
      let matchPoints = 0
      const completedMatchesList = normalizedMatches.filter(
        (match: any) => (match.status === 'completed' || match.status === 'live') && match.home_score_ft !== null && match.away_score_ft !== null
      )

      for (const match of completedMatchesList) {
        const pred = predictionLookup.get(match.match_id)
        if (pred && match.home_score_ft !== null && match.away_score_ft !== null) {
          const resolved = bracket.knockoutTeamMap.get(match.match_number)
          const teamsMatch = checkKnockoutTeamsMatch(
            match.stage,
            match.home_team_id,
            match.away_team_id,
            resolved?.home?.team_id ?? null,
            resolved?.away?.team_id ?? null,
          )
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
              : undefined,
            teamsMatch,
          )
          matchPoints += result.points
        }
      }

      // Calculate BONUS points
      let bonusPoints = 0
      if (predictions && predictions.length > 0) {
        const bonusEntries = calculateAllBonusPoints({
          memberId: defaultEntryId,
          memberPredictions: predictionMap,
          matches: normalizedMatches,
          teams,
          conductData,
          settings: poolSettings,
          tournamentAwards: null,
        })

        bonusPoints = bonusEntries.reduce((sum, e) => sum + e.points_earned, 0)
      }

      return {
        ...pool,
        role: m.role,
        match_points: matchPoints,
        bonus_points: bonusPoints,
        total_points: matchPoints + bonusPoints,
        current_rank: bestEntry?.current_rank ?? null,
        has_submitted_predictions: anySubmitted,
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
