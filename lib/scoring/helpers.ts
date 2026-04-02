// =============================================================
// SCORING ENGINE — SHARED HELPERS
// =============================================================
// Functions used by both full.ts and progressive.ts scoring modes.
// =============================================================

import type { ScoringInput, EntryWithPredictions } from './types'
import type { PredictionMap, Team } from '@/lib/tournament'

/** Build a PredictionMap from an entry's predictions array */
export function buildPredictionMap(predictions: EntryWithPredictions['predictions']): PredictionMap {
  const map: PredictionMap = new Map()
  for (const p of predictions) {
    map.set(p.match_id, {
      home: p.predicted_home_score,
      away: p.predicted_away_score,
      homePso: p.predicted_home_pso ?? null,
      awayPso: p.predicted_away_pso ?? null,
      winnerTeamId: p.predicted_winner_team_id ?? null,
    })
  }
  return map
}

/** Convert our TeamData[] to the Team[] shape bracketResolver expects */
export function toTeams(teams: ScoringInput['teams']): Team[] {
  return teams.map(t => ({
    team_id: t.team_id,
    country_name: t.country_name,
    country_code: t.country_code,
    group_letter: t.group_letter,
    fifa_ranking_points: t.fifa_ranking_points,
    flag_url: t.flag_url,
  }))
}

/** Build a lookup: match_id → prediction */
export function buildPredictionLookup(predictions: EntryWithPredictions['predictions']): Map<string, EntryWithPredictions['predictions'][0]> {
  const map = new Map<string, EntryWithPredictions['predictions'][0]>()
  for (const p of predictions) {
    map.set(p.match_id, p)
  }
  return map
}
