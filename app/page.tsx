import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { JsonLd } from '@/components/JsonLd'
import { FAQAccordion } from './FAQAccordion'
import { LiveBoard } from './LiveBoard'
import { COMPETITIONS } from './competitions'

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

export default function Home() {
  /*
   * dark-scope: the WHOLE landing page renders dark, in either colour mode.
   *
   * It can't simply take a dark background — the ramp inverts, so in light mode
   * `text-ink` resolves to #1B2340 and every word here would be navy on navy.
   * The class re-declares the dark token values for this subtree. See
   * globals.css.
   *
   * The snow/surface alternation between sections still does its job: dark mode
   * has its own pair (#121520 page, #1C2030 raised), so the bands read exactly
   * as they do in light mode, one step apart.
   */
  return (
    <div className="dark-scope min-h-screen bg-snow">
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

      {/* No bottom border: nav and hero are one dark band now, and a rule
          between them just draws a seam across it. Once scrolled, the nav still
          separates from the light sections below on its own — the colour step
          does that job without help. */}
      <nav className="sticky top-0 z-50 bg-snow/90 backdrop-blur-sm">
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

      {/* ---- Hero -----------------------------------------------------------
          Statement left, the board right. The headline is the product's whole
          argument in two lines: everyone has a view, and only the table settles
          it. The old hero opened with "which competition?" — a question people
          ask after they know what this is, not before, which is why the rail
          now sits below rather than above. */}
      <section className="pt-10 pb-14 sm:pt-16 sm:pb-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-y-12 lg:gap-x-16 items-center">
            <div>
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-ink text-balance leading-[1.06]">
                Everyone&apos;s got an opinion.
                <span className="block text-primary-600">One table settles it.</span>
              </h1>
              <p className="mt-5 text-lg text-muted max-w-md">
                Everyone calls the scores. Points land as results come in. The table
                sorts out who was actually right, and the group chat handles the rest.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Button href="/signup" size="lg">Create a pool &mdash; free</Button>
                <Button href="/play/demo" variant="outline" size="lg">See a pool</Button>
              </div>
            </div>

            {/* The lit panel is what stops this reading as a screenshot dropped
                in a box — the board sits on brand colour rather than beside it. */}
            <div className="flex lg:justify-end">
              <div
                className="w-full max-w-lg rounded-card border border-border-subtle p-5 sm:p-7 flex justify-center"
                style={{
                  background:
                    'radial-gradient(circle at 18% 12%, color-mix(in srgb, var(--primary-600) 40%, transparent), transparent 62%),' +
                    'radial-gradient(circle at 86% 84%, color-mix(in srgb, var(--accent-400) 30%, transparent), transparent 58%),' +
                    'var(--surface)',
                }}
              >
                <LiveBoard />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Competitions ----------------------------------------------------
          A plain strip, deliberately not links. It answers "will you cover the
          thing I care about", which only matters once someone knows what this
          is. Nothing here points at a real or demo pool: a marketing page is
          not a place to route strangers into somebody's group. */}
      <section className="py-12 sm:py-16 bg-surface border-y border-border-subtle">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 className="t-section-header text-ink">Competitions</h2>
            <p className="t-body text-muted">Added as their seasons come round.</p>
          </div>
          <div className="mt-6 flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
            {COMPETITIONS.map((c) => (
              <div
                key={c.key}
                className="shrink-0 min-w-[190px] flex flex-col gap-2 rounded-card border border-border-subtle bg-snow p-4"
              >
                <span
                  className="h-1 w-9 rounded-pill"
                  style={{ background: `linear-gradient(90deg, ${c.stripe[0]}, ${c.stripe[1]})` }}
                  aria-hidden
                />
                <span className="t-card-title text-ink">{c.name}</span>
                <span className="t-caption text-muted">{c.status}</span>
              </div>
            ))}
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
