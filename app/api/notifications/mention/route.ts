import { NextRequest, NextResponse, after } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { syncContactToResend } from '@/lib/email/contacts'
import { queueChatMentions } from '@/lib/banter/chatNotices'
import { dispatch } from '@/lib/notifications/outbox'
import { COMPOSERS } from '@/lib/notifications/composers'

/**
 * POST /api/notifications/mention
 *
 * Called by the pool chat — web and app — straight after a message that @mentions people is
 * posted. Body: { pool_id } — message_content and mentioned_user_ids are ignored (older app
 * builds still send them, harmlessly).
 *
 * ⚠ BUILT FROM THE MESSAGE, NEVER FROM THE REQUEST (2026-10-06). This used to email whatever
 * text it was sent to whatever user ids it was given, members of the pool or not — so anyone who
 * could see a public pool could email anybody on the site from SportPool's address. Now the
 * mentions are the ones stored on the caller's own recent messages in the pool, and only people
 * actually in it are told. Queued per message and person, sent by the notification outbox.
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

  const admin = createAdminClient()
  const queued = await queueChatMentions(admin, body.pool_id, userData.user_id)
  if (queued.length > 0) {
    after(async () => {
      // The mention email goes under the Community topic, which needs each recipient to be a
      // Resend contact — the app's sign-up never makes one — so make sure, as this route did.
      try {
        const { data: rows } = await admin.from('notification_outbox').select('user_id').in('outbox_id', queued)
        const ids = [...new Set(((rows ?? []) as Array<{ user_id: string | null }>).map((r) => r.user_id).filter((u): u is string => !!u))]
        const { data: users } = await admin.from('users').select('email, username, full_name').in('user_id', ids)
        await Promise.allSettled(((users ?? []) as Array<{ email: string; username: string; full_name: string | null }>).map((u) => {
          const nameParts = (u.full_name || '').split(' ')
          return syncContactToResend({ email: u.email, firstName: nameParts[0] || u.username, lastName: nameParts.slice(1).join(' ') || undefined })
        }))
      } catch (err) {
        console.error('[Mention] contact sync failed; sending anyway:', err)
      }
      await dispatch(admin, COMPOSERS, { ids: queued }).catch((err) =>
        console.error('[Mention] dispatch failed; the outbox will retry:', err))
    })
  }
  return NextResponse.json({ sent: true, count: queued.length })
}
