import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email/send'
import { poolJoinedTemplate } from '@/lib/email/templates'
import { syncContactToResend } from '@/lib/email/contacts'
import { TOPICS } from '@/lib/email/topics'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pool_id } = await request.json()
  if (!pool_id) return NextResponse.json({ error: 'pool_id is required' }, { status: 400 })

  const { data: userData } = await supabase
    .from('users')
    .select('user_id, email, username, full_name')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: pool } = await supabase
    .from('pools')
    .select('pool_name, pool_code')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  // Sync contact to Resend (idempotent)
  const nameParts = (userData.full_name || '').split(' ')
  await syncContactToResend({
    email: userData.email,
    firstName: nameParts[0] || userData.username,
    lastName: nameParts.slice(1).join(' ') || undefined,
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'
  const { subject, html } = poolJoinedTemplate({
    userName: userData.full_name || userData.username,
    poolName: pool.pool_name,
    poolCode: pool.pool_code,
    poolUrl: `${appUrl}/pools/${pool_id}`,
  })

  const result = await sendEmail({
    to: userData.email,
    subject,
    html,
    topicId: TOPICS.POOL_ACTIVITY,
    tags: [{ name: 'category', value: 'pool-activity' }],
  })

  return NextResponse.json({ sent: result.success })
}
