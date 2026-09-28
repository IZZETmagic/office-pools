import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'

// =============================================================
// POST /api/users/:user_id/activity/seen
// The member opened the Activity tab. Feed items created before this moment
// stop counting as unread (migration 149, user_activity_seen).
//
// Own row only — a super admin reading someone's feed for support must not
// mark it read for them, so there is deliberately no admin override here.
// =============================================================

async function handlePOST(
  _request: NextRequest,
  { params }: { params: Promise<{ user_id: string }> },
) {
  const { user_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  if (auth.data.userData.user_id !== user_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const seenAt = new Date().toISOString()
  const { error } = await createAdminClient()
    .from('user_activity_seen')
    .upsert({ user_id, seen_at: seenAt }, { onConflict: 'user_id' })
  if (error) {
    console.error('[activity/seen] upsert failed', error.message)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
  return NextResponse.json({ seen_at: seenAt })
}

export const POST = withPerfLogging('/api/users/[user_id]/activity/seen', handlePOST)
