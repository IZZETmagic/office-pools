import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { getResendClient } from '@/lib/email/resend'
import { querySegment, SEGMENTS } from '@/lib/email/segments'
import { TOPICS } from '@/lib/email/topics'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/paginate'
import { resolveSendMode } from '@/lib/email/sendMode'

// =============================================================
// GET /api/admin/broadcast
// List all broadcasts from Resend (persisted history).
//
// POST /api/admin/broadcast
// Send a broadcast email to EVERYONE through Resend Broadcasts.
//
// Body: { subject, html, segment?: 'all', kind?: 'sportpool_news' | 'policy_update', dry_run?, idempotency_key? }
//
// ⚠ EVERYONE ONLY (Ryan, 2026-10-07). It used to take any segment, and for any
// but "all" it cleared and refilled ONE shared Resend list ("Broadcast Target")
// before sending — so two broadcasts in flight could overwrite each other's
// recipients. A list per broadcast was not possible: Resend adds contacts one
// request at a time, about two a second, ~40 minutes for everyone. So Broadcast
// now sends only to the fixed "General" segment (RESEND_AUDIENCE_ID — Resend
// turned audiences into segments with the same ids), and nothing is rebuilt. A
// smaller group goes through Templates → Custom, which sends as News from
// SportPool to just them.
//
// ⚠ THE NEWS SWITCH. Every broadcast carries the News from SportPool topic
// (RESEND_TOPIC_NEWS, migration 179), so Resend skips whoever switched it off —
// and a broadcast is REFUSED while that topic is not configured, rather than
// sent past members' switches. Resend keeps its one-click unsubscribe and its
// first-name fill-in, which is why Broadcast stays on Resend at all.
//
// ⚠ POLICY UPDATES (migration 180): a Terms or Privacy update is `kind:
// 'policy_update'` — always delivered, so it goes WITHOUT the News topic and
// leaves nobody out for having switched News off. Only unsubscribing from all
// our email stops it: Resend never broadcasts to a contact who did that.
//
// ⚠ SAFE BY DEFAULT (2026-10-05) — see lib/email/sendMode.ts. A body PREVIEWS
// unless it says `dry_run: false`, and a real send must carry an
// idempotency_key, recorded BEFORE anything is sent — so a duplicate is refused.
// =============================================================

export async function GET() {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { supabase } = auth.data

  const resend = getResendClient()
  const [broadcastsRes, logsRes] = await Promise.all([
    resend.broadcasts.list(),
    supabase
      .from('broadcast_log')
      .select('broadcast_id, subject, segment, recipient_count, recipients, sent_at, sent_by')
      .order('sent_at', { ascending: false }),
  ])

  if (broadcastsRes.error) {
    console.error('[Broadcast] Failed to list:', broadcastsRes.error)
    return NextResponse.json({ error: 'Failed to list broadcasts' }, { status: 500 })
  }

  // Index logs by broadcast_id for easy lookup
  const logs = logsRes.data || []
  const logsByBroadcastId: Record<string, typeof logs[number]> = {}
  for (const log of logs) {
    logsByBroadcastId[log.broadcast_id] = log
  }

  // Merge Resend broadcasts with our log data
  const broadcasts = (broadcastsRes.data?.data || []).map((b: any) => ({
    ...b,
    log: logsByBroadcastId[b.id] || null,
  }))

  return NextResponse.json({ broadcasts })
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { supabase } = auth.data

  try {
    const body = await request.json()
    const { subject, html } = body
    const segment = body.segment ?? 'all'
    // News from SportPool unless it is a Terms or Privacy update (always delivered).
    const kind: 'sportpool_news' | 'policy_update' = body.kind === 'policy_update' ? 'policy_update' : 'sportpool_news'
    const isNews = kind === 'sportpool_news'

    if (!subject || !html) {
      return NextResponse.json({ error: 'subject and html are required' }, { status: 400 })
    }

    if (segment !== 'all') {
      return NextResponse.json({
        error: 'Broadcast goes to everyone. For a smaller group, use Templates → Custom — it goes as News from SportPool to just them.',
      }, { status: 400 })
    }

    const resend = getResendClient()
    const everyoneSegmentId = process.env.RESEND_AUDIENCE_ID
    if (!everyoneSegmentId) {
      return NextResponse.json({ error: 'RESEND_AUDIENCE_ID (the General segment) is not configured' }, { status: 500 })
    }
    const newsTopicId = TOPICS.NEWS
    if (isNews && !newsTopicId) {
      return NextResponse.json({
        error: 'The News from SportPool topic is not set up (RESEND_TOPIC_NEWS), so a broadcast would ignore members\' News switch. Nothing was sent.',
      }, { status: 500 })
    }

    const fromAddress = process.env.RESEND_FROM_EMAIL || 'SportPool <notifications@sportpool.io>'
    const broadcastName = `${subject} [${SEGMENTS.all.label}${isNews ? '' : ' · policy update'}]`

    // Who it reaches, for the preview and the log: every member with an email — less whoever
    // switched News off, for News. Resend also leaves out anyone unsubscribed from everything.
    const [users, newsOff] = await Promise.all([querySegment(supabase, 'all'), isNews ? newsSwitchedOff() : new Set<string>()])
    const recipientEmails = users.filter((u) => u.email && !newsOff.has(u.user_id)).map((u) => u.email)

    if (recipientEmails.length === 0) {
      return NextResponse.json({ message: 'Nobody to send to', sent: 0 })
    }

    // Preview unless the caller said `dry_run: false`. There is no test send
    // here; a `test_send` body resolves to 'test', which is not 'send'.
    if (resolveSendMode(body) !== 'send') {
      return NextResponse.json({
        dry_run: true,
        segment: 'all',
        kind,
        recipientCount: recipientEmails.length,
        preview: recipientEmails.slice(0, 5),
      })
    }

    // A real send spends a one-time key FIRST — before the shared audience is
    // cleared — so a retried or double-clicked request is refused, not re-sent.
    const idempotencyKey = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : ''
    if (!idempotencyKey) {
      return NextResponse.json({ error: 'A real send needs an idempotency_key' }, { status: 400 })
    }
    const { error: keyError } = await supabase
      .from('sent_announcements')
      .insert({ idempotency_key: idempotencyKey, sent_by: auth.data.userData.user_id })
    if (keyError) {
      if (keyError.code === '23505') {
        return NextResponse.json(
          { error: 'This broadcast has already been sent. Start a new one to send again.' },
          { status: 409 },
        )
      }
      console.error('[Broadcast] Could not record the send key:', keyError.message)
      return NextResponse.json({ error: 'Could not record the send, so nothing was sent' }, { status: 500 })
    }

    const { data: broadcast, error: createError } = await resend.broadcasts.create({
      name: broadcastName,
      segmentId: everyoneSegmentId,
      // The News topic makes Resend skip whoever switched News off; a policy update carries none.
      ...(isNews ? { topicId: newsTopicId } : {}),
      from: fromAddress,
      subject,
      html,
    })

    if (createError || !broadcast?.id) {
      console.error('[Broadcast] Failed to create:', createError)
      return NextResponse.json({ error: 'Failed to create broadcast' }, { status: 500 })
    }

    // Send the broadcast
    const { error: sendError } = await resend.broadcasts.send(broadcast.id)

    if (sendError) {
      console.error('[Broadcast] Failed to send:', sendError)
      return NextResponse.json({
        error: 'Broadcast created but failed to send',
        broadcastId: broadcast.id,
      }, { status: 500 })
    }

    // Log to broadcast_log for audit trail
    await supabase.from('broadcast_log').insert({
      broadcast_id: broadcast.id,
      subject,
      segment: 'all',
      recipient_count: recipientEmails.length,
      recipients: recipientEmails,
      sent_by: auth.data.userData.user_id,
    })

    return NextResponse.json({
      message: `Broadcast sent to ${recipientEmails.length} ${SEGMENTS.all.label}`,
      broadcastId: broadcast.id,
      segment: 'all',
      recipientCount: recipientEmails.length,
    })
  } catch (err) {
    console.error('[Broadcast] Unhandled error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Members who switched News from SportPool off. Read with the admin client — a member's
 * preferences are theirs alone under RLS — and paged, because the list can pass PostgREST's
 * 1,000-row cap.
 */
async function newsSwitchedOff(): Promise<Set<string>> {
  const admin = createAdminClient()
  const rows = await fetchAllRows<{ user_id: string }>((from, to) =>
    admin.from('notification_preferences').select('user_id')
      .eq('category', 'NEWS').eq('channel', 'email').eq('enabled', false)
      .order('user_id').range(from, to),
  )
  return new Set(rows.map((r) => r.user_id))
}
