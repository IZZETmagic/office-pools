// =============================================================
// SCORING ENGINE — SHARED TYPES
// =============================================================
// These types are the canonical definitions for the new scoring
// engine. All three mode calculators (full, progressive, bracket)
// and the recalculation orchestrator import from here.
// =============================================================

import type { PoolSettings } from '@/app/pools/[pool_id]/results/points'

// Re-export PoolSettings so calculators only need one import
export type { PoolSettings }

// ----- Match-level score (one row per entry × completed match) -----

export type MatchScoreRow = {
  entry_id: string
  match_id: string
  pool_id: string
  match_number: number
  stage: string
  score_type: 'exact' | 'winner_gd' | 'winner' | 'miss'
  base_points: number
  multiplier: number
  pso_points: number
  total_points: number
  teams_match: boolean
  predicted_home_score: number
  predicted_away_score: number
  actual_home_score: number
  actual_away_score: number
  predicted_home_pso: number | null
  predicted_away_pso: number | null
  actual_home_pso: number | null
  actual_away_pso: number | null
  predicted_home_team_id: string | null
  predicted_away_team_id: string | null
  calculated_at: string
}

// ----- Bonus score (one row per bonus earned) -----
// Re-uses the existing BonusScoreEntry shape from bonusCalculation.ts

export type BonusScoreRow = {
  entry_id: string
  bonus_type: string
  bonus_category: string
  related_group_letter: string | null
  related_match_id: string | null
  points_earned: number
  description: string
}

// ----- Entry totals (aggregated per entry) -----

export type EntryTotals = {
  entry_id: string
  match_points: number
  bonus_points: number
  point_adjustment: number
  total_points: number
  // Tiebreaker stats (computed by each mode calculator)
  exact_count: number
  correct_count: number  // exact + winner_gd + winner (i.e. non-miss)
}

// ----- Recalculation result returned by each mode calculator -----

export type ScoringResult = {
  matchScores: MatchScoreRow[]
  bonusScores: BonusScoreRow[]
  entryTotals: EntryTotals[]
}

// ----- Input data bundle passed to each mode calculator -----

export type ScoringInput = {
  poolId: string
  tournamentId: string
  predictionMode: 'full_tournament' | 'progressive' | 'bracket_picker'
  settings: PoolSettings
  matches: MatchWithResult[]
  teams: TeamData[]
  conductData: ConductData[]
  entries: EntryWithPredictions[]
  tournamentAwards: TournamentAwards | null
}

// ----- Supporting types (mirrors existing types, centralized here) -----

export type MatchWithResult = {
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
  is_completed: boolean
  home_score_ft: number | null
  away_score_ft: number | null
  home_score_pso: number | null
  away_score_pso: number | null
  winner_team_id: string | null
  tournament_id: string
}

export type TeamData = {
  team_id: string
  country_name: string
  country_code: string
  group_letter: string
  fifa_ranking_points: number
  flag_url?: string | null
}

export type ConductData = {
  match_id: string
  team_id: string
  yellow_cards: number
  indirect_red_cards: number
  direct_red_cards: number
  yellow_direct_red_cards: number
}

export type TournamentAwards = {
  champion_team_id: string | null
  runner_up_team_id: string | null
  third_place_team_id: string | null
  best_player: string | null
  top_scorer: string | null
}

export type EntryPrediction = {
  match_id: string
  predicted_home_score: number
  predicted_away_score: number
  predicted_home_pso: number | null
  predicted_away_pso: number | null
  predicted_winner_team_id: string | null
}

export type EntryWithPredictions = {
  entry_id: string
  member_id: string
  point_adjustment: number
  predictions: EntryPrediction[]
}

// ----- Bracket Picker specific types -----

export type BPGroupRanking = {
  id: string
  entry_id: string
  team_id: string
  group_letter: string
  predicted_position: number
}

export type BPThirdPlaceRanking = {
  id: string
  entry_id: string
  team_id: string
  group_letter: string
  rank: number
}

export type BPKnockoutPick = {
  id: string
  entry_id: string
  match_id: string
  match_number: number
  winner_team_id: string
  predicted_penalty: boolean
}

export type BPEntryWithPicks = {
  entry_id: string
  member_id: string
  point_adjustment: number
  groupRankings: BPGroupRanking[]
  thirdPlaceRankings: BPThirdPlaceRanking[]
  knockoutPicks: BPKnockoutPick[]
}
