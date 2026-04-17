import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
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
  const adminClient = createAdminClient()

  // Fetch match_scores, teams, and group completion status in parallel
  const [{ data: scores }, { data: teams }, { data: groupMatches }] = await Promise.all([
    adminClient
      .from('match_scores')
      .select('entry_id, match_number, stage, score_type, teams_match, predicted_home_team_id, predicted_away_team_id, total_points')
      .eq('match_number', match.match_number)
      .in('entry_id', entryIds),
    adminClient
      .from('teams')
      .select('team_id, country_name')
      .eq('tournament_id', match.tournament_id),
    adminClient
      .from('matches')
      .select('is_completed')
      .eq('tournament_id', match.tournament_id)
      .eq('stage', 'group'),
  ])

  const allGroupsComplete = (groupMatches || []).length > 0 &&
    (groupMatches || []).every((m: any) => m.is_completed)

  // Build team name lookup
  const teamNameMap = new Map<string, string>()
  for (const t of (teams || [])) {
    teamNameMap.set(t.team_id, t.country_name)
  }

  // Build response entries — hide predicted teams for knockout matches until groups complete
  const entries: MatchScoreEntryResponse[] = (scores || []).map((score: any) => {
    const isKnockout = score.stage !== 'group'
    const showTeams = isKnockout && allGroupsComplete
    return {
      entry_id: score.entry_id,
      predicted_home_team: showTeams ? (teamNameMap.get(score.predicted_home_team_id) ?? null) : null,
      predicted_away_team: showTeams ? (teamNameMap.get(score.predicted_away_team_id) ?? null) : null,
      teams_match: score.teams_match,
      result_type: score.score_type,
      total_points: score.total_points,
    }
  })

  const response: MatchScoresResponse = {
    match_id,
    match_number: match.match_number,
    entries,
  }

  return NextResponse.json(response)
}

export const GET = withPerfLogging('/api/matches/[match_id]/scores', handleGET)
