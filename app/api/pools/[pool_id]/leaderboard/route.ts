import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { DEFAULT_POOL_SETTINGS } from '@/app/pools/[pool_id]/results/points'
import type { PoolSettings } from '@/app/pools/[pool_id]/results/points'
import type { MatchWithResult } from '@/lib/bonusCalculation'
import type { Team, MatchConductData } from '@/lib/tournament'
import { withPerfLogging } from '@/lib/api-perf'
import { matchScoresToPredictionResults, computeStreaks, computeCrowdPredictions } from '@/app/pools/[pool_id]/analytics/analyticsHelpers'
import type { PredictionResult } from '@/app/pools/[pool_id]/analytics/analyticsHelpers'
import { computeFullXPBreakdown, computeLevel } from '@/app/pools/[pool_id]/analytics/xpSystem'
import type { MatchData, PredictionData, MemberData } from '@/app/pools/[pool_id]/types'

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
  last_five: ('exact' | 'winner_gd' | 'winner' | 'miss' | 'no_pick')[]
  current_streak: { type: 'hot' | 'cold' | 'none'; length: number }
  hit_rate: number
  exact_count: number
  level: number
  level_name: string
  total_xp: number
  contrarian_wins: number
  crowd_agreement_pct: number
  total_completed: number
}

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params

  // 1. Authenticate (cookie or Bearer — handled by createClient)
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

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

  // Use admin client for all data queries to bypass RLS
  // (pool membership was already verified above, so this is safe)
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 3. Fetch pool info
  const { data: pool } = await adminClient
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
    { data: _tournamentAwardsRow },
    { data: poolMembers },
  ] = await Promise.all([
    adminClient
      .from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(country_name, flag_url), away_team:teams!matches_away_team_id_fkey(country_name, flag_url)')
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
      .from('tournament_awards')
      .select('champion_team_id, runner_up_team_id, third_place_team_id, best_player, top_scorer')
      .eq('tournament_id', pool.tournament_id)
      .single(),
    adminClient
      .from('pool_members')
      .select('member_id, user_id, role, users(user_id, username, full_name)')
      .eq('pool_id', pool_id),
  ])

  if (!matches || !teams || !poolMembers) {
    return NextResponse.json({ error: 'Failed to fetch pool data' }, { status: 500 })
  }

  // Fetch all entries for these members
  const memberIds = poolMembers.map((m: any) => m.member_id)
  const { data: entries } = await adminClient
    .from('pool_entries')
    .select('entry_id, member_id, entry_name, entry_number, has_submitted_predictions, total_points, point_adjustment, current_rank, previous_rank, match_points, bonus_points, scored_total_points')
    .in('member_id', memberIds)

  if (!entries) {
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
  }

  // Fetch all predictions for all entries — paginate to avoid Supabase's 1000-row limit
  const entryIds = entries.map((e: any) => e.entry_id)
  const allPredictions: any[] = []
  {
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

  // Normalize data
  const normalizedMatches: MatchWithResult[] = matches.map((m: any) => ({
    ...m,
    home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
    away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
  }))

  const settings: PoolSettings = { ...DEFAULT_POOL_SETTINGS, ...(settingsRow || {}) }
  const conduct: MatchConductData[] = conductData || []
  const teamsData: Team[] = (teams as any[]).map(t => ({
    ...t,
    group_letter: t.group_letter?.trim() || '',
    country_code: t.country_code?.trim() || '',
  }))

  // Group predictions by entry_id
  const predictionsByEntry = new Map<string, any[]>()
  for (const p of allPredictions) {
    const list = predictionsByEntry.get(p.entry_id) || []
    list.push(p)
    predictionsByEntry.set(p.entry_id, list)
  }

  // Build member lookup (member_id → user info)
  const memberMap = new Map<string, any>()
  for (const m of poolMembers) {
    memberMap.set((m as any).member_id, m)
  }

  // Build membersWithEntries in MemberData format for computeCrowdPredictions
  const membersWithEntries: MemberData[] = poolMembers.map((m: any) => {
    const memberEntries = entries.filter((e: any) => e.member_id === m.member_id)
    return {
      member_id: m.member_id,
      pool_id,
      user_id: m.user_id,
      role: m.role,
      joined_at: '',
      entry_fee_paid: false,
      users: m.users ?? { user_id: m.user_id, username: '', full_name: '', email: '' },
      entries: memberEntries.map((e: any) => ({
        entry_id: e.entry_id,
        member_id: e.member_id,
        entry_name: e.entry_name,
        entry_number: e.entry_number,
        has_submitted_predictions: e.has_submitted_predictions,
        predictions_submitted_at: null,
        predictions_locked: false,
        auto_submitted: false,
        predictions_last_saved_at: null,
        total_points: e.total_points ?? 0,
        point_adjustment: e.point_adjustment ?? 0,
        adjustment_reason: null,
        current_rank: e.current_rank,
        previous_rank: e.previous_rank,
        last_rank_update: null,
        match_points: e.match_points ?? 0,
        bonus_points: e.bonus_points ?? 0,
        scored_total_points: e.scored_total_points ?? 0,
        created_at: '',
        fee_paid: e.fee_paid ?? false,
        fee_paid_at: e.fee_paid_at ?? null,
      })),
    }
  })

  // Build allPredictions as PredictionData[] (with prediction_id)
  const allPredsTyped: PredictionData[] = allPredictions.map((p: any) => ({
    prediction_id: p.prediction_id || '',
    entry_id: p.entry_id,
    match_id: p.match_id,
    predicted_home_score: p.predicted_home_score,
    predicted_away_score: p.predicted_away_score,
    predicted_home_pso: p.predicted_home_pso ?? null,
    predicted_away_pso: p.predicted_away_pso ?? null,
    predicted_winner_team_id: p.predicted_winner_team_id ?? null,
  }))

  // Fetch stored match_scores for all entries (for analytics)
  const allEntryIds = entries.map((e: any) => e.entry_id)
  const matchScoresByEntry = new Map<string, any[]>()
  if (allEntryIds.length > 0) {
    const pageSize = 1000
    let offset = 0
    let hasMore = true
    while (hasMore) {
      const { data: page } = await adminClient
        .from('match_scores')
        .select('entry_id, match_id, match_number, stage, score_type, total_points')
        .in('entry_id', allEntryIds)
        .range(offset, offset + pageSize - 1)
      if (!page || page.length === 0) {
        hasMore = false
      } else {
        for (const ms of page) {
          const existing = matchScoresByEntry.get(ms.entry_id) || []
          existing.push(ms)
          matchScoresByEntry.set(ms.entry_id, existing)
        }
        offset += page.length
        if (page.length < pageSize) hasMore = false
      }
    }
  }

  // 5. Compute points for each entry
  const leaderboard: LeaderboardEntryResponse[] = []
  const entryPredResultsMap = new Map<string, PredictionResult[]>()

  for (const entry of entries) {
    const member = memberMap.get(entry.member_id)
    if (!member) continue

    const userInfo = (member as any).users
    const predictions = predictionsByEntry.get(entry.entry_id) || []
    const adjustment = entry.point_adjustment ?? 0

    let matchPoints = 0
    let bonusPoints = 0

    // Analytics fields — defaults
    let last_five: ('exact' | 'winner_gd' | 'winner' | 'miss' | 'no_pick')[] = []
    let current_streak: { type: 'hot' | 'cold' | 'none'; length: number } = { type: 'none', length: 0 }
    let hit_rate = 0
    let exact_count = 0
    let level = 1
    let level_name = 'Rookie'
    let total_xp = 0
    let contrarian_wins = 0
    let crowd_agreement_pct = 0
    let total_completed = 0

    if (predictions.length > 0) {
      // Read stored v2 scores (authoritative, computed by scoring engine)
      matchPoints = entry.match_points ?? 0
      bonusPoints = entry.bonus_points ?? 0

      // --- Analytics computation ---
      try {
        // Build PredictionData[] for this entry
        const entryPreds: PredictionData[] = predictions.map((p: any) => ({
          prediction_id: p.prediction_id || '',
          entry_id: p.entry_id,
          match_id: p.match_id,
          predicted_home_score: p.predicted_home_score,
          predicted_away_score: p.predicted_away_score,
          predicted_home_pso: p.predicted_home_pso ?? null,
          predicted_away_pso: p.predicted_away_pso ?? null,
          predicted_winner_team_id: p.predicted_winner_team_id ?? null,
        }))

        const entryMatchScores = matchScoresByEntry.get(entry.entry_id) || []
        const predResults = matchScoresToPredictionResults(entryMatchScores)

        // Store for matchday MVP calculation
        entryPredResultsMap.set(entry.entry_id, predResults)

        const streaks = computeStreaks(predResults)

        const crowdData = computeCrowdPredictions(
          normalizedMatches as MatchData[],
          allPredsTyped as PredictionData[],
          entryPreds as PredictionData[],
          membersWithEntries,
        )

        const xpBreakdown = computeFullXPBreakdown({
          predictionResults: predResults,
          matches: normalizedMatches as MatchData[],
          crowdData,
          streaks,
          entryPredictions: entryPreds as PredictionData[],
          entryRank: entry.current_rank,
          totalMatches: normalizedMatches.length,
        })

        // last_five: take last 5 from predResults, map to type, pad with 'no_pick' if needed
        const lastFiveResults = predResults.slice(-5)
        last_five = lastFiveResults.map(r => r.type as 'exact' | 'winner_gd' | 'winner' | 'miss')
        while (last_five.length < 5) {
          last_five.unshift('no_pick')
        }

        // current_streak
        current_streak = streaks.currentStreak

        // hit_rate: non-miss / total * 100
        total_completed = predResults.length
        const nonMiss = predResults.filter(r => r.type !== 'miss').length
        hit_rate = total_completed > 0 ? (nonMiss / total_completed) * 100 : 0

        // exact_count
        exact_count = predResults.filter(r => r.type === 'exact').length

        // level and XP
        level = xpBreakdown.currentLevel.level
        level_name = xpBreakdown.currentLevel.name
        total_xp = xpBreakdown.totalXP

        // contrarian_wins: count of crowdData where userIsContrarian && userWasCorrect
        contrarian_wins = crowdData.filter(c => c.userIsContrarian && c.userWasCorrect).length

        // crowd_agreement_pct: count of !userIsContrarian / total * 100
        const crowdTotal = crowdData.filter(c => c.userPredictedResult !== null).length
        const agreements = crowdData.filter(c => !c.userIsContrarian && c.userPredictedResult !== null).length
        crowd_agreement_pct = crowdTotal > 0 ? (agreements / crowdTotal) * 100 : 0
      } catch (_e) {
        // If analytics helpers fail, we still return basic leaderboard data
        // Analytics fields remain at their defaults
      }
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
      total_points: entry.scored_total_points ?? (matchPoints + bonusPoints + adjustment),
      current_rank: entry.current_rank,
      previous_rank: entry.previous_rank,
      has_submitted_predictions: entry.has_submitted_predictions,
      last_five,
      current_streak,
      hit_rate,
      exact_count,
      level,
      level_name,
      total_xp,
      contrarian_wins,
      crowd_agreement_pct,
      total_completed,
    })
  }

  // 6. Sort by server-computed current_rank (includes all tiebreakers),
  // falling back to total_points if ranks are not yet computed
  leaderboard.sort((a, b) => {
    if (a.current_rank != null && b.current_rank != null) {
      if (a.current_rank !== b.current_rank) return a.current_rank - b.current_rank
    }
    return b.total_points - a.total_points
  })

  // 7. Compute pool-wide analytics data

  // --- Awards ---
  const awards: { type: string; emoji: string; label: string; entry_id: string }[] = []
  // MVP = 1st place
  if (leaderboard.length > 0) awards.push({ type: 'mvp', emoji: '🏆', label: 'MVP', entry_id: leaderboard[0].entry_id })
  // Contrarian King = most contrarian_wins
  const contrarianKing = leaderboard.reduce((max, e) => (e.contrarian_wins > (max?.contrarian_wins ?? 0)) ? e : max, null as LeaderboardEntryResponse | null)
  if (contrarianKing && contrarianKing.contrarian_wins > 0) awards.push({ type: 'contrarian', emoji: '🎲', label: 'Contrarian King', entry_id: contrarianKing.entry_id })
  // Crowd Follower = highest crowd_agreement_pct (min 3 completed)
  const crowdFollower = leaderboard.filter(e => e.total_completed >= 3).reduce((max, e) => (e.crowd_agreement_pct > (max?.crowd_agreement_pct ?? 0)) ? e : max, null as LeaderboardEntryResponse | null)
  if (crowdFollower) awards.push({ type: 'crowd', emoji: '👥', label: 'Crowd Follower', entry_id: crowdFollower.entry_id })
  // Hot Streak = longest current hot streak >= 3 (one person only)
  const hottestEntry = leaderboard.filter(e => e.current_streak.type === 'hot' && e.current_streak.length >= 3).sort((a, b) => b.current_streak.length - a.current_streak.length)[0]
  if (hottestEntry) awards.push({ type: 'hot', emoji: '🔥', label: `On Fire (${hottestEntry.current_streak.length})`, entry_id: hottestEntry.entry_id })
  // Cold Streak = longest current cold streak >= 3 (one person only)
  const coldestEntry = leaderboard.filter(e => e.current_streak.type === 'cold' && e.current_streak.length >= 3).sort((a, b) => b.current_streak.length - a.current_streak.length)[0]
  if (coldestEntry) awards.push({ type: 'cold', emoji: '❄️', label: 'Ice Cold', entry_id: coldestEntry.entry_id })
  // Sharpshooter = most exact scores (one person only)
  const sharpshooterEntry = leaderboard.filter(e => e.exact_count > 0).sort((a, b) => b.exact_count - a.exact_count)[0]
  if (sharpshooterEntry) awards.push({ type: 'sharpshooter', emoji: '🎯', label: 'Sharpshooter', entry_id: sharpshooterEntry.entry_id })

  // --- Superlatives ---
  const superlatives: { type: string; emoji: string; title: string; entry_id: string; name: string; detail: string }[] = []
  // Hottest Right Now
  const hottest = leaderboard.filter(e => e.current_streak.type === 'hot' && e.current_streak.length >= 2).sort((a, b) => b.current_streak.length - a.current_streak.length)[0]
  if (hottest) superlatives.push({ type: 'hot', emoji: '🔥', title: 'Hottest Right Now', entry_id: hottest.entry_id, name: hottest.entry_name || hottest.full_name, detail: `${hottest.current_streak.length}-match win streak` })
  // Ice Cold
  const coldest = leaderboard.filter(e => e.current_streak.type === 'cold' && e.current_streak.length >= 2).sort((a, b) => b.current_streak.length - a.current_streak.length)[0]
  if (coldest) superlatives.push({ type: 'cold', emoji: '❄️', title: 'Ice Cold', entry_id: coldest.entry_id, name: coldest.entry_name || coldest.full_name, detail: `${coldest.current_streak.length} misses in a row` })
  // Contrarian King
  if (contrarianKing && contrarianKing.contrarian_wins > 0) superlatives.push({ type: 'contrarian', emoji: '🎲', title: 'Contrarian King', entry_id: contrarianKing.entry_id, name: contrarianKing.entry_name || contrarianKing.full_name, detail: `${contrarianKing.contrarian_wins} contrarian wins` })
  // Crowd Follower
  if (crowdFollower && crowdFollower.total_completed >= 3) superlatives.push({ type: 'crowd', emoji: '👥', title: 'Crowd Follower', entry_id: crowdFollower.entry_id, name: crowdFollower.entry_name || crowdFollower.full_name, detail: `${Math.round(crowdFollower.crowd_agreement_pct)}% consensus picks` })
  // Sharpshooter
  const sharpshooter = leaderboard.filter(e => e.exact_count > 0).sort((a, b) => b.exact_count - a.exact_count)[0]
  if (sharpshooter) superlatives.push({ type: 'sharpshooter', emoji: '🎯', title: 'Sharpshooter', entry_id: sharpshooter.entry_id, name: sharpshooter.entry_name || sharpshooter.full_name, detail: `${sharpshooter.exact_count} exact scores` })
  // Biggest Climber
  const climber = leaderboard.filter(e => e.current_rank != null && e.previous_rank != null).sort((a, b) => ((b.previous_rank! - b.current_rank!) - (a.previous_rank! - a.current_rank!)))[0]
  if (climber && climber.previous_rank! - climber.current_rank! > 0) superlatives.push({ type: 'climber', emoji: '📈', title: 'Biggest Climber', entry_id: climber.entry_id, name: climber.entry_name || climber.full_name, detail: `Up ${climber.previous_rank! - climber.current_rank!} places` })
  // Biggest Faller
  const faller = leaderboard.filter(e => e.current_rank != null && e.previous_rank != null).sort((a, b) => ((a.previous_rank! - a.current_rank!) - (b.previous_rank! - b.current_rank!)))[0]
  if (faller && faller.previous_rank! - faller.current_rank! < 0) superlatives.push({ type: 'faller', emoji: '📉', title: 'Biggest Faller', entry_id: faller.entry_id, name: faller.entry_name || faller.full_name, detail: `Down ${Math.abs(faller.previous_rank! - faller.current_rank!)} places` })

  // --- Matchday MVP ---
  const completedMatches = normalizedMatches.filter(m => m.is_completed)
  const lastCompleted = completedMatches.length > 0 ? completedMatches[completedMatches.length - 1] : null
  let matchday_mvp: { entry_id: string; entry_name: string; full_name: string; match_points: number; match_number: number } | null = null
  if (lastCompleted) {
    // Find which entry scored most points on this match
    let bestEntry: LeaderboardEntryResponse | null = null
    let bestPoints = 0
    for (const [entryId, results] of entryPredResultsMap) {
      const matchResult = results.find(r => r.matchId === lastCompleted.match_id)
      if (matchResult && matchResult.points > bestPoints) {
        bestPoints = matchResult.points
        bestEntry = leaderboard.find(e => e.entry_id === entryId) ?? null
      }
    }
    if (bestEntry && bestPoints > 0) {
      matchday_mvp = { entry_id: bestEntry.entry_id, entry_name: bestEntry.entry_name, full_name: bestEntry.full_name, match_points: bestPoints, match_number: lastCompleted.match_number }
    }
  }

  // --- Matchday Info ---
  const completedCount = completedMatches.length
  const upcomingMatches = normalizedMatches.filter(m => !m.is_completed && m.status !== 'live').sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime())
  const matchday_info = {
    last_match_number: lastCompleted?.match_number ?? null,
    next_match_date: upcomingMatches.length > 0 ? upcomingMatches[0].match_date : null,
    completed_count: completedCount,
    total_count: normalizedMatches.length,
  }

  return NextResponse.json({
    pool_id,
    prediction_mode: pool.prediction_mode,
    entries: leaderboard,
    awards,
    superlatives,
    matchday_mvp,
    matchday_info,
  })
}

export const GET = withPerfLogging('/api/pools/[id]/leaderboard', handleGET)
