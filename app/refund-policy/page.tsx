import Link from 'next/link'
import type { Metadata } from 'next'
import { PublicNav } from '@/components/PublicNav'

export const metadata: Metadata = {
  title: 'Refund Policy',
  description:
    'SportPool Refund Policy — how refunds work on paid pool tiers, what the 14-day window covers, and why entry fees between members are handled separately.',
}

/**
 * Companion to /pricing. The two pages must agree — if a price, window, or
 * billing cadence changes in one, change it in the other and in ToS §5.
 *
 * Section 8 is the load-bearing one. Entry fees between an admin and their
 * members never touch SportPool (drafts/2026-07-25_entry_fee_collection_assessment.md),
 * so we cannot refund them and must not imply otherwise. Keep that distinction
 * explicit anywhere refunds are described.
 */

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-surface">
      <PublicNav />

      {/* Header */}
      <section className="py-16 sm:py-24 bg-surface-secondary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-neutral-900">
              Refund Policy
            </h1>
            <p className="mt-4 text-lg text-neutral-700 max-w-2xl mx-auto">
              If a paid pool was not the right call, we would rather give you your money back than keep it.
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm text-neutral-500 mb-12">Last updated: August 22, 2026</p>

          {/* Summary card */}
          <div className="mb-12 rounded-card border border-border-default bg-surface-secondary p-6">
            <h2 className="font-bold text-neutral-900">The short version</h2>
            <ul className="mt-3 space-y-2 text-neutral-700 leading-relaxed">
              <li className="flex gap-2.5">
                <span className="text-success-600 font-bold shrink-0" aria-hidden="true">&#10003;</span>
                <span>Full refund within <strong>14 days</strong>, as long as your pool has not started.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-success-600 font-bold shrink-0" aria-hidden="true">&#10003;</span>
                <span>Full refund at <strong>any time</strong> if the competition never starts or we cannot deliver what you paid for.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-neutral-500 font-bold shrink-0" aria-hidden="true">&mdash;</span>
                <span>Entry fees you paid to a <strong>pool admin</strong> are not ours to refund. We never receive that money.</span>
              </li>
            </ul>
          </div>

          <div className="space-y-10">
            {/* 1 */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                1. What this policy covers
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  This policy applies to payments made to SportPool for paid pool tiers &mdash; Pool Plus, Pool Max, and Pool Ultra &mdash; and to any other product we sell directly, as listed on our{' '}
                  <Link href="/pricing" className="text-primary-600 hover:underline">
                    Pricing page
                  </Link>
                  .
                </p>
                <p>
                  It does not apply to entry fees, buy-ins, or prize money arranged between a pool administrator and the members of their pool. Those never pass through SportPool, and Section 8 explains what to do about them.
                </p>
                <p>
                  This policy sits alongside our{' '}
                  <Link href="/terms" className="text-primary-600 hover:underline">
                    Terms of Service
                  </Link>
                  . Nothing here limits any refund or cancellation right you have under the consumer law of the country you live in &mdash; where that law gives you more than this policy does, the law wins.
                </p>
              </div>
            </div>

            {/* 2 */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                2. What you are buying
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  A paid tier is a <strong>one-time purchase for a single season or tournament</strong>. It is not a subscription. Nothing renews automatically, and we will not charge the same card again unless you deliberately buy something else.
                </p>
                <p>
                  Because there is no recurring charge, there is nothing to cancel. If you simply do not want to pay again next season, do nothing &mdash; no charge will be made.
                </p>
              </div>
            </div>

            {/* 3 */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                3. The 14-day refund window
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  You can request a full refund within <strong>14 days of your purchase</strong>, provided your pool has not yet started &mdash; that is, provided the first prediction deadline in your pool has not locked.
                </p>
                <p>
                  You do not need to give a reason. Changed your mind, bought the wrong tier, your group decided not to play &mdash; all of it counts.
                </p>
                <p>
                  If we refund a paid tier, the pool returns to the Free tier. Any predictions, standings, and banter already in the pool stay exactly where they are; only the paid features switch off, and members over the Free tier limit will no longer be able to submit new entries.
                </p>
              </div>
            </div>

            {/* 4 */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                4. After your pool has started
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  Once the first prediction deadline has locked, the pool is live and the service you paid for is being delivered &mdash; scoring, leaderboards, and the rest of it &mdash; so purchases are generally non-refundable from that point.
                </p>
                <p>
                  There are two standing exceptions, and we apply them without argument:
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <strong>The competition never happens</strong>, or is abandoned or cancelled by its organisers before a meaningful part of it has been played. You get a full refund.
                  </li>
                  <li>
                    <strong>We fail to deliver.</strong> If a paid feature does not work, or a fault on our side materially spoils your pool, tell us. Depending on what happened and when, we will refund you in full or in part.
                  </li>
                </ul>
                <p>
                  Outside those cases we will still look at genuine mistakes &mdash; a duplicate purchase, the wrong pool, a tier bought minutes before a deadline nobody noticed. Write to us and explain. We would rather be fair than technically correct.
                </p>
              </div>
            </div>

            {/* 5 */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                5. Pool Ultra and venue purchases
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  Pool Ultra is bought by venues ahead of a tournament and includes work we produce specifically for you, so it works a little differently:
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <strong>Full refund</strong> if you cancel more than <strong>30 days before</strong> the tournament begins.
                  </li>
                  <li>
                    <strong>Partial refund</strong> inside 30 days, reduced by the value of anything already produced or delivered to you &mdash; in particular a branded marketing pack, which is made to order and cannot be un-made.
                  </li>
                  <li>
                    <strong>No refund</strong> once the tournament has begun, except under the service-failure exception in Section 4.
                  </li>
                </ul>
                <p>
                  If you are a venue and something has gone wrong, contact us directly rather than working through this page &mdash; we will deal with it personally.
                </p>
              </div>
            </div>

            {/* 6 */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                6. Recurring subscriptions
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  We do not currently sell any recurring subscription. If we introduce one, these terms will apply to it and we will say so here before it goes on sale:
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>You can cancel at any time, and cancelling stops all future charges.</li>
                  <li>
                    Cancelling takes effect at the <strong>end of the period you have already paid for</strong>. You keep access until then, and we do not refund the part of the period already used.
                  </li>
                  <li>The 14-day window in Section 3 applies to your first payment.</li>
                </ul>
              </div>
            </div>

            {/* 7 */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                7. Purchases made through the App Store or Google Play
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  Paid tiers are sold through our website. If we ever sell something inside the iOS or Android app, that purchase is handled by Apple or Google as the seller, and <strong>their refund process applies, not ours</strong> &mdash; we are not able to refund it on their behalf.
                </p>
                <p>
                  For those purchases, request a refund through Apple (reportaproblem.apple.com) or Google Play. If they turn you down and you believe you have a fair case, contact us anyway and we will see what we can do.
                </p>
              </div>
            </div>

            {/* 8 */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                8. Entry fees and prize money are not ours to refund
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  This is the most common confusion, so it is worth being blunt about it.
                </p>
                <p>
                  <strong>SportPool does not collect, hold, process, or disburse entry fees or prize money.</strong> When a pool has an entry fee, that money moves directly between the members and their pool administrator, through whatever method they choose. We never receive it, and we take no percentage of it.
                </p>
                <p>
                  So if you paid an entry fee to a pool admin and want it back, <strong>ask the admin</strong>. We cannot refund money we never had, and the &quot;paid&quot; marker an admin can tick in the app is only a bookkeeping note &mdash; it is not a payment to us and not evidence of one.
                </p>
                <p>
                  What we can refund is what you paid <em>us</em>: the tier that unlocked the pool&apos;s features.
                </p>
              </div>
            </div>

            {/* 9 */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                9. How to request a refund
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  Email{' '}
                  <a href="mailto:support@sportpool.io" className="text-primary-600 hover:underline font-medium">
                    support@sportpool.io
                  </a>{' '}
                  or use our{' '}
                  <Link href="/contact" className="text-primary-600 hover:underline">
                    contact form
                  </Link>
                  . To help us find the payment quickly, include:
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>The email address on your SportPool account</li>
                  <li>The name of the pool</li>
                  <li>Roughly when you bought it, and which tier</li>
                  <li>Anything you want us to know about why</li>
                </ul>
                <p>
                  We aim to answer within <strong>two business days</strong> and to make a decision within <strong>five</strong>. If we need something else from you, we will ask rather than let it sit.
                </p>
              </div>
            </div>

            {/* 10 */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                10. How refunds are paid
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  Approved refunds go back to the original payment method. We cannot send a refund somewhere else &mdash; a different card, a bank transfer, or account credit &mdash; because the refund reverses the original charge.
                </p>
                <p>
                  Once we approve it, we issue it the same day. How long it then takes to appear is up to your bank or card issuer, and is typically <strong>5 to 10 business days</strong>. Refunds are made in USD; if your card is in another currency, the amount you receive may differ slightly from the amount you paid because the exchange rate has moved. That difference is your bank&apos;s, not ours, and we cannot make it up.
                </p>
              </div>
            </div>

            {/* 11 */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                11. Duplicate and incorrect charges
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  If you were charged twice for the same thing, or charged an amount you did not authorise, tell us and we will refund it in full. This is not subject to the 14-day window or to whether your pool has started &mdash; a mistaken charge gets fixed whenever we find out about it.
                </p>
              </div>
            </div>

            {/* 12 */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                12. Before you file a chargeback
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  Please contact us first. Almost every refund request we receive is resolved quickly, and a chargeback takes far longer for you than an email does.
                </p>
                <p>
                  Where a chargeback is opened against a charge we would have refunded anyway, we will not contest it. We may suspend paid features on the affected pool while the dispute is open, since the payment for them has been reversed.
                </p>
              </div>
            </div>

            {/* 13 */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                13. Changes to this policy
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  We may update this policy as the product changes. The version that applies to your purchase is the one published on the day you bought it, so a later change cannot take away a refund right you already had.
                </p>
                <p>
                  Substantive changes will be announced by email to affected customers before they take effect.
                </p>
              </div>
            </div>

            {/* 14 */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                14. Contact
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  Questions about a payment, a refund, or this policy:
                </p>
                <p>
                  <a href="mailto:support@sportpool.io" className="text-primary-600 hover:underline font-medium">
                    support@sportpool.io
                  </a>
                </p>
                <p>
                  Or use the{' '}
                  <Link href="/contact" className="text-primary-600 hover:underline">
                    contact form
                  </Link>
                  . A real person reads it.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
