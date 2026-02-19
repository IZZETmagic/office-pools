import {
  Match,
  Team,
  PredictionMap,
  GroupStanding,
  MatchConductData,
  GROUP_LETTERS,
  calculateGroupStandings,
  resolveAllR32Matches,
  getKnockoutWinner,
  getKnockoutLoser,
  getBest8ThirdPlaceTeams,
  rankThirdPlaceTeams,
} from './tournament'

export type BracketResult = {
  allGroupStandings: Map<string, GroupStanding[]>
  knockoutTeamMap: Map<number, { home: GroupStanding | null; away: GroupStanding | null }>
  champion: GroupStanding | null
  runnerUp: GroupStanding | null
  thirdPlace: GroupStanding | null
  qualifiedTeamIds: Set<string>
}

function extractMatchNumber(placeholder: string | null): number | null {
  if (!placeholder) return null
  const match = placeholder.match(/(?:Match\s*)?(\d+)/i)
  return match ? parseInt(match[1]) : null
}

/**
 * Resolves the full tournament bracket from a set of predictions.
 *
 * Computes group standings for all 12 groups, resolves R32 via Annex C,
 * then cascades through R16, QF, SF, third-place, and final to determine
 * champion, runner-up, third place, and all 32 qualifying team IDs.
 */
export function resolveFullBracket(params: {
  matches: Match[]
  predictionMap: PredictionMap
  teams: Team[]
  conductData?: MatchConductData[]
}): BracketResult {
  const { matches, predictionMap, teams, conductData } = params

  // 1. Calculate group standings for all 12 groups
  const allGroupStandings = new Map<string, GroupStanding[]>()
  for (const letter of GROUP_LETTERS) {
    const gMatches = matches.filter(m => m.stage === 'group' && m.group_letter === letter)
    allGroupStandings.set(
      letter,
      calculateGroupStandings(letter, gMatches, predictionMap, teams, conductData)
    )
  }

  // 2. Resolve R32 matches via Annex C
  const r32Resolutions = resolveAllR32Matches(allGroupStandings)

  // 3. Build knockout team map starting with R32
  const knockoutTeamMap = new Map<number, { home: GroupStanding | null; away: GroupStanding | null }>()
  for (const [matchNum, teamsResolved] of r32Resolutions) {
    knockoutTeamMap.set(matchNum, teamsResolved)
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

      const resolveFn = isLoser ? getKnockoutLoser : getKnockoutWinner

      const home = homeSourceMatch && homeSource
        ? resolveFn(homeSourceMatch.match_id, predictionMap, homeSource.home, homeSource.away)
        : null
      const away = awaySourceMatch && awaySource
        ? resolveFn(awaySourceMatch.match_id, predictionMap, awaySource.home, awaySource.away)
        : null

      knockoutTeamMap.set(m.match_number, { home, away })
    }
  }

  resolveStage('round_16')
  resolveStage('quarter_final')
  resolveStage('semi_final')
  resolveStage('third_place', true)  // third-place takes losers of semi-finals
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
      champion = getKnockoutWinner(finalMatch.match_id, predictionMap, finalTeams.home, finalTeams.away)
      runnerUp = getKnockoutLoser(finalMatch.match_id, predictionMap, finalTeams.home, finalTeams.away)
    }
  }

  if (thirdPlaceMatch) {
    const thirdTeams = knockoutTeamMap.get(thirdPlaceMatch.match_number)
    if (thirdTeams) {
      thirdPlaceWinner = getKnockoutWinner(thirdPlaceMatch.match_id, predictionMap, thirdTeams.home, thirdTeams.away)
    }
  }

  // 6. Compute the set of 32 qualified team IDs (top 2 per group + best 8 thirds)
  const qualifiedTeamIds = new Set<string>()
  for (const [, standings] of allGroupStandings) {
    if (standings.length >= 2) {
      qualifiedTeamIds.add(standings[0].team_id)
      qualifiedTeamIds.add(standings[1].team_id)
    }
  }
  const best8 = getBest8ThirdPlaceTeams(allGroupStandings)
  for (const t of best8) {
    qualifiedTeamIds.add(t.team_id)
  }

  return {
    allGroupStandings,
    knockoutTeamMap,
    champion,
    runnerUp,
    thirdPlace: thirdPlaceWinner,
    qualifiedTeamIds,
  }
}

/**
 * Build a PredictionMap from actual match results (completed matches).
 * This is used to run the bracket resolver on "what actually happened"
 * so we can compare predicted vs actual brackets for bonus calculation.
 */
export function buildActualResultsMap(matches: Match[]): PredictionMap {
  const map = new Map<string, { home: number | null; away: number | null; homePso?: number | null; awayPso?: number | null; winnerTeamId?: string | null }>()

  for (const m of matches) {
    if (m.stage === 'group') {
      // For group matches, only include completed ones
      if ((m as any).is_completed && (m as any).home_score_ft != null) {
        map.set(m.match_id, {
          home: (m as any).home_score_ft,
          away: (m as any).away_score_ft,
          homePso: null,
          awayPso: null,
          winnerTeamId: null,
        })
      }
    } else {
      // For knockout matches, include completed ones with PSO data
      if ((m as any).is_completed && (m as any).home_score_ft != null) {
        map.set(m.match_id, {
          home: (m as any).home_score_ft,
          away: (m as any).away_score_ft,
          homePso: (m as any).home_score_pso ?? null,
          awayPso: (m as any).away_score_pso ?? null,
          winnerTeamId: (m as any).winner_team_id ?? null,
        })
      }
    }
  }

  return map
}
