import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { sendBatchEmails } from '@/lib/email/send'
import { countdownReminderTemplate, type CountdownMilestone } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'
import { sendPushToAll } from '@/lib/push/apns'

const VALID_MILESTONES: CountdownMilestone[] = ['60days', '30days', '14days', '7days', '1day']

// =============================================================
// POST /api/admin/send-countdown
// Sends a countdown reminder email to all users.
// Body: { milestone: "60days"|"30days"|"14days"|"7days"|"1day", idempotency_key: string }
// Super admin only.
// =============================================================
export async function POST(request: NextRequest) {
  // 1. Authenticate — super admin only
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { supabase } = auth.data

  // 2. Parse body
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

  // 3. Idempotency check
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

  // 4. Calculate days until kickoff (June 11, 2026)
  const kickoff = new Date('2026-06-11T00:00:00Z')
  const now = new Date()
  const daysUntilKickoff = Math.ceil((kickoff.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  // 5. Fetch all users with their pool counts
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('user_id, full_name, username, email')
    .not('email', 'is', null)

  if (usersError || !users) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }

  // Fetch pool membership counts per user
  const { data: memberships } = await supabase
    .from('pool_members')
    .select('user_id')

  const poolCountMap = new Map<string, number>()
  if (memberships) {
    for (const m of memberships) {
      poolCountMap.set(m.user_id, (poolCountMap.get(m.user_id) || 0) + 1)
    }
  }

  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'}/dashboard`

  // 6. Build email batch
  const emails = users
    .filter((u) => u.email)
    .map((u) => {
      const { subject, html } = countdownReminderTemplate({
        userName: u.full_name || u.username || 'there',
        milestone,
        daysUntilKickoff,
        poolCount: poolCountMap.get(u.user_id) || 0,
        dashboardUrl,
      })
      return {
        to: u.email!,
        subject,
        html,
        topicId: TOPICS.POOL_ACTIVITY,
        tags: [{ name: 'type', value: `countdown-${milestone}` }],
      }
    })

  if (emails.length === 0) {
    return NextResponse.json({ message: 'No users to email' })
  }

  // 7. Send in batches of 100
  const BATCH_SIZE = 100
  let totalSent = 0
  const errors: unknown[] = []

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE)
    const result = await sendBatchEmails(batch)
    if (result.success) {
      totalSent += batch.length
    } else {
      errors.push(result.error)
    }
  }

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
    message: `Countdown (${milestone}) sent to ${totalSent} of ${emails.length} users`,
    milestone,
    totalSent,
    totalUsers: emails.length,
    pushSent: (pushResult as any)?.sent ?? 0,
    daysUntilKickoff,
    ...(errors.length > 0 ? { errors } : {}),
  })
}
