import Link from 'next/link'
import type { Metadata } from 'next'
import { PublicNav } from '@/components/PublicNav'

export const metadata: Metadata = {
  title: 'Delete Your Account',
  description:
    'How to delete your Sport Pool account and what happens to your data when you do.',
}

export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-surface">
      <PublicNav />

      {/* Header */}
      <section className="py-16 sm:py-24 bg-surface-secondary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-neutral-900">
              Delete Your Account
            </h1>
            <p className="mt-4 text-lg text-neutral-700 max-w-2xl mx-auto">
              How to request deletion of your Sport Pool account and what
              happens to your data.
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10 text-neutral-800">
          {/* 1. About Sport Pool */}
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-3">
              About Sport Pool
            </h2>
            <p>
              Sport Pool is a free prediction pool platform for sports
              tournaments, operated by Ryan Sousa. This page explains how to
              delete your Sport Pool account along with the data we associate
              with it.
            </p>
          </div>

          {/* 2. How to delete your account */}
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-3">
              How to delete your account
            </h2>
            <p className="mb-4">
              You can delete your Sport Pool account directly from the app at
              any time. No support request or email is required.
            </p>
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li>Open the Sport Pool app on your phone (iOS or Android).</li>
              <li>Sign in if you are not already signed in.</li>
              <li>
                Tap the <strong>Profile</strong> tab in the bottom navigation.
              </li>
              <li>
                Tap <strong>Settings</strong>.
              </li>
              <li>
                Scroll to the bottom and tap{' '}
                <strong>Delete Account</strong>.
              </li>
              <li>
                Confirm the deletion when prompted. Your account will be
                deleted immediately and you will be signed out.
              </li>
            </ol>
            <p className="mt-4">
              If you do not have access to the app for any reason, you can
              request account deletion by emailing{' '}
              <Link
                href="mailto:support@sportpool.io"
                className="text-primary-600 hover:underline font-medium"
              >
                support@sportpool.io
              </Link>{' '}
              from the email address associated with your account. We will
              complete the deletion within 30 days of receiving your request.
            </p>
          </div>

          {/* 3. What is deleted */}
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-3">
              What is deleted
            </h2>
            <p className="mb-3">
              When you delete your account, the following data is permanently
              removed from our systems:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Your account credentials (email, password)</li>
              <li>Your profile (username, full name, avatar)</li>
              <li>Your pool memberships</li>
              <li>Your pool entries and predictions</li>
              <li>Your scores and leaderboard history</li>
              <li>Your chat messages, reactions, and mentions</li>
              <li>Your notification preferences and push tokens</li>
            </ul>
          </div>

          {/* 4. What is retained and why */}
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-3">
              What may be retained
            </h2>
            <p className="mb-3">
              A limited amount of information may be retained after account
              deletion, in anonymized or non-identifiable form:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                <strong>Aggregated analytics</strong> — overall usage statistics
                that no longer identify you (e.g. "total predictions submitted
                this season"). Retained indefinitely.
              </li>
              <li>
                <strong>Terms-of-service acceptance logs</strong> — records of
                when terms were accepted, retained for legal compliance.
                Retained for up to 7 years.
              </li>
              <li>
                <strong>Crash and diagnostic reports</strong> — error logs sent
                via Sentry are stripped of personal identifiers and retained for
                up to 90 days for service-quality purposes.
              </li>
            </ul>
          </div>

          {/* 5. Timeline */}
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-3">
              Timeline
            </h2>
            <p>
              In-app deletion happens immediately. Email-requested deletions are
              completed within 30 days. Backup copies of database records are
              purged on a rolling 30-day cycle, so all traces of your data are
              gone within 30 days at most.
            </p>
          </div>

          {/* 6. Questions */}
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-3">
              Questions
            </h2>
            <p>
              If you have questions about account deletion or your data, contact
              us at{' '}
              <Link
                href="mailto:support@sportpool.io"
                className="text-primary-600 hover:underline font-medium"
              >
                support@sportpool.io
              </Link>
              . You can also review our{' '}
              <Link
                href="/privacy"
                className="text-primary-600 hover:underline font-medium"
              >
                Privacy Policy
              </Link>{' '}
              for more details on how we handle your data.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
