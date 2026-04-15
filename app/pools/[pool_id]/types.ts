// Shared types for pool detail page and all tab components

export type PoolData = {
  pool_id: string
  pool_name: string
  pool_code: string
  description: string | null
  status: string
  is_private: boolean
  max_participants: number | null
  max_entries_per_user: number
  tournament_id: string
  prediction_deadline: string | null
  prediction_mode: 'full_tournament' | 'progressive' | 'bracket_picker'
  created_at: string
  updated_at: string
  // Entry fee configuration (NULL = free pool)
  entry_fee: number | null
  entry_fee_currency: string
  // Optional bar/partner branding (NULL for standard pools)
  brand_name: string | null
  brand_emoji: string | null
  brand_color: string | null
  brand_accent: string | null
  brand_landing_url: string | null
}

export type MemberData = {
  member_id: string
  pool_id: string
  user_id: string
  role: string
  joined_at: string
  entry_fee_paid: boolean
  users: {
    user_id: string
    username: string
    full_name: string
    email: string
  }
  entries?: EntryData[]
}

export type EntryData = {
  entry_id: string
  member_id: string
  entry_name: string
  entry_number: number
  has_submitted_predictions: boolean
  predictions_submitted_at: string | null
  predictions_locked: boolean
  auto_submitted: boolean
  predictions_last_saved_at: string | null
  total_points: number
  point_adjustment: number
  adjustment_reason: string | null
  current_rank: number | null
  previous_rank: number | null
  last_rank_update: string | null
  created_at: string
  // Stored scoring engine values
  match_points: number | null
  bonus_points: number | null
  scored_total_points: number | null
  // Per-entry fee tracking
  fee_paid: boolean
  fee_paid_at: string | null
}

// Flattened entry with user info for leaderboard display
export type LeaderboardEntry = EntryData & {
  users: {
    user_id: string
    username: string
    full_name: string
    email: string
  }
  role: string
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
  home_team: { country_name: string; country_code: string; flag_url: string | null } | null
  away_team: { country_name: string; country_code: string; flag_url: string | null } | null
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
  round_32_multiplier: number
  round_16_multiplier: number
  quarter_final_multiplier: number
  semi_final_multiplier: number
  third_place_multiplier: number
  final_multiplier: number
  pso_enabled: boolean
  pso_exact_score: number | null
  pso_correct_difference: number | null
  pso_correct_result: number | null
  // Bonus: Group Standings
  bonus_group_winner_and_runnerup: number | null
  bonus_group_winner_only: number | null
  bonus_group_runnerup_only: number | null
  bonus_both_qualify_swapped: number | null
  bonus_one_qualifies_wrong_position: number | null
  // Bonus: Overall Qualification
  bonus_all_16_qualified: number | null
  bonus_12_15_qualified: number | null
  bonus_8_11_qualified: number | null
  // Bonus: Bracket & Tournament
  bonus_correct_bracket_pairing: number | null
  bonus_match_winner_correct: number | null
  bonus_champion_correct: number | null
  bonus_second_place_correct: number | null
  bonus_third_place_correct: number | null
  bonus_best_player_correct: number | null
  bonus_top_scorer_correct: number | null
  // Bracket pairing mode
  bracket_pairing_mode: string | null
  // Bracket Picker scoring
  bp_group_correct_1st: number | null
  bp_group_correct_2nd: number | null
  bp_group_correct_3rd: number | null
  bp_group_correct_4th: number | null
  bp_third_correct_qualifier: number | null
  bp_third_correct_eliminated: number | null
  bp_third_all_correct_bonus: number | null
  bp_r32_correct: number | null
  bp_r16_correct: number | null
  bp_qf_correct: number | null
  bp_sf_correct: number | null
  bp_third_place_match_correct: number | null
  bp_final_correct: number | null
  bp_champion_bonus: number | null
  bp_penalty_correct: number | null
  created_at: string
  updated_at: string
}

export type PredictionData = {
  prediction_id: string
  entry_id: string
  match_id: string
  predicted_home_score: number
  predicted_away_score: number
  predicted_home_pso: number | null
  predicted_away_pso: number | null
  predicted_winner_team_id: string | null
}

export type TeamData = {
  team_id: string
  country_name: string
  country_code: string
  group_letter: string
  fifa_ranking_points: number
  flag_url: string | null
}

export type PlayerScoreData = {
  entry_id: string
  match_points: number
  bonus_points: number
  total_points: number
}

export type BonusScoreData = {
  bonus_id: string
  entry_id: string
  bonus_type: string
  bonus_category: string
  related_group_letter: string | null
  related_match_id: string | null
  points_earned: number
  description: string
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

// =====================
// PROGRESSIVE MODE TYPES
// =====================

export type RoundKey = 'group' | 'round_32' | 'round_16' | 'quarter_final' | 'semi_final' | 'third_place' | 'final'

export type RoundStateValue = 'locked' | 'open' | 'in_progress' | 'completed'

export type PoolRoundState = {
  id: string
  pool_id: string
  round_key: RoundKey
  state: RoundStateValue
  deadline: string | null
  opened_at: string | null
  closed_at: string | null
  completed_at: string | null
  opened_by: string | null
  created_at: string
  updated_at: string
}

export type EntryRoundSubmission = {
  id: string
  entry_id: string
  round_key: RoundKey
  has_submitted: boolean
  submitted_at: string | null
  auto_submitted: boolean
  prediction_count: number
  created_at: string
  updated_at: string
}

// ========================
// BRACKET PICKER MODE TYPES
// ========================

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

// ========================
// STORED MATCH SCORES (from scoring engine)
// ========================

export type MatchScoreData = {
  id: string
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
