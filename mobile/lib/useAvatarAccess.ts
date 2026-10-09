import { useEffect, useState } from 'react';

import {
  GATED_ASSETS_SELECT,
  toAvatarAccess,
  type AvatarAccess,
  type GatedAssetRow,
} from './avatar/storedConfig';
import { supabase } from './supabase';

// =============================================================
// Which gated avatar assets this member owns — migration 183
// =============================================================
// The phone's twin of components/avatar/useAvatarAccess.ts. One request: `avatar_gated_assets`
// with the caller's own grant embedded; RLS on the grants table returns only their rows.
//
// ⚠ `access` stays NULL until the read lands, and the editor must not draw the gateable grids
// until it does — without the gated list a gated key and a free one look identical. See the note
// above `GATEABLE_SLOTS` in lib/avatar/storedConfig.ts.
//
// ⚠ NOT cached at module scope, unlike the art. Ownership changes when a grant lands, and the
// editor is opened rarely enough that one small read per open is the honest price.
// =============================================================

export type AvatarAccessState = {
  access: AvatarAccess | null;
  error: string | null;
};

export function useAvatarAccess(enabled: boolean): AvatarAccessState {
  const [access, setAccess] = useState<AvatarAccess | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const { data, error: readErr } = await supabase
        .from('avatar_gated_assets')
        .select(GATED_ASSETS_SELECT);
      if (cancelled) return;
      // ⚠ Captured, never discarded: a swallowed 400 would look exactly like "nothing is gated".
      if (readErr) {
        console.warn('[avatar editor] could not read gated assets:', readErr.message);
        setError('Could not load your avatar options.');
        return;
      }
      setAccess(toAvatarAccess((data ?? []) as GatedAssetRow[]));
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { access, error };
}
