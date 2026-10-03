import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { claimInviteByToken } from '@/lib/crews/store'
import { crewResponse, readBody } from '@/lib/crews/http'

// { token, answer: 'join' | 'decline' } — Join / No thanks from an email invite's one-time link
// (app/crew-invite/[token], migration 155). The link is the proof; the address the person signed up
// with is not (email confirmation is off — R36). A POST, never a GET: opening a link must not answer
// anything on its own, or a mail scanner pre-fetching it would.
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const body = await readBody(request)
  if (body.answer !== 'join' && body.answer !== 'decline') {
    return NextResponse.json({ error: "answer must be 'join' or 'decline'" }, { status: 400 })
  }
  return crewResponse(
    await claimInviteByToken(createAdminClient(), {
      userId: auth.data.userData.user_id,
      token: body.token,
      answer: body.answer,
    }),
  )
}
