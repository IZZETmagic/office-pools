import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { resolveFullBracket, buildActualResultsMap } from '@/lib/bracketResolver'
import { resolveAllR32Matches, GROUP_LETTERS, calculateGroupStandings } from '@/lib/tournament'
import type { Team, MatchConductData } from '@/lib/tournament'
import {
  parsePlaceholder,
  determineWinnerId,
  determineLoserId,
  type AdvancementResult,
  type ClearResult,
} from '@/lib/advancement'

// =============================================================
// POST /api/admin/advance-teams
// Advances teams to knockout matches based on completed results.
// Super admin only.
// =============================================================
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // 1. Authenticate — super admin only
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('user_id, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData?.is_super_admin) {
    return NextResponse.json({ error: 'Super admin required' }, { status: 403 })
  }

  // 2. Parse request
  const { trigger, match_id } = await request.json()

  // 3. Fetch all matches, teams, conduct data
  const [{ data: matches }, { data: teams }, { data: conductData }] = await Promise.all([
    supabase.from('matches').select('*').order('match_number', { ascending: true }),
    supabase.from('teams').select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url'),
    supabase.from('match_conduct').select('*'),
  ])

  if (!matches || !teams) {
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }

  const advanced: AdvancementResult[] = []
  const cleared: ClearResult[] = []

  // 4. Handle based on trigger type
  if (trigger === 'match_reset' && match_id) {
    const resetMatch = matches.find((m: any) => m.match_id === match_id)
    if (resetMatch) {
      const clearResults = await clearDownstreamTeams(supabase, resetMatch, matches)
      cleared.push(...clearResults)
    }
  }

  if (trigger === 'group_complete' || trigger === 'manual') {
    const r32Results = await advanceGroupToR32(supabase, matches, teams as Team[], (conductData || []) as MatchConductData[])
    advanced.push(...r32Results)
  }

  if (trigger === 'knockout_result' && match_id) {
    const completedMatch = matches.find((m: any) => m.match_id === match_id)
    if (completedMatch && completedMatch.stage !== 'group') {
      const koResults = await advanceKnockoutWinner(supabase, completedMatch, matches, teams)
      advanced.push(...koResults)
    }
  }

  if (trigger === 'manual') {
    // Also process all completed knockout matches that may not have advanced yet
    const knockoutStages = ['round_32', 'round_16', 'quarter_final', 'semi_final', 'third_place', 'final']
    const completedKnockout = matches.filter((m: any) => knockoutStages.includes(m.stage) && m.is_completed)
    for (const km of completedKnockout) {
      const koResults = await advanceKnockoutWinner(supabase, km, matches, teams)
      advanced.push(...koResults)
    }
  }

  return NextResponse.json({
    success: true,
    advanced,
    cleared,
    message: `Advanced ${advanced.length} team(s), cleared ${cleared.length} team(s).`,
  })
}

// =============================================================
// Group → R32 advancement
// =============================================================
async function advanceGroupToR32(
  supabase: any,
  matches: any[],
  teams: Team[],
  conductData: MatchConductData[]
): Promise<AdvancementResult[]> {
  // Check all 72 group matches are completed
  const groupMatches = matches.filter((m: any) => m.stage === 'group')
  if (groupMatches.length !== 72 || !groupMatches.every((m: any) => m.is_completed)) {
    return []
  }

  // Check if R32 is already fully populated
  const r32Matches = matches.filter((m: any) => m.stage === 'round_32')
  const allPopulated = r32Matches.every((m: any) => m.home_team_id && m.away_team_id)
  if (allPopulated) return []

  // Build actual results map and resolve bracket
  const actualResultsMap = buildActualResultsMap(matches)

  // Calculate group standings for all 12 groups
  const allGroupStandings = new Map<string, any[]>()
  for (const letter of GROUP_LETTERS) {
    const gMatches = matches.filter((m: any) => m.stage === 'group' && m.group_letter === letter)
    allGroupStandings.set(
      letter,
      calculateGroupStandings(letter, gMatches, actualResultsMap, teams, conductData)
    )
  }

  // Resolve R32 assignments (uses Annex C for third-place teams)
  const r32Resolutions = resolveAllR32Matches(allGroupStandings)

  const results: AdvancementResult[] = []

  for (const [matchNum, resolved] of r32Resolutions) {
    const r32Match = r32Matches.find((m: any) => m.match_number === matchNum)
    if (!r32Match) continue

    const updates: Record<string, any> = {}

    if (resolved.home?.team_id && !r32Match.home_team_id) {
      updates.home_team_id = resolved.home.team_id
      results.push({
        match_number: matchNum,
        side: 'home',
        team_id: resolved.home.team_id,
        country_name: resolved.home.country_name,
      })
    }
    if (resolved.away?.team_id && !r32Match.away_team_id) {
      updates.away_team_id = resolved.away.team_id
      results.push({
        match_number: matchNum,
        side: 'away',
        team_id: resolved.away.team_id,
        country_name: resolved.away.country_name,
      })
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('matches').update(updates).eq('match_id', r32Match.match_id)
    }
  }

  return results
}

// =============================================================
// Knockout → next round advancement
// =============================================================
async function advanceKnockoutWinner(
  supabase: any,
  completedMatch: any,
  allMatches: any[],
  teams: any[]
): Promise<AdvancementResult[]> {
  const winnerId = determineWinnerId(completedMatch)
  const loserId = determineLoserId(completedMatch)
  if (!winnerId) return []

  const matchNum = completedMatch.match_number
  const results: AdvancementResult[] = []

  for (const nextMatch of allMatches) {
    // Check home placeholder
    if (nextMatch.home_team_placeholder) {
      const parsed = parsePlaceholder(nextMatch.home_team_placeholder, matchNum)
      if (parsed) {
        const teamId = parsed.type === 'winner' ? winnerId : loserId
        if (teamId) {
          // Check if slot needs updating
          if (!nextMatch.home_team_id || nextMatch.home_team_id !== teamId) {
            // If there was a different team and the downstream match was completed,
            // cascade-clear further downstream first
            if (nextMatch.home_team_id && nextMatch.home_team_id !== teamId && nextMatch.is_completed) {
              await clearDownstreamTeams(supabase, nextMatch, allMatches)
            }
            await supabase.from('matches').update({ home_team_id: teamId }).eq('match_id', nextMatch.match_id)
            // Update local copy for cascading
            nextMatch.home_team_id = teamId
            const team = teams.find((t: any) => t.team_id === teamId)
            results.push({
              match_number: nextMatch.match_number,
              side: 'home',
              team_id: teamId,
              country_name: team?.country_name || 'Unknown',
            })
          }
        }
      }
    }

    // Check away placeholder
    if (nextMatch.away_team_placeholder) {
      const parsed = parsePlaceholder(nextMatch.away_team_placeholder, matchNum)
      if (parsed) {
        const teamId = parsed.type === 'winner' ? winnerId : loserId
        if (teamId) {
          if (!nextMatch.away_team_id || nextMatch.away_team_id !== teamId) {
            if (nextMatch.away_team_id && nextMatch.away_team_id !== teamId && nextMatch.is_completed) {
              await clearDownstreamTeams(supabase, nextMatch, allMatches)
            }
            await supabase.from('matches').update({ away_team_id: teamId }).eq('match_id', nextMatch.match_id)
            nextMatch.away_team_id = teamId
            const team = teams.find((t: any) => t.team_id === teamId)
            results.push({
              match_number: nextMatch.match_number,
              side: 'away',
              team_id: teamId,
              country_name: team?.country_name || 'Unknown',
            })
          }
        }
      }
    }
  }

  return results
}

// =============================================================
// Clear downstream teams (for match reset)
// =============================================================
async function clearDownstreamTeams(
  supabase: any,
  resetMatch: any,
  allMatches: any[]
): Promise<ClearResult[]> {
  const cleared: ClearResult[] = []

  // Special case: if resetting a group match, clear ALL R32 team assignments
  if (resetMatch.stage === 'group') {
    const r32Matches = allMatches.filter((m: any) => m.stage === 'round_32')
    for (const r32 of r32Matches) {
      const updates: Record<string, any> = {}
      if (r32.home_team_id) {
        cleared.push({ match_number: r32.match_number, side: 'home', previous_team_id: r32.home_team_id })
        updates.home_team_id = null
        r32.home_team_id = null
      }
      if (r32.away_team_id) {
        cleared.push({ match_number: r32.match_number, side: 'away', previous_team_id: r32.away_team_id })
        updates.away_team_id = null
        r32.away_team_id = null
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('matches').update(updates).eq('match_id', r32.match_id)
      }
    }

    // Also cascade-clear all knockout matches downstream of R32
    const knockoutStages = ['round_16', 'quarter_final', 'semi_final', 'third_place', 'final']
    const koMatches = allMatches.filter((m: any) => knockoutStages.includes(m.stage))
    for (const ko of koMatches) {
      const updates: Record<string, any> = {}
      if (ko.home_team_id) {
        cleared.push({ match_number: ko.match_number, side: 'home', previous_team_id: ko.home_team_id })
        updates.home_team_id = null
        ko.home_team_id = null
      }
      if (ko.away_team_id) {
        cleared.push({ match_number: ko.match_number, side: 'away', previous_team_id: ko.away_team_id })
        updates.away_team_id = null
        ko.away_team_id = null
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('matches').update(updates).eq('match_id', ko.match_id)
      }
    }

    return cleared
  }

  // For knockout matches: clear only downstream references
  const matchNum = resetMatch.match_number

  for (const nextMatch of allMatches) {
    const updates: Record<string, any> = {}

    if (nextMatch.home_team_placeholder) {
      const parsed = parsePlaceholder(nextMatch.home_team_placeholder, matchNum)
      if (parsed && nextMatch.home_team_id) {
        cleared.push({ match_number: nextMatch.match_number, side: 'home', previous_team_id: nextMatch.home_team_id })
        updates.home_team_id = null
        nextMatch.home_team_id = null
      }
    }

    if (nextMatch.away_team_placeholder) {
      const parsed = parsePlaceholder(nextMatch.away_team_placeholder, matchNum)
      if (parsed && nextMatch.away_team_id) {
        cleared.push({ match_number: nextMatch.match_number, side: 'away', previous_team_id: nextMatch.away_team_id })
        updates.away_team_id = null
        nextMatch.away_team_id = null
      }
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('matches').update(updates).eq('match_id', nextMatch.match_id)

      // Recursively clear further downstream if this match was also completed
      if (nextMatch.is_completed) {
        const furtherCleared = await clearDownstreamTeams(supabase, nextMatch, allMatches)
        cleared.push(...furtherCleared)
      }
    }
  }

  return cleared
}
