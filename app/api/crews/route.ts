import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { listMyCrews } from '@/lib/crews/read'
import { createCrew, saveCrewFromPool } from '@/lib/crews/store'
import { claimInvitesFor, crewResponse, readBody } from '@/lib/crews/http'

// GET  — My Crews: the groups you're in. Never a list of people.
// POST — { name }            create a crew directly (you're captain)
//        { name, pool_id, co_captain_user_id? }  save a finished pool's players as a crew
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const admin = createAdminClient()
  await claimInvitesFor(admin, auth.data.userData.user_id, auth.data.user)
  const crews = await listMyCrews(admin, auth.data.userData.user_id, Date.now())
  return NextResponse.json({ crews })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const body = await readBody(request)
  const admin = createAdminClient()
  const userId = auth.data.userData.user_id
  if (typeof body.pool_id === 'string') {
    return crewResponse(
      await saveCrewFromPool(admin, {
        userId,
        poolId: body.pool_id,
        name: body.name,
        coCaptainUserId: typeof body.co_captain_user_id === 'string' ? body.co_captain_user_id : null,
      }),
    )
  }
  return crewResponse(await createCrew(admin, { userId, name: body.name }))
}
