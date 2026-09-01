import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { buildDuelRecapProps, type RefusalReason } from '@/lib/remotion/duelRecapProps'
import { cachedRender, renderToBlobStream, SSE_HEADERS } from '@/lib/remotion/renderToBlob'

// /api/pools/:pool_id/duel-recap — the shareable MP4 of a SETTLED duel.
//
// ## ⚠ IT IS AN AUTHORIZATION SURFACE FIRST
//
// The caller hands over an id and gets back a file. Every check RLS would have
// made is made by hand in `lib/remotion/duelRecapProps.ts`, because the render
// reads with the service-role client — the same reason `lib/league/poolCards.ts`
// filters explicitly. Nothing here decides who may see what; it maps that
// module's refusal to a status code and otherwise gets out of the way.
//
// ## ⚠ ON DEMAND, NOT PER SETTLED DUEL
//
// A matchweek settles every duel in one burst. Rendering each eagerly would be
// hundreds of single-machine renders for files nobody asked for. This runs when
// a member taps share, and caches, so volume tracks share intent.
//
// ## ⚠ THE CACHE KEY CARRIES THE SIDE
//
// The card is oriented to the viewer — "You beat Mia Torres" — so a key of
// `duel_id` alone would serve Mia her own defeat written as a win.
//
// ## 🔴 NO RATE LIMITING YET
//
// A render costs sandbox time. This authenticates and caches, so it is not open
// to the world, but a member could still loop over every duel they are in.
// Vercel Spend Management is the backstop until there is a limiter here.

export const dynamic = 'force-dynamic'
/** Renders outlive the default budget; 800s is the ceiling on any plan. */
export const maxDuration = 800

const STATUS: Record<RefusalReason, number> = {
  'not-a-member': 403,
  'wrong-pool': 404,
  'not-settled': 409,
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

  const built = await buildDuelRecapProps(createAdminClient(), {
    poolId: pool_id,
    duelId: body.duelId,
    viewerUserId: userData.user_id,
  })
  if (!built.ok) return NextResponse.json({ error: built.reason }, { status: STATUS[built.reason] })

  const pathname = `duel-recap/${body.duelId}-${built.side}.mp4`
  const cached = await cachedRender(pathname, blobToken)
  if (cached) return NextResponse.json({ url: cached, cached: true })

  const { stream, done } = renderToBlobStream({
    compositionId: 'DuelRecap',
    inputProps: built.props as unknown as Record<string, unknown>,
    pathname,
    blobToken,
    label: 'duel-recap',
  })
  waitUntil(done)
  return new Response(stream, { headers: SSE_HEADERS })
}
