import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { sendPushToAll, sendPushToUser } from '@/lib/push/apns'

// =============================================================
// POST /api/admin/send-push
// Send a one-off push notification to all users or a specific user.
// Super admin only.
//
// Body: { title: string, body: string, data?: Record<string, string>, user_id?: string }
// If user_id is provided, sends only to that user. Otherwise broadcasts to all.
// =============================================================
export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const { title, body, data, user_id } = await request.json()

  if (!title || !body) {
    return NextResponse.json({ error: 'title and body are required' }, { status: 400 })
  }

  const payload = { title, body, data }

  if (user_id) {
    // Send to a specific user
    const result = await sendPushToUser(user_id, payload)
    return NextResponse.json({
      message: `Push sent to user ${user_id}`,
      ...result,
    })
  }

  // Broadcast to all
  const result = await sendPushToAll(payload)
  return NextResponse.json({
    message: `Push broadcast sent`,
    ...result,
  })
}
