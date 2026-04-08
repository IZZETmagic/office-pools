import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withPerfLogging } from '@/lib/api-perf'

// =============================================================
// GET /api/matches/:matchId/scores?entry_ids=id1,id2,id3
// Returns match-specific score data for multiple entries in one call.
// Lightweight alternative to calling the full breakdown endpoint per entry.
// =============================================================

type MatchScoreEntryResponse = {
  entry_id: string
  predicted_home_team: string | null
  predicted_away_team: string | null
  teams_match: boolean
  result_type: string
  total_points: number
}

type MatchScoresResponse = {
  match_id: string
  match_number: number
  entries: MatchScoreEntryResponse[]
}

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ match_id: string }> }
) {
  const { match_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase } = auth.data

  // Parse entry_ids from query params
  const entryIdsParam = request.nextUrl.searchParams.get('entry_ids')
  if (!entryIdsParam) {
    return NextResponse.json({ error: 'entry_ids query parameter is required' }, { status: 400 })
  }

  const entryIds = entryIdsParam.split(',').filter(Boolean)
  if (entryIds.length === 0) {
    return NextResponse.json({ error: 'entry_ids must not be empty' }, { status: 400 })
  }

  // Look up match to get match_number and tournament_id
  const { data: match } = await supabase
    .from('matches')
    .select('match_id, match_number, tournament_id')
    .eq('match_id', match_id)
    .single()

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  // Use admin client for data queries (pool membership was verified by entry ownership)
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch match_scores and teams in parallel
  const [{ data: scores }, { data: teams }] = await Promise.all([
    adminClient
      .from('match_scores')
      .select('entry_id, match_number, stage, score_type, teams_match, predicted_home_team_id, predicted_away_team_id, total_points')
      .eq('match_number', match.match_number)
      .in('entry_id', entryIds),
    adminClient
      .from('teams')
      .select('team_id, country_name')
      .eq('tournament_id', match.tournament_id),
  ])

  // Build team name lookup
  const teamNameMap = new Map<string, string>()
  for (const t of (teams || [])) {
    teamNameMap.set(t.team_id, t.country_name)
  }

  // Build response entries
  const entries: MatchScoreEntryResponse[] = (scores || []).map((score: any) => ({
    entry_id: score.entry_id,
    predicted_home_team: score.stage !== 'group' ? (teamNameMap.get(score.predicted_home_team_id) ?? null) : null,
    predicted_away_team: score.stage !== 'group' ? (teamNameMap.get(score.predicted_away_team_id) ?? null) : null,
    teams_match: score.teams_match,
    result_type: score.score_type,
    total_points: score.total_points,
  }))

  const response: MatchScoresResponse = {
    match_id,
    match_number: match.match_number,
    entries,
  }

  return NextResponse.json(response)
}

export const GET = withPerfLogging('/api/matches/[match_id]/scores', handleGET)
