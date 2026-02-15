// Shared types for pool detail page and all tab components

export type PoolData = {
  pool_id: string
  pool_name: string
  pool_code: string
  description: string | null
  status: string
  is_private: boolean
  max_participants: number | null
  tournament_id: string
  prediction_deadline: string | null
  created_at: string
  updated_at: string
}

export type MemberData = {
  member_id: string
  pool_id: string
  user_id: string
  role: string
  joined_at: string
  entry_fee_paid: boolean
  has_submitted_predictions: boolean
  predictions_submitted_at: string | null
  predictions_locked: boolean
  total_points: number
  current_rank: number | null
  last_rank_update: string | null
  users: {
    user_id: string
    username: string
    full_name: string
    email: string
  }
}

export type MatchData = {
  match_id: string
  tournament_id: string
  match_number: number
  stage: string
  group_letter: string | null
  home_team_id: string | null
  away_team_id: string | null
  home_team_placeholder: string | null
  away_team_placeholder: string | null
  match_date: string
  venue: string | null
  status: string
  home_score_ft: number | null
  away_score_ft: number | null
  home_score_pso: number | null
  away_score_pso: number | null
  winner_team_id: string | null
  is_completed: boolean
  completed_at: string | null
  home_team: { country_name: string } | null
  away_team: { country_name: string } | null
}

export type SettingsData = {
  setting_id: string
  pool_id: string
  group_exact_score: number
  group_correct_difference: number
  group_correct_result: number
  knockout_exact_score: number
  knockout_correct_difference: number
  knockout_correct_result: number
  round_16_multiplier: number
  quarter_final_multiplier: number
  semi_final_multiplier: number
  third_place_multiplier: number
  final_multiplier: number
  pso_enabled: boolean
  pso_exact_score: number | null
  pso_correct_difference: number | null
  pso_correct_result: number | null
  created_at: string
  updated_at: string
}

export type PredictionData = {
  prediction_id: string
  member_id: string
  match_id: string
  predicted_home_score: number
  predicted_away_score: number
  predicted_home_pso: number | null
  predicted_away_pso: number | null
}

export type TeamData = {
  team_id: string
  country_name: string
  country_code: string
  group_letter: string
  fifa_ranking_points: number
  flag_url: string | null
}

export type ExistingPrediction = {
  match_id: string
  predicted_home_score: number
  predicted_away_score: number
  predicted_home_pso: number | null
  predicted_away_pso: number | null
  predicted_winner_team_id: string | null
  prediction_id: string
}
