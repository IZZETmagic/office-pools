import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  resolvePaddleConfig,
  createCheckoutTransaction,
  PaddleApiError,
} from '@/lib/paddle/api'
import { priceIdForTier, offerForTier, TIER_OFFERS, PaddleConfigError } from '@/lib/paddle/tiers'

const SANDBOX_KEY = 'pdl_sdbx_apikey_fake-for-tests-only'
const LIVE_KEY = 'pdl_live_apikey_fake-for-tests-only'
const PRICE_PLUS = 'pri_01m0tjkgjdmk33fa8bbmktvt3b'

describe('resolvePaddleConfig', () => {
  it('resolves the sandbox host from a sandbox key', () => {
    const config = resolvePaddleConfig({
      PADDLE_API_KEY: SANDBOX_KEY,
      PADDLE_ENVIRONMENT: 'sandbox',
    })
    expect(config.baseUrl).toBe('https://sandbox-api.paddle.com')
    expect(config.environment).toBe('sandbox')
  })

  it('resolves the live host from a live key', () => {
    const config = resolvePaddleConfig({
      PADDLE_API_KEY: LIVE_KEY,
      PADDLE_ENVIRONMENT: 'live',
    })
    expect(config.baseUrl).toBe('https://api.paddle.com')
  })

  it('refuses a live key labelled as sandbox', () => {
    // The dangerous direction: real charges booked into the ledger as test data.
    expect(() =>
      resolvePaddleConfig({
        PADDLE_API_KEY: LIVE_KEY,
        PADDLE_ENVIRONMENT: 'sandbox',
      }),
    ).toThrow(/is "sandbox" but PADDLE_API_KEY is a live key/)
  })

  it('refuses a sandbox key labelled as live', () => {
    expect(() =>
      resolvePaddleConfig({
        PADDLE_API_KEY: SANDBOX_KEY,
        PADDLE_ENVIRONMENT: 'live',
      }),
    ).toThrow(/is "live" but PADDLE_API_KEY is a sandbox key/)
  })

  it('never echoes the key in the mismatch error', () => {
    try {
      resolvePaddleConfig({
        PADDLE_API_KEY: LIVE_KEY,
        PADDLE_ENVIRONMENT: 'sandbox',
      })
      expect.unreachable('should have thrown')
    } catch (err) {
      expect((err as Error).message).not.toContain(LIVE_KEY)
    }
  })

  it.each([
    ['missing key', { PADDLE_ENVIRONMENT: 'sandbox' }, /PADDLE_API_KEY is not set/],
    ['missing environment', { PADDLE_API_KEY: SANDBOX_KEY }, /PADDLE_ENVIRONMENT must be/],
    ['bad environment', { PADDLE_API_KEY: SANDBOX_KEY, PADDLE_ENVIRONMENT: 'staging' }, /PADDLE_ENVIRONMENT must be/],
    ['unrecognised key', { PADDLE_API_KEY: 'sk_test_123', PADDLE_ENVIRONMENT: 'sandbox' }, /not a Paddle API key/],
  ])('rejects %s', (_label, env, message) => {
    expect(() => resolvePaddleConfig(env)).toThrow(message)
  })
})

describe('priceIdForTier', () => {
  it('reads the id from the environment', () => {
    expect(
      priceIdForTier('plus', { PADDLE_PRICE_ID_PLUS: PRICE_PLUS }),
    ).toBe(PRICE_PLUS)
  })

  it('names the missing variable', () => {
    expect(() => priceIdForTier('ultra', {})).toThrow(
      /PADDLE_PRICE_ID_ULTRA is not set/,
    )
  })

  it('rejects a product id pasted in place of a price id', () => {
    // pro_ and pri_ differ by one character and Paddle's own error for this is
    // an unhelpful generic 400.
    expect(() =>
      priceIdForTier('plus', {
        PADDLE_PRICE_ID_PLUS: 'pro_01m0tjkgdr87c77xz0szvgjwpz',
      }),
    ).toThrow(/not a Paddle price ID/)
  })

  it('rejects a truncated id', () => {
    expect(() =>
      priceIdForTier('max', { PADDLE_PRICE_ID_MAX: 'pri_01m0tjkg' }),
    ).toThrow(PaddleConfigError)
  })
})

describe('tier offers', () => {
  it('covers every purchasable tier', () => {
    expect(TIER_OFFERS.map(o => o.tier)).toEqual(['plus', 'max', 'ultra'])
  })

  it('is ordered cheapest first', () => {
    const amounts = TIER_OFFERS.map(o => Number(o.displayPrice.replace(/[^0-9]/g, '')))
    expect(amounts).toEqual([...amounts].sort((a, b) => a - b))
  })

  it('resolves an offer by tier', () => {
    expect(offerForTier('ultra').name).toBe('Pool Ultra')
  })
})

describe('createCheckoutTransaction', () => {
  const config = {
    apiKey: SANDBOX_KEY,
    environment: 'sandbox' as const,
    baseUrl: 'https://sandbox-api.paddle.com',
  }

  afterEach(() => vi.unstubAllGlobals())

  function stubFetch(status: number, body: unknown) {
    const spy = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    })
    vi.stubGlobal('fetch', spy)
    return spy
  }

  it('posts the price and custom data, and returns the checkout url', async () => {
    const spy = stubFetch(201, {
      data: {
        id: 'txn_01h',
        status: 'ready',
        checkout: { url: 'https://sportpool.io/checkout?_ptxn=txn_01h' },
      },
    })

    const result = await createCheckoutTransaction(
      { priceId: PRICE_PLUS, customData: { pool_id: 'pool-uuid' } },
      config,
    )

    expect(result).toEqual({
      id: 'txn_01h',
      status: 'ready',
      checkoutUrl: 'https://sportpool.io/checkout?_ptxn=txn_01h',
    })

    const [url, init] = spy.mock.calls[0]
    expect(url).toBe('https://sandbox-api.paddle.com/transactions')
    expect(init.headers.Authorization).toBe(`Bearer ${SANDBOX_KEY}`)
    expect(init.cache).toBe('no-store')
    expect(JSON.parse(init.body)).toEqual({
      items: [{ price_id: PRICE_PLUS, quantity: 1 }],
      custom_data: { pool_id: 'pool-uuid' },
      collection_mode: 'automatic',
    })
  })

  it('reports null when Paddle returns no checkout url', async () => {
    stubFetch(201, { data: { id: 'txn_01h', status: 'draft', checkout: null } })
    const result = await createCheckoutTransaction(
      { priceId: PRICE_PLUS, customData: {} },
      config,
    )
    expect(result.checkoutUrl).toBeNull()
  })

  it("surfaces Paddle's detail message, which is the actionable half", async () => {
    // The real sandbox response on 2026-08-24 before a default payment link
    // was configured.
    stubFetch(400, {
      error: {
        code: 'transaction_default_checkout_url_not_set',
        detail:
          'Cannot create a transaction or open a checkout as no default payment link has been set for this account.',
        type: 'request_error',
      },
    })

    await expect(
      createCheckoutTransaction({ priceId: PRICE_PLUS, customData: {} }, config),
    ).rejects.toThrow(/no default payment link has been set/)
  })

  it('carries the status and code on the error', async () => {
    stubFetch(403, { error: { code: 'forbidden', detail: 'Nope', type: 'request_error' } })
    try {
      await createCheckoutTransaction({ priceId: PRICE_PLUS, customData: {} }, config)
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(PaddleApiError)
      expect((err as PaddleApiError).status).toBe(403)
      expect((err as PaddleApiError).code).toBe('forbidden')
    }
  })

  it('does not crash on a non-JSON response', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => '<html>Bad Gateway</html>',
    })
    vi.stubGlobal('fetch', spy)

    await expect(
      createCheckoutTransaction({ priceId: PRICE_PLUS, customData: {} }, config),
    ).rejects.toThrow(/non-JSON \(502\)/)
  })
})
