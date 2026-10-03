// Crews — react-query hooks over the crew routes (web: app/api/crews/*).
//
// Reads go through the API, not PostgREST: the crew tables are deny-all (migration 154), so a
// direct read would return [] with no error — the silent failure the deny-all guard test exists for.
// After any change, `invalidateCrews` refreshes the list, the crew, and Activity's Needs you.

import { useQuery, type QueryClient } from '@tanstack/react-query';

import { fetchCrew, fetchCrewRoster, fetchMyCrews, fetchPoolCrew } from './api';

export const crewKeys = {
  mine: ['crews'] as const,
  one: (crewId: string) => ['crew', crewId] as const,
  roster: (crewId: string, tier: string) => ['crew-roster', crewId, tier] as const,
  pool: (poolId: string) => ['pool-crew', poolId] as const,
};

export function useMyCrews() {
  return useQuery({ queryKey: crewKeys.mine, queryFn: async () => (await fetchMyCrews()).crews });
}

export function useCrew(crewId: string | null | undefined) {
  return useQuery({
    queryKey: crewKeys.one(crewId ?? ''),
    queryFn: () => fetchCrew(crewId!),
    enabled: Boolean(crewId),
  });
}

export function useCrewRoster(crewId: string | null | undefined, tier = 'free') {
  return useQuery({
    queryKey: crewKeys.roster(crewId ?? '', tier),
    queryFn: () => fetchCrewRoster(crewId!, tier),
    enabled: Boolean(crewId),
    // The roster is a snapshot for one decision; always fresh when the review opens.
    staleTime: 0,
  });
}

export function invalidateCrews(client: QueryClient, crewId?: string) {
  void client.invalidateQueries({ queryKey: crewKeys.mine });
  if (crewId) void client.invalidateQueries({ queryKey: crewKeys.one(crewId) });
}

/** A pool's crew line. Renders nothing for a pool with no crew, and nothing if the API can't answer. */
export function usePoolCrew(poolId: string | null | undefined) {
  return useQuery({
    queryKey: crewKeys.pool(poolId ?? ''),
    queryFn: () => fetchPoolCrew(poolId!),
    enabled: Boolean(poolId),
    retry: false,
  });
}
