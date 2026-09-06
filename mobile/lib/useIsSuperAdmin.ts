// Returns whether the currently signed-in user is a super admin.
//
// Reads `users.is_super_admin` for the current `auth_user_id`. Result is fetched
// once per mount and cached in component state — super-admin status changes
// rarely enough that we don't need realtime invalidation. Defaults to `false`
// while loading and when signed out.
//
// Used by the Profile screen to gate developer-only entries (e.g. the Showdown
// reveal playground) so they don't appear for regular users in production builds.

import { useEffect, useState } from 'react';

import { useAuth } from './auth';
import { supabase } from './supabase';

export function useIsSuperAdmin(): { isSuperAdmin: boolean; loading: boolean } {
  const { user } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setIsSuperAdmin(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase
      .from('users')
      .select('is_super_admin')
      .eq('auth_user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setIsSuperAdmin(Boolean(data?.is_super_admin));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { isSuperAdmin, loading };
}
