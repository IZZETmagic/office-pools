// Narrow types and pure extraction for the one Paddle event we act on.
//
// Payload paths read from
// https://developer.paddle.com/webhooks/transactions/transaction-completed
// on 2026-08-24. Only the fields we consume are typed — the real payload is
// far larger, and typing all of it would be a maintenance liability that buys
// nothing. Everything here is pure so it can be unit-tested without a network
// or a database.

export type PaidTier = 'plus' | 'max' | 'ultra'
export type PoolTier = 'free' | PaidTier

/** Upgrade-only ordering. Index is the rank; higher wins. */
const TIER_RANK: readonly PoolTier[] = ['free', 'plus', 'max', 'ultra']

export function tierRank(tier: PoolTier): number {
  return TIER_RANK.indexOf(tier)
}

/**
 * A purchase must never downgrade a pool.
 *
 * Real case this guards: a venue on Pool Ultra buys a $19 Pool Plus for a
 * second competition and the webhook fires against the same pool. Naively
 * writing the purchased tier would strip $481 of paid features. When the
 * purchased tier is not an upgrade we keep the existing one — the money is
 * still recorded in pool_purchases either way, so nothing is lost, and a human
 * can sort out the intent from the ledger.
 */
export function resolveTier(current: PoolTier, purchased: PaidTier): PoolTier {
  return tierRank(purchased) > tierRank(current) ? purchased : current
}

export function isPaidTier(value: unknown): value is PaidTier {
  return value === 'plus' || value === 'max' || value === 'ultra'
}

export function isPoolTier(value: unknown): value is PoolTier {
  return value === 'free' || isPaidTier(value)
}

// ---------------------------------------------------------------- payload

interface PaddleCustomData {
  [key: string]: unknown
}

interface PaddleItem {
  price?: {
    id?: string
    custom_data?: PaddleCustomData | null
  } | null
}

export interface PaddleTransactionCompleted {
  event_id?: string
  event_type?: string
  occurred_at?: string
  notification_id?: string
  data?: {
    id?: string
    customer_id?: string | null
    status?: string
    custom_data?: PaddleCustomData | null
    items?: PaddleItem[] | null
    details?: {
      totals?: {
        total?: string
        currency_code?: string
      } | null
      line_items?: Array<{ price_id?: string }> | null
    } | null
  } | null
}

export interface ExtractedPurchase {
  transactionId: string
  customerId: string | null
  poolId: string
  tier: PaidTier
  priceId: string
  amountCents: number
  currencyCode: string
  occurredAt: string | null
}

export type ExtractionFailure =
  | 'not_completed_transaction'
  | 'missing_transaction_id'
  | 'missing_pool_id'
  | 'missing_tier'
  | 'missing_price_id'
  | 'bad_amount'
  | 'missing_currency'

export type ExtractionResult =
  | { ok: true; purchase: ExtractedPurchase }
  | { ok: false; reason: ExtractionFailure }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Pull the fields we need out of a transaction.completed payload.
 *
 * WHY TIER COMES FROM custom_data AND NOT FROM THE PRICE ID
 * Sandbox and live price IDs differ, and prices change whenever pricing
 * changes. A hardcoded `pri_… → tier` map is therefore guaranteed to be wrong
 * at go-live and again at every price revision. `custom_data.tier` was stamped
 * onto every product AND price when the catalog was created, so the tier
 * travels with the purchase. The price ID is still recorded, for reconciliation
 * against Paddle — it just is not what we branch on.
 *
 * WHY amount COMES FROM THE PAYLOAD AND NOT FROM OUR PRICE TABLE
 * Paddle is the merchant of record; what it charged is the fact. Discounts,
 * proration and currency overrides all mean the charged total can legitimately
 * differ from our list price. Recording what we *think* it should be would put
 * a number in the ledger that no Paddle report will ever match.
 */
export function extractPurchase(event: PaddleTransactionCompleted): ExtractionResult {
  if (event.event_type !== 'transaction.completed') {
    return { ok: false, reason: 'not_completed_transaction' }
  }

  const data = event.data
  if (!data?.id) return { ok: false, reason: 'missing_transaction_id' }

  const poolId = data.custom_data?.pool_id
  if (typeof poolId !== 'string' || !UUID_RE.test(poolId)) {
    return { ok: false, reason: 'missing_pool_id' }
  }

  const items = data.items ?? []
  let tier: PaidTier | null = null
  let priceId: string | null = null

  for (const item of items) {
    const candidate = item?.price?.custom_data?.tier
    if (isPaidTier(candidate)) {
      tier = candidate
      priceId = item?.price?.id ?? null
      break
    }
  }
  if (!tier) return { ok: false, reason: 'missing_tier' }

  // Fall back to the computed billing line if the item carried no price id.
  priceId = priceId ?? data.details?.line_items?.[0]?.price_id ?? null
  if (!priceId) return { ok: false, reason: 'missing_price_id' }

  const rawTotal = data.details?.totals?.total
  // Paddle sends amounts as INTEGER STRINGS in the lowest denomination —
  // "1900" is $19.00. Validate the string shape before converting, not the
  // number after: Number('19.00') is 19 and Number.isInteger(19) is true, so a
  // post-parse integer check happily accepts a decimal string and books 19
  // cents as the price of a $19 tier. A unit test caught exactly that.
  // Number('') and Number(null) are both 0, so the digits-only test is also
  // what rejects a missing total.
  if (typeof rawTotal !== 'string' || !/^\d+$/.test(rawTotal)) {
    return { ok: false, reason: 'bad_amount' }
  }
  const amountCents = Number(rawTotal)
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return { ok: false, reason: 'bad_amount' }
  }

  const currencyCode = data.details?.totals?.currency_code
  if (typeof currencyCode !== 'string' || currencyCode.length !== 3) {
    return { ok: false, reason: 'missing_currency' }
  }

  return {
    ok: true,
    purchase: {
      transactionId: data.id,
      customerId: data.customer_id ?? null,
      poolId,
      tier,
      priceId,
      amountCents,
      currencyCode,
      occurredAt: event.occurred_at ?? null,
    },
  }
}
