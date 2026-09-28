import { useMemo } from 'react';

import { useHomeData } from '@/lib/HomeDataProvider';
import { podiumFinishes, type Podium } from '@/lib/profileHub';
import { useArchivedPools } from '@/lib/useArchivedPools';

/**
 * The member's 1st / 2nd / 3rd finishes, for the Trophy Room and its hub tile.
 *
 * Reads `allPools` (every membership, finished ones included) — `pools` is the
 * active-only view and would never contain a finish.
 *
 * ⚠ NULL UNTIL BOTH READS LAND. The archived list decides which finishes count;
 * computing before it arrives would briefly count an archived pool's title and
 * then take it away.
 */
export function usePodium(): Podium | null {
  const { data } = useHomeData();
  const { rows: archived } = useArchivedPools();

  return useMemo(() => {
    if (!data || archived === null) return null;
    return podiumFinishes(data.allPools, new Set(archived.map((a) => a.poolId)));
  }, [data, archived]);
}
