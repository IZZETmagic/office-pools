import { lookupAnnexC, ANNEX_C_COLUMN_TO_MATCH, type AnnexCAssignment } from './annexC'
import {
  type Team,
  type Match,
  type GroupStanding,
  GROUP_LETTERS,
  R32_MATCHUPS,
  getKnockoutWinner,
  getKnockoutLoser,
  type PredictionMap,
} from './tournament'
import type { BPGroupRanking, BPThirdPlaceRanking, BPKnockoutPick } from '@/app/pools/[pool_id]/types'

// =============================================
// Convert bracket picker rankings to GroupStanding format
// =============================================

/** Create a minimal GroupStanding from a team and ranking position */
function teamToRankedStanding(team: Team, position: number): GroupStanding {
  return {
    team_id: team.team_id,
    country_name: team.country_name,
    country_code: team.country_code,
    flag_url: team.flag_url,
    group_letter: team.group_letter,
    fifa_ranking_points: team.fifa_ranking_points,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  }
}

/**
 * Build group standings map from bracket picker group rankings.
 * Returns teams ordered by user's predicted position (1st, 2nd, 3rd, 4th).
 */
export function buildGroupStandingsFromRankings(
  groupRankings: BPGroupRanking[],
  teams: Team[]
): Map<string, GroupStanding[]> {
  const teamMap = new Map(teams.map(t => [t.team_id, t]))
  const allGroupStandings = new Map<string, GroupStanding[]>()

  for (const letter of GROUP_LETTERS) {
    const groupRanks = groupRankings
      .filter(r => r.group_letter === letter)
      .sort((a, b) => a.predicted_position - b.predicted_position)

    const standings: GroupStanding[] = []
    for (const rank of groupRanks) {
      const team = teamMap.get(rank.team_id)
      if (team) {
        standings.push(teamToRankedStanding(team, rank.predicted_position))
      }
    }

    allGroupStandings.set(letter, standings)
  }

  return allGroupStandings
}

// =============================================
// Resolve R32 bracket from bracket picker data
// =============================================

function resolveNonThirdSlot(
  slot: { type: string; group?: string },
  allGroupStandings: Map<string, GroupStanding[]>
): GroupStanding | null {
  if (slot.type === 'group_winner') {
    const standings = allGroupStandings.get((slot as { group: string }).group)
    return standings?.[0] ?? null
  }
  if (slot.type === 'group_runner_up') {
    const standings = allGroupStandings.get((slot as { group: string }).group)
    return standings?.[1] ?? null
  }
  return null
}

/**
 * Resolve the complete R32 bracket from bracket picker data.
 * Uses user's group rankings for winners/runners-up and
 * user's third-place rankings + Annex C for third-place team assignment.
 */
export function resolveR32FromBracketPicker(params: {
  groupRankings: BPGroupRanking[]
  thirdPlaceRankings: BPThirdPlaceRanking[]
  teams: Team[]
}): Map<number, { home: GroupStanding | null; away: GroupStanding | null }> {
  const { groupRankings, thirdPlaceRankings, teams } = params
  const teamMap = new Map(teams.map(t => [t.team_id, t]))

  // 1. Build group standings from user rankings
  const allGroupStandings = buildGroupStandingsFromRankings(groupRankings, teams)

  // 2. Get the top 8 third-place teams from user's ranking
  const sortedThirds = [...thirdPlaceRankings].sort((a, b) => a.rank - b.rank)
  const qualifyingThirds = sortedThirds.slice(0, 8)
  const qualifyingGroups = qualifyingThirds.map(t => t.group_letter)

  // Build third-place team standings keyed by group letter
  const thirdByGroup = new Map<string, GroupStanding>()
  for (const ranking of qualifyingThirds) {
    const team = teamMap.get(ranking.team_id)
    if (team) {
      thirdByGroup.set(ranking.group_letter, teamToRankedStanding(team, 3))
    }
  }

  // 3. Resolve non-third-place slots (group winners & runners-up)
  const result = new Map<number, { home: GroupStanding | null; away: GroupStanding | null }>()
  const matchNumbers = Object.keys(R32_MATCHUPS).map(Number).sort((a, b) => a - b)

  for (const matchNum of matchNumbers) {
    const mapping = R32_MATCHUPS[matchNum]
    const home = resolveNonThirdSlot(mapping.home, allGroupStandings)
    const away = resolveNonThirdSlot(mapping.away, allGroupStandings)
    result.set(matchNum, { home, away })
  }

  // 4. Try Annex C deterministic assignment
  if (qualifyingGroups.length === 8) {
    const annexC = lookupAnnexC(qualifyingGroups)

    if (annexC) {
      for (const [column, thirdGroupLetter] of Object.entries(annexC.assignment) as [keyof AnnexCAssignment, string][]) {
        const matchNum = ANNEX_C_COLUMN_TO_MATCH[column]
        const team = thirdByGroup.get(thirdGroupLetter) ?? null
        const current = result.get(matchNum)!
        result.set(matchNum, { home: current.home, away: team })
      }
      return result
    }
  }

  // 5. Fallback: backtracking assignment (same as tournament.ts)
  const thirdSlots: { matchNum: number; side: 'home' | 'away'; eligible: string[] }[] = []
  for (const matchNum of matchNumbers) {
    const mapping = R32_MATCHUPS[matchNum]
    if (mapping.home.type === 'best_third') {
      thirdSlots.push({ matchNum, side: 'home', eligible: (mapping.home as { eligible_groups: string[] }).eligible_groups })
    }
    if (mapping.away.type === 'best_third') {
      thirdSlots.push({ matchNum, side: 'away', eligible: (mapping.away as { eligible_groups: string[] }).eligible_groups })
    }
  }

  const assignment = new Map<number, GroupStanding>()
  const usedGroups = new Set<string>()

  function backtrack(slotIdx: number): boolean {
    if (slotIdx === thirdSlots.length) return true
    const slot = thirdSlots[slotIdx]
    for (const [groupLetter, team] of thirdByGroup) {
      if (usedGroups.has(groupLetter)) continue
      if (!slot.eligible.includes(groupLetter)) continue
      usedGroups.add(groupLetter)
      assignment.set(slotIdx, team)
      if (backtrack(slotIdx + 1)) return true
      usedGroups.delete(groupLetter)
      assignment.delete(slotIdx)
    }
    return false
  }

  backtrack(0)

  for (let i = 0; i < thirdSlots.length; i++) {
    const slot = thirdSlots[i]
    const team = assignment.get(i) ?? null
    const current = result.get(slot.matchNum)!
    if (slot.side === 'home') {
      result.set(slot.matchNum, { home: team, away: current.away })
    } else {
      result.set(slot.matchNum, { home: current.home, away: team })
    }
  }

  return result
}

// =============================================
// Resolve full knockout bracket from picks
// =============================================

function extractMatchNumber(placeholder: string | null): number | null {
  if (!placeholder) return null
  const match = placeholder.match(/(?:Match\s*)?(\d+)/i)
  return match ? parseInt(match[1]) : null
}

/**
 * Resolve the complete knockout bracket from bracket picker data.
 * Uses R32 resolution + user's winner picks to cascade through all rounds.
 */
export function resolveFullBracketFromPicks(params: {
  groupRankings: BPGroupRanking[]
  thirdPlaceRankings: BPThirdPlaceRanking[]
  knockoutPicks: BPKnockoutPick[]
  teams: Team[]
  matches: Match[]
}): {
  allGroupStandings: Map<string, GroupStanding[]>
  knockoutTeamMap: Map<number, { home: GroupStanding | null; away: GroupStanding | null }>
  champion: GroupStanding | null
  runnerUp: GroupStanding | null
  thirdPlace: GroupStanding | null
} {
  const { groupRankings, thirdPlaceRankings, knockoutPicks, teams, matches } = params

  // 1. Build group standings
  const allGroupStandings = buildGroupStandingsFromRankings(groupRankings, teams)

  // 2. Resolve R32
  const r32Map = resolveR32FromBracketPicker({ groupRankings, thirdPlaceRankings, teams })
  const knockoutTeamMap = new Map(r32Map)

  // 3. Build picks lookup: match_id → winner_team_id
  const picksMap = new Map<string, string>()
  for (const pick of knockoutPicks) {
    picksMap.set(pick.match_id, pick.winner_team_id)
  }

  // Helper: find winner based on user's pick
  const getPickedWinner = (
    matchId: string,
    home: GroupStanding | null,
    away: GroupStanding | null
  ): GroupStanding | null => {
    const winnerId = picksMap.get(matchId)
    if (!winnerId) return null
    if (home?.team_id === winnerId) return home
    if (away?.team_id === winnerId) return away
    return null
  }

  const getPickedLoser = (
    matchId: string,
    home: GroupStanding | null,
    away: GroupStanding | null
  ): GroupStanding | null => {
    const winnerId = picksMap.get(matchId)
    if (!winnerId) return null
    if (home?.team_id === winnerId) return away
    if (away?.team_id === winnerId) return home
    return null
  }

  const getMatch = (num: number) => matches.find(m => m.match_number === num)

  // 4. Cascade through knockout stages
  const resolveStage = (stage: string, isLoser = false) => {
    const stageMatches = matches
      .filter(m => m.stage === stage)
      .sort((a, b) => a.match_number - b.match_number)

    for (const m of stageMatches) {
      const homeMatchNum = extractMatchNumber(m.home_team_placeholder)
      const awayMatchNum = extractMatchNumber(m.away_team_placeholder)
      const homeSource = homeMatchNum ? knockoutTeamMap.get(homeMatchNum) : null
      const awaySource = awayMatchNum ? knockoutTeamMap.get(awayMatchNum) : null
      const homeSourceMatch = homeMatchNum ? getMatch(homeMatchNum) : null
      const awaySourceMatch = awayMatchNum ? getMatch(awayMatchNum) : null

      const resolveFn = isLoser ? getPickedLoser : getPickedWinner

      const home = homeSourceMatch && homeSource
        ? resolveFn(homeSourceMatch.match_id, homeSource.home, homeSource.away)
        : null
      const away = awaySourceMatch && awaySource
        ? resolveFn(awaySourceMatch.match_id, awaySource.home, awaySource.away)
        : null

      knockoutTeamMap.set(m.match_number, { home, away })
    }
  }

  resolveStage('round_16')
  resolveStage('quarter_final')
  resolveStage('semi_final')
  resolveStage('third_place', true)
  resolveStage('final')

  // 5. Determine champion, runner-up, third place
  const finalMatch = matches.find(m => m.stage === 'final')
  const thirdPlaceMatch = matches.find(m => m.stage === 'third_place')

  let champion: GroupStanding | null = null
  let runnerUp: GroupStanding | null = null
  let thirdPlaceWinner: GroupStanding | null = null

  if (finalMatch) {
    const finalTeams = knockoutTeamMap.get(finalMatch.match_number)
    if (finalTeams) {
      champion = getPickedWinner(finalMatch.match_id, finalTeams.home, finalTeams.away)
      runnerUp = getPickedLoser(finalMatch.match_id, finalTeams.home, finalTeams.away)
    }
  }

  if (thirdPlaceMatch) {
    const thirdTeams = knockoutTeamMap.get(thirdPlaceMatch.match_number)
    if (thirdTeams) {
      thirdPlaceWinner = getPickedWinner(thirdPlaceMatch.match_id, thirdTeams.home, thirdTeams.away)
    }
  }

  return {
    allGroupStandings,
    knockoutTeamMap,
    champion,
    runnerUp,
    thirdPlace: thirdPlaceWinner,
  }
}

/**
 * Get Annex C info for bracket picker third-place rankings.
 */
export function getBPAnnexCInfo(
  thirdPlaceRankings: BPThirdPlaceRanking[]
): { qualifyingGroups: string[]; optionNumber: number; assignments: Record<string, string> } | null {
  const sortedThirds = [...thirdPlaceRankings].sort((a, b) => a.rank - b.rank)
  const qualifyingGroups = sortedThirds.slice(0, 8).map(t => t.group_letter)

  if (qualifyingGroups.length !== 8) return null

  const annexC = lookupAnnexC(qualifyingGroups)
  if (!annexC) return null

  const assignments: Record<string, string> = {}
  for (const [column, group] of Object.entries(annexC.assignment)) {
    assignments[column] = group
  }

  return {
    qualifyingGroups: [...qualifyingGroups].sort(),
    optionNumber: annexC.option,
    assignments,
  }
}
