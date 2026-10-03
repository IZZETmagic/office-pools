// Port of ios/OfficePools/Services/ActivityService.swift + ActivityViewModel.swift.
// Synthesizes the Activity feed from pool membership / entry / point-adjustment
// data — no `user_activity` table is read; events are computed client-side.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchEntryAnalytics,
  fetchUserActivity,
  markActivitySeen,
  type ActivityFeedItemRaw,
  type ActivityLink,
  type NeedsYouItem,
} from './api';
import { useAuth } from './auth';
import { CACHE_KEYS, readCache, writeCache } from './cache/persistentCache';
import { supabase } from './supabase';
import { applyFetched, restore, settle, type Settled } from './needsYouState';

export type ActivityType =
  | 'mention'
  | 'rank_change'
  | 'deadline_alert'
  | 'pool_joined'
  | 'pool_left'
  | 'pool_removed'
  | 'level_up'
  | 'streak_milestone'
  | 'badge_earned'
  | 'prediction_result'
  | 'matchday_mvp'
  | 'prediction_submitted'
  | 'points_adjusted'
  | 'xp_gain'
  | 'matchday_recap'
  | 'matchweek_story'
  | 'welcome';

export type ActivityColorKey = 'primary' | 'success' | 'warning' | 'error' | 'accent';

export type RankChangeMeta = {
  pool_name: string;
  old_rank: number;
  new_rank: number;
  delta: number;
};

export type PredictionResultMeta = {
  pool_name: string;
  match_number: number;
  outcome: 'exact' | 'winner_gd' | 'winner' | 'miss';
  home_team: string;
  away_team: string;
  score: string;
};

export type StreakMilestoneMeta = {
  pool_name: string;
  streak_type: 'hot' | 'cold';
  streak_length: number;
};

export type BadgeEarnedMeta = {
  pool_name: string;
  badge_name: string;
  badge_emoji: string;
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Very Rare' | 'Legendary' | string;
};

export type LevelUpMeta = {
  pool_name: string;
  new_level: number;
  level_name: string;
};

export type MatchdayMvpMeta = {
  pool_name: string;
  match_number: number;
  match_points: number;
};

export type PredictionSubmittedMeta = {
  pool_name: string;
  entry_name?: string;
  match_count?: number;
};

export type PointsAdjustedMeta = {
  pool_name: string;
  adjustment: number;
  reason: string;
};

export type MatchdayRecapMeta = {
  pool_name: string;
  entry_name: string;
  date: string;
  matches: number;
  exact: number;
  winner_gd: number;
  winner: number;
  miss: number;
  points: number;
};

export type DeadlineAlertMeta = {
  pool_name: string;
  round_name?: string;
  deadline: string;
};

export type XPGainMeta = {
  pool_name: string;
  entry_name: string;
  xp_delta: number;
  source: 'match' | 'bonus' | 'badge';
  label: string;
  match_number?: number;
  badge_emoji?: string;
};

export type PoolJoinedMeta = {
  pool_name: string;
};

export type MentionMeta = {
  pool_name: string;
  sender_name: string;
  message_preview?: string;
  message_id?: string;
  sender_user_id?: string;
};

/** Mirrors `MatchweekStoryMeta` in lib/activity/matchweekStories.ts (web). */
export type MatchweekStoryMeta = {
  pool_name: string;
  league_mode: 'pickem' | 'showdown' | 'last_man_standing' | 'table';
  matchweek_number: number;
  entry_id: string;
  entry_name: string;
  multi_entry: boolean;
  points: number | null;
  tiers: { exact: number; winner_gd: number; winner: number; miss: number } | null;
  rank: number | null;
  rank_before: number | null;
  entrants: number | null;
  lines: Array<{ label: string; points: number }>;
  more_count: number;
  more_points: number;
  duel: {
    outcome: 'won' | 'tied' | 'lost' | 'bye';
    opponent_name: string | null;
    my_accuracy: number | null;
    their_accuracy: number | null;
    duel_points: number;
  } | null;
  lms: {
    result: 'survived' | 'eliminated';
    club_name: string;
    round_number: number;
    survivors_left: number;
    round_entrants: number;
    won_round: boolean;
  } | null;
};

export type ActivityMetadata =
  | { kind: 'mention'; data: MentionMeta }
  | { kind: 'rank_change'; data: RankChangeMeta }
  | { kind: 'deadline_alert'; data: DeadlineAlertMeta }
  | { kind: 'pool_joined'; data: PoolJoinedMeta }
  | { kind: 'level_up'; data: LevelUpMeta }
  | { kind: 'streak_milestone'; data: StreakMilestoneMeta }
  | { kind: 'badge_earned'; data: BadgeEarnedMeta }
  | { kind: 'prediction_result'; data: PredictionResultMeta }
  | { kind: 'matchday_mvp'; data: MatchdayMvpMeta }
  | { kind: 'prediction_submitted'; data: PredictionSubmittedMeta }
  | { kind: 'points_adjusted'; data: PointsAdjustedMeta }
  | { kind: 'welcome' };

export type ActivityItem = {
  activityId: string;
  poolId: string | null;
  activityType: ActivityType;
  title: string;
  body: string | null;
  icon: string;
  colorKey: ActivityColorKey;
  metadata: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
  /** The screen this row opens. */
  link?: ActivityLink;
};

export type { NeedsYouItem };

// --- Supabase row shapes -----------------------------------------------

type MembershipRow = {
  pool_id: string;
  joined_at: string;
  pools: {
    pool_id: string;
    pool_name: string;
    prediction_deadline: string | null;
    tournament_id: string | null;
  } | null;
  pool_entries: Array<{
    entry_id: string;
    entry_name: string;
    entry_number: number;
    has_submitted_predictions: boolean | null;
    predictions_submitted_at: string | null;
    auto_submitted: boolean | null;
    current_rank: number | null;
    previous_rank: number | null;
    last_rank_update: string | null;
    created_at: string;
  }>;
};

type AdjustmentRow = {
  id: string;
  entry_id: string;
  pool_id: string;
  amount: number;
  reason: string;
  created_at: string;
};

// --- Helpers -----------------------------------------------------------

function makeId(type: ActivityType, poolId: string | null, createdAt: string): string {
  return `${type}-${poolId ?? 'none'}-${createdAt}`;
}

function synth(
  type: ActivityType,
  title: string,
  body: string | null,
  icon: string,
  colorKey: ActivityColorKey,
  poolId: string | null,
  createdAt: string,
  metadata: Record<string, unknown> | null,
): ActivityItem {
  return {
    activityId: makeId(type, poolId, createdAt),
    poolId,
    activityType: type,
    title,
    body,
    icon,
    colorKey,
    metadata,
    isRead: true,
    createdAt,
  };
}

/**
 * Guard against non-unique activity ids reaching the list as React keys. The
 * server id for synthesized events is `type-poolId-createdAt`, which collides
 * when a user has two entries in one pool whose ranks change at the same
 * snapshot timestamp (two distinct `rank_change` events, same id). Keep every
 * event but suffix duplicates so keys stay unique. Server-side, the id also
 * folds in entry_id — this is defense-in-depth so the feed can never crash on a
 * duplicate key regardless of what the endpoint returns.
 */
function ensureUniqueActivityIds(items: ActivityItem[]): void {
  const seen = new Map<string, number>();
  for (const it of items) {
    const n = (seen.get(it.activityId) ?? 0) + 1;
    seen.set(it.activityId, n);
    if (n > 1) it.activityId = `${it.activityId}#${n}`;
  }
}

/**
 * Build the Activity feed.
 *
 * V1 architecture: server-side endpoint produces the "cheap" events
 * (pool_joined, prediction_submitted, deadline_alert, rank_change,
 * points_adjusted) in a single round-trip. XP-gain events still fan out
 * client-side via the per-entry analytics endpoint — moving those to the
 * server requires a slim XP-only helper (TODO follow-up).
 *
 * Mirrors ios/OfficePools/Services/ActivityService.swift in spirit.
 */
type ActivityFetch = {
  /** Page one from the server. */
  items: ActivityItem[];
  /** XP rows, built on the phone for ALL time — `mergeFeed` windows them. */
  xpItems: ActivityItem[];
  needsYou: NeedsYouItem[];
  seenAt: string | null;
  nextBefore: string | null;
};

async function fetchActivity(appUserId: string): Promise<ActivityFetch> {
  // First page (single server call).
  const res = await fetchUserActivity(appUserId);
  const items: ActivityItem[] = res.items.map(fromRaw);

  // XP gains still need membership data for entry context + timestamps.
  // Fetch the minimal slice required by appendXPEvents.
  const { data: rows, error } = await supabase
    .from('pool_members')
    .select(
      `
      pool_id, joined_at,
      pools(pool_id, pool_name, prediction_deadline, tournament_id),
      pool_entries(
        entry_id, entry_name, entry_number,
        has_submitted_predictions, predictions_submitted_at,
        auto_submitted, current_rank, previous_rank,
        last_rank_update, created_at
      )
      `,
    )
    .eq('user_id', appUserId);
  if (error) throw error;
  const memberships = (rows ?? []) as unknown as MembershipRow[];

  const xpItems: ActivityItem[] = [];
  await appendXPEvents(memberships, xpItems);

  // XP rows are built here, not on the server, so they get their link here.
  for (const it of xpItems) {
    if (!it.link && it.poolId) {
      it.link = { pathname: '/pool/[id]', params: { id: it.poolId } };
    }
  }

  return {
    items,
    xpItems,
    needsYou: res.needs_you ?? [],
    seenAt: res.seen_at ?? null,
    nextBefore: res.next_before ?? null,
  };
}

const ms = (iso: string) => Date.parse(iso);

/**
 * The feed as shown: every loaded server page, plus the XP rows that fall
 * inside what has been loaded so far.
 *
 * ⚠ XP rows are synthesised on the phone for all time, so without the window a
 * badge from July would sit at the bottom of page one with nothing around it,
 * and then the page that should hold it would arrive above it. `nextBefore` is
 * the oldest edge loaded; NULL means the whole history is in.
 */
export function mergeFeed(
  server: ActivityItem[],
  xp: ActivityItem[],
  nextBefore: string | null | undefined,
): ActivityItem[] {
  const floor = nextBefore ? ms(nextBefore) : null;
  const visibleXp = floor == null ? xp : xp.filter((i) => ms(i.createdAt) >= floor);
  const out = [...server, ...visibleXp].map((i) => ({ ...i }));
  out.sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  ensureUniqueActivityIds(out);
  return out;
}

/** Append a page, dropping any row already held (the same id twice is the same event). */
function appendUnique(prev: ActivityItem[], add: ActivityItem[]): ActivityItem[] {
  const seen = new Set(prev.map((i) => i.activityId));
  return [...prev, ...add.filter((i) => !seen.has(i.activityId))];
}

function fromRaw(r: ActivityFeedItemRaw): ActivityItem {
  return {
    activityId: r.activity_id,
    poolId: r.pool_id,
    activityType: r.activity_type as ActivityType,
    title: r.title,
    body: r.body,
    icon: r.icon,
    colorKey: r.color_key,
    metadata: r.metadata,
    isRead: r.is_read,
    createdAt: r.created_at,
    link: r.link,
  };
}

async function appendXPEvents(memberships: MembershipRow[], items: ActivityItem[]): Promise<void> {
  const entryAnchors: Array<{
    poolId: string;
    entryId: string;
    entryName: string;
    poolName: string;
    tournamentId: string | null;
    // Carried into the badges fallback chain so we can still date an
    // earned badge when the tournament has no completed matches yet
    // (typical pre-kickoff state on a fresh pool).
    predictionsSubmittedAt: string | null;
    entryCreatedAt: string;
    joinedAt: string;
  }> = [];
  const tournamentIds = new Set<string>();
  for (const m of memberships) {
    if (!m.pools) continue;
    for (const e of m.pool_entries ?? []) {
      entryAnchors.push({
        poolId: m.pools.pool_id,
        entryId: e.entry_id,
        entryName: e.entry_name,
        poolName: m.pools.pool_name,
        tournamentId: m.pools.tournament_id,
        predictionsSubmittedAt: e.predictions_submitted_at,
        entryCreatedAt: e.created_at,
        joinedAt: m.joined_at,
      });
      if (m.pools.tournament_id) tournamentIds.add(m.pools.tournament_id);
    }
  }
  if (entryAnchors.length === 0) return;

  // Fetch a stamp per completed match for every tournament the user
  // touches. One Supabase round-trip total; bounded by number of distinct
  // tournaments. Filter to `is_completed = true` so the map never carries
  // future / scheduled match dates — those would otherwise drive every
  // earned-badge timestamp into the future, which `relativeTime` then
  // renders as "just now" (Date.now() - future ≈ 0, hits the < 60 branch).
  // Prefer `completed_at` (the actual scoring timestamp) over `match_date`
  // (the kickoff time) so the displayed earn date matches when the badge
  // could realistically have unlocked.
  const matchDateByKey = new Map<string, string>(); // key: `${tournamentId}:${matchNumber}`
  if (tournamentIds.size > 0) {
    const { data: matchRows } = await supabase
      .from('matches')
      .select('tournament_id, match_number, match_date, completed_at, is_completed')
      .in('tournament_id', Array.from(tournamentIds))
      .eq('is_completed', true);
    for (const r of (matchRows ?? []) as Array<{
      tournament_id: string;
      match_number: number;
      match_date: string;
      completed_at: string | null;
      is_completed: boolean;
    }>) {
      const ts = r.completed_at ?? r.match_date;
      matchDateByKey.set(`${r.tournament_id}:${r.match_number}`, ts);
    }
  }

  // Parallel analytics fetches. Treat per-entry failures as soft errors so a
  // single broken pool doesn't blank the feed.
  const results = await Promise.allSettled(
    entryAnchors.map((a) => fetchEntryAnalytics(a.poolId, a.entryId)),
  );

  results.forEach((result, i) => {
    if (result.status !== 'fulfilled') return;
    const analytics = result.value;
    const anchor = entryAnchors[i];
    const xp = analytics?.xp;
    if (!xp) return;

    // Per-match XP (only positive scoring outcomes contribute).
    // ActivityId encodes entry + source + match_number so two entries in the
    // same pool getting XP for the same match don't collide on the React key.
    for (const mx of xp.match_xp ?? []) {
      if (!mx.multiplied_xp || mx.multiplied_xp <= 0) continue;
      const key = anchor.tournamentId ? `${anchor.tournamentId}:${mx.match_number}` : '';
      const ts = matchDateByKey.get(key);
      if (!ts) continue;
      const item = synth(
        'xp_gain',
        `+${mx.multiplied_xp} XP — Match ${mx.match_number}`,
        `${anchor.entryName} · ${anchor.poolName}`,
        'chart.line.uptrend.xyaxis',
        'success',
        anchor.poolId,
        ts,
        {
          pool_name: anchor.poolName,
          entry_name: anchor.entryName,
          xp_delta: mx.multiplied_xp,
          source: 'match',
          label: `Match ${mx.match_number} · ${mx.tier}`,
          match_number: mx.match_number,
        } satisfies XPGainMeta,
      );
      item.activityId = `xp_gain-${anchor.entryId}-match-${mx.match_number}`;
      items.push(item);
    }

    // Bonus XP events (streaks, perfect rounds, etc.)
    for (const be of xp.bonus_events ?? []) {
      if (!be.xp || be.xp <= 0) continue;
      const key = anchor.tournamentId && be.match_number
        ? `${anchor.tournamentId}:${be.match_number}`
        : '';
      const ts = matchDateByKey.get(key);
      if (!ts) continue;
      const item = synth(
        'xp_gain',
        `+${be.xp} XP bonus — ${be.label}`,
        `${anchor.entryName} · ${anchor.poolName}`,
        'sparkles',
        'accent',
        anchor.poolId,
        ts,
        {
          pool_name: anchor.poolName,
          entry_name: anchor.entryName,
          xp_delta: be.xp,
          source: 'bonus',
          label: be.label,
          match_number: be.match_number ?? undefined,
        } satisfies XPGainMeta,
      );
      // be.type + match_number is unique per entry; include both since two
      // bonus events of different types can share a match_number.
      item.activityId = `xp_gain-${anchor.entryId}-bonus-${be.type}-${be.match_number ?? 'na'}`;
      items.push(item);
    }

    // Earned badges that grant XP. The analytics payload doesn't carry a
    // per-badge unlock timestamp yet, so we fall back through a chain of
    // proxies — best-available first:
    //   1. Latest *completed* match in the entry's tournament. Most
    //      badges unlock as a side effect of a scoring event, so the
    //      most-recent completion is the closest real anchor.
    //   2. `predictions_submitted_at` — for pre-kickoff badges like
    //      "Early Bird" / "First Picks" that fire on submission.
    //   3. Entry `created_at` — final fallback so a badge never
    //      silently slips into the future-dated "just now" trap.
    // Crucially, we never use a non-completed match's `match_date` —
    // future dates passed to `relativeTime` underflow into the "< 60s"
    // branch and render as "just now", which is the original bug.
    if (xp.earned_badges?.length) {
      let latestCompletedTs: string | null = null;
      if (anchor.tournamentId) {
        for (const [k, v] of matchDateByKey) {
          if (!k.startsWith(`${anchor.tournamentId}:`)) continue;
          if (!latestCompletedTs || v > latestCompletedTs) latestCompletedTs = v;
        }
      }
      const fallbackTs =
        latestCompletedTs ??
        anchor.predictionsSubmittedAt ??
        anchor.entryCreatedAt ??
        anchor.joinedAt;
      if (fallbackTs) {
        for (const b of xp.earned_badges) {
          if (!b.xp_bonus || b.xp_bonus <= 0) continue;
          const item = synth(
            'xp_gain',
            `${b.name} badge — +${b.xp_bonus} XP`,
            `${anchor.entryName} · ${anchor.poolName}`,
            'rosette',
            'accent',
            anchor.poolId,
            fallbackTs,
            {
              pool_name: anchor.poolName,
              entry_name: anchor.entryName,
              xp_delta: b.xp_bonus,
              source: 'badge',
              label: b.name,
            } satisfies XPGainMeta,
          );
          item.activityId = `xp_gain-${anchor.entryId}-badge-${b.id}`;
          items.push(item);
        }
      }
    }
  });
}

// --- Hook --------------------------------------------------------------

/**
 * ⚠ How many items go to disk. The feed itself is unbounded, but this blob is
 * `JSON.parse`d synchronously during the first render, so its size is paid in
 * milliseconds on the cold-start path. Fifty is several screenfuls; the rest
 * arrives with the refresh that is already running behind it.
 */
const CACHED_ACTIVITY_LIMIT = 50;

export function useActivity() {
  const { user, loading: authLoading } = useAuth();
  // Synchronous hydrate — see the long note in `lib/cache/persistentCache.ts`.
  // Provisional until auth resolves; the adopt/revoke effect below settles it.
  const [cached] = useState(() => readCache<ActivityItem[]>(CACHE_KEYS.activity));
  // Server pages, appended as the member scrolls. The cache holds page one.
  const [serverItems, setServerItems] = useState<ActivityItem[]>(cached?.data ?? []);
  const [xpItems, setXpItems] = useState<ActivityItem[]>([]);
  /**
   * Cursor for the next older page. `undefined` = not fetched yet (a cache
   * hydrate), so the list shows no end marker before it knows; `null` = the
   * whole history is loaded.
   */
  const [nextBefore, setNextBefore] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const serverRef = useRef<ActivityItem[]>(serverItems);
  serverRef.current = serverItems;
  const nextBeforeRef = useRef<string | null | undefined>(undefined);
  nextBeforeRef.current = nextBefore;
  const loadingMoreRef = useRef(false);
  const items = useMemo(() => mergeFeed(serverItems, xpItems, nextBefore), [serverItems, xpItems, nextBefore]);
  // ⚠ NOT `items.length === 0`. An empty feed is a legitimate answer for a new
  // member, and treating it as "no data" would hold the splash up for exactly
  // the people with the least to look at.
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ⚠ Not cached to disk. A to-do list restored from yesterday would ask for a
  // pick that has already been made; it arrives with the fetch instead.
  const [needsYou, setNeedsYou] = useState<NeedsYouItem[]>([]);
  // A done card leaves at once (needsYouState.ts): the held list, and when each settled card left —
  // so a fetch already in the air when it was settled can't bring it back.
  const needsRef = useRef<NeedsYouItem[]>([]);
  needsRef.current = needsYou;
  const settledRef = useRef<Settled>(new Map());
  /** When the member last opened the tab. Moves forward locally on `markSeen`. */
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const appUserIdRef = useRef<string | null>(null);
  const hasDataRef = useRef<boolean>(!!cached);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!user) return;
      const startedAt = Date.now();
      // Hydrated from cache? Then this is a refresh over real content, not a
      // load behind the splash.
      if (mode === 'refresh' || hasDataRef.current) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const { data: userData, error: userErr } = await supabase
          .from('users')
          .select('user_id')
          .eq('auth_user_id', user.id)
          .single();
        if (userErr || !userData) {
          throw userErr ?? new Error('User profile not found');
        }
        const appUserId = (userData as { user_id: string }).user_id;
        appUserIdRef.current = appUserId;
        const next = await fetchActivity(appUserId);
        // A refresh refetches page one but must not collapse pages the member
        // has already scrolled into: keep everything older than page one's edge,
        // and keep the deeper cursor if those older rows exist.
        const prev = serverRef.current;
        const edge = next.nextBefore ? ms(next.nextBefore) : null;
        const older = edge == null ? [] : prev.filter((i) => ms(i.createdAt) < edge);
        setServerItems(appendUnique(next.items, older));
        setNextBefore(older.length > 0 ? nextBeforeRef.current : next.nextBefore);
        setXpItems(next.xpItems);
        setLoadMoreError(null);
        const applied = applyFetched(next.needsYou, settledRef.current, startedAt);
        settledRef.current = applied.settled;
        setNeedsYou(applied.needs);
        // Never move the local stamp backwards: a fetch that started before
        // `markSeen` landed would otherwise resurrect the tab dot.
        setSeenAt((prev) => (prev && next.seenAt && prev > next.seenAt ? prev : next.seenAt));
        hasDataRef.current = true;
        // Stamped with the AUTH id, matching what the reader compares against.
        writeCache(
          CACHE_KEYS.activity,
          user.id,
          mergeFeed(next.items, next.xpItems, next.nextBefore).slice(0, CACHED_ACTIVITY_LIMIT),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load activity';
        setError(msg);
        console.warn('[useActivity]', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user],
  );

  // Same adopt/revoke contract as `useHomeData`: the cache was read before auth
  // resolved, so it is only kept once the restored session proves it belongs to
  // this person. The splash gate holds on `authLoading`, so nothing wrong is
  // ever visible while this settles.
  const revokedRef = useRef(false);
  useEffect(() => {
    if (!cached || revokedRef.current) return;
    if (authLoading) return;
    if (user && user.id === cached.userId) return;
    revokedRef.current = true;
    setServerItems([]);
    setXpItems([]);
    setNextBefore(undefined);
    hasDataRef.current = false;
    setLoading(!!user);
  }, [authLoading, user, cached]);

  useEffect(() => {
    if (user) load('initial');
  }, [user, load]);

  /**
   * The member is looking at the tab. Clears the tab dot's mention half now;
   * the rows keep their unread dots until the next fetch, so what was new on
   * this visit is still marked while they read it.
   */
  const markSeen = useCallback(async () => {
    const id = appUserIdRef.current;
    if (!id) return;
    setSeenAt(new Date().toISOString());
    try {
      const res = await markActivitySeen(id);
      setSeenAt(res.seen_at);
    } catch (err) {
      console.warn('[useActivity] markSeen', err);
    }
  }, []);

  /**
   * A Needs-you card is done — take it out NOW, not when the next fetch lands (Ryan, 2026-10-02).
   * Returns what left, for `restoreNeeds` if the action behind it then fails.
   */
  const settleNeeds = useCallback((match: (n: NeedsYouItem) => boolean): NeedsYouItem[] => {
    const r = settle(needsRef.current, match, settledRef.current, Date.now());
    if (r.removed.length === 0) return r.removed;
    settledRef.current = r.settled;
    needsRef.current = r.needs;
    setNeedsYou(r.needs);
    return r.removed;
  }, []);

  /** The action behind a settled card failed — put it back, in its place. */
  const restoreNeeds = useCallback((items: NeedsYouItem[]) => {
    const r = restore(needsRef.current, items, settledRef.current);
    settledRef.current = r.settled;
    needsRef.current = r.needs;
    setNeedsYou(r.needs);
  }, []);

  /** The next older page, if there is one and nothing is already loading. */
  const loadMore = useCallback(async () => {
    const cursor = nextBeforeRef.current;
    const id = appUserIdRef.current;
    if (!cursor || !id || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await fetchUserActivity(id, cursor);
      setServerItems((prev) => appendUnique(prev, res.items.map(fromRaw)));
      setNextBefore(res.next_before ?? null);
    } catch (err) {
      setLoadMoreError(err instanceof Error ? err.message : 'Could not load more');
      console.warn('[useActivity] loadMore', err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  /** Mentions newer than the last visit — half of what lights the tab dot. */
  const unreadMentions = seenAt
    ? items.filter((i) => i.activityType === 'mention' && i.createdAt > seenAt).length
    : 0;

  return {
    items,
    needsYou,
    seenAt,
    unreadMentions,
    loading,
    refreshing,
    error,
    refresh: useCallback(() => load('refresh'), [load]),
    settleNeeds,
    restoreNeeds,
    markSeen,
    nextBefore,
    loadingMore,
    loadMoreError,
    loadMore,
  };
}
