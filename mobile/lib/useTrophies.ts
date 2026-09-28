import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { tallyBadges, type BadgeTally } from '@/lib/profileHub';

// =============================================================
// The member's lifetime badges, from the append-only `badge_unlocks` ledger
// =============================================================
// Lifted out of the Profile tab's old inline Trophy Case so the hub (the
// avatar card's Badges stat and the Trophy Room tile) and the Trophy Room page
// read ONE number. Two surfaces counting badges separately is how the web and
// the phone came to disagree about levels.
//
// Archived pools are excluded (migration 040): an archived pool stops counting
// toward trophies until it is restored. `!inner` makes the embedded pools row a
// join rather than a left-join, so `.is()` on it actually filters the outer
// rows. Must stay in step with the web Trophy Case (app/profile/ProfilePage.tsx).
//
// ⚠ THE ERROR IS READ, NOT DISCARDED. The old inline read did
// `const { data } = await …`, which turns a 400 into "No trophies yet" forever.
// =============================================================

export function useTrophies() {
  const { user } = useAuth();
  const [badges, setBadges] = useState<BadgeTally[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('user_id')
        .eq('auth_user_id', user.id)
        .single();
      if (userErr) throw userErr;
      const appUserId = (userRow as { user_id: string } | null)?.user_id;
      if (!appUserId) {
        setBadges([]);
        return;
      }
      const { data, error: unlockErr } = await supabase
        .from('badge_unlocks')
        .select('badge_id, pool_id, unlocked_at, pool:pools!inner(pool_name, archived_at)')
        .eq('user_id', appUserId)
        .is('pool.archived_at', null);
      if (unlockErr) throw unlockErr;
      setBadges(
        tallyBadges(
          ((data ?? []) as unknown as {
            badge_id: string;
            pool_id: string;
            unlocked_at: string | null;
            pool: { pool_name: string } | null;
          }[]).map((r) => ({
            badgeId: r.badge_id,
            poolId: r.pool_id,
            poolName: r.pool?.pool_name ?? null,
            unlockedAt: r.unlocked_at,
          })),
        ),
      );
    } catch (err) {
      console.warn('[useTrophies]', err);
      setError(err instanceof Error ? err.message : 'Could not load your badges');
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = badges?.reduce((s, b) => s + b.count, 0) ?? null;

  return { badges, total, error, refresh: load };
}
