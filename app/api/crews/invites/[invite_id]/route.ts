import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { revokeInvite } from '@/lib/crews/store'
import { crewResponse } from '@/lib/crews/http'

// Withdraw an invite before it's answered — captain or co-captain.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ invite_id: string }> }) {
  const { invite_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  return crewResponse(await revokeInvite(createAdminClient(), { actorId: auth.data.userData.user_id, inviteId: invite_id }))
}
