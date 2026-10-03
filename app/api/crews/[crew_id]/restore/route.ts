import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { restoreCrew } from '@/lib/crews/store'
import { crewResponse } from '@/lib/crews/http'

// The captain brings back a crew they disbanded (157), members as they were. Anyone else gets the same
// 404 as for a crew that doesn't exist.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ crew_id: string }> }) {
  const { crew_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  return crewResponse(await restoreCrew(createAdminClient(), { actorId: auth.data.userData.user_id, crewId: crew_id }))
}
