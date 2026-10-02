import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { answerSeat } from '@/lib/crews/store'
import { crewResponse, readBody } from '@/lib/crews/http'

// { answer: 'take' | 'decline' } — "Your spot's saved": I'm in / Not this one.
// Taking a seat is the ordinary join (lib/pools/join.ts); a full pool answers 409 pool_full.
export async function POST(request: NextRequest, { params }: { params: Promise<{ pool_id: string }> }) {
  const { pool_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const body = await readBody(request)
  if (body.answer !== 'take' && body.answer !== 'decline') {
    return NextResponse.json({ error: "answer must be 'take' or 'decline'" }, { status: 400 })
  }
  return crewResponse(
    await answerSeat(createAdminClient(), { userId: auth.data.userData.user_id, poolId: pool_id, answer: body.answer }),
  )
}
