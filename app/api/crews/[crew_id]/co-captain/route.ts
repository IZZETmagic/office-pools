import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { setCoCaptain } from '@/lib/crews/store'
import { crewResponse, readBody } from '@/lib/crews/http'

// { user_id } — the captain names the co-captain.
export async function POST(request: NextRequest, { params }: { params: Promise<{ crew_id: string }> }) {
  const { crew_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const body = await readBody(request)
  if (typeof body.user_id !== 'string') return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
  return crewResponse(
    await setCoCaptain(createAdminClient(), { actorId: auth.data.userData.user_id, crewId: crew_id, targetId: body.user_id }),
  )
}
