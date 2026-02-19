import { lookupAnnexC, ANNEX_C_COLUMN_TO_MATCH, type AnnexCAssignment } from './annexC'

// =============================================
// TYPES
// =============================================

export type Team = {
  team_id: string
  country_name: string
  country_code: string
  group_letter: string
  fifa_ranking_points: number
  flag_url?: string | null
}

export type Match = {
  match_id: string
  match_number: number
  stage: string
  group_letter: string | null
  match_date: string
  venue: string | null
  status: string
  home_team_id: string | null
  away_team_id: string | null
  home_team_placeholder: string | null
  away_team_placeholder: string | null
  home_team: { country_name: string; flag_url: string | null } | null
  away_team: { country_name: string; flag_url: string | null } | null
}

export type Prediction = {
  match_id: string
  predicted_home_score: number
  predicted_away_score: number
  predicted_home_pso: number | null
  predicted_away_pso: number | null
  predicted_winner_team_id: string | null
  prediction_id?: string
}

export type ScoreEntry = {
  home: number | null
  away: number | null
  homePso?: number | null
  awayPso?: number | null
  winnerTeamId?: string | null
}
export type PredictionMap = Map<string, ScoreEntry>

/** Check if a prediction has both scores filled in */
export function isPredictionComplete(pred: ScoreEntry | undefined): pred is ScoreEntry & { home: number; away: number } {
  return pred != null && pred.home != null && pred.away != null
}

export type GroupStanding = {
  team_id: string
  country_name: string
  country_code: string
  flag_url?: string | null
  group_letter: string
  fifa_ranking_points: number
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  conductScore?: number // Fair Play points: 0 = best (no cards), negative = worse
}

export type MatchConductData = {
  match_id: string
  team_id: string
  yellow_cards: number
  indirect_red_cards: number
  direct_red_cards: number
  yellow_direct_red_cards: number
}

/** Calculate cumulative conduct score for a team from conduct records.
 *  Returns 0 (best) or negative number (worse). */
export function calculateConductScore(
  teamId: string,
  conductRecords: MatchConductData[]
): number {
  let score = 0
  for (const record of conductRecords) {
    if (record.team_id === teamId) {
      score -= (
        record.yellow_cards * 1 +
        record.indirect_red_cards * 3 +
        record.direct_red_cards * 4 +
        record.yellow_direct_red_cards * 5
      )
    }
  }
  return score
}

export type ThirdPlaceTeam = GroupStanding & {
  rank: number
}

export const STAGES = [
  'group',
  'round_32',
  'round_16',
  'quarter_final',
  'semi_final',
  'finals',    // covers third_place + final
  'summary',
] as const

export type Stage = typeof STAGES[number]

export const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage',
  round_32: 'Round of 32',
  round_16: 'Round of 16',
  quarter_final: 'Quarter Finals',
  semi_final: 'Semi Finals',
  finals: 'Third Place & Final',
  summary: 'Summary',
}

export const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

// =============================================
// ROUND OF 32 MATCHUP MAPPING
// Each entry maps a match_number to the home/away resolution logic
// =============================================

export type R32Slot =
  | { type: 'group_winner'; group: string }
  | { type: 'group_runner_up'; group: string }
  | { type: 'best_third'; eligible_groups: string[] }

export const R32_MATCHUPS: Record<number, { home: R32Slot; away: R32Slot }> = {
  73: { home: { type: 'group_runner_up', group: 'A' }, away: { type: 'group_runner_up', group: 'B' } },
  74: { home: { type: 'group_winner', group: 'C' }, away: { type: 'group_runner_up', group: 'F' } },
  75: { home: { type: 'group_winner', group: 'E' }, away: { type: 'best_third', eligible_groups: ['A', 'B', 'C', 'D', 'F'] } },
  76: { home: { type: 'group_winner', group: 'F' }, away: { type: 'group_runner_up', group: 'C' } },
  77: { home: { type: 'group_runner_up', group: 'E' }, away: { type: 'group_runner_up', group: 'I' } },
  78: { home: { type: 'group_winner', group: 'I' }, away: { type: 'best_third', eligible_groups: ['C', 'D', 'F', 'G', 'H'] } },
  79: { home: { type: 'group_winner', group: 'A' }, away: { type: 'best_third', eligible_groups: ['C', 'E', 'F', 'H', 'I'] } },
  80: { home: { type: 'group_winner', group: 'L' }, away: { type: 'best_third', eligible_groups: ['E', 'H', 'I', 'J', 'K'] } },
  81: { home: { type: 'group_winner', group: 'G' }, away: { type: 'best_third', eligible_groups: ['A', 'E', 'H', 'I', 'J'] } },
  82: { home: { type: 'group_winner', group: 'D' }, away: { type: 'best_third', eligible_groups: ['B', 'E', 'F', 'I', 'J'] } },
  83: { home: { type: 'group_winner', group: 'H' }, away: { type: 'group_runner_up', group: 'J' } },
  84: { home: { type: 'group_runner_up', group: 'K' }, away: { type: 'group_runner_up', group: 'L' } },
  85: { home: { type: 'group_winner', group: 'B' }, away: { type: 'best_third', eligible_groups: ['E', 'F', 'G', 'I', 'J'] } },
  86: { home: { type: 'group_runner_up', group: 'D' }, away: { type: 'group_runner_up', group: 'G' } },
  87: { home: { type: 'group_winner', group: 'J' }, away: { type: 'group_runner_up', group: 'H' } },
  88: { home: { type: 'group_winner', group: 'K' }, away: { type: 'best_third', eligible_groups: ['D', 'E', 'I', 'J', 'L'] } },
}

// =============================================
// GROUP STANDINGS CALCULATION
// =============================================

export function calculateGroupStandings(
  groupLetter: string,
  groupMatches: Match[],
  predictions: PredictionMap,
  teams: Team[],
  conductData?: MatchConductData[]
): GroupStanding[] {
  const groupTeams = teams.filter(t => t.group_letter === groupLetter)

  const standings: GroupStanding[] = groupTeams.map(team => ({
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
  }))

  const standingsMap = new Map(standings.map(s => [s.team_id, s]))

  for (const match of groupMatches) {
    const pred = predictions.get(match.match_id)
    if (!pred || pred.home == null || pred.away == null) continue
    if (match.home_team_id == null || match.away_team_id == null) continue

    const home = standingsMap.get(match.home_team_id)
    const away = standingsMap.get(match.away_team_id)
    if (!home || !away) continue

    const hGoals = pred.home
    const aGoals = pred.away

    home.played++
    away.played++
    home.goalsFor += hGoals
    home.goalsAgainst += aGoals
    away.goalsFor += aGoals
    away.goalsAgainst += hGoals

    if (hGoals > aGoals) {
      home.wins++
      away.losses++
    } else if (hGoals < aGoals) {
      away.wins++
      home.losses++
    } else {
      home.draws++
      away.draws++
    }
  }

  // Compute derived fields
  for (const s of standings) {
    s.goalDifference = s.goalsFor - s.goalsAgainst
    s.points = s.wins * 3 + s.draws
    if (conductData) {
      s.conductScore = calculateConductScore(s.team_id, conductData)
    }
  }

  // Sort with tiebreakers
  return sortStandings(standings, groupMatches, predictions)
}

// =============================================
// TIEBREAKER SORTING
// =============================================

function sortStandings(
  standings: GroupStanding[],
  groupMatches: Match[],
  predictions: PredictionMap
): GroupStanding[] {
  // First sort by points desc, then GD desc, then GF desc, then FIFA ranking desc
  const sorted = [...standings].sort((a, b) => {
    // 1. Total points
    if (b.points !== a.points) return b.points - a.points
    return 0
  })

  // Now handle tied groups via head-to-head
  const result: GroupStanding[] = []
  let i = 0
  while (i < sorted.length) {
    // Find teams with same points
    let j = i + 1
    while (j < sorted.length && sorted[j].points === sorted[i].points) {
      j++
    }

    if (j - i === 1) {
      // No tie
      result.push(sorted[i])
    } else {
      // Tied group: resolve with head-to-head
      const tiedTeams = sorted.slice(i, j)
      const resolved = resolveH2HTiebreaker(tiedTeams, groupMatches, predictions)
      result.push(...resolved)
    }
    i = j
  }

  return result
}

function resolveH2HTiebreaker(
  tiedTeams: GroupStanding[],
  groupMatches: Match[],
  predictions: PredictionMap
): GroupStanding[] {
  const teamIds = new Set(tiedTeams.map(t => t.team_id))

  // Find matches between tied teams only
  const h2hMatches = groupMatches.filter(
    m => m.home_team_id && m.away_team_id && teamIds.has(m.home_team_id) && teamIds.has(m.away_team_id)
  )

  // Compute h2h stats
  const h2hStats = new Map<string, { points: number; gd: number; gf: number }>()
  for (const t of tiedTeams) {
    h2hStats.set(t.team_id, { points: 0, gd: 0, gf: 0 })
  }

  for (const match of h2hMatches) {
    const pred = predictions.get(match.match_id)
    if (!pred || pred.home == null || pred.away == null || match.home_team_id == null || match.away_team_id == null) continue

    const homeStats = h2hStats.get(match.home_team_id)
    const awayStats = h2hStats.get(match.away_team_id)
    if (!homeStats || !awayStats) continue

    homeStats.gf += pred.home
    awayStats.gf += pred.away
    homeStats.gd += pred.home - pred.away
    awayStats.gd += pred.away - pred.home

    if (pred.home > pred.away) {
      homeStats.points += 3
    } else if (pred.home < pred.away) {
      awayStats.points += 3
    } else {
      homeStats.points += 1
      awayStats.points += 1
    }
  }

  return [...tiedTeams].sort((a, b) => {
    const aH2H = h2hStats.get(a.team_id)!
    const bH2H = h2hStats.get(b.team_id)!

    // 1. H2H points
    if (bH2H.points !== aH2H.points) return bH2H.points - aH2H.points
    // 2. H2H goal difference
    if (bH2H.gd !== aH2H.gd) return bH2H.gd - aH2H.gd
    // 3. H2H goals scored
    if (bH2H.gf !== aH2H.gf) return bH2H.gf - aH2H.gf
    // 4. Overall goal difference (already on standings)
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference
    // 5. Overall goals scored
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
    // 6. Team conduct score (Fair Play: higher/closer to 0 is better)
    const aConductScore = a.conductScore ?? 0
    const bConductScore = b.conductScore ?? 0
    if (bConductScore !== aConductScore) return bConductScore - aConductScore
    // 7. FIFA ranking points
    return b.fifa_ranking_points - a.fifa_ranking_points
  })
}

// =============================================
// BEST THIRD-PLACE TEAMS
// =============================================

export function rankThirdPlaceTeams(
  allGroupStandings: Map<string, GroupStanding[]>
): ThirdPlaceTeam[] {
  const thirdPlaceTeams: GroupStanding[] = []

  for (const [, standings] of allGroupStandings) {
    if (standings.length >= 3) {
      thirdPlaceTeams.push(standings[2]) // 0-indexed: 3rd place
    }
  }

  // Sort by: points desc, GD desc, GF desc, conduct score desc, FIFA ranking desc
  const sorted = [...thirdPlaceTeams].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
    // Team conduct score (Fair Play: higher/closer to 0 is better)
    const aConductScore = a.conductScore ?? 0
    const bConductScore = b.conductScore ?? 0
    if (bConductScore !== aConductScore) return bConductScore - aConductScore
    return b.fifa_ranking_points - a.fifa_ranking_points
  })

  return sorted.map((t, i) => ({ ...t, rank: i + 1 }))
}

export function getBest8ThirdPlaceTeams(
  allGroupStandings: Map<string, GroupStanding[]>
): ThirdPlaceTeam[] {
  return rankThirdPlaceTeams(allGroupStandings).slice(0, 8)
}

// =============================================
// RESOLVE ROUND OF 32 TEAMS
// =============================================

export function resolveR32Teams(
  allGroupStandings: Map<string, GroupStanding[]>,
  matchNumber: number
): { home: GroupStanding | null; away: GroupStanding | null } {
  const mapping = R32_MATCHUPS[matchNumber]
  if (!mapping) return { home: null, away: null }

  const best8 = getBest8ThirdPlaceTeams(allGroupStandings)
  // Track which best-3rd teams have been assigned so far
  // We need to do this across all matches, so this is a simpler per-match resolution
  const home = resolveSlot(mapping.home, allGroupStandings, best8)
  const away = resolveSlot(mapping.away, allGroupStandings, best8)

  return { home, away }
}

function resolveSlot(
  slot: R32Slot,
  allGroupStandings: Map<string, GroupStanding[]>,
  best8: ThirdPlaceTeam[]
): GroupStanding | null {
  if (slot.type === 'group_winner') {
    const standings = allGroupStandings.get(slot.group)
    return standings?.[0] ?? null
  }
  if (slot.type === 'group_runner_up') {
    const standings = allGroupStandings.get(slot.group)
    return standings?.[1] ?? null
  }
  if (slot.type === 'best_third') {
    // Find the best-ranked 3rd place team from the eligible groups
    for (const team of best8) {
      if (slot.eligible_groups.includes(team.group_letter)) {
        return team
      }
    }
    return null
  }
  return null
}

// Full R32 resolution using FIFA Annex C for third-place team assignment.
// Annex C defines exactly 495 deterministic mappings (one per C(12,8) combination)
// that specify which third-place team plays which group winner based on which
// 8 groups supplied qualifying third-place teams.
// Falls back to backtracking when Annex C cannot be applied (incomplete data).
export function resolveAllR32Matches(
  allGroupStandings: Map<string, GroupStanding[]>
): Map<number, { home: GroupStanding | null; away: GroupStanding | null }> {
  const best8 = getBest8ThirdPlaceTeams(allGroupStandings)
  const result = new Map<number, { home: GroupStanding | null; away: GroupStanding | null }>()

  const matchNumbers = Object.keys(R32_MATCHUPS).map(Number).sort((a, b) => a - b)

  // Resolve all non-third-place slots first (group winners & runners-up are deterministic)
  for (const matchNum of matchNumbers) {
    const mapping = R32_MATCHUPS[matchNum]
    const home = resolveNonThirdSlot(mapping.home, allGroupStandings)
    const away = resolveNonThirdSlot(mapping.away, allGroupStandings)
    result.set(matchNum, { home, away })
  }

  // Try Annex C deterministic assignment first
  if (best8.length === 8) {
    const qualifyingGroups = best8.map(t => t.group_letter)
    const annexC = lookupAnnexC(qualifyingGroups)

    if (annexC) {
      // Build map: group letter → third-place team
      const thirdByGroup = new Map<string, ThirdPlaceTeam>()
      for (const team of best8) {
        thirdByGroup.set(team.group_letter, team)
      }

      // Apply Annex C assignments
      for (const [column, thirdGroupLetter] of Object.entries(annexC.assignment) as [keyof AnnexCAssignment, string][]) {
        const matchNum = ANNEX_C_COLUMN_TO_MATCH[column]
        const team = thirdByGroup.get(thirdGroupLetter) ?? null
        const current = result.get(matchNum)!
        // Third-place team is always the away team in these matches
        result.set(matchNum, { home: current.home, away: team })
      }

      return result
    }
  }

  // Fallback: backtracking (used when < 8 third-place teams or Annex C lookup fails)
  const thirdSlots: { matchNum: number; side: 'home' | 'away'; eligible: string[] }[] = []
  for (const matchNum of matchNumbers) {
    const mapping = R32_MATCHUPS[matchNum]
    if (mapping.home.type === 'best_third') {
      thirdSlots.push({ matchNum, side: 'home', eligible: mapping.home.eligible_groups })
    }
    if (mapping.away.type === 'best_third') {
      thirdSlots.push({ matchNum, side: 'away', eligible: mapping.away.eligible_groups })
    }
  }

  const assignment = new Map<number, ThirdPlaceTeam>()
  const usedTeamIds = new Set<string>()

  function backtrack(slotIdx: number): boolean {
    if (slotIdx === thirdSlots.length) return true

    const slot = thirdSlots[slotIdx]
    for (const team of best8) {
      if (usedTeamIds.has(team.team_id)) continue
      if (!slot.eligible.includes(team.group_letter)) continue

      usedTeamIds.add(team.team_id)
      assignment.set(slotIdx, team)

      if (backtrack(slotIdx + 1)) return true

      usedTeamIds.delete(team.team_id)
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

/**
 * Returns information about which Annex C option is active for the current standings.
 * Useful for display/debugging in admin views and ThirdPlaceTable.
 */
export function getAnnexCInfo(
  allGroupStandings: Map<string, GroupStanding[]>
): { qualifyingGroups: string[]; optionNumber: number; assignments: Record<string, string> } | null {
  const best8 = getBest8ThirdPlaceTeams(allGroupStandings)
  if (best8.length !== 8) return null

  const qualifyingGroups = best8.map(t => t.group_letter)
  const annexC = lookupAnnexC(qualifyingGroups)
  if (!annexC) return null

  // Build human-readable assignments: "1A → 3E" style
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

function resolveNonThirdSlot(
  slot: R32Slot,
  allGroupStandings: Map<string, GroupStanding[]>
): GroupStanding | null {
  if (slot.type === 'group_winner') {
    const standings = allGroupStandings.get(slot.group)
    return standings?.[0] ?? null
  }
  if (slot.type === 'group_runner_up') {
    const standings = allGroupStandings.get(slot.group)
    return standings?.[1] ?? null
  }
  return null // best_third handled separately
}

// =============================================
// RESOLVE KNOCKOUT WINNERS
// =============================================

export function getKnockoutWinner(
  matchId: string,
  predictions: PredictionMap,
  homeTeam: GroupStanding | null,
  awayTeam: GroupStanding | null
): GroupStanding | null {
  if (!homeTeam || !awayTeam) return null
  const pred = predictions.get(matchId)
  if (!pred || pred.home == null || pred.away == null) return null

  // Full-time winner
  if (pred.home > pred.away) return homeTeam
  if (pred.away > pred.home) return awayTeam

  // Tied: check PSO exact scores
  if (pred.homePso != null && pred.awayPso != null) {
    if (pred.homePso > pred.awayPso) return homeTeam
    if (pred.awayPso > pred.homePso) return awayTeam
  }

  // Tied: check explicit winner team ID
  if (pred.winnerTeamId) {
    if (pred.winnerTeamId === homeTeam.team_id) return homeTeam
    if (pred.winnerTeamId === awayTeam.team_id) return awayTeam
  }

  // Fallback: FIFA ranking
  return homeTeam.fifa_ranking_points >= awayTeam.fifa_ranking_points ? homeTeam : awayTeam
}

export function getKnockoutLoser(
  matchId: string,
  predictions: PredictionMap,
  homeTeam: GroupStanding | null,
  awayTeam: GroupStanding | null
): GroupStanding | null {
  if (!homeTeam || !awayTeam) return null
  const winner = getKnockoutWinner(matchId, predictions, homeTeam, awayTeam)
  if (!winner) return null
  return winner.team_id === homeTeam.team_id ? awayTeam : homeTeam
}

// =============================================
// MATCH COUNTING HELPERS
// =============================================

export function countPredictedMatches(
  matches: Match[],
  predictions: PredictionMap,
  stage: string
): { predicted: number; total: number } {
  const stageMatches = stage === 'finals'
    ? matches.filter(m => m.stage === 'third_place' || m.stage === 'final')
    : matches.filter(m => m.stage === stage)
  const total = stageMatches.length
  const predicted = stageMatches.filter(m => isPredictionComplete(predictions.get(m.match_id))).length
  return { predicted, total }
}

export function isStageComplete(
  matches: Match[],
  predictions: PredictionMap,
  stage: string
): boolean {
  const { predicted, total } = countPredictedMatches(matches, predictions, stage)
  if (total === 0 || predicted !== total) return false

  // For knockout stages, verify tied matches have a PSO winner
  if (stage !== 'group') {
    const stageMatches = stage === 'finals'
      ? matches.filter(m => m.stage === 'third_place' || m.stage === 'final')
      : matches.filter(m => m.stage === stage)
    for (const match of stageMatches) {
      const pred = predictions.get(match.match_id)
      if (!pred || pred.home == null || pred.away == null) return false
      if (pred.home === pred.away) {
        // Draw: must have PSO scores or winner team ID
        const hasPso = pred.homePso != null && pred.awayPso != null && pred.homePso !== pred.awayPso
        const hasWinner = pred.winnerTeamId != null
        if (!hasPso && !hasWinner) return false
      }
    }
  }

  return true
}
