import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { getResendClient } from '@/lib/email/resend'
import { countdownReminderTemplate, type CountdownMilestone } from '@/lib/email/templates'
import { sendPushToAll } from '@/lib/push/apns'

const VALID_MILESTONES: CountdownMilestone[] = ['60days', '30days', '14days', '7days', '1day']

// =============================================================
// POST /api/admin/send-countdown
// Sends a countdown reminder email to all users via Resend Broadcasts.
// Body: { milestone: "60days"|"30days"|"14days"|"7days"|"1day", idempotency_key: string }
// Super admin only.
// =============================================================
export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { supabase } = auth.data

  let body: { milestone?: string; idempotency_key?: string } = {}
  try {
    body = await request.json()
  } catch {
    // No body
  }

  if (!body.idempotency_key) {
    return NextResponse.json({ error: 'idempotency_key is required' }, { status: 400 })
  }

  const milestone = body.milestone as CountdownMilestone
  if (!milestone || !VALID_MILESTONES.includes(milestone)) {
    return NextResponse.json(
      { error: `milestone must be one of: ${VALID_MILESTONES.join(', ')}` },
      { status: 400 }
    )
  }

  // Idempotency check
  const { data: existing } = await supabase
    .from('sent_announcements')
    .select('id')
    .eq('idempotency_key', body.idempotency_key)
    .single()

  if (existing) {
    return NextResponse.json(
      { error: 'Already sent with this idempotency key' },
      { status: 409 }
    )
  }

  const { error: insertError } = await supabase
    .from('sent_announcements')
    .insert({ idempotency_key: body.idempotency_key, sent_by: auth.data.userData.user_id })

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'Already sent with this idempotency key' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Failed to record announcement' }, { status: 500 })
  }

  try {
    // Calculate days until kickoff (June 11, 2026)
    const kickoff = new Date('2026-06-11T00:00:00Z')
    const now = new Date()
    const daysUntilKickoff = Math.ceil((kickoff.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'}/dashboard`

    // Generate the email template (now uses {{{FIRST_NAME|there}}} for personalization)
    const { subject, html } = countdownReminderTemplate({
      milestone,
      daysUntilKickoff,
      dashboardUrl,
    })

    // Send via Resend Broadcasts API to the main audience
    const resend = getResendClient()
    const mainAudienceId = process.env.RESEND_AUDIENCE_ID
    if (!mainAudienceId) {
      return NextResponse.json({ error: 'RESEND_AUDIENCE_ID not configured' }, { status: 500 })
    }

    const fromAddress = process.env.RESEND_FROM_EMAIL || 'Sport Pool <notifications@sportpool.io>'
    const broadcastName = `Countdown: ${milestone} [All Users]`

    const { data: broadcast, error: createError } = await resend.broadcasts.create({
      name: broadcastName,
      audienceId: mainAudienceId,
      from: fromAddress,
      subject,
      html,
    })

    if (createError || !broadcast?.id) {
      console.error('[Countdown] Failed to create broadcast:', createError)
      return NextResponse.json({ error: 'Failed to create broadcast' }, { status: 500 })
    }

    const { error: sendError } = await resend.broadcasts.send(broadcast.id)

    if (sendError) {
      console.error('[Countdown] Failed to send broadcast:', sendError)
      return NextResponse.json({
        error: 'Broadcast created but failed to send',
        broadcastId: broadcast.id,
      }, { status: 500 })
    }

    // Log to broadcast_log for audit trail
    const { data: users } = await supabase
      .from('users')
      .select('email')
      .not('email', 'is', null)

    const recipientEmails = (users || []).map((u) => u.email)

    await supabase.from('broadcast_log').insert({
      broadcast_id: broadcast.id,
      subject,
      segment: 'all',
      recipient_count: recipientEmails.length,
      recipients: recipientEmails,
      sent_by: auth.data.userData.user_id,
    })

    // Send push notification to all users
    const milestoneLabels: Record<string, string> = {
      '60days': '60 Days to Go!',
      '30days': '30 Days to Go!',
      '14days': '2 Weeks to Go!',
      '7days': '1 Week to Go!',
      '1day': 'Tomorrow is Kickoff!',
    }

    const pushResult = await sendPushToAll({
      title: milestoneLabels[milestone] ?? `${daysUntilKickoff} Days to Go!`,
      body: 'Tournament kicks off soon. Make sure your predictions are in!',
      data: { type: 'pool_activity' },
    }).catch(() => ({ sent: 0, total: 0 }))

    return NextResponse.json({
      message: `Countdown (${milestone}) broadcast sent to audience`,
      milestone,
      broadcastId: broadcast.id,
      recipientCount: recipientEmails.length,
      pushSent: (pushResult as any)?.sent ?? 0,
      daysUntilKickoff,
    })
  } catch (err) {
    console.error('[Countdown] Unhandled error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
