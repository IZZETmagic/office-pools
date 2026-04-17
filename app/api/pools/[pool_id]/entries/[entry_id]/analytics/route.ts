import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { matchScoresToPredictionResults, computeAccuracyByStage, computeOverallAccuracy, computeStreaks, computeCrowdPredictions, computePoolWideStats } from '@/app/pools/[pool_id]/analytics/analyticsHelpers'
import { computeFullXPBreakdown, LEVELS, BADGE_DEFINITIONS } from '@/app/pools/[pool_id]/analytics/xpSystem'
import { DEFAULT_POOL_SETTINGS } from '@/app/pools/[pool_id]/results/points'
import type { PoolSettings } from '@/app/pools/[pool_id]/results/points'
import type { MatchData, PredictionData, TeamData, MemberData } from '@/app/pools/[pool_id]/types'
import type { MatchConductData } from '@/lib/tournament'
import { withPerfLogging } from '@/lib/api-perf'

// =============================================================
// GET /api/pools/:poolId/entries/:entryId/analytics
// Returns analytics data (XP, accuracy, streaks, crowd, pool stats)
// for a specific entry. Authenticated pool members can access this.
// =============================================================

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string; entry_id: string }> }
) {
  const { pool_id, entry_id } = await params

  // 1. Authenticate (cookie or Bearer — handled by createClient)
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  // 3. Verify pool membership
  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this pool' }, { status: 403 })
  }

  // Use admin client for all data queries to bypass RLS
  // (pool membership was already verified above, so this is safe)
  const adminClient = createAdminClient()

  // 4. Fetch pool info
  const { data: pool } = await adminClient
    .from('pools')
    .select('pool_id, tournament_id, prediction_mode')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  // 5. Verify entry belongs to this pool (entry -> member -> pool)
  const { data: entry } = await adminClient
    .from('pool_entries')
    .select('entry_id, member_id, entry_name, entry_number, has_submitted_predictions, total_points, point_adjustment, adjustment_reason, current_rank, previous_rank')
    .eq('entry_id', entry_id)
    .single()

  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  // Verify the entry's member belongs to this pool
  const { data: entryMember } = await adminClient
    .from('pool_members')
    .select('member_id, user_id')
    .eq('member_id', entry.member_id)
    .eq('pool_id', pool_id)
    .single()

  if (!entryMember) {
    return NextResponse.json({ error: 'Entry does not belong to this pool' }, { status: 404 })
  }

  // 6. Fetch all needed data in parallel
  const [
    { data: matches },
    { data: teams },
    { data: conductData },
    { data: settingsRow },
    { data: entryPredictions },
    { data: members },
  ] = await Promise.all([
    adminClient
      .from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(country_name, country_code, flag_url), away_team:teams!matches_away_team_id_fkey(country_name, country_code, flag_url)')
      .eq('tournament_id', pool.tournament_id)
      .order('match_number', { ascending: true }),
    adminClient
      .from('teams')
      .select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url')
      .eq('tournament_id', pool.tournament_id),
    adminClient
      .from('match_conduct')
      .select('match_id, team_id, yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards'),
    adminClient
      .from('pool_settings')
      .select('*')
      .eq('pool_id', pool_id)
      .single(),
    adminClient
      .from('predictions')
      .select('prediction_id, entry_id, match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
      .eq('entry_id', entry_id),
    adminClient
      .from('pool_members')
      .select('member_id, pool_id, user_id, role, joined_at, entry_fee_paid, users(user_id, username, full_name, email), pool_entries(entry_id, member_id, entry_name, entry_number, has_submitted_predictions, predictions_submitted_at, predictions_locked, auto_submitted, predictions_last_saved_at, total_points, point_adjustment, adjustment_reason, current_rank, previous_rank, last_rank_update, created_at)')
      .eq('pool_id', pool_id),
  ])

  if (!matches || !teams) {
    return NextResponse.json({ error: 'Failed to fetch pool data' }, { status: 500 })
  }

  // Build members data for crowd computation
  const membersData: MemberData[] = (members || []).map((m: any) => ({
    member_id: m.member_id,
    pool_id: m.pool_id,
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    entry_fee_paid: m.entry_fee_paid,
    users: Array.isArray(m.users) ? m.users[0] : m.users,
    entries: (m.pool_entries || []).map((e: any) => ({
      entry_id: e.entry_id,
      member_id: e.member_id,
      entry_name: e.entry_name,
      entry_number: e.entry_number,
      has_submitted_predictions: e.has_submitted_predictions,
      predictions_submitted_at: e.predictions_submitted_at,
      predictions_locked: e.predictions_locked,
      auto_submitted: e.auto_submitted,
      predictions_last_saved_at: e.predictions_last_saved_at,
      total_points: e.total_points,
      point_adjustment: e.point_adjustment,
      adjustment_reason: e.adjustment_reason,
      current_rank: e.current_rank,
      previous_rank: e.previous_rank,
      last_rank_update: e.last_rank_update,
      created_at: e.created_at,
    })),
  }))

  // Get all entry IDs for this pool to fetch all predictions
  const entryIds = membersData.flatMap(m => m.entries?.map(e => e.entry_id) || [])

  // Fetch all predictions for these entries (needed for crowd data)
  // Paginate to avoid Supabase's default 1000-row limit
  let allPredictions: any[] = []
  if (entryIds.length > 0) {
    const pageSize = 1000
    let offset = 0
    let hasMore = true
    while (hasMore) {
      const { data: page } = await adminClient
        .from('predictions')
        .select('prediction_id, entry_id, match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
        .in('entry_id', entryIds)
        .range(offset, offset + pageSize - 1)

      if (!page || page.length === 0) {
        hasMore = false
      } else {
        allPredictions.push(...page)
        offset += page.length
        if (page.length < pageSize) hasMore = false
      }
    }
  }

  // Normalize match data
  const matchesData: MatchData[] = matches.map((m: any) => ({
    ...m,
    home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
    away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
  }))

  const settings: PoolSettings = { ...DEFAULT_POOL_SETTINGS, ...(settingsRow || {}) }
  const conduct: MatchConductData[] = conductData || []
  const teamsData: TeamData[] = (teams as any[]).map(t => ({
    ...t,
    group_letter: t.group_letter?.trim() || '',
    country_code: t.country_code?.trim() || '',
  }))

  const entryPredsData: PredictionData[] = (entryPredictions || []).map((p: any) => ({
    prediction_id: p.prediction_id,
    entry_id: p.entry_id,
    match_id: p.match_id,
    predicted_home_score: p.predicted_home_score,
    predicted_away_score: p.predicted_away_score,
    predicted_home_pso: p.predicted_home_pso ?? null,
    predicted_away_pso: p.predicted_away_pso ?? null,
    predicted_winner_team_id: p.predicted_winner_team_id ?? null,
  }))

  const allPredsData: PredictionData[] = allPredictions.map((p: any) => ({
    prediction_id: p.prediction_id,
    entry_id: p.entry_id,
    match_id: p.match_id,
    predicted_home_score: p.predicted_home_score,
    predicted_away_score: p.predicted_away_score,
    predicted_home_pso: p.predicted_home_pso ?? null,
    predicted_away_pso: p.predicted_away_pso ?? null,
    predicted_winner_team_id: p.predicted_winner_team_id ?? null,
  }))

  // 7. Compute analytics (wrapped in try/catch so basic data still returns if helpers fail)
  try {
    // Fetch stored match_scores for this entry
    const { data: entryMatchScores } = await adminClient
      .from('match_scores')
      .select('entry_id, match_id, match_number, stage, score_type, total_points')
      .eq('entry_id', entry_id)

    const predictionResults = matchScoresToPredictionResults((entryMatchScores || []) as any)
    const stageAccuracy = computeAccuracyByStage(predictionResults)
    const overallAccuracy = computeOverallAccuracy(predictionResults)
    const streaks = computeStreaks(predictionResults)
    const crowdData = computeCrowdPredictions(matchesData, allPredsData, entryPredsData, membersData)
    const poolStats = computePoolWideStats(matchesData, allPredsData, membersData, settings)
    const totalEntries = membersData.reduce((sum, m) => sum + (m.entries?.length || 0), 0)
    const xpBreakdown = computeFullXPBreakdown({
      predictionResults,
      matches: matchesData,
      crowdData,
      streaks,
      entryPredictions: entryPredsData,
      entryRank: entry.current_rank,
      totalMatches: matchesData.length,
      totalEntries,
    })

    // 8. Build response in snake_case format
    const response = {
      xp: {
        total_xp: xpBreakdown.totalXP,
        total_base_xp: xpBreakdown.totalBaseXP,
        total_bonus_xp: xpBreakdown.totalBonusXP,
        total_badge_xp: xpBreakdown.totalBadgeXP,
        current_level: {
          level: xpBreakdown.currentLevel.level,
          name: xpBreakdown.currentLevel.name,
          xp_required: xpBreakdown.currentLevel.xpRequired,
        },
        next_level: xpBreakdown.nextLevel
          ? {
              level: xpBreakdown.nextLevel.level,
              name: xpBreakdown.nextLevel.name,
              xp_required: xpBreakdown.nextLevel.xpRequired,
            }
          : null,
        xp_to_next_level: xpBreakdown.xpToNextLevel,
        level_progress: xpBreakdown.levelProgress,
        match_xp: xpBreakdown.matchXP.map(m => ({
          match_id: m.matchId,
          match_number: m.matchNumber,
          stage: m.stage,
          match_date: m.matchDate,
          tier: m.tier,
          base_xp: m.baseXP,
          multiplier: m.multiplier,
          multiplied_xp: m.multipliedXP,
        })),
        bonus_events: xpBreakdown.bonusEvents.map(e => ({
          type: e.type,
          label: e.label,
          emoji: e.emoji,
          xp: e.xp,
          match_number: e.matchNumber ?? null,
          detail: e.detail ?? null,
        })),
        earned_badges: xpBreakdown.earnedBadges.map(b => ({
          id: b.id,
          emoji: b.emoji,
          name: b.name,
          xp_bonus: b.xpBonus,
          condition: b.condition,
          rarity: b.rarity,
          tier: b.tier,
          earned_at: b.earnedAt ?? null,
        })),
        all_badges: BADGE_DEFINITIONS.map(b => ({
          id: b.id,
          emoji: b.emoji,
          name: b.name,
          xp_bonus: b.xpBonus,
          condition: b.condition,
          rarity: b.rarity,
          tier: b.tier,
        })),
        levels: LEVELS.map(l => ({
          level: l.level,
          name: l.name,
          xp_required: l.xpRequired,
          badge: l.badge ?? null,
        })),
      },
      accuracy: {
        overall: {
          total_matches: overallAccuracy.totalMatches,
          exact: overallAccuracy.exact,
          winner_gd: overallAccuracy.winnerGd,
          winner: overallAccuracy.winner,
          miss: overallAccuracy.miss,
          hit_rate: overallAccuracy.hitRate,
          exact_rate: overallAccuracy.exactRate,
          total_points: overallAccuracy.totalPoints,
        },
        by_stage: stageAccuracy.map(s => ({
          stage: s.stage,
          stage_label: s.stageLabel,
          total: s.total,
          exact: s.exact,
          winner_gd: s.winnerGd,
          winner: s.winner,
          miss: s.miss,
          hit_rate: s.hitRate,
        })),
      },
      streaks: {
        current_streak: {
          type: streaks.currentStreak.type,
          length: streaks.currentStreak.length,
        },
        longest_hot_streak: streaks.longestHotStreak,
        longest_cold_streak: streaks.longestColdStreak,
        timeline: streaks.timeline.map(t => ({
          match_number: t.matchNumber,
          type: t.type,
          is_correct: t.isCorrect,
        })),
      },
      crowd: {
        total_matches: crowdData.length,
        consensus_count: crowdData.filter(c => !c.userIsContrarian).length,
        contrarian_count: crowdData.filter(c => c.userIsContrarian).length,
        contrarian_wins: crowdData.filter(c => c.userIsContrarian && c.userWasCorrect).length,
        matches: crowdData.map(c => ({
          match_number: c.matchNumber,
          stage: c.stage,
          home_team: c.homeTeamName,
          away_team: c.awayTeamName,
          actual_score: `${c.actualHomeScore}-${c.actualAwayScore}`,
          home_win_pct: c.homeWinPct,
          draw_pct: c.drawPct,
          away_win_pct: c.awayWinPct,
          is_contrarian: c.userIsContrarian,
          is_correct: c.userWasCorrect,
        })),
      },
      pool_stats: {
        avg_accuracy: poolStats.avgPoolAccuracy,
        completed_matches: poolStats.totalCompletedMatches,
        total_entries: poolStats.totalEntries,
        most_predictable: poolStats.mostPredictable.slice(0, 5).map(m => ({
          match_number: m.matchNumber,
          home_team: m.homeTeamName,
          away_team: m.awayTeamName,
          actual_score: m.actualScore,
          hit_rate: m.hitRate,
        })),
        least_predictable: poolStats.leastPredictable.slice(0, 5).map(m => ({
          match_number: m.matchNumber,
          home_team: m.homeTeamName,
          away_team: m.awayTeamName,
          actual_score: m.actualScore,
          hit_rate: m.hitRate,
        })),
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Analytics computation error:', error)
    return NextResponse.json(
      { error: 'Failed to compute analytics', detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export const GET = withPerfLogging('/api/pools/[id]/entries/[id]/analytics', handleGET)
