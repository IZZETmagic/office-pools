import type { Metadata } from 'next'
import { PublicNav } from '@/components/PublicNav'
import { Button } from '@/components/ui/Button'
import { JsonLd } from '@/components/JsonLd'
import { FAQPageContent } from './FAQPageContent'
import { faqCategories } from './faqData'

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Frequently asked questions about Sport Pool — the free FIFA World Cup 2026 prediction pool platform. Learn about pools, predictions, scoring, and more.',
}

export default function FAQPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqCategories.flatMap((category) =>
      category.items.map((item) => ({
        "@type": "Question",
        "name": item.question,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": item.answer,
        },
      }))
    ),
  }

  return (
    <div className="min-h-screen bg-surface">
      <JsonLd data={faqJsonLd} />
      {/* Navigation */}
      <PublicNav />

      {/* Header */}
      <section className="py-16 sm:py-24 bg-surface-secondary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-neutral-900">
              Frequently Asked Questions
            </h1>
            <p className="mt-4 text-lg text-neutral-700 max-w-2xl mx-auto">
              Everything you need to know about Sport Pool, predictions, scoring, and more.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Content */}
      <section className="py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FAQPageContent />
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24 bg-surface-secondary">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-4">
            Still have questions?
          </h2>
          <p className="text-lg text-neutral-700 mb-8 max-w-2xl mx-auto">
            Can&apos;t find what you&apos;re looking for? Reach out and we&apos;ll be happy to help.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button href="/signup" size="lg">
              Get Started &mdash; Free
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
