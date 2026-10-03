import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { answerInvite } from '@/lib/crews/store'
import { crewResponse, readBody } from '@/lib/crews/http'

// { answer: 'join' | 'decline' } — "Dave added you to Bermuda Office". One tap, once; No thanks sticks.
export async function POST(request: NextRequest, { params }: { params: Promise<{ invite_id: string }> }) {
  const { invite_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const body = await readBody(request)
  if (body.answer !== 'join' && body.answer !== 'decline') {
    return NextResponse.json({ error: "answer must be 'join' or 'decline'" }, { status: 400 })
  }
  const admin = createAdminClient()
  return crewResponse(
    await answerInvite(admin, { userId: auth.data.userData.user_id, inviteId: invite_id, answer: body.answer }),
  )
}
