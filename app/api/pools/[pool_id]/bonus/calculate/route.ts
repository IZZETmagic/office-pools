import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { calculateAllBonusPoints, type MatchWithResult, type TournamentAwards } from '@/lib/bonusCalculation'
import { resolveFullBracket } from '@/lib/bracketResolver'
import type { PredictionMap, ScoreEntry, Team, MatchConductData } from '@/lib/tournament'
import { GROUP_LETTERS } from '@/lib/tournament'
import type { PoolSettings } from '@/app/pools/[pool_id]/results/points'
import { DEFAULT_POOL_SETTINGS } from '@/app/pools/[pool_id]/results/points'

// =============================================================
// POST /api/pools/:poolId/bonus/calculate
// Recalculates bonus points for all members in the pool.
// Admin or super admin only.
// =============================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params
  const supabase = await createClient()

  // 1. Authenticate
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('user_id, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // 2. Check authorization (pool admin or super admin)
  const isSuperAdmin = userData.is_super_admin === true
  if (!isSuperAdmin) {
    const { data: membership } = await supabase
      .from('pool_members')
      .select('role')
      .eq('pool_id', pool_id)
      .eq('user_id', userData.user_id)
      .single()

    if (!membership || membership.role !== 'admin') {
      return NextResponse.json({ error: 'Must be pool admin or super admin' }, { status: 403 })
    }
  }

  // 3. Fetch pool and tournament info
  const { data: pool } = await supabase
    .from('pools')
    .select('pool_id, tournament_id')
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
    { data: members },
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
      .select('member_id, has_submitted_predictions')
      .eq('pool_id', pool_id),
  ])

  if (!matches || !teams || !members) {
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }

  // Normalize match join results
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

  // 5. Process each member with submitted predictions
  const submittedMembers = members.filter(m => m.has_submitted_predictions)
  let totalBonusEntries = 0
  let totalBonusPoints = 0

  for (const member of submittedMembers) {
    // Fetch this member's predictions
    const { data: predictions } = await supabase
      .from('predictions')
      .select('match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
      .eq('member_id', member.member_id)

    if (!predictions || predictions.length === 0) continue

    // Build PredictionMap
    const predictionMap: PredictionMap = new Map()
    for (const p of predictions) {
      predictionMap.set(p.match_id, {
        home: p.predicted_home_score,
        away: p.predicted_away_score,
        homePso: p.predicted_home_pso,
        awayPso: p.predicted_away_pso,
        winnerTeamId: p.predicted_winner_team_id,
      })
    }

    // Calculate bonus points
    const bonusEntries = calculateAllBonusPoints({
      memberId: member.member_id,
      memberPredictions: predictionMap,
      matches: normalizedMatches,
      teams: teamsData,
      conductData: conduct,
      settings,
      tournamentAwards,
    })

    // Delete existing bonus_scores for this member
    await supabase
      .from('bonus_scores')
      .delete()
      .eq('member_id', member.member_id)

    // Insert new bonus_scores
    if (bonusEntries.length > 0) {
      const rows = bonusEntries.map(e => ({
        member_id: e.member_id,
        bonus_type: e.bonus_type,
        bonus_category: e.bonus_category,
        related_group_letter: e.related_group_letter,
        related_match_id: e.related_match_id,
        points_earned: e.points_earned,
        description: e.description,
      }))

      const { error: insertError } = await supabase
        .from('bonus_scores')
        .insert(rows)

      if (insertError) {
        console.error(`Failed to insert bonus_scores for member ${member.member_id}:`, insertError)
      }
    }

    // Auto-populate group_predictions for this member
    await populateGroupPredictions(supabase, member.member_id, pool.tournament_id, normalizedMatches, predictionMap, teamsData)

    // Auto-populate special_predictions for this member
    await populateSpecialPredictions(supabase, member.member_id, normalizedMatches, predictionMap, teamsData)

    totalBonusEntries += bonusEntries.length
    totalBonusPoints += bonusEntries.reduce((sum, e) => sum + e.points_earned, 0)
  }

  // 6. Recalculate leaderboard
  const { error: leaderboardError } = await supabase.rpc('recalculate_pool_leaderboard', {
    p_pool_id: pool_id,
  })

  if (leaderboardError) {
    console.error('Leaderboard recalculation error:', leaderboardError)
  }

  return NextResponse.json({
    success: true,
    membersProcessed: submittedMembers.length,
    totalBonusEntries,
    totalBonusPoints,
  })
}

// =============================================
// HELPER: Populate group_predictions table
// =============================================

async function populateGroupPredictions(
  supabase: any,
  memberId: string,
  tournamentId: string,
  matches: MatchWithResult[],
  predictionMap: PredictionMap,
  teams: Team[]
) {
  const bracket = resolveFullBracket({ matches, predictionMap, teams })

  for (const letter of GROUP_LETTERS) {
    const standings = bracket.allGroupStandings.get(letter)
    if (!standings || standings.length < 4) continue

    const row = {
      member_id: memberId,
      tournament_id: tournamentId,
      group_letter: letter,
      position_1_team_id: standings[0]?.team_id || null,
      position_2_team_id: standings[1]?.team_id || null,
      position_3_team_id: standings[2]?.team_id || null,
      position_4_team_id: standings[3]?.team_id || null,
      auto_calculated: true,
    }

    // Upsert: try to find existing row first
    const { data: existing } = await supabase
      .from('group_predictions')
      .select('group_prediction_id')
      .eq('member_id', memberId)
      .eq('group_letter', letter)
      .single()

    if (existing) {
      await supabase
        .from('group_predictions')
        .update(row)
        .eq('group_prediction_id', existing.group_prediction_id)
    } else {
      await supabase
        .from('group_predictions')
        .insert(row)
    }
  }
}

// =============================================
// HELPER: Populate special_predictions table
// =============================================

async function populateSpecialPredictions(
  supabase: any,
  memberId: string,
  matches: MatchWithResult[],
  predictionMap: PredictionMap,
  teams: Team[]
) {
  const bracket = resolveFullBracket({ matches, predictionMap, teams })

  const row = {
    member_id: memberId,
    predicted_champion_team_id: bracket.champion?.team_id || null,
    predicted_runner_up_team_id: bracket.runnerUp?.team_id || null,
    predicted_third_place_team_id: bracket.thirdPlace?.team_id || null,
  }

  // Upsert
  const { data: existing } = await supabase
    .from('special_predictions')
    .select('special_prediction_id')
    .eq('member_id', memberId)
    .single()

  if (existing) {
    await supabase
      .from('special_predictions')
      .update(row)
      .eq('special_prediction_id', existing.special_prediction_id)
  } else {
    await supabase
      .from('special_predictions')
      .insert(row)
  }
}
