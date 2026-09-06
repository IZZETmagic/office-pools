import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { apiFetch } from './api';
import { leaseBroadcast } from './realtimeLease';

// =============================================================
// THE NUMBERS THAT MOVE WHILE YOU WATCH
// =============================================================
// `/api/pools/:id/league` is a page-load read — clubs, 380 fixtures, standings,
// every duel — and its own header forbids polling it. That is the right rule
// and it leaves a hole: during a live matchweek the duel scoreline and the
// ticking minute are exactly the things that must not be a page-load snapshot.
//
// `/duel-live` is the route that fills it, and it already existed for the web:
// ten fixtures and a points map, roughly 2 kB against the league payload's 165.
// Nothing on the phone was calling it.
//
// ## How it stays fresh, and why it is BOTH
//
// Migration 125 broadcasts `fixtures_update` on `pool:{id}:leaderboard` every
// time the sync writes something that genuinely moved. That is the primary
// signal and it arrives in about a second.
//
// ⚠ IT IS A DOORBELL HERE, NOT AN APPLY — deliberately, and unlike
// `useTournamentMatches`, which applies the same payload directly. The
// difference is what the payload contains: fixture state, and no duel points.
// Points are computed from score rows the broadcast does not carry, so a member
// who applied the payload would watch the minute tick to 90' while the duel
// scoreline sat where it was at kickoff — which is the exact bug `/duel-live`
// was written to fix, reintroduced one layer up.
//
// ⚠ AND A POLL UNDERNEATH IT, because Realtime is a pipe and not a log: a
// message sent while the socket was down is simply gone, and a phone that has
// been in a pocket has had its socket down. The web has the same fallback for
// the same reason. Sixty seconds is slower than the doorbell and far cheaper
// than the truth being wrong until the next tab switch.
export const duelLiveQueryKey = (poolId: string, matchweek: number) =>
  ['duel-live', poolId, matchweek] as const;

/** One fixture's live state, exactly as `/duel-live` sends it. */
export type LiveFixture = {
  number: number;
  homeScore: number | null;
  awayScore: number | null;
  status: string | null;
  isCompleted: boolean;
  liveMinute: number | null;
  livePeriod: string | null;
  liveAdded: number | null;
};

type DuelLiveResponse = {
  inPlayMatchweek: number;
  /** Running duel points this matchweek, by entry. */
  points: Record<string, number>;
  /** The same, broken down by fixture number. */
  perFixture: Record<string, Record<string, number>>;
  fixtures: LiveFixture[];
};

export type DuelLive = {
  /** Running points this matchweek, by entry id. Empty until the first fetch. */
  points: Map<string, number>;
  /** Points by entry, then by FIXTURE NUMBER — not fixture id. */
  perFixture: Map<string, Map<number, number>>;
  fixtures: LiveFixture[];
};

const EMPTY: DuelLive = { points: new Map(), perFixture: new Map(), fixtures: [] };

/**
 * The live half of a Showdown matchweek.
 *
 * ⚠ THE MATCHWEEK IS PASSED IN, never re-derived. The route insists on it for
 * the reason its own header gives: deriving it means reading the whole season,
 * which is a page-load read and not a poll read. The caller already holds
 * `inPlayMatchweekNumber` from the contract.
 *
 * Null matchweek — no week is being played — disables the query outright, so
 * an idle pool costs nothing at all.
 */
export function useDuelLive(
  poolId: string | null | undefined,
  matchweek: number | null,
  /**
   * Is this week still being played?
   *
   * ⚠ THE ROOM ASKS FOR SETTLED WEEKS TOO, and a settled matchweek cannot
   * change — polling one every minute buys nothing and holds a subscription for
   * a scoreline that was final in August. The route is happy to serve any week
   * (its own header says so: what people scored in a past week is already on
   * the team sheet), so the fetch stays and only the refresh goes.
   */
  live = true,
): DuelLive {
  const queryClient = useQueryClient();
  const enabled = Boolean(poolId) && matchweek !== null;

  const query = useQuery({
    queryKey: duelLiveQueryKey(poolId ?? '', matchweek ?? -1),
    queryFn: () =>
      apiFetch<DuelLiveResponse>(`/api/pools/${poolId}/duel-live?matchweek=${matchweek}`),
    enabled,
    // See the header: the fallback, not the mechanism.
    refetchInterval: live ? 60_000 : false,
  });

  useEffect(() => {
    if (!enabled || !live || !poolId || matchweek === null) return;
    // ⚠ `leaseBroadcast`, never `supabase.channel` directly. Channels dedupe by
    // topic, so a raw `unsubscribe()` here would end `pool:{id}:leaderboard`
    // for the live leaderboard holding the same topic — silently, and only for
    // whoever unmounted second.
    return leaseBroadcast(`pool:${poolId}:leaderboard`, 'fixtures_update', () => {
      void queryClient.invalidateQueries({
        queryKey: duelLiveQueryKey(poolId, matchweek),
      });
    });
  }, [enabled, live, poolId, matchweek, queryClient]);

  return useMemo(() => {
    const data = query.data;
    if (!data) return EMPTY;
    return {
      points: new Map(Object.entries(data.points ?? {})),
      // ⚠ Keys come back as STRINGS — they were object keys over JSON — and the
      // fixture numbers they are compared against are numbers. Coercing here is
      // what stops every lookup silently missing.
      perFixture: new Map(
        Object.entries(data.perFixture ?? {}).map(([entryId, byFixture]) => [
          entryId,
          new Map(Object.entries(byFixture).map(([n, pts]) => [Number(n), pts])),
        ]),
      ),
      fixtures: data.fixtures ?? [],
    };
  }, [query.data]);
}
