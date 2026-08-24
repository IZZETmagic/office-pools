import type { PaidTier } from './transactionCompleted'

// Which Paddle price to charge for each tier.
//
// PRICE IDS COME FROM THE ENVIRONMENT, NOT FROM SOURCE.
// Sandbox and live price IDs are different values, and they change whenever
// pricing changes. Hardcoding them here guarantees a wrong charge the first
// time we go live — the same trap the webhook avoids by reading
// custom_data.tier instead of matching an ID.
//
// Sandbox values, created 2026-08-24 (see drafts/2026-08-24_paddle_sandbox_catalog.md):
//   PADDLE_PRICE_ID_PLUS  = pri_01m0tjkgjdmk33fa8bbmktvt3b   $19
//   PADDLE_PRICE_ID_MAX   = pri_01m0tjkgrncz5tmtea1w6wsj7h   $49
//   PADDLE_PRICE_ID_ULTRA = pri_01m0tjkgyy8gpt6c6x7ncw3jc8   $500
//
// The displayed prices below are for the UI only. What the customer is actually
// charged is whatever Paddle says the price is — including local currency and
// any discount — and what we record is what Paddle reports in the webhook.
// These strings must never be treated as the source of truth for money.

export interface TierOffer {
  tier: PaidTier
  name: string
  displayPrice: string
  cadence: string
  blurb: string
  /** Members allowed. `null` = unlimited. */
  memberCap: number | null
  /** Entries per person. `null` = unlimited. */
  entryCap: number | null
}

// ⚠ THE DATABASE IS AUTHORITATIVE FOR THESE NUMBERS, NOT THIS FILE.
// They are enforced by pool_tier_member_cap() / pool_tier_entry_cap() in
// migration 075. The copies below exist so the UI can TELL someone the limit
// before they hit it — they never decide anything. A drift guard lives in
// lib/paddle/__tests__/tierLimits.test.ts.
export const FREE_TIER_MEMBER_CAP = 10
export const FREE_TIER_ENTRY_CAP = 1

export const TIER_OFFERS: readonly TierOffer[] = [
  {
    tier: 'plus',
    name: 'Pool Plus',
    displayPrice: '$19',
    cadence: 'per season',
    blurb: 'Banter, form and XP, every pool mode, custom scoring and pool branding.',
    memberCap: 30,
    entryCap: 3,
  },
  {
    tier: 'max',
    name: 'Pool Max',
    displayPrice: '$49',
    cadence: 'per season',
    blurb: 'Everything in Plus, plus a custom landing page, custom TV leaderboard, broadcast email and CSV export.',
    memberCap: null,
    entryCap: null,
  },
  {
    tier: 'ultra',
    name: 'Pool Ultra',
    displayPrice: '$500',
    cadence: 'per tournament',
    blurb: 'The venue tier. Everything in Max, plus a public bar profile, hosted TV page, in-bar ticker, match-night push and the print-ready marketing pack.',
    memberCap: null,
    entryCap: null,
  },
]

const PRICE_ENV_VAR: Record<PaidTier, string> = {
  plus: 'PADDLE_PRICE_ID_PLUS',
  max: 'PADDLE_PRICE_ID_MAX',
  ultra: 'PADDLE_PRICE_ID_ULTRA',
}

export class PaddleConfigError extends Error {}

/** Just the shape we read. `process.env` satisfies it, and so does a test object
 * — which is why this is not NodeJS.ProcessEnv: that type carries index-signature
 * baggage that forces an `as` cast at every call site. */
export type EnvLike = Record<string, string | undefined>

/** The Paddle price ID for a tier, or throw with the name of the missing var. */
export function priceIdForTier(tier: PaidTier, env: EnvLike = process.env): string {
  const name = PRICE_ENV_VAR[tier]
  const value = env[name]
  if (!value) {
    throw new PaddleConfigError(`${name} is not set — cannot start a ${tier} checkout`)
  }
  if (!/^pri_[a-z0-9]{26}$/.test(value)) {
    // A truncated or product-prefixed ID here fails at Paddle with a generic
    // 400 that says nothing useful; catching the shape locally names the var.
    throw new PaddleConfigError(`${name} is not a Paddle price ID (expected pri_…): ${value}`)
  }
  return value
}

export function offerForTier(tier: PaidTier): TierOffer {
  const offer = TIER_OFFERS.find(o => o.tier === tier)
  // TIER_OFFERS covers the PaidTier union exhaustively; this is a guard against
  // the union growing without the catalog following.
  if (!offer) throw new PaddleConfigError(`No offer configured for tier "${tier}"`)
  return offer
}
