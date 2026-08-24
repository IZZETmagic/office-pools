import Link from 'next/link'
import type { Metadata } from 'next'
import { PublicNav } from '@/components/PublicNav'
import { Button } from '@/components/ui/Button'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'SportPool pricing — create a pool for free, or upgrade for a one-time seasonal fee. No subscriptions, no auto-renewal, and never a cut of your prize pool.',
}

/**
 * Prices and tier contents come from the May 2026 monetisation plan
 * (MONETIZATION.md, recoverable at commit d8927d7; mirrored in project memory).
 * Two things about that plan matter when editing this page:
 *
 *   1. Admin tiers are ONE-TIME per season/tournament. There is no auto-renewal.
 *      That is a deliberate product decision, not an omission — do not add
 *      renewal language without changing the billing model first.
 *   2. The platform never takes a percentage of a pool's prize money. The
 *      entry-fee assessment (drafts/2026-07-25) treats that as the load-bearing
 *      fact keeping us outside money-transmission and betting-licence
 *      perimeters. `PLATFORM_PROMISE` below is not marketing copy.
 */

const TIERS = [
  {
    name: 'Free',
    subtitle: 'Small Pool',
    price: '$0',
    cadence: 'always free',
    bestFor: 'Friends & family',
    cta: 'Create a pool',
    href: '/signup',
    available: true,
    variant: 'outline' as const,
    highlight: false,
    points: [
      'Up to 10 members',
      '1 entry per person',
      'The default pool mode for your competition',
      'Live leaderboard and full scoring',
      'Pools stay after the tournament ends',
    ],
  },
  {
    name: 'Pool Plus',
    subtitle: null,
    price: '$19',
    cadence: 'one-time, per season',
    bestFor: 'Office or friend group',
    cta: 'Choose Plus',
    href: '/signup',
    available: false,
    variant: 'primary' as const,
    highlight: true,
    points: [
      'Up to 30 members',
      'Up to 3 entries per person',
      'Every pool mode for your competition',
      'Custom scoring configuration',
      'Pool branding — name, emoji, colour',
      'See how everyone predicted after the deadline',
    ],
  },
  {
    name: 'Pool Max',
    subtitle: null,
    price: '$49',
    cadence: 'one-time, per season',
    bestFor: 'Big organised pool',
    cta: 'Choose Max',
    href: '/signup',
    available: false,
    variant: 'outline' as const,
    highlight: false,
    points: [
      'Unlimited members',
      'Unlimited entries per person',
      'Everything in Pool Plus',
      'Custom landing page for your pool',
      'Custom TV leaderboard',
      'Broadcast email to your members',
      'CSV export of standings',
    ],
  },
  {
    name: 'Pool Ultra',
    subtitle: 'Venues',
    price: '$500',
    cadence: 'one-time, per tournament',
    bestFor: 'Sports bars and venues',
    cta: 'Talk to us',
    href: '/contact',
    available: true,
    variant: 'outline' as const,
    highlight: false,
    points: [
      'Everything in Pool Max',
      'Public venue profile page and directory listing',
      'Hosted big-screen leaderboard for your room',
      'Print-ready marketing pack, stamped with your branding',
      'House champion ledger across tournaments',
      'Multi-staff admin accounts',
      'Patron retention dashboard and sponsor slot',
    ],
  },
]

const COMPARISON = [
  { label: 'Members', free: 'Up to 10', plus: 'Up to 30', max: 'Unlimited', ultra: 'Unlimited' },
  { label: 'Entries per person', free: '1', plus: 'Up to 3', max: 'Unlimited', ultra: 'Unlimited' },
  { label: 'Pool modes', free: '1 default', plus: 'All', max: 'All', ultra: 'All' },
  { label: 'Live leaderboard and scoring', free: true, plus: true, max: true, ultra: true },
  { label: 'Custom scoring configuration', free: false, plus: true, max: true, ultra: true },
  { label: 'Form tab — XP, badges, level runway', free: false, plus: true, max: true, ultra: true },
  { label: 'Banter — mentions, reactions, badge flex', free: false, plus: true, max: true, ultra: true },
  { label: 'How Others Predicted', free: false, plus: 'Member picks', max: '+ crowd analytics', ultra: '+ crowd analytics' },
  { label: 'Pool branding', free: 'Generic', plus: true, max: true, ultra: true },
  { label: 'Custom landing page', free: false, plus: false, max: true, ultra: true },
  { label: 'Custom TV leaderboard', free: false, plus: false, max: true, ultra: true },
  { label: 'Broadcast email to members', free: false, plus: false, max: true, ultra: true },
  { label: 'CSV export of standings', free: false, plus: false, max: true, ultra: true },
  { label: 'Venue profile, directory and marketing pack', free: false, plus: false, max: false, ultra: true },
]

const PLATFORM_PROMISE = [
  {
    title: 'We never take a cut of your prize pool',
    body: 'If your pool has an entry fee, 100% of it goes to the players. Our fee is a flat charge for the software, and it is the only money we take.',
  },
  {
    title: 'We never hold your money',
    body: 'Entry fees and prizes are arranged directly between you and your members, off the platform. SportPool is not a payment processor, escrow service, or prize sponsor for those arrangements.',
  },
  {
    title: 'Nothing renews on its own',
    body: 'Paid pools are a one-time charge for that season or tournament. There is no subscription and no automatic renewal — when the competition ends, so does the charge.',
  },
]

/**
 * In the comparison table the tick and dash are the ONLY carriers of meaning, so
 * they answer to the 3:1 non-text contrast threshold. Measured against
 * `--surface-secondary` in both themes: success-700 = 3.10 light / 11.17 dark,
 * neutral-500 = 3.37 light / 6.25 dark. The success-600 and neutral-300 used
 * elsewhere on this page fail that bar (2.15 and 1.47) and must not be
 * substituted back in here — they are only safe next to a text label.
 */
function Cell({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <span className="text-success-700 font-bold" aria-label="Included">
        &#10003;
      </span>
    )
  }
  if (value === false) {
    return (
      <span className="text-neutral-500" aria-label="Not included">
        &mdash;
      </span>
    )
  }
  return <span className="text-neutral-700">{value}</span>
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-surface">
      <PublicNav />

      {/* Header */}
      <section className="py-16 sm:py-24 bg-surface-secondary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-neutral-900">
              Pricing
            </h1>
            <p className="mt-4 text-lg text-neutral-700 max-w-2xl mx-auto">
              Start a pool for free. Upgrade only when your pool outgrows it &mdash; one payment, for one season. No subscription.
            </p>
            <p className="mt-3 text-sm text-neutral-500">All prices in USD.</p>
            <p className="mt-6 inline-block rounded-card border border-border-default bg-surface px-4 py-3 text-sm text-neutral-700">
              <strong className="text-neutral-900">Paid tiers are not on sale yet.</strong> Creating a pool is free today &mdash; the tiers below are what we are building towards, and we will say so here the day they open.
            </p>
          </div>
        </div>
      </section>

      {/* Tiers */}
      <section className="py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className={
                  'flex flex-col rounded-card border p-6 ' +
                  (tier.highlight
                    ? 'border-primary-600 border-2 bg-surface shadow-sm'
                    : 'border-border-default bg-surface')
                }
              >
                {/* Rendered on every card, hidden on three of them, so the badge
                    does not push one column's price out of line with the rest. */}
                <span
                  aria-hidden={!tier.highlight}
                  className={
                    'self-start mb-3 rounded-chip px-2.5 py-1 text-xs font-bold ' +
                    (tier.highlight ? 'bg-primary-100 text-primary-600' : 'invisible')
                  }
                >
                  Most popular
                </span>
                <h2 className="text-xl font-bold text-neutral-900">
                  {tier.name}
                  {tier.subtitle && (
                    <span className="ml-2 text-sm font-medium text-neutral-500">{tier.subtitle}</span>
                  )}
                </h2>
                <p className="mt-1 text-sm text-neutral-500">{tier.bestFor}</p>

                <div className="mt-5">
                  <span className="text-4xl font-bold text-neutral-900">{tier.price}</span>
                  <p className="mt-1 text-sm text-neutral-500">{tier.cadence}</p>
                </div>

                <ul className="mt-6 space-y-2.5 flex-1">
                  {tier.points.map((point) => (
                    <li key={point} className="flex gap-2.5 text-sm text-neutral-700 leading-relaxed">
                      <span className="text-success-600 font-bold shrink-0" aria-hidden="true">
                        &#10003;
                      </span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>

                {tier.available ? (
                  <Button href={tier.href} variant={tier.variant} fullWidth className="mt-7">
                    {tier.cta}
                  </Button>
                ) : (
                  /* No checkout exists for these tiers yet, so this must not look
                     like a buy button. Keep it a plain statement until it does. */
                  <p className="mt-7 rounded-control border border-dashed border-border-default px-4 py-3 text-center text-sm font-semibold text-neutral-500">
                    Not yet available
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-16 sm:py-20 bg-surface-secondary">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 text-center">
            Compare every tier
          </h2>

          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm border-collapse">
              <thead>
                <tr className="border-b border-border-default">
                  <th scope="col" className="py-3 pr-4 text-left font-bold text-neutral-900">
                    Feature
                  </th>
                  <th scope="col" className="py-3 px-3 text-center font-bold text-neutral-900">
                    Free
                  </th>
                  <th scope="col" className="py-3 px-3 text-center font-bold text-neutral-900">
                    Plus
                  </th>
                  <th scope="col" className="py-3 px-3 text-center font-bold text-neutral-900">
                    Max
                  </th>
                  <th scope="col" className="py-3 pl-3 text-center font-bold text-neutral-900">
                    Ultra
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.label} className="border-b border-border-subtle">
                    <th scope="row" className="py-3 pr-4 text-left font-medium text-neutral-700">
                      {row.label}
                    </th>
                    <td className="py-3 px-3 text-center"><Cell value={row.free} /></td>
                    <td className="py-3 px-3 text-center"><Cell value={row.plus} /></td>
                    <td className="py-3 px-3 text-center"><Cell value={row.max} /></td>
                    <td className="py-3 pl-3 text-center"><Cell value={row.ultra} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-6 text-sm text-neutral-500">
            Upgrading mid-season unlocks everything straight away, and nothing your pool has already built &mdash; predictions, standings, banter history &mdash; is lost or reset.
          </p>
        </div>
      </section>

      {/* The promise */}
      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 text-center">
            What we charge for &mdash; and what we never touch
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PLATFORM_PROMISE.map((item) => (
              <div key={item.title} className="rounded-card border border-border-default bg-surface p-6">
                <h3 className="font-bold text-neutral-900">{item.title}</h3>
                <p className="mt-2.5 text-sm text-neutral-700 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Billing details */}
      <section className="py-16 sm:py-20 bg-surface-secondary">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900">Billing details</h2>

          <dl className="mt-8 space-y-7">
            <div>
              <dt className="font-bold text-neutral-900">When am I charged?</dt>
              <dd className="mt-2 text-neutral-700 leading-relaxed">
                Once, at the moment you upgrade. You pay for a single season or tournament, and the charge covers that competition from the day you buy it until it finishes.
              </dd>
            </div>
            <div>
              <dt className="font-bold text-neutral-900">Does it renew automatically?</dt>
              <dd className="mt-2 text-neutral-700 leading-relaxed">
                No. There is no subscription and nothing recurring. When the next season comes around, you decide again &mdash; and you can pick a different tier, or none at all.
              </dd>
            </div>
            <div>
              <dt className="font-bold text-neutral-900">Who pays &mdash; the admin or the members?</dt>
              <dd className="mt-2 text-neutral-700 leading-relaxed">
                The person who creates the pool. Members join and play without paying SportPool anything.
              </dd>
            </div>
            <div>
              <dt className="font-bold text-neutral-900">What currency?</dt>
              <dd className="mt-2 text-neutral-700 leading-relaxed">
                All prices are in US dollars (USD). Your bank may apply its own conversion or foreign-transaction fee, which is outside our control.
              </dd>
            </div>
            <div>
              <dt className="font-bold text-neutral-900">What if my pool has an entry fee?</dt>
              <dd className="mt-2 text-neutral-700 leading-relaxed">
                That is entirely separate and has nothing to do with us. Entry fees and prizes are arranged directly between a pool admin and their members, and every cent of them goes to the players. SportPool never collects, holds, or pays out that money &mdash; see our{' '}
                <Link href="/terms" className="text-primary-600 hover:underline">
                  Terms of Service
                </Link>
                .
              </dd>
            </div>
            <div>
              <dt className="font-bold text-neutral-900">Can I get a refund?</dt>
              <dd className="mt-2 text-neutral-700 leading-relaxed">
                Yes &mdash; within 14 days, as long as your pool has not started. The full terms, including how venue purchases work, are in our{' '}
                <Link href="/refund-policy" className="text-primary-600 hover:underline">
                  Refund Policy
                </Link>
                .
              </dd>
            </div>
          </dl>

          <div className="mt-12 rounded-card border border-border-default bg-surface p-6 text-center">
            <p className="text-neutral-700">Still deciding, or running something bigger than a pool?</p>
            <Button href="/contact" variant="outline" className="mt-4">
              Get in touch
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
