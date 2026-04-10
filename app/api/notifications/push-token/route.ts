import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

/**
 * POST /api/notifications/push-token
 * Register or refresh an APNs device token for the authenticated user.
 *
 * Body: { token: string, platform?: string, environment?: "production" | "development" }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { token, platform, environment } = await request.json()

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'token is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        user_id: userData.user_id,
        token,
        platform: platform || 'ios',
        environment: environment || 'production',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' }
    )

  if (error) {
    console.error('[PushToken] Failed to upsert:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

/**
 * DELETE /api/notifications/push-token
 * Unregister a device token (e.g. on sign out).
 *
 * Body: { token: string }
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { token } = await request.json()

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'token is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', userData.user_id)
    .eq('token', token)

  if (error) {
    console.error('[PushToken] Failed to delete:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
