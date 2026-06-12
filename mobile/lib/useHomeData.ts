import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from './auth';
import { supabase } from './supabase';

// How long the home data is considered "fresh" before a focus-driven check
// will actually refetch. Tab switches inside this window show the cached
// data instantly with no loading indicator. Manual pull-to-refresh, sign-in,
// and real-time supabase events always force a fetch regardless.
const STALE_AFTER_MS = 30_000;

export type FormResult = 'exact' | 'winner_gd' | 'winner' | 'miss';

export type PoolSummary = {
  poolId: string;
  poolName: string;
  poolCode: string;
  predictionMode: string | null;
  brandName: string | null;
  brandEmoji: string | null;
  brandColor: string | null;
  brandLogoUrl: string | null;
  status: string;
  predictionDeadline: string | null;
  tournamentId: string;
  memberCount: number;
  memberInitials: string[];
  currentRank: number | null;
  totalPoints: number;
  totalEntries: number;
  // True once the pool's tournament has at least one completed match —
  // i.e. scoring has started. Pre-tournament every entry has 0 points
  // and the stored current_rank values are sparse/inconsistent, so the
  // card hides the rank KPI until this flips true.
  hasScoringStarted: boolean;
  hasSubmittedPredictions: boolean;
  // Whether the user still has something to predict in this pool. Mirrors
  // the iOS `HomeViewModel.needsPredictions` calc: for full / bracket pools
  // it's `!bestEntry.has_submitted_predictions`. For PROGRESSIVE pools it
  // overrides based on per-round submissions — if any open round on the
  // pool's best entry has `entry_round_submissions.has_submitted = false`,
  // the user still needs to predict for that round even though the entry's
  // top-level `has_submitted_predictions` may be true from an earlier round.
  needsPredictions: boolean;
  predictionsCompleted: number;
  predictionsTotal: number;
  role: string;
  joinedAt: string;
  /** Mirrors pools.is_private. Drives the "non-admin members of a
   *  private pool can't share" gate on the card's share button. */
  isPrivate: boolean;
  formResults: FormResult[];
  // Full prediction accuracy aggregates for the best entry — drives the
  // Profile tab's per-pool stats and the aggregated rings. `null` if the
  // entry has no scored matches yet.
  accuracyStats: {
    totalCompleted: number;
    exactCount: number;
    correctCount: number;
  } | null;
  unreadBanterCount: number;
};

function initialsOf(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export type MatchTeam = {
  countryName: string;
  countryCode: string | null;
  flagUrl: string | null;
};

export type MatchSummary = {
  matchId: string;
  matchNumber: number | null;
  stage: string | null;
  matchDate: string;
  status: string;
  venue: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: MatchTeam | null;
  awayTeam: MatchTeam | null;
  homeTeamPlaceholder: string | null;
  awayTeamPlaceholder: string | null;
};

export type HomeData = {
  appUserId: string | null;
  fullName: string | null;
  username: string | null;
  email: string | null;
  memberSince: string | null;
  pools: PoolSummary[];
  totalPoints: number;
  bestRank: number | null;
  bestStreak: number;
  liveMatches: MatchSummary[];
  nextMatch: MatchSummary | null;
  matchesToday: number;
  upcomingMatches: MatchSummary[];
  daysUntilKickoff: number;
};

const WORLD_CUP_KICKOFF = new Date('2026-06-11T00:00:00');

function computeDaysUntilKickoff(now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const kickoff = new Date(
    WORLD_CUP_KICKOFF.getFullYear(),
    WORLD_CUP_KICKOFF.getMonth(),
    WORLD_CUP_KICKOFF.getDate(),
  );
  const diffMs = kickoff.getTime() - today.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

function normalizeTeam(raw: unknown): MatchTeam | null {
  if (!raw) return null;
  const t = Array.isArray(raw) ? raw[0] : raw;
  if (!t) return null;
  return {
    countryName: (t as { country_name?: string }).country_name ?? '',
    countryCode: (t as { country_code?: string | null }).country_code ?? null,
    flagUrl: (t as { flag_url?: string | null }).flag_url ?? null,
  };
}

function normalizeMatch(row: Record<string, unknown>): MatchSummary {
  return {
    matchId: row.match_id as string,
    matchNumber: (row.match_number as number | null) ?? null,
    stage: (row.stage as string | null) ?? null,
    matchDate: row.match_date as string,
    status: row.status as string,
    venue: (row.venue as string | null) ?? null,
    homeScore: (row.home_score_ft as number | null) ?? null,
    awayScore: (row.away_score_ft as number | null) ?? null,
    homeTeam: normalizeTeam(row.home_team),
    awayTeam: normalizeTeam(row.away_team),
    homeTeamPlaceholder: (row.home_team_placeholder as string | null) ?? null,
    awayTeamPlaceholder: (row.away_team_placeholder as string | null) ?? null,
  };
}

const MATCH_SELECT = `
  match_id, match_number, stage, match_date, status, venue,
  home_score_ft, away_score_ft,
  home_team_placeholder, away_team_placeholder,
  home_team:teams!matches_home_team_id_fkey(country_name, country_code, flag_url),
  away_team:teams!matches_away_team_id_fkey(country_name, country_code, flag_url)
`;

export function useHomeDataInternal() {
  const { user } = useAuth();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Timestamp of the last successful (or initial) load. Used by
  // `refreshIfStale` so tab-focus refetches are skipped when the cache is
  // still fresh, eliminating the loading flicker on every tab switch.
  const lastLoadedAtRef = useRef<number>(0);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!user) return;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const { data: userData, error: userErr } = await supabase
          .from('users')
          .select('user_id, full_name, username, email, created_at')
          .eq('auth_user_id', user.id)
          .single();
        if (userErr || !userData) {
          throw userErr ?? new Error('User profile not found');
        }

        const { data: pmRows, error: pmErr } = await supabase
          .from('pool_members')
          .select(
            `
            role,
            joined_at,
            pools!inner(
              pool_id, pool_name, pool_code, status, prediction_deadline,
              prediction_mode, brand_name, brand_emoji, brand_color, brand_logo_url, tournament_id, is_private
            ),
            pool_entries(
              entry_id, match_points, bonus_points, current_rank,
              has_submitted_predictions, point_adjustment, scored_total_points
            )
          `,
          )
          .eq('user_id', userData.user_id)
          .order('joined_at', { ascending: false });

        if (pmErr) throw pmErr;

        const rows = (pmRows ?? []) as unknown as Array<{
          role: string;
          joined_at: string;
          pools: {
            pool_id: string;
            pool_name: string;
            pool_code: string;
            status: string;
            prediction_deadline: string | null;
            prediction_mode: string | null;
            brand_name: string | null;
            brand_emoji: string | null;
            brand_color: string | null;
            brand_logo_url: string | null;
            tournament_id: string;
            is_private: boolean | null;
          };
          pool_entries: Array<{
            entry_id: string;
            match_points: number | null;
            bonus_points: number | null;
            current_rank: number | null;
            has_submitted_predictions: boolean | null;
            point_adjustment: number | null;
            scored_total_points: number | null;
          }>;
        }>;

        const poolIds = rows.map((r) => r.pools.pool_id);
        const tournamentIds = Array.from(new Set(rows.map((r) => r.pools.tournament_id)));

        const counts: Record<string, number> = {};
        const initialsByPool: Record<string, string[]> = {};
        const entriesByPool: Record<string, number> = {};
        const tournamentMatchCount: Record<string, number> = {};
        const tournamentCompletedCount: Record<string, number> = {};
        const unreadByPool: Record<string, number> = {};

        const { data: memberReads } = await supabase
          .from('pool_members')
          .select('pool_id, last_read_at')
          .eq('user_id', userData.user_id);
        const lastReadByPool: Record<string, string | null> = {};
        for (const m of (memberReads ?? []) as Array<{ pool_id: string; last_read_at: string | null }>) {
          lastReadByPool[m.pool_id] = m.last_read_at;
        }

        await Promise.all([
          ...poolIds.map(async (pid) => {
            const { count } = await supabase
              .from('pool_members')
              .select('*', { count: 'exact', head: true })
              .eq('pool_id', pid);
            counts[pid] = count ?? 0;
          }),
          ...poolIds.map(async (pid) => {
            const { data: members } = await supabase
              .from('pool_members')
              .select('users!inner(full_name)')
              .eq('pool_id', pid)
              .order('joined_at', { ascending: true })
              .limit(3);
            initialsByPool[pid] = ((members ?? []) as Array<{ users: { full_name: string | null } | { full_name: string | null }[] }>)
              .map((m) => (Array.isArray(m.users) ? m.users[0] : m.users))
              .map((u) => initialsOf(u?.full_name));
          }),
          ...poolIds.map(async (pid) => {
            // pool_entries has no pool_id column — link via pool_members
            // (member_id FK). Counts every entry in the pool, which is the
            // denominator behind the "Rank X of Y" KPI on the dashboard.
            const { count } = await supabase
              .from('pool_entries')
              .select('entry_id, pool_members!inner(pool_id)', { count: 'exact', head: true })
              .eq('pool_members.pool_id', pid);
            entriesByPool[pid] = count ?? 0;
          }),
          ...tournamentIds.map(async (tid) => {
            const { count } = await supabase
              .from('matches')
              .select('*', { count: 'exact', head: true })
              .eq('tournament_id', tid);
            tournamentMatchCount[tid] = count ?? 0;
          }),
          ...tournamentIds.map(async (tid) => {
            // Drives the dashboard's "show rank KPI?" gate. Scoring
            // hasn't started until at least one match has flipped
            // is_completed = true; before that, rank is noise.
            const { count } = await supabase
              .from('matches')
              .select('*', { count: 'exact', head: true })
              .eq('tournament_id', tid)
              .eq('is_completed', true);
            tournamentCompletedCount[tid] = count ?? 0;
          }),
          ...poolIds.map(async (pid) => {
            const lastReadAt = lastReadByPool[pid];
            let query = supabase
              .from('pool_messages')
              .select('*', { count: 'exact', head: true })
              .eq('pool_id', pid)
              .neq('user_id', userData.user_id);
            if (lastReadAt) {
              query = query.gt('created_at', lastReadAt);
            }
            const { count } = await query;
            unreadByPool[pid] = count ?? 0;
          }),
        ]);

        // ---- Progressive pools: per-round "needs predictions" override ----
        // The dashboard's "X pools need predictions" count was wrong for
        // progressive pools because `has_submitted_predictions` on the entry
        // flips true after the first submission and stays true even when a
        // later round opens and hasn't been predicted yet. Mirror the iOS
        // logic: for progressive pools, look at the BEST entry's
        // entry_round_submissions vs the pool's open rounds.
        const progressivePoolIds: string[] = [];
        const bestEntryByProgressivePool: Record<string, string> = {};
        for (const row of rows) {
          if (row.pools.prediction_mode !== 'progressive') continue;
          const entries = row.pool_entries ?? [];
          if (entries.length === 0) continue;
          // Same best-entry rule as the cards: lowest rank, ties on scored
          // points (total_points is a dead legacy column — always 0)
          const best = entries.reduce((a, b) => {
            const aRank = a.current_rank ?? Number.MAX_SAFE_INTEGER;
            const bRank = b.current_rank ?? Number.MAX_SAFE_INTEGER;
            if (bRank < aRank) return b;
            if (bRank === aRank && (b.scored_total_points ?? 0) > (a.scored_total_points ?? 0)) return b;
            return a;
          });
          progressivePoolIds.push(row.pools.pool_id);
          bestEntryByProgressivePool[row.pools.pool_id] = best.entry_id;
        }
        const progressiveNeedsPredictions: Record<string, boolean> = {};
        if (progressivePoolIds.length > 0) {
          const bestProgressiveEntryIds = Object.values(bestEntryByProgressivePool);
          const [openRoundsRes, submissionsRes] = await Promise.all([
            supabase
              .from('pool_round_states')
              .select('pool_id, round_key')
              .in('pool_id', progressivePoolIds)
              .eq('state', 'open'),
            bestProgressiveEntryIds.length > 0
              ? supabase
                  .from('entry_round_submissions')
                  .select('entry_id, round_key, has_submitted')
                  .in('entry_id', bestProgressiveEntryIds)
              : Promise.resolve({ data: [] as Array<{ entry_id: string; round_key: string; has_submitted: boolean }> }),
          ]);
          const openRoundsByPool = new Map<string, Set<string>>();
          for (const r of (openRoundsRes.data ?? []) as Array<{
            pool_id: string;
            round_key: string;
          }>) {
            const set = openRoundsByPool.get(r.pool_id) ?? new Set<string>();
            set.add(r.round_key);
            openRoundsByPool.set(r.pool_id, set);
          }
          const submittedByEntry = new Map<string, Set<string>>();
          for (const s of (submissionsRes.data ?? []) as Array<{
            entry_id: string;
            round_key: string;
            has_submitted: boolean;
          }>) {
            if (!s.has_submitted) continue;
            const set = submittedByEntry.get(s.entry_id) ?? new Set<string>();
            set.add(s.round_key);
            submittedByEntry.set(s.entry_id, set);
          }
          for (const poolId of progressivePoolIds) {
            const openRounds = openRoundsByPool.get(poolId);
            if (!openRounds || openRounds.size === 0) {
              // No open rounds → nothing to predict right now.
              progressiveNeedsPredictions[poolId] = false;
              continue;
            }
            const bestEntryId = bestEntryByProgressivePool[poolId];
            const submitted = submittedByEntry.get(bestEntryId) ?? new Set<string>();
            let needs = false;
            for (const rk of openRounds) {
              if (!submitted.has(rk)) {
                needs = true;
                break;
              }
            }
            progressiveNeedsPredictions[poolId] = needs;
          }
        }

        const allEntryIdsForPreds = rows.flatMap((r) =>
          (r.pool_entries ?? []).map((e) => e.entry_id),
        );
        // Bracket-picker pools store picks in three separate tables, not in
        // `predictions`. Count those rows separately for the progress circle.
        const bracketPickerEntryIds = rows
          .filter((r) => r.pools.prediction_mode === 'bracket_picker')
          .flatMap((r) => (r.pool_entries ?? []).map((e) => e.entry_id));
        const predictionsByEntry: Record<string, number> = {};
        const formByEntry: Record<string, FormResult[]> = {};
        // Full accuracy aggregates per entry (every scored match, not just
        // the last 5 that drive the form indicator).
        const accuracyByEntry: Record<
          string,
          { totalCompleted: number; exactCount: number; correctCount: number }
        > = {};
        if (allEntryIdsForPreds.length > 0) {
          const [{ data: predRows }, { data: scoreFormRows }, bracketRes] = await Promise.all([
            supabase.from('predictions').select('entry_id').in('entry_id', allEntryIdsForPreds),
            supabase
              .from('match_scores')
              .select('entry_id, is_exact_score, is_correct_difference, is_correct_result, calculated_at')
              .in('entry_id', allEntryIdsForPreds)
              .order('calculated_at', { ascending: false }),
            bracketPickerEntryIds.length > 0
              ? Promise.all([
                  supabase
                    .from('bracket_picker_group_rankings')
                    .select('entry_id')
                    .in('entry_id', bracketPickerEntryIds),
                  supabase
                    .from('bracket_picker_third_place_rankings')
                    .select('entry_id')
                    .in('entry_id', bracketPickerEntryIds),
                  supabase
                    .from('bracket_picker_knockout_picks')
                    .select('entry_id')
                    .in('entry_id', bracketPickerEntryIds),
                ])
              : Promise.resolve(null),
          ]);
          for (const p of (predRows ?? []) as Array<{ entry_id: string }>) {
            predictionsByEntry[p.entry_id] = (predictionsByEntry[p.entry_id] ?? 0) + 1;
          }
          if (bracketRes) {
            for (const res of bracketRes) {
              for (const r of (res.data ?? []) as Array<{ entry_id: string }>) {
                predictionsByEntry[r.entry_id] = (predictionsByEntry[r.entry_id] ?? 0) + 1;
              }
            }
          }
          for (const s of (scoreFormRows ?? []) as Array<{
            entry_id: string;
            is_exact_score: boolean | null;
            is_correct_difference: boolean | null;
            is_correct_result: boolean | null;
          }>) {
            // Aggregate every scored match into the entry's accuracy bucket.
            const agg = accuracyByEntry[s.entry_id] ?? {
              totalCompleted: 0,
              exactCount: 0,
              correctCount: 0,
            };
            agg.totalCompleted += 1;
            if (s.is_exact_score) agg.exactCount += 1;
            if (s.is_exact_score || s.is_correct_difference || s.is_correct_result) {
              agg.correctCount += 1;
            }
            accuracyByEntry[s.entry_id] = agg;

            // Form indicator — last 5 only, ordered newest-first by query.
            const arr = formByEntry[s.entry_id] ?? [];
            if (arr.length >= 5) continue;
            const result: FormResult = s.is_exact_score
              ? 'exact'
              : s.is_correct_difference
                ? 'winner_gd'
                : s.is_correct_result
                  ? 'winner'
                  : 'miss';
            arr.push(result);
            formByEntry[s.entry_id] = arr;
          }
        }

        const allPools: PoolSummary[] = rows.map((row) => {
          const pool = row.pools;
          const entries = row.pool_entries ?? [];
          // "Best" = the entry holding the user's best (lowest) leaderboard
          // rank, so the card's points describe the same entry as its rank.
          // Unranked entries sort last; ties break on scored points. Replaces
          // best-by-total_points — a legacy column v2 scoring never writes
          // (0 for every entry), which silently degenerated to "first entry
          // returned" and showed an arbitrary entry's numbers.
          const best =
            entries.length > 0
              ? entries.reduce((a, b) => {
                  const aRank = a.current_rank ?? Number.MAX_SAFE_INTEGER;
                  const bRank = b.current_rank ?? Number.MAX_SAFE_INTEGER;
                  if (bRank < aRank) return b;
                  if (bRank === aRank && (b.scored_total_points ?? 0) > (a.scored_total_points ?? 0)) return b;
                  return a;
                })
              : null;

          const matchPoints = best?.match_points ?? 0;
          const bonusPoints = best?.bonus_points ?? 0;
          const adjustment = best?.point_adjustment ?? 0;
          const bestEntryId = best?.entry_id;

          return {
            poolId: pool.pool_id,
            poolName: pool.pool_name,
            poolCode: pool.pool_code,
            predictionMode: pool.prediction_mode,
            brandName: pool.brand_name,
            brandEmoji: pool.brand_emoji,
            brandColor: pool.brand_color,
            brandLogoUrl: pool.brand_logo_url,
            status: pool.status,
            predictionDeadline: pool.prediction_deadline,
            tournamentId: pool.tournament_id,
            memberCount: counts[pool.pool_id] ?? 0,
            memberInitials: initialsByPool[pool.pool_id] ?? [],
            // "Best position" across all of this user's entries in the pool —
            // lowest non-null current_rank. A user with entries at #4 and #10
            // sees #4 on the pool card, independent of which entry has the
            // higher total point count.
            currentRank: (() => {
              const ranks = entries
                .map((e) => e.current_rank)
                .filter((r): r is number => r != null);
              return ranks.length > 0 ? Math.min(...ranks) : null;
            })(),
            totalPoints: matchPoints + bonusPoints + adjustment,
            totalEntries: entriesByPool[pool.pool_id] ?? 0,
            hasScoringStarted: (tournamentCompletedCount[pool.tournament_id] ?? 0) > 0,
            hasSubmittedPredictions: entries.some((e) => e.has_submitted_predictions === true),
            // If the user has zero entries (e.g. an admin who deleted all
            // theirs), there is literally nothing to predict, so the
            // "predictions needed" card treatment and filter must skip
            // this pool. Without this guard the full/bracket branch below
            // evaluates `!(null?.has_submitted_predictions ?? false)` to
            // true and the card lit up as "needs predictions" with nothing
            // to actually click into. Progressive already short-circuits
            // upstream (the progressiveNeedsPredictions map skips empty
            // entry lists), so this guard only changes behavior for the
            // full / bracket branch — but applying it uniformly keeps the
            // semantics obvious to future readers.
            needsPredictions:
              entries.length === 0
                ? false
                : pool.prediction_mode === 'progressive'
                  ? progressiveNeedsPredictions[pool.pool_id] ?? false
                  : !(best?.has_submitted_predictions ?? false),
            predictionsCompleted: bestEntryId ? predictionsByEntry[bestEntryId] ?? 0 : 0,
            // Bracket picker has a fixed 92-item slate (48 group + 12 third-place
            // + 32 knockout); pick'em modes use the tournament's match count.
            predictionsTotal:
              pool.prediction_mode === 'bracket_picker'
                ? 92
                : tournamentMatchCount[pool.tournament_id] ?? 0,
            role: row.role,
            joinedAt: row.joined_at,
            isPrivate: !!pool.is_private,
            formResults: bestEntryId ? formByEntry[bestEntryId] ?? [] : [],
            accuracyStats: bestEntryId ? accuracyByEntry[bestEntryId] ?? null : null,
            unreadBanterCount: unreadByPool[pool.pool_id] ?? 0,
          };
        });

        const activePools = allPools.filter(
          (p) => p.status === 'open' || p.status === 'active',
        );

        activePools.sort((a, b) => {
          // 1. Branded (sponsored) pools always come first
          const aBranded = a.brandName ? 0 : 1;
          const bBranded = b.brandName ? 0 : 1;
          if (aBranded !== bBranded) return aBranded - bBranded;

          // 2. Pools that need predictions before ones already submitted
          if (a.hasSubmittedPredictions !== b.hasSubmittedPredictions) {
            return a.hasSubmittedPredictions ? 1 : -1;
          }

          // 3. Highest total points first
          if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;

          // 4. Alphabetical by pool name
          return a.poolName.localeCompare(b.poolName);
        });

        const totalPoints = activePools.reduce((s, p) => s + p.totalPoints, 0);
        const bestRank = activePools
          .filter((p) => p.currentRank !== null)
          .reduce<number | null>((best, p) => {
            if (best === null) return p.currentRank;
            return p.currentRank! < best ? p.currentRank : best;
          }, null);

        const allEntryIds = rows.flatMap((r) => (r.pool_entries ?? []).map((e) => e.entry_id));
        let bestStreak = 0;
        if (allEntryIds.length > 0) {
          const { data: scoreRows } = await supabase
            .from('match_scores')
            .select('entry_id, points_earned, calculated_at')
            .in('entry_id', allEntryIds)
            .order('calculated_at', { ascending: false });

          const byEntry = new Map<string, number[]>();
          for (const s of (scoreRows ?? []) as Array<{ entry_id: string; points_earned: number | null }>) {
            const arr = byEntry.get(s.entry_id) ?? [];
            arr.push(s.points_earned ?? 0);
            byEntry.set(s.entry_id, arr);
          }
          for (const points of byEntry.values()) {
            let streak = 0;
            for (const p of points) {
              if (p > 0) streak += 1;
              else break;
            }
            if (streak > bestStreak) bestStreak = streak;
          }
        }

        const [liveRes, upcomingRes] = await Promise.all([
          supabase
            .from('matches')
            .select(MATCH_SELECT)
            .eq('status', 'live')
            .order('match_date', { ascending: true }),
          supabase
            .from('matches')
            .select(MATCH_SELECT)
            .in('status', ['scheduled', 'upcoming'])
            .order('match_date', { ascending: true })
            .limit(5),
        ]);

        const liveMatches: MatchSummary[] = ((liveRes.data ?? []) as Record<string, unknown>[]).map(
          normalizeMatch,
        );
        const upcoming: MatchSummary[] = ((upcomingRes.data ?? []) as Record<string, unknown>[]).map(
          normalizeMatch,
        );

        const nextMatch = upcoming[0] ?? null;
        const matchesToday = nextMatch
          ? upcoming.filter((m) => {
              const md = new Date(m.matchDate);
              const nd = new Date(nextMatch.matchDate);
              return (
                md.getFullYear() === nd.getFullYear() &&
                md.getMonth() === nd.getMonth() &&
                md.getDate() === nd.getDate()
              );
            }).length
          : 0;

        const daysUntilKickoff = computeDaysUntilKickoff();

        setData({
          appUserId: userData.user_id,
          fullName: userData.full_name,
          username: userData.username,
          email: (userData as { email?: string | null }).email ?? null,
          memberSince: (userData as { created_at?: string | null }).created_at ?? null,
          pools: activePools,
          totalPoints,
          bestRank,
          bestStreak,
          liveMatches,
          nextMatch,
          matchesToday,
          upcomingMatches: upcoming,
          daysUntilKickoff,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load home data';
        setError(message);
        console.warn('[useHomeData]', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
        lastLoadedAtRef.current = Date.now();
      }
    },
    [user],
  );

  useEffect(() => {
    if (user) load('initial');
  }, [user, load]);

  const refresh = useCallback(() => load('refresh'), [load]);
  // Tab-focus refresh helper. Hits the network only if the cached data has
  // gone stale (older than `STALE_AFTER_MS`). Otherwise it's a no-op and
  // the user sees the cached data instantly with no spinner — the same
  // stale-while-revalidate behaviour that TanStack Query / SWR default to.
  const refreshIfStale = useCallback(() => {
    if (Date.now() - lastLoadedAtRef.current > STALE_AFTER_MS) {
      void load('refresh');
    }
  }, [load]);

  // Surgical update for new banter messages — increments the unread count
  // for ONE pool without re-fetching the entire dashboard. This is what the
  // realtime channel in HomeDataProvider calls on a `pool_messages` INSERT.
  const bumpPoolUnread = useCallback((poolId: string) => {
    setData((prev) => {
      if (!prev) return prev;
      let touched = false;
      const pools = prev.pools.map((p) => {
        if (p.poolId !== poolId) return p;
        touched = true;
        return { ...p, unreadBanterCount: p.unreadBanterCount + 1 };
      });
      if (!touched) return prev;
      return { ...prev, pools };
    });
  }, []);

  // Inverse of `bumpPoolUnread`: called by the banter screen when the user
  // marks a pool's messages as read, so the dashboard badge clears instantly
  // instead of waiting for the next stale-refresh cycle. Idempotent — sets
  // the count to 0 regardless of previous value.
  const clearPoolUnread = useCallback((poolId: string) => {
    setData((prev) => {
      if (!prev) return prev;
      let touched = false;
      const pools = prev.pools.map((p) => {
        if (p.poolId !== poolId) return p;
        if (p.unreadBanterCount === 0) return p;
        touched = true;
        return { ...p, unreadBanterCount: 0 };
      });
      if (!touched) return prev;
      return { ...prev, pools };
    });
  }, []);

  return {
    data,
    loading,
    refreshing,
    error,
    refresh,
    refreshIfStale,
    bumpPoolUnread,
    clearPoolUnread,
  };
}

export function getGreeting(date = new Date()): 'Good Morning' | 'Good Afternoon' | 'Good Evening' {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}
