import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withPerfLogging } from '@/lib/api-perf'
import {
  PUSH_CATEGORIES,
  PUSH_CATEGORY_COLUMNS,
  type PushCategory,
} from '@/lib/push/categories'

// =============================================================
// GET  /api/notifications/push-preferences
// PATCH /api/notifications/push-preferences  { category, enabled }
//
// Per-user push notification category toggles. Mirrors the email prefs
// endpoint (/api/notifications/preferences) in shape but stores in
// push_notification_preferences instead of Resend.
//
// First read for a user auto-creates a row with all categories = true.
// =============================================================

async function handleGET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  // Upsert with all-true defaults if the row doesn't exist yet. ON CONFLICT
  // DO NOTHING preserves any existing user choices.
  await supabase
    .from('push_notification_preferences')
    .upsert(
      { user_id: userData.user_id },
      { onConflict: 'user_id', ignoreDuplicates: true },
    )

  const { data: row, error } = await supabase
    .from('push_notification_preferences')
    .select('*')
    .eq('user_id', userData.user_id)
    .single()

  if (error || !row) {
    console.error('[push-prefs] read failed', error)
    return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 })
  }

  // Surface as { CATEGORY: boolean } so the mobile UI can iterate by enum.
  const preferences: Record<PushCategory, boolean> = {} as Record<PushCategory, boolean>
  for (const key of PUSH_CATEGORIES) {
    preferences[key] = (row as Record<string, boolean>)[PUSH_CATEGORY_COLUMNS[key]] ?? true
  }

  return NextResponse.json({ preferences })
}

async function handlePATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { category, enabled } = (await request.json()) as {
    category?: string
    enabled?: boolean
  }

  if (!category || !PUSH_CATEGORIES.includes(category as PushCategory)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be boolean' }, { status: 400 })
  }

  const column = PUSH_CATEGORY_COLUMNS[category as PushCategory]

  const { error } = await supabase
    .from('push_notification_preferences')
    .upsert(
      {
        user_id: userData.user_id,
        [column]: enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

  if (error) {
    console.error('[push-prefs] write failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ updated: true, category, enabled })
}

export const GET = withPerfLogging('/api/notifications/push-preferences', handleGET)
export const PATCH = withPerfLogging('/api/notifications/push-preferences', handlePATCH)
