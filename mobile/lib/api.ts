import type { LeagueDepth, LeagueMode, PredictionMode } from './predictionMode';
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

/**
 * The body of `POST /api/pools/create`.
 *
 * ⚠ Built by `buildCreatePayload` in `lib/createPool.ts`, never by hand — the
 * rules about which of these may be present together are recorded there and in
 * the route, and a hand-assembled body is how they drift.
 */
export type CreatePoolRequest = {
  pool_name: string;
  description: string | null;
  tournament_id: string;
  /**
   * Present only for a league pool. The route resolves the placeholder
   * `tournaments` row from it SERVER-SIDE and forces the mode, so a crafted
   * request cannot pair a season with the wrong competition.
   */
  league_season_id: string | null;
  prediction_deadline: string;
  /**
   * ⚠ EVERY league pool is `league_pickem`, whatever its `league_mode`. That is
   * the column all the league plumbing keys on; `league_mode` below is the
   * separate axis deciding how it is played.
   */
  prediction_mode: PredictionMode;
  /** Level 1 (Decision 9). Null for a bracket pool. Immutable once written. */
  league_mode: LeagueMode | null;
  /**
   * Level 2, and only for the two modes with weekly picks — the database CHECK
   * refuses the pairing for Table and Last Man Standing.
   */
  league_depth: LeagueDepth | null;
  is_private: boolean;
  /**
   * ⚠ ALWAYS 0, and there is no control behind it. Migration 075 records that
   * `pools.max_participants` is "stored, displayed and editable but enforced
   * NOWHERE". The route turns 0 into NULL; the real ceiling is the tier one,
   * enforced by a BEFORE INSERT trigger so no client can miss it.
   */
  max_participants: number;
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

// --- Viewing another member's predictions (post-lock, read-only) ------------
// Backed by GET /api/pools/:poolId/entries/:entryId/predictions, which enforces
// the reveal gate server-side. For a still-locked entry the route returns 403,
// which apiFetch surfaces as a thrown Error with the server's message.
export type EntryPredictionsView = {
  entry: { entry_id: string; entry_name: string; entry_number: number; member_id: string };
  owner: { user_id: string; full_name: string; username: string };
  prediction_mode: 'full_tournament' | 'progressive' | 'bracket_picker';
  is_own_entry: boolean;
  reveal: { revealed: boolean; scope?: 'all' | 'rounds'; roundKeys?: string[] };
  predictions?: {
    prediction_id: string;
    match_id: string;
    predicted_home_score: number | null;
    predicted_away_score: number | null;
    predicted_home_pso: number | null;
    predicted_away_pso: number | null;
    predicted_winner_team_id: string | null;
  }[];
  bracketPicks?: {
    groupRankings: BPGroupRanking[];
    thirdPlaceRankings: BPThirdPlaceRanking[];
    knockoutPicks: BPKnockoutPick[];
  };
};

export function fetchEntryPredictionsView(poolId: string, entryId: string) {
  return apiFetch<EntryPredictionsView>(
    `/api/pools/${poolId}/entries/${entryId}/predictions`,
  );
}

/** Who a row belongs to and what it scored — true of every pool type. */
export type LeaderboardEntryCore = {
  entry_id: string;
  entry_name: string;
  entry_number: number;
  member_id: string;
  user_id: string;
  full_name: string;
  username: string;
  total_points: number;
  current_rank: number | null;
  previous_rank: number | null;
};

/**
 * A league row. The World Cup extras below are ABSENT, not zero — nothing in the
 * league engine writes hit rate, XP or a base/bonus split, and a zero on screen
 * is a claim rather than a blank. Keeping them off the type is what makes a
 * component that reaches for one fail to compile.
 *
 * ⚠ Form and exact counts are the exception and they live inside `pickem`, not
 * on the row. They are real in exactly one mode; promoting them would hand Table
 * and Last Man Standing a zero apiece, which is the thing this shape prevents.
 */
export type LeagueLeaderboardEntry = LeaderboardEntryCore & {
  /** Table mode: did they file an ordering before the deadline? */
  has_filed: boolean;
  /** Table mode: who they backed to win it, and where that club sits today. */
  champion: {
    club_name: string;
    crest_url: string | null;
    actual_rank: number | null;
  } | null;
  /**
   * Last Man Standing only; null in every other mode.
   *
   * ⚠ In this mode `current_rank` and `previous_rank` arrive NULL on purpose.
   * The stored rank is entry_id order there — every rung of the shared cascade
   * is zero, so it decides nothing — and the server withholds it rather than
   * hand over a wrong answer that looks like a right one. Read this instead.
   */
  lms: {
    /** NULL means still standing. Otherwise the matchweek that knocked them out. */
    eliminated_matchweek: number | null;
    /** Took this round. Only true once the round has closed. */
    is_round_winner: boolean;
    /**
     * FALSE for someone not in this round at all — they joined after it opened
     * and enter the next one. ⚠ NOT the same as being eliminated.
     */
    in_round: boolean;
    /** Rounds taken this season, and the only memory a closed round leaves. */
    rounds_won: number;
    /** The club they are backing in `LeagueLeaderboardMeta.lms.pick_matchweek`. */
    pick: { club_name: string; crest_url: string | null } | null;
    /**
     * ⚠ Their club is hidden from you because the matchweek has not locked —
     * migration 086, so the pool cannot copy the best player. NOT the same as
     * having no pick, and the screen must not render it as one.
     */
    pick_sealed: boolean;
  } | null;
  /**
   * Pick'em only; null in every other mode. The one league mode scored against
   * individual fixtures every week, so the one with a weekly record to plot.
   */
  pickem: {
    /** Fixtures called right. Real at BOTH depths. */
    correct_count: number;
    /**
     * ⚠ NULL AT RESULTS DEPTH — the mode has no scoreline to be exact about, so
     * the engine writes only `winner` or `miss` there. Render the null as
     * nothing, never as "0 exact": that accuses somebody of failing at
     * something the game never asked them to do.
     */
    exact_count: number | null;
    /**
     * The last five settled fixtures, OLDEST FIRST — the same vocabulary
     * `FormDots` already renders. Shorter than five early in a season, and
     * deliberately not padded.
     *
     * ⚠ At Results depth only `winner` and `miss` can occur, so the legend above
     * the list must shrink to match — see `LeagueLeaderboardMeta.depth`.
     */
    last_five: Array<'exact' | 'winner_gd' | 'winner' | 'miss' | 'no_pick'>;
  } | null;
};

/** Present only for a league pool; `null` means render the World Cup shape. */
export type LeagueLeaderboardMeta = {
  mode: 'pickem' | 'showdown' | 'last_man_standing' | 'table' | null;
  /**
   * How the pool is scored. Non-null for Pick'em and Showdown, NULL for Table
   * and Last Man Standing.
   *
   * ⚠ READ IT AS `depth === 'results'` AND NOTHING ELSE. A NULL depth is scored
   * as Scores, byte for byte — the opposite reading has shipped three times on
   * web and was called a deploy blocker, because it does not fail: members get
   * told they are playing one game while being scored at the other. Guarded by
   * `lib/__tests__/leagueDepthPolarity.guard.test.ts`, which walks `mobile/` too.
   */
  depth: 'results' | 'scores' | null;
  /** False until the season-end snapshot exists — every total is provisional. */
  is_final: boolean;
  /**
   * The round every row's `lms` block describes. Null in every other mode, and
   * null in an LMS pool whose first round has not opened yet.
   */
  lms: {
    round_number: number;
    first_matchweek: number;
    /** NULL while the round is still running. */
    last_matchweek: number | null;
    standing: number;
    /** Everybody in the round — NOT the member count, which can be higher. */
    in_round: number;
    /**
     * The matchweek every row's `pick` is for — the one being PLAYED if there is
     * one, otherwise the one still open. Null when the season has run out.
     */
    pick_matchweek: number | null;
    /** True when that week is being played rather than waiting to be picked. */
    pick_in_play: boolean;
    /** True once that week has locked, which is when every club becomes public. */
    pick_revealed: boolean;
  } | null;
};

export type LeaderboardEntry = LeaderboardEntryCore & {
  match_points: number;
  bonus_points: number;
  point_adjustment: number;
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
  /**
   * Non-null for a league pool, and the signal that `entries` carries
   * `LeagueLeaderboardEntry` rows instead. The route guarantees the pairing;
   * `usePoolDetail` is the one place that narrows on it.
   */
  league: LeagueLeaderboardMeta | null;
  entries: LeaderboardEntry[] | LeagueLeaderboardEntry[];
  awards: PoolAward[];
  superlatives: Superlative[];
  matchday_mvp: MatchdayMvp | null;
  matchday_info: MatchdayInfo;
};

export function fetchLeaderboard(poolId: string) {
  return apiFetch<LeaderboardResponse>(`/api/pools/${poolId}/leaderboard`);
}

// ---------------------------------------------------------------------------
// Table mode — one prediction, then a season of watching it
// ---------------------------------------------------------------------------

/** One club in the entry's ordering, priced against where it actually sits. */
export type TableBreakdownRow = {
  club_id: string;
  club_name: string;
  crest_url: string | null;
  predicted_position: number;
  /** NULL until the club has a standings row — i.e. before a ball is kicked. */
  actual_position: number | null;
  delta: number | null;
  points: number | null;
  champion_hit: boolean;
  top_hit: boolean;
  releg_hit: boolean;
  europa_hit: boolean;
  conference_hit: boolean;
  is_final: boolean;
};

/**
 * The pool's own prices and bands.
 *
 * ⚠ Band bounds, not counts, and null is a real answer — a competition without
 * Europa places must not shade a band it does not have.
 */
export type TableSettings = {
  /** The competition this pool plays, for linking to its table. */
  seasonId: string;
  /**
   * The per-place rungs a Scoring screen prints, computed server-side.
   * ⚠ Not derived here: `placeLadder` lives in the web's `lib/`, which this
   * project cannot import, and two screens quoting different ladders for one
   * pool is the drift that shaping exists to prevent.
   */
  ladder: Array<{ label: string; value: number }>;
  lockAt: string | null;
  isLocked: boolean;
  topN: number;
  relegationN: number;
  europaFrom: number | null;
  europaTo: number | null;
  conferenceFrom: number | null;
  conferenceTo: number | null;
  /** 'headline_only' scores the bands alone — no per-place points at all. */
  profile: 'full_table' | 'headline_only';
  prices: {
    exactPoints: number;
    stepPenalty: number;
    championBonus: number;
    topFourBonus: number;
    relegationBonus: number;
    perfectTopFourBonus: number;
    europaBonus: number;
    conferenceBonus: number;
  };
};

/**
 * ⚠ COMPUTED SERVER-SIDE, deliberately. The band-bonus formula mirrors
 * `league_score_table`, and a copy in `mobile/` would be its third — see
 * `lib/league/tableSummary.ts`. This screen renders these numbers; it does not
 * derive them.
 */
export type TableSummary = {
  positional: number;
  lines: Array<{ label: string; points: number }>;
  bonusTotal: number;
  total: number;
  exact: number;
  isFinal: boolean;
  /** The distance at which a club stops being worth anything. */
  zeroAt: number;
};

/** A club in the competition, for the picker. */
export type SeasonClub = {
  club_id: string;
  club_name: string;
  crest_url: string | null;
  short_name: string | null;
};

export type TablePredictionResponse = {
  entryId: string;
  /** club_ids in predicted finishing order. Empty means they never filed. */
  order: string[];
  savedAt: string | null;
  breakdown: TableBreakdownRow[];
  settings: TableSettings;
  summary: TableSummary;
  /** Every club in the competition — the picker's raw material. */
  clubs: SeasonClub[];
  /**
   * What an unfiled table starts from: alphabetical, so it cannot be mistaken
   * for a suggestion. Decision 12 as revised by 17.
   */
  seededOrder: string[];
};

/**
 * Save an ordering.
 *
 * ⚠ THE LOCK IS A SILENT-SKIP TRIGGER. `enforce_league_table_before_lock`
 * RETURN NULLs rather than raising, which is the house pattern for every
 * prediction lock in this codebase — so a write after the deadline "succeeds"
 * having stored nothing. The route turns that into a 403 with a readable
 * message, and an ignored rejection is how a member ends up looking at twenty
 * clubs the database does not have.
 */
export function saveTablePrediction(poolId: string, entryId: string, order: string[]) {
  return apiFetch<{ stored: number; savedAt: string | null }>(
    `/api/pools/${poolId}/table-prediction`,
    { method: 'POST', body: { entryId, order } },
  );
}

/**
 * Table mode's deadline, and who has filed against it.
 *
 * ⚠ `missingEntryIds` carries IDS ONLY, never orderings — migration 104 closed
 * the admin read on `league_table_predictions` so that an admin who also plays
 * cannot see rivals' tables before the reveal. "Who is missing" is answerable
 * without "what did they put".
 */
export type TableDeadlineStatus = {
  lockAt: string | null;
  /** Passed IS revealed since migration 110 — there is no separate flag. */
  hasPassed: boolean;
  total: number;
  filed: number;
  missingEntryIds: string[];
};

export function fetchTableDeadline(poolId: string) {
  return apiFetch<TableDeadlineStatus>(`/api/pools/${poolId}/table-deadline`);
}

export type TableDeadlineMoveResult = {
  lockAt: string;
  /** The deadline had already passed — "your table is open again", not "moved". */
  wasReopened: boolean;
  /** False when the move landed but the pool could not be told. */
  announced: boolean;
  error?: string;
};

/**
 * Move it. ⚠ THROUGH THE ROUTE, NEVER A DIRECT `pools` UPDATE.
 *
 * The route awaits the announcement rather than firing and forgetting it — a
 * deadline that moves in silence is the unfair version of an extension, because
 * the members who filed on time are the only ones who never learn they may
 * revise. It also knows whether this REOPENS a passed deadline, which the client
 * cannot know for certain after the write.
 *
 * The rules themselves live in a database trigger, so its refusals ("a table
 * deadline cannot be set in the past") arrive as readable sentences and are
 * shown to the admin unchanged.
 */
export function updateTableDeadline(poolId: string, deadline: Date) {
  return apiFetch<TableDeadlineMoveResult>(`/api/pools/${poolId}/table-deadline`, {
    method: 'PATCH',
    body: { deadline: deadline.toISOString() },
  });
}

export function fetchTablePrediction(poolId: string, entryId?: string) {
  const q = entryId ? `?entryId=${encodeURIComponent(entryId)}` : '';
  return apiFetch<TablePredictionResponse>(`/api/pools/${poolId}/table-prediction${q}`);
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

/**
 * Self-leave: the authenticated user removes themselves from `poolId`.
 * Funnels through the server endpoint (rather than a direct supabase
 * delete) so the audit row in pool_membership_events lands before the
 * pool_members row is gone — that audit row drives the "Left <pool>"
 * card on the user's activity feed afterwards. Server-side checks reject
 * the request if the leaver is the sole admin of the pool.
 */
export function leavePool(poolId: string) {
  return apiFetch<{ left: boolean }>(`/api/pools/${poolId}/leave`, {
    method: 'POST',
  });
}

/**
 * Delete a single pool entry the caller owns. Server enforces the
 * non-admin-must-keep-one-entry rule: admins can delete all of theirs
 * (matches Stop Participating semantics); non-admins get a 400 if the
 * entry being deleted is their only one. Routed server-side for the
 * same RLS-on-cascade reason Stop Participating uses — the protected
 * score-table children would block a client-initiated cascade.
 */
export function deleteEntry(poolId: string, entryId: string) {
  return apiFetch<{ deleted: boolean }>(
    `/api/pools/${poolId}/entries/${entryId}/delete`,
    { method: 'POST' },
  );
}

/**
 * Admin "Stop Participating": delete the caller's pool_entries for
 * `poolId` while keeping their pool_members row (admin role intact).
 * Must funnel through the server because pool_entries' cascade chain
 * includes three RLS-protected score tables (bonus_scores, match_scores,
 * player_scores) that lack user-facing DELETE policies — a direct
 * supabase.delete from the client gets rolled back by those RLS rejects.
 * The endpoint uses the admin client to bypass RLS, mirroring the
 * /leave and /api/notifications/member-removed pattern.
 */
export function stopParticipating(poolId: string) {
  return apiFetch<{ removed_entries: number }>(
    `/api/pools/${poolId}/stop-participating`,
    { method: 'POST' },
  );
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

// Generic banter push — fans out to every pool member except the
// sender. Called on every successful sendMessage; the @mention path
// uses `notifyMention` above for the targeted variant (different copy
// + only pings tagged users). The Swift app fires both pre-existing
// endpoints; this matches that behavior so the Expo build reaches
// parity with mobile-push backlog item `project_backlog_mobile_push.md`.
export type MessageNotificationResponse = { sent: boolean; count: number };

export function notifyMessage(
  pool_id: string,
  message_content: string,
  sender_name?: string,
) {
  return apiFetch<MessageNotificationResponse>('/api/notifications/message', {
    method: 'POST',
    body: { pool_id, message_content, sender_name },
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
  // knockout_* is gone: migration 042 retired those columns from scoring, and
  // the breakdown screen no longer renders them. They still exist in the table
  // until they are dropped, so the API may still send them — nothing reads
  // them, and the type no longer invites anything to.
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
  // Tournament podium bonus values (0 = disabled for that position).
  bonus_champion_correct?: number;
  bonus_second_place_correct?: number;
  bonus_third_place_correct?: number;
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
  actual_podium: BreakdownPodium | null;
  predicted_podium: BreakdownPodium | null;
};

export type BreakdownPodiumTeam = {
  team_id: string;
  country_name: string;
  flag_url: string | null;
};

export type BreakdownPodium = {
  champion: BreakdownPodiumTeam | null;
  runnerUp: BreakdownPodiumTeam | null;
  thirdPlace: BreakdownPodiumTeam | null;
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

// --- home screen scoring -----------------------------------------------------
// Per-entry form / accuracy / streak, derived server-side.
//
// This cannot be read from PostgREST directly: the shadow scoring tables are
// RLS deny-all, so a user-scoped client sees nothing in them, and the
// shadow-vs-prod resolution lives in server-side TypeScript the app never runs.
// Asking the API for the answer keeps one source of truth instead of a second
// copy of the rules in the client.
export type EntryScoringSummary = {
  entry_id: string;
  /** Newest-last, at most 5 — the form indicator dots. */
  form: Array<'exact' | 'winner_gd' | 'winner' | 'miss'>;
  total_completed: number;
  exact_count: number;
  correct_count: number;
  /** Consecutive point-scoring matches counting back from the most recent. */
  streak: number;
  /** Same source as the pool's own leaderboard. */
  match_points: number;
  bonus_points: number;
  point_adjustment: number;
  /** ⚠ The PICKING half in Showdown — add `duel_points` for the season total. */
  scored_total_points: number;
  /**
   * Showdown's second currency (migration 121), 0 in every other mode.
   *
   * ⚠ OPTIONAL FOR A STALE API, not because it can be missing in principle. An
   * app running against an API deployed before this field existed gets
   * undefined, and `?? 0` then reproduces the old picks-only number rather than
   * crashing. Once the API is deployed it is always present.
   */
  duel_points?: number;
  current_rank: number | null;
  /**
   * STORED XP level from `entry_xp_state` — resolved server-side, never here.
   * NULL for a league entry: XP is World Cup machinery, so a league pool has no
   * row and the web card deliberately shows the matchweek instead of a level.
   */
  current_level: number | null;
  level_name: string | null;
};

/**
 * The per-pool facts the home card cannot work out for itself.
 *
 * ⚠ `null` FOR THE WHOLE MAP MEANS THE SERVER DID NOT SAY, which is not the
 * same as "nothing has scored" or "no picks". An API deployed before this
 * existed returns no `pools` key, and treating that as zeros would blank a rank
 * and a ring that both work today. The caller falls back to its own local
 * counts when this is null.
 */
export type HomePoolFacts = {
  /** Has ANYONE in this pool scored — the gate the rank sits behind. */
  hasScoringStarted: boolean;
  /**
   * Picks in the CURRENT decision, not the season: the open matchweek for
   * Pick'em and Showdown, and 1 for Table and Last Man Standing.
   *
   * ⚠ NULL on a World Cup pool, and null is not zero. Those are still counted
   * on the phone from `predictions` against `matches`, which is correct — so a
   * null here means "use your own numbers", not "there is nothing to pick".
   */
  totalPicks: number | null;
  madePicks: number | null;
  hasSubmitted: boolean | null;
  /** Table and Last Man Standing: one decision, so the ring is a state. */
  isSingleDecision: boolean | null;
  /**
   * The mode's own numbers, for the card's stat strip.
   *
   * ⚠ NULL ON A WORLD CUP POOL, which is what keeps its five blocks — Rank,
   * Points, Level, Form, Picks — exactly as they were. A league pool gets the
   * blocks its engine actually writes instead; see `poolCardBlocks`.
   *
   * ⚠ NULL IS ALSO "the API is older than this field". The card falls back to
   * the World Cup shape rather than blanking, which is the same rule the
   * pick counts above already follow.
   */
  league: HomeLeagueFacts | null;
};

/** Only what a stat block prints. See the note on `league` in the route. */
export type HomeLeagueFacts = {
  leagueMode: string | null;
  openMatchweek: number | null;
  matchweekCount: number | null;
  showdown: {
    duelPoints: number;
    won: number;
    tied: number;
    lost: number;
    /** won | tied | lost | bye — NOT the accuracy tiers. Different palette. */
    recentDuels: string[];
  } | null;
  lms: {
    roundsWon: number;
    roundNumber: number | null;
    clubsUsed: number;
    clubPool: number;
    survivorsLeft: number;
    roundEntrants: number;
    isEliminated: boolean;
  } | null;
  table: {
    spotOn: number;
    clubCount: number;
    averageOff: number | null;
    hasTable: boolean;
    isFinal: boolean;
  } | null;
};

export type HomeScoringPools = Record<string, HomePoolFacts> | null;

export type HomeScoring = {
  entries: EntryScoringSummary[];
  pools: HomeScoringPools;
};

export async function fetchHomeScoring(userId: string): Promise<HomeScoring> {
  const res = await apiFetch<{
    entries: EntryScoringSummary[];
    pools?: {
      pool_id: string;
      has_scoring_started: boolean;
      total_picks: number | null;
      made_picks: number | null;
      has_submitted: boolean | null;
      is_single_decision: boolean | null;
      league?: {
        league_mode: string | null;
        open_matchweek: number | null;
        matchweek_count: number | null;
        showdown: { duel_points: number; won: number; tied: number; lost: number; recent_duels: string[] } | null;
        lms: {
          rounds_won: number; round_number: number | null; clubs_used: number; club_pool: number;
          survivors_left: number; round_entrants: number; is_eliminated: boolean;
        } | null;
        table: { spot_on: number; club_count: number; average_off: number | null; has_table: boolean; is_final: boolean } | null;
      } | null;
    }[];
  }>(`/api/users/${userId}/home-scoring`);

  const pools: HomeScoringPools = res.pools
    ? Object.fromEntries(
        res.pools.map((p) => [
          p.pool_id,
          {
            hasScoringStarted: p.has_scoring_started,
            totalPicks: p.total_picks ?? null,
            madePicks: p.made_picks ?? null,
            hasSubmitted: p.has_submitted ?? null,
            isSingleDecision: p.is_single_decision ?? null,
            league: p.league
              ? {
                  leagueMode: p.league.league_mode,
                  openMatchweek: p.league.open_matchweek,
                  matchweekCount: p.league.matchweek_count,
                  showdown: p.league.showdown
                    ? {
                        duelPoints: p.league.showdown.duel_points,
                        won: p.league.showdown.won,
                        tied: p.league.showdown.tied,
                        lost: p.league.showdown.lost,
                        recentDuels: p.league.showdown.recent_duels ?? [],
                      }
                    : null,
                  lms: p.league.lms
                    ? {
                        roundsWon: p.league.lms.rounds_won,
                        roundNumber: p.league.lms.round_number,
                        clubsUsed: p.league.lms.clubs_used,
                        clubPool: p.league.lms.club_pool,
                        survivorsLeft: p.league.lms.survivors_left,
                        roundEntrants: p.league.lms.round_entrants,
                        isEliminated: p.league.lms.is_eliminated,
                      }
                    : null,
                  table: p.league.table
                    ? {
                        spotOn: p.league.table.spot_on,
                        clubCount: p.league.table.club_count,
                        averageOff: p.league.table.average_off,
                        hasTable: p.league.table.has_table,
                        isFinal: p.league.table.is_final,
                      }
                    : null,
                }
              : null,
          },
        ]),
      )
    : null;

  return { entries: res.entries ?? [], pools };
}

// ---------------------------------------------------------------------------
// Pool archive / restore (migration 040)
//
// "Delete Pool" was removed from both surfaces (decision 2026-07-25): it
// destroyed every member's predictions irreversibly on one tap. Archiving is
// reversible and destroys nothing.
//
// These go through the API rather than writing `pools` directly from the app,
// because the route also records the audit row and tells every member — and an
// archive must never land silently, since it changes other people's trophy
// counts. Writing the column straight from here would skip all of that.
// ---------------------------------------------------------------------------

export type ArchivePoolResponse = {
  archived_at: string
  archived_by: string | null
  notified?: number
  already?: boolean
};

export function archivePool(poolId: string) {
  return apiFetch<ArchivePoolResponse>(`/api/pools/${poolId}/archive`, { method: 'POST' });
}

export type RestorePoolResponse = {
  archived_at: null
  notified?: number
  already?: boolean
};

/** Admin-only, same as archiving (Ryan's call 2026-07-30). */
export function restorePool(poolId: string) {
  return apiFetch<RestorePoolResponse>(`/api/pools/${poolId}/restore`, { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Last Man Standing — one club a matchweek, to win
// ---------------------------------------------------------------------------

/** One cell of the picks wall. Absent entirely when the caller may not see it. */
export type LmsPickCell = {
  entry_id: string;
  matchweek_number: number;
  club_id: string;
  club_name: string;
  crest_url: string | null;
  /** NULL until the matchweek settles. */
  result: 'survived' | 'eliminated' | null;
};

export type LmsMember = {
  entry_id: string;
  user_id: string | null;
  display_name: string;
  username: string;
  /** NULL means still standing. */
  eliminated_matchweek: number | null;
  /** ⚠ FALSE means they joined after the round opened — NOT that they are out. */
  in_round: boolean;
  is_round_winner: boolean;
  rounds_won: number;
};

export type LmsClub = {
  club_id: string;
  club_name: string;
  crest_url: string | null;
  /** The matchweek you already spent this club in. One club per round. */
  used_in_matchweek: number | null;
};

export type LmsFixture = {
  club_id: string;
  opponent_name: string;
  opponent_crest: string | null;
  /** True when the club in question is at home — "v" rather than "at". */
  is_home: boolean;
  kickoff_at: string;
};

/**
 * Everything both Last Man Standing screens read.
 *
 * ⚠ `picks` holds ONLY what this caller may see. The server reads that table
 * with the caller's own client so RLS does the gating (086: your own always,
 * everyone else's once the matchweek locks). A club missing from the wall is
 * therefore either sealed or never picked, and the screen must not guess which
 * — `locked_matchweeks` is what tells them apart.
 */
export type LmsState = {
  round: { round_id: string; round_number: number; first_matchweek: number } | null;
  /** The week a pick can still be WRITTEN for. Never the one to narrate with. */
  open_matchweek: number | null;
  /**
   * When that week stops accepting picks.
   *
   * ⚠ An hour BEFORE the first kickoff, not at it. Migration 101 moved the
   * deadline and backfilled it; copy that says "locks at kickoff" is an hour
   * wrong. (MW1 and MW2 of this season sit at zero because they had already
   * locked when 101 ran — a passed deadline is never moved.)
   */
  open_locks_at: string | null;
  /** The week being PLAYED. Null between rounds — an answer, not a gap. */
  in_play_matchweek: number | null;
  /** The wall's columns, ascending. Only weeks this round covers. */
  matchweeks: number[];
  locked_matchweeks: number[];
  my_entry_id: string | null;
  members: LmsMember[];
  picks: LmsPickCell[];
  clubs: LmsClub[];
  /** For the OPEN matchweek only — who each club plays, if anyone. */
  fixtures: LmsFixture[];
};

export function fetchLmsState(poolId: string) {
  return apiFetch<LmsState>(`/api/pools/${poolId}/lms`);
}

/**
 * Back a club for a matchweek. Replaces an earlier choice for the same week —
 * changing your mind before the lock is allowed and expected.
 *
 * ⚠ The route READS BACK after writing. The post-kickoff lock is a silent-skip
 * database trigger, so a refused write returns 200 with nothing changed unless
 * somebody asks; a 403 from here means the week closed or you are already out.
 */
export function saveLmsPick(
  poolId: string,
  body: { roundId: string; entryId: string; matchweekNumber: number; clubId: string },
) {
  return apiFetch<{ saved: true }>(`/api/pools/${poolId}/lms-pick`, { method: 'POST', body });
}

// ============================================================
// League Pick'em — saving picks
// ============================================================

/**
 * Save a matchweek's picks.
 *
 * ⚠ THE SHAPE IS DECIDED BY THE POOL'S DEPTH AND THE ROUTE ENFORCES IT. A
 * Scores pool sends `{homeScore, awayScore}`; a Results pool sends `{outcome}`.
 * Sending the wrong one is a 400 with copy naming the game — and that check is
 * not pedantry: a scoreline reaching a Results pool would satisfy the database
 * CHECK perfectly and then score ZERO forever, because the engine's Results arm
 * compares `predicted_outcome` and a NULL comparison is never true. The member
 * would be silently unscoreable with no error anywhere.
 *
 * ⚠ NEVER ENCODE AN OUTCOME AS A SENTINEL SCORELINE. home/draw/away as
 * 1-0/0-0/0-1 would score as a genuine EXACT and show the member a "you
 * predicted 1-0" they never picked. Migration 064 built a separate column to
 * make that impossible; do not route around it.
 *
 * ⚠ A REJECTION IS A 409, NOT A SILENT SUCCESS. The matchweek lock is a
 * silent-skip database trigger, so a refused write would otherwise return
 * success having stored nothing — the member finds out a week later that their
 * picks were never there. `apiFetch` throws the route's message, which names how
 * many of the batch were refused.
 */
export type LeaguePickBody =
  | { matchId: string; homeScore: number; awayScore: number }
  | { matchId: string; outcome: 'home' | 'draw' | 'away' };

export function saveLeaguePicks(
  poolId: string,
  body: { entryId: string; predictions: LeaguePickBody[] },
) {
  return apiFetch<{ saved: boolean; progress?: { predicted: number }; lastSaved?: string }>(
    `/api/pools/${poolId}/predictions`,
    { method: 'POST', body },
  );
}

// =============================================================
// /api/users/:id/fixture-picks — your pick on one league fixture
// =============================================================
// The Predictions tab, for a league fixture. It used to say "Your picks are on
// the web", which was true of the app and false about the member: a stated v1
// boundary claimed league picks needed one contract call per pool per tap.
//
// ⚠ ONLY HALF OF THAT WAS EVER TRUE. `league_predictions` is readable by the
// client under its own `auth.uid()` policy — the pick never needed a route. The
// POINTS did: `league_match_scores` is one of migration 050's deny-all tables,
// so a user-scoped read returns an empty array with `error: null`. That is what
// this route is for, and it carries the pick along because it is already
// holding the rows.
// =============================================================

/** One entry of yours that predicted this fixture. */
export type FixturePick = {
  entryId: string;
  entryName: string;
  poolId: string;
  poolName: string;
  /**
   * ⚠ EXACTLY ONE OF THESE TWO IS SET, AND WHICH ONE IS A POOL SETTING, not a
   * mode. Both shapes report `prediction_mode: 'league_pickem'`; a pool scoring
   * exact scores stores a scoreline, and a pool scoring outcomes stores
   * 'home' | 'draw' | 'away' with NO scoreline at all. Measured on production
   * 2026-09-07: 70 of one member's 90 picks were the outcome shape, so a
   * renderer that assumes a scoreline prints a dash for the majority of them.
   */
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  predictedOutcome: 'home' | 'draw' | 'away' | null;
  /** `exact` | `winner_gd` | `winner` | `miss`, or null before it is scored. */
  scoreType: string | null;
  /** ⚠ Null means NOT YET SCORED. `miss` is a real zero. */
  points: number | null;
};

/**
 * Where a TABLE-mode entry placed this fixture's two clubs.
 *
 * ⚠ A TABLE POOL HAS NO PER-FIXTURE PICK — it is one decision for the whole
 * season (Decision 11) — so it can never appear in `FixturePick`, and without
 * this it would be invisible on a match screen. What it does have is where the
 * member put these two clubs, which is the interesting thing to read beside a
 * game they are playing.
 */
export type TablePick = {
  entryId: string;
  entryName: string;
  poolId: string;
  poolName: string;
  /** Null when the filed table omits this club — possible on a partial profile. */
  homePosition: number | null;
  awayPosition: number | null;
};

export type FixturePicksResponse = {
  picks: FixturePick[];
  tablePicks: TablePick[];
};

export async function fetchFixturePicks(
  userId: string,
  fixtureId: string,
): Promise<FixturePicksResponse> {
  const res = await apiFetch<{
    picks: {
      entry_id: string;
      entry_name: string;
      pool_id: string;
      pool_name: string;
      predicted_home_score: number | null;
      predicted_away_score: number | null;
      predicted_outcome: string | null;
      score_type: string | null;
      points: number | null;
    }[];
    /** ⚠ Optional: absent from a response cached before this field existed. */
    table_picks?: {
      entry_id: string;
      entry_name: string;
      pool_id: string;
      pool_name: string;
      home_position: number | null;
      away_position: number | null;
    }[];
  }>(`/api/users/${userId}/fixture-picks?fixture_id=${encodeURIComponent(fixtureId)}`);

  const picks: FixturePick[] = (res.picks ?? []).map((p) => ({
    entryId: p.entry_id,
    entryName: p.entry_name,
    poolId: p.pool_id,
    poolName: p.pool_name,
    predictedHomeScore: p.predicted_home_score,
    predictedAwayScore: p.predicted_away_score,
    predictedOutcome: (p.predicted_outcome as FixturePick['predictedOutcome']) ?? null,
    scoreType: p.score_type,
    points: p.points,
  }));

  const tablePicks: TablePick[] = (res.table_picks ?? []).map((t) => ({
    entryId: t.entry_id,
    entryName: t.entry_name,
    poolId: t.pool_id,
    poolName: t.pool_name,
    homePosition: t.home_position,
    awayPosition: t.away_position,
  }));

  return { picks, tablePicks };
}

// =============================================================
// /api/fixtures/:id/h2h — the scout report
// =============================================================
// Every previous competitive meeting between the two clubs, reduced. One
// provider call per PAIRING and cached for a day server-side, so the second
// viewer of a fixture costs nothing.
//
// ⚠ THE GATE COMES FROM THE SERVER. `enough` decides whether the tab is offered
// at all; the phone must not carry its own copy of the threshold, or two clubs
// with three meetings would get a tab on one surface and not the other the day
// either number moved.
// =============================================================

export type H2HMeeting = {
  fixtureId: number;
  date: string;
  competition: string;
  venueName: string | null;
  homeExternalId: number;
  awayExternalId: number;
  homeGoals: number;
  awayGoals: number;
};

export type H2HSummary = {
  meetings: number;
  /** ⚠ From THIS fixture's home club's view, wherever each meeting was played. */
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  avgGoals: number;
  bothScored: number;
  commonScore: { score: string; count: number } | null;
  atVenue: { played: number; wins: number; draws: number; losses: number } | null;
  /**
   * One side's winless run at THIS ground — the line worth reading aloud.
   *
   * ⚠ `side` is which end of THIS fixture, so the screen names the club without
   * re-deriving who is who. `lastWinYear` is NULL when they have never won
   * there at all, which is a stronger sentence and must read differently — not
   * the earliest date in the sample.
   *
   * ⚠ Null below the server's floor. Two visits without a win is a fortnight,
   * not a hoodoo.
   */
  venueDrought: {
    side: 'home' | 'away';
    visits: number;
    lastWinYear: string | null;
  } | null;
  /** ⚠ Carries its own denominator — not every meeting has a half-time score. */
  decidedAfterHt: number;
  decidedAfterHtOf: number;
  recent: H2HMeeting[];
  span: { from: string; to: string } | null;
  competitions: { id: number; name: string; count: number }[];
  /** Friendlies dropped, reported rather than hidden. */
  excluded: number;
};

export type H2HResponse = {
  summary: H2HSummary;
  enough: boolean;
  minMeetings: number;
};

export async function fetchHeadToHead(fixtureId: string): Promise<H2HResponse> {
  return apiFetch<H2HResponse>(`/api/fixtures/${encodeURIComponent(fixtureId)}/h2h`);
}

// =============================================================
// /api/pools/:pool_id/entries/:entry_id/dossier — the opponent scout report
// =============================================================
// How one member of a pool picks, from picks that have already been revealed.
// No provider call sits behind any figure here, so unlike the head-to-head tab
// there is no quota to protect and no cache to wait on.
//
// ⚠ EVERY RATE CARRIES ITS DENOMINATOR AND MAY REFUSE TO BE A PERCENTAGE.
// `pct` is null below the server's sample floor and the screen must show the
// fraction instead — "3 of 8", never "38%". A `?? 0` on that field would turn
// every thin sample into a confident zero, which is the exact shape of the pool
// card bug where a real-valued default could never fail.
//
// ⚠ THE SEAL IS THE SERVER'S. Only revealed picks are ever counted, decided
// against `league_matchweeks.lock_at`. The phone must not add a filter of its
// own and must not assume one is missing.
// =============================================================

export type ScoutRate = {
  count: number;
  of: number;
  /** ⚠ NULL BELOW THE SAMPLE FLOOR. Show `count of of`, never a percentage. */
  pct: number | null;
};

export type ScoutClubRef = {
  clubId: string;
  name: string;
  abbreviation: string;
  /** ⚠ Nullable — draw the row without it rather than reserving a hole. */
  crestUrl: string | null;
};

export type ScoutClubLean = {
  club: ScoutClubRef;
  seen: number;
  backed: number;
  backedRight: number;
  backedPlayed: number;
  opposed: number;
  /** ⚠ Denominator is APPEARANCES at that venue, not backings. */
  backedHome: ScoutRate;
  backedAway: ScoutRate;
};

export type ScoutBaseline = {
  played: number;
  /** ⚠ MEASURED over the same fixtures, never a constant. */
  goalsPerGame: number | null;
  drawRate: ScoutRate;
  homeWinRate: ScoutRate;
};

export type ScoutFingerprint = {
  /** ⚠ `share` is a `ScoutRate` — the server owns the floor, not the phone. */
  signature: { score: string; share: ScoutRate } | null;
  goalsPerPrediction: number | null;
  theirDrawRate: ScoutRate;
  theirHomeWinRate: ScoutRate;
  /** ⚠ A stated absence is a finding — most members have never predicted 0–0. */
  hasPredictedNil: boolean;
  /**
   * ⚠ FALSE IN A RESULTS POOL, where members tap an outcome and never enter a
   * scoreline. "Has never predicted 0–0" is a finding about somebody who COULD
   * have; suppress the row rather than report an absence nobody could fill.
   */
  hasScorelines: boolean;
};

export type OpponentDossier = {
  entry: string;
  picks: number;
  scored: number;
  hitRate: ScoutRate;
  exactCount: number;
  pointsPerFixture: number | null;
  /** ⚠ OLDEST FIRST, ordered by kickoff rather than by matchweek number. */
  form: { matchweek: number; points: number }[];
  mostBacked: ScoutClubLean | null;
  mostOpposed: ScoutClubLean | null;
  blindSpot: ScoutClubLean | null;
  baseline: ScoutBaseline;
  fingerprint: ScoutFingerprint;
  reliability: { made: number; available: number; missed: number } | null;
  /** ⚠ Null when the crowd figure was unavailable — not zero. */
  contrarian: { against: ScoutRate; andRight: ScoutRate } | null;
  /**
   * The one-line verdict, composed SERVER-SIDE.
   *
   * ⚠ THE PHONE MUST NOT COMPOSE ITS OWN. One owner is why a member who
   * screenshots a verdict into Banter and taps again sees the same sentence —
   * and why web and RN cannot drift into two characterisations of one person.
   */
  read: string;
};

/**
 * A member's duel record.
 *
 * ⚠⚠ THE PHONE NEVER RECOMPUTES ANY OF THIS. A duel has been worth 500/250/0
 * since migration 121 and reading that scale as a literal is this codebase's
 * most repeated bug — three sites have carried `=== 3` at various points. The
 * server calls `buildDuelRecords`, which owns the arithmetic; these are its
 * answers, to be displayed and not checked.
 */
export type ScoutDuelRecord = {
  won: number;
  tied: number;
  lost: number;
  /** ⚠ A bye is `entry_b IS NULL`, never a points value — `DUEL_BYE` and
   *  `DUEL_TIE` are both 250, so a bye counted by value looks like a draw. */
  byes: number;
  duel_points: number;
  /** ⚠ OLDEST FIRST, ordered by when each settled — never by matchweek number. */
  form: ('won' | 'tied' | 'lost' | 'bye')[];
};

export type DossierResponse = {
  entry_id: string;
  entry_name: string;
  /** ⚠ The USER id, for the avatar gradient — keyed on the person so a member
   *  is the same colour here as in Banter. Null if the entry has no user. */
  user_id: string | null;
  full_name: string | null;
  is_self: boolean;
  pool: { pool_id: string; name: string; league_mode: string | null } | null;
  competition: { name: string; season: string } | null;
  /**
   * ⚠⚠ `rank` IS NULL IN LAST MAN STANDING AND MUST STAY THAT WAY. The stored
   * column is entry-id order there, not a standing — there is no second place
   * in a survival pool. The server withholds it; the phone must not go looking
   * for it somewhere else.
   */
  standing: {
    total_points: number;
    rank: number | null;
    /** The weekly accuracy rank a week ago — comparable to `rank`, so an arrow
     *  between them describes a real movement. ⚠ NOT the duels board's order. */
    previous_rank: number | null;
    /** ⚠ `retired_at` filtered, matching the leaderboard's own count. */
    pool_size: number | null;
    /** ⚠ NULL OUTSIDE SHOWDOWN — no duels at all is not a record of zeroes. */
    duels: ScoutDuelRecord | null;
  } | null;
  dossier: OpponentDossier;
};

export async function fetchDossier(
  poolId: string,
  entryId: string,
): Promise<DossierResponse> {
  return apiFetch<DossierResponse>(
    `/api/pools/${encodeURIComponent(poolId)}/entries/${encodeURIComponent(entryId)}/dossier`,
  );
}

// =============================================================
// /api/fixtures/:id/players — who is actually playing well
// =============================================================
// The people half of a scout report, from migration 141's player rows. It costs
// no provider calls: every figure was already paid for by the fixture sync.
//
// ⚠ THE GATE COMES FROM THE SERVER, same as the head-to-head tab. `enough`
// decides whether the card is offered; the phone must not carry its own copy of
// the threshold or the two surfaces disagree the day it moves.
//
// ⚠ GOALS HERE ARE FROM THE TIMELINE, NOT FROM THE PLAYER ROWS — the two
// disagree at source and only `match_events` is authoritative. Nothing on the
// phone should ever add a goals column from anywhere else.
// =============================================================

export type PlayerForm = {
  externalPlayerId: number;
  name: string;
  position: 'G' | 'D' | 'M' | 'F' | null;
  appearances: number;
  minutes: number;
  /** ⚠ Mean of RATED appearances only — an unused substitute has no rating. */
  rating: number;
  goals: number;
  assists: number;
  keyPasses: number;
};

export type SideScout = {
  clubId: string;
  /** Best average rating, minutes-qualified. Empty early in a season. */
  inForm: PlayerForm[];
  /** ⚠ NOT minutes-qualified — a total cannot be inflated by a cameo. */
  dangerMen: PlayerForm[];
  qualified: number;
  consideredPlayers: number;
};

/**
 * How the whole platform called this fixture, as COUNTS.
 *
 * ⚠⚠ PLATFORM-WIDE, NEVER YOUR POOL. A pool-scoped crowd figure leaks that
 * pool's picks through an aggregate; the server function takes no pool argument
 * so the phone cannot narrow it either.
 *
 * ⚠ NULL FOR A FIXTURE IN THE OPEN MATCHWEEK — those picks are live and nobody
 * may see them, in aggregate or otherwise. Null is also what a missing migration
 * 142 looks like, and both mean "draw no bar".
 *
 * ⚠ COUNTS, NOT PERCENTAGES. Round three shares independently and they total 99
 * or 101; `useDuel` carries the same note about its own bar.
 */
export type CrowdSplit = {
  fixtureId: string;
  picks: number;
  home: number;
  draw: number;
  away: number;
  majority: 'home' | 'away' | null;
};

export type FixturePlayersResponse = {
  enough: boolean;
  crowd: CrowdSplit | null;
  home: { club: { club_id: string; name: string; abbreviation: string }; scout: SideScout };
  away: { club: { club_id: string; name: string; abbreviation: string }; scout: SideScout };
};

export async function fetchFixturePlayers(
  fixtureId: string,
): Promise<FixturePlayersResponse> {
  return apiFetch<FixturePlayersResponse>(
    `/api/fixtures/${encodeURIComponent(fixtureId)}/players`,
  );
}

// =============================================================
// /api/fixtures/:id/scout — the peek under the hood
// =============================================================
// What the prediction flow shows when somebody taps the binoculars on a
// fixture. Both halves in one round trip, because the sheet slides up over the
// picker with the member mid-decision and two fetches means two spinners inside
// one gesture.
//
// ⚠ EITHER HALF MAY BE NULL, AND THEY GO MISSING FOR OPPOSITE REASONS. Head to
// head is absent for a PAIRING — two promoted clubs have never met however late
// it is. Form is absent for a DATE — nobody has played anybody in the second
// week of August. Between them something is nearly always there.
//
// ⚠ A NULL IS NOT AN EMPTY RECORD. `h2h: null` means the provider could not be
// reached; `h2h.enough === false` means they really have barely met. The screen
// must not collapse the two into one sentence.
// =============================================================

export type ScoutFormOutcome = 'W' | 'D' | 'L';

export type ScoutVenueForm = {
  club: ScoutClubRef;
  /** Which end of THIS fixture they are at. */
  venue: 'home' | 'away';
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  /** ⚠ Null when nothing has been played at that venue — never 0. */
  goalsForPerGame: number | null;
  goalsAgainstPerGame: number | null;
  /** ⚠ OLDEST FIRST, so it reads left to right in the order it happened. */
  strip: ScoutFormOutcome[];
  /** ⚠ Both venues — the fallback when the split is one game deep in August. */
  overallPlayed: number;
  overallStrip: ScoutFormOutcome[];
};

export type ScoutMatchForm = {
  home: ScoutVenueForm;
  away: ScoutVenueForm;
  seasonPlayed: number;
};

/**
 * A club on the scout sheet, carrying the provider's id.
 *
 * ⚠ THE ID IS WHAT LETS THE LAST-FIVE STRIP DRAW CRESTS. Each past meeting
 * names its home side by `homeExternalId`, and the two clubs swap ends between
 * fixtures — so without this the strip could not tell which crest belonged on
 * top of which scoreline.
 */
export type ScoutFixtureClub = ScoutClubRef & { externalClubId: number };

export type MatchScoutResponse = {
  fixture: {
    fixture_id: string;
    kickoff_at: string;
    venue: string | null;
    home: ScoutFixtureClub;
    away: ScoutFixtureClub;
  };
  form: ScoutMatchForm | null;
  h2h: { summary: H2HSummary; enough: boolean; minMeetings: number } | null;
};

export async function fetchMatchScout(fixtureId: string): Promise<MatchScoutResponse> {
  return apiFetch<MatchScoutResponse>(
    `/api/fixtures/${encodeURIComponent(fixtureId)}/scout`,
  );
}
