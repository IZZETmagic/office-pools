import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { syncContactToResend } from '@/lib/email/contacts'

// =============================================================
// POST /api/notifications/sync-contact
// Syncs the authenticated user to the Resend audience.
// Called on signup so new users are added to the audience.
// =============================================================
export async function POST() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { data: user } = await supabase
    .from('users')
    .select('email, full_name, username')
    .eq('user_id', userData.user_id)
    .single()

  if (!user?.email) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const nameParts = (user.full_name || '').split(' ')
  await syncContactToResend({
    email: user.email,
    firstName: nameParts[0] || user.username || undefined,
    lastName: nameParts.slice(1).join(' ') || undefined,
  })

  return NextResponse.json({ synced: true })
}
