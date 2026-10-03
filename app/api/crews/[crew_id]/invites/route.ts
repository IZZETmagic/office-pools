import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { inviteToCrew } from '@/lib/crews/store'
import { parseInviteTarget } from '@/lib/crews/rules'
import { crewResponse, readBody } from '@/lib/crews/http'
import { sendInviteNotice } from '@/lib/crews/notify'

// Add someone — captain or co-captain. Either { user_id } (picked from /api/users/lookup, after the
// captain saw their face) or { email }. ⚠ An email answers { sent: true } whether or not it has an
// account; see lib/crews/store.inviteToCrew.
export async function POST(request: NextRequest, { params }: { params: Promise<{ crew_id: string }> }) {
  const { crew_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const body = await readBody(request)
  const actorId = auth.data.userData.user_id
  const admin = createAdminClient()
  let result
  if (typeof body.user_id === 'string') {
    result = await inviteToCrew(admin, { actorId, crewId: crew_id, userId: body.user_id })
  } else {
    const target = parseInviteTarget(body.email)
    if (!target || target.kind !== 'email') return NextResponse.json({ error: 'That doesn’t look like an email address.' }, { status: 400 })
    result = await inviteToCrew(admin, { actorId, crewId: crew_id, email: target.email })
  }
  // The invite's one push/email (lib/crews/notify) — only when a NEW invite was written. A blocked
  // email invite answers "sent" with no row, and sends nothing. Awaited, not fire-and-forget: a
  // serverless function can be frozen the moment it responds. Off until crew_notices_enabled.
  if (result.ok && result.inviteId) await sendInviteNotice(admin, result.inviteId)
  return crewResponse(result)
}
