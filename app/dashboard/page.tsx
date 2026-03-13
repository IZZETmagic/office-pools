import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardClient } from './DashboardClient'
import { calculatePoints, checkKnockoutTeamsMatch, DEFAULT_POOL_SETTINGS, type PoolSettings } from '@/app/pools/[pool_id]/results/points'
import { calculateAllBonusPoints, type MatchWithResult } from '@/lib/bonusCalculation'
import { resolveFullBracket } from '@/lib/bracketResolver'
import type { PredictionMap, Team, MatchConductData } from '@/lib/tournament'

export default async function DashboardPage() {
  const supabase = await createClient()

  // STEP 1: Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // STEP 2: Look up user_id from users table
  const { data: userData } = await supabase
    .from('users')
    .select('user_id, username, full_name, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) redirect('/login')

  // STEP 3: Fetch user's pools via pool_members (with entries)
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
        prediction_deadline,
        tournament_id,
        prediction_mode
      ),
      pool_entries(
        entry_id,
        entry_name,
        entry_number,
        has_submitted_predictions,
        predictions_submitted_at,
        predictions_last_saved_at,
        auto_submitted,
        created_at,
        total_points,
        current_rank,
        point_adjustment
      )
    `)
    .eq('user_id', userData.user_id)
    .order('joined_at', { ascending: false })

  // STEP 4a: Fetch live matches — only from tournaments the user has pools in
  // Collect unique tournament IDs from user's pools
  const userTournamentIds = [...new Set((userPools ?? []).map((m: any) => m.pools.tournament_id))]

  let liveMatches: any[] | null = null
  if (userTournamentIds.length > 0) {
    const { data } = await supabase
      .from('matches')
      .select(`
        match_id,
        match_number,
        stage,
        match_date,
        status,
        home_score_ft,
        away_score_ft,
        home_team:teams!matches_home_team_id_fkey(country_name, flag_url),
        away_team:teams!matches_away_team_id_fkey(country_name, flag_url),
        home_team_placeholder,
        away_team_placeholder
      `)
      .eq('status', 'live')
      .in('tournament_id', userTournamentIds)
      .order('match_date', { ascending: true })
    liveMatches = data
  }

  // STEP 4b: Fetch upcoming matches — only from tournaments the user has pools in
  let upcomingMatches: any[] | null = null
  if (userTournamentIds.length > 0) {
    const { data } = await supabase
      .from('matches')
      .select(`
        match_id,
        match_number,
        stage,
        match_date,
        status,
        home_team:teams!matches_home_team_id_fkey(country_name, flag_url),
        away_team:teams!matches_away_team_id_fkey(country_name, flag_url),
        home_team_placeholder,
        away_team_placeholder
      `)
      .in('status', ['scheduled', 'upcoming'])
      .in('tournament_id', userTournamentIds)
      .order('match_date', { ascending: true })
      .limit(5)
    upcomingMatches = data
  }

  // Normalize team data (Supabase may return arrays for FK joins)
  const normalizedLiveMatches = (liveMatches ?? []).map((m: any) => ({
    ...m,
    home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
    away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
  }))

  const normalizedUpcomingMatches = (upcomingMatches ?? []).map((m: any) => ({
    ...m,
    home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
    away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
  }))

  // STEP 4c: Fetch shared data needed for bonus calculation (teams, conduct)
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

  // STEP 5: Enrich each pool with calculated points (match + bonus), member count, match counts
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

      // Get entries for this member
      const entries = ((m as any).pool_entries || []) as any[]
      const bestEntry = entries.length > 0
        ? entries.reduce((best: any, e: any) => (e.total_points > best.total_points ? e : best), entries[0])
        : null
      const anySubmitted = entries.some((e: any) => e.has_submitted_predictions)
      const defaultEntry = bestEntry || entries[0]
      const defaultEntryId = defaultEntry?.entry_id

      // Get user's predictions for this pool (with winner_team_id for bonus calc)
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

      // Calculate points + form (last 5 results) — bracket picker uses DB bonus_scores, other modes compute client-side
      let matchPoints = 0
      let bonusPoints = 0
      const matchResults: { matchNumber: number; type: 'exact' | 'winner_gd' | 'winner' | 'miss' }[] = []
      const completedMatchesList = normalizedMatches.filter(
        (match: any) => (match.status === 'completed' || match.status === 'live') && match.home_score_ft !== null && match.away_score_ft !== null
      )

      if (pool.prediction_mode === 'bracket_picker') {
        // For bracket picker pools, read pre-computed scores from bonus_scores table
        if (defaultEntryId) {
          const { data: bpBonusScores } = await supabase
            .from('bonus_scores')
            .select('points_earned')
            .eq('entry_id', defaultEntryId)

          bonusPoints = (bpBonusScores ?? []).reduce((sum: number, e: any) => sum + e.points_earned, 0)
        }
      } else {
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
            matchResults.push({ matchNumber: match.match_number, type: result.type })
          }
        }

        // Calculate BONUS points for non-BP modes
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
      }

      // Last 5 match results sorted by match number (most recent last)
      const form = matchResults
        .sort((a, b) => a.matchNumber - b.matchNumber)
        .slice(-5)
        .map(r => r.type)

      // Count predicted matches (for default entry)
      const predictedMatches = predictions?.length ?? 0

      // Build per-entry progress (prediction counts for each entry)
      const entryIds = entries.map((e: any) => e.entry_id)
      let entryPredCounts: Record<string, number> = {}
      if (entryIds.length > 0) {
        const { data: entryPreds } = await supabase
          .from('predictions')
          .select('entry_id')
          .in('entry_id', entryIds)
        if (entryPreds) {
          for (const p of entryPreds) {
            entryPredCounts[p.entry_id] = (entryPredCounts[p.entry_id] || 0) + 1
          }
        }
      }

      const entriesProgress = entries.map((e: any) => ({
        entry_id: e.entry_id,
        entry_name: e.entry_name,
        predictedMatches: entryPredCounts[e.entry_id] || 0,
        has_submitted: e.has_submitted_predictions || false,
      }))

      const adjustment = bestEntry?.point_adjustment ?? 0

      return {
        ...pool,
        role: m.role,
        match_points: matchPoints,
        bonus_points: bonusPoints,
        total_points: matchPoints + bonusPoints + adjustment,
        current_rank: bestEntry?.current_rank ?? null,
        has_submitted_predictions: anySubmitted,
        predictions_submitted_at: bestEntry?.predictions_submitted_at ?? null,
        predictions_last_saved_at: bestEntry?.predictions_last_saved_at ?? null,
        joined_at: m.joined_at,
        memberCount: memberCount ?? 0,
        totalMatches: totalMatchesCount ?? 0,
        completedMatches: completedMatchesList.length,
        predictedMatches,
        entries: entriesProgress,
        form,
      }
    })
  )

  // Filter to only active pools for dashboard display
  const activePools = pools.filter((p: any) => p.status === 'open' || p.status === 'active')

  // Calculate stats from active pools
  const totalPools = activePools.length
  const totalPoints = activePools.reduce((sum: number, p: any) => sum + (p.total_points ?? 0), 0)
  const bestRank = activePools
    .filter((p: any) => p.current_rank != null)
    .reduce((best: number | null, p: any) => {
      if (best === null) return p.current_rank
      return p.current_rank < best ? p.current_rank : best
    }, null as number | null)

  // Build activity feed from multiple sources (from all pools, not just active)
  const allActivities: any[] = []
  for (const m of (userPools ?? [])) {
    const pool = (m as any).pools
    const poolName = pool.pool_name
    const poolId = pool.pool_id
    const entries = ((m as any).pool_entries || []) as any[]

    // 1. JOINED event
    allActivities.push({
      type: 'joined' as const,
      poolName,
      poolId,
      date: m.joined_at,
      hasPredictions: entries.some((e: any) => e.has_submitted_predictions),
    })

    // 2. SUBMITTED / AUTO_SUBMITTED events (per entry)
    for (const entry of entries) {
      if (entry.predictions_submitted_at) {
        if (entry.auto_submitted) {
          allActivities.push({
            type: 'auto_submitted' as const,
            poolName,
            poolId,
            date: entry.predictions_submitted_at,
            entryName: entry.entry_name,
          })
        } else {
          allActivities.push({
            type: 'submitted' as const,
            poolName,
            poolId,
            date: entry.predictions_submitted_at,
            entryName: entry.entry_name,
          })
        }
      }
    }

    // 3. ENTRY_CREATED events (only additional entries, not the auto-created first one)
    for (const entry of entries) {
      if (entry.entry_number > 1 && entry.created_at) {
        allActivities.push({
          type: 'entry_created' as const,
          poolName,
          poolId,
          date: entry.created_at,
          entryName: entry.entry_name,
        })
      }
    }

    // 4. DEADLINE_PASSED event (only if deadline is in the past)
    if (pool.prediction_deadline) {
      const deadlineDate = new Date(pool.prediction_deadline)
      if (deadlineDate < new Date()) {
        allActivities.push({
          type: 'deadline_passed' as const,
          poolName,
          poolId,
          date: pool.prediction_deadline,
        })
      }
    }
  }

  const activities = allActivities
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10)

  return (
    <DashboardClient
      user={userData}
      pools={activePools}
      liveMatches={normalizedLiveMatches}
      upcomingMatches={normalizedUpcomingMatches}
      activities={activities}
      totalPools={totalPools}
      totalPoints={totalPoints}
      bestRank={bestRank}
    />
  )
}
