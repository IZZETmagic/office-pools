import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { leaveCrew } from '@/lib/crews/store'
import { crewResponse } from '@/lib/crews/http'

// Leave a crew: one tap, history stays, open seats are released, the captaincy passes on.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ crew_id: string }> }) {
  const { crew_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  return crewResponse(await leaveCrew(createAdminClient(), { crewId: crew_id, userId: auth.data.userData.user_id }))
}
