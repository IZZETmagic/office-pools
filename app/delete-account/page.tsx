import Link from 'next/link'
import type { Metadata } from 'next'
import { PublicNav } from '@/components/PublicNav'

export const metadata: Metadata = {
  title: 'Delete Your Account',
  description:
    'How to delete your SportPool account and what happens to your data when you do.',
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
              How to request deletion of your SportPool account and what
              happens to your data.
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10 text-neutral-800">
          {/* 1. About SportPool */}
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-3">
              About SportPool
            </h2>
            <p>
              SportPool is a social sports prediction platform, operated by Ryan
              Sousa. It is free to join and play; pool administrators can
              optionally upgrade a pool to a paid tier. This page explains how
              to delete your SportPool account along with the data we associate
              with it.
            </p>
          </div>

          {/* 2. Before you delete */}
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-3">
              Before you delete: pools you administer
            </h2>
            <p className="mb-3">
              There is one condition. <strong>If you are the administrator of a
              pool, you must transfer that role to another member first.</strong>{' '}
              Deleting an admin would leave their pool without anyone able to run
              it, so we block the deletion rather than break the pool for
              everyone else in it.
            </p>
            <p>
              You do not need to work out in advance whether this applies to you.
              If you try to delete your account while you still administer a
              pool, we stop before deleting anything and tell you exactly which
              pools need a new admin. Nothing is removed until the deletion
              actually goes through.
            </p>
          </div>

          {/* 3. How to delete your account */}
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-3">
              How to delete your account
            </h2>
            <p className="mb-4">
              You can delete your SportPool account yourself, from the mobile app
              or from the website. No support request or email is required.
            </p>

            <h3 className="font-semibold text-neutral-900 mt-5 mb-2">
              In the mobile app (iOS or Android)
            </h3>
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li>Open the SportPool app and sign in if you are not already signed in.</li>
              <li>
                Tap the <strong>Profile</strong> tab in the bottom navigation.
              </li>
              <li>
                Tap the settings icon to open <strong>Settings</strong>.
              </li>
              <li>
                Scroll to <strong>Account Actions</strong> at the bottom and tap{' '}
                <strong>Delete Account</strong>.
              </li>
              <li>Confirm when prompted.</li>
            </ol>

            <h3 className="font-semibold text-neutral-900 mt-5 mb-2">
              On the website
            </h3>
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li>Sign in at sportpool.io and open your <strong>Profile</strong> page.</li>
              <li>
                Scroll to the bottom and click <strong>Delete My Account</strong>.
              </li>
              <li>
                Type your username to confirm, then click{' '}
                <strong>I Understand, Delete My Account</strong>.
              </li>
            </ol>

            <p className="mt-4">
              In both cases your account is deleted immediately and you are
              signed out. <strong>The deletion is permanent and cannot be
              undone</strong> &mdash; we cannot restore an account or its data
              afterwards, so please be certain before you confirm.
            </p>
            <p className="mt-4">
              If you do not have access to the app or the website for any reason,
              you can request account deletion by emailing{' '}
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

          {/* 4. What is deleted */}
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-3">
              What is deleted
            </h2>
            <p className="mb-3">
              When you delete your account, the following is permanently removed
              from our systems:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Your account credentials and sign-in details</li>
              <li>Your profile &mdash; username and full name</li>
              <li>Your pool memberships and entries, in every pool</li>
              <li>
                All of your predictions, in every game &mdash; match scorelines
                and brackets, predicted league tables, Last Man Standing club
                picks, and Showdown duel history
              </li>
              <li>Your scores, points breakdowns, and leaderboard history</li>
              <li>
                Your experience points, levels, badges, and the statistics
                derived from how you played
              </li>
              <li>
                Your Banter chat messages, emoji reactions, @mentions, and your
                read position in each pool&apos;s chat
              </li>
              <li>Your online presence record</li>
              <li>Your notification preferences and push notification tokens</li>
              <li>Your record of accepting our Terms of Service</li>
            </ul>
            <p className="mt-4">
              A note on chat, because it surprises people: Banter messages
              cannot be deleted individually by anyone, so{' '}
              <strong>deleting your account is the only way to remove messages
              you have posted</strong>. It removes them from every pool at once,
              and they disappear from the chat history other members see. Simply
              leaving a pool does not remove them.
            </p>
          </div>

          {/* 5. What is retained and why */}
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-3">
              What may be retained
            </h2>
            <p className="mb-3">
              A limited amount of information is kept after account deletion, in
              each case unlinked from you or no longer identifying:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                <strong>Purchase records</strong> &mdash; if you paid to upgrade
                a pool, the record of that transaction is retained and detached
                from your account, because we are required to keep accurate
                financial and tax records. Paddle, who processed the payment as
                merchant of record, keeps its own copy under its own policy.
              </li>
              <li>
                <strong>Records of emails already sent to you</strong> &mdash;
                retained but stripped of your account identifier, so we have a
                delivery history without a link back to you.
              </li>
              <li>
                <strong>Aggregated analytics</strong> &mdash; overall usage
                statistics that no longer identify you (for example, &ldquo;total
                predictions submitted this season&rdquo;). Retained indefinitely.
              </li>
              <li>
                <strong>Crash and diagnostic reports</strong> &mdash; error logs
                sent via Sentry are stripped of personal identifiers and retained
                for up to 90 days for service-quality purposes.
              </li>
              <li>
                <strong>Video cards you generated and shared</strong> &mdash; if
                you created a shareable Showdown duel card, the video file
                remains at its public link until we remove it. Ask us and we will
                take it down.
              </li>
            </ul>
          </div>

          {/* 6. Timeline */}
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-3">
              Timeline
            </h2>
            <p>
              In-app and website deletions happen immediately. Email-requested
              deletions are completed within 30 days. Encrypted database backups
              are retained on a rolling cycle and then purged, so residual copies
              of your records are gone within 30 days at most &mdash; apart from
              the items listed above, which are retained deliberately and for the
              reasons given.
            </p>
          </div>

          {/* 7. Questions */}
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
