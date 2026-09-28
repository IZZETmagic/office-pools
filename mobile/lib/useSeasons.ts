import { useCallback, useEffect, useMemo, useState } from 'react';

import { useHomeData } from '@/lib/HomeDataProvider';
import { groupSeasons, type SeasonSection, type SeasonTournament } from '@/lib/profileHub';
import { supabase } from '@/lib/supabase';
import { useArchivedPools } from '@/lib/useArchivedPools';
import type { PoolSummary } from '@/lib/useHomeData';

/**
 * Every competition the member has played, for the Seasons page.
 *
 * Pools come from Home data's `allPools` (finished ones included — `pools` is
 * active-only). The one extra read is the competitions' names and dates, which
 * Home data never needed.
 *
 * ⚠ NULL UNTIL THE ARCHIVED LIST LANDS, for the same reason as `usePodium`:
 * grouping before it arrives would show an archived pool and then remove it.
 *
 * ⚠ THE TOURNAMENT READ'S ERROR IS READ. Without names the page still groups
 * correctly — each section just says "Competition" — so a failure degrades the
 * headings rather than the page.
 */
export function useSeasons(): {
  sections: SeasonSection<PoolSummary>[] | null;
  refresh: () => Promise<void>;
} {
  const { data, refresh: refreshHome } = useHomeData();
  const { rows: archived } = useArchivedPools();
  const [tournaments, setTournaments] = useState<SeasonTournament[]>([]);

  const ids = useMemo(
    () => [...new Set((data?.allPools ?? []).map((p) => p.tournamentId))].sort(),
    [data?.allPools],
  );
  const idsKey = ids.join(',');

  const loadTournaments = useCallback(async () => {
    if (ids.length === 0) return;
    const { data: rows, error } = await supabase
      .from('tournaments')
      .select('tournament_id, name, start_date, end_date')
      .in('tournament_id', ids);
    if (error) {
      console.warn('[useSeasons] tournaments', error.message);
      return;
    }
    setTournaments(
      ((rows ?? []) as {
        tournament_id: string;
        name: string;
        start_date: string | null;
        end_date: string | null;
      }[]).map((t) => ({
        tournamentId: t.tournament_id,
        name: t.name,
        startDate: t.start_date,
        endDate: t.end_date,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the id list's contents
  }, [idsKey]);

  useEffect(() => {
    void loadTournaments();
  }, [loadTournaments]);

  const sections = useMemo(() => {
    if (!data || archived === null) return null;
    return groupSeasons(data.allPools, tournaments, new Set(archived.map((a) => a.poolId)));
  }, [data, archived, tournaments]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshHome(), loadTournaments()]);
  }, [refreshHome, loadTournaments]);

  return { sections, refresh };
}
