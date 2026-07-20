import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { DEFAULT_POOL_SETTINGS } from '@/app/pools/[pool_id]/results/points'
import type { PoolSettings } from '@/app/pools/[pool_id]/results/points'
import { withPerfLogging } from '@/lib/api-perf'
import { getScoringSource, readMatchScores, readBonusScores, readEntryScoring } from '@/lib/scoring/readSource'
import { computeEntryPredictedPodium } from '@/lib/bracketResolver'

type PodiumTeamApi = { team_id: string; country_name: string; flag_url: string | null }
type PodiumApi = { champion: PodiumTeamApi | null; runnerUp: PodiumTeamApi | null; thirdPlace: PodiumTeamApi | null }

// =============================================================
// GET /api/pools/:poolId/entries/:entryId/breakdown
// Returns a detailed points breakdown for a specific entry.
// Authenticated pool members can access this.
// =============================================================

type MatchResultRow = {
  match_number: number
  stage: string
  home_team: string
  away_team: string
  home_flag_url: string | null
  away_flag_url: string | null
  actual_home: number
  actual_away: number
  predicted_home: number
  predicted_away: number
  actual_home_pso: number | null
  actual_away_pso: number | null
  predicted_home_pso: number | null
  predicted_away_pso: number | null
  predicted_home_team: string | null
  predicted_away_team: string | null
  teams_match: boolean
  type: 'exact' | 'winner_gd' | 'winner' | 'miss'
  base_points: number
  multiplier: number
  pso_points: number
  total_points: number
}

type BonusEntryRow = {
  bonus_category: string
  bonus_type: string
  description: string
  points_earned: number
}

type BreakdownResponse = {
  entry: {
    entry_id: string
    entry_name: string
    current_rank: number | null
    point_adjustment: number
    adjustment_reason: string | null
  }
  user: {
    full_name: string
    username: string
  }
  summary: {
    match_points: number
    bonus_points: number
    point_adjustment: number
    total_points: number
  }
  match_results: MatchResultRow[]
  bonus_entries: BonusEntryRow[]
  pool_settings: {
    group_exact_score: number
    group_correct_difference: number
    group_correct_result: number
    knockout_exact_score: number
    knockout_correct_difference: number
    knockout_correct_result: number
    round_32_multiplier: number
    round_16_multiplier: number
    quarter_final_multiplier: number
    semi_final_multiplier: number
    third_place_multiplier: number
    final_multiplier: number
    pso_enabled: boolean
    pso_exact_score: number | null
    pso_correct_difference: number | null
    pso_correct_result: number | null
    bonus_champion_correct: number
    bonus_second_place_correct: number
    bonus_third_place_correct: number
  }
  prediction_mode: string
  // Final podium (tournament_awards) + this entry's predicted podium. Null until
  // the tournament is finalized / for bracket_picker. Powers the pick-vs-actual
  // "Tournament Podium" section so a member who missed sees why (0 pts).
  actual_podium: PodiumApi | null
  predicted_podium: PodiumApi | null
}

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

  // 4. Fetch pool info
  const { data: pool } = await supabase
    .from('pools')
    .select('pool_id, tournament_id, prediction_mode')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  // 5. Verify entry belongs to this pool (entry -> member -> pool)
  const { data: entry } = await supabase
    .from('pool_entries')
    .select('entry_id, member_id, entry_name, entry_number, has_submitted_predictions, total_points, point_adjustment, adjustment_reason, current_rank, previous_rank')
    .eq('entry_id', entry_id)
    .single()

  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  // Verify the entry's member belongs to this pool
  const { data: entryMember } = await supabase
    .from('pool_members')
    .select('member_id, user_id, users(user_id, username, full_name)')
    .eq('member_id', entry.member_id)
    .eq('pool_id', pool_id)
    .single()

  if (!entryMember) {
    return NextResponse.json({ error: 'Entry does not belong to this pool' }, { status: 404 })
  }

  // 6. Entry owner's user profile
  const entryOwner = (entryMember as any).users

  // Use admin client for data queries to bypass RLS
  // (pool membership was already verified above, so this is safe)
  const adminClient = createAdminClient()
  const source = await getScoringSource(adminClient, pool_id, pool.prediction_mode)

  // 7. Fetch stored scores (via the read source), matches, settings, bonuses in parallel
  const [
    matchScoresRaw,
    { data: matches },
    { data: settingsRow },
    bonusScores,
    { data: teams },
    entryScoring,
  ] = await Promise.all([
    readMatchScores(adminClient, [entry_id], source),
    adminClient
      .from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(country_name, flag_url), away_team:teams!matches_away_team_id_fkey(country_name, flag_url)')
      .eq('tournament_id', pool.tournament_id),
    adminClient
      .from('pool_settings')
      .select('*')
      .eq('pool_id', pool_id)
      .single(),
    readBonusScores(adminClient, [entry_id], source),
    adminClient
      .from('teams')
      .select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url')
      .eq('tournament_id', pool.tournament_id),
    readEntryScoring(adminClient, [entry_id], source),
  ])
  // The breakdown renders match rows directly, so preserve the match_number order.
  const matchScoresV2 = matchScoresRaw.slice().sort((a, b) => a.match_number - b.match_number)
  const entryScore = entryScoring.get(entry_id)

  const settings: PoolSettings = { ...DEFAULT_POOL_SETTINGS, ...(settingsRow || {}) }

  // Build lookups for display names
  const matchDisplayMap = new Map<string, any>()
  for (const m of (matches || [])) {
    const normalized = {
      ...m,
      home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
      away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
    }
    matchDisplayMap.set(m.match_id, normalized)
  }

  const teamNameMap = new Map<string, string>()
  for (const t of (teams || [])) {
    teamNameMap.set(t.team_id, t.country_name)
  }

  // 8. Build match results from stored v2 scores
  const matchResults: MatchResultRow[] = []
  let matchPoints = 0

  for (const score of (matchScoresV2 || [])) {
    const matchDisplay = matchDisplayMap.get(score.match_id)
    matchPoints += score.total_points

    matchResults.push({
      match_number: score.match_number,
      stage: score.stage,
      home_team: matchDisplay?.home_team?.country_name ?? 'TBD',
      away_team: matchDisplay?.away_team?.country_name ?? 'TBD',
      home_flag_url: matchDisplay?.home_team?.flag_url ?? null,
      away_flag_url: matchDisplay?.away_team?.flag_url ?? null,
      actual_home: score.actual_home_score,
      actual_away: score.actual_away_score,
      predicted_home: score.predicted_home_score,
      predicted_away: score.predicted_away_score,
      actual_home_pso: score.actual_home_pso ?? null,
      actual_away_pso: score.actual_away_pso ?? null,
      predicted_home_pso: score.predicted_home_pso ?? null,
      predicted_away_pso: score.predicted_away_pso ?? null,
      predicted_home_team: score.stage !== 'group' && score.predicted_home_team_id ? (teamNameMap.get(score.predicted_home_team_id) ?? null) : null,
      predicted_away_team: score.stage !== 'group' && score.predicted_away_team_id ? (teamNameMap.get(score.predicted_away_team_id) ?? null) : null,
      teams_match: score.teams_match,
      type: score.score_type,
      base_points: score.base_points,
      multiplier: score.multiplier,
      pso_points: score.pso_points,
      total_points: score.total_points,
    })
  }

  // 9. Bonus entries
  const bonusEntries: BonusEntryRow[] = (bonusScores || []).map((b: any) => ({
    bonus_category: b.bonus_category,
    bonus_type: b.bonus_type,
    description: b.description,
    points_earned: b.points_earned,
  }))

  const bonusPoints = bonusEntries.reduce((sum, b) => sum + b.points_earned, 0)
  const adjustment = entryScore?.point_adjustment ?? 0

  // 9b. Tournament podium: the entry's PREDICTED podium (via the shared resolver the
  // scoring engine uses) vs the ACTUAL result (tournament_awards). full/progressive
  // only — bracket_picker surfaces its champion via the bp_champion bonus row.
  let predictedPodium: PodiumApi | null = null
  let actualPodium: PodiumApi | null = null
  if (pool.prediction_mode !== 'bracket_picker') {
    const matchIds = (matches || []).map((m: any) => m.match_id)
    const [{ data: preds }, { data: conduct }, { data: awardsRow }] = await Promise.all([
      adminClient
        .from('predictions')
        .select('match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
        .eq('entry_id', entry_id),
      matchIds.length
        ? adminClient
            .from('match_conduct')
            .select('match_id, team_id, yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards')
            .in('match_id', matchIds)
        : Promise.resolve({ data: [] as any[] }),
      adminClient
        .from('tournament_awards')
        .select('champion_team_id, runner_up_team_id, third_place_team_id')
        .eq('tournament_id', pool.tournament_id)
        .maybeSingle(),
    ])

    const bracketMatches = (matches || []).map((m: any) => ({
      ...m,
      home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
      away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
    }))
    const predictionMap = new Map<string, any>()
    for (const p of (preds as any[]) || []) {
      predictionMap.set(p.match_id, {
        home: p.predicted_home_score,
        away: p.predicted_away_score,
        homePso: p.predicted_home_pso ?? null,
        awayPso: p.predicted_away_pso ?? null,
        winnerTeamId: p.predicted_winner_team_id ?? null,
      })
    }
    if (predictionMap.size > 0) {
      const podium = computeEntryPredictedPodium({
        matches: bracketMatches as any,
        predictionMap,
        teams: (teams || []) as any,
        conductData: (conduct as any) || [],
        predictionMode: pool.prediction_mode as 'full_tournament' | 'progressive',
      })
      const norm = (g: any): PodiumTeamApi | null =>
        g ? { team_id: g.team_id, country_name: g.country_name, flag_url: g.flag_url ?? null } : null
      predictedPodium = { champion: norm(podium.champion), runnerUp: norm(podium.runnerUp), thirdPlace: norm(podium.thirdPlace) }
    }
    if (awardsRow?.champion_team_id) {
      const teamMap = new Map((teams || []).map((t: any) => [t.team_id, t]))
      const toTeam = (id: string | null | undefined): PodiumTeamApi | null => {
        if (!id) return null
        const t: any = teamMap.get(id)
        return t ? { team_id: t.team_id, country_name: t.country_name, flag_url: t.flag_url ?? null } : null
      }
      actualPodium = {
        champion: toTeam(awardsRow.champion_team_id),
        runnerUp: toTeam(awardsRow.runner_up_team_id),
        thirdPlace: toTeam(awardsRow.third_place_team_id),
      }
    }
  }

  // 10. Build response
  const response: BreakdownResponse = {
    entry: {
      entry_id: entry.entry_id,
      entry_name: entry.entry_name,
      current_rank: entryScore?.current_rank ?? null,
      point_adjustment: adjustment,
      adjustment_reason: entry.adjustment_reason ?? null,
    },
    user: {
      full_name: entryOwner?.full_name ?? 'Unknown',
      username: entryOwner?.username ?? '',
    },
    summary: {
      match_points: matchPoints,
      bonus_points: bonusPoints,
      point_adjustment: adjustment,
      total_points: matchPoints + bonusPoints + adjustment,
    },
    match_results: matchResults,
    bonus_entries: bonusEntries,
    pool_settings: {
      group_exact_score: settings.group_exact_score,
      group_correct_difference: settings.group_correct_difference,
      group_correct_result: settings.group_correct_result,
      knockout_exact_score: settings.knockout_exact_score,
      knockout_correct_difference: settings.knockout_correct_difference,
      knockout_correct_result: settings.knockout_correct_result,
      round_32_multiplier: settings.round_32_multiplier,
      round_16_multiplier: settings.round_16_multiplier,
      quarter_final_multiplier: settings.quarter_final_multiplier,
      semi_final_multiplier: settings.semi_final_multiplier,
      third_place_multiplier: settings.third_place_multiplier,
      final_multiplier: settings.final_multiplier,
      pso_enabled: settings.pso_enabled,
      pso_exact_score: settings.pso_enabled ? settings.pso_exact_score : null,
      pso_correct_difference: settings.pso_enabled ? settings.pso_correct_difference : null,
      pso_correct_result: settings.pso_enabled ? settings.pso_correct_result : null,
      bonus_champion_correct: settings.bonus_champion_correct ?? 0,
      bonus_second_place_correct: settings.bonus_second_place_correct ?? 0,
      bonus_third_place_correct: settings.bonus_third_place_correct ?? 0,
    },
    prediction_mode: pool.prediction_mode,
    actual_podium: actualPodium,
    predicted_podium: predictedPodium,
  }

  return NextResponse.json(response)
}

export const GET = withPerfLogging('/api/pools/[id]/entries/[id]/breakdown', handleGET)
