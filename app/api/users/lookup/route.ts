import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { lookupUsername } from '@/lib/crews/store'
import { parseInviteTarget } from '@/lib/crews/rules'

// ?username= — exact, case-insensitive; every match, so the captain can pick the right face (36
// production usernames collide on case). ⚠ A lookup, never a browse: no prefix search, no
// suggestions, at most five rows. Emails are NOT looked up here — an email must never reveal
// whether it has an account (lib/crews/store.inviteToCrew).
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const target = parseInviteTarget(new URL(request.url).searchParams.get('username'))
  if (!target || target.kind !== 'username') return NextResponse.json({ matches: [] })
  const matches = await lookupUsername(createAdminClient(), target.username)
  return NextResponse.json({ matches: matches.filter((m) => m.userId !== auth.data.userData.user_id) })
}
