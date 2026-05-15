import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'

// =============================================================
// GET /api/matches/:matchId/bracket-stats
// Aggregate bracket-picker predictions for the two teams in this
// match. Group-stage matches only — returns null for knockouts
// (bracket-picker knockouts are a different shape and can be added
// later as a separate field on this response if needed).
//
// For each of the match's two teams, returns the distribution of
// predicted group-stage finishing positions (1st–4th) across all
// bracket-picker entries that submitted rankings for the group.
// =============================================================

type BracketGroupTeamStats = {
  team_id: string
  team_name: string | null
  flag_url: string | null
  total_predictions: number
  positions: { '1': number; '2': number; '3': number; '4': number }
  position_pcts: { '1': number; '2': number; '3': number; '4': number }
}

type BracketStatsResponse = {
  match_id: string
  match_number: number
  group_letter: string | null
  group_predictions: {
    home_team: BracketGroupTeamStats | null
    away_team: BracketGroupTeamStats | null
  } | null
}

async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ match_id: string }> },
) {
  const { match_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase } = auth.data

  // 1. Look up match + joined teams (caller-scoped client; RLS on matches is
  //    read-open for authenticated users).
  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .select(
      'match_id, match_number, group_letter, home_team_id, away_team_id,' +
        ' home_team:teams!matches_home_team_id_fkey(country_name, flag_url),' +
        ' away_team:teams!matches_away_team_id_fkey(country_name, flag_url)',
    )
    .eq('match_id', match_id)
    .single()
  if (matchErr || !match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  const groupLetter = match.group_letter as string | null
  const homeTeamId = match.home_team_id as string | null
  const awayTeamId = match.away_team_id as string | null

  const baseResponse: BracketStatsResponse = {
    match_id,
    match_number: match.match_number as number,
    group_letter: groupLetter,
    group_predictions: null,
  }

  // 2. Only group matches have bracket-picker position predictions to show.
  if (!groupLetter || !homeTeamId || !awayTeamId) {
    return NextResponse.json(baseResponse)
  }

  const homeTeamData = Array.isArray(match.home_team) ? match.home_team[0] : match.home_team
  const awayTeamData = Array.isArray(match.away_team) ? match.away_team[0] : match.away_team

  // 3. Admin client to aggregate across all bracket_picker_group_rankings rows
  //    — caller RLS would otherwise restrict to their own rows.
  const adminClient = createAdminClient()
  const { data: rankings, error: rankErr } = await adminClient
    .from('bracket_picker_group_rankings')
    .select('team_id, predicted_position')
    .eq('group_letter', groupLetter)
    .in('team_id', [homeTeamId, awayTeamId])

  if (rankErr) {
    console.error('[bracket-stats] failed to fetch rankings', rankErr)
    return NextResponse.json(baseResponse)
  }

  function buildTeamStats(
    teamId: string,
    teamName: string | null,
    flagUrl: string | null,
  ): BracketGroupTeamStats {
    const counts = { '1': 0, '2': 0, '3': 0, '4': 0 } as BracketGroupTeamStats['positions']
    let total = 0
    for (const r of rankings ?? []) {
      if (r.team_id !== teamId) continue
      const pos = String(r.predicted_position) as '1' | '2' | '3' | '4'
      if (pos === '1' || pos === '2' || pos === '3' || pos === '4') {
        counts[pos]++
        total++
      }
    }
    const pcts = total > 0
      ? {
          '1': counts['1'] / total,
          '2': counts['2'] / total,
          '3': counts['3'] / total,
          '4': counts['4'] / total,
        }
      : { '1': 0, '2': 0, '3': 0, '4': 0 }
    return {
      team_id: teamId,
      team_name: teamName,
      flag_url: flagUrl,
      total_predictions: total,
      positions: counts,
      position_pcts: pcts,
    }
  }

  const response: BracketStatsResponse = {
    ...baseResponse,
    group_predictions: {
      home_team: buildTeamStats(
        homeTeamId,
        homeTeamData?.country_name ?? null,
        homeTeamData?.flag_url ?? null,
      ),
      away_team: buildTeamStats(
        awayTeamId,
        awayTeamData?.country_name ?? null,
        awayTeamData?.flag_url ?? null,
      ),
    },
  }

  return NextResponse.json(response)
}

export const GET = withPerfLogging('/api/matches/[match_id]/bracket-stats', handleGET)
