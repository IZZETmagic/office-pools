import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Drain `banter_media_deletions` (160): remove each queued file from `banter-media` through the
 * Storage API, then clear its queue row.
 *
 * ⚠ Must be given the ADMIN client. SQL cannot delete storage objects (storage.protect_delete
 * raises), the queue is invisible to members, and only the uploader may delete through RLS —
 * an admin removing someone else's photo needs the service role.
 *
 * A path Storage no longer has is treated as done: `remove` reports only what it deleted, and a
 * file that is already gone is exactly the outcome we wanted. A failed batch keeps its rows,
 * bumps `attempts` and records the error for the next run.
 */
export const SWEEP_BATCH = 100

export type SweepResult = { removed: number; cleared: number; failed: number }

export async function sweepBanterMedia(admin: SupabaseClient, limit = SWEEP_BATCH): Promise<SweepResult> {
  const { data: queued, error } = await admin
    .from('banter_media_deletions')
    .select('path, attempts')
    .order('queued_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  const rows = (queued ?? []) as { path: string; attempts: number }[]
  if (rows.length === 0) return { removed: 0, cleared: 0, failed: 0 }

  const paths = rows.map(r => r.path)
  const { data: removed, error: rmErr } = await admin.storage.from('banter-media').remove(paths)

  if (rmErr) {
    const message = rmErr.message.slice(0, 500)
    await Promise.all(
      rows.map(r =>
        admin
          .from('banter_media_deletions')
          .update({ attempts: r.attempts + 1, last_error: message })
          .eq('path', r.path),
      ),
    )
    console.error('[sweepBanterMedia] remove failed:', rmErr)
    return { removed: 0, cleared: 0, failed: rows.length }
  }

  const { error: clearErr } = await admin.from('banter_media_deletions').delete().in('path', paths)
  if (clearErr) throw clearErr
  return { removed: removed?.length ?? 0, cleared: paths.length, failed: 0 }
}
