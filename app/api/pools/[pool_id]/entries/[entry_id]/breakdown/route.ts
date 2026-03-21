import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { calculatePoints, checkKnockoutTeamsMatch, DEFAULT_POOL_SETTINGS } from '@/app/pools/[pool_id]/results/points'
import type { PoolSettings, PointsResult } from '@/app/pools/[pool_id]/results/points'
import { resolveFullBracket } from '@/lib/bracketResolver'
import type { PredictionMap, Team, MatchConductData } from '@/lib/tournament'
import type { MatchWithResult } from '@/lib/bonusCalculation'
import { withPerfLogging } from '@/lib/api-perf'

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
  }
  prediction_mode: string
}

/**
 * Get the stage multiplier for knockout matches.
 * Mirrors the private function in points.ts.
 */
function getStageMultiplier(stage: string, settings: PoolSettings): number {
  switch (stage) {
    case 'round_32':
      return settings.round_32_multiplier || 1
    case 'round_16':
      return settings.round_16_multiplier || 1
    case 'quarter_final':
      return settings.quarter_final_multiplier || 1
    case 'semi_final':
      return settings.semi_final_multiplier || 1
    case 'third_place':
      return settings.third_place_multiplier || 1
    case 'final':
      return settings.final_multiplier || 1
    default:
      return 1
  }
}

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string; entry_id: string }> }
) {
  const { pool_id, entry_id } = await params

  // 1. Authenticate — supports both cookie auth (web) and Bearer token auth (iOS)
  let supabase: any
  let user: any = null

  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '')
    supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data } = await supabase.auth.getUser(token)
    user = data?.user
  } else {
    supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    user = data?.user
  }

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Get user from users table
  const { data: userData } = await supabase
    .from('users')
    .select('user_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

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

  // 7. Fetch all needed data in parallel
  const [
    { data: matches },
    { data: teams },
    { data: conductData },
    { data: settingsRow },
    { data: predictions },
    { data: bonusScores },
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
      .from('predictions')
      .select('prediction_id, entry_id, match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
      .eq('entry_id', entry_id),
    supabase
      .from('bonus_scores')
      .select('bonus_category, bonus_type, description, points_earned')
      .eq('entry_id', entry_id),
  ])

  if (!matches || !teams) {
    return NextResponse.json({ error: 'Failed to fetch pool data' }, { status: 500 })
  }

  // Normalize match data
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

  // Build prediction lookup
  const predMap = new Map<string, any>()
  const predictionMap: PredictionMap = new Map()
  for (const p of (predictions || [])) {
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

  // 8. Compute match point results
  const matchResults: MatchResultRow[] = []
  let matchPoints = 0

  for (const m of normalizedMatches) {
    if (!(m.is_completed || m.status === 'live') || m.home_score_ft === null || m.away_score_ft === null) {
      continue
    }

    const pred = predMap.get(m.match_id)
    if (!pred) continue

    // Knockout team matching
    const resolved = bracket.knockoutTeamMap.get(m.match_number)
    const teamsMatch = checkKnockoutTeamsMatch(
      m.stage,
      m.home_team_id,
      m.away_team_id,
      resolved?.home?.team_id ?? null,
      resolved?.away?.team_id ?? null,
    )

    const hasPso = m.home_score_pso !== null && m.away_score_pso !== null
    const result: PointsResult = calculatePoints(
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

    // Compute PSO points: difference between total and (base * multiplier)
    const multiplier = getStageMultiplier(m.stage, settings)
    const ftPoints = Math.floor(result.basePoints * multiplier)
    const psoPoints = result.pso ? result.pso.psoPoints : 0

    matchResults.push({
      match_number: m.match_number,
      stage: m.stage,
      home_team: m.home_team?.country_name ?? 'TBD',
      away_team: m.away_team?.country_name ?? 'TBD',
      home_flag_url: m.home_team?.flag_url ?? null,
      away_flag_url: m.away_team?.flag_url ?? null,
      actual_home: m.home_score_ft,
      actual_away: m.away_score_ft,
      predicted_home: pred.predicted_home_score,
      predicted_away: pred.predicted_away_score,
      actual_home_pso: m.home_score_pso ?? null,
      actual_away_pso: m.away_score_pso ?? null,
      predicted_home_pso: pred.predicted_home_pso ?? null,
      predicted_away_pso: pred.predicted_away_pso ?? null,
      predicted_home_team: m.stage !== 'group' ? (resolved?.home?.country_name ?? null) : null,
      predicted_away_team: m.stage !== 'group' ? (resolved?.away?.country_name ?? null) : null,
      teams_match: teamsMatch,
      type: result.type,
      base_points: result.basePoints,
      multiplier: result.multiplier,
      pso_points: psoPoints,
      total_points: result.points,
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
  const adjustment = entry.point_adjustment ?? 0

  // 10. Build response
  const response: BreakdownResponse = {
    entry: {
      entry_id: entry.entry_id,
      entry_name: entry.entry_name,
      current_rank: entry.current_rank,
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
    },
    prediction_mode: pool.prediction_mode,
  }

  return NextResponse.json(response)
}

export const GET = withPerfLogging('/api/pools/[id]/entries/[id]/breakdown', handleGET)
