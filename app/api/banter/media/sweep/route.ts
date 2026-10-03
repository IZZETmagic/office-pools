import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sweepBanterMedia } from '@/lib/banter/mediaSweep'

/**
 * POST /api/banter/media/sweep
 *
 * Removes deleted photos' files from `banter-media` (160). Two callers:
 *
 *  - The app and the web, right after deleting a photo message, so the photo disappears at once
 *    (its signed URLs die with the file). Any signed-in member may call it: it only drains the
 *    queue, which holds nothing but paths whose messages are already deleted, so there is no
 *    input to abuse and nothing to read back.
 *  - The cron (161), with Bearer CRON_SECRET. Only the cron also queues ORPHANS — uploads a day
 *    old that no message points at — and drains up to five batches.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const isCron = !!cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`

  if (!isCron) {
    const auth = await requireAuth()
    if (auth.error) return auth.error
  }

  const admin = createAdminClient()
  let orphansQueued = 0
  if (isCron) {
    const { data, error } = await admin.rpc('enqueue_banter_media_orphans')
    if (error) console.error('[BanterMediaSweep] orphan scan failed:', error)
    else orphansQueued = (data as number) ?? 0
  }

  try {
    const total = { removed: 0, cleared: 0, failed: 0 }
    for (let i = 0; i < (isCron ? 5 : 1); i++) {
      const r = await sweepBanterMedia(admin)
      total.removed += r.removed
      total.cleared += r.cleared
      total.failed += r.failed
      if (r.cleared === 0) break
    }
    return NextResponse.json({ ...total, orphans_queued: orphansQueued })
  } catch (err) {
    console.error('[BanterMediaSweep] failed:', err)
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 })
  }
}

// Cron jobs here call GET or POST; accept both.
export const GET = POST
