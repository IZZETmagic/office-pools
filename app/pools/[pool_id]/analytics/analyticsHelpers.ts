import { calculatePoints, checkKnockoutTeamsMatch, type PoolSettings, type PointsResult } from '../results/points'
import type { MatchData, PredictionData, TeamData, MemberData } from '../types'
import type { MatchConductData, ScoreEntry } from '@/lib/tournament'
import { resolveFullBracket } from '@/lib/bracketResolver'

// =============================================
// TYPES
// =============================================

export type PredictionResult = {
  matchId: string
  matchNumber: number
  stage: string
  type: 'exact' | 'winner_gd' | 'winner' | 'miss'
  points: number
}

export type StageAccuracy = {
  stage: string
  stageLabel: string
  total: number
  exact: number
  winnerGd: number
  winner: number
  miss: number
  hitRate: number
}

export type OverallAccuracy = {
  totalMatches: number
  exact: number
  winnerGd: number
  winner: number
  miss: number
  hitRate: number
  exactRate: number
  totalPoints: number
}

export type CrowdMatch = {
  matchId: string
  matchNumber: number
  stage: string
  groupLetter: string | null
  homeTeamName: string
  awayTeamName: string
  actualHomeScore: number
  actualAwayScore: number
  totalPredictions: number
  homeWinPct: number
  drawPct: number
  awayWinPct: number
  mostPopularScore: { home: number; away: number; count: number; pct: number }
  userPredictedResult: 'home' | 'draw' | 'away' | null
  crowdMajorityResult: 'home' | 'draw' | 'away'
  userIsContrarian: boolean
  userWasCorrect: boolean
}

export type StreakEntry = {
  matchNumber: number
  type: 'exact' | 'winner_gd' | 'winner' | 'miss'
  isCorrect: boolean
}

export type StreakData = {
  currentStreak: { type: 'hot' | 'cold' | 'none'; length: number }
  longestHotStreak: number
  longestColdStreak: number
  timeline: StreakEntry[]
}

export type MatchPredictability = {
  matchId: string
  matchNumber: number
  stage: string
  homeTeamName: string
  awayTeamName: string
  actualScore: string
  totalPredictions: number
  correctCount: number
  hitRate: number
}

export type PoolWideStats = {
  mostPredictable: MatchPredictability[]
  leastPredictable: MatchPredictability[]
  avgPoolAccuracy: number
  totalCompletedMatches: number
  totalEntries: number
}

// =============================================
// CONSTANTS
// =============================================

export const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage',
  round_32: 'Round of 32',
  round_16: 'Round of 16',
  quarter_final: 'Quarter Finals',
  semi_final: 'Semi Finals',
  third_place: 'Third Place',
  final: 'Final',
}

export const STAGE_ORDER = ['group', 'round_32', 'round_16', 'quarter_final', 'semi_final', 'third_place', 'final']

// =============================================
// HELPERS
// =============================================

function getWinner(home: number, away: number): 'home' | 'draw' | 'away' {
  if (home > away) return 'home'
  if (away > home) return 'away'
  return 'draw'
}

function getTeamName(match: MatchData, side: 'home' | 'away'): string {
  if (side === 'home') {
    return match.home_team?.country_name ?? match.home_team_placeholder ?? '?'
  }
  return match.away_team?.country_name ?? match.away_team_placeholder ?? '?'
}

/**
 * Resolve knockout team map for an entry's predictions to determine
 * which teams they predicted for each knockout slot.
 */
function buildKnockoutTeamMap(
  matches: MatchData[],
  entryPredictions: PredictionData[],
  teams: TeamData[],
  conductData: MatchConductData[],
): Map<number, { home: { team_id: string; country_name: string } | null; away: { team_id: string; country_name: string } | null }> {
  const predMap = new Map<string, ScoreEntry>()
  for (const p of entryPredictions) {
    predMap.set(p.match_id, {
      home: p.predicted_home_score,
      away: p.predicted_away_score,
      homePso: p.predicted_home_pso ?? null,
      awayPso: p.predicted_away_pso ?? null,
      winnerTeamId: p.predicted_winner_team_id ?? null,
    })
  }

  const bracketMatches = matches.map((m) => ({
    match_id: m.match_id,
    match_number: m.match_number,
    stage: m.stage,
    group_letter: m.group_letter,
    match_date: m.match_date,
    venue: m.venue,
    status: m.status,
    home_team_id: m.home_team_id,
    away_team_id: m.away_team_id,
    home_team_placeholder: m.home_team_placeholder,
    away_team_placeholder: m.away_team_placeholder,
    home_team: m.home_team ? { country_name: m.home_team.country_name, flag_url: m.home_team.flag_url ?? null } : null,
    away_team: m.away_team ? { country_name: m.away_team.country_name, flag_url: m.away_team.flag_url ?? null } : null,
  }))

  const bracket = resolveFullBracket({ matches: bracketMatches, predictionMap: predMap, teams, conductData })
  return bracket.knockoutTeamMap
}

// =============================================
// COMPUTATION FUNCTIONS
// =============================================

/**
 * Compute per-match prediction results for a single entry.
 */
export function computePredictionResults(
  matches: MatchData[],
  entryPredictions: PredictionData[],
  settings: PoolSettings,
  teams: TeamData[],
  conductData: MatchConductData[],
): PredictionResult[] {
  const completed = matches.filter(m => m.is_completed && m.home_score_ft !== null && m.away_score_ft !== null)
  if (completed.length === 0) return []

  const predMap = new Map(entryPredictions.map(p => [p.match_id, p]))
  const knockoutMap = buildKnockoutTeamMap(matches, entryPredictions, teams, conductData)

  const results: PredictionResult[] = []

  for (const match of completed) {
    const pred = predMap.get(match.match_id)
    if (!pred) continue

    const resolved = knockoutMap.get(match.match_number)
    const knockoutTeamsMatch = checkKnockoutTeamsMatch(
      match.stage,
      match.home_team_id,
      match.away_team_id,
      resolved?.home?.team_id ?? null,
      resolved?.away?.team_id ?? null,
    )

    const psoArg =
      settings.pso_enabled && match.home_score_pso != null && match.away_score_pso != null
        ? {
            actualHomePso: match.home_score_pso,
            actualAwayPso: match.away_score_pso,
            predictedHomePso: pred.predicted_home_pso,
            predictedAwayPso: pred.predicted_away_pso,
          }
        : undefined

    const result: PointsResult = calculatePoints(
      pred.predicted_home_score,
      pred.predicted_away_score,
      match.home_score_ft!,
      match.away_score_ft!,
      match.stage,
      settings,
      psoArg,
      knockoutTeamsMatch,
    )

    results.push({
      matchId: match.match_id,
      matchNumber: match.match_number,
      stage: match.stage,
      type: result.type,
      points: result.points,
    })
  }

  return results.sort((a, b) => a.matchNumber - b.matchNumber)
}

/**
 * Compute accuracy breakdown by stage from prediction results.
 */
export function computeAccuracyByStage(results: PredictionResult[]): StageAccuracy[] {
  const byStage = new Map<string, { exact: number; winnerGd: number; winner: number; miss: number }>()

  for (const r of results) {
    if (!byStage.has(r.stage)) {
      byStage.set(r.stage, { exact: 0, winnerGd: 0, winner: 0, miss: 0 })
    }
    const s = byStage.get(r.stage)!
    if (r.type === 'exact') s.exact++
    else if (r.type === 'winner_gd') s.winnerGd++
    else if (r.type === 'winner') s.winner++
    else s.miss++
  }

  return STAGE_ORDER
    .filter(stage => byStage.has(stage))
    .map(stage => {
      const s = byStage.get(stage)!
      const total = s.exact + s.winnerGd + s.winner + s.miss
      return {
        stage,
        stageLabel: STAGE_LABELS[stage] ?? stage,
        total,
        exact: s.exact,
        winnerGd: s.winnerGd,
        winner: s.winner,
        miss: s.miss,
        hitRate: total > 0 ? (s.exact + s.winnerGd + s.winner) / total : 0,
      }
    })
}

/**
 * Compute overall accuracy stats.
 */
export function computeOverallAccuracy(results: PredictionResult[]): OverallAccuracy {
  let exact = 0, winnerGd = 0, winner = 0, miss = 0, totalPoints = 0
  for (const r of results) {
    if (r.type === 'exact') exact++
    else if (r.type === 'winner_gd') winnerGd++
    else if (r.type === 'winner') winner++
    else miss++
    totalPoints += r.points
  }
  const total = results.length
  return {
    totalMatches: total,
    exact,
    winnerGd,
    winner,
    miss,
    hitRate: total > 0 ? (exact + winnerGd + winner) / total : 0,
    exactRate: total > 0 ? exact / total : 0,
    totalPoints,
  }
}

/**
 * Compute crowd prediction data for each completed match.
 */
export function computeCrowdPredictions(
  matches: MatchData[],
  allPredictions: PredictionData[],
  entryPredictions: PredictionData[],
  members: MemberData[],
): CrowdMatch[] {
  const completed = matches.filter(m => m.is_completed && m.home_score_ft !== null && m.away_score_ft !== null)
  if (completed.length === 0) return []

  // Get submitted entry IDs
  const submittedEntryIds = new Set<string>()
  for (const member of members) {
    if (member.entries) {
      for (const entry of member.entries) {
        if (entry.has_submitted_predictions) submittedEntryIds.add(entry.entry_id)
      }
    }
  }

  // Group all predictions by match
  const predsByMatch = new Map<string, PredictionData[]>()
  for (const p of allPredictions) {
    if (!submittedEntryIds.has(p.entry_id)) continue
    const list = predsByMatch.get(p.match_id) ?? []
    list.push(p)
    predsByMatch.set(p.match_id, list)
  }

  const userPredMap = new Map(entryPredictions.map(p => [p.match_id, p]))

  const results: CrowdMatch[] = []

  for (const match of completed) {
    const preds = predsByMatch.get(match.match_id) ?? []
    if (preds.length === 0) continue

    const actualResult = getWinner(match.home_score_ft!, match.away_score_ft!)

    // Count prediction results
    let homeWins = 0, draws = 0, awayWins = 0
    const scoreCounts = new Map<string, number>()

    for (const p of preds) {
      const result = getWinner(p.predicted_home_score, p.predicted_away_score)
      if (result === 'home') homeWins++
      else if (result === 'draw') draws++
      else awayWins++

      const key = `${p.predicted_home_score}-${p.predicted_away_score}`
      scoreCounts.set(key, (scoreCounts.get(key) ?? 0) + 1)
    }

    const total = preds.length

    // Find most popular exact score
    let topScore = { home: 0, away: 0, count: 0 }
    for (const [key, count] of scoreCounts) {
      if (count > topScore.count) {
        const [h, a] = key.split('-').map(Number)
        topScore = { home: h, away: a, count }
      }
    }

    // Determine crowd majority
    const maxVotes = Math.max(homeWins, draws, awayWins)
    const crowdMajority = homeWins === maxVotes ? 'home' : draws === maxVotes ? 'draw' : 'away'

    // User's prediction
    const userPred = userPredMap.get(match.match_id)
    const userResult = userPred
      ? getWinner(userPred.predicted_home_score, userPred.predicted_away_score)
      : null

    const userIsContrarian = userResult !== null && userResult !== crowdMajority
    const userWasCorrect = userResult !== null && userResult === actualResult

    results.push({
      matchId: match.match_id,
      matchNumber: match.match_number,
      stage: match.stage,
      groupLetter: match.group_letter,
      homeTeamName: getTeamName(match, 'home'),
      awayTeamName: getTeamName(match, 'away'),
      actualHomeScore: match.home_score_ft!,
      actualAwayScore: match.away_score_ft!,
      totalPredictions: total,
      homeWinPct: total > 0 ? homeWins / total : 0,
      drawPct: total > 0 ? draws / total : 0,
      awayWinPct: total > 0 ? awayWins / total : 0,
      mostPopularScore: { ...topScore, pct: total > 0 ? topScore.count / total : 0 },
      userPredictedResult: userResult,
      crowdMajorityResult: crowdMajority,
      userIsContrarian,
      userWasCorrect,
    })
  }

  return results.sort((a, b) => a.matchNumber - b.matchNumber)
}

/**
 * Compute streak data from prediction results (in chronological order).
 */
export function computeStreaks(results: PredictionResult[]): StreakData {
  if (results.length === 0) {
    return { currentStreak: { type: 'none', length: 0 }, longestHotStreak: 0, longestColdStreak: 0, timeline: [] }
  }

  const sorted = [...results].sort((a, b) => a.matchNumber - b.matchNumber)
  const timeline: StreakEntry[] = sorted.map(r => ({
    matchNumber: r.matchNumber,
    type: r.type,
    isCorrect: r.type !== 'miss',
  }))

  let longestHot = 0, longestCold = 0
  let currentHot = 0, currentCold = 0

  for (const entry of timeline) {
    if (entry.isCorrect) {
      currentHot++
      currentCold = 0
      if (currentHot > longestHot) longestHot = currentHot
    } else {
      currentCold++
      currentHot = 0
      if (currentCold > longestCold) longestCold = currentCold
    }
  }

  // Current streak is whatever the last run is
  const last = timeline[timeline.length - 1]
  let currentType: 'hot' | 'cold' | 'none' = 'none'
  let currentLength = 0

  if (last.isCorrect) {
    currentType = 'hot'
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].isCorrect) currentLength++
      else break
    }
  } else {
    currentType = 'cold'
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (!timeline[i].isCorrect) currentLength++
      else break
    }
  }

  return {
    currentStreak: { type: currentType, length: currentLength },
    longestHotStreak: longestHot,
    longestColdStreak: longestCold,
    timeline,
  }
}

/**
 * Compute pool-wide stats: most/least predictable matches, average accuracy.
 */
export function computePoolWideStats(
  matches: MatchData[],
  allPredictions: PredictionData[],
  members: MemberData[],
  settings: PoolSettings,
): PoolWideStats {
  const completed = matches.filter(m => m.is_completed && m.home_score_ft !== null && m.away_score_ft !== null)
  if (completed.length === 0) {
    return { mostPredictable: [], leastPredictable: [], avgPoolAccuracy: 0, totalCompletedMatches: 0, totalEntries: 0 }
  }

  // Get submitted entry IDs
  const submittedEntryIds = new Set<string>()
  for (const member of members) {
    if (member.entries) {
      for (const entry of member.entries) {
        if (entry.has_submitted_predictions) submittedEntryIds.add(entry.entry_id)
      }
    }
  }

  // Group predictions by match
  const predsByMatch = new Map<string, PredictionData[]>()
  for (const p of allPredictions) {
    if (!submittedEntryIds.has(p.entry_id)) continue
    const list = predsByMatch.get(p.match_id) ?? []
    list.push(p)
    predsByMatch.set(p.match_id, list)
  }

  const matchStats: MatchPredictability[] = []
  let totalCorrectAcrossAll = 0
  let totalPredictionsAcrossAll = 0

  for (const match of completed) {
    const preds = predsByMatch.get(match.match_id) ?? []
    if (preds.length === 0) continue

    const actualResult = getWinner(match.home_score_ft!, match.away_score_ft!)
    let correctCount = 0

    for (const p of preds) {
      const predResult = getWinner(p.predicted_home_score, p.predicted_away_score)
      if (predResult === actualResult) correctCount++
    }

    totalCorrectAcrossAll += correctCount
    totalPredictionsAcrossAll += preds.length

    matchStats.push({
      matchId: match.match_id,
      matchNumber: match.match_number,
      stage: match.stage,
      homeTeamName: getTeamName(match, 'home'),
      awayTeamName: getTeamName(match, 'away'),
      actualScore: `${match.home_score_ft}-${match.away_score_ft}`,
      totalPredictions: preds.length,
      correctCount,
      hitRate: preds.length > 0 ? correctCount / preds.length : 0,
    })
  }

  const sorted = [...matchStats].sort((a, b) => b.hitRate - a.hitRate)

  return {
    mostPredictable: sorted.slice(0, 5),
    leastPredictable: [...sorted].reverse().slice(0, 5),
    avgPoolAccuracy: totalPredictionsAcrossAll > 0 ? totalCorrectAcrossAll / totalPredictionsAcrossAll : 0,
    totalCompletedMatches: completed.length,
    totalEntries: submittedEntryIds.size,
  }
}
