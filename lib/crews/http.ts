// Crews routes share one shape: authenticate, call one function in lib/crews, turn its result into a
// response. This is the "turn it into a response" half, plus the one thing every crew read does first.

import { NextResponse } from 'next/server'
import type { createAdminClient } from '@/lib/supabase/server'
import { claimEmailInvites, type CrewResult } from './store'

/** A store result as a response: failures with their status (and `reason` when there is one). */
export function crewResponse<T extends object>(result: CrewResult<T>): NextResponse {
  if (!result.ok) {
    return NextResponse.json(
      result.reason ? { error: result.error, reason: result.reason } : { error: result.error },
      { status: result.status },
    )
  }
  const body: Record<string, unknown> = { ...result }
  delete body.ok
  return NextResponse.json(body)
}

/** A JSON body, or {} — a missing or malformed body is a 400 from the caller's own checks. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Email invites wait for an account (lib/crews/store.claimEmailInvites). Claimed here, lazily, on
 * the reads a newly signed-up person makes — so there is no sign-up hook to forget — and ONLY for a
 * verified address. Best-effort: a failed claim must not fail the read.
 */
export async function claimInvitesFor(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  authUser: { email?: string; email_confirmed_at?: string | null },
) {
  try {
    await claimEmailInvites(admin, {
      userId,
      email: authUser.email,
      emailVerified: !!authUser.email_confirmed_at,
    })
  } catch (e) {
    console.error('[crews] claiming email invites failed:', e)
  }
}
