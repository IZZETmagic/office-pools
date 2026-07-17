import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'
import { getScoringSource, readMatchScores } from '@/lib/scoring/readSource'

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

  // Resolve the pool (for the shadow read-source switch) from the first entry —
  // a popover's entries all belong to one pool.
  const { data: ctx } = await adminClient
    .from('pool_entries')
    .select('pool_members!inner(pool_id, pools!inner(prediction_mode))')
    .eq('entry_id', entryIds[0])
    .maybeSingle()
  const ctxPm = (ctx as { pool_members?: { pool_id?: string; pools?: { prediction_mode?: string } } } | null)?.pool_members
  const poolId: string | undefined = ctxPm?.pool_id
  const source = poolId
    ? await getScoringSource(adminClient, poolId, ctxPm?.pools?.prediction_mode ?? 'full_tournament')
    : 'prod'

  // Fetch match_scores (via the read source), teams, and group completion status in parallel
  const [scores, { data: teams }, { data: groupMatches }] = await Promise.all([
    readMatchScores(adminClient, entryIds, source, { matchId: match_id }),
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
  const entries: MatchScoreEntryResponse[] = scores.map((score: any) => {
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
