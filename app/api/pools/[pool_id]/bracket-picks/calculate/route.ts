import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  calculateBracketPickerPoints,
  type MatchWithResult as BPMatchWithResult,
} from '@/lib/bracketPickerScoring'
import { calculateGroupStandings, rankThirdPlaceTeams, GROUP_LETTERS } from '@/lib/tournament'
import type { GroupStanding, Team, MatchConductData, PredictionMap, ScoreEntry } from '@/lib/tournament'
import type { BPGroupRanking, BPThirdPlaceRanking, BPKnockoutPick, SettingsData } from '@/app/pools/[pool_id]/types'
import { recalculatePool } from '@/lib/scoring'

// Allow up to 60s on Vercel Hobby plan (default is 10s, too short for this route)
export const maxDuration = 60

// =============================================================
// POST /api/pools/:poolId/bracket-picks/calculate
// Recalculates bracket picker points for all members in the pool.
// Admin or super admin only.
// =============================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params

  try {
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

    // Create admin client for reading all entries (bypasses RLS) and writing scores
    const adminClient = createAdminClient()

    // 3. Fetch pool info
    const { data: pool } = await supabase
      .from('pools')
      .select('pool_id, tournament_id, prediction_mode')
      .eq('pool_id', pool_id)
      .single()

    if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

    if (pool.prediction_mode !== 'bracket_picker') {
      return NextResponse.json({ error: 'Pool is not in bracket picker mode' }, { status: 400 })
    }

    // 4. Fetch all needed data in parallel (use adminClient to bypass RLS for cross-user reads)
    const [
      { data: matches, error: matchesErr },
      { data: teams, error: teamsErr },
      { data: conductData },
      { data: settingsRow },
      { data: poolMembers, error: membersErr },
    ] = await Promise.all([
      adminClient
        .from('matches')
        .select('*')
        .eq('tournament_id', pool.tournament_id)
        .order('match_number', { ascending: true }),
      adminClient
        .from('teams')
        .select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url'),
      adminClient
        .from('match_conduct')
        .select('match_id, team_id, yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards'),
      adminClient
        .from('pool_settings')
        .select('*')
        .eq('pool_id', pool_id)
        .single(),
      adminClient
        .from('pool_members')
        .select('member_id')
        .eq('pool_id', pool_id),
    ])

    if (!matches || !teams || !poolMembers) {
      const errMsg = matchesErr?.message || teamsErr?.message || membersErr?.message || 'Unknown'
      return NextResponse.json({ error: `Failed to fetch data: ${errMsg}` }, { status: 500 })
    }

    // Build settings (merge with defaults via the scoring function)
    const settings: SettingsData = (settingsRow || {}) as SettingsData

    // Build team data
    const teamsData: Team[] = (teams as any[]).map(t => ({
      ...t,
      group_letter: t.group_letter?.trim() || '',
      country_code: t.country_code?.trim() || '',
    }))

    // Cast matches to BPMatchWithResult (the scoring function needs is_completed, scores, etc.)
    const allMatches: BPMatchWithResult[] = (matches as any[]).map(m => ({
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

    // =========================================================================
    // COMPUTE ACTUAL GROUP STANDINGS
    // =========================================================================
    // We need actual group standings from real match results to compare against
    // the user's predicted group rankings.

    const conduct: MatchConductData[] = conductData || []

    // Build a "prediction map" from actual results so we can reuse calculateGroupStandings
    const actualResultsMap: PredictionMap = new Map()
    for (const m of allMatches) {
      if (m.is_completed && m.home_score_ft != null && m.away_score_ft != null) {
        const entry: ScoreEntry = {
          home: m.home_score_ft,
          away: m.away_score_ft,
          homePso: m.home_score_pso ?? null,
          awayPso: m.away_score_pso ?? null,
          winnerTeamId: m.winner_team_id ?? null,
        }
        actualResultsMap.set(m.match_id, entry)
      }
    }

    const actualGroupStandings = new Map<string, GroupStanding[]>()
    for (const letter of GROUP_LETTERS) {
      const groupMatches = allMatches.filter(m => m.stage === 'group' && m.group_letter === letter)
      if (groupMatches.length === 0) continue

      const standings = calculateGroupStandings(
        letter,
        groupMatches,
        actualResultsMap,
        teamsData,
        conduct,
      )
      actualGroupStandings.set(letter, standings)
    }

    // =========================================================================
    // COMPUTE ACTUAL THIRD-PLACE QUALIFIERS
    // =========================================================================
    // Rank all third-place teams across groups, take the best 8 as qualifiers

    const actualThirdPlaceQualifierTeamIds = new Set<string>()

    // Only do this if enough groups have completed
    const completedGroupLetters = new Set<string>()
    for (const [letter] of actualGroupStandings) {
      // A group is "complete" if all 6 group matches for it are completed
      const groupMatches = allMatches.filter(
        m => m.stage === 'group' && m.group_letter === letter && m.is_completed
      )
      if (groupMatches.length >= 6) {
        completedGroupLetters.add(letter)
      }
    }

    // Build standings map with only completed groups for third-place ranking
    const completedStandingsMap = new Map<string, GroupStanding[]>()
    for (const letter of completedGroupLetters) {
      const standings = actualGroupStandings.get(letter)
      if (standings) completedStandingsMap.set(letter, standings)
    }

    if (completedStandingsMap.size === 12) {
      // All groups complete — rank all third-place teams
      const rankedThird = rankThirdPlaceTeams(completedStandingsMap)
      const best8 = rankedThird.slice(0, 8)
      for (const t of best8) {
        actualThirdPlaceQualifierTeamIds.add(t.team_id)
      }
    }

    // =========================================================================
    // FETCH ALL ENTRIES AND THEIR BP PREDICTIONS
    // =========================================================================

    const memberIds = poolMembers.map((m: any) => m.member_id)
    const { data: entries, error: entriesErr } = await adminClient
      .from('pool_entries')
      .select('entry_id, member_id, has_submitted_predictions')
      .in('member_id', memberIds)

    if (!entries) {
      return NextResponse.json({ error: `Failed to fetch entries: ${entriesErr?.message || 'Unknown'}` }, { status: 500 })
    }

    // Only process entries that have submitted predictions
    const submittedEntries = entries.filter((e: any) => e.has_submitted_predictions)

    if (submittedEntries.length === 0) {
      // Still recalculate v2 scores to clear any stale data
      await recalculatePool({ poolId: pool_id })

      return NextResponse.json({
        success: true,
        entriesProcessed: 0,
        totalBonusEntries: 0,
        totalBonusPoints: 0,
        message: 'No submitted entries found',
      })
    }

    const entryIds = submittedEntries.map((e: any) => e.entry_id)

    // Fetch all bracket picker data for all entries in parallel (use adminClient to bypass RLS)
    const [
      { data: allGroupRankings },
      { data: allThirdPlaceRankings },
      { data: allKnockoutPicks },
    ] = await Promise.all([
      adminClient
        .from('bracket_picker_group_rankings')
        .select('*')
        .in('entry_id', entryIds),
      adminClient
        .from('bracket_picker_third_place_rankings')
        .select('*')
        .in('entry_id', entryIds),
      adminClient
        .from('bracket_picker_knockout_picks')
        .select('*')
        .in('entry_id', entryIds),
    ])

    // Group BP data by entry_id
    const groupRankingsByEntry = new Map<string, BPGroupRanking[]>()
    const thirdPlaceByEntry = new Map<string, BPThirdPlaceRanking[]>()
    const knockoutPicksByEntry = new Map<string, BPKnockoutPick[]>()

    for (const r of (allGroupRankings || []) as any[]) {
      const list = groupRankingsByEntry.get(r.entry_id) || []
      list.push(r as BPGroupRanking)
      groupRankingsByEntry.set(r.entry_id, list)
    }

    for (const r of (allThirdPlaceRankings || []) as any[]) {
      const list = thirdPlaceByEntry.get(r.entry_id) || []
      list.push(r as BPThirdPlaceRanking)
      thirdPlaceByEntry.set(r.entry_id, list)
    }

    for (const p of (allKnockoutPicks || []) as any[]) {
      const list = knockoutPicksByEntry.get(p.entry_id) || []
      list.push(p as BPKnockoutPick)
      knockoutPicksByEntry.set(p.entry_id, list)
    }

    // =========================================================================
    // CALCULATE SCORES FOR EACH ENTRY
    // =========================================================================

    // Bulk delete all existing bonus_scores for these entries in one DB call
    const { error: deleteErr } = await adminClient
      .from('bonus_scores')
      .delete()
      .in('entry_id', entryIds)

    if (deleteErr) {
      console.error('Failed to bulk delete bonus_scores:', deleteErr)
    }

    let totalBonusPoints = 0
    const allBonusRows: {
      entry_id: string
      bonus_type: string
      bonus_category: string
      related_group_letter: string | null
      related_match_id: string | null
      points_earned: number
      description: string
    }[] = []

    for (const entry of submittedEntries) {
      const entryId = entry.entry_id
      const groupRankings = groupRankingsByEntry.get(entryId) || []
      const thirdPlaceRankings = thirdPlaceByEntry.get(entryId) || []
      const knockoutPicks = knockoutPicksByEntry.get(entryId) || []

      // Skip entries without any picks
      if (groupRankings.length === 0 && thirdPlaceRankings.length === 0 && knockoutPicks.length === 0) {
        continue
      }

      // Calculate bracket picker points
      const breakdown = calculateBracketPickerPoints({
        groupRankings,
        thirdPlaceRankings,
        knockoutPicks,
        actualGroupStandings,
        actualThirdPlaceQualifierTeamIds,
        completedMatches: allMatches,
        settings,
      })

      // Group ranking details — include all positions (correct and incorrect)
      const positionLabels = ['1st', '2nd', '3rd', '4th'] as const
      for (const d of breakdown.groupDetails) {
        const team = teamsData.find(t => t.team_id === d.team_id)
        const teamName = team?.country_name || d.team_id
        const posLabel = positionLabels[d.position - 1] ?? `${d.position}th`
        const correctness = d.correct ? 'Correctly' : 'Incorrectly'
        allBonusRows.push({
          entry_id: entryId,
          bonus_type: `bp_group_position_${d.position}`,
          bonus_category: 'bp_group',
          related_group_letter: d.group_letter,
          related_match_id: null,
          points_earned: d.points,
          description: `Group ${d.group_letter} ${posLabel} position: ${correctness} predicted ${teamName}`,
        })
      }

      // Third-place ranking details
      for (const d of breakdown.thirdPlaceDetails) {
        if (d.points > 0) {
          const team = teamsData.find(t => t.team_id === d.team_id)
          const label = d.predicted_qualifies ? 'qualifies' : 'eliminated'
          allBonusRows.push({
            entry_id: entryId,
            bonus_type: `bp_third_${label}`,
            bonus_category: 'bp_third_place',
            related_group_letter: d.group_letter,
            related_match_id: null,
            points_earned: d.points,
            description: `Correctly predicted ${team?.country_name || d.team_id} (Group ${d.group_letter}) ${label}`,
          })
        }
      }

      // Third-place all correct bonus
      if (breakdown.thirdPlaceAllCorrectBonus > 0) {
        allBonusRows.push({
          entry_id: entryId,
          bonus_type: 'bp_third_all_correct',
          bonus_category: 'bp_third_place',
          related_group_letter: null,
          related_match_id: null,
          points_earned: breakdown.thirdPlaceAllCorrectBonus,
          description: 'Correctly predicted all 8 qualifying third-place teams',
        })
      }

      // Knockout details
      for (const d of breakdown.knockoutDetails) {
        if (d.points > 0) {
          const stageLabel = formatStage(d.stage)
          const team = teamsData.find(t => t.team_id === d.predicted_winner)
          allBonusRows.push({
            entry_id: entryId,
            bonus_type: `bp_knockout_${d.stage}`,
            bonus_category: 'bp_knockout',
            related_group_letter: null,
            related_match_id: d.match_id,
            points_earned: d.points,
            description: `Correctly predicted ${team?.country_name || d.predicted_winner} to win Match ${d.match_number} (${stageLabel})`,
          })
        }
      }

      // Penalty prediction points
      if (breakdown.penaltyPoints > 0) {
        allBonusRows.push({
          entry_id: entryId,
          bonus_type: 'bp_penalty_predictions',
          bonus_category: 'bp_bonus',
          related_group_letter: null,
          related_match_id: null,
          points_earned: breakdown.penaltyPoints,
          description: `Penalty prediction points (${breakdown.penaltyPoints} pts)`,
        })
      }

      // Champion bonus
      if (breakdown.championBonus > 0) {
        allBonusRows.push({
          entry_id: entryId,
          bonus_type: 'bp_champion',
          bonus_category: 'bp_bonus',
          related_group_letter: null,
          related_match_id: null,
          points_earned: breakdown.championBonus,
          description: 'Correctly predicted the tournament champion',
        })
      }

      totalBonusPoints += breakdown.total
    }

    // Bulk insert all bonus_scores in one DB call
    if (allBonusRows.length > 0) {
      const { error: insertError } = await adminClient
        .from('bonus_scores')
        .insert(allBonusRows)

      if (insertError) {
        console.error('Failed to bulk insert bonus_scores:', insertError)
      }
    }

    // =========================================================================
    // RECALCULATE LEADERBOARD
    // =========================================================================

    const recalcResult = await recalculatePool({ poolId: pool_id })

    if (!recalcResult.success) {
      console.error('v2 recalculation error:', recalcResult.error)
    }

    return NextResponse.json({
      success: true,
      entriesProcessed: submittedEntries.length,
      totalBonusEntries: allBonusRows.length,
      totalBonusPoints,
    })
  } catch (err: any) {
    console.error('Bracket picker calculate error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error during bracket picker calculation' },
      { status: 500 }
    )
  }
}

// =============================================
// HELPERS
// =============================================

function formatStage(stage: string): string {
  switch (stage) {
    case 'round_32': return 'Round of 32'
    case 'round_16': return 'Round of 16'
    case 'quarter_final': return 'Quarter-Final'
    case 'semi_final': return 'Semi-Final'
    case 'third_place': return 'Third-Place Match'
    case 'final': return 'Final'
    default: return stage
  }
}
