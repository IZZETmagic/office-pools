// Crews routes share one shape: authenticate, call one function in lib/crews, turn its result into a
// response. This is the "turn it into a response" half.
//
// (It also used to claim email invites on every crew read, by matching the signed-in address. Gone in
// 155: email confirmation is off, so an address proves nothing — the emailed link is the claim.)

import { NextResponse } from 'next/server'
import type { CrewResult } from './store'

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
