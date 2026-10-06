import { NextRequest, NextResponse, after } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { queueChatMessages } from '@/lib/banter/chatNotices'
import { dispatch } from '@/lib/notifications/outbox'
import { COMPOSERS } from '@/lib/notifications/composers'

/**
 * POST /api/notifications/message
 *
 * Called by the pool chat straight after a message is posted: a push to every member but the
 * sender. Body: { pool_id } — anything else is ignored.
 *
 * ⚠ BUILT FROM THE MESSAGE, NEVER FROM THE REQUEST (2026-10-06). This used to push whatever
 * text and sender name it was sent. Now the push is built from the caller's own messages in the
 * pool from the last two minutes, queued per message and person (so a repeat queues nothing) and
 * sent by the notification outbox. See lib/banter/chatNotices.ts.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  let body: { pool_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.pool_id) return NextResponse.json({ error: 'pool_id is required' }, { status: 400 })

  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', body.pool_id)
    .eq('user_id', userData.user_id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Not a member of this pool' }, { status: 403 })

  const queued = await queueChatMessages(createAdminClient(), body.pool_id, userData.user_id)
  if (queued.length > 0) {
    after(() => dispatch(createAdminClient(), COMPOSERS, { ids: queued }).then(
      () => undefined,
      (err) => console.error('[MessagePush] dispatch failed; the outbox will retry:', err),
    ))
  }
  return NextResponse.json({ sent: true, count: queued.length })
}
