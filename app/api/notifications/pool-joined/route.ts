import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { sendEmail } from '@/lib/email/send'
import { poolJoinedTemplate } from '@/lib/email/templates'
import { syncContactToResend } from '@/lib/email/contacts'
import { TOPICS } from '@/lib/email/topics'

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { pool_id } = await request.json()
  if (!pool_id) return NextResponse.json({ error: 'pool_id is required' }, { status: 400 })

  // Fetch additional user fields needed for email
  const { data: userProfile } = await supabase
    .from('users')
    .select('email, username, full_name')
    .eq('user_id', userData.user_id)
    .single()

  if (!userProfile) return NextResponse.json({ error: 'User profile not found' }, { status: 404 })

  const { data: pool } = await supabase
    .from('pools')
    .select('pool_name, pool_code')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

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

  const result = await sendEmail({
    to: userProfile.email,
    subject,
    html,
    topicId: TOPICS.POOL_ACTIVITY,
    tags: [{ name: 'category', value: 'pool-activity' }],
  })

  return NextResponse.json({ sent: result.success })
}
