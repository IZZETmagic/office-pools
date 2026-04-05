import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { calculateGroupStandings, rankThirdPlaceTeams, GROUP_LETTERS } from '@/lib/tournament'
import type { GroupStanding, Team, MatchConductData, PredictionMap, ScoreEntry } from '@/lib/tournament'
import type { BPGroupRanking, BPThirdPlaceRanking, BPKnockoutPick, TeamData, MatchData } from '@/app/pools/[pool_id]/types'
import type { MatchWithResult } from '@/lib/bracketPickerScoring'
import {
  computeFullBPXPBreakdown,
  computeBPPoolComparison,
  BP_BADGE_DEFINITIONS,
} from '@/app/pools/[pool_id]/analytics/bracketPickerXpSystem'
import { LEVELS } from '@/app/pools/[pool_id]/analytics/xpSystem'
import { withPerfLogging } from '@/lib/api-perf'

// =============================================================
// GET /api/pools/:poolId/entries/:entryId/bracket-analytics
// Returns bracket picker analytics data (XP breakdown, badges,
// pool comparison) for a specific entry.
// =============================================================

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string; entry_id: string }> }
) {
  const { pool_id, entry_id } = await params

  // 1. Authenticate
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
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 3. Fetch pool info
  const { data: pool } = await adminClient
    .from('pools')
    .select('pool_id, tournament_id, prediction_mode, created_at')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  if (pool.prediction_mode !== 'bracket_picker') {
    return NextResponse.json({ error: 'Pool is not in bracket picker mode' }, { status: 400 })
  }

  // 4. Verify entry belongs to this pool
  const { data: entry } = await adminClient
    .from('pool_entries')
    .select('entry_id, member_id, has_submitted_predictions, predictions_submitted_at')
    .eq('entry_id', entry_id)
    .single()

  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  const { data: entryMember } = await adminClient
    .from('pool_members')
    .select('member_id')
    .eq('member_id', entry.member_id)
    .eq('pool_id', pool_id)
    .single()

  if (!entryMember) {
    return NextResponse.json({ error: 'Entry does not belong to this pool' }, { status: 404 })
  }

  // 5. Fetch all needed data in parallel
  const [
    { data: matches },
    { data: teams },
    { data: conductData },
    { data: members },
    { data: entryGroupRankings },
    { data: entryThirdPlaceRankings },
    { data: entryKnockoutPicks },
  ] = await Promise.all([
    adminClient
      .from('matches')
      .select('*')
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
      .from('pool_members')
      .select('member_id, pool_entries(entry_id, has_submitted_predictions)')
      .eq('pool_id', pool_id),
    adminClient
      .from('bracket_picker_group_rankings')
      .select('*')
      .eq('entry_id', entry_id),
    adminClient
      .from('bracket_picker_third_place_rankings')
      .select('*')
      .eq('entry_id', entry_id),
    adminClient
      .from('bracket_picker_knockout_picks')
      .select('*')
      .eq('entry_id', entry_id),
  ])

  if (!matches || !teams) {
    return NextResponse.json({ error: 'Failed to fetch pool data' }, { status: 500 })
  }

  const conduct: MatchConductData[] = conductData || []
  const teamsData: TeamData[] = (teams as any[]).map(t => ({
    ...t,
    group_letter: t.group_letter?.trim() || '',
    country_code: t.country_code?.trim() || '',
  }))

  const groupRankings = (entryGroupRankings || []) as BPGroupRanking[]
  const thirdPlaceRankings = (entryThirdPlaceRankings || []) as BPThirdPlaceRanking[]
  const knockoutPicks = (entryKnockoutPicks || []) as BPKnockoutPick[]

  // Check if any matches are completed
  const completedMatches = matches.filter((m: any) => m.is_completed)
  if (completedMatches.length === 0) {
    return NextResponse.json({ error: 'No completed matches yet' }, { status: 200 })
  }

  // 6. Compute actual group standings from real match results
  const actualResultsMap: PredictionMap = new Map()
  for (const m of matches as any[]) {
    if (m.is_completed && m.home_score_ft != null && m.away_score_ft != null) {
      const scoreEntry: ScoreEntry = {
        home: m.home_score_ft,
        away: m.away_score_ft,
        homePso: m.home_score_pso ?? null,
        awayPso: m.away_score_pso ?? null,
        winnerTeamId: m.winner_team_id ?? null,
      }
      actualResultsMap.set(m.match_id, scoreEntry)
    }
  }

  const tournamentTeams: Team[] = teamsData.map(t => ({
    team_id: t.team_id,
    country_name: t.country_name,
    country_code: t.country_code,
    group_letter: t.group_letter,
    fifa_ranking_points: t.fifa_ranking_points,
    flag_url: t.flag_url,
  }))

  const actualGroupStandings = new Map<string, GroupStanding[]>()
  const completedGroups = new Set<string>()
  for (const letter of GROUP_LETTERS) {
    const groupMatches = (matches as any[]).filter((m: any) => m.stage === 'group' && m.group_letter === letter)
    if (groupMatches.length === 0) continue
    const standings = calculateGroupStandings(letter, groupMatches, actualResultsMap, tournamentTeams, conduct)
    actualGroupStandings.set(letter, standings)

    const completedGroupMatches = groupMatches.filter((m: any) => m.is_completed)
    if (completedGroupMatches.length >= 6) {
      completedGroups.add(letter)
    }
  }

  // 7. Compute third-place qualifiers
  const completedStandingsMap = new Map<string, GroupStanding[]>()
  for (const letter of completedGroups) {
    const standings = actualGroupStandings.get(letter)
    if (standings) completedStandingsMap.set(letter, standings)
  }

  const actualThirdPlaceQualifierTeamIds = new Set<string>()
  if (completedStandingsMap.size >= 12) {
    const rankedThird = rankThirdPlaceTeams(completedStandingsMap)
    for (const t of rankedThird.slice(0, 8)) {
      actualThirdPlaceQualifierTeamIds.add(t.team_id)
    }
  }

  // 8. Build completed knockout matches
  const bpCompletedMatches: MatchWithResult[] = (matches as any[])
    .filter((m: any) => m.stage !== 'group' && m.is_completed)
    .map((m: any) => ({
      match_id: m.match_id,
      match_number: m.match_number,
      stage: m.stage,
      group_letter: m.group_letter,
      match_date: m.match_date,
      venue: m.venue,
      status: m.status,
      home_team_id: m.home_team_id,
      away_team_id: m.away_team_id,
      home_team_placeholder: m.home_team_placeholder,
      away_team_placeholder: m.away_team_placeholder,
      home_team: null,
      away_team: null,
      is_completed: m.is_completed ?? false,
      home_score_ft: m.home_score_ft,
      away_score_ft: m.away_score_ft,
      home_score_pso: m.home_score_pso,
      away_score_pso: m.away_score_pso,
      winner_team_id: m.winner_team_id,
    }))

  // 9. Compute bracket picker XP breakdown
  try {
    const matchesData: MatchData[] = (matches as any[]).map((m: any) => ({
      ...m,
      home_team: null,
      away_team: null,
    }))

    const bpXpBreakdown = computeFullBPXPBreakdown({
      groupRankings,
      thirdPlaceRankings,
      knockoutPicks,
      actualGroupStandings,
      actualThirdPlaceQualifierTeamIds,
      completedMatches: bpCompletedMatches,
      matches: matchesData,
      teams: teamsData,
      submittedAt: entry.predictions_submitted_at ?? null,
      poolCreatedAt: pool.created_at,
    })

    // 10. Compute pool comparison (fetch all entries' bracket data)
    let poolComparison = null

    const submittedEntryIds = new Set<string>()
    for (const member of (members || []) as any[]) {
      for (const e of (member.pool_entries || [])) {
        if (e.has_submitted_predictions) submittedEntryIds.add(e.entry_id)
      }
    }

    if (submittedEntryIds.size >= 2) {
      const allEntryIds = [...submittedEntryIds]

      const [
        { data: allGroupRankings },
        { data: allThirdPlaceRankings },
        { data: allKnockoutPicks },
      ] = await Promise.all([
        adminClient.from('bracket_picker_group_rankings').select('*').in('entry_id', allEntryIds),
        adminClient.from('bracket_picker_third_place_rankings').select('*').in('entry_id', allEntryIds),
        adminClient.from('bracket_picker_knockout_picks').select('*').in('entry_id', allEntryIds),
      ])

      const rankedThirds = completedStandingsMap.size >= 12
        ? rankThirdPlaceTeams(completedStandingsMap)
        : []

      poolComparison = computeBPPoolComparison({
        userGroupRankings: groupRankings,
        userThirdPlaceRankings: thirdPlaceRankings,
        userKnockoutPicks: knockoutPicks,
        allGroupRankings: (allGroupRankings || []) as BPGroupRanking[],
        allThirdPlaceRankings: (allThirdPlaceRankings || []) as BPThirdPlaceRanking[],
        allKnockoutPicks: (allKnockoutPicks || []) as BPKnockoutPick[],
        actualGroupStandings,
        actualThirdPlaceQualifierTeamIds: new Set(rankedThirds.slice(0, 8).map(t => t.team_id)),
        completedKnockoutMatches: bpCompletedMatches,
        matches: matchesData,
        submittedEntryIds,
      })
    }

    // 11. Build response
    const response = {
      xp: {
        total_xp: bpXpBreakdown.totalXP,
        total_group_base_xp: bpXpBreakdown.totalGroupBaseXP,
        total_group_bonus_xp: bpXpBreakdown.totalGroupBonusXP,
        total_third_place_xp: bpXpBreakdown.totalThirdPlaceXP,
        total_knockout_base_xp: bpXpBreakdown.totalKnockoutBaseXP,
        total_knockout_bonus_xp: bpXpBreakdown.totalKnockoutBonusXP,
        total_badge_xp: bpXpBreakdown.totalBadgeXP,
        current_level: {
          level: bpXpBreakdown.currentLevel.level,
          name: bpXpBreakdown.currentLevel.name,
          xp_required: bpXpBreakdown.currentLevel.xpRequired,
        },
        next_level: bpXpBreakdown.nextLevel
          ? {
              level: bpXpBreakdown.nextLevel.level,
              name: bpXpBreakdown.nextLevel.name,
              xp_required: bpXpBreakdown.nextLevel.xpRequired,
            }
          : null,
        xp_to_next_level: bpXpBreakdown.xpToNextLevel,
        level_progress: bpXpBreakdown.levelProgress,
        bonus_events: bpXpBreakdown.bonusEvents.map(e => ({
          type: e.type,
          label: e.label,
          emoji: e.emoji,
          xp: e.xp,
          detail: e.detail ?? null,
        })),
        earned_badges: bpXpBreakdown.earnedBadges.map(b => ({
          id: b.id,
          emoji: b.emoji,
          name: b.name,
          xp_bonus: b.xpBonus,
          condition: b.condition,
          rarity: b.rarity,
          tier: b.tier,
        })),
        all_badges: BP_BADGE_DEFINITIONS.map(b => ({
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
        group_xp: bpXpBreakdown.groupXP.map(g => ({
          group_letter: g.group_letter,
          positions: g.positions.map(p => ({
            team_id: p.team_id,
            predicted_position: p.predicted_position,
            actual_position: p.actual_position,
            correct: p.correct,
            xp: p.xp,
          })),
          qualifiers_correct: g.qualifiersCorrect,
          qualifiers_bonus_xp: g.qualifiersBonusXP,
          perfect_order: g.perfectOrder,
          perfect_order_bonus_xp: g.perfectOrderBonusXP,
          total_group_xp: g.totalGroupXP,
        })),
        third_place_xp: bpXpBreakdown.thirdPlaceXP.map(t => ({
          team_id: t.team_id,
          group_letter: t.group_letter,
          predicted_qualifies: t.predicted_qualifies,
          actually_qualifies: t.actually_qualifies,
          correct: t.correct,
          xp: t.xp,
        })),
        third_place_perfect_bonus_xp: bpXpBreakdown.thirdPlacePerfectBonusXP,
        knockout_xp: bpXpBreakdown.knockoutXP.map(k => ({
          match_id: k.match_id,
          match_number: k.match_number,
          stage: k.stage,
          predicted_winner: k.predicted_winner,
          actual_winner: k.actual_winner,
          correct: k.correct,
          xp: k.xp,
        })),
      },
      pool_comparison: poolComparison
        ? {
            user_overall_accuracy: poolComparison.userOverallAccuracy,
            pool_avg_overall_accuracy: poolComparison.poolAvgOverallAccuracy,
            user_group_correct: poolComparison.userGroupCorrect,
            user_group_total: poolComparison.userGroupTotal,
            pool_avg_group_correct: poolComparison.poolAvgGroupCorrect,
            user_knockout_correct: poolComparison.userKnockoutCorrect,
            user_knockout_total: poolComparison.userKnockoutTotal,
            pool_avg_knockout_correct: poolComparison.poolAvgKnockoutCorrect,
            user_third_correct: poolComparison.userThirdCorrect,
            user_third_total: poolComparison.userThirdTotal,
            pool_avg_third_correct: poolComparison.poolAvgThirdCorrect,
            consensus_count: poolComparison.consensusCount,
            contrarian_count: poolComparison.contrarianCount,
            contrarian_wins: poolComparison.contrarianWins,
            pool_avg_consensus: poolComparison.poolAvgConsensus,
            pool_avg_contrarian: poolComparison.poolAvgContrarian,
            pool_avg_contrarian_wins: poolComparison.poolAvgContrarianWins,
            total_entries: poolComparison.totalEntries,
            total_scored_picks: poolComparison.totalScoredPicks,
            most_popular_champion: poolComparison.mostPopularChampion
              ? {
                  team_id: poolComparison.mostPopularChampion.team_id,
                  count: poolComparison.mostPopularChampion.count,
                  pct: poolComparison.mostPopularChampion.pct,
                }
              : null,
          }
        : null,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Bracket analytics computation error:', error)
    return NextResponse.json(
      { error: 'Failed to compute bracket analytics', detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export const GET = withPerfLogging('/api/pools/[id]/entries/[id]/bracket-analytics', handleGET)
