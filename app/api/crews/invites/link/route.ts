import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { readInviteLink } from '@/lib/crews/store'
import { readBody } from '@/lib/crews/http'

// { token } → what an email invite's one-time link shows (app/crew-invite, migration 155): who
// asked, which crew, how many — nothing the email didn't already say — plus, for someone signed
// in, whether they can take it. Answers signed out too: the link's first reader usually has no
// account yet.
//
// ⚠ The token arrives in the BODY. The page keeps it in the URL fragment, which is never sent to a
// server or to analytics; a token in a path or query would sit in access logs and page-view data.
export async function POST(request: NextRequest) {
  const body = await readBody(request)
  const auth = await requireAuth()
  const viewerId = auth.error ? null : auth.data.userData.user_id
  const view = await readInviteLink(createAdminClient(), { token: body.token, viewerId })
  return NextResponse.json({ ...view, signedIn: viewerId !== null })
}
