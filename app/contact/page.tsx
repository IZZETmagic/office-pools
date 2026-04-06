import type { Metadata } from 'next'
import { PublicNav } from '@/components/PublicNav'
import { ContactForm } from './ContactForm'

export const metadata: Metadata = {
  title: 'Contact Us',
  description:
    'Get in touch with the Sport Pool team. Have a question, feedback, or need help? Send us a message.',
}

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Navigation */}
      <PublicNav />

      {/* Header */}
      <section className="py-16 sm:py-24 bg-surface-secondary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-neutral-900">
              Contact Us
            </h1>
            <p className="mt-4 text-lg text-neutral-700 max-w-2xl mx-auto">
              Have a question, suggestion, or need help? Send us a message and we&apos;ll get back to you as soon as possible.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Form */}
      <section className="py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ContactForm />
        </div>
      </section>
    </div>
  )
}
