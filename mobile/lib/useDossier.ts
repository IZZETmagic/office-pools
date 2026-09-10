import { useCallback, useEffect, useState } from 'react';

import { fetchDossier, type DossierResponse } from './api';

// =============================================================
// The opponent dossier, fetched
// =============================================================
// ⚠ THE SEAL IS THE SERVER'S AND THIS HOOK ADDS NOTHING TO IT. Only picks whose
// matchweek has locked are ever counted, decided against
// `league_matchweeks.lock_at` inside `readOpponentPicks`. There is deliberately
// no gate here: a second copy of the rule is a second place for it to be wrong,
// and the caller passing an entry id is not the caller being entitled to it —
// the route decides that too.
//
// ⚠ NOT LAZY, UNLIKE `useLeaguePoolPicks`. That one pulls every revealed pick in
// the pool — thousands of rows by May — so it is gated on there being something
// to read. This is one entry's finished summary: a few hundred bytes, computed
// in the database, and it is only ever fetched because somebody opened a screen
// that is entirely made of it.
// =============================================================

export function useDossier(poolId: string | undefined, entryId: string | undefined) {
  const [data, setData] = useState<DossierResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!poolId || !entryId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDossier(poolId, entryId);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the scout report');
      console.warn('[useDossier]', err);
    } finally {
      setLoading(false);
    }
  }, [poolId, entryId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refresh: load };
}
