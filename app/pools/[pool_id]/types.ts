// Shared types for pool detail page and all tab components

export type PoolData = {
  pool_id: string
  pool_name: string
  pool_code: string
  description: string | null
  status: string
  /** Join-ability, independent of `status` (migration 025). Null on pre-migration rows. */
  accepting_members: boolean | null
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
  brand_logo_url: string | null
  brand_slug: string | null
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
  // Live-state columns (populated by the api-football sync; selected via `*` in poolData).
  status_detail: string | null
  original_match_date: string | null
  live_minute: number | null
  live_period: string | null
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

// A single podium finisher (actual result OR an entry's prediction), trimmed to
// what the points-breakdown UI needs to render a flag + name.
export type PodiumTeam = {
  team_id: string
  country_name: string
  flag_url: string | null
}

// Champion / runner-up / third place. Used for both the ACTUAL tournament result
// (from tournament_awards) and an entry's PREDICTED podium (from the bracket).
export type PodiumResult = {
  champion: PodiumTeam | null
  runnerUp: PodiumTeam | null
  thirdPlace: PodiumTeam | null
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

/**
 * The subset of match_scores the POOL-WIDE payload carries.
 *
 * The wide MatchScoreData below has 22 columns and is 8,477 kB for a 192-entry
 * pool; these 8 are 3,698 kB. Only per-entry detail views (PointsBreakdownModal,
 * results/MatchCard) read the other 14, and they only ever look at ONE entry —
 * so those fetch on demand instead of every pool open paying for all of them.
 */
export type MatchScoreNarrow = {
  id: string
  entry_id: string
  match_id: string
  pool_id: string
  match_number: number
  stage: string
  score_type: 'exact' | 'winner_gd' | 'winner' | 'miss'
  total_points: number
}

/**
 * One entry's precomputed leaderboard stats, straight from `entry_xp_state`.
 *
 * These used to be derived in the BROWSER from every prediction and every match
 * score in the pool — 26,770 rows on the largest pool to produce these ~10
 * numbers per entry. The scoring path already computes and stores them
 * (lib/analytics/entryAnalytics.ts, called on every recalc), so the leaderboard
 * reads them instead. See drafts/2026-07-29_leaderboard_precomputed_handoff.md.
 *
 * `current_level` is the RATCHETED level (never below the entry's high-water
 * mark) — the raw level is deliberately not stored. See migration 026.
 */
export type EntryStatsData = {
  entry_id: string
  hit_rate: number
  exact_count: number
  total_completed: number
  contrarian_wins: number
  crowd_agreement_pct: number
  total_xp: number
  current_level: number
  /** High-water mark that floors the displayed level, so a corrected formula can
   *  raise someone's level but never demote them (migration 026). Surfaces that
   *  recompute XP live must pass this as `everReachedLevel` or they will show an
   *  unfloored level while the leaderboard and mobile show the floored one. */
  highest_level_reached: number
  /** Oldest → newest. Padded to 5 with 'no_pick' by the writer; the leaderboard
   *  strips the padding so an entry with 2 results still shows 2 dots. */
  last_five: ('exact' | 'winner_gd' | 'winner' | 'miss' | 'no_pick')[]
  current_streak: { type: 'hot' | 'cold' | 'none'; length: number }
}

/**
 * Per-match "how much of the pool called this right", counted in the database.
 *
 * Banter's desktop Matchday Pulse panel needs three of these. It used to derive
 * them by filtering the pool-wide predictions array — 13,385 rows to produce
 * three percentages. Migration 038 does the counting in SQL instead.
 */
export type MatchAccuracyData = {
  match_id: string
  total: number
  correct: number
}

/** Best single-match haul on the most recently completed match. Computed
 *  server-side (one match's score rows) rather than by scanning the pool-wide
 *  array in the browser. */
export type MatchdayMVPData = {
  entry_id: string
  match_points: number
  match_number: number
}

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
