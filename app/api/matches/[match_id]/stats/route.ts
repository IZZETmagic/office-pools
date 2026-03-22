import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { withPerfLogging } from '@/lib/api-perf'

// =============================================================
// GET /api/matches/:matchId/stats
// Returns prediction statistics for a specific match, aggregated
// across ALL pools in the system.
// =============================================================

type ScoreEntry = {
  home: number
  away: number
  count: number
  pct: number
}

type MatchStatsResponse = {
  match_id: string
  match_number: number
  total_predictions: number
  home_win_pct: number
  draw_pct: number
  away_win_pct: number
  most_popular_score: ScoreEntry | null
  top_scores: ScoreEntry[]
  exact_correct_pct: number | null
  result_correct_pct: number | null
  home_team: string | null
  away_team: string | null
}

function getResult(home: number, away: number): 'home' | 'draw' | 'away' {
  if (home > away) return 'home'
  if (home < away) return 'away'
  return 'draw'
}

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ match_id: string }> }
) {
  const { match_id } = await params

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

  // 3. Fetch predictions and match data in parallel
  const [predictionsResult, matchResult] = await Promise.all([
    supabase
      .from('predictions')
      .select('predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, pool_entries!inner(has_submitted_predictions)')
      .eq('match_id', match_id)
      .eq('pool_entries.has_submitted_predictions', true),
    supabase
      .from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(country_name), away_team:teams!matches_away_team_id_fkey(country_name)')
      .eq('match_id', match_id)
      .single(),
  ])

  const predictions = predictionsResult.data
  const match = matchResult.data

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  // Normalize joined team data (may come as array from supabase)
  const homeTeamData = Array.isArray(match.home_team) ? match.home_team[0] : match.home_team
  const awayTeamData = Array.isArray(match.away_team) ? match.away_team[0] : match.away_team

  const homeTeamName: string | null = homeTeamData?.country_name ?? null
  const awayTeamName: string | null = awayTeamData?.country_name ?? null

  const allPredictions = predictions || []
  const total = allPredictions.length

  if (total === 0) {
    const response: MatchStatsResponse = {
      match_id,
      match_number: match.match_number,
      total_predictions: 0,
      home_win_pct: 0,
      draw_pct: 0,
      away_win_pct: 0,
      most_popular_score: null,
      top_scores: [],
      exact_correct_pct: null,
      result_correct_pct: null,
      home_team: homeTeamName,
      away_team: awayTeamName,
    }
    return NextResponse.json(response)
  }

  // 4. Compute statistics
  let homeWins = 0
  let draws = 0
  let awayWins = 0
  const scoreCounts = new Map<string, { home: number; away: number; count: number }>()

  for (const p of allPredictions) {
    const h = p.predicted_home_score as number
    const a = p.predicted_away_score as number

    const result = getResult(h, a)
    if (result === 'home') homeWins++
    else if (result === 'draw') draws++
    else awayWins++

    const key = `${h}-${a}`
    const existing = scoreCounts.get(key)
    if (existing) {
      existing.count++
    } else {
      scoreCounts.set(key, { home: h, away: a, count: 1 })
    }
  }

  const homeWinPct = homeWins / total
  const drawPct = draws / total
  const awayWinPct = awayWins / total

  // Sort scores by count descending
  const sortedScores = Array.from(scoreCounts.values()).sort((a, b) => b.count - a.count)

  const topScores: ScoreEntry[] = sortedScores.slice(0, 5).map(s => ({
    home: s.home,
    away: s.away,
    count: s.count,
    pct: s.count / total,
  }))

  const mostPopular = sortedScores.length > 0
    ? { home: sortedScores[0].home, away: sortedScores[0].away, count: sortedScores[0].count, pct: sortedScores[0].count / total }
    : null

  // 5. If match is completed, calculate accuracy stats
  let exactCorrectPct: number | null = null
  let resultCorrectPct: number | null = null

  const isCompleted = match.is_completed || match.status === 'completed'
  if (isCompleted && match.home_score_ft !== null && match.away_score_ft !== null) {
    const actualHome = match.home_score_ft as number
    const actualAway = match.away_score_ft as number
    const actualResult = getResult(actualHome, actualAway)

    let exactCorrect = 0
    let resultCorrect = 0

    for (const p of allPredictions) {
      const h = p.predicted_home_score as number
      const a = p.predicted_away_score as number

      if (h === actualHome && a === actualAway) {
        exactCorrect++
      }

      if (getResult(h, a) === actualResult) {
        resultCorrect++
      }
    }

    exactCorrectPct = exactCorrect / total
    resultCorrectPct = resultCorrect / total
  }

  // 6. Build response
  const response: MatchStatsResponse = {
    match_id,
    match_number: match.match_number,
    total_predictions: total,
    home_win_pct: homeWinPct,
    draw_pct: drawPct,
    away_win_pct: awayWinPct,
    most_popular_score: mostPopular,
    top_scores: topScores,
    exact_correct_pct: exactCorrectPct,
    result_correct_pct: resultCorrectPct,
    home_team: homeTeamName,
    away_team: awayTeamName,
  }

  return NextResponse.json(response)
}

export const GET = withPerfLogging('/api/matches/[match_id]/stats', handleGET)
