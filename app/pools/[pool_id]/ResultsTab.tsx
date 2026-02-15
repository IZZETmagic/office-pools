'use client'

import { ResultsView } from './results/ResultsView'
import type { ResultMatch } from './results/MatchCard'
import type { PoolSettings } from './results/points'
import type { MatchData } from './types'

type ResultsTabProps = {
  matches: MatchData[]
  predictions: {
    match_id: string
    predicted_home_score: number
    predicted_away_score: number
    predicted_home_pso: number | null
    predicted_away_pso: number | null
  }[]
  poolSettings: PoolSettings
}

export function ResultsTab({ matches, predictions, poolSettings }: ResultsTabProps) {
  // Build prediction lookup
  const predictionMap = new Map(
    predictions.map((p) => [p.match_id, p])
  )

  // Transform MatchData[] into ResultMatch[]
  const resultMatches: ResultMatch[] = matches.map((m) => ({
    match_id: m.match_id,
    match_number: m.match_number,
    stage: m.stage,
    group_letter: m.group_letter,
    match_date: m.match_date,
    venue: m.venue,
    status: m.status,
    home_score_ft: m.home_score_ft,
    away_score_ft: m.away_score_ft,
    home_score_pso: m.home_score_pso,
    away_score_pso: m.away_score_pso,
    home_team_placeholder: m.home_team_placeholder,
    away_team_placeholder: m.away_team_placeholder,
    home_team: m.home_team ? { country_name: m.home_team.country_name, country_code: '' } : null,
    away_team: m.away_team ? { country_name: m.away_team.country_name, country_code: '' } : null,
    prediction: predictionMap.has(m.match_id)
      ? {
          predicted_home_score: predictionMap.get(m.match_id)!.predicted_home_score,
          predicted_away_score: predictionMap.get(m.match_id)!.predicted_away_score,
          predicted_home_pso: predictionMap.get(m.match_id)!.predicted_home_pso ?? null,
          predicted_away_pso: predictionMap.get(m.match_id)!.predicted_away_pso ?? null,
        }
      : null,
  }))

  if (resultMatches.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <p className="text-gray-600">No matches available for this tournament yet.</p>
      </div>
    )
  }

  return <ResultsView matches={resultMatches} poolSettings={poolSettings} />
}
