import { supabase } from './supabase';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!BASE_URL) {
  throw new Error('EXPO_PUBLIC_API_BASE_URL is not set in mobile/.env.local');
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
};

export async function apiFetch<T>(path: string, opts: Options = {}): Promise<T> {
  const { method = 'GET', body } = opts;
  const { data: sessionRes } = await supabase.auth.getSession();
  const accessToken = sessionRes.session?.access_token;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* no body or non-JSON */
  }

  if (!res.ok) {
    const errMessage =
      (json as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new Error(errMessage);
  }

  return json as T;
}

export type JoinPoolResponse = {
  member_id: string;
  pool_id: string;
  pool_name: string;
};

export function joinPool(poolCode: string) {
  return apiFetch<JoinPoolResponse>('/api/pools/join', {
    method: 'POST',
    body: { pool_code: poolCode.toUpperCase() },
  });
}

export type CreatePoolRequest = {
  pool_name: string;
  description: string | null;
  tournament_id: string;
  prediction_deadline: string;
  prediction_mode: 'full_tournament' | 'progressive' | 'bracket_picker';
  is_private: boolean;
  max_participants: number | null;
  max_entries_per_user: number;
};

export type CreatePoolResponse = {
  pool_id: string;
  pool_code: string;
  pool_name: string;
};

export function createPool(payload: CreatePoolRequest) {
  return apiFetch<CreatePoolResponse>('/api/pools/create', {
    method: 'POST',
    body: payload,
  });
}

export type LeaderboardEntry = {
  entry_id: string;
  entry_name: string;
  entry_number: number;
  member_id: string;
  user_id: string;
  full_name: string;
  username: string;
  match_points: number;
  bonus_points: number;
  point_adjustment: number;
  total_points: number;
  current_rank: number | null;
  previous_rank: number | null;
  has_submitted_predictions: boolean;
  last_five: Array<'exact' | 'winner_gd' | 'winner' | 'miss' | 'no_pick'>;
  current_streak: { type: 'hot' | 'cold' | 'none'; length: number };
  hit_rate: number;
  exact_count: number;
  level: number;
  level_name: string;
  total_xp: number;
  contrarian_wins: number;
  crowd_agreement_pct: number;
  total_completed: number;
};

export type PoolAward = {
  type: string;
  emoji: string;
  label: string;
  entry_id: string;
};

export type Superlative = {
  type: string;
  emoji: string;
  title: string;
  entry_id: string;
  name: string;
  detail: string;
};

export type MatchdayMvp = {
  entry_id: string;
  entry_name: string;
  full_name: string;
  match_points: number;
  match_number: number;
};

export type MatchdayInfo = {
  last_match_number: number | null;
  next_match_date: string | null;
  completed_count: number;
  total_count: number;
};

export type LeaderboardResponse = {
  pool_id: string;
  prediction_mode: string;
  entries: LeaderboardEntry[];
  awards: PoolAward[];
  superlatives: Superlative[];
  matchday_mvp: MatchdayMvp | null;
  matchday_info: MatchdayInfo;
};

export function fetchLeaderboard(poolId: string) {
  return apiFetch<LeaderboardResponse>(`/api/pools/${poolId}/leaderboard`);
}

export type LevelInfo = {
  level: number;
  name: string;
  xp_required: number;
  badge: string | null;
};

export type MatchXPItem = {
  match_number: number;
  stage: string;
  tier: string;
  base_xp: number;
  multiplier: number;
  multiplied_xp: number;
};

export type BonusXPEvent = {
  type: string;
  label: string;
  xp: number;
  match_number: number | null;
  detail: string | null;
};

export type BadgeInfo = {
  id: string;
  name: string;
  xp_bonus: number;
  condition: string;
  rarity: string;
  tier: string;
};

export type XPData = {
  total_xp: number;
  total_base_xp: number;
  total_bonus_xp: number;
  total_badge_xp: number;
  current_level: LevelInfo;
  next_level: LevelInfo | null;
  xp_to_next_level: number;
  level_progress: number;
  match_xp: MatchXPItem[];
  bonus_events: BonusXPEvent[];
  earned_badges: BadgeInfo[];
  all_badges: BadgeInfo[];
  levels: LevelInfo[];
};

export type OverallAccuracy = {
  total_matches: number;
  exact: number;
  winner_gd: number;
  winner: number;
  miss: number;
  hit_rate: number;
  exact_rate: number;
  total_points: number;
};

export type StageAccuracy = {
  stage: string;
  stage_label: string;
  total: number;
  exact: number;
  winner_gd: number;
  winner: number;
  miss: number;
  hit_rate: number;
};

export type AccuracyData = {
  overall: OverallAccuracy;
  by_stage: StageAccuracy[];
};

export type AnalyticsStreakInfo = { type: string; length: number };

export type StreakTimelineEntry = {
  match_number: number;
  type: string;
  is_correct: boolean;
};

export type AnalyticsStreakData = {
  current_streak: AnalyticsStreakInfo;
  longest_hot_streak: number;
  longest_cold_streak: number;
  timeline: StreakTimelineEntry[];
};

export type CrowdMatchItem = {
  match_number: number;
  stage: string;
  home_team: string;
  away_team: string;
  actual_score: string;
  home_win_pct: number;
  draw_pct: number;
  away_win_pct: number;
  is_contrarian: boolean;
  is_correct: boolean;
};

export type CrowdData = {
  total_matches: number;
  consensus_count: number;
  contrarian_count: number;
  contrarian_wins: number;
  matches: CrowdMatchItem[];
};

export type PredictableMatch = {
  match_number: number;
  home_team: string;
  away_team: string;
  actual_score: string;
  hit_rate: number;
};

export type PoolStatsData = {
  avg_accuracy: number;
  completed_matches: number;
  total_entries: number;
  most_predictable: PredictableMatch[];
  least_predictable: PredictableMatch[];
};

export type AnalyticsResponse = {
  xp: XPData;
  accuracy: AccuracyData;
  streaks: AnalyticsStreakData;
  crowd: CrowdData;
  pool_stats: PoolStatsData;
};

export function fetchEntryAnalytics(poolId: string, entryId: string) {
  return apiFetch<AnalyticsResponse>(`/api/pools/${poolId}/entries/${entryId}/analytics`);
}

// --- Activity feed -----------------------------------------------------

export type ActivityFeedItemRaw = {
  activity_id: string;
  pool_id: string | null;
  activity_type: string;
  title: string;
  body: string | null;
  icon: string;
  color_key: 'primary' | 'success' | 'warning' | 'error' | 'accent';
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
};

export type ActivityFeedResponse = {
  items: ActivityFeedItemRaw[];
};

export function fetchUserActivity(userId: string) {
  return apiFetch<ActivityFeedResponse>(`/api/users/${userId}/activity`);
}

// --- Notification preferences -----------------------------------------

export type NotificationPrefsResponse = {
  preferences: Record<string, boolean>;
};

export function fetchNotificationPrefs() {
  return apiFetch<NotificationPrefsResponse>('/api/notifications/preferences');
}

export function updateNotificationPref(topicKey: string, enabled: boolean) {
  return apiFetch<{ updated: boolean; topicKey: string; enabled: boolean }>(
    '/api/notifications/preferences',
    {
      method: 'PATCH',
      body: { topicKey, enabled },
    },
  );
}

// --- Push notification preferences ------------------------------------

export type PushPrefsResponse = {
  preferences: Record<string, boolean>;
};

export function fetchPushPrefs() {
  return apiFetch<PushPrefsResponse>('/api/notifications/push-preferences');
}

export function updatePushPref(category: string, enabled: boolean) {
  return apiFetch<{ updated: boolean; category: string; enabled: boolean }>(
    '/api/notifications/push-preferences',
    {
      method: 'PATCH',
      body: { category, enabled },
    },
  );
}

// --- Account deletion -------------------------------------------------

export function deleteAccount() {
  return apiFetch<{ ok?: boolean }>('/api/account/delete', { method: 'DELETE' });
}

// --- Push token registration ------------------------------------------

export function registerPushToken(params: {
  token: string;
  platform?: string;
  environment?: 'production' | 'development';
  bundle_id?: string;
}) {
  return apiFetch<{ success: boolean }>('/api/notifications/push-token', {
    method: 'POST',
    body: params,
  });
}

export function unregisterPushToken(token: string) {
  return apiFetch<{ success: boolean }>('/api/notifications/push-token', {
    method: 'DELETE',
    body: { token },
  });
}

export function recalculatePool(poolId: string) {
  return apiFetch<{ ok?: boolean }>(`/api/pools/${poolId}/recalculate`, { method: 'POST' });
}

/**
 * Tell the server an admin just removed `removedUserId` from `poolId`.
 * The endpoint sends both an email and a push notification to that user
 * (category ADMIN — bypasses opt-out). Mobile clients call this AFTER
 * the supabase `pool_members.delete()` succeeds so the notification is
 * a best-effort follow-up rather than a precondition for the removal.
 */
export function notifyMemberRemoved(poolId: string, removedUserId: string) {
  return apiFetch<{ sent: boolean }>('/api/notifications/member-removed', {
    method: 'POST',
    body: { pool_id: poolId, removed_user_id: removedUserId },
  });
}

export type RoundState = 'locked' | 'open' | 'in_progress' | 'completed';

export type PoolRound = {
  round_key: string;
  state: RoundState;
  deadline: string | null;
  match_count: number;
  completed_match_count: number;
  admin_stats?: { total_entries: number; submitted_entries: number } | null;
};

export type PoolRoundsResponse = {
  mode: string;
  rounds: PoolRound[];
};

export function fetchPoolRounds(poolId: string) {
  return apiFetch<PoolRoundsResponse>(`/api/pools/${poolId}/rounds`);
}

export type ChangeRoundStateAction = 'open' | 'close' | 'complete' | 'extend_deadline';

export function changeRoundState(
  poolId: string,
  roundKey: string,
  action: ChangeRoundStateAction,
  deadline?: string,
) {
  return apiFetch<{ success: boolean }>(
    `/api/pools/${poolId}/rounds/${roundKey}/state`,
    {
      method: 'POST',
      body: deadline ? { action, deadline } : { action },
    },
  );
}

export type SubmitRoundResponse = {
  success?: boolean;
  message?: string;
};

export function submitRoundPredictions(
  poolId: string,
  entryId: string,
  roundKey: string,
) {
  return apiFetch<SubmitRoundResponse>(`/api/pools/${poolId}/predictions/round`, {
    method: 'PUT',
    body: { entryId, roundKey },
  });
}

// ---- Match detail endpoints ----

export type MatchScoreEntry = {
  entry_id: string;
  predicted_home_team: string | null;
  predicted_away_team: string | null;
  teams_match: boolean;
  result_type: string;
  total_points: number;
};

export type MatchScoresResponse = {
  match_id: string;
  match_number: number;
  entries: MatchScoreEntry[];
};

export function fetchMatchScores(matchId: string, entryIds: string[]) {
  const qs = encodeURIComponent(entryIds.join(','));
  return apiFetch<MatchScoresResponse>(
    `/api/matches/${matchId}/scores?entry_ids=${qs}`,
  );
}

export type MatchStatsScoreEntry = {
  home: number;
  away: number;
  count: number;
  pct: number;
};

export type MatchStatsResponse = {
  match_id: string;
  match_number: number;
  total_predictions: number;
  home_win_pct: number;
  draw_pct: number;
  away_win_pct: number;
  most_popular_score: MatchStatsScoreEntry | null;
  top_scores: MatchStatsScoreEntry[];
  exact_correct_pct: number | null;
  result_correct_pct: number | null;
  home_team: string | null;
  away_team: string | null;
};

export function fetchMatchStats(matchId: string) {
  return apiFetch<MatchStatsResponse>(`/api/matches/${matchId}/stats`);
}

export type BracketGroupTeamStats = {
  team_id: string;
  team_name: string | null;
  flag_url: string | null;
  total_predictions: number;
  positions: { '1': number; '2': number; '3': number; '4': number };
  position_pcts: { '1': number; '2': number; '3': number; '4': number };
};

export type BracketStatsResponse = {
  match_id: string;
  match_number: number;
  group_letter: string | null;
  group_predictions: {
    home_team: BracketGroupTeamStats | null;
    away_team: BracketGroupTeamStats | null;
  } | null;
};

export function fetchBracketStats(matchId: string) {
  return apiFetch<BracketStatsResponse>(`/api/matches/${matchId}/bracket-stats`);
}

export type MentionNotificationResponse = { sent: boolean; count: number };

export function notifyMention(
  pool_id: string,
  message_content: string,
  mentioned_user_ids: string[],
) {
  return apiFetch<MentionNotificationResponse>('/api/notifications/mention', {
    method: 'POST',
    body: { pool_id, message_content, mentioned_user_ids },
  });
}

export type BreakdownMatchResult = {
  match_number: number;
  stage: string;
  home_team: string;
  away_team: string;
  home_flag_url: string | null;
  away_flag_url: string | null;
  actual_home: number;
  actual_away: number;
  predicted_home: number;
  predicted_away: number;
  actual_home_pso: number | null;
  actual_away_pso: number | null;
  predicted_home_pso: number | null;
  predicted_away_pso: number | null;
  predicted_home_team: string | null;
  predicted_away_team: string | null;
  teams_match: boolean;
  type: 'exact' | 'winner_gd' | 'winner' | 'miss';
  base_points: number;
  multiplier: number;
  pso_points: number;
  total_points: number;
};

export type BreakdownBonusEntry = {
  bonus_category: string;
  bonus_type: string;
  description: string;
  points_earned: number;
};

export type BreakdownPoolSettings = {
  // Score-prediction settings (always present)
  group_exact_score: number;
  group_correct_difference: number;
  group_correct_result: number;
  knockout_exact_score: number;
  knockout_correct_difference: number;
  knockout_correct_result: number;
  round_32_multiplier: number;
  round_16_multiplier: number;
  quarter_final_multiplier: number;
  semi_final_multiplier: number;
  third_place_multiplier: number;
  final_multiplier: number;
  pso_enabled: boolean;
  pso_exact_score: number | null;
  pso_correct_difference: number | null;
  pso_correct_result: number | null;
  // Bracket-picker settings (present once API exposes them; until then we
  // render defaults that match the web fallbacks).
  bp_group_correct_1st?: number;
  bp_group_correct_2nd?: number;
  bp_group_correct_3rd?: number;
  bp_group_correct_4th?: number;
  bp_third_correct_qualifier?: number;
  bp_third_correct_eliminated?: number;
  bp_third_all_correct_bonus?: number;
  bp_r32_correct?: number;
  bp_r16_correct?: number;
  bp_qf_correct?: number;
  bp_sf_correct?: number;
  bp_third_place_match_correct?: number;
  bp_final_correct?: number;
  bp_champion_bonus?: number;
  bp_penalty_correct?: number;
};

export type BreakdownResponse = {
  entry: {
    entry_id: string;
    entry_name: string;
    current_rank: number | null;
    point_adjustment: number;
    adjustment_reason: string | null;
  };
  user: {
    full_name: string;
    username: string;
  };
  summary: {
    match_points: number;
    bonus_points: number;
    point_adjustment: number;
    total_points: number;
  };
  match_results: BreakdownMatchResult[];
  bonus_entries: BreakdownBonusEntry[];
  pool_settings: BreakdownPoolSettings;
  prediction_mode: string;
};

export function fetchBreakdown(poolId: string, entryId: string) {
  return apiFetch<BreakdownResponse>(
    `/api/pools/${poolId}/entries/${entryId}/breakdown`,
  );
}

// ============================================================
// Bracket Picker mode
// ============================================================

export type BPGroupRanking = {
  team_id: string;
  group_letter: string;
  predicted_position: number; // 1..4
};

export type BPThirdPlaceRanking = {
  team_id: string;
  group_letter: string;
  rank: number; // 1..12
};

export type BPKnockoutPick = {
  match_id: string;
  match_number: number;
  winner_team_id: string;
  predicted_penalty: boolean;
};

export type BracketPicksResponse = {
  groupRankings: BPGroupRanking[];
  thirdPlaceRankings: BPThirdPlaceRanking[];
  knockoutPicks: BPKnockoutPick[];
};

export function fetchBracketPicks(poolId: string, entryId: string) {
  return apiFetch<BracketPicksResponse>(
    `/api/pools/${poolId}/bracket-picks?entry_id=${entryId}`,
  );
}

export type SaveBracketPicksPayload = {
  entry_id: string;
  group_rankings: BPGroupRanking[];
  third_place_rankings: BPThirdPlaceRanking[];
  knockout_picks: BPKnockoutPick[];
};

export type SaveBracketPicksResponse = {
  saved: boolean;
  lastSaved: string;
};

export function saveBracketPicks(poolId: string, payload: SaveBracketPicksPayload) {
  return apiFetch<SaveBracketPicksResponse>(`/api/pools/${poolId}/bracket-picks`, {
    method: 'POST',
    body: payload,
  });
}

export function submitBracketPicks(poolId: string, entryId: string) {
  return apiFetch<{ submitted: boolean }>(`/api/pools/${poolId}/bracket-picks`, {
    method: 'PUT',
    body: { entry_id: entryId },
  });
}

// ============================================================
// Bracket Picker — analytics (Form tab)
// ============================================================

export type BPBonusEvent = {
  type: string;
  label: string;
  emoji: string;
  xp: number;
  detail: string | null;
};

export type BPGroupPositionXP = {
  team_id: string;
  predicted_position: number;
  actual_position: number | null;
  correct: boolean;
  xp: number;
};

export type BPGroupXPSummary = {
  group_letter: string;
  positions: BPGroupPositionXP[];
  qualifiers_correct: boolean;
  qualifiers_bonus_xp: number;
  perfect_order: boolean;
  perfect_order_bonus_xp: number;
  total_group_xp: number;
};

export type BPThirdPlaceXPItem = {
  team_id: string;
  group_letter: string;
  predicted_qualifies: boolean;
  actually_qualifies: boolean;
  correct: boolean;
  xp: number;
};

export type BPKnockoutXPItem = {
  match_id: string;
  match_number: number;
  stage: string;
  predicted_winner: string;
  actual_winner: string | null;
  correct: boolean;
  xp: number;
};

export type BPXPData = {
  total_xp: number;
  total_group_base_xp: number;
  total_group_bonus_xp: number;
  total_third_place_xp: number;
  total_knockout_base_xp: number;
  total_knockout_bonus_xp: number;
  total_badge_xp: number;
  current_level: LevelInfo;
  next_level: LevelInfo | null;
  xp_to_next_level: number;
  level_progress: number;
  bonus_events: BPBonusEvent[];
  earned_badges: BadgeInfo[];
  all_badges: BadgeInfo[];
  levels: LevelInfo[];
  group_xp: BPGroupXPSummary[];
  third_place_xp: BPThirdPlaceXPItem[];
  third_place_perfect_bonus_xp: number;
  knockout_xp: BPKnockoutXPItem[];
};

export type BPMostPopularChampion = {
  team_id: string;
  count: number;
  pct: number;
};

export type BPPoolComparisonData = {
  user_overall_accuracy: number;
  pool_avg_overall_accuracy: number;
  user_group_correct: number;
  user_group_total: number;
  pool_avg_group_correct: number;
  user_knockout_correct: number;
  user_knockout_total: number;
  pool_avg_knockout_correct: number;
  user_third_correct: number;
  user_third_total: number;
  pool_avg_third_correct: number;
  consensus_count: number;
  contrarian_count: number;
  contrarian_wins: number;
  pool_avg_consensus: number;
  pool_avg_contrarian: number;
  pool_avg_contrarian_wins: number;
  total_entries: number;
  total_scored_picks: number;
  most_popular_champion: BPMostPopularChampion | null;
};

export type BPAnalyticsResponse = {
  xp: BPXPData;
  pool_comparison: BPPoolComparisonData | null;
};

export function fetchBracketAnalytics(poolId: string, entryId: string) {
  return apiFetch<BPAnalyticsResponse>(
    `/api/pools/${poolId}/entries/${entryId}/bracket-analytics`,
  );
}
