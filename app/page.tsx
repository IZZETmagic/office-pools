import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { JsonLd } from '@/components/JsonLd'
import { FAQAccordion } from './FAQAccordion'
import { LiveBoard } from './LiveBoard'
import { COMPETITIONS, type Competition } from './competitions'

/**
 * The landing page has exactly one job: turn someone into a commissioner.
 *
 * Invited players never arrive here — they land on /join/[pool_code] with a code
 * already in hand — so there is deliberately no join path on this page. The only
 * visitor it has to convert is someone deciding whether to *run* a pool, which is
 * also the number the product is measured by: repeat commissioners.
 *
 * That decides the content. The four feature tiles this replaced ("Pool Chat &
 * Reactions", "Live Rankings & Points") described the product to nobody in
 * particular. What follows answers a commissioner's questions in the order they
 * ask them: what can I run, what will my group actually look at, how long does
 * this take me, and what do I control.
 */

// Setup facts, not feature names. Each is something a commissioner is weighing
// before they commit their group to this rather than a spreadsheet.
const SETUP = [
  {
    icon: 'bolt.fill',
    title: 'Under a minute to open',
    body: 'Name it, pick a format, done. Scoring has working defaults, so you only touch the rules you actually care about.',
  },
  {
    icon: 'slider.horizontal.3',
    title: 'Scoring you control',
    body: 'Points for exact scores, goal difference and results, with round multipliers for the stages that matter. Change it before the deadline and everything recalculates.',
  },
  {
    icon: 'person.2.fill',
    title: 'One link for your group',
    body: 'Share a code. They join in a click, on web or the app — no spreadsheet to maintain and nobody chasing predictions in a group chat.',
  },
]

function CompetitionCard({ c }: { c: Competition }) {
  const isComplete = c.state === 'complete'
  return (
    <Link
      href={c.href}
      className={`group flex flex-col gap-3 rounded-card border bg-surface p-5 shadow-card transition-shadow hover:shadow-card-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${
        isComplete ? 'border-border-subtle' : 'border-border-default'
      }`}
    >
      <span
        className="h-1 w-9 rounded-pill"
        style={{ background: `linear-gradient(90deg, ${c.stripe[0]}, ${c.stripe[1]})` }}
        aria-hidden
      />
      <div className="flex flex-col gap-0.5">
        <span className="t-card-title text-ink">{c.name}</span>
        <span className="t-caption text-muted">{c.edition}</span>
      </div>
      <p className="t-body text-muted">{c.status}</p>
      <span className={`t-caption inline-flex items-center gap-1.5 ${isComplete ? 'text-muted' : 'text-primary-600'}`}>
        {c.cta}
        <Icon name="arrow.up.right" size={11} weight="bold" />
      </span>
    </Link>
  )
}

export default function Home() {
  return (
    <div className="min-h-screen bg-snow">
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "SportPool",
        "url": "https://sportpool.io",
        "description": "Run a prediction pool for your group. Set the scoring, share one link, and watch the leaderboard move as results come in.",
        "applicationCategory": "SportsApplication",
        "operatingSystem": "Web",
        "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
        "author": { "@type": "Organization", "name": "SportPool", "url": "https://sportpool.io" },
      }} />

      <nav className="sticky top-0 z-50 bg-surface/95 backdrop-blur-sm border-b border-border-subtle">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="text-xl font-black tracking-tight text-ink">
              Sport<span className="text-primary-600">Pool</span>
            </Link>
            <div className="flex items-center gap-3">
              <Button href="/login" variant="ghost" size="sm">Log In</Button>
              <Button href="/signup" size="sm">Sign Up</Button>
            </div>
          </div>
        </div>
      </nav>

      {/* ---- Hero: which competition, not which tournament ------------------
          The headline is a question because the rail below answers it. The old
          hero named one tournament, which is how the page ended up advertising
          a World Cup that had already finished. */}
      <section className="py-14 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-ink text-balance">
              Which one is your group watching?
            </h1>
            <p className="mt-4 text-lg text-muted max-w-xl">
              Start a prediction pool for it. You set the scoring, share one link, and
              the leaderboard does the rest.
            </p>
          </div>

          <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {COMPETITIONS.map((c) => <CompetitionCard key={c.key} c={c} />)}
            <div className="flex flex-col gap-3 rounded-card border border-dashed border-border-default p-5">
              {/* Occupies the stripe's row so this card's title lands on the
                  same baseline as its siblings' rather than 5px below. */}
              <span className="h-1 w-9" aria-hidden />
              <span className="t-card-title text-ink">More on the way</span>
              <p className="t-body text-muted">
                We&apos;re adding competitions as their seasons come round.
              </p>
            </div>
          </div>

          <div className="mt-12 flex flex-col sm:flex-row gap-3">
            <Button href="/signup" size="lg">Create a pool &mdash; free</Button>
            <Button href="/play/demo" variant="outline" size="lg">Look around a pool first</Button>
          </div>
        </div>
      </section>

      {/* ---- The board -------------------------------------------------------
          The product, on the page. See LiveBoard for why it is demo data only. */}
      <section className="py-14 sm:py-20 bg-surface border-y border-border-subtle">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-y-10 lg:gap-x-16 items-center">
            <div>
              <p className="t-caption text-muted">What your group stares at</p>
              <h2 className="mt-2 text-3xl sm:text-4xl font-black tracking-tight text-ink text-balance">
                The table moves while they&apos;re watching
              </h2>
              <p className="mt-4 text-lg text-muted">
                Predictions score as results come in, so standings shift mid-match. That
                swing is the part people turn up for — and the part they argue about in
                the pool chat straight after.
              </p>
              <ul className="mt-6 flex flex-col gap-3">
                {[
                  'Exact scores, goal difference and results, each worth what you decide',
                  'Form, movement and awards on every row',
                  'Group chat, reactions and @mentions inside each pool',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-muted">
                    <span className="mt-0.5 text-primary-600 shrink-0">
                      <Icon name="checkmark" size={15} weight="bold" />
                    </span>
                    <span className="t-body">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex lg:justify-end">
              <LiveBoard />
            </div>
          </div>
        </div>
      </section>

      {/* ---- Running one ---------------------------------------------------- */}
      <section className="py-14 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-ink text-balance max-w-2xl">
            Running it shouldn&apos;t be a second job
          </h2>
          <div className="mt-9 grid grid-cols-1 md:grid-cols-3 gap-4">
            {SETUP.map((s) => (
              <div key={s.title} className="flex flex-col gap-3 rounded-card bg-surface border border-border-subtle p-6 shadow-card">
                <span className="inline-flex items-center justify-center w-11 h-11 rounded-chip bg-primary-600/10 text-primary-600">
                  <Icon name={s.icon} size={21} weight="semibold" />
                </span>
                <h3 className="t-card-title text-ink">{s.title}</h3>
                <p className="t-body text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-20 bg-surface border-y border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-ink text-balance">
            Get your group in before the season does
          </h2>
          <p className="mt-4 text-lg text-muted">
            Free, unlimited pools, as many people as you want in each one.
          </p>
          <div className="mt-8 flex justify-center">
            <Button href="/signup" size="lg">Create a pool &mdash; free</Button>
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-ink text-center text-balance">
            Questions commissioners ask
          </h2>
          <div className="mt-9">
            <FAQAccordion />
          </div>
          <div className="text-center mt-8">
            <Link href="/faq" className="t-body font-semibold text-primary-600 hover:text-primary-700 transition">
              View all FAQs &rarr;
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
