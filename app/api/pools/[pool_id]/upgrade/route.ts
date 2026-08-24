import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { createCheckoutTransaction, PaddleApiError } from '@/lib/paddle/api'
import { priceIdForTier, PaddleConfigError } from '@/lib/paddle/tiers'
import { isPaidTier, isPoolTier, resolveTier, type PoolTier } from '@/lib/paddle/transactionCompleted'

// POST /api/pools/:pool_id/upgrade   { tier: 'plus' | 'max' | 'ultra' }
//
// Starts a checkout for a pool tier. Phase 3a Step 3.
// Returns { transaction_id, checkout_url } — the browser sends the admin to
// checkout_url; the money only becomes a tier when /api/paddle/webhook sees
// transaction.completed.
//
// ⚠ REQUIRES migration 067 (pools.tier). Do not deploy this ahead of it: the
// select below names `tier`, and PostgREST answers an unknown column with a
// 400 that this codebase's read helpers discard — the 2026-08-22 outage shape.
//
// ============================================================
// WHY THE TRANSACTION IS CREATED HERE AND NOT IN THE BROWSER
// ============================================================
// Paddle.js can open a checkout directly with `items` + `customData`. That puts
// the browser in charge of which pool gets credited: a user could open a
// checkout carrying someone else's pool_id, or a tier they are not entitled to
// buy, and our webhook would faithfully honour it.
//
// So the authorization happens BEFORE any payment form exists. This route
// checks that the caller is an admin of this specific pool, that the pool is
// not archived, and that the requested tier is a genuine upgrade — and only
// then stamps pool_id into the transaction's custom_data, server-side. The
// browser never sees or supplies it; it only gets an opaque transaction id.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> },
) {
  const { pool_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  // ---- 1. Is the caller an admin of THIS pool?
  const { data: membership } = await supabase
    .from('pool_members')
    .select('role')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // ---- 2. What did they ask for?
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })
  }

  const requestedTier = (body as { tier?: unknown })?.tier
  if (!isPaidTier(requestedTier)) {
    return NextResponse.json(
      { error: 'tier must be one of "plus", "max", "ultra"' },
      { status: 400 },
    )
  }

  // ---- 3. Is this pool in a state where an upgrade makes sense?
  const adminClient = createAdminClient()
  const { data: pool, error: poolErr } = await adminClient
    .from('pools')
    .select('pool_name, tier, archived_at')
    .eq('pool_id', pool_id)
    .single()

  if (poolErr || !pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }
  if (pool.archived_at) {
    return NextResponse.json({ error: 'This pool is archived' }, { status: 409 })
  }

  const currentTier: PoolTier = isPoolTier(pool.tier) ? pool.tier : 'free'

  // Charging for a tier they already have, or a lower one, would take real
  // money and change nothing — grantTier in the webhook never downgrades. Refuse
  // before the payment form rather than refunding afterwards.
  if (resolveTier(currentTier, requestedTier) === currentTier) {
    return NextResponse.json(
      {
        error: `This pool is already on ${currentTier}`,
        current_tier: currentTier,
      },
      { status: 409 },
    )
  }

  // ---- 4. Hand it to Paddle, with pool_id stamped server-side.
  try {
    const priceId = priceIdForTier(requestedTier)
    const transaction = await createCheckoutTransaction({
      priceId,
      customData: {
        pool_id,
        // Recorded for support, never trusted on the way back in: the webhook
        // re-derives everything it persists from the pool and the price.
        requested_by: userData.user_id,
        requested_tier: requestedTier,
      },
    })

    if (!transaction.checkoutUrl) {
      // The transaction exists but there is nowhere to pay it — almost always
      // a missing default payment link on the Paddle account.
      console.error('[pools/upgrade] transaction has no checkout url', transaction.id)
      return NextResponse.json(
        { error: 'Checkout is not available yet. Please try again later.' },
        { status: 503 },
      )
    }

    return NextResponse.json({
      transaction_id: transaction.id,
      checkout_url: transaction.checkoutUrl,
      tier: requestedTier,
      pool_name: pool.pool_name,
    })
  } catch (err) {
    // Configuration problems are ours, not the customer's. Log the detail —
    // which for Paddle carries the actionable half, e.g. the missing default
    // payment link — and tell the admin something true but unalarming.
    if (err instanceof PaddleConfigError || err instanceof PaddleApiError) {
      console.error('[pools/upgrade] checkout unavailable:', err.message)
      return NextResponse.json(
        { error: 'Checkout is not available yet. Please try again later.' },
        { status: 503 },
      )
    }
    throw err
  }
}
