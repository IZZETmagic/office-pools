import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getShadowReadPools, readEntryScoring, readMatchScoreClassification } from '@/lib/scoring/readSource'
import { redirect } from 'next/navigation'
import { fetchMatchConductForTournaments } from '@/lib/matchConduct'
import ProfilePage from './ProfilePage'
// resolvePredictedBracket is used for enriching knockout predictions with team names (display only)
import { resolvePredictedBracket } from '@/lib/bracketResolver'
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

  // Get user's pool memberships with pool details and entries
  const { data: userPools } = await supabase
    .from('pool_members')
    .select(`
      member_id,
      pool_id,
      role,
      joined_at,
      pools!inner(
        pool_id,
        pool_name,
        tournament_id,
        prediction_mode
      ),
      pool_entries(
        entry_id,
        entry_name,
        entry_number,
        has_submitted_predictions,
        total_points,
        current_rank,
        match_points,
        bonus_points,
        scored_total_points
      )
    `)
    .eq('user_id', profile.user_id)

  const poolMemberships = (userPools ?? []).map((m: any) => {
    const entries = (m.pool_entries || []) as any[]
    const bestEntry = entries.length > 0
      // scored_total_points, not total_points: the latter is dead-legacy and
      // always 0, so this reduce silently always returned entries[0] — and
      // disagreed with the pick used for playerScoresMap below.
      ? entries.reduce((best: any, e: any) => ((e.scored_total_points ?? 0) > (best.scored_total_points ?? 0) ? e : best), entries[0])
      : null
    const anySubmitted = entries.some((e: any) => e.has_submitted_predictions)
    const defaultEntryId = bestEntry?.entry_id || entries[0]?.entry_id || null

    return {
      member_id: m.member_id,
      pool_id: m.pool_id,
      pool_name: m.pools.pool_name,
      tournament_id: m.pools.tournament_id,
      prediction_mode: m.pools.prediction_mode ?? 'full_tournament',
      role: m.role,
      total_points: bestEntry?.total_points ?? 0,
      current_rank: bestEntry?.current_rank ?? null,
      has_submitted_predictions: anySubmitted,
      joined_at: m.joined_at,
      prediction_count: 0, // Will be filled below
      entry_id: defaultEntryId,
    }
  })

  // Every scoring number on this page must follow the SAME source as the pool's
  // own leaderboard, or a member sees one rank on their profile and another in
  // the pool. Shadow tables are RLS deny-all (0 policies), so this needs the
  // service role — scoped to entries the RLS'd query above already proved this
  // user can see.
  const scoringAdmin = createAdminClient()
  const shadowPools = await getShadowReadPools(scoringAdmin)
  const shadowEntryIds = poolMemberships
    .filter((p) => p.entry_id && shadowPools.has(p.pool_id))
    .map((p) => p.entry_id as string)
  const scoredByEntry = shadowEntryIds.length > 0
    ? await readEntryScoring(scoringAdmin, shadowEntryIds, 'shadow')
    : new Map()

  for (const pm of poolMemberships) {
    const scoring = pm.entry_id ? scoredByEntry.get(pm.entry_id) : undefined
    if (!scoring) continue
    pm.current_rank = scoring.current_rank ?? pm.current_rank
    pm.total_points = scoring.scored_total_points
  }

  // Get member counts for each pool (for rank display like #2/12)
  const memberCounts: Record<string, number> = {}
  for (const pool of poolMemberships) {
    const { count } = await supabase
      .from('pool_members')
      .select('*', { count: 'exact', head: true })
      .eq('pool_id', pool.pool_id)
    memberCounts[pool.pool_id] = count ?? 0
  }

  // Get all predictions for the user's entries (with match details)
  const entryIds = poolMemberships.map((p: any) => p.entry_id).filter(Boolean)
  let predictions: any[] = []

  if (entryIds.length > 0) {
    // Fetch predictions and matches separately to avoid complex join issues
    const allPredictions: any[] = []
    for (const entryId of entryIds) {
      const { data: predictionData, error: predError } = await supabase
        .from('predictions')
        .select(`
          prediction_id,
          entry_id,
          match_id,
          predicted_home_score,
          predicted_away_score
        `)
        .eq('entry_id', entryId)

      if (predError) {
        console.error(`[Profile] Error fetching predictions for entry ${entryId}:`, predError.message)
      }
      if (predictionData) {
        allPredictions.push(...predictionData)
      }
    }

    // Fetch all matches with team names (single query, no per-entry overhead)
    const matchIds = [...new Set(allPredictions.map((p: any) => p.match_id))]
    const matchLookup = new Map<string, any>()

    if (matchIds.length > 0) {
      const { data: matchData, error: matchError } = await supabase
        .from('matches')
        .select(`
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
        `)
        .in('match_id', matchIds)

      if (matchError) {
        console.error('[Profile] Error fetching matches:', matchError.message)
      }
      if (matchData) {
        for (const m of matchData) {
          matchLookup.set(m.match_id, {
            ...m,
            home_team: Array.isArray(m.home_team) ? m.home_team[0] : m.home_team,
            away_team: Array.isArray(m.away_team) ? m.away_team[0] : m.away_team,
          })
        }
      }
    }

    // Combine predictions with their match data
    predictions = allPredictions.map((p: any) => ({
      ...p,
      matches: matchLookup.get(p.match_id) ?? null,
    }))

    // Sort by match_date descending
    predictions.sort((a: any, b: any) => {
      const dateA = new Date(a.matches?.match_date ?? 0).getTime()
      const dateB = new Date(b.matches?.match_date ?? 0).getTime()
      return dateB - dateA
    })

    // Update prediction counts per pool membership
    for (const pm of poolMemberships) {
      if (pm.entry_id) {
        pm.prediction_count = predictions.filter((p: any) => p.entry_id === pm.entry_id).length
      }
    }
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
  // Scoped to the tournaments this user has pools in — see the same fix in
  // app/dashboard/page.tsx. Unscoped these read every team and every conduct
  // row in the database, with the conduct read silently capped at 1,000.
  const profileTournamentIds = [...new Set(poolMemberships.map((p) => p.tournament_id))]
  const [{ data: allTeams }, conductRes] = await Promise.all([
    supabase
      .from('teams')
      .select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url')
      .in('tournament_id', profileTournamentIds)
      .order('group_letter', { ascending: true })
      .order('fifa_ranking_points', { ascending: false }),
    fetchMatchConductForTournaments(supabase, profileTournamentIds),
  ])

  const teams: Team[] = (allTeams ?? []).map((t: any) => ({
    ...t,
    group_letter: t.group_letter?.trim() || '',
    country_code: t.country_code?.trim() || '',
  }))

  const conductData: MatchConductData[] = conductRes

  // Read stored v2 scores for each membership (instead of computing on-the-fly)
  const playerScoresMap: Record<string, { match_points: number; bonus_points: number; total_points: number }> = {}

  for (const pool of poolMemberships) {
    // Find the best entry to read v2 scores from
    const poolData = (userPools ?? []).find((m: any) => m.pool_id === pool.pool_id)
    const entries = (poolData?.pool_entries || []) as any[]
    const bestEntry = entries.length > 0
      ? entries.reduce((best: any, e: any) => ((e.scored_total_points ?? 0) > (best.scored_total_points ?? 0) ? e : best), entries[0])
      : null

    // Shadow when the pool is cut over, prod columns otherwise — same
    // resolution the pool leaderboard uses.
    const scoring = pool.entry_id ? scoredByEntry.get(pool.entry_id) : undefined
    const matchPoints = scoring?.match_points ?? bestEntry?.match_points ?? 0
    const bonusPoints = scoring?.bonus_points ?? bestEntry?.bonus_points ?? 0

    playerScoresMap[pool.entry_id || pool.member_id] = {
      match_points: matchPoints,
      bonus_points: bonusPoints,
      total_points: matchPoints + bonusPoints,
    }

    // Get ALL matches for this pool's tournament (needed for bracket resolution)
    const { data: allMatches } = await supabase
      .from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(country_name, flag_url), away_team:teams!matches_away_team_id_fkey(country_name, flag_url)')
      .eq('tournament_id', pool.tournament_id)
      .order('match_number', { ascending: true })

    const normalizedMatches = (allMatches ?? []).map((match: any) => ({
      ...match,
      home_team: Array.isArray(match.home_team) ? match.home_team[0] ?? null : match.home_team,
      away_team: Array.isArray(match.away_team) ? match.away_team[0] ?? null : match.away_team,
    }))

    // Get user's predictions for this pool (needed for bracket resolution)
    const { data: memberPredictions } = pool.entry_id
      ? await supabase
          .from('predictions')
          .select('match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
          .eq('entry_id', pool.entry_id)
      : { data: null }

    const predictionMap: PredictionMap = new Map()
    for (const p of (memberPredictions ?? [])) {
      predictionMap.set(p.match_id, {
        home: p.predicted_home_score,
        away: p.predicted_away_score,
        homePso: p.predicted_home_pso ?? null,
        awayPso: p.predicted_away_pso ?? null,
        winnerTeamId: p.predicted_winner_team_id ?? null,
      })
    }

    // Resolve bracket for knockout team matching
    // Display-only: the user's predicted knockout team names. Prediction-only
    // resolution (no conduct) so these names match how the picks are scored.
    const bracket = resolvePredictedBracket({
      matches: normalizedMatches,
      predictionMap,
      teams,
    })

    // Enrich predictions with predicted knockout team names (full_tournament only)
    if (pool.prediction_mode === 'full_tournament' && pool.entry_id) {
      const knockoutTeamMap = bracket.knockoutTeamMap
      for (const pred of predictions) {
        if (pred.entry_id !== pool.entry_id) continue
        const m = pred.matches
        if (!m || m.stage === 'group') continue
        const resolved = knockoutTeamMap.get(m.match_number)
        if (resolved) {
          pred.predicted_home_team_name = resolved.home?.country_name ?? null
          pred.predicted_away_team_name = resolved.away?.country_name ?? null
        }
      }
    }
  }

  // Stored match scores for prediction classification, read from the SAME source
  // as each pool's leaderboard. Entries are split by their pool's source because
  // a user can be in both shadow-enabled and prod pools at once.
  //
  // Two fixes over the previous direct read: it bypassed readSource entirely (so
  // it showed prod's classification even for cut-over pools), and its `.in()`
  // was UNPAGINATED — PostgREST caps at 1,000 rows, so a user in enough pools
  // silently stopped seeing older predictions classified.
  const matchScoresMap: Record<string, { score_type: string; total_points: number }> = {}
  if (entryIds.length > 0) {
    const shadowIds: string[] = []
    const prodEntryIds: string[] = []
    for (const pm of poolMemberships) {
      if (!pm.entry_id) continue
      ;(shadowPools.has(pm.pool_id) ? shadowIds : prodEntryIds).push(pm.entry_id)
    }

    const [shadowRows, prodRows] = await Promise.all([
      readMatchScoreClassification(scoringAdmin, shadowIds, 'shadow'),
      readMatchScoreClassification(scoringAdmin, prodEntryIds, 'prod'),
    ])
    for (const ms of [...shadowRows, ...prodRows]) {
      matchScoresMap[`${ms.entry_id}:${ms.match_id}`] = {
        score_type: ms.score_type,
        total_points: ms.total_points,
      }
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
      matchScoresMap={matchScoresMap}
    />
  )
}
