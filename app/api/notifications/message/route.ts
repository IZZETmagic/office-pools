import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { sendPushToUsers } from '@/lib/push/apns'

/**
 * POST /api/notifications/message
 *
 * Sends a push notification to all pool members (except the sender)
 * when a new banter message is posted.
 *
 * Body: { pool_id, message_content, sender_name }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  let body: { pool_id?: string; message_content?: string; sender_name?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { pool_id, message_content, sender_name } = body

  if (!pool_id || !message_content) {
    return NextResponse.json(
      { error: 'pool_id and message_content are required' },
      { status: 400 }
    )
  }

  // Get pool name
  const { data: pool, error: poolError } = await supabase
    .from('pools')
    .select('pool_name')
    .eq('pool_id', pool_id)
    .single()

  if (poolError || !pool) {
    console.error('[MessagePush] Pool lookup failed:', poolError)
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }

  // Get all pool members except the sender
  const { data: members, error: membersError } = await supabase
    .from('pool_members')
    .select('user_id')
    .eq('pool_id', pool_id)
    .neq('user_id', userData.user_id)

  if (membersError) {
    console.error('[MessagePush] Members lookup failed:', membersError)
    return NextResponse.json({ error: 'Failed to lookup members' }, { status: 500 })
  }

  if (!members || members.length === 0) {
    return NextResponse.json({ sent: true, count: 0 })
  }

  const recipientIds = members.map((m) => m.user_id)
  const displayName = sender_name || 'Someone'

  // Truncate message for notification preview
  const preview = message_content.length > 80
    ? message_content.slice(0, 77) + '...'
    : message_content

  console.log(
    `[MessagePush] Sending push to ${recipientIds.length} members in pool "${pool.pool_name}"`
  )

  // Fire-and-forget push to all pool members
  sendPushToUsers(recipientIds, {
    title: `${displayName} in ${pool.pool_name}`,
    body: preview,
    data: { type: 'community', pool_id },
  }).catch((err) => console.error('[MessagePush] Push error:', err))

  return NextResponse.json({ sent: true, count: recipientIds.length })
}
