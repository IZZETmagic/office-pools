import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { buildDuelRevealProps, type RevealRefusal } from '@/lib/remotion/duelRevealProps'
import { cachedRender, renderToBlobStream, SSE_HEADERS } from '@/lib/remotion/renderToBlob'

// /api/pools/:pool_id/duel-reveal — the walkout MP4 for an UNPLAYED duel.
//
// ## 🔴 THE DANGEROUS ONE
//
// The recap describes something already public to the pool. This describes a
// pairing that migration 116 deliberately HIDES until its matchweek opens — and
// it enforces that in RLS, which a service-role render does not go through.
//
// `lib/remotion/duelRevealProps.ts` therefore asks the database's own
// `league_duel_is_revealed()` before it will return props. If that check is ever
// removed or weakened, this endpoint emits shareable files naming people's
// future opponents weeks early, past a gate that still looks like it is holding.
//
// Everything else — cache key, sandbox, upload, progress — is the recap's, via
// `renderToBlob.ts`.

export const dynamic = 'force-dynamic'
export const maxDuration = 800

const STATUS: Record<RevealRefusal, number> = {
  'not-a-member': 403,
  'wrong-pool': 404,
  // ⚠ 404, not 403. A sealed duel must not confirm that it exists — "forbidden"
  // tells you there is something there to be forbidden from.
  'not-revealed': 404,
  'already-settled': 409,
  'not-your-duel': 403,
  'missing-entry': 404,
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ pool_id: string }> },
) {
  const { pool_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { userData } = auth.data

  const body = (await req.json().catch(() => ({}))) as { duelId?: string }
  if (!body.duelId) return NextResponse.json({ error: 'duelId is required' }, { status: 400 })

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (!blobToken) {
    return NextResponse.json({ error: 'Blob store not configured' }, { status: 503 })
  }

  const built = await buildDuelRevealProps(createAdminClient(), {
    poolId: pool_id,
    duelId: body.duelId,
    viewerUserId: userData.user_id,
  })
  if (!built.ok) return NextResponse.json({ error: built.reason }, { status: STATUS[built.reason] })

  const pathname = `duel-reveal/${body.duelId}-${built.side}.mp4`
  const cached = await cachedRender(pathname, blobToken)
  if (cached) return NextResponse.json({ url: cached, cached: true })

  const { stream, done } = renderToBlobStream({
    compositionId: 'DuelReveal',
    inputProps: built.props as unknown as Record<string, unknown>,
    pathname,
    blobToken,
    label: 'duel-reveal',
  })
  waitUntil(done)
  return new Response(stream, { headers: SSE_HEADERS })
}
