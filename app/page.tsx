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

/**
 * Each card steps down from the one before it, from md up. On one flat surface
 * — no alternating bands any more — a row of three equal boxes sits dead, and
 * the offset gives it movement without introducing a colour.
 *
 * Written as whole literal class strings because Tailwind scans source for
 * them; a computed `md:mt-${n}` is invisible to the scanner and silently
 * produces nothing. Stacked, below md, they all sit flush — a stagger on one
 * column is just the last card pushed further down the page.
 */
const STAGGER = ['md:mt-0', 'md:mt-6', 'md:mt-12']

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

      {/* dark-scope: nav and hero render dark in EITHER colour mode. Without it
          the ramp inverts and every word here would be #1B2340 navy on a navy
          band. See globals.css. */}
      <div className="dark-scope bg-snow">
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
      </div>

      {/* ---- Running one -----------------------------------------------------
          One continuous surface from here down — no alternating bands. Striping
          is an app device: it separates dense regions on a screen you operate.
          A page read top to bottom needs room, not repainted walls, so the
          cards and the space between them do the separating. */}
      <section className="pt-16 pb-14 sm:pt-24 sm:pb-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-ink text-balance max-w-2xl">
            Running it shouldn&apos;t be a second job
          </h2>
          <div className="mt-9 grid grid-cols-1 md:grid-cols-3 gap-4 md:items-start">
            {SETUP.map((s, i) => (
              <div
                key={s.title}
                className={`flex flex-col gap-3 rounded-card bg-surface border border-border-subtle p-6 shadow-card ${STAGGER[i] ?? 'md:mt-0'}`}
              >
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

      {/* ---- Competitions ----------------------------------------------------
          Sits AFTER the how-it-works section on purpose. "Will you cover the
          thing I care about" is a qualifying question — people ask it once
          they've decided they're interested, not before. It was directly under
          the hero and read as an interruption.

          Deliberately not links. Routing a stranger from a marketing page into
          a real pool would expose members who never agreed to that, and the one
          competition we could point at scores zero today. */}
      {/* ---- Competitions, closing on the ask ---------------------------------
          These were two sections and are one. The list answers "will you cover
          my sport" and the CTA said "start one before the season does" — the
          same thought, split across a gap, with two competing headings doing
          the work of one. The competitions now read as the evidence for the
          ask rather than a separate topic.

          Nothing in the list is a link. Routing a stranger from a marketing
          page into a real pool would expose members who never agreed to it, and
          the one competition we could point at scores zero today. */}
      <section className="py-14 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-ink text-balance max-w-2xl">
            Whatever your group is watching
          </h2>
          <p className="mt-4 text-lg text-muted max-w-xl">
            Added as their seasons come round. Tell us what you want next.
          </p>

          {/* A grid rather than a scroller: five items fit, and a short list in
              a horizontal scroller reads as a widget tucked into the page
              instead of a section of it. */}
          <div className="mt-9 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {COMPETITIONS.map((c) => (
              <div
                key={c.key}
                className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface shadow-card p-5"
              >
                <span
                  className="h-1.5 w-11 rounded-pill"
                  style={{ background: `linear-gradient(90deg, ${c.stripe[0]}, ${c.stripe[1]})` }}
                  aria-hidden
                />
                <span className="text-lg font-bold tracking-tight text-ink leading-tight">
                  {c.name}
                </span>
                <span className="t-caption text-muted mt-auto">{c.status}</span>
              </div>
            ))}
          </div>

          {/* The ask, on the same surface as the list it follows. It kept its
              own card when it was a section of its own; inside this one that
              chrome would just be a box drawn round a sentence. */}
          <div className="mt-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 rounded-card border border-border-subtle bg-surface shadow-card p-7 sm:p-9">
            <div>
              <p className="text-xl sm:text-2xl font-black tracking-tight text-ink text-balance">
                Get your group in before the season does
              </p>
              <p className="mt-2 t-body text-muted">
                Free, unlimited pools, as many people as you want in each one.
              </p>
            </div>
            <Button href="/signup" size="lg" className="shrink-0">
              Create a pool &mdash; free
            </Button>
          </div>
        </div>
      </section>

      {/* ---- FAQ --------------------------------------------------------------
          Split two ways, like the hero: the heading and the way out on the
          left, the questions on the right. It was a centred column of bare
          rows — the only section left not using the card language the rest of
          the page moved to, and the only heading still centred while every
          other one is ranged left. */}
      <section className="py-14 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-y-8 lg:gap-x-16">
            <div className="lg:sticky lg:top-28 lg:self-start">
              {/* Not "questions commissioners ask" — half of these are things
                  anyone in a pool wants to know, not just whoever set it up. */}
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-ink text-balance">
                The usual questions
              </h2>
              <p className="mt-4 text-lg text-muted max-w-sm">
                Cost, formats, deadlines, and what happens when someone forgets
                to put their predictions in.
              </p>
              <Link
                href="/faq"
                className="mt-6 inline-flex items-center gap-1.5 t-body font-semibold text-primary-600 hover:text-primary-700 transition"
              >
                View all FAQs
                <Icon name="arrow.up.right" size={13} weight="bold" />
              </Link>
            </div>

            <div className="rounded-card bg-surface border border-border-subtle shadow-card px-5 sm:px-7">
              <FAQAccordion />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
