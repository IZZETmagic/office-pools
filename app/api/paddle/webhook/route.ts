import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyPaddleSignature } from '@/lib/paddle/verifySignature'
import {
  extractPurchase,
  resolveTier,
  isPoolTier,
  type PaddleTransactionCompleted,
  type PoolTier,
} from '@/lib/paddle/transactionCompleted'

// POST /api/paddle/webhook
//
// The only way a pool becomes paid. Phase 3a Step 2.
// Schema: lib/migrations/067_pool_tier_and_purchases.sql (NOT YET APPLIED).
//
// node:crypto for the HMAC, so this must not run on the edge runtime.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ============================================================
// WHY THIS ROUTE HAS NO requireAuth()
// ============================================================
// Every other route in this codebase starts with `requireAuth()`. This one
// cannot: the caller is Paddle, not a signed-in user, and there is no session.
// The HMAC signature IS the authentication, which is why verifySignature.ts
// uses a constant-time compare and why the secret is never logged.
//
// Consequence: this endpoint is public. Anything it does must be safe to have
// attempted by an anonymous caller a thousand times a second. It is — an
// unsigned request is rejected before a single database call.
//
// ============================================================
// THE FIVE-SECOND BUDGET
// ============================================================
// Paddle requires HTTP 200 within five seconds and advises responding *before*
// internal processing. We deliberately process inline anyway, because the
// advice is aimed at slow third-party calls and does not fit a payment write:
// if we 200 first and the insert then fails, Paddle never retries and the
// purchase is lost silently, which is the worst possible failure for revenue.
//
// What we do instead is keep the inline work to two fast statements against our
// own database — well inside the budget — and let a genuine failure return 500
// so Paddle retries. Idempotency (below) makes those retries free. Anything
// slow (receipt email, admin push) belongs in `after()` from next/server, or a
// cron, and must never sit between the request and the response.
//
// Sandbox retries 3 times over 15 minutes; live retries 60 times over 3 days.
//
// ============================================================
// IDEMPOTENCY
// ============================================================
// Paddle delivers at-least-once. The guarantee that a retried event cannot
// double-charge a pool or double-book revenue is the UNIQUE constraint
// `pool_purchases_paddle_txn_key`, not any check in this file. On a unique
// violation we treat the event as already recorded, re-assert the tier (in case
// a previous attempt died between the two writes), and return 200.
//
// That re-assert is what makes a partial failure self-healing rather than a
// pool that paid and never got its features.

type Handled = { status: number; body: Record<string, unknown> }

function ok(body: Record<string, unknown> = {}): Handled {
  return { status: 200, body: { received: true, ...body } }
}

/** Fail loud: 500 keeps the event visible in Paddle's dashboard AND retried. */
function unprocessable(reason: string, detail?: unknown): Handled {
  console.error('[paddle/webhook] unprocessable', reason, detail ?? '')
  return { status: 500, body: { received: false, reason } }
}

function readEnvironment(): 'sandbox' | 'live' | null {
  const raw = process.env.PADDLE_ENVIRONMENT
  return raw === 'sandbox' || raw === 'live' ? raw : null
}

export async function POST(request: NextRequest) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET
  if (!secret) {
    // Configuration error, not a bad request. 500 so it retries once we fix it.
    return NextResponse.json(
      { received: false, reason: 'not_configured' },
      { status: 500 },
    )
  }

  // The environment label is NOT NULL with no default in the ledger, on purpose:
  // booking sandbox money as real revenue is worse than a loud failure.
  const environment = readEnvironment()
  if (!environment) {
    return NextResponse.json(
      { received: false, reason: 'PADDLE_ENVIRONMENT must be "sandbox" or "live"' },
      { status: 500 },
    )
  }

  // ⚠ RAW BODY FIRST. Calling request.json() here and re-stringifying breaks
  // every signature — see the note in verifySignature.ts.
  const rawBody = await request.text()

  const verdict = verifyPaddleSignature(
    rawBody,
    request.headers.get('paddle-signature'),
    secret,
  )
  if (!verdict.ok) {
    // 401 and nothing else. No detail in the body: a caller probing this
    // endpoint should not learn whether it failed on shape, HMAC, or age.
    console.warn('[paddle/webhook] rejected:', verdict.reason)
    return NextResponse.json({ received: false }, { status: 401 })
  }

  let event: PaddleTransactionCompleted
  try {
    event = JSON.parse(rawBody)
  } catch {
    // Signed by Paddle but not JSON. Retrying will not fix it.
    return NextResponse.json({ received: true, ignored: 'unparseable' }, { status: 200 })
  }

  // We subscribe to exactly one event type today. Acknowledge anything else with
  // a 200 — a 500 here would make Paddle retry an event we will never act on,
  // 60 times, and bury the real failures in the dashboard.
  if (event.event_type !== 'transaction.completed') {
    const res = ok({ ignored: event.event_type ?? 'unknown' })
    return NextResponse.json(res.body, { status: res.status })
  }

  const extracted = extractPurchase(event)
  if (!extracted.ok) {
    // A genuine completed transaction we cannot act on: money changed hands and
    // we do not know which pool to credit. Never silently 200 this away.
    const res = unprocessable(extracted.reason, { event_id: event.event_id })
    return NextResponse.json(res.body, { status: res.status })
  }

  const p = extracted.purchase
  const supabase = createAdminClient()

  // ---- 1. Record the money. The UNIQUE constraint is the idempotency gate.
  const { error: insertError } = await supabase.from('pool_purchases').insert({
    pool_id: p.poolId,
    tier: p.tier,
    paddle_transaction_id: p.transactionId,
    paddle_customer_id: p.customerId,
    paddle_price_id: p.priceId,
    amount_cents: p.amountCents,
    currency_code: p.currencyCode,
    environment,
    status: 'completed',
    purchased_at: p.occurredAt ?? new Date().toISOString(),
  })

  const alreadyRecorded = insertError?.code === '23505'

  if (insertError && !alreadyRecorded) {
    // 23503 = foreign key violation, i.e. the pool does not exist. That and any
    // other write error are worth retrying and worth a human seeing.
    const res = unprocessable('insert_failed', {
      code: insertError.code,
      message: insertError.message,
      transaction_id: p.transactionId,
    })
    return NextResponse.json(res.body, { status: res.status })
  }

  // ---- 2. Grant the tier. Runs on the already-recorded path too, so an
  // attempt that died between the two writes heals on Paddle's next retry.
  const granted = await grantTier(supabase, p.poolId, p.tier)
  if (!granted.ok) {
    const res = unprocessable('grant_failed', {
      detail: granted.reason,
      transaction_id: p.transactionId,
    })
    return NextResponse.json(res.body, { status: res.status })
  }

  const res = ok({
    transaction_id: p.transactionId,
    pool_id: p.poolId,
    tier: granted.tier,
    already_recorded: alreadyRecorded,
  })
  return NextResponse.json(res.body, { status: res.status })
}

/**
 * Read-then-write, upgrade-only.
 *
 * NOT ATOMIC, and knowingly so. Two purchases landing on the same pool within
 * the same few milliseconds could interleave and leave the lower tier. That
 * needs two people buying two tiers for one pool simultaneously; both payments
 * are still in `pool_purchases` either way, so the ledger stays correct and a
 * human can reconcile. Making it atomic means a SQL function, which is a
 * migration — not worth it before a single real purchase exists.
 *
 * The service-role client is required here: `trg_pools_tier_is_purchased`
 * silently reverts a tier change made by any other role.
 */
async function grantTier(
  supabase: ReturnType<typeof createAdminClient>,
  poolId: string,
  purchased: 'plus' | 'max' | 'ultra',
): Promise<{ ok: true; tier: PoolTier } | { ok: false; reason: string }> {
  const { data: pool, error: readError } = await supabase
    .from('pools')
    .select('tier')
    .eq('pool_id', poolId)
    .single()

  if (readError || !pool) {
    return { ok: false, reason: readError?.message ?? 'pool_not_found' }
  }

  const current: PoolTier = isPoolTier(pool.tier) ? pool.tier : 'free'
  const next = resolveTier(current, purchased)

  if (next === current) return { ok: true, tier: current }

  const { error: writeError } = await supabase
    .from('pools')
    .update({ tier: next })
    .eq('pool_id', poolId)

  if (writeError) return { ok: false, reason: writeError.message }
  return { ok: true, tier: next }
}
