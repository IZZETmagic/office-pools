import { PaddleConfigError, type EnvLike } from './tiers'

// Minimal server-side Paddle REST client.
//
// Base URLs and auth confirmed from Paddle's docs 2026-08-24:
//   live     https://api.paddle.com
//   sandbox  https://sandbox-api.paddle.com
//   header   Authorization: Bearer pdl_{live|sdbx}_apikey_…
//
// Only the operations we actually use are implemented. Same reasoning as the
// webhook: one or two calls do not justify @paddle/paddle-node-sdk and its
// version-drift surface, and a narrow client is a narrow thing to audit.
//
// ⚠ THIS KEY IS SERVER-ONLY. It can read customers, issue refunds and create
// transactions. It must never reach the browser — no NEXT_PUBLIC_ prefix, never
// returned in a response body, never logged. The client-side equivalent is a
// separate, far weaker client token (`test_…` / `live_…`), which this file does
// not touch.

const LIVE_BASE = 'https://api.paddle.com'
const SANDBOX_BASE = 'https://sandbox-api.paddle.com'

export type PaddleEnvironment = 'sandbox' | 'live'

export interface PaddleConfig {
  apiKey: string
  environment: PaddleEnvironment
  baseUrl: string
}

/**
 * Resolve config from the environment, and cross-check the two sources.
 *
 * The API key already states which environment it belongs to (`pdl_sdbx_` vs
 * `pdl_live_`), and PADDLE_ENVIRONMENT states it again because the webhook —
 * which never sees the API key — needs it to label ledger rows. Two sources for
 * one fact will eventually disagree, so we compare them and refuse to start
 * rather than let a live key write rows labelled "sandbox", or a sandbox
 * purchase get booked as real revenue.
 *
 * Paddle also rejects a sandbox credential against the live host, so a mismatch
 * would surface eventually — but as a bare "forbidden", long after the fact.
 */
export function resolvePaddleConfig(env: EnvLike = process.env): PaddleConfig {
  const apiKey = env.PADDLE_API_KEY
  if (!apiKey) throw new PaddleConfigError('PADDLE_API_KEY is not set')

  const declared = env.PADDLE_ENVIRONMENT
  if (declared !== 'sandbox' && declared !== 'live') {
    throw new PaddleConfigError('PADDLE_ENVIRONMENT must be "sandbox" or "live"')
  }

  const impliedByKey: PaddleEnvironment | null = apiKey.startsWith('pdl_sdbx_')
    ? 'sandbox'
    : apiKey.startsWith('pdl_live_')
      ? 'live'
      : null

  if (!impliedByKey) {
    throw new PaddleConfigError('PADDLE_API_KEY is not a Paddle API key (expected pdl_sdbx_… or pdl_live_…)')
  }
  if (impliedByKey !== declared) {
    // Deliberately does not echo the key.
    throw new PaddleConfigError(
      `PADDLE_ENVIRONMENT is "${declared}" but PADDLE_API_KEY is a ${impliedByKey} key`,
    )
  }

  return {
    apiKey,
    environment: declared,
    baseUrl: declared === 'live' ? LIVE_BASE : SANDBOX_BASE,
  }
}

export class PaddleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'PaddleApiError'
  }
}

interface PaddleErrorBody {
  error?: { code?: string; detail?: string; type?: string }
}

async function paddleFetch<T>(
  path: string,
  init: RequestInit,
  config: PaddleConfig,
): Promise<T> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    // Never cache a payments call.
    cache: 'no-store',
  })

  const text = await response.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    throw new PaddleApiError(`Paddle returned non-JSON (${response.status})`, response.status)
  }

  if (!response.ok) {
    const err = (body as PaddleErrorBody).error
    // Paddle's `detail` is the human-readable half and is what actually tells
    // you things like "no default payment link has been set for this account".
    throw new PaddleApiError(
      err?.detail ?? err?.code ?? `Paddle request failed (${response.status})`,
      response.status,
      err?.code,
    )
  }

  return (body as { data: T }).data
}

export interface CreatedTransaction {
  id: string
  status: string
  checkoutUrl: string | null
}

/**
 * Create a transaction server-side and return something the browser can pay.
 *
 * WHY SERVER-SIDE AND NOT Paddle.Checkout.open({ items, customData })
 * The overlay form lets the BROWSER decide the customData — which means the
 * browser decides which pool gets credited. Creating the transaction here means
 * `pool_id` is stamped by a route that has already checked the caller is an
 * admin of that pool, and the value is fixed before the customer sees a payment
 * form. The browser only ever learns a transaction ID.
 *
 * The returned `checkoutUrl` is Paddle's hosted checkout. `id` is also returned
 * so a later Paddle.js overlay (`Checkout.open({ transactionId })`) can be
 * dropped in without touching this server half at all.
 *
 * ⚠ REQUIRES A DEFAULT PAYMENT LINK ON THE PADDLE ACCOUNT. Without it every
 * call fails with "no default payment link has been set for this account" —
 * verified against the sandbox on 2026-08-24. It is a dashboard-only setting;
 * there is no API for it.
 */
export async function createCheckoutTransaction(
  {
    priceId,
    customData,
  }: {
    priceId: string
    customData: Record<string, unknown>
  },
  config: PaddleConfig = resolvePaddleConfig(),
): Promise<CreatedTransaction> {
  const data = await paddleFetch<{
    id: string
    status: string
    checkout?: { url?: string | null } | null
  }>(
    '/transactions',
    {
      method: 'POST',
      body: JSON.stringify({
        items: [{ price_id: priceId, quantity: 1 }],
        custom_data: customData,
        collection_mode: 'automatic',
      }),
    },
    config,
  )

  return {
    id: data.id,
    status: data.status,
    checkoutUrl: data.checkout?.url ?? null,
  }
}
