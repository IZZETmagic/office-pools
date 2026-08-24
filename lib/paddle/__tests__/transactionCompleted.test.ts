import { describe, it, expect } from 'vitest'
import {
  extractPurchase,
  resolveTier,
  tierRank,
  isPaidTier,
  type PaddleTransactionCompleted,
} from '@/lib/paddle/transactionCompleted'

const POOL_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

/** A payload shaped like the documented transaction.completed event. */
function event(overrides: Partial<PaddleTransactionCompleted> = {}): PaddleTransactionCompleted {
  return {
    event_id: 'evt_01h',
    event_type: 'transaction.completed',
    occurred_at: '2026-08-24T12:00:00.000Z',
    data: {
      id: 'txn_01h',
      customer_id: 'ctm_01h',
      status: 'completed',
      custom_data: { pool_id: POOL_ID },
      items: [
        { price: { id: 'pri_01m0tjkgjdmk33fa8bbmktvt3b', custom_data: { tier: 'plus' } } },
      ],
      details: {
        totals: { total: '1900', currency_code: 'USD' },
        line_items: [{ price_id: 'pri_01m0tjkgjdmk33fa8bbmktvt3b' }],
      },
    },
    ...overrides,
  }
}

describe('tier ordering', () => {
  it('ranks tiers in upgrade order', () => {
    expect(tierRank('free')).toBeLessThan(tierRank('plus'))
    expect(tierRank('plus')).toBeLessThan(tierRank('max'))
    expect(tierRank('max')).toBeLessThan(tierRank('ultra'))
  })

  it('accepts only the three purchasable tiers', () => {
    expect(isPaidTier('plus')).toBe(true)
    expect(isPaidTier('ultra')).toBe(true)
    expect(isPaidTier('free')).toBe(false) // free is not a purchase
    expect(isPaidTier('enterprise')).toBe(false)
  })
})

describe('resolveTier', () => {
  it('upgrades', () => {
    expect(resolveTier('free', 'plus')).toBe('plus')
    expect(resolveTier('plus', 'ultra')).toBe('ultra')
  })

  it('never downgrades', () => {
    // The $481 bug: an Ultra venue buys a $19 Plus for another competition and
    // naively writing the purchased tier would strip their paid features.
    expect(resolveTier('ultra', 'plus')).toBe('ultra')
    expect(resolveTier('max', 'plus')).toBe('max')
  })

  it('is idempotent for a repeat purchase of the same tier', () => {
    expect(resolveTier('max', 'max')).toBe('max')
  })
})

describe('extractPurchase', () => {
  it('extracts every field we persist', () => {
    const result = extractPurchase(event())
    expect(result).toEqual({
      ok: true,
      purchase: {
        transactionId: 'txn_01h',
        customerId: 'ctm_01h',
        poolId: POOL_ID,
        tier: 'plus',
        priceId: 'pri_01m0tjkgjdmk33fa8bbmktvt3b',
        amountCents: 1900,
        currencyCode: 'USD',
        occurredAt: '2026-08-24T12:00:00.000Z',
      },
    })
  })

  it('reads the tier from custom_data, not from the price id', () => {
    // Sandbox and live price IDs differ. If this ever regresses to an ID map,
    // an unknown ID like this one would fail — here it must still resolve.
    const e = event()
    e.data!.items = [{ price: { id: 'pri_totally_unknown_live_id', custom_data: { tier: 'ultra' } } }]
    const result = extractPurchase(e)
    expect(result.ok && result.purchase.tier).toBe('ultra')
    expect(result.ok && result.purchase.priceId).toBe('pri_totally_unknown_live_id')
  })

  it('records what Paddle actually charged, not our list price', () => {
    // A discounted Pool Max: tier stays max, amount reflects reality.
    const e = event()
    e.data!.items = [{ price: { id: 'pri_max', custom_data: { tier: 'max' } } }]
    e.data!.details!.totals = { total: '3920', currency_code: 'GBP' }
    const result = extractPurchase(e)
    expect(result.ok && result.purchase).toMatchObject({
      tier: 'max',
      amountCents: 3920,
      currencyCode: 'GBP',
    })
  })

  it('falls back to details.line_items for the price id', () => {
    const e = event()
    e.data!.items = [{ price: { custom_data: { tier: 'plus' } } }]
    const result = extractPurchase(e)
    expect(result.ok && result.purchase.priceId).toBe('pri_01m0tjkgjdmk33fa8bbmktvt3b')
  })

  it('finds the tier on a later item', () => {
    const e = event()
    e.data!.items = [
      { price: { id: 'pri_other', custom_data: null } },
      { price: { id: 'pri_tiered', custom_data: { tier: 'max' } } },
    ]
    const result = extractPurchase(e)
    expect(result.ok && result.purchase.tier).toBe('max')
    expect(result.ok && result.purchase.priceId).toBe('pri_tiered')
  })

  it('tolerates a null customer_id', () => {
    const e = event()
    e.data!.customer_id = null
    const result = extractPurchase(e)
    expect(result.ok && result.purchase.customerId).toBeNull()
  })

  describe('rejections', () => {
    it('ignores other event types', () => {
      const result = extractPurchase(event({ event_type: 'subscription.created' }))
      expect(result).toEqual({ ok: false, reason: 'not_completed_transaction' })
    })

    it('rejects a missing transaction id', () => {
      const e = event()
      delete e.data!.id
      expect(extractPurchase(e)).toEqual({ ok: false, reason: 'missing_transaction_id' })
    })

    it('rejects a missing pool_id', () => {
      const e = event()
      e.data!.custom_data = null
      expect(extractPurchase(e)).toEqual({ ok: false, reason: 'missing_pool_id' })
    })

    it('rejects a pool_id that is not a uuid', () => {
      // Guards against a checkout that passes a pool CODE instead of the id.
      const e = event()
      e.data!.custom_data = { pool_id: 'ABC123' }
      expect(extractPurchase(e)).toEqual({ ok: false, reason: 'missing_pool_id' })
    })

    it('rejects an unknown tier', () => {
      const e = event()
      e.data!.items = [{ price: { id: 'pri_x', custom_data: { tier: 'platinum' } } }]
      expect(extractPurchase(e)).toEqual({ ok: false, reason: 'missing_tier' })
    })

    it('rejects a purchase with no tier metadata at all', () => {
      const e = event()
      e.data!.items = [{ price: { id: 'pri_x', custom_data: null } }]
      expect(extractPurchase(e)).toEqual({ ok: false, reason: 'missing_tier' })
    })

    it.each([
      ['missing', undefined],
      ['empty string', ''],
      ['zero', '0'],
      ['negative', '-1900'],
      ['fractional', '19.00'],
      ['not a number', 'nineteen'],
    ])('rejects a %s total', (_label, total) => {
      const e = event()
      e.data!.details!.totals = { total: total as string | undefined, currency_code: 'USD' }
      expect(extractPurchase(e)).toEqual({ ok: false, reason: 'bad_amount' })
    })

    it('rejects a missing currency', () => {
      const e = event()
      e.data!.details!.totals = { total: '1900' }
      expect(extractPurchase(e)).toEqual({ ok: false, reason: 'missing_currency' })
    })
  })
})
