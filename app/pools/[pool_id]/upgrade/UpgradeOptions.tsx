'use client'

import { useState } from 'react'
import type { TierOffer } from '@/lib/paddle/tiers'
import type { PaidTier } from '@/lib/paddle/transactionCompleted'

// The buy buttons. Phase 3a Step 3.
//
// WHY THIS SENDS THE BROWSER TO PADDLE RATHER THAN OPENING AN OVERLAY
// The plan said "Paddle.js overlay". This does a hosted-checkout redirect
// instead, deliberately, for the first version:
//
//   * The overlay needs @paddle/paddle-js, a public client token, and
//     Paddle.Initialize() — three new things to configure and get wrong before
//     a single test purchase exists.
//   * The server already creates the transaction (so pool_id cannot be forged),
//     and /api/pools/:id/upgrade returns BOTH `checkout_url` and
//     `transaction_id`. Switching to an overlay later is
//     `Paddle.Checkout.open({ transactionId })` in this one component — the
//     server half does not change at all.
//   * Upgrading a pool is a rare, deliberate act by an admin, not a
//     conversion-optimised consumer funnel. A redirect is fine here.
//
// So: no dependency, no client token, no CSP surface, and the overlay is a
// drop-in whenever someone wants the nicer UX.

interface UpgradeOptionsProps {
  poolId: string
  offers: readonly TierOffer[]
}

export function UpgradeOptions({ poolId, offers }: UpgradeOptionsProps) {
  const [pending, setPending] = useState<PaidTier | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function startCheckout(tier: PaidTier) {
    setPending(tier)
    setError(null)
    try {
      const response = await fetch(`/api/pools/${poolId}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      const body = await response.json()

      if (!response.ok) {
        setError(body?.error ?? 'Could not start checkout. Please try again.')
        setPending(null)
        return
      }

      // Leaving the app — deliberately not resetting `pending`, so the button
      // stays disabled through the navigation instead of flashing back to
      // "Upgrade" and inviting a second click.
      // .assign() rather than `location.href =` — an assignment to a value
      // outside the component trips react-hooks/immutability, and the Vercel
      // build fails on any lint error.
      window.location.assign(body.checkout_url)
    } catch {
      setError('Could not reach the server. Please check your connection.')
      setPending(null)
    }
  }

  return (
    <div className="mt-8">
      {error && (
        <p
          role="alert"
          className="mb-6 rounded-control border border-danger-300 bg-danger-50 p-4 text-sm text-danger-800"
        >
          {error}
        </p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {offers.map(offer => (
          <li
            key={offer.tier}
            className="flex flex-col rounded-card border border-border-default bg-surface p-5 shadow-sm"
          >
            <h2 className="text-base font-bold text-neutral-900">{offer.name}</h2>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold tabular-nums text-neutral-900">
                {offer.displayPrice}
              </span>
              <span className="text-xs text-neutral-500">{offer.cadence}</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-neutral-700">{offer.blurb}</p>

            {/* The caps are the concrete half of the upsell — and the thing the
                database will actually enforce (migration 075), so they belong on
                the card rather than buried in prose. */}
            <ul className="mt-3 flex-1 space-y-1 text-sm text-neutral-700">
              <li>
                <span className="font-semibold tabular-nums">
                  {offer.memberCap === null ? 'Unlimited' : `Up to ${offer.memberCap}`}
                </span>{' '}
                members
              </li>
              <li>
                <span className="font-semibold tabular-nums">
                  {offer.entryCap === null ? 'Unlimited' : offer.entryCap}
                </span>{' '}
                {offer.entryCap === 1 ? 'entry' : 'entries'} per person
              </li>
            </ul>
            <button
              type="button"
              onClick={() => startCheckout(offer.tier)}
              disabled={pending !== null}
              className="mt-5 rounded-control bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending === offer.tier ? 'Starting checkout…' : `Upgrade to ${offer.name}`}
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-xs text-neutral-500">
        Prices shown are in USD. Paddle will show the final amount, including any local
        tax, before you pay.
      </p>
    </div>
  )
}
