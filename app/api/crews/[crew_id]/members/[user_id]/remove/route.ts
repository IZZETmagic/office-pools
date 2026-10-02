import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { removeMember } from '@/lib/crews/store'
import { crewResponse } from '@/lib/crews/http'

// Remove someone from the crew: no more saved spots. They are not told; their history stays.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ crew_id: string; user_id: string }> }) {
  const { crew_id, user_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  return crewResponse(
    await removeMember(createAdminClient(), { actorId: auth.data.userData.user_id, crewId: crew_id, targetId: user_id }),
  )
}
