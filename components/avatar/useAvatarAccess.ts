'use client'

// =============================================================
// Which gated avatar assets this member owns — migration 183
// =============================================================
// ⭐ One request: `avatar_gated_assets` with the caller's own grant embedded. RLS on the grants
// table returns only their rows, so an asset they do not own arrives with an empty embed.
//
// ⚠ `access` stays NULL until the read lands, and the editor must not draw the gateable grids
// until it does — see the note above `GATEABLE_SLOTS` in lib/avatar/storedConfig.ts. The error is
// captured, never discarded: a swallowed 400 would look exactly like "nothing is gated".
// =============================================================

import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  GATED_ASSETS_SELECT, toAvatarAccess, type AvatarAccess, type GatedAssetRow,
} from '@/lib/avatar/storedConfig'

export type AvatarAccessState = {
  access: AvatarAccess | null
  error: string | null
}

export function useAvatarAccess(supabase: SupabaseClient): AvatarAccessState {
  const [access, setAccess] = useState<AvatarAccess | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('avatar_gated_assets')
      .select(GATED_ASSETS_SELECT)
      .then(({ data, error: readErr }) => {
        if (cancelled) return
        if (readErr) {
          console.error('[avatar] could not read gated assets:', readErr.message)
          setError('Could not load your avatar options.')
          return
        }
        setAccess(toAvatarAccess((data ?? []) as GatedAssetRow[]))
      })
    return () => {
      cancelled = true
    }
  }, [supabase])

  return { access, error }
}
