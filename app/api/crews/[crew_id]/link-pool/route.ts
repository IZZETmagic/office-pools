import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { linkPoolToCrew } from '@/lib/crews/store'
import { crewResponse, readBody } from '@/lib/crews/http'

// { pool_id } — link a pool you run to the crew (Ryan, 2026-10-03): you must run the pool and
// captain the crew, and every player in the pool must already be in it. For good.
export async function POST(request: NextRequest, { params }: { params: Promise<{ crew_id: string }> }) {
  const { crew_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const body = await readBody(request)
  if (typeof body.pool_id !== 'string') return NextResponse.json({ error: 'pool_id is required' }, { status: 400 })
  return crewResponse(
    await linkPoolToCrew(createAdminClient(), { actorId: auth.data.userData.user_id, crewId: crew_id, poolId: body.pool_id }),
  )
}
