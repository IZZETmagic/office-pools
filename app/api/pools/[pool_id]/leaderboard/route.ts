import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { calculatePoints, checkKnockoutTeamsMatch, DEFAULT_POOL_SETTINGS } from '@/app/pools/[pool_id]/results/points'
import type { PoolSettings } from '@/app/pools/[pool_id]/results/points'
import { calculateAllBonusPoints, type MatchWithResult, type TournamentAwards } from '@/lib/bonusCalculation'
import { resolveFullBracket } from '@/lib/bracketResolver'
import type { PredictionMap, Team, MatchConductData } from '@/lib/tournament'
import { withPerfLogging } from '@/lib/api-perf'

// =============================================================
// GET /api/pools/:poolId/leaderboard
// Returns the full leaderboard with server-side computed points.
// Authenticated users who are pool members can access this.
// =============================================================

type LeaderboardEntryResponse = {
  entry_id: string
  entry_name: string
  entry_number: number
  member_id: string
  user_id: string
  full_name: string
  username: string
  match_points: number
  bonus_points: number
  point_adjustment: number
  total_points: number
  current_rank: number | null
  previous_rank: number | null
  has_submitted_predictions: boolean
}

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params

  // 1. Authenticate — supports both cookie auth (web) and Bearer token auth (iOS)
  let supabase: any
  let user: any = null

  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    // iOS / mobile client — use Bearer token
    const token = authHeader.replace('Bearer ', '')
    supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data } = await supabase.auth.getUser(token)
    user = data?.user
  } else {
    // Web client — use cookie-based auth
    supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    user = data?.user
  }

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('user_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // 2. Verify pool membership
  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this pool' }, { status: 403 })
  }

  // 3. Fetch pool info
  const { data: pool } = await supabase
    .from('pools')
    .select('pool_id, tournament_id, prediction_mode')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  // 4. Fetch all needed data in parallel
  const [
    { data: matches },
    { data: teams },
    { data: conductData },
    { data: settingsRow },
    { data: tournamentAwardsRow },
    { data: poolMembers },
  ] = await Promise.all([
    supabase
      .from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(country_name, flag_url), away_team:teams!matches_away_team_id_fkey(country_name, flag_url)')
      .eq('tournament_id', pool.tournament_id)
      .order('match_number', { ascending: true }),
    supabase
      .from('teams')
      .select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url')
      .eq('tournament_id', pool.tournament_id),
    supabase
      .from('match_conduct')
      .select('match_id, team_id, yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards'),
    supabase
      .from('pool_settings')
      .select('*')
      .eq('pool_id', pool_id)
      .single(),
    supabase
      .from('tournament_awards')
      .select('champion_team_id, runner_up_team_id, third_place_team_id, best_player, top_scorer')
      .eq('tournament_id', pool.tournament_id)
      .single(),
    supabase
      .from('pool_members')
      .select('member_id, user_id, role, users(user_id, username, full_name)')
      .eq('pool_id', pool_id),
  ])

  if (!matches || !teams || !poolMembers) {
    return NextResponse.json({ error: 'Failed to fetch pool data' }, { status: 500 })
  }

  // Fetch all entries for these members
  const memberIds = poolMembers.map((m: any) => m.member_id)
  const { data: entries } = await supabase
    .from('pool_entries')
    .select('entry_id, member_id, entry_name, entry_number, has_submitted_predictions, total_points, point_adjustment, current_rank, previous_rank')
    .in('member_id', memberIds)

  if (!entries) {
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
  }

  // Fetch all predictions for all entries in one query
  const entryIds = entries.map((e: any) => e.entry_id)
  const { data: allPredictions } = await supabase
    .from('predictions')
    .select('entry_id, match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
    .in('entry_id', entryIds)

  // Normalize data
  const normalizedMatches: MatchWithResult[] = matches.map((m: any) => ({
    ...m,
    home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
    away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
  }))

  const settings: PoolSettings = { ...DEFAULT_POOL_SETTINGS, ...(settingsRow || {}) }
  const tournamentAwards: TournamentAwards | null = tournamentAwardsRow || null
  const conduct: MatchConductData[] = conductData || []
  const teamsData: Team[] = (teams as any[]).map(t => ({
    ...t,
    group_letter: t.group_letter?.trim() || '',
    country_code: t.country_code?.trim() || '',
  }))

  // Group predictions by entry_id
  const predictionsByEntry = new Map<string, any[]>()
  for (const p of (allPredictions || [])) {
    const list = predictionsByEntry.get(p.entry_id) || []
    list.push(p)
    predictionsByEntry.set(p.entry_id, list)
  }

  // Build member lookup (member_id → user info)
  const memberMap = new Map<string, any>()
  for (const m of poolMembers) {
    memberMap.set((m as any).member_id, m)
  }

  // 5. Compute points for each entry
  const leaderboard: LeaderboardEntryResponse[] = []

  for (const entry of entries) {
    const member = memberMap.get(entry.member_id)
    if (!member) continue

    const userInfo = (member as any).users
    const predictions = predictionsByEntry.get(entry.entry_id) || []
    const adjustment = entry.point_adjustment ?? 0

    let matchPoints = 0
    let bonusPoints = 0

    if (predictions.length > 0) {
      // Build PredictionMap for bonus calculation
      const predictionMap: PredictionMap = new Map()
      const predMap = new Map<string, any>()
      for (const p of predictions) {
        predMap.set(p.match_id, p)
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
        teams: teamsData,
        conductData: conduct,
      })

      // Calculate match points
      for (const m of normalizedMatches) {
        if ((m.is_completed || m.status === 'live') && m.home_score_ft !== null && m.away_score_ft !== null) {
          const pred = predMap.get(m.match_id)
          if (!pred) continue

          // For knockout: check if predicted teams match actual teams
          const resolved = bracket.knockoutTeamMap.get(m.match_number)
          const teamsMatch = checkKnockoutTeamsMatch(
            m.stage,
            m.home_team_id,
            m.away_team_id,
            resolved?.home?.team_id ?? null,
            resolved?.away?.team_id ?? null,
          )

          const hasPso = m.home_score_pso !== null && m.away_score_pso !== null
          const result = calculatePoints(
            pred.predicted_home_score,
            pred.predicted_away_score,
            m.home_score_ft,
            m.away_score_ft,
            m.stage,
            settings,
            hasPso
              ? {
                  actualHomePso: m.home_score_pso!,
                  actualAwayPso: m.away_score_pso!,
                  predictedHomePso: pred.predicted_home_pso,
                  predictedAwayPso: pred.predicted_away_pso,
                }
              : undefined,
            teamsMatch,
          )
          matchPoints += result.points
        }
      }

      // Calculate bonus points
      const bonusEntries = calculateAllBonusPoints({
        memberId: entry.entry_id,
        memberPredictions: predictionMap,
        matches: normalizedMatches,
        teams: teamsData,
        conductData: conduct,
        settings,
        tournamentAwards,
      })
      bonusPoints = bonusEntries.reduce((sum, e) => sum + e.points_earned, 0)
    }

    leaderboard.push({
      entry_id: entry.entry_id,
      entry_name: entry.entry_name,
      entry_number: entry.entry_number,
      member_id: entry.member_id,
      user_id: (member as any).user_id,
      full_name: userInfo?.full_name ?? 'Unknown',
      username: userInfo?.username ?? '',
      match_points: matchPoints,
      bonus_points: bonusPoints,
      point_adjustment: adjustment,
      total_points: matchPoints + bonusPoints + adjustment,
      current_rank: entry.current_rank,
      previous_rank: entry.previous_rank,
      has_submitted_predictions: entry.has_submitted_predictions,
    })
  }

  // 6. Sort by total_points descending, then current_rank as tiebreaker
  leaderboard.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points
    return (a.current_rank ?? 999) - (b.current_rank ?? 999)
  })

  return NextResponse.json({
    pool_id,
    prediction_mode: pool.prediction_mode,
    entries: leaderboard,
  })
}

export const GET = withPerfLogging('/api/pools/[id]/leaderboard', handleGET)
