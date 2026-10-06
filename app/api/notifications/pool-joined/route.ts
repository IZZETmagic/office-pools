import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { sendEmail } from '@/lib/email/send'
import { poolJoinedTemplate } from '@/lib/email/templates'
import { syncContactToResend } from '@/lib/email/contacts'
import { TOPICS } from '@/lib/email/topics'
import { sendPushToUser } from '@/lib/push/apns'

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { pool_id } = await request.json()
  if (!pool_id) return NextResponse.json({ error: 'pool_id is required' }, { status: 400 })

  // ⚠ ONLY FOR SOMEBODY WHO HAS JUST JOINED. The join screens call this
  // straight after a join succeeds — but until 2026-10-05 it checked neither,
  // so any signed-in user could call it for any public pool, as often as they
  // liked: a welcome email to themselves each time, and a "X joined your pool"
  // push to the pool's admin each time. Now: a member, and a join made in the
  // last ten minutes. (N3 moves these notices onto the outbox, whose one-row-
  // per-person key makes a repeat impossible rather than just late.)
  const { data: membership } = await supabase
    .from('pool_members')
    .select('joined_at')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Not a member of this pool' }, { status: 403 })
  const joinedAt = membership.joined_at ? new Date(membership.joined_at).getTime() : 0
  if (Date.now() - joinedAt > 10 * 60 * 1000) {
    return NextResponse.json({ sent: false, skipped: 'not a new member' })
  }

  // Fetch additional user fields needed for email
  const { data: userProfile } = await supabase
    .from('users')
    .select('email, username, full_name')
    .eq('user_id', userData.user_id)
    .single()

  if (!userProfile) return NextResponse.json({ error: 'User profile not found' }, { status: 404 })

  const { data: pool } = await supabase
    .from('pools')
    .select('pool_name, pool_code, admin_user_id')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  // Notify the pool admin (POOL_ACTIVITY category) that a new member joined.
  // Skipped if the joiner IS the admin (e.g., they created the pool).
  if (pool.admin_user_id && pool.admin_user_id !== userData.user_id) {
    const memberName = userProfile.full_name || userProfile.username || 'Someone'
    void sendPushToUser(
      pool.admin_user_id,
      {
        title: `${memberName} joined ${pool.pool_name}`,
        body: 'A new member just joined your pool',
        data: { type: 'pool_activity', sub: 'member_joined', pool_id },
      },
      'POOL_ACTIVITY',
    ).catch((err) => console.error('[pool-joined] admin push failed', err))
  }

  // Sync contact to Resend (idempotent)
  const nameParts = (userProfile.full_name || '').split(' ')
  await syncContactToResend({
    email: userProfile.email,
    firstName: nameParts[0] || userProfile.username,
    lastName: nameParts.slice(1).join(' ') || undefined,
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'
  const { subject, html } = poolJoinedTemplate({
    userName: userProfile.full_name || userProfile.username,
    poolName: pool.pool_name,
    poolCode: pool.pool_code,
    poolUrl: `${appUrl}/pools/${pool_id}`,
  })

  const [emailResult, pushResult] = await Promise.allSettled([
    sendEmail({
      to: userProfile.email,
      subject,
      html,
      topicId: TOPICS.POOL_ACTIVITY,
      tags: [{ name: 'category', value: 'pool-activity' }],
    }),
    sendPushToUser(
      userData.user_id,
      {
        title: `Welcome to ${pool.pool_name}!`,
        body: 'You\'ve joined the pool. Make your predictions!',
        data: { type: 'pool_activity', pool_id },
      },
      'POOL_ACTIVITY',
    ),
  ])

  const emailSent = emailResult.status === 'fulfilled' && emailResult.value.success
  return NextResponse.json({ sent: emailSent })
}
