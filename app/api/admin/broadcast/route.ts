import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { getResendClient } from '@/lib/email/resend'
import { querySegment, SEGMENTS, type SegmentKey } from '@/lib/email/segments'
import { resolveSendMode } from '@/lib/email/sendMode'

// =============================================================
// GET /api/admin/broadcast
// List all broadcasts from Resend (persisted history).
//
// POST /api/admin/broadcast
// Send a broadcast email to a user segment via Resend Broadcasts API.
//
// For "all" segment → sends broadcast to the main audience.
// For other segments → clears the "Broadcast Target" audience,
// populates it with the segment's users, then sends the broadcast.
//
// Body: { subject, html, segment: SegmentKey, dry_run?, idempotency_key? }
//
// ⚠ SAFE BY DEFAULT (2026-10-05) — see lib/email/sendMode.ts. Until then
// every POST sent: no preview mode and no one-time key, so a retry or a
// double-click broadcast twice. Now a body PREVIEWS unless it says
// `dry_run: false`, and a real send must carry an idempotency_key, which is
// recorded BEFORE the shared audience is touched — so a duplicate is refused
// while it can still do no harm.
//
// ⚠ STILL OPEN — the shared "Broadcast Target" audience. Every non-"all"
// broadcast clears and refills ONE Resend audience. The one-time key removes
// the likeliest overlap (one admin's double-click), but two DIFFERENT
// broadcasts in flight at once can still overwrite each other's recipients —
// and whether Resend snapshots an audience at send time or reads it as it
// delivers is unverified, so even back-to-back sends may not be safe.
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
    const { subject, html, segment } = body

    if (!subject || !html) {
      return NextResponse.json({ error: 'subject and html are required' }, { status: 400 })
    }

    if (!segment || !(segment in SEGMENTS)) {
      return NextResponse.json({ error: 'Invalid segment' }, { status: 400 })
    }

    const resend = getResendClient()
    const mainAudienceId = process.env.RESEND_AUDIENCE_ID
    const broadcastAudienceId = process.env.RESEND_BROADCAST_AUDIENCE_ID
    if (!mainAudienceId || !broadcastAudienceId) {
      return NextResponse.json({ error: 'RESEND_AUDIENCE_ID or RESEND_BROADCAST_AUDIENCE_ID not configured' }, { status: 500 })
    }

    const fromAddress = process.env.RESEND_FROM_EMAIL || 'SportPool <notifications@sportpool.io>'
    const segmentKey = segment as SegmentKey
    const broadcastName = `${subject} [${SEGMENTS[segmentKey].label}]`
    let targetAudienceId: string

    // Always query the segment to capture recipients for audit log
    const users = await querySegment(supabase, segmentKey)
    const recipientEmails = users.filter((u) => u.email).map((u) => u.email)

    if (recipientEmails.length === 0) {
      return NextResponse.json({ message: 'No users in this segment', sent: 0 })
    }

    // Preview unless the caller said `dry_run: false`. There is no test send
    // here; a `test_send` body resolves to 'test', which is not 'send'.
    if (resolveSendMode(body) !== 'send') {
      return NextResponse.json({
        dry_run: true,
        segment: segmentKey,
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

    if (segmentKey === 'all') {
      // Send to the main audience directly
      targetAudienceId = mainAudienceId
    } else {

      // Clear the Broadcast Target audience
      const { data: existingContacts } = await resend.contacts.list({ audienceId: broadcastAudienceId })
      if (existingContacts?.data?.length) {
        await Promise.allSettled(
          existingContacts.data.map((c) =>
            resend.contacts.remove({ audienceId: broadcastAudienceId, email: c.email })
          )
        )
      }

      // Populate with segment users
      const addResults = await Promise.allSettled(
        users
          .filter((u) => u.email)
          .map((u) => {
            const nameParts = (u.full_name || '').split(' ')
            return resend.contacts.create({
              audienceId: broadcastAudienceId,
              email: u.email,
              firstName: nameParts[0] || u.username || undefined,
              lastName: nameParts.slice(1).join(' ') || undefined,
            })
          })
      )

      const added = addResults.filter((r) => r.status === 'fulfilled').length
      console.log(`[Broadcast] Populated target audience with ${added}/${users.length} contacts`)

      targetAudienceId = broadcastAudienceId
    }

    // Create the broadcast
    const { data: broadcast, error: createError } = await resend.broadcasts.create({
      name: broadcastName,
      audienceId: targetAudienceId,
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
      segment: segmentKey,
      recipient_count: recipientEmails.length,
      recipients: recipientEmails,
      sent_by: auth.data.userData.user_id,
    })

    return NextResponse.json({
      message: `Broadcast sent to ${recipientEmails.length} ${SEGMENTS[segmentKey].label}`,
      broadcastId: broadcast.id,
      segment: segmentKey,
      recipientCount: recipientEmails.length,
    })
  } catch (err) {
    console.error('[Broadcast] Unhandled error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
