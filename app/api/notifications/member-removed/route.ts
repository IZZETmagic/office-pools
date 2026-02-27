import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email/send'
import { memberRemovedTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pool_id, removed_user_id } = await request.json()
  if (!pool_id || !removed_user_id) {
    return NextResponse.json({ error: 'pool_id and removed_user_id are required' }, { status: 400 })
  }

  // Verify caller is admin of this pool
  const { data: callerData } = await supabase
    .from('users')
    .select('user_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!callerData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: adminMembership } = await supabase
    .from('pool_members')
    .select('role')
    .eq('pool_id', pool_id)
    .eq('user_id', callerData.user_id)
    .single()

  if (!adminMembership || adminMembership.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Get removed user's info
  const { data: removedUser } = await supabase
    .from('users')
    .select('email, username, full_name')
    .eq('user_id', removed_user_id)
    .single()

  if (!removedUser) return NextResponse.json({ error: 'Removed user not found' }, { status: 404 })

  const { data: pool } = await supabase
    .from('pools')
    .select('pool_name')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  const { subject, html } = memberRemovedTemplate({
    userName: removedUser.full_name || removedUser.username,
    poolName: pool.pool_name,
  })

  const result = await sendEmail({
    to: removedUser.email,
    subject,
    html,
    topicId: TOPICS.ADMIN,
    tags: [{ name: 'category', value: 'admin' }],
  })

  return NextResponse.json({ sent: result.success })
}
