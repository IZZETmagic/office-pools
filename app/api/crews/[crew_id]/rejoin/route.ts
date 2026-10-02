import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { rejoinCrew } from '@/lib/crews/store'
import { crewResponse } from '@/lib/crews/http'

// Come back to a crew you left on your own. Not for the removed — they need to be added back.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ crew_id: string }> }) {
  const { crew_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  return crewResponse(await rejoinCrew(createAdminClient(), { crewId: crew_id, userId: auth.data.userData.user_id }))
}
