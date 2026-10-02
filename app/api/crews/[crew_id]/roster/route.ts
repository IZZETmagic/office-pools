import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { readRoster } from '@/lib/crews/read'

// ?tier=free — who gets a saved spot if you start a pool for this crew on that tier, with reasons,
// defaults and the cap. Any active member can start a pool, so any active member can read this.
export async function GET(request: NextRequest, { params }: { params: Promise<{ crew_id: string }> }) {
  const { crew_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const tier = new URL(request.url).searchParams.get('tier') ?? 'free'
  const roster = await readRoster(createAdminClient(), {
    crewId: crew_id,
    starterId: auth.data.userData.user_id,
    tier,
    now: Date.now(),
  })
  if (!roster) return NextResponse.json({ error: 'Crew not found.' }, { status: 404 })
  return NextResponse.json(roster)
}
