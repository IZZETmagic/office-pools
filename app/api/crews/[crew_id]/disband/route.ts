import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { disbandCrew } from '@/lib/crews/store'
import { crewResponse } from '@/lib/crews/http'

// The captain disbands the crew (157): it disappears for everyone in it; saved spots nobody has taken
// are released; running pools carry on as ordinary pools. The captain can restore it.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ crew_id: string }> }) {
  const { crew_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  return crewResponse(await disbandCrew(createAdminClient(), { actorId: auth.data.userData.user_id, crewId: crew_id }))
}
