import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { readCrew } from '@/lib/crews/read'
import { renameCrew } from '@/lib/crews/store'
import { claimInvitesFor, crewResponse, readBody } from '@/lib/crews/http'

type Ctx = { params: Promise<{ crew_id: string }> }

// GET   — the crew page. 404 for strangers, the removed, and closed crews.
// PATCH — { name } rename (captain or co-captain).
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { crew_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const admin = createAdminClient()
  await claimInvitesFor(admin, auth.data.userData.user_id, auth.data.user)
  const crew = await readCrew(admin, crew_id, auth.data.userData.user_id, Date.now())
  if (!crew) return NextResponse.json({ error: 'Crew not found.' }, { status: 404 })
  return NextResponse.json(crew)
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { crew_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const body = await readBody(request)
  return crewResponse(await renameCrew(createAdminClient(), { actorId: auth.data.userData.user_id, crewId: crew_id, name: body.name }))
}
