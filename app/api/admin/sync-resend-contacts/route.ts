import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { syncContactToResend } from '@/lib/email/contacts'

// =============================================================
// POST /api/admin/sync-resend-contacts
// Backfills all users into the Resend audience.
// Super admin only. Safe to run multiple times (idempotent).
// =============================================================
export async function POST() {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { supabase } = auth.data

  const { data: users, error } = await supabase
    .from('users')
    .select('email, full_name, username')
    .not('email', 'is', null)

  if (error || !users) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }

  let synced = 0
  let failed = 0

  for (const user of users) {
    if (!user.email) continue
    try {
      const nameParts = (user.full_name || '').split(' ')
      await syncContactToResend({
        email: user.email,
        firstName: nameParts[0] || user.username || undefined,
        lastName: nameParts.slice(1).join(' ') || undefined,
      })
      synced++
    } catch {
      failed++
    }
  }

  return NextResponse.json({
    message: `Synced ${synced} contacts to Resend audience`,
    synced,
    failed,
    total: users.length,
  })
}
