import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

/**
 * POST /api/notifications/mark-pool-actions-complete
 *
 * Bulk-marks all incomplete pending actions of one type within one pool as
 * complete. Called when the user navigates to the relevant tab — e.g.,
 * opening Form tab in pool X marks every badge_unlock + level_up for that
 * pool. The mobile client typically fires this twice (once per relevant
 * action_type) on tab mount.
 *
 * The RPC enforces ownership server-side (caller must be the user or
 * service_role), so we don't need to re-check it here.
 *
 * Body: { pool_id: string, action_type: 'badge_unlock' | 'level_up' | 'deadline_warning' }
 * Returns: { cleared: number } — count of rows actually updated
 */
const ALLOWED_TYPES = new Set(['badge_unlock', 'level_up', 'deadline_warning'])

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  let body: { pool_id?: string; action_type?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.pool_id) {
    return NextResponse.json({ error: 'pool_id is required' }, { status: 400 })
  }
  if (!body.action_type || !ALLOWED_TYPES.has(body.action_type)) {
    return NextResponse.json(
      { error: `action_type must be one of: ${Array.from(ALLOWED_TYPES).join(', ')}` },
      { status: 400 },
    )
  }

  const { data, error } = await supabase.rpc('mark_pool_actions_complete', {
    p_user_id: userData.user_id,
    p_pool_id: body.pool_id,
    p_action_type: body.action_type,
  })

  if (error) {
    console.error('[mark-pool-actions-complete] RPC failed', error)
    return NextResponse.json({ error: 'Failed to mark pool actions complete' }, { status: 500 })
  }

  return NextResponse.json({ cleared: typeof data === 'number' ? data : 0 })
}
