import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

/**
 * POST /api/notifications/mark-complete
 *
 * Marks a single pending action complete by id. Called when the user taps a
 * specific in-app item that the notification was about (e.g., a
 * newly-unlocked badge cell in Form tab).
 *
 * The RPC enforces ownership server-side (caller must be the user or
 * service_role), so we don't need to re-check it here.
 *
 * Body: { action_id: string }
 * Returns: { ok: boolean }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  let body: { action_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.action_id) {
    return NextResponse.json({ error: 'action_id is required' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('mark_action_complete', {
    p_user_id: userData.user_id,
    p_action_id: body.action_id,
  })

  if (error) {
    console.error('[mark-complete] RPC failed', error)
    return NextResponse.json({ error: 'Failed to mark complete' }, { status: 500 })
  }

  return NextResponse.json({ ok: data === true })
}
